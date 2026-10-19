import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALENDAR_OFF,
  CONFIG,
  PROFILE,
  demoStore,
  json,
  problem,
  renderRoutes,
  stubApi,
  type ApiRoutes,
  stubMatchMedia,
} from "@/features/landing/testing";
import type { Lesson } from "@/lib/api/types";
import { AgendaPage } from "./AgendaPage";

// The lesson form belongs to features/forms: here only what the agenda asks of it.
vi.mock("@/features/forms/LessonFormDialog", () => ({
  LessonFormDialog: ({ isOpen, initial }: { isOpen: boolean; initial?: object }) =>
    isOpen ? (
      <div role="dialog" aria-label="Nuova lezione">
        {JSON.stringify(initial)}
      </div>
    ) : null,
}));

// «Today» = martedì 6 ottobre 2026, 14:20 in Rome (03 «Dati d'esempio»).
const NOW = new Date("2026-10-06T12:20:00Z");

function lesson(
  partial: Partial<Lesson> & Pick<Lesson, "id" | "date" | "start_time" | "end_time">,
): Lesson {
  return {
    student: { id: "st-luca", display_name: "Luca Bianchi" },
    subject: { id: "lat", name: "Latino" },
    duration_minutes: 60,
    hourly_rate_cents: 2000,
    amount_cents: 2000,
    topic: null,
    notes: null,
    settled: false,
    calendar: { status: "off", error: null },
    created_at: "2026-10-01T10:00:00+00:00",
    updated_at: "2026-10-01T10:00:00+00:00",
    ...partial,
  };
}

const WEEK: Lesson[] = [
  lesson({
    id: "l-giulia",
    date: "2026-10-05",
    start_time: "17:00",
    end_time: "19:00",
    duration_minutes: 120,
    amount_cents: 4400,
    settled: true,
    student: { id: "st-giulia", display_name: "Giulia Ferri" },
    subject: { id: "fis", name: "Fisica" },
  }),
  lesson({ id: "l-luca", date: "2026-10-06", start_time: "15:00", end_time: "16:00" }),
  lesson({
    id: "l-elena",
    date: "2026-10-07",
    start_time: "15:00",
    end_time: "16:00",
    amount_cents: 2500,
    student: { id: "st-elena", display_name: "Elena Greco" },
    subject: { id: "ing", name: "Inglese" },
    calendar: { status: "error", error: "Google Calendar non risponde." },
  }),
];

function renderAgenda(path = "/agenda", routes: ApiRoutes = {}, config = CONFIG) {
  const calls = stubApi({
    "GET /me": PROFILE,
    "GET /lessons": (request: Request) => {
      const from = new URL(request.url).searchParams.get("from");
      return json({ items: from === "2026-10-05" ? WEEK : [] });
    },
    "GET /integrations/google-calendar": { ...CALENDAR_OFF, connected: true, status: "active" },
    ...routes,
  });
  const view = renderRoutes([{ path: "/agenda", element: <AgendaPage /> }], {
    path,
    store: demoStore({ config }),
  });
  return { calls, ...view };
}

