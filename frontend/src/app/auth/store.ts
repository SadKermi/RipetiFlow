// Auth state machine, independent of React (tested with fake deps in store.test.ts).
//
// Two ways in (D-30):
// - Supabase: Google OAuth or magic link. supabase-js owns the session (persistence in
//   localStorage, token refresh); we only read it.
// - Demo (only when /public/config says dev_auth_enabled): POST /dev/login returns a locally
//   signed token for the demo tutor, kept in sessionStorage for this tab only.
//
// Google provider tokens (calendar consent, D-31) are read from the session exactly once, sent to
// the backend and never logged nor stored by us.
import type { SupabaseClient } from "@supabase/supabase-js";
import { API_BASE } from "@/lib/api/client";
import { ApiProblem, UserFacingError, isApiProblem } from "@/lib/api/problem";
import type { CalendarConnect, PublicConfig } from "@/lib/api/types";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const DEMO_STORAGE_KEY = "ripetiflow.demo-session";
/** Who started the calendar consent: the callback refuses a token from a different account. */
export const CALENDAR_USER_KEY = "ripetiflow.calendar-consent-user";

export type AuthStatus = "loading" | "signedOut" | "signedIn";
export type AuthMode = "supabase" | "demo";

export interface AuthUser {
  id: string;
  email: string | null;
  mode: AuthMode;
}

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  /** GET /public/config, loaded once at start. */
  config: PublicConfig | null;
  /** Why the user was signed out when it was not their choice. */
  notice: "session-expired" | null;
  /** The public config could not be loaded (API unreachable): the sign-in page shows it. */
  error: ApiProblem | null;
}

/** The part of supabase-js we use (so tests can provide a small fake). */
export type SupabaseAuth = Pick<
  SupabaseClient["auth"],
  | "getSession"
  | "onAuthStateChange"
  | "signInWithOAuth"
  | "signInWithOtp"
  | "signOut"
  | "refreshSession"
>;

type SupabaseSession = NonNullable<
  Awaited<ReturnType<SupabaseAuth["getSession"]>>["data"]["session"]
