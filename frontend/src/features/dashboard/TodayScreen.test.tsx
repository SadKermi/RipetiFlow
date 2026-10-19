import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard } from "@/lib/api/types";
import {
  NOW,
  SUBJECTS,
  balance,
  lesson,
  mockApi,
  problem,
  renderWithProviders,
  summary,
} from "@/features/forms/test-utils";
import { TodayScreen } from "./TodayScreen";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function desktop() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: !query.includes("max-width") && !query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

const LUCA_TODAY = lesson({
  id: "l-luca",
  student: { id: "luca", display_name: "Luca Bianchi" },
  subject: { id: "lat", name: "Latino" },
  date: "2026-10-06",
  start_time: "15:00",
  end_time: "16:00",
  amount_cents: 2000,
  settled: false,
});
const ELENA = lesson({
  id: "l-elena",
  student: { id: "elena", display_name: "Elena Greco" },
  subject: { id: "ing", name: "Inglese" },
  date: "2026-10-07",
  start_time: "15:00",
  end_time: "16:00",
  settled: false,
});

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  const luca = summary("luca", "Luca Bianchi", 4000);
  luca.balance = balance(4000, { credit_minutes: 120, current_hourly_rate_cents: 2000 });
  return {
    today: "2026-10-06",
    upcoming: [LUCA_TODAY, ELENA],
    owing: [
      summary("marco", "Marco Rossi", -12000),
      summary("giulia", "Giulia Ferri", -6700, { archived: true }),
    ],
    in_credit: [luca],
    totals: { owed_to_you_cents: 18700, credit_held_cents: 4000 },
    month: {
      label: "ottobre 2026",
      lessons: 6,
      minutes: 450,
      earned_cents: 16700,
      collected_cents: 15500,
    },
    calendar: { connected: true, pending: 0, errors: 2 },
    ...overrides,
  };
}

