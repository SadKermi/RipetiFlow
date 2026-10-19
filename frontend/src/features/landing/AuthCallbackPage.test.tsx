import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import type { AuthStore } from "@/app/auth/store";
import { readCalendarReturnState } from "@/features/calendar/messages";
import { AuthCallbackPage } from "./AuthCallbackPage";
import { SignInPage } from "./SignInPage";
import { recallSignIn, rememberSignIn } from "./signin";
import {
  CALENDAR_OFF,
  fakeSupabase,
  problem,
  renderRoutes,
  stubApi,
  supabaseStore,
} from "./testing";

function SettingsProbe() {
  const location = useLocation();
  return (
    <>
      <h1>Impostazioni</h1>
      <p>hash: {location.hash}</p>
      <p>errore: {readCalendarReturnState(location.state) ?? "nessuno"}</p>
    </>
  );
}

function renderCallback(path: string, store: AuthStore) {
  return renderRoutes(
    [
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      { path: "/accedi", element: <SignInPage /> },
      { path: "/impostazioni", element: <SettingsProbe /> },
    ],
    { path, store },
  );
}

describe("/auth/callback (03 §2)", () => {
  it("signed in: straight to Oggi, the attempt is forgotten", async () => {
    stubApi({});
    rememberSignIn({ method: "google" });
    const { router } = renderCallback("/auth/callback", supabaseStore(fakeSupabase({})));
    expect(await screen.findByRole("heading", { name: "Pagina Oggi" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/oggi");
    expect(recallSignIn()).toBeNull();
  });

  it("while it works: only «Ti stiamo facendo entrare…»", () => {
    stubApi({});
    renderCallback("/auth/callback", supabaseStore(fakeSupabase({})));
    expect(screen.getByText("Ti stiamo facendo entrare…")).toHaveAttribute("role", "status");
  });

  it("an expired email link: its own page, and «Mandane un altro» writes the address again", async () => {
    stubApi({});
    rememberSignIn({ method: "email", email: "d.marchi@esempio.it" });
    renderCallback(
      "/auth/callback#error=access_denied&error_code=otp_expired",
      supabaseStore(fakeSupabase(null)),
    );
    expect(await screen.findByRole("heading", { name: "Il link non è più valido" })).toBeVisible();
    expect(
      screen.getByText("I link di accesso valgono una volta sola e per poco tempo."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Mandane un altro" }));
    expect(await screen.findByRole("textbox", { name: "Email" })).toHaveValue(
      "d.marchi@esempio.it",
    );
  });

  it("Google cancelled or failed: back to /accedi with the note under the button", async () => {
    stubApi({});
    rememberSignIn({ method: "google" });
    const { router } = renderCallback(
      "/auth/callback?error=access_denied&error_description=Annullato",
      supabaseStore(fakeSupabase(null)),
    );
    expect(await screen.findByText("Accesso con Google non completato. Riprova.")).toBeVisible();
    expect(router.state.location.pathname).toBe("/accedi");
  });

  it("any other failure: «Accesso non completato» and the way back", async () => {
    stubApi({});
    renderCallback("/auth/callback", supabaseStore(fakeSupabase(null)));
    expect(await screen.findByRole("heading", { name: "Accesso non completato" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Torna all'accesso" })).toHaveAttribute(
      "href",
      "/accedi",
    );
  });
});

describe("/auth/callback?next=calendar (03 §8, D-31)", () => {
  it("sends the refresh token once, refreshes the session and goes back with a toast", async () => {
    const calls = stubApi({
      "POST /integrations/google-calendar/connect": {
        ...CALENDAR_OFF,
        connected: true,
        status: "active",
        pending: 12,
      },
    });
    const supabase = fakeSupabase({ providerRefreshToken: "refresh-1" });
    const { router } = renderCallback("/auth/callback?next=calendar", supabaseStore(supabase));
    expect(screen.getByText("Sto collegando il calendario…")).toHaveAttribute("role", "status");
    expect(await screen.findByRole("heading", { name: "Impostazioni" })).toBeVisible();
    expect(screen.getByText("Calendario collegato · 12 lezioni in coda")).toBeVisible();
    expect(router.state.location.hash).toBe("#google-calendar");
    expect(screen.getByText("errore: nessuno")).toBeVisible();
    expect(calls).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/integrations/google-calendar/connect",
        body: { provider_refresh_token: "refresh-1", provider_token: "google-access" },
      }),
    ]);
    await waitFor(() => expect(supabase.refreshSession).toHaveBeenCalledTimes(1));
  });

  it("the refresh token is not kept anywhere once sent (not even in the query cache)", async () => {
    stubApi({
      "POST /integrations/google-calendar/connect": {
        ...CALENDAR_OFF,
        connected: true,
        status: "active",
      },
    });
    const supabase = fakeSupabase({ providerRefreshToken: "refresh-secret" });
    const { queryClient } = renderCallback("/auth/callback?next=calendar", supabaseStore(supabase));
    expect(await screen.findByRole("heading", { name: "Impostazioni" })).toBeVisible();
    await waitFor(() => expect(supabase.refreshSession).toHaveBeenCalledTimes(1));
    const kept = () =>
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables),
      );
    await waitFor(() => expect(kept()).not.toContain("refresh-secret"));
  });

  it("permission refused (422): back to Impostazioni with the server's text", async () => {
    stubApi({
      "POST /integrations/google-calendar/connect": problem(
        422,
        "Per sincronizzare devi concedere l'accesso a Google Calendar: riprova e lascia selezionata l'autorizzazione al calendario.",
        [{ field: "provider_refresh_token", message: "Permesso mancante." }],
      ),
    });
    const supabase = fakeSupabase({ providerRefreshToken: "refresh-1" });
    renderCallback("/auth/callback?next=calendar", supabaseStore(supabase));
    expect(
      await screen.findByText(
        "errore: Per sincronizzare devi concedere l'accesso a Google Calendar: riprova e lascia selezionata l'autorizzazione al calendario.",
      ),
    ).toBeVisible();
    await waitFor(() => expect(supabase.refreshSession).toHaveBeenCalled());
  });

  it("no refresh token from Google: nothing is sent, the reason is shown", async () => {
    const calls = stubApi({});
    renderCallback(
      "/auth/callback?next=calendar",
      supabaseStore(fakeSupabase({ providerRefreshToken: null })),
    );
    expect(await screen.findByText(/errore: Google non ha concesso l'accesso/)).toBeVisible();
    expect(calls).toEqual([]);
  });

  it("consent cancelled on Google: back with «non è stato completato»", async () => {
    const calls = stubApi({});
    renderCallback(
      "/auth/callback?next=calendar&error=access_denied",
      supabaseStore(fakeSupabase({ providerRefreshToken: "refresh-1" })),
    );
    expect(
      await screen.findByText(
        "errore: Il collegamento con Google Calendar non è stato completato.",
      ),
    ).toBeVisible();
    expect(calls).toEqual([]);
  });
});
