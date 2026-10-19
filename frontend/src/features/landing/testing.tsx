// Test harness for the public pages, Agenda and Impostazioni: a real AuthStore with fake
// dependencies (demo or Supabase session), the real API client over a stubbed fetch, and the
// routes wrapped in RootLayout (toasts, React Aria router). Used only by *.test.tsx files.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { type RouteObject, RouterProvider, createMemoryRouter } from "react-router";
import { vi } from "vitest";
import { AuthProvider } from "@/app/auth";
import { AuthStore, DEMO_STORAGE_KEY, type SupabaseAuth } from "@/app/auth/store";
import { RootLayout } from "@/app/RootLayout";
import type { CalendarStatus, Profile, PublicConfig, Subject } from "@/lib/api/types";

export const CONFIG: PublicConfig = {
  supabase_url: "",
  supabase_publishable_key: "",
  google_login_enabled: false,
  magic_link_enabled: false,
  dev_auth_enabled: true,
  calendar_sync_available: false,
  assistant_available: false,
};

/** Supabase configured, Google and email on, no demo. */
export const SUPABASE_CONFIG: PublicConfig = {
  supabase_url: "https://esempio.supabase.co",
  supabase_publishable_key: "sb_publishable_test",
  google_login_enabled: true,
  magic_link_enabled: true,
  dev_auth_enabled: false,
  calendar_sync_available: true,
  assistant_available: true,
};

export const PROFILE: Profile = {
  id: "u1",
  email: "d.marchi@esempio.it",
  full_name: "Daniele Marchi",
  timezone: "Europe/Rome",
  default_lesson_minutes: 90,
  default_hourly_rate_cents: 2000,
  created_at: "2026-09-01T10:00:00+00:00",
};

export const SUBJECTS: Subject[] = [
  { id: "s-mat", name: "Matematica", position: 1, archived: false },
  { id: "s-fis", name: "Fisica", position: 2, archived: false },
  { id: "s-lat", name: "Latino", position: 3, archived: false },
  { id: "s-chi", name: "Chimica", position: 4, archived: true },
];

export const CALENDAR_OFF: CalendarStatus = {
  available: true,
  connected: false,
  google_email: null,
  calendar_id: null,
  status: null,
  last_synced_at: null,
  last_error: null,
  pending: 0,
  errors: 0,
};

export function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": status < 400 ? "application/json" : "application/problem+json",
    },
  });
}

export function problem(
  status: number,
  detail: string,
  errors?: { field: string; message: string }[],
) {
  const code =
    status === 409
      ? "conflict"
      : status === 422
        ? "validation_error"
        : status === 502
          ? "upstream_error"
          : "internal_error";
  return json({ type: "about:blank", title: "Errore", status, detail, code, errors }, status);
}

export interface Recorded {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

export type Handler = (request: Request, body: unknown) => Response | Promise<Response>;
/** A handler, a fixed Response, or a JSON body answered with 200. */
export type RouteAnswer = Handler | Response | object;
export type ApiRoutes = Record<string, RouteAnswer>;

/**
 * Stubs fetch: `routes` maps "METHOD /path" (without /api/v1) to a handler or a fixed answer.
 * Everything else answers 404. Returns the requests seen, with their parsed JSON bodies.
 */
export function stubApi(routes: ApiRoutes) {
  const calls: Recorded[] = [];
  const fetch = vi.fn(async (input: Request | string) => {
    const request = typeof input === "string" ? new Request(input) : input;
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const text = request.method === "GET" ? "" : await request.clone().text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    calls.push({ method: request.method, path, search: url.search, body });
    const route = routes[`${request.method} ${path}`];
    if (route === undefined) return problem(404, "Non trovato.");
    if (typeof route === "function") return (route as Handler)(request, body);
    if (route instanceof Response) return route.clone();
    return json(route);
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

export const DEMO_SESSION = {
  access_token: "demo-token",
  user: { id: "00000000-0000-4000-8000-00000000de30", email: "demo@ripetiflow.local" },
};

/** Demo mode (dev_auth): signed in or not, with an optional failing /dev/login. */
export function demoStore({
  config = CONFIG,
  signedIn = true,
  login,
}: {
  /** A config, an error (unreachable), or a loader (e.g. failing once). */
  config?: PublicConfig | Error | (() => Promise<PublicConfig>);
  signedIn?: boolean;
  login?: () => Promise<Response>;
} = {}) {
  return new AuthStore({
    loadConfig: () =>
      typeof config === "function"
        ? config()
        : config instanceof Error
          ? Promise.reject(config)
          : Promise.resolve(config),
    createSupabase: () => Promise.reject(new Error("not configured")),
    storage: memoryStorage(signedIn ? { [DEMO_STORAGE_KEY]: JSON.stringify(DEMO_SESSION) } : {}),
    fetch: login ?? (() => Promise.resolve(json(DEMO_SESSION))),
    origin: () => "http://localhost:3000",
  });
}

export interface FakeSupabase {
  auth: SupabaseAuth;
  signInWithOAuth: ReturnType<typeof vi.fn>;
  signInWithOtp: ReturnType<typeof vi.fn>;
  refreshSession: ReturnType<typeof vi.fn>;
}

/** A supabase-js auth double: `session` null = signed out. */
export function fakeSupabase(
  session: {
    userId?: string;
    email?: string;
    providerRefreshToken?: string | null;
  } | null,
  { otpError }: { otpError?: { status: number } } = {},
): FakeSupabase {
  const current = session
    ? {
        access_token: "supabase-token",
        provider_token: "google-access",
        provider_refresh_token: session.providerRefreshToken ?? null,
        user: { id: session.userId ?? "u1", email: session.email ?? "d.marchi@esempio.it" },
      }
    : null;
  const signInWithOAuth = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const signInWithOtp = vi.fn(() =>
    Promise.resolve({ data: {}, error: otpError ? { status: otpError.status } : null }),
  );
  const refreshSession = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const auth = {
    getSession: () => Promise.resolve({ data: { session: current }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    signInWithOAuth,
    signInWithOtp,
    signOut: () => Promise.resolve({ error: null }),
    refreshSession,
  } as unknown as SupabaseAuth;
  return { auth, signInWithOAuth, signInWithOtp, refreshSession };
}

export function supabaseStore(supabase: FakeSupabase, config: PublicConfig = SUPABASE_CONFIG) {
  return new AuthStore({
    loadConfig: () => Promise.resolve(config),
    createSupabase: () => Promise.resolve(supabase.auth),
    storage: memoryStorage(),
    fetch: () => Promise.reject(new Error("no demo here")),
    origin: () => "http://localhost:3000",
  });
}

/** Renders `routes` under RootLayout at `path`; extra paths render a heading with their name. */
export function renderRoutes(
  routes: RouteObject[],
  { path, store, state }: { path: string; store: AuthStore; state?: unknown },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const page = (title: string) => <h1>{title}</h1>;
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          ...routes,
          { path: "/oggi", element: page("Pagina Oggi") },
          { path: "*", element: page("Altra pagina") },
        ],
      },
    ],
    {
      initialEntries: [
        {
          pathname: path.split(/[?#]/)[0],
          search: path.match(/\?[^#]*/)?.[0] ?? "",
          hash: path.match(/#.*/)?.[0] ?? "",
          state,
        },
      ],
    },
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider store={store}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient, store, ...view };
}

/** window.matchMedia answering true for the queries `matches` accepts. */
export function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: matches(query),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}
