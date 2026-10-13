import { describe, expect, it, vi } from "vitest";
import { ApiProblem, UserFacingError } from "@/lib/api/problem";
import type { PublicConfig } from "@/lib/api/types";
import {
  AuthStore,
  CALENDAR_SCOPE,
  CALENDAR_USER_KEY,
  DEMO_STORAGE_KEY,
  type AuthDeps,
  type SupabaseAuth,
} from "./store";

const CONFIG: PublicConfig = {
  supabase_url: "https://example.supabase.co",
  supabase_publishable_key: "sb_publishable_test",
  google_login_enabled: true,
  magic_link_enabled: true,
  dev_auth_enabled: false,
  calendar_sync_available: true,
  assistant_available: false,
};
const DEMO_CONFIG: PublicConfig = {
  ...CONFIG,
  supabase_publishable_key: "",
  dev_auth_enabled: true,
};
const DEMO_SESSION = {
  access_token: "demo-token",
  user: { id: "00000000-0000-4000-8000-00000000de30", email: "demo@ripetiflow.local" },
};

interface FakeSession {
  access_token: string;
  user: { id: string; email?: string };
  provider_token?: string | null;
  provider_refresh_token?: string | null;
}

type Listener = (event: string, session: FakeSession | null) => void;
type AuthResult = { data: object; error: { status: number } | null };

function fakeSupabase(initial: FakeSession | null = null) {
  let session = initial;
  let listener: Listener | null = null;
  const mocks = {
    getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithOAuth: vi.fn((): Promise<AuthResult> => Promise.resolve({ data: {}, error: null })),
    signInWithOtp: vi.fn((): Promise<AuthResult> => Promise.resolve({ data: {}, error: null })),
    signOut: vi.fn(() => {
      session = null;
      listener?.("SIGNED_OUT", null);
      return Promise.resolve({ error: null });
    }),
    refreshSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
  };
  return {
    auth: mocks as unknown as SupabaseAuth,
    mocks,
    emit(event: string, next: FakeSession | null) {
      session = next;
      listener?.(event, next);
    },
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status < 400 ? "application/json" : "application/problem+json" },
  });
}

function makeStore(
  options: {
    config?: PublicConfig | Error;
    supabase?: ReturnType<typeof fakeSupabase>;
    storage?: ReturnType<typeof memoryStorage>;
    fetch?: AuthDeps["fetch"];
  } = {},
) {
  const storage = options.storage ?? memoryStorage();
  const supabase = options.supabase ?? fakeSupabase();
  const fetch = vi.fn(
    options.fetch ??
      ((path: string) =>
        Promise.resolve(
          path.endsWith("/dev/login")
            ? jsonResponse(DEMO_SESSION)
            : jsonResponse({ students: 6, lessons: 60, payments: 20 }),
        )),
  );
  const loadConfig = vi.fn(() =>
    options.config instanceof Error
      ? Promise.reject(options.config)
      : Promise.resolve(options.config ?? CONFIG),
  );
  const createSupabase = vi.fn(() => Promise.resolve(supabase.auth));
  const store = new AuthStore({
    loadConfig,
    createSupabase,
    storage,
    fetch,
    origin: () => "https://app.test",
  });
  return { store, storage, supabase, fetch, loadConfig, createSupabase };
}

