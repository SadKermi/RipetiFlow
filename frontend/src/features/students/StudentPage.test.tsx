import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerLineProps } from "@/components/shell/matita-slot";
import {
  NOW,
  SUBJECTS,
  TEST_CONFIG,
  balance,
  giulia,
  giuliaLedger,
  lesson,
  mockApi,
  problem,
  renderWithProviders,
  summary,
} from "@/features/forms/test-utils";
import { StudentPage } from "./StudentPage";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Desktop (≥ 1024 px): aside + ledger table. jsdom has no matchMedia: the default is mobile. */
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

function routes(overrides: Record<string, unknown> = {}) {
  const student = giulia();
  return {
    "GET /students/giulia": student,
    "GET /students/giulia/ledger": { items: giuliaLedger(), balance: student.balance },
    "GET /subjects": { items: SUBJECTS },
    "GET /students": { items: [summary("giulia", "Giulia Ferri", -6700)] },
    ...overrides,
  };
}

describe("StudentPage", () => {
  it("shows name, balance in words, last payment, projected and the ledger (mobile)", async () => {
    mockApi(routes());
    renderWithProviders(<StudentPage id="giulia" />);
    expect(await screen.findByRole("heading", { name: "Giulia Ferri" })).toBeInTheDocument();
    expect(screen.getByText("3ª liceo scientifico · Liceo Galilei")).toBeInTheDocument();
    expect(screen.getByText("Materia abituale: Matematica")).toBeInTheDocument();
    expect(screen.getByText("Saldo al 6 ottobre")).toBeInTheDocument();
    expect(screen.getByText("ti deve 67 euro")).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Ultimo pagamento 50,00\s€ il 2 ott, con bonifico\. Da allora 1 lezione, 2 h \(più 23,00\s€ rimasti dopo il bonifico\)\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Previsto con le lezioni programmate:/)).toHaveTextContent(
      /deve 89,00\s€/,
    );

    // jsdom has no matchMedia: the ledger falls back to its table (the list is below 760 px).
    const ledger = screen.getByRole("table", { name: "Registro di Giulia Ferri" });
    expect(within(ledger).getByText(/Programmata · non ancora nel saldo/)).toBeInTheDocument();
    expect(
      within(ledger).getByText(/Tariffa da 20,00 a 22,00 €\/h per le lezioni da questa data/),
    ).toBeInTheDocument();
    // Without Matita on this server: the note and the «+» for the form.
    expect(within(ledger).getByText(/Matita non è attiva su questo server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeInTheDocument();
    // Rate, contacts and notes are folded at the bottom on mobile.
    const details = screen.getByRole("button", { name: "Tariffa · Contatti · Note" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(details);
    expect(screen.getByRole("button", { name: "Cambia tariffa…" })).toBeInTheDocument();
  });

  it("an unknown student: «Studente non trovato» and the way back", async () => {
    mockApi(
      routes({
        "GET /students/giulia": problem(404, "Studente non trovato."),
        "GET /students/giulia/ledger": problem(404, "Studente non trovato."),
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    expect(
      await screen.findByRole("heading", { name: "Studente non trovato" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Forse è stato eliminato, o il link è di un altro account."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Torna agli studenti" })).toHaveAttribute(
      "href",
      "/studenti",
    );
  });

  it("a credit is also said in time; an empty ledger is a blank page", async () => {
    const credit = giulia({
      balance: balance(4000, { credit_minutes: 120, current_hourly_rate_cents: 2000 }),
    });
    mockApi(
      routes({
        "GET /students/giulia": credit,
        "GET /students/giulia/ledger": { items: [], balance: credit.balance },
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    expect(await screen.findByText("in credito di 40 euro, circa 2 h")).toBeInTheDocument();
    expect(screen.getByText(/Circa 2 h di lezione a 20,00\s€\/h\./)).toBeInTheDocument();
    expect(screen.queryByText(/Previsto/)).not.toBeInTheDocument();
    expect(
      await screen.findByText("Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo."),
    ).toBeInTheDocument();
  });

  it("«Pagamento» opens the form with the debt suggested; N opens a new lesson", async () => {
    mockApi(routes());
    renderWithProviders(<StudentPage id="giulia" />);
    await screen.findByRole("heading", { name: "Giulia Ferri" });
    await userEvent.click(screen.getByRole("button", { name: "Pagamento" }));
    const payment = await screen.findByRole("dialog");
    expect(
      within(payment).getByRole("heading", { name: "Pagamento ricevuto" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(payment).getByRole("textbox", { name: /Importo/ })).toHaveValue("67,00"),
    );
    await userEvent.click(within(payment).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.keyboard("n");
    expect(await screen.findByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
  });

  it("an archived student has the band with «Ripristina»", async () => {
    const requests = mockApi(
      routes({
        "GET /students/giulia": giulia({ archived: true }),
        "POST /students/giulia/unarchive": giulia(),
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    expect(await screen.findByText(/Archiviato: non compare nelle liste\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ripristina" }));
    await waitFor(() =>
      expect(requests.some((r) => r.path === "/students/giulia/unarchive")).toBe(true),
    );
    expect(await screen.findByText("Scheda di Giulia Ferri ripristinata")).toBeInTheDocument();
  });

  it("archiving with an open balance asks first and says what it means", async () => {
    const requests = mockApi(
      routes({ "POST /students/giulia/archive": giulia({ archived: true }) }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    await screen.findByRole("heading", { name: "Giulia Ferri" });
    await userEvent.click(screen.getByRole("button", { name: "Altre azioni per Giulia Ferri" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Archivia" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Archiviare Giulia Ferri?" });
    expect(
      within(dialog).getByText(
        /Giulia ti deve ancora 67,00\s€\. Resterà in «Conti aperti» finché il saldo non torna in pari\./,
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Archivia" }));
    await waitFor(() =>
      expect(requests.some((r) => r.path === "/students/giulia/archive")).toBe(true),
    );
  });

  it("desktop: aside + table; a row's menu deletes a payment with the effect on the balance", async () => {
    desktop();
    const requests = mockApi(
      routes({ "DELETE /payments/p-2ott": new Response(null, { status: 204 }) }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    const table = await screen.findByRole("table", { name: "Registro di Giulia Ferri" });
    expect(screen.getByRole("complementary", { name: "Scheda" })).toBeInTheDocument();
    await userEvent.click(
      within(table).getByRole("button", { name: "Azioni per il pagamento del ven 2 ott" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Elimina" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: /Eliminare il pagamento di 50,00\s€ del 2 ott\?/,
    });
    expect(
      within(dialog).getByText(/Il saldo passa da deve 67,00\s€ a deve 117,00\s€\./),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina pagamento" }));
    await waitFor(() => expect(requests.some((r) => r.method === "DELETE")).toBe(true));
    expect(await screen.findByText("Pagamento eliminato")).toBeInTheDocument();
  });

  it("after deleting a row the focus stays in the ledger, on the row that took its place", async () => {
    desktop();
    let deleted = false;
    const student = giulia();
    mockApi(
      routes({
        "GET /students/giulia/ledger": () => ({
          items: giuliaLedger().filter((entry) => !(deleted && entry.id === "p-2ott")),
          balance: student.balance,
        }),
        "DELETE /payments/p-2ott": () => {
          deleted = true;
          return new Response(null, { status: 204 });
        },
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    const table = await screen.findByRole("table", { name: "Registro di Giulia Ferri" });
    await userEvent.click(
      within(table).getByRole("button", { name: "Azioni per il pagamento del ven 2 ott" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Elimina" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina pagamento" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(within(table).queryByText("Pagamento")).toBeNull());
    // Not lost on <body> (WCAG 2.4.3): the row below the deleted one, «Fisica» of 1 ott.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body), {
      timeout: 2000,
    });
    expect(
      within(table).getByRole("button", { name: /^Fisica · vettori e componenti/ }),
    ).toHaveFocus();
  });

  it("deleting from the row's sheet keeps the focus in the ledger too", async () => {
    desktop();
    let deleted = false;
    const student = giulia();
    mockApi(
      routes({
        "GET /students/giulia/ledger": () => ({
          items: giuliaLedger().filter((entry) => !(deleted && entry.id === "l-1ott")),
          balance: student.balance,
        }),
        "GET /lessons/l-1ott": lesson({
          id: "l-1ott",
          date: "2026-10-01",
          start_time: "16:00",
          end_time: "17:30",
          topic: "vettori e componenti",
        }),
        "DELETE /lessons/l-1ott": () => {
          deleted = true;
          return new Response(null, { status: 204 });
        },
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    const table = await screen.findByRole("table", { name: "Registro di Giulia Ferri" });
    await userEvent.click(
      within(table).getByRole("button", { name: /^Fisica · vettori e componenti/ }),
    );
    await screen.findByRole("textbox", { name: /Argomento/ });
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    const confirm = await screen.findByRole("alertdialog");
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina lezione" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(table).queryByText("vettori e componenti")).toBeNull());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body), {
      timeout: 2000,
    });
    expect(table.contains(document.activeElement)).toBe(true);
  });

  it("after deleting a rate the focus goes to «Cambia tariffa…», not to the page", async () => {
    desktop();
    let deleted = false;
    const student = giulia();
    mockApi(
      routes({
        "GET /students/giulia": () =>
          deleted ? giulia({ rates: student.rates.filter((rate) => rate.id !== "r2") }) : student,
        "DELETE /students/giulia/rates/r2": () => {
          deleted = true;
          return new Response(null, { status: 204 });
        },
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    const aside = await screen.findByRole("complementary", { name: "Scheda" });
    await userEvent.click(
      await within(aside).findByRole("button", { name: "Azioni per la tariffa dal 1 ott 2026" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Elimina tariffa" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Lascia le lezioni come sono" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina tariffa" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() =>
      expect(within(aside).queryByRole("button", { name: /Azioni per la tariffa/ })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).not.toBe(document.body), {
      timeout: 2000,
    });
    expect(within(aside).getByRole("button", { name: "Cambia tariffa…" })).toHaveFocus();
  });

  it("«Promemoria» from Oggi (?promemoria=1) asks once: a reload does not ask again", async () => {
    const prompts: string[] = [];
    function FakeLine(props: LedgerLineProps) {
      if (props.prompt && !prompts.includes(String(props.prompt.nonce))) {
        prompts.push(String(props.prompt.nonce));
      }
      return <li>{props.prompt?.text}</li>;
    }
    mockApi(routes());
    const { router } = renderWithProviders(<StudentPage id="giulia" />, {
      path: "/studenti/giulia?riga=l-5ott&promemoria=1",
      config: { ...TEST_CONFIG, assistant_available: true },
      slots: { LedgerLine: FakeLine },
    });
    expect(await screen.findByText("scrivi un promemoria di pagamento")).toBeInTheDocument();
    expect(prompts).toHaveLength(1);
    // The request is spent: the address no longer carries it (a reload, Back/Forward).
    await waitFor(() => expect(router.state.location.search).toBe("?riga=l-5ott"));
    expect(router.state.location.pathname).toBe("/studenti/giulia");
  });

  it("Matita's line gets the student and «Promemoria» sends it a request", async () => {
    const seen: LedgerLineProps[] = [];
    function FakeLine(props: LedgerLineProps) {
      seen.push(props);
      return (
        <li>
          <button type="button" onClick={() => props.openPaymentForm({ amount_cents: 5000 })}>
            Modifica bozza
          </button>
          <output>{props.prompt?.text}</output>
        </li>
      );
    }
    mockApi(routes());
    renderWithProviders(<StudentPage id="giulia" />, {
      config: { ...TEST_CONFIG, assistant_available: true },
      slots: { LedgerLine: FakeLine },
    });
    await screen.findByRole("button", { name: "Modifica bozza" });
    expect(seen.at(-1)).toMatchObject({
      student: { id: "giulia", first_name: "Giulia" },
      balanceCents: -6700,
      today: "2026-10-06",
      prompt: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Promemoria" }));
    expect(
      screen.getByText("scrivi un promemoria di pagamento per Anna Ferri"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Modifica bozza" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: /Importo/ })).toHaveValue("50,00");
  });
});

describe("Storico modifiche", () => {
  it("lists the changes by day, pages with «Mostra altre» and opens the details", async () => {
    const requests = mockApi(
      routes({
        "GET /students/giulia/activity": (request: { url: URL }) =>
          request.url.searchParams.get("before")
            ? {
                items: [
                  {
                    id: "a3",
                    entity: "payment",
                    entity_id: "p",
                    action: "insert",
                    source: "app",
                    occurred_at: "2026-10-02T16:40:00Z",
                    summary: "Pagamento di 50,00 € del 02/10 registrato (Bonifico)",
                    changes: [],
                  },
                ],
                next_cursor: null,
              }
            : {
                items: [
                  {
                    id: "a1",
                    entity: "lesson",
                    entity_id: "l",
                    action: "insert",
                    source: "assistant",
                    occurred_at: "2026-10-06T12:31:00Z",
                    summary: "Lezione del 06/10 registrata (16:30–18:00, 33,00 €)",
                    changes: [],
                  },
                  {
                    id: "a2",
                    entity: "lesson",
                    entity_id: "l",
                    action: "update",
                    source: "app",
                    occurred_at: "2026-10-05T17:12:00Z",
                    summary: "Lezione del 05/10 modificata: fine 18:30 → 19:00",
                    changes: [{ field: "end_time", before: "18:30", after: "19:00" }],
                  },
                ],
                next_cursor: "c1",
              },
      }),
    );
    renderWithProviders(<StudentPage id="giulia" />);
    await screen.findByRole("heading", { name: "Giulia Ferri" });
    await userEvent.click(screen.getByRole("button", { name: "Altre azioni per Giulia Ferri" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Storico modifiche" }));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Storico modifiche" })).toBeInTheDocument();
    const today = await within(sheet).findByRole("region", { name: "oggi" });
    expect(within(today).getByText("14:31")).toBeInTheDocument();
    expect(within(today).getByText("da Matita")).toBeInTheDocument();
    const yesterday = within(sheet).getByRole("region", { name: "ieri" });
    expect(
      within(yesterday).getByText(/Lezione del 05\/10 modificata: fine 18:30/),
    ).toBeInTheDocument();
    const details = within(yesterday).getByRole("button", { name: "Dettagli" });
    await userEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(within(yesterday).getByText("fine")).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: "Mostra altre" }));
    expect(await within(sheet).findByRole("region", { name: "ven 2 ott" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Mostra altre" })).not.toBeInTheDocument();
    expect(
      requests
        .filter((r) => r.path === "/students/giulia/activity")
        .map((r) => r.url.searchParams.get("before")),
    ).toEqual([null, "c1"]);
  });

  it("no changes yet", async () => {
    mockApi(routes({ "GET /students/giulia/activity": { items: [], next_cursor: null } }));
    renderWithProviders(<StudentPage id="giulia" />);
    await screen.findByRole("heading", { name: "Giulia Ferri" });
    await userEvent.click(screen.getByRole("button", { name: "Altre azioni per Giulia Ferri" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Storico modifiche" }));
    expect(await screen.findByText("Nessuna modifica registrata.")).toBeInTheDocument();
  });
});
