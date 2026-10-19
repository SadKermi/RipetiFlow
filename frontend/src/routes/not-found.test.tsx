import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "@/app/auth";
import { AuthStore, DEMO_STORAGE_KEY } from "@/app/auth/store";
import { Component as NotFound } from "./not-found";

function store(signedIn: boolean) {
  const storage = new Map<string, string>();
  if (signedIn) {
    storage.set(
      DEMO_STORAGE_KEY,
      JSON.stringify({ access_token: "t", user: { id: "u", email: "demo@ripetiflow.local" } }),
    );
  }
  return new AuthStore({
    loadConfig: () =>
      Promise.resolve({
        supabase_url: "",
        supabase_publishable_key: "",
        google_login_enabled: false,
        magic_link_enabled: false,
        dev_auth_enabled: true,
        calendar_sync_available: false,
        assistant_available: false,
      }),
    createSupabase: () => Promise.reject(new Error("not configured")),
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
    },
    fetch: () => Promise.reject(new Error("offline")),
    origin: () => "http://localhost:3000",
  });
}

function renderPage(signedIn: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider store={store(signedIn)}>
        <MemoryRouter>
          <NotFound />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("not-found page (03 §10.3)", () => {
  it("signed in: back to Oggi", async () => {
    renderPage(true);
    expect(
      screen.getByRole("heading", { level: 1, name: "Pagina non trovata" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Questo indirizzo non corrisponde a nessuna pagina del registro."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Vai a Oggi" })).toHaveAttribute(
      "href",
      "/oggi",
    );
  });

  it("signed out: back to the landing", async () => {
    renderPage(false);
    expect(await screen.findByRole("link", { name: "Torna alla home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
