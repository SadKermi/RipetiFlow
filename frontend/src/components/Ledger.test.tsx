import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/lib/api/types";
import { Button } from "./Button";
import {
  Ledger,
  LedgerCarryRow,
  LedgerDraftRow,
  LedgerEntryRow,
  LedgerRateRow,
  LedgerSlotRow,
} from "./Ledger";

const TODAY = "2026-10-06";

function lesson(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    kind: "lesson",
    id: "l-5ott",
    date: "2026-10-05",
    start_time: "17:00",
    end_time: "19:00",
    duration_minutes: 120,
    hourly_rate_cents: 2200,
    subject: { id: "fis", name: "Fisica" },
    topic: "moto rettilineo uniforme",
    method: null,
    note: null,
    debit_cents: 4400,
    credit_cents: 0,
    settled: true,
    running_balance_cents: -6700,
    calendar: { status: "synced", error: null },
    ...overrides,
  };
}

const SCHEDULED = lesson({
  id: "l-8ott",
  date: "2026-10-08",
  start_time: "15:00",
  end_time: "16:00",
  duration_minutes: 60,
  subject: { id: "mat", name: "Matematica" },
  topic: null,
  debit_cents: 2200,
  settled: false,
  running_balance_cents: -8900,
  calendar: { status: "pending", error: null },
});

const PAYMENT: LedgerEntry = {
  kind: "payment",
  id: "p-2ott",
  date: "2026-10-02",
  start_time: null,
  end_time: null,
  duration_minutes: null,
  hourly_rate_cents: null,
  subject: null,
  topic: null,
  method: "bank_transfer",
  note: null,
  debit_cents: 0,
  credit_cents: 5000,
  settled: true,
  running_balance_cents: -2300,
  calendar: null,
};

function renderLedger(children: React.ReactNode, layout: "table" | "list" = "table") {
  return render(
    <MemoryRouter>
      <Ledger caption="Registro di Giulia Ferri" layout={layout}>
        {children}
      </Ledger>
    </MemoryRouter>,
  );
}

