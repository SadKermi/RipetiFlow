import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOW,
  SUBJECTS,
  type RecordedRequest,
  mockApi,
  problem,
  renderWithProviders,
  summary,
} from "@/features/forms/test-utils";
import { StudentsScreen } from "./StudentsScreen";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const ACTIVE = [
  summary("marco", "Marco Rossi", -12000, {
    grade: "2ª liceo classico",
    next_lesson: { date: "2026-10-07", start_time: "16:00" },
  }),
  summary("giulia", "Giulia Ferri", -6700, { grade: "3ª liceo scientifico" }),
  summary("sara", "Sara Conti", 0, { last_lesson_date: "2026-09-28" }),
  summary("luca", "Luca Bianchi", 4000, {
    grade: "4ª liceo classico",
    next_lesson: { date: "2026-10-06", start_time: "15:00" },
  }),
];
ACTIVE[3]!.balance.credit_minutes = 120;
const ARCHIVED = [summary("old", "Paolo Verdi", 0, { archived: true })];

/** GET /students: the archived list, or the active one filtered by `q` like the API. */
function studentsRoute() {
  return (recorded: RecordedRequest) => {
    if (recorded.url.searchParams.get("archived") === "true") return { items: ARCHIVED };
    const q = recorded.url.searchParams.get("q")?.toLowerCase();
    return {
      items: q ? ACTIVE.filter((s) => s.display_name.toLowerCase().includes(q)) : ACTIVE,
    };
  };
}

describe("StudentsScreen", () => {
  it("lists the active students with class, next lesson and balance in words", async () => {
    const requests = mockApi({ "GET /students": studentsRoute() });
    renderWithProviders(<StudentsScreen />);
    expect(screen.getByRole("heading", { name: "Studenti" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Studenti" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/studenti/marco",
      "/studenti/giulia",
      "/studenti/sara",
      "/studenti/luca",
    ]);
    expect(rows[0]).toHaveAccessibleDescription(
      /2ª liceo classico · prossima mer 7 ott, 16:00 ti deve 120 euro/,
    );
    expect(rows[3]).toHaveAccessibleDescription(/oggi 15:00 in credito di 40 euro, circa 2 h/);
    expect(screen.getByText("4 attivi")).toBeInTheDocument();
    const listRequest = requests.find((r) => r.url.searchParams.get("archived") === "false");
    expect(listRequest?.url.searchParams.get("sort")).toBe("balance");
  });

  it("filters on the balance and says when nobody matches", async () => {
    mockApi({ "GET /students": studentsRoute() });
    renderWithProviders(<StudentsScreen />);
    await screen.findByRole("list", { name: "Studenti" });
    const filter = screen.getByRole("radiogroup", { name: "Filtra per saldo" });
    await userEvent.click(within(filter).getByRole("radio", { name: "Ti devono" }));
    expect(
      within(screen.getByRole("list", { name: "Studenti" })).getAllByRole("link"),
    ).toHaveLength(2);
    await userEvent.click(within(filter).getByRole("radio", { name: "In credito" }));
    expect(
      within(screen.getByRole("list", { name: "Studenti" })).getAllByRole("link"),
    ).toHaveLength(1);
  });

  it("with nobody in credit the filter says so", async () => {
    mockApi({ "GET /students": { items: ACTIVE.slice(0, 2) } });
    renderWithProviders(<StudentsScreen />);
    await screen.findByRole("list", { name: "Studenti" });
    await userEvent.click(screen.getByRole("radio", { name: "In credito" }));
    expect(screen.getByText("Nessuno è in credito.")).toBeInTheDocument();
  });

  it("searches with q after a pause and offers to add the missing student", async () => {
    const requests = mockApi({
      "GET /students": studentsRoute(),
      "GET /subjects": { items: SUBJECTS },
    });
    renderWithProviders(<StudentsScreen />);
    await screen.findByRole("list", { name: "Studenti" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca per nome" }), "Giovanni");
    expect(
      await screen.findByText("Nessuno studente con “Giovanni” nel nome."),
    ).toBeInTheDocument();
    const searched = requests.filter((r) => r.url.searchParams.get("q") !== null);
    // Debounced: one request for the whole word, not one per letter.
    expect(searched.map((r) => r.url.searchParams.get("q"))).toEqual(["Giovanni"]);

    await userEvent.click(screen.getByRole("button", { name: "Aggiungi Giovanni come studente" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("textbox", { name: "Nome" })[0]).toHaveValue("Giovanni");
  });

  it("an empty register invites to add the first student", async () => {
    mockApi({ "GET /students": { items: [] }, "GET /subjects": { items: SUBJECTS } });
    renderWithProviders(<StudentsScreen />);
    expect(
      await screen.findByText("Nessuno studente. Inizia dal primo: nome e tariffa bastano."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archiviati/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi studente" }));
    expect(await screen.findByRole("heading", { name: "Nuovo studente" })).toBeInTheDocument();
  });

  it("archived students are in a closed section", async () => {
    mockApi({ "GET /students": studentsRoute() });
    renderWithProviders(<StudentsScreen />);
    const toggle = await screen.findByRole("button", { name: "Archiviati (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Paolo Verdi" })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole("link", { name: "Paolo Verdi" })).toHaveAttribute(
      "href",
      "/studenti/old",
    );
  });

  it("desktop: a table with class, next lesson, rate and balance; sortable by name", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: !query.includes("max-width"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const requests = mockApi({ "GET /students": studentsRoute() });
    renderWithProviders(<StudentsScreen />);
    const table = await screen.findByRole("table", { name: "Studenti attivi" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Nome", "Classe", "Prossima", "Tariffa", "Saldo"]);
    const marco = within(table).getByRole("link", { name: "Marco Rossi" }).closest("tr")!;
    expect(marco).toHaveTextContent(/2ª liceo classico.*mer 7 ott 16:00.*22,00/);
    expect(within(table).getByRole("link", { name: "Sara Conti" }).closest("tr")).toHaveTextContent(
      "ultima lun 28 set",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Studenti · 4 attivi");

    await userEvent.click(screen.getByRole("button", { name: /Ordina/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Nome" }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.url.searchParams.get("archived") === "false" &&
            r.url.searchParams.get("sort") === "name",
        ),
      ).toBe(true),
    );
  });

  it("a failed load shows the band with «Riprova»", async () => {
    mockApi({ "GET /students": problem(500, "Errore interno.") });
    renderWithProviders(<StudentsScreen />);
    expect(await screen.findByText(/Non riesco a caricare i dati\./)).toBeInTheDocument();
    mockApi({ "GET /students": studentsRoute() });
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(screen.getByRole("list", { name: "Studenti" })).toBeInTheDocument());
  });
});