describe("TodayScreen", () => {
  it("answers «what now and who owes me» in this order", async () => {
    mockApi({ "GET /dashboard": dashboard() });
    renderWithProviders(<TodayScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Oggi" })).toBeInTheDocument();
    expect(screen.getByText("martedì 6 ottobre")).toBeInTheDocument();

    const upcoming = await screen.findByRole("region", { name: "Prossime lezioni" });
    const luca = await within(upcoming).findByRole("link", { name: /Luca Bianchi/ });
    expect(luca).toHaveAttribute("href", "/studenti/luca?riga=l-luca");
    expect(luca).toHaveAccessibleName(/^15:00.*16:00.*Luca Bianchi.*Latino.*tra 40 min$/);
    expect(within(upcoming).getByRole("heading", { name: "mer 7 ott" })).toBeInTheDocument();
    expect(within(upcoming).getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "href",
      "/agenda",
    );

    const accounts = screen.getByRole("region", { name: "Conti aperti" });
    const names = within(accounts)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(names).toEqual(["Studenti", "Marco Rossi", "Giulia Ferriarchiviato", "Luca Bianchi"]);
    expect(within(accounts).getByText("ti deve 120 euro")).toBeInTheDocument();
    expect(within(accounts).getByText("in credito di 40 euro, circa 2 h")).toBeInTheDocument();
    expect(within(accounts).getByText("Da incassare").nextSibling).toHaveTextContent(/187,00\s€/);
    expect(within(accounts).getByText("Anticipi ricevuti").nextSibling).toHaveTextContent(
      /40,00\s€/,
    );

    const month = screen.getByRole("region", { name: "ottobre 2026" });
    expect(within(month).getByText("6 lezioni svolte · 7 h 30 min")).toBeInTheDocument();
    expect(within(month).getByText(/Maturato 167,00\s€ · Incassato 155,00\s€/)).toBeInTheDocument();
    expect(
      within(month).getByText(
        "Maturato: lezioni svolte nel mese. Incassato: pagamenti ricevuti nel mese.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("2 lezioni non sono in Google Calendar.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute(
      "href",
      "/impostazioni#calendar",
    );
  });

  it("empty sections say so; the month without lessons too", async () => {
    mockApi({
      "GET /dashboard": dashboard({
        upcoming: [],
        owing: [],
        in_credit: [],
        totals: { owed_to_you_cents: 0, credit_held_cents: 0 },
        month: {
          label: "ottobre 2026",
          lessons: 0,
          minutes: 0,
          earned_cents: 0,
          collected_cents: 5000,
        },
        calendar: { connected: false, pending: 0, errors: 0 },
      }),
      "GET /subjects": { items: SUBJECTS },
      "GET /students": { items: [summary("marco", "Marco Rossi", 0)] },
    });
    renderWithProviders(<TodayScreen />);
    expect(
      await screen.findByText("Nessuna lezione in programma nei prossimi 7 giorni."),
    ).toBeInTheDocument();
    expect(screen.getByText("Tutti in pari.")).toBeInTheDocument();
    expect(screen.getByText("ottobre 2026 · nessuna lezione svolta finora.")).toBeInTheDocument();
    expect(screen.getByText(/Incassato 50,00\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/Google Calendar/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Aggiungi una lezione" }));
    expect(await screen.findByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
  });

  it("first access without students: the welcome and «Aggiungi studente»", async () => {
    mockApi({
      "GET /dashboard": dashboard({
        upcoming: [],
        owing: [],
        in_credit: [],
        totals: { owed_to_you_cents: 0, credit_held_cents: 0 },
        month: {
          label: "ottobre 2026",
          lessons: 0,
          minutes: 0,
          earned_cents: 0,
          collected_cents: 0,
        },
        calendar: { connected: false, pending: 0, errors: 0 },
      }),
      "GET /students": { items: [] },
      "GET /subjects": { items: SUBJECTS },
    });
    renderWithProviders(<TodayScreen />);
    expect(
      await screen.findByText(
        "Benvenuto nel registro. Inizia dal primo studente: nome e tariffa bastano.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Prossime lezioni" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi studente" }));
    expect(await screen.findByRole("heading", { name: "Nuovo studente" })).toBeInTheDocument();
  });

  it("a failed load keeps title and date and shows the band", async () => {
    mockApi({ "GET /dashboard": problem(500, "Errore interno.") });
    renderWithProviders(<TodayScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Oggi" })).toBeInTheDocument();
    expect(await screen.findByText(/Non riesco a caricare i dati\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });

  it("phone: the wordmark and the account menu sit above the date (no top bar there)", async () => {
    mockApi({ "GET /dashboard": dashboard() });
    renderWithProviders(<TodayScreen />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "RipetiFlow" })).toHaveAttribute(
      "href",
      "/oggi",
    );
    await userEvent.click(
      within(header).getByRole("button", { name: "Account: Daniele Marchi, DM" }),
    );
    expect(await screen.findByRole("menuitem", { name: "Impostazioni" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Esci" })).toBeInTheDocument();
  });

  it("desktop: no masthead in the page, the top bar has it", () => {
    desktop();
    mockApi({ "GET /dashboard": dashboard() });
    renderWithProviders(<TodayScreen />);
    expect(screen.queryByRole("link", { name: "RipetiFlow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Account:/ })).not.toBeInTheDocument();
  });

  it("desktop: «Ripeti la settimana dopo» duplicates the lesson a week later", async () => {
    desktop();
    const requests = mockApi({
      "GET /dashboard": dashboard(),
      "POST /lessons/l-luca/duplicate": lesson({
        ...LUCA_TODAY,
        id: "copy",
        date: "2026-10-13",
      }),
    });
    renderWithProviders(<TodayScreen />);
    const upcoming = await screen.findByRole("region", { name: "Prossime lezioni" });
    await userEvent.click(
      await within(upcoming).findByRole("button", {
        name: "Azioni per la lezione di Luca Bianchi alle 15:00",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Ripeti la settimana dopo" }),
    );
    await waitFor(() =>
      expect(requests.find((r) => r.path === "/lessons/l-luca/duplicate")?.body).toEqual({
        date: "2026-10-13",
      }),
    );
    expect(
      await screen.findByText("Lezione programmata per mar 13 ott alle 15:00"),
    ).toBeInTheDocument();
    // Without Matita on this server the line says so, and the «+» opens the form.
    expect(screen.getByText(/Matita non è attiva su questo server/)).toBeInTheDocument();
  });

  it("desktop: after deleting an upcoming lesson the focus stays in «Prossime lezioni»", async () => {
    desktop();
    let deleted = false;
    mockApi({
      "GET /dashboard": () =>
        deleted ? dashboard({ upcoming: [ELENA] }) : dashboard({ upcoming: [LUCA_TODAY, ELENA] }),
      "GET /students/luca": { ...summary("luca", "Luca Bianchi", 4000), rates: [] },
      "GET /lessons/l-luca": LUCA_TODAY,
      "DELETE /lessons/l-luca": () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    renderWithProviders(<TodayScreen />);
    const upcoming = await screen.findByRole("region", { name: "Prossime lezioni" });
    await userEvent.click(
      await within(upcoming).findByRole("button", {
        name: "Azioni per la lezione di Luca Bianchi alle 15:00",
      }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Elimina" }));
    const confirm = await screen.findByRole("alertdialog");
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina lezione" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(within(upcoming).queryByText("Luca Bianchi")).toBeNull());
    // Not lost on <body> (WCAG 2.4.3): the lesson that took its place.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body), {
      timeout: 2000,
    });
    expect(within(upcoming).getByRole("link", { name: "Elena Greco" })).toHaveFocus();
  });
});