describe("Ledger as a table (desktop)", () => {
  it("is a real table with caption and column headers", () => {
    renderLedger(<LedgerEntryRow entry={lesson()} today={TODAY} />);
    const table = screen.getByRole("table", { name: "Registro di Giulia Ferri" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Data", "Voce", "Durata", "Lezione", "Pagato", "Saldo"]);
    for (const th of within(table).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });

  it("a lesson in the balance: date, time, subject · topic, duration, amount, running balance", () => {
    renderLedger(<LedgerEntryRow entry={lesson()} today={TODAY} />);
    const cells = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("lun 5 ott17:00–19:00");
    expect(cells[1]).toHaveTextContent("Fisica · moto rettilineo uniforme");
    expect(cells[2]).toHaveTextContent("2 h");
    expect(cells[3]).toHaveTextContent("44,00");
    expect(cells[3]).not.toHaveTextContent("€"); // only Saldo and totals carry «€»
    expect(cells[4]).toBeEmptyDOMElement();
    expect(within(cells[5]!).getByText("deve 67 euro")).toBeInTheDocument();
    expect(cells[5]).toHaveTextContent("67,00 €");
  });

  it("a scheduled lesson says so, mutes its amount and leaves the balance empty", () => {
    renderLedger(<LedgerEntryRow entry={SCHEDULED} today={TODAY} timing="oggi · tra 40 min" />);
    const cells = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("Programmata · non ancora nel saldo");
    expect(within(cells[1]!).getByText("oggi · tra 40 min")).toHaveClass("marker");
    expect(within(cells[3]!).getByText("22,00")).toHaveClass("text-ink-3");
    expect(cells[5]).toBeEmptyDOMElement();
  });

  it("a payment goes in «Pagato» in credit blue, with its method", () => {
    renderLedger(<LedgerEntryRow entry={PAYMENT} today={TODAY} />);
    const cells = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("Pagamento · bonifico");
    expect(cells[3]).toBeEmptyDOMElement();
    expect(within(cells[4]!).getByText("50,00")).toHaveClass("text-credito");
    expect(cells[5]).toHaveTextContent("23,00 €");
  });

  it("shows the year only for another year", () => {
    renderLedger(<LedgerEntryRow entry={lesson({ date: "2025-09-29" })} today={TODAY} />);
    expect(screen.getAllByRole("cell")[0]).toHaveTextContent("lun 29 set 2025");
  });

  it("opens the row from its title and keeps hover actions reachable", async () => {
    const onOpen = vi.fn();
    renderLedger(
      <LedgerEntryRow
        entry={lesson()}
        today={TODAY}
        onOpen={onOpen}
        actions={
          <Button size="sm" variant="quiet">
            Modifica
          </Button>
        }
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Fisica · moto rettilineo uniforme" }),
    );
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Modifica" })).toBeInTheDocument();
  });

  it("a lesson not in Google Calendar shows the reason and the way to fix it", () => {
    renderLedger(
      <LedgerEntryRow
        entry={lesson({
          calendar: {
            status: "error",
            error: "Google Calendar non risponde. Nuovo tentativo automatico più tardi.",
          },
        })}
        today={TODAY}
      />,
    );
    expect(
      screen.getByText(/Google Calendar non risponde\. Nuovo tentativo automatico più tardi\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Risincronizza in Impostazioni" })).toHaveAttribute(
      "href",
      "/impostazioni",
    );
  });

  it("draft row: graphite and dashed, with warnings, the source sentence and the actions", () => {
    renderLedger(
      <LedgerDraftRow
        kind="lesson"
        date={TODAY}
        today={TODAY}
        startTime="16:30"
        endTime="18:00"
        durationMinutes={90}
        title="Matematica"
        detail="equazioni di secondo grado"
        amountCents={3300}
        balanceAfterCents={null}
        sourceText="oggi 16:30–18 mate, equazioni di 2° grado"
        warnings={["Data nel futuro: la lezione sarà programmata."]}
        actions={
          <>
            <Button variant="ink" size="sm">
              Ripassa a penna
            </Button>
            <Button variant="quiet" size="sm">
              Scarta
            </Button>
          </>
        }
      />,
    );
    const row = screen.getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("Matita propone: Matematica · equazioni di secondo grado");
    expect(row).toHaveTextContent("Bozza · programmata: non entra subito nel saldo");
    expect(row).toHaveTextContent("Data nel futuro: la lezione sarà programmata.");
    expect(row).toHaveTextContent("Matita ha letto: oggi 16:30–18 mate, equazioni di 2° grado");
    expect(row.querySelector(".before\\:pencil-draft")).not.toBeNull();
    expect(within(row).getByRole("button", { name: "Ripassa a penna" })).toBeInTheDocument();
  });

  it("a draft payment shows the balance it will give («sarà»)", () => {
    renderLedger(
      <LedgerDraftRow
        kind="payment"
        date={TODAY}
        today={TODAY}
        title="Pagamento"
        detail="contanti"
        amountCents={5000}
        balanceAfterCents={-1700}
        actions={null}
      />,
    );
    const speech = screen.getByText("sarà deve 17 euro");
    expect(speech).toBeInTheDocument();
    // Too long for the 136 px column: «sarà» wraps ABOVE «DEVE 17,00 €», so it reads in order.
    const visible = speech.parentElement!.querySelector("[aria-hidden]")!;
    expect(visible).toHaveClass("flex-row-reverse", "flex-wrap-reverse");
    expect(visible).toHaveTextContent("17,00 €devesarà");
  });

  it("a long balance («CREDITO 66,00 €») wraps under its amount instead of leaving the column", () => {
    renderLedger(<LedgerEntryRow entry={lesson({ running_balance_cents: 6600 })} today={TODAY} />);
    const saldo = screen.getAllByRole("cell")[5]!;
    expect(within(saldo).getByText("in credito di 66 euro")).toHaveClass("sr-only");
    const visible = saldo.querySelector("[aria-hidden]")!;
    // Amount first (it keeps the row's line, under the other amounts), the word wraps below it.
    expect(visible).toHaveClass("flex-row-reverse", "flex-wrap");
    expect(visible.firstElementChild).toHaveTextContent("66,00 €");
    expect(visible.lastElementChild).toHaveTextContent("credito");
  });

  it("rate change and carry-over rows", () => {
    renderLedger(
      <>
        <LedgerRateRow date="2026-10-01" today={TODAY} fromCents={2000} toCents={2200} />
        <LedgerCarryRow date="2026-09-27" today={TODAY} balanceCents={0} />
      </>,
    );
    expect(
      screen.getByText("Tariffa da 20,00 a 22,00 €/h per le lezioni da questa data"),
    ).toBeInTheDocument();
    const carry = screen.getByText("Riporto al 27 set").closest("tr")!;
    expect(carry).toHaveClass("rule-total");
    expect(within(carry).getAllByRole("cell")[2]).toHaveTextContent("in pari0,00 €");
  });
});

describe("Ledger as a list (mobile)", () => {
  it("is an ordered list with the date on two lines and the balance under the entry", () => {
    renderLedger(
      <>
        <LedgerSlotRow>
          <p>Riga di Matita</p>
        </LedgerSlotRow>
        <LedgerEntryRow entry={lesson()} today={TODAY} />
        <LedgerEntryRow entry={SCHEDULED} today={TODAY} />
      </>,
      "list",
    );
    const list = screen.getByRole("list", { name: "Registro di Giulia Ferri" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent("lun 5ott");
    expect(items[1]).toHaveTextContent("17:00–19:00");
    expect(items[1]).toHaveTextContent("deve 67 euro");
    expect(items[2]).toHaveTextContent("15:00–16:00 · Programmata · non ancora nel saldo");
    expect(items[2]).not.toHaveTextContent("deve");
  });
});