describe("start-up", () => {
  it("is loading until the config and session are known", async () => {
    const { store, loadConfig } = makeStore();
    expect(store.getSnapshot().status).toBe("loading");
    await Promise.all([store.start(), store.start()]);
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "signedOut", user: null, config: CONFIG });
  });

  it("restores a Supabase session", async () => {
    const supabase = fakeSupabase({
      access_token: "jwt",
      user: { id: "u1", email: "anna@example.it" },
    });
    const { store, createSupabase } = makeStore({ supabase });
    await store.start();
    expect(createSupabase).toHaveBeenCalledWith(
      CONFIG.supabase_url,
      CONFIG.supabase_publishable_key,
    );
    expect(store.getSnapshot()).toMatchObject({
      status: "signedIn",
      user: { id: "u1", email: "anna@example.it", mode: "supabase" },
    });
    expect(await store.getAccessToken()).toBe("jwt");
  });

  it("does not create a Supabase client without a publishable key", async () => {
    const { store, createSupabase } = makeStore({ config: DEMO_CONFIG });
    await store.start();
    expect(createSupabase).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe("signedOut");
  });

  it("restores a demo session from sessionStorage only if demo mode is on", async () => {
    const stored = { [DEMO_STORAGE_KEY]: JSON.stringify(DEMO_SESSION) };
    const demo = makeStore({ config: DEMO_CONFIG, storage: memoryStorage(stored) });
    await demo.store.start();
    expect(demo.store.getSnapshot().user).toMatchObject({
      mode: "demo",
      email: "demo@ripetiflow.local",
    });
    expect(await demo.store.getAccessToken()).toBe("demo-token");

    const off = makeStore({ config: CONFIG, storage: memoryStorage(stored) });
    await off.store.start();
    expect(off.store.getSnapshot().status).toBe("signedOut");
    expect(off.storage.data.has(DEMO_STORAGE_KEY)).toBe(false);
  });

  it("ignores a corrupted demo session", async () => {
    const storage = memoryStorage({ [DEMO_STORAGE_KEY]: "{not json" });
    const { store } = makeStore({ config: DEMO_CONFIG, storage });
    await store.start();
    expect(store.getSnapshot().status).toBe("signedOut");
  });

  it("reports an unreachable API and can retry", async () => {
    const { store, loadConfig } = makeStore({ config: new TypeError("Failed to fetch") });
    await store.start();
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe("signedOut");
    expect(snapshot.error).toBeInstanceOf(ApiProblem);
    expect(snapshot.error?.code).toBe("network_error");

    loadConfig.mockImplementation(() => Promise.resolve(CONFIG));
    await store.retry();
    expect(store.getSnapshot()).toMatchObject({ status: "signedOut", error: null, config: CONFIG });
  });

  it("keeps working when Supabase cannot be initialised", async () => {
    const { store, createSupabase } = makeStore({ config: { ...CONFIG, dev_auth_enabled: true } });
    createSupabase.mockImplementation(() => Promise.reject(new Error("boom")));
    await store.start();
    expect(store.getSnapshot().status).toBe("signedOut");
    await store.signInDemo();
    expect(store.getSnapshot().user?.mode).toBe("demo");
  });

  it("notifies subscribers", async () => {
    const { store } = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.start();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await store.signOut();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Supabase sign-in", () => {
  it("follows session events after start-up", async () => {
    const supabase = fakeSupabase(null);
    const { store } = makeStore({ supabase });
    await store.start();
    supabase.emit("SIGNED_IN", { access_token: "a", user: { id: "u2", email: "b@example.it" } });
    expect(store.getSnapshot()).toMatchObject({ status: "signedIn", user: { id: "u2" } });
    supabase.emit("TOKEN_REFRESHED", {
      access_token: "a2",
      user: { id: "u2", email: "b@example.it" },
    });
    expect(await store.getAccessToken()).toBe("a2");
    supabase.emit("SIGNED_OUT", null);
    expect(store.getSnapshot()).toMatchObject({ status: "signedOut", user: null });
  });

  it("starts Google OAuth with the callback URL and no extra scopes", async () => {
    const { store, supabase } = makeStore();
    await store.start();
    await store.signInWithGoogle();
    expect(supabase.mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://app.test/auth/callback" },
    });
  });

  it("refuses Google when disabled or not configured", async () => {
    const disabled = makeStore({ config: { ...CONFIG, google_login_enabled: false } });
    await disabled.store.start();
    await expect(disabled.store.signInWithGoogle()).rejects.toBeInstanceOf(UserFacingError);

    const unconfigured = makeStore({ config: DEMO_CONFIG });
    await unconfigured.store.start();
    await expect(unconfigured.store.signInWithGoogle()).rejects.toThrow(/non è configurato/);
  });

  it("sends a magic link to a valid address", async () => {
    const { store, supabase } = makeStore();
    await store.start();
    await store.sendMagicLink("  anna@example.it ");
    expect(supabase.mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "anna@example.it",
      options: { emailRedirectTo: "https://app.test/auth/callback" },
    });
    await expect(store.sendMagicLink("anna@")).rejects.toThrow(
      "Inserisci un indirizzo email valido.",
    );
  });

  it("explains magic-link rate limits in Italian", async () => {
    const { store, supabase } = makeStore();
    await store.start();
    supabase.mocks.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 429 } });
    await expect(store.sendMagicLink("anna@example.it")).rejects.toThrow(/troppi link/);
    supabase.mocks.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 500 } });
    await expect(store.sendMagicLink("anna@example.it")).rejects.toThrow(/Non è stato possibile/);
  });
});

