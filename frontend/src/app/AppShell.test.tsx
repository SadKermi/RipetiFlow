import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { MatitaSlotContext, type MatitaSlots } from "@/components/shell/matita-slot";
import { queryKeys } from "@/lib/queries";
import type { PublicConfig } from "@/lib/api/types";
import { AppShell } from "./AppShell";
import { AuthProvider } from "./auth";
import { AuthStore, DEMO_STORAGE_KEY } from "./auth/store";
import { RootLayout } from "./RootLayout";

const CONFIG: PublicConfig = {
  supabase_url: "",
  supabase_publishable_key: "",
  google_login_enabled: false,
  magic_link_enabled: false,
  dev_auth_enabled: true,
  calendar_sync_available: false,
  assistant_available: true,
};

function demoStore() {
  const storage = new Map<string, string>([
    [
      DEMO_STORAGE_KEY,
      JSON.stringify({
        access_token: "demo-token",
        user: { id: "00000000-0000-4000-8000-00000000de30", email: "demo@ripetiflow.local" },
      }),
    ],
  ]);
  return new AuthStore({
    loadConfig: () => Promise.resolve(CONFIG),
    createSupabase: () => Promise.reject(new Error("not configured")),
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
    },
    fetch: () => Promise.reject(new Error("no network in this test")),
    origin: () => "http://localhost:3000",
  });
}

function renderShell(path: string, slots: MatitaSlots = {}) {
  const fetch = vi.fn(() => Promise.reject(new Error("the shell must not fetch")));
  vi.stubGlobal("fetch", fetch);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.profile(), {
    id: "u1",
    email: "d.marchi@esempio.it",
    full_name: "Daniele Marchi",
    timezone: "Europe/Rome",
    default_lesson_minutes: 90,
    default_hourly_rate_cents: 2000,
    created_at: "2026-09-01T10:00:00Z",
  });
  const page = (title: string) => <h1>{title}</h1>;
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          {
            element: (
              <MatitaSlotContext value={slots}>
                <AppShell />
              </MatitaSlotContext>
            ),
            children: [
              { path: "oggi", element: page("Oggi") },
              { path: "studenti", element: page("Studenti") },
              { path: "studenti/:id", element: page("Giulia Ferri") },
              { path: "agenda", element: page("Agenda") },
              { path: "impostazioni", element: page("Impostazioni") },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider store={demoStore()}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { router, fetch };
}

describe("AppShell", () => {
  it("mobile tab bar: Oggi · Studenti · Agenda · Altro, the current one marked", async () => {
    renderShell("/studenti/s1");
    await screen.findByRole("heading", { name: "Giulia Ferri" });
    const navs = screen.getAllByRole("navigation", { name: "Sezioni" });
    const tabs = within(navs.find((nav) => within(nav).queryByText("Altro"))!).getAllByRole("link");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Oggi", "Studenti", "Agenda", "Altro"]);
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/oggi",
      "/studenti",
      "/agenda",
      "/impostazioni",
    ]);
    expect(tabs[1]).toHaveAttribute("aria-current", "page"); // the student page is under Studenti
  });

  it("desktop top bar: wordmark, three links, avatar menu with Impostazioni and Esci", async () => {
    const { fetch } = renderShell("/oggi");
    await screen.findByRole("heading", { name: "Oggi" });
    expect(screen.getByRole("link", { name: "RipetiFlow" })).toHaveAttribute("href", "/oggi");
    // The visible initials are in the name too (WCAG 2.5.3).
    const account = screen.getByRole("button", { name: "Account: Daniele Marchi, DM" });
    expect(account).toHaveTextContent("DM");
    await userEvent.click(account);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Impostazioni" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Esci" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled(); // the avatar's name comes from the cache only
  });

  it("marks demo mode, with its own «Esci»", async () => {
    renderShell("/oggi");
    expect(await screen.findByText("Modalità demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esci" })).toBeInTheDocument();
  });

  it("«Salta al contenuto» moves the focus to the main region", async () => {
    renderShell("/agenda");
    await screen.findByRole("heading", { name: "Agenda" });
    const skip = screen.getByRole("link", { name: "Salta al contenuto" });
    await userEvent.click(skip);
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("mounts Matita's slots, and hides the mobile bar on the student page", async () => {
    const slots: MatitaSlots = {
      MobileBar: () => <p>Scrivi a Matita…</p>,
      TopBarButton: () => <button type="button">Matita</button>,
    };
    const { router } = renderShell("/oggi", slots);
    await screen.findByRole("heading", { name: "Oggi" });
    expect(screen.getByText("Scrivi a Matita…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Matita" })).toBeInTheDocument();
    await router.navigate("/studenti/s1");
    await screen.findByRole("heading", { name: "Giulia Ferri" });
    expect(screen.queryByText("Scrivi a Matita…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Matita" })).toBeInTheDocument();
  });

  it("without Matita nothing is mounted in its place", async () => {
    renderShell("/oggi");
    await screen.findByRole("heading", { name: "Oggi" });
    expect(document.querySelector('[data-slot="matita-bar"]')).toBeNull();
  });
});
