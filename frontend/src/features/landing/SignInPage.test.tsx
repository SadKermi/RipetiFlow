import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";
import { recallSignIn } from "./signin";
import {
  CONFIG,
  SUPABASE_CONFIG,
  demoStore,
  fakeSupabase,
  json,
  problem,
  renderRoutes,
  stubApi,
  supabaseStore,
} from "./testing";
import type { AuthStore } from "@/app/auth/store";

function renderSignIn(store: AuthStore, state?: unknown) {
  stubApi({});
  return renderRoutes([{ path: "/accedi", element: <SignInPage /> }], {
    path: "/accedi",
    store,
    state,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("/accedi (03 §2)", () => {
  it("shows the title at once and every active method", async () => {
    renderSignIn(supabaseStore(fakeSupabase(null)));
    expect(screen.getByRole("heading", { level: 1, name: "Entra nel tuo registro" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Continua con Google" })).toBeVisible();
    expect(
      screen.getByText(
        "Usiamo il tuo account Google solo per l'accesso. Calendar si collega dopo, se vuoi, da Impostazioni.",
      ),
    ).toBeVisible();
    expect(screen.getByText("oppure")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mandami il link" })).toBeVisible();
    expect(screen.getByText(/app non verificata/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Entra in modalità demo" }),
    ).not.toBeInTheDocument();
  });

  it("only email: no Google, the email button is the primary one", async () => {
    renderSignIn(
      supabaseStore(fakeSupabase(null), { ...SUPABASE_CONFIG, google_login_enabled: false }),
    );
    expect(
      await screen.findByText("Ti mandiamo un link per entrare: nessuna password."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continua con Google" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mandami il link" }).className).toContain("bg-ink");
  });

  it("server unreachable: the band with «Riprova»", async () => {
    const loadConfig = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(CONFIG);
    renderSignIn(demoStore({ signedIn: false, config: loadConfig }));
    expect(await screen.findByText("Non riesco a contattare il server.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("button", { name: "Entra in modalità demo" })).toBeVisible();
  });

  it("no method active: says so, without buttons", async () => {
    renderSignIn(demoStore({ signedIn: false, config: { ...CONFIG, dev_auth_enabled: false } }));
    expect(await screen.findByText("L'accesso non è configurato su questo server.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("validates the address before sending the link", async () => {
    const supabase = fakeSupabase(null);
    renderSignIn(supabaseStore(supabase));
    await userEvent.type(await screen.findByRole("textbox", { name: "Email" }), "marchi@");
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));
    const field = screen.getByRole("textbox", { name: "Email" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Scrivi un indirizzo email valido.");
    expect(field).toHaveFocus();
    expect(supabase.signInWithOtp).not.toHaveBeenCalled();
  });

  it("link sent: the note, «mandalo di nuovo» after 60 s, «Usa un'altra email»", async () => {
    const supabase = fakeSupabase(null);
    renderSignIn(supabaseStore(supabase));
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Email" }),
      "d.marchi@esempio.it",
    );
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));
    expect(
      await screen.findByText(/Aprilo da questo telefono o computer per entrare\./),
    ).toBeVisible();
    expect(screen.getByText("d.marchi@esempio.it")).toBeVisible();
    // The form that had the focus is gone: the focus is on the note that replaced it.
    expect(
      screen.getByText(/Ti abbiamo mandato un link a/).closest("[tabindex='-1']"),
    ).toHaveFocus();
    expect(supabase.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "d.marchi@esempio.it" }),
    );
    expect(recallSignIn()).toEqual({ method: "email", email: "d.marchi@esempio.it" });
    expect(screen.getByText("mandalo di nuovo tra 60 s")).toBeVisible();
    expect(screen.queryByRole("button", { name: "mandalo di nuovo" })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
      await Promise.resolve();
    });
    await userEvent.click(screen.getByRole("button", { name: "mandalo di nuovo" }));
    await waitFor(() => expect(supabase.signInWithOtp).toHaveBeenCalledTimes(2));
    vi.useRealTimers();

    await userEvent.click(screen.getByRole("button", { name: "Usa un'altra email" }));
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("d.marchi@esempio.it");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
  });

  it("Invio pressed again while the link is being sent does not send a second one", async () => {
    const supabase = fakeSupabase(null);
    let release!: () => void;
    const sent = new Promise<{ data: object; error: null }>((done) => {
      release = () => done({ data: {}, error: null });
    });
    supabase.signInWithOtp.mockReturnValueOnce(sent);
    renderSignIn(supabaseStore(supabase));
    const field = await screen.findByRole("textbox", { name: "Email" });
    await userEvent.type(field, "d.marchi@esempio.it{Enter}");
    await screen.findByRole("button", { name: "Invio…" });
    await userEvent.type(field, "{Enter}");
    release();
    expect(
      await screen.findByText(/Aprilo da questo telefono o computer per entrare\./),
    ).toBeVisible();
    expect(supabase.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("too many links / failed sending: the screen's own words", async () => {
    renderSignIn(supabaseStore(fakeSupabase(null, { otpError: { status: 429 } })));
    await userEvent.type(await screen.findByRole("textbox", { name: "Email" }), "a@esempio.it");
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));
    expect(await screen.findByText("Troppi tentativi: riprova tra qualche minuto.")).toBeVisible();
  });

  it("a failed sending says so", async () => {
    renderSignIn(supabaseStore(fakeSupabase(null, { otpError: { status: 500 } })));
    await userEvent.type(await screen.findByRole("textbox", { name: "Email" }), "a@esempio.it");
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));
    expect(await screen.findByText("Invio non riuscito. Riprova tra poco.")).toBeVisible();
  });

  it("Google: starts the redirect and remembers it; a failed return shows the note", async () => {
    const supabase = fakeSupabase(null);
    renderSignIn(supabaseStore(supabase), { signInError: "google" });
    expect(await screen.findByText("Accesso con Google non completato. Riprova.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continua con Google" }));
    expect(supabase.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
    expect(recallSignIn()).toEqual({ method: "google" });
  });

  it("writes again the address of «Mandane un altro»", async () => {
    renderSignIn(supabaseStore(fakeSupabase(null)), { email: "d.marchi@esempio.it" });
    expect(await screen.findByRole("textbox", { name: "Email" })).toHaveValue(
      "d.marchi@esempio.it",
    );
  });

  it("demo: an error from the server stays under the button", async () => {
    renderSignIn(
      demoStore({
        signedIn: false,
        login: () => Promise.resolve(problem(503, "La modalità demo non è disponibile.")),
      }),
    );
    expect(
      screen.queryByText("Solo in sviluppo: dati di esempio, nessun account vero."),
    ).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Entra in modalità demo" }));
    expect(await screen.findByText("La modalità demo non è disponibile.")).toBeVisible();
    expect(
      screen.getByText("Solo in sviluppo: dati di esempio, nessun account vero."),
    ).toBeVisible();
  });

  it("demo: signs in", async () => {
    const store = demoStore({
      signedIn: false,
      login: () =>
        Promise.resolve(
          json({
            access_token: "t",
            user: { id: "u", email: "demo@ripetiflow.local" },
          }),
        ),
    });
    renderSignIn(store);
    await userEvent.click(await screen.findByRole("button", { name: "Entra in modalità demo" }));
    await waitFor(() => expect(store.getSnapshot().status).toBe("signedIn"));
  });

  it("session expired: the note of 03 §10.3", async () => {
    const store = demoStore({ signedIn: true });
    await store.start();
    await store.signOut("session-expired");
    renderSignIn(store);
    expect(
      await screen.findByText("La sessione è scaduta. Entra di nuovo: torni dove eri."),
    ).toBeVisible();
  });
});