>;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface AuthDeps {
  loadConfig: () => Promise<PublicConfig>;
  createSupabase: (url: string, publishableKey: string) => Promise<SupabaseAuth>;
  /** sessionStorage (null when the browser blocks it). */
  storage: StorageLike | null;
  /** fetch for the demo endpoints, with paths relative to the SPA origin. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  origin: () => string;
}

// The demo endpoints are deliberately absent from the generated schema (they exist only with
// DEV_AUTH=1, see backend/scripts/dump_openapi.py): these two shapes mirror app/schemas.py.
interface DemoSession {
  access_token: string;
  user: { id: string; email: string };
}
export interface DemoSeedResult {
  students: number;
  lessons: number;
  payments: number;
}

function isDemoSession(value: unknown): value is DemoSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<DemoSession>;
  return (
    typeof v.access_token === "string" &&
    typeof v.user === "object" &&
    v.user !== null &&
    typeof v.user.id === "string" &&
    typeof v.user.email === "string"
  );
}

const INITIAL: AuthSnapshot = {
  status: "loading",
  user: null,
  config: null,
  notice: null,
  error: null,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthStore {
  private readonly deps: AuthDeps;
  private snapshot: AuthSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private starting: Promise<void> | null = null;
  private supabase: SupabaseAuth | null = null;
  private demo: DemoSession | null = null;
  /** Session events are ignored until the first getSession() has settled the initial state. */
  private ready = false;
  private signingOut: Promise<void> | null = null;
  private grantTaken = false;

  constructor(deps: AuthDeps) {
    this.deps = deps;
  }

  // --- useSyncExternalStore ---------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AuthSnapshot => this.snapshot;

  private update(patch: Partial<AuthSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  // --- Start-up ---------------------------------------------------------------------------

  /** Loads the public config and the existing session. Idempotent. */
  start = (): Promise<void> => {
    this.starting ??= this.init();
    return this.starting;
  };

  /** Retries a start-up that failed because the API was unreachable. */
  retry = (): Promise<void> => {
    if (this.snapshot.error === null) return this.start();
    this.starting = null;
    this.update({ status: "loading", error: null });
    return this.start();
  };

  private async init(): Promise<void> {
    let config: PublicConfig;
    try {
      config = await this.deps.loadConfig();
    } catch (error) {
      this.update({
        status: "signedOut",
        user: null,
        error: isApiProblem(error) ? error : ApiProblem.network(error),
      });
      return;
    }
    this.update({ config, error: null });

    const stored = this.readDemo();
    if (stored && config.dev_auth_enabled) this.demo = stored;
    else if (stored) this.clearDemo(); // demo token from a server that no longer allows it

    if (config.supabase_url && config.supabase_publishable_key) {
      try {
        const supabase = await this.deps.createSupabase(
          config.supabase_url,
          config.supabase_publishable_key,
        );
        this.supabase = supabase;
        supabase.onAuthStateChange((_event, session) => {
          if (this.ready) this.applySupabaseSession(session);
        });
        // Awaits supabase-js initialisation, including the PKCE code exchange on /auth/callback.
        const { data } = await supabase.getSession();
        this.ready = true;
        if (!this.demo) this.applySupabaseSession(data.session);
      } catch {
        // Supabase unreachable or misconfigured: demo mode (if any) keeps working. No details are
        // logged on purpose: auth errors can carry codes or tokens from the URL.
        this.supabase = null;
      }
    }
    this.ready = true;

    if (this.demo) {
      this.update({ status: "signedIn", user: this.demoUser(this.demo) });
    } else if (this.snapshot.status === "loading") {
      this.update({ status: "signedOut", user: null });
    }
  }

  private applySupabaseSession(session: SupabaseSession | null): void {
    if (this.demo) return;
    if (session) {
      const user: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? null,
        mode: "supabase",
      };
      const current = this.snapshot.user;
      if (
        this.snapshot.status !== "signedIn" ||
        current?.id !== user.id ||
        current.email !== user.email ||
        current.mode !== user.mode
      ) {
        this.update({ status: "signedIn", user, notice: null });
      }
    } else if (this.snapshot.status !== "signedOut") {
      this.update({ status: "signedOut", user: null });
    }
  }

  // --- Token for the API client -----------------------------------------------------------

  /** Bearer token for the API (supabase-js refreshes it when it is about to expire). */
  getAccessToken = async (): Promise<string | null> => {
    // No waiting for start(): the public config itself is loaded through the API client.
    // Protected queries only run once the status is signedIn.
    if (this.snapshot.status !== "signedIn") return null;
    if (this.demo) return this.demo.access_token;
    if (!this.supabase) return null;
    const { data } = await this.supabase.getSession();
    return data.session?.access_token ?? null;
  };

  /** A 401 from the API: the session is gone (expired, revoked, demo DB reset). */
  handleUnauthorized = (): void => {
    if (this.snapshot.status === "signedIn") void this.signOut("session-expired");
  };

  // --- Sign in ------------------------------------------------------------------------------

  private requireConfig(): PublicConfig {
    if (!this.snapshot.config) {
      throw new UserFacingError("RipetiFlow non è raggiungibile: riprova tra poco.");
    }
    return this.snapshot.config;
  }

  private requireSupabase(): SupabaseAuth {
    this.requireConfig();
    if (!this.supabase) {
      throw new UserFacingError(
        "L'accesso con Google o con email non è configurato su questo server.",
      );
    }
    return this.supabase;
  }

  private callbackUrl(next?: string): string {
    const query = next ? `?next=${encodeURIComponent(next)}` : "";
    return `${this.deps.origin()}/auth/callback${query}`;
  }

  /** Redirects to Google (only email and profile are requested here: consent is incremental). */
  signInWithGoogle = async (): Promise<void> => {
    const supabase = this.requireSupabase();
    if (!this.snapshot.config?.google_login_enabled) {
      throw new UserFacingError("L'accesso con Google non è attivo.");
    }
    const { error } = await supabase.signInWithOAuth({
      provider: "google",
      options: { redirectTo: this.callbackUrl() },
    });
    if (error)
      throw new UserFacingError("Non è stato possibile avviare l'accesso con Google. Riprova.");
  };

  /** Sends a sign-in link by email (D-30 alternative to Google). */
  sendMagicLink = async (email: string): Promise<void> => {
    const supabase = this.requireSupabase();
    if (!this.snapshot.config?.magic_link_enabled) {
      throw new UserFacingError("L'accesso con link via email non è attivo.");
    }
    const address = email.trim();
    if (!EMAIL.test(address)) throw new UserFacingError("Inserisci un indirizzo email valido.");
    const { error } = await supabase.signInWithOtp({
      email: address,
      options: { emailRedirectTo: this.callbackUrl() },
    });
    if (error) {
      throw new UserFacingError(
        error.status === 429
          ? "Hai chiesto troppi link: riprova tra qualche minuto."
          : "Non è stato possibile inviare il link. Riprova.",
      );
    }
  };

  private async postDev(path: "/dev/login" | "/dev/seed"): Promise<unknown> {
    if (!this.requireConfig().dev_auth_enabled) {
      throw new UserFacingError("La modalità demo non è attiva su questo server.");
    }
    let response: Response;
    try {
      response = await this.deps.fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      throw ApiProblem.network(error);
    }
    if (!response.ok) throw await ApiProblem.fromResponse(response);
    return (await response.json()) as unknown;
  }

  /** "Entra in modalità demo": POST /dev/login, token kept in sessionStorage. */
  signInDemo = async (): Promise<void> => {
    const body = await this.postDev("/dev/login");
    if (!isDemoSession(body)) throw ApiProblem.fromBody(500, undefined);
    this.demo = body;
    try {
      this.deps.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(body));
    } catch {
      // storage full or blocked: the session still lasts until the tab is reloaded
    }
    this.update({ status: "signedIn", user: this.demoUser(body), notice: null });
  };

  /** Wipes and recreates the demo tutor's data (POST /dev/seed). */
  seedDemo = async (): Promise<DemoSeedResult> =>
    (await this.postDev("/dev/seed")) as DemoSeedResult;

  private demoUser(session: DemoSession): AuthUser {
    return { id: session.user.id, email: session.user.email, mode: "demo" };
  }

  private readDemo(): DemoSession | null {
    try {
      const raw = this.deps.storage?.getItem(DEMO_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return isDemoSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private clearDemo(): void {
    this.demo = null;
    try {
      this.deps.storage?.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // blocked storage: nothing to clear
    }
  }

  // --- Sign out -----------------------------------------------------------------------------

  /** "Esci": ends the demo session and the Supabase session of this browser. Idempotent. */
  signOut = (notice: AuthSnapshot["notice"] = null): Promise<void> => {
    this.signingOut ??= (async () => {
      this.clearDemo();
      this.update({ status: "signedOut", user: null, notice });
      if (this.supabase) {
        try {
          await this.supabase.signOut({ scope: "local" });
        } catch {
          // the local session is removed anyway
        }
      }
    })().finally(() => {
      this.signingOut = null;
    });
    return this.signingOut;
  };

  // --- Google Calendar incremental consent (D-31) ---------------------------------------------

  /**
   * Redirects to Google asking for the calendar.app.created scope with offline access; Google
   * comes back to /auth/callback?next=calendar where `takeCalendarGrant` reads the refresh token.
   */
  connectGoogleCalendar = async (): Promise<void> => {
    const config = this.requireConfig();
    if (!config.calendar_sync_available) {
      throw new UserFacingError(
        "La sincronizzazione con Google Calendar non è attiva su questo server.",
      );
    }
    const user = this.snapshot.user;
    if (!this.supabase || !user || user.mode !== "supabase") {
      throw new UserFacingError(
        "Per collegare Google Calendar accedi con il tuo account (non in modalità demo).",
      );
    }
    try {
      this.deps.storage?.setItem(CALENDAR_USER_KEY, user.id);
    } catch {
      // without storage the account check in the callback is skipped
    }
    const { error } = await this.supabase.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: this.callbackUrl("calendar"),
        scopes: CALENDAR_SCOPE,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          ...(user.email ? { login_hint: user.email } : {}),
        },
      },
    });
    if (error)
      throw new UserFacingError("Non è stato possibile aprire il consenso di Google. Riprova.");
  };

  /**
   * The Google tokens of the session just created by the calendar consent, at most once per page
   * load (null if already taken). Throws when Google gave no refresh token or the account differs.
   */
  takeCalendarGrant = async (): Promise<CalendarConnect | null> => {
    if (this.grantTaken) return null;
    const supabase = this.requireSupabase();
    let expectedUser: string | null = null;
    try {
      expectedUser = this.deps.storage?.getItem(CALENDAR_USER_KEY) ?? null;
      this.deps.storage?.removeItem(CALENDAR_USER_KEY);
    } catch {
      expectedUser = null;
    }
    const { data } = await supabase.getSession();
    const session = data.session;
    if (!session) throw new UserFacingError("Accesso non riuscito: riprova da Impostazioni.");
    if (expectedUser && session.user.id !== expectedUser) {
      throw new UserFacingError(
        "Hai scelto un account Google diverso da quello con cui sei entrato. Riprova scegliendo lo stesso account.",
      );
    }
    if (!session.provider_refresh_token) {
      throw new UserFacingError(
        "Google non ha concesso l'accesso al calendario. Riprova e accetta l'autorizzazione.",
      );
    }
    this.grantTaken = true;
    return {
      provider_refresh_token: session.provider_refresh_token,
      provider_token: session.provider_token ?? null,
    };
  };

  /**
   * Replaces the stored session with a refreshed one, which carries no Google provider tokens:
   * after the one-time hand-off they must not linger in localStorage.
   */
  forgetProviderTokens = async (): Promise<void> => {
    if (!this.supabase) return;
    try {
      await this.supabase.refreshSession();
    } catch {
      // best effort: the next automatic refresh drops them as well
    }
  };
}
