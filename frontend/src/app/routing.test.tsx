import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { PublicConfig, StudentSummary } from "@/lib/api/types";
import { AuthProvider } from "./auth";
import { AuthStore, DEMO_STORAGE_KEY } from "./auth/store";
import { routes } from "./router";

const CONFIG: PublicConfig = {
  supabase_url: "",
  supabase_publishable_key: "",
  google_login_enabled: true,
  magic_link_enabled: true,
  dev_auth_enabled: true,
  calendar_sync_available: false,
  assistant_available: false,
};
const DEMO_SESSION = {
  access_token: "demo-token",
  user: { id: "00000000-0000-4000-8000-00000000de30", email: "demo@ripetiflow.local" },
};

function student(id: string, name: string): StudentSummary {
  return {
    id,
    first_name: name,
    last_name: null,
    display_name: name,
    grade: null,
    school: null,
    archived: false,
    balance: {
      balance_cents: -4500,
      projected_balance_cents: -4500,
      charged_cents: 4500,
      paid_cents: 0,
      scheduled_cents: 0,
      done_minutes: 90,
      scheduled_minutes: 0,
      current_hourly_rate_cents: 3000,
      status: "debt",
      credit_minutes: null,
    },
    next_lesson: null,
    last_lesson_date: "2026-10-05",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status < 400 ? "application/json" : "application/problem+json" },
  });
}

/** Stubs the API behind the client: /students answers with two students (or 401). */
function stubApi(options: { studentsStatus?: number } = {}) {
  const calls: { path: string; authorization: string | null }[] = [];
  const fetch = vi.fn((input: Request | string) => {
    const request = typeof input === "string" ? new Request(input) : input;
    const path = new URL(request.url).pathname;
    calls.push({ path, authorization: request.headers.get("Authorization") });
    if (path === "/api/v1/students") {
      if (options.studentsStatus === 401) {
        return Promise.resolve(json({ code: "unauthorized", detail: "Sessione scaduta." }, 401));
      }
      return Promise.resolve(json({ items: [student("s1", "Luca"), student("s2", "Giulia")] }));
    }
    return Promise.resolve(json({ code: "not_found", detail: "Non trovato." }, 404));
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

function makeStore(signedIn: boolean) {
  const storage = new Map<string, string>();
  if (signedIn) storage.set(DEMO_STORAGE_KEY, JSON.stringify(DEMO_SESSION));
  return new AuthStore({
    loadConfig: () => Promise.resolve(CONFIG),
    createSupabase: () => Promise.reject(new Error("not configured")),
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
    },
    fetch: () => Promise.resolve(json(DEMO_SESSION)),
    origin: () => "http://localhost:3000",
  });
}

function renderApp(path: string, store: AuthStore) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider store={store}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe("routing and auth guards", () => {
  it("sends signed-out visitors to /accedi and back after the demo sign-in", async () => {
    const calls = stubApi();
    const { router } = renderApp("/studenti", makeStore(false));

    expect(await screen.findByRole("heading", { name: "Accedi a RipetiFlow" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/accedi");
    expect(calls).toEqual([]); // nothing protected was requested

    await userEvent.click(screen.getByRole("button", { name: "Entra in modalità demo" }));

    expect(await screen.findByText("2 studenti")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/studenti");
    expect(screen.getByRole("link", { name: "Luca" })).toHaveAttribute("href", "/studenti/s1");
    expect(calls).toEqual([{ path: "/api/v1/students", authorization: "Bearer demo-token" }]);
  });

  it("sends signed-in users from /accedi to /oggi", async () => {
    stubApi();
    const { router } = renderApp("/accedi", makeStore(true));
    await waitFor(() => expect(router.state.location.pathname).toBe("/oggi"));
    expect(await screen.findByRole("heading", { name: "Oggi" })).toBeInTheDocument();
  });

  it("shows the public landing without signing in", async () => {
    stubApi();
    renderApp("/", makeStore(false));
    expect(await screen.findByRole("heading", { name: "RipetiFlow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/accedi");
  });

  it("answers unknown paths with a 404 page", async () => {
    stubApi();
    renderApp("/non-esiste", makeStore(true));
    expect(await screen.findByRole("heading", { name: "Pagina non trovata" })).toBeInTheDocument();
  });

  it("a 401 from the API signs out and returns to /accedi", async () => {
    stubApi({ studentsStatus: 401 });
    const store = makeStore(true);
    const { router } = renderApp("/studenti", store);
    expect(await screen.findByText("La sessione è scaduta: accedi di nuovo.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/accedi");
    expect(store.getSnapshot().status).toBe("signedOut");
  });

  it("'Esci' clears cached data", async () => {
    stubApi();
    const { queryClient, router } = renderApp("/studenti", makeStore(true));
    expect(await screen.findByText("2 studenti")).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("button", { name: "Esci" })[0]!);

    await waitFor(() => expect(router.state.location.pathname).toBe("/accedi"));
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });
});
