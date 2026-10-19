import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthStore } from "@/app/auth/store";
import {
  CALENDAR_OFF,
  CONFIG,
  PROFILE,
  demoStore,
  fakeSupabase,
  json,
  problem,
  renderRoutes,
  stubApi,
  type ApiRoutes,
  type RouteAnswer,
  supabaseStore,
} from "@/features/landing/testing";
import type { CalendarStatus } from "@/lib/api/types";
import { CalendarSection } from "./CalendarSection";
import { CALENDAR_SECTION_ID, connectedToast, formatLastSync, queuedToast } from "./messages";

const ACTIVE: CalendarStatus = {
  available: true,
  connected: true,
  google_email: "d.marchi@esempio.it",
  calendar_id: "cal-1",
  status: "active",
  last_synced_at: "2026-10-06T12:02:00+00:00",
  last_error: null,
  pending: 0,
  errors: 2,
};

function renderCalendar(
  status: RouteAnswer,
  {
    store = supabaseStore(fakeSupabase({})),
    routes = {},
    state,
  }: { store?: AuthStore; routes?: ApiRoutes; state?: unknown } = {},
) {
  const calls = stubApi({
    "GET /me": PROFILE,
    "GET /integrations/google-calendar": status,
    ...routes,
  });
  const view = renderRoutes([{ path: "/impostazioni", element: <CalendarSection /> }], {
    path: "/impostazioni",
    store,
    state,
  });
  return { calls, ...view };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Google Calendar texts", () => {
  it("formats the toasts and the last sync in the tutor's timezone", () => {
    expect(connectedToast(12)).toBe("Calendario collegato · 12 lezioni in coda");
    expect(connectedToast(1)).toBe("Calendario collegato · 1 lezione in coda");
    expect(connectedToast(0)).toBe("Calendario collegato");
    expect(queuedToast(12)).toBe("12 lezioni in coda per Google Calendar");
    const now = new Date("2026-10-06T12:20:00Z");
    expect(formatLastSync("2026-10-06T12:02:00+00:00", "Europe/Rome", now)).toBe("oggi 14:02");
    expect(formatLastSync("2026-10-05T16:30:00Z", "Europe/Rome", now)).toBe("ieri 18:30");
    expect(formatLastSync("2026-10-01T07:15:00Z", "Europe/Rome", now)).toBe("gio 1 ott 09:15");
    expect(formatLastSync("non è una data", "Europe/Rome", now)).toBeNull();
  });
});