const lessonRequests = (calls: ReturnType<typeof stubApi>) =>
  calls.filter((call) => call.path === "/lessons").map((call) => call.search);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Agenda · mobile (03 §6)", () => {
  it("asks for the current week Monday → Sunday and lists the days", async () => {
    const { calls } = renderAgenda("/agenda", {}, { ...CONFIG, calendar_sync_available: true });
    expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
    expect(screen.getByText("5–11 ottobre")).toBeVisible();
    expect(await screen.findByRole("link", { name: /Luca Bianchi/ })).toHaveAttribute(
      "href",
      "/studenti/st-luca?riga=l-luca",
    );
    expect(lessonRequests(calls)).toEqual(["?from=2026-10-05&to=2026-10-11"]);
    expect(screen.getByRole("heading", { level: 2, name: "martedì 6 ott · oggi" })).toBeVisible();
    expect(screen.getByText("tra 40 min")).toBeVisible();
    expect(screen.getByText("adesso")).toBeVisible();
    expect(screen.getAllByText("Nessuna lezione.")).toHaveLength(4);
    expect(screen.getByText("3 lezioni · 4 h · 89,00 €")).toBeVisible();
    expect(
      await screen.findByText(/Le lezioni sono anche nel calendario «RipetiFlow» di Google\./),
    ).toBeVisible();
  });

  it("without Calendar on the server: no note, no request about it", async () => {
    const { calls } = renderAgenda();
    await screen.findByRole("link", { name: /Luca Bianchi/ });
    expect(screen.queryByText(/calendario «RipetiFlow»/)).not.toBeInTheDocument();
    expect(calls.some((call) => call.path.includes("google-calendar"))).toBe(false);
  });

  it("the day strip says which days have lessons and jumps to them", async () => {
    renderAgenda();
    const strip = screen.getByRole("navigation", { name: "Giorni della settimana" });
    expect(
      await within(strip).findByRole("button", { name: "mercoledì 7 ottobre, 1 lezione" }),
    ).toBeVisible();
    const today = within(strip).getByRole("button", { name: "martedì 6 ottobre, oggi, 1 lezione" });
    await userEvent.click(within(strip).getByRole("button", { name: /^giovedì 8 ottobre/ }));
    expect(screen.getByRole("region", { name: "giovedì 8 ottobre" })).toHaveFocus();
    expect(today).toBeVisible();
  });

  it("moves between weeks through the URL; «Oggi» comes back", async () => {
    const { calls, router } = renderAgenda();
    await screen.findByRole("link", { name: /Luca Bianchi/ });
    await userEvent.click(screen.getByRole("button", { name: "Settimana successiva" }));
    expect(router.state.location.search).toBe("?settimana=2026-10-12");
    expect(screen.getByText("12–18 ottobre")).toBeVisible();
    expect(await screen.findByText("Nessuna lezione questa settimana.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Lezione" }));
    expect(screen.getByRole("dialog", { name: "Nuova lezione" })).toHaveTextContent(
      '{"date":"2026-10-12"}',
    );

    await userEvent.click(screen.getByRole("button", { name: "Vai alla settimana di oggi" }));
    expect(router.state.location.search).toBe("");
    expect(await screen.findByRole("link", { name: /Luca Bianchi/ })).toBeVisible();
    expect(lessonRequests(calls)).toContain("?from=2026-10-12&to=2026-10-18");
  });

  it("opens the week in the URL", async () => {
    const { calls } = renderAgenda("/agenda?settimana=2026-09-30");
    expect(screen.getByText("28 settembre – 4 ottobre")).toBeVisible();
    await waitFor(() => expect(lessonRequests(calls)).toEqual(["?from=2026-09-28&to=2026-10-04"]));
  });

  it("a failed load shows the band with «Riprova»", async () => {
    renderAgenda("/agenda", { "GET /lessons": problem(500, "Errore interno.") });
    expect(await screen.findByText("Non riesco a caricare i dati.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeVisible();
  });
});

describe("Agenda · desktop (03 §6)", () => {
  beforeEach(() => {
    stubMatchMedia((query) => query === "(min-width: 64rem)");
  });

  it("draws one column per day with the lessons as links", async () => {
    renderAgenda();
    expect(screen.getByText("5–11 ottobre 2026")).toBeVisible();
    const tuesday = screen.getByRole("region", { name: "martedì 6 ottobre, oggi" });
    expect(await within(tuesday).findByRole("link", { name: /Luca Bianchi/ })).toHaveAttribute(
      "href",
      "/studenti/st-luca?riga=l-luca",
    );
    expect(screen.getByText("3 lezioni · 4 h · 89,00 €")).toBeVisible();
    expect(screen.getAllByRole("region")).toHaveLength(7);
    const wednesday = screen.getByRole("region", { name: "mercoledì 7 ottobre" });
    expect(within(wednesday).getByRole("link", { name: /non è in Google Calendar/ })).toBeVisible();
    expect(screen.getByText("14:20")).toBeVisible();
  });

  it("an empty slot opens a new lesson at that quarter hour", async () => {
    renderAgenda();
    await screen.findByRole("link", { name: /Luca Bianchi/ });
    const slot = screen.getByRole("button", { name: "Nuova lezione giovedì 8 ottobre" });
    vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      right: 100,
      bottom: 784,
      width: 100,
      height: 784,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    // 7:00 + 470 px / (56 px per hour) ≈ 15:23 → 15:15.
    await userEvent.pointer({
      keys: "[MouseLeft]",
      target: slot,
      coords: { clientX: 10, clientY: 470 },
    });
    expect(screen.getByRole("dialog", { name: "Nuova lezione" })).toHaveTextContent(
      '{"date":"2026-10-08","start_time":"15:15"}',
    );
  });
});