describe("demo mode", () => {
  it("signs in with POST /dev/login and keeps the token in sessionStorage", async () => {
    const { store, fetch, storage } = makeStore({ config: DEMO_CONFIG });
    await store.start();
    await store.signInDemo();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/dev/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(store.getSnapshot()).toMatchObject({
      status: "signedIn",
      user: { id: DEMO_SESSION.user.id, mode: "demo" },
    });
    expect(JSON.parse(storage.data.get(DEMO_STORAGE_KEY)!)).toEqual(DEMO_SESSION);
    expect(await store.getAccessToken()).toBe("demo-token");
  });

  it("'Esci' clears the demo token", async () => {
    const { store, storage } = makeStore({ config: DEMO_CONFIG });
    await store.start();
    await store.signInDemo();
    await store.signOut();
    expect(storage.data.has(DEMO_STORAGE_KEY)).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ status: "signedOut", user: null, notice: null });
    expect(await store.getAccessToken()).toBeNull();
  });

  it("seeds the demo data", async () => {
    const { store, fetch } = makeStore({ config: DEMO_CONFIG });
    await store.start();
    await expect(store.seedDemo()).resolves.toEqual({ students: 6, lessons: 60, payments: 20 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/dev/seed",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("is refused when the server has no demo mode", async () => {
    const { store, fetch } = makeStore({ config: CONFIG });
    await store.start();
    await expect(store.signInDemo()).rejects.toThrow(/modalità demo non è attiva/);
    await expect(store.seedDemo()).rejects.toBeInstanceOf(UserFacingError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces API problems from the demo endpoints", async () => {
    const { store } = makeStore({
      config: DEMO_CONFIG,
      fetch: () =>
        Promise.resolve(
          jsonResponse({ code: "internal_error", detail: "Database non raggiungibile." }, 500),
        ),
    });
    await store.start();
    await expect(store.signInDemo()).rejects.toMatchObject({
      status: 500,
      detail: "Database non raggiungibile.",
    });
    expect(store.getSnapshot().status).toBe("signedOut");
  });

  it("maps network failures of the demo endpoints", async () => {
    const { store } = makeStore({
      config: DEMO_CONFIG,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    await store.start();
    await expect(store.signInDemo()).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("sign-out and expired sessions", () => {
  it("signs out of Supabase locally", async () => {
    const supabase = fakeSupabase({ access_token: "jwt", user: { id: "u1" } });
    const { store } = makeStore({ supabase });
    await store.start();
    await store.signOut();
    expect(supabase.mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(store.getSnapshot().status).toBe("signedOut");
  });

  it("a 401 signs out once and explains why", async () => {
    const supabase = fakeSupabase({ access_token: "jwt", user: { id: "u1" } });
    const { store } = makeStore({ supabase });
    await store.start();
    store.handleUnauthorized();
    store.handleUnauthorized();
    store.handleUnauthorized();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("signedOut"));
    expect(store.getSnapshot().notice).toBe("session-expired");
    expect(supabase.mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("a 401 while signed out does nothing", async () => {
    const { store, supabase } = makeStore();
    await store.start();
    store.handleUnauthorized();
    expect(supabase.mocks.signOut).not.toHaveBeenCalled();
    expect(store.getSnapshot().notice).toBeNull();
  });

  it("no token before start-up has finished", async () => {
    const { store } = makeStore();
    expect(await store.getAccessToken()).toBeNull();
  });
});

describe("Google Calendar consent (D-31)", () => {
  const USER = { id: "u1", email: "anna@example.it" };

  it("asks for calendar.app.created with offline access, back to ?next=calendar", async () => {
    const supabase = fakeSupabase({ access_token: "jwt", user: USER });
    const { store, storage } = makeStore({ supabase });
    await store.start();
    await store.connectGoogleCalendar();
    expect(supabase.mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://app.test/auth/callback?next=calendar",
        scopes: CALENDAR_SCOPE,
        queryParams: { access_type: "offline", prompt: "consent", login_hint: "anna@example.it" },
      },
    });
    expect(CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar.app.created");
    expect(storage.data.get(CALENDAR_USER_KEY)).toBe("u1");
  });

  it("is not available in demo mode or when the server has no calendar sync", async () => {
    const demo = makeStore({ config: { ...DEMO_CONFIG, calendar_sync_available: true } });
    await demo.store.start();
    await demo.store.signInDemo();
    await expect(demo.store.connectGoogleCalendar()).rejects.toThrow(/modalità demo/);

    const off = makeStore({
      config: { ...CONFIG, calendar_sync_available: false },
      supabase: fakeSupabase({ access_token: "jwt", user: USER }),
    });
    await off.store.start();
    await expect(off.store.connectGoogleCalendar()).rejects.toThrow(/non è attiva/);
  });

  it("hands over the provider tokens exactly once", async () => {
    const supabase = fakeSupabase({
      access_token: "jwt",
      user: USER,
      provider_token: "google-access",
      provider_refresh_token: "google-refresh",
    });
    const storage = memoryStorage({ [CALENDAR_USER_KEY]: "u1" });
    const { store } = makeStore({ supabase, storage });
    await store.start();
    await expect(store.takeCalendarGrant()).resolves.toEqual({
      provider_refresh_token: "google-refresh",
      provider_token: "google-access",
    });
    await expect(store.takeCalendarGrant()).resolves.toBeNull();
    expect(storage.data.has(CALENDAR_USER_KEY)).toBe(false);

    await store.forgetProviderTokens();
    expect(supabase.mocks.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("refuses a grant without refresh token", async () => {
    const supabase = fakeSupabase({
      access_token: "jwt",
      user: USER,
      provider_token: "only-access",
    });
    const { store } = makeStore({ supabase });
    await store.start();
    await expect(store.takeCalendarGrant()).rejects.toThrow(/non ha concesso/);
  });

  it("refuses a grant from a different account than the one that asked", async () => {
    const supabase = fakeSupabase({
      access_token: "jwt",
      user: { id: "someone-else" },
      provider_refresh_token: "r",
    });
    const storage = memoryStorage({ [CALENDAR_USER_KEY]: "u1" });
    const { store } = makeStore({ supabase, storage });
    await store.start();
    await expect(store.takeCalendarGrant()).rejects.toThrow(/account Google diverso/);
  });
});