describe("Impostazioni · Google Calendar (03 §8)", () => {
  it("not available on this server: says so, asks nothing", async () => {
    const { calls } = renderCalendar(CALENDAR_OFF, { store: demoStore({ config: CONFIG }) });
    expect(
      await screen.findByText(
        "La sincronizzazione con Google Calendar non è attiva su questo server.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path.includes("google-calendar"))).toBe(false));
  });

  it("available false in the status: the same sentence", async () => {
    renderCalendar({ ...CALENDAR_OFF, available: false });
    expect(
      await screen.findByText(
        "La sincronizzazione con Google Calendar non è attiva su questo server.",
      ),
    ).toBeVisible();
  });

  it("not connected: explains, connects through the Google consent", async () => {
    const supabase = fakeSupabase({});
    renderCalendar(CALENDAR_OFF, { store: supabaseStore(supabase) });
    expect(await screen.findByText("Non collegato. Le lezioni restano solo qui.")).toBeVisible();
    expect(screen.getByText(/non vede gli altri calendari/)).toBeVisible();
    expect(screen.getByText(/app non verificata/)).toBeVisible();
    expect(document.getElementById(CALENDAR_SECTION_ID)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Collega Google Calendar" }));
    expect(supabase.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "http://localhost:3000/auth/callback?next=calendar",
          scopes: "https://www.googleapis.com/auth/calendar.app.created",
        }) as object,
      }),
    );
  });

  it("demo tutor: the button is off and says why", async () => {
    renderCalendar(CALENDAR_OFF, {
      store: demoStore({ config: { ...CONFIG, calendar_sync_available: true } }),
    });
    const button = await screen.findByRole("button", { name: "Collega Google Calendar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "In modalità demo non si può collegare Google Calendar: entra con il tuo account.",
    );
  });

  it("permission refused on return: the server's text and «Riprova»", async () => {
    const supabase = fakeSupabase({});
    renderCalendar(CALENDAR_OFF, {
      store: supabaseStore(supabase),
      state: { calendarError: "Per sincronizzare devi concedere l'accesso a Google Calendar." },
    });
    const note = await screen.findByText(/Per sincronizzare devi concedere/);
    expect(note.closest("[role=alert]")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(supabase.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("connected: account, last sync, counters, and «Risincronizza prossime» with a toast", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T12:20:00Z") });
    const { calls } = renderCalendar(ACTIVE, {
      routes: { "POST /integrations/google-calendar/resync": json({ queued: 5 }, 202) },
    });
    expect(await screen.findByText("Collegato")).toBeVisible();
    expect(screen.getByText("d.marchi@esempio.it")).toBeVisible();
    expect(screen.getByText("Ultima sincronizzazione oggi 14:02")).toBeVisible();
    expect(screen.getByText(/In coda 0/)).toHaveTextContent("In coda 0 · Non riuscite 2");
    expect(screen.getByText("Il motivo è accanto a ogni lezione nel registro.")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Risincronizza prossime" }));
    expect(await screen.findByText("5 lezioni in coda per Google Calendar")).toBeVisible();
    expect(calls.filter((c) => c.method === "POST")).toEqual([
      expect.objectContaining({ body: { scope: "upcoming" } }),
    ]);
  });

  it("«Risincronizza tutte» asks first; a 409 stays in the dialog and reloads the status", async () => {
    let statusReads = 0;
    renderCalendar(
      () => {
        statusReads += 1;
        return json(ACTIVE);
      },
      {
        routes: {
          "POST /integrations/google-calendar/resync": problem(
            409,
            "Accesso a Google Calendar revocato: ricollega il calendario in Impostazioni.",
          ),
        },
      },
    );
    await userEvent.click(await screen.findByRole("button", { name: "Risincronizza tutte" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Risincronizzare tutte le lezioni?",
    });
    expect(within(dialog).getByText(/le modifiche fatte su Google si perdono/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Risincronizza tutte" }));
    expect(
      await within(dialog).findByText(
        "Accesso a Google Calendar revocato: ricollega il calendario in Impostazioni.",
      ),
    ).toBeVisible();
    await waitFor(() => expect(statusReads).toBeGreaterThan(1));
  });

  it("«Scollega»: dialog with «Elimina anche il calendario», remove_calendar sent", async () => {
    let connected = true;
    const { calls } = renderCalendar(() => json(connected ? ACTIVE : CALENDAR_OFF), {
      routes: {
        "DELETE /integrations/google-calendar": () => {
          connected = false;
          return new Response(null, { status: 204 });
        },
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Scollega" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Scollegare Google Calendar?" });
    expect(within(dialog).getByText(/Le lezioni restano qui\./)).toBeVisible();
    const remove = within(dialog).getByRole("checkbox", {
      name: "Elimina anche il calendario «RipetiFlow» da Google",
    });
    expect(remove).not.toBeChecked();
    await userEvent.click(remove);
    await userEvent.click(within(dialog).getByRole("button", { name: "Scollega" }));
    expect(await screen.findByText("Non collegato. Le lezioni restano solo qui.")).toBeVisible();
    expect(screen.getByText("Google Calendar scollegato")).toBeVisible();
    expect(calls.find((c) => c.method === "DELETE")?.search).toBe("?remove_calendar=true");
  });

  it("«Scollega» when Google does not answer (502): the note stays in the dialog", async () => {
    renderCalendar(ACTIVE, {
      routes: {
        "DELETE /integrations/google-calendar": problem(
          502,
          "Non è stato possibile eliminare il calendario da Google: il collegamento è ancora attivo, riprova tra poco.",
        ),
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Scollega" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Scollega" }));
    expect(
      await within(dialog).findByText(/il collegamento è ancora attivo, riprova tra poco\./),
    ).toBeVisible();
  });

  it("access revoked: explains the 7 days, «Ricollega», and the manual removal", async () => {
    const supabase = fakeSupabase({});
    renderCalendar(
      { ...ACTIVE, status: "revoked", pending: 3, last_synced_at: null },
      { store: supabaseStore(supabase) },
    );
    expect(await screen.findByText(/Google ha chiuso l'accesso al calendario\./)).toBeVisible();
    expect(screen.getByText("In coda 3")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Scollega" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Il calendario va tolto a mano da Google Calendar."),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Annulla" }));
    await userEvent.click(screen.getByRole("button", { name: "Ricollega" }));
    expect(supabase.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("sync error: the server's reason, «Risincronizza tutte» and «Ricollega»", async () => {
    renderCalendar({
      ...ACTIVE,
      status: "error",
      last_error: "Google Calendar non risponde. Nuovo tentativo automatico più tardi.",
    });
    expect(
      await screen.findByText(
        "Google Calendar non risponde. Nuovo tentativo automatico più tardi.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Risincronizza tutte" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ricollega" })).toBeVisible();
  });
});
