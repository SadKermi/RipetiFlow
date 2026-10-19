// What the student's ledger shows (docs/design/03-schermate.md §5, 02 §9.6), as pure functions:
// the order of the rows, the rate-change rows from `student.rates`, the month window («Mostra
// agosto») with its carry-over row, and the «Ultimo pagamento… Da allora…» sentence.
import type { LedgerEntry, Rate } from "@/lib/api/types";
import { addDays, formatEuroAbs, formatMinutes, formatMonthYear, parseIsoDate } from "@/lib/format";
import { dayMonth, lessonsCount, previousRate } from "@/features/forms/money-words";

export type LedgerRow =
  | { type: "entry"; entry: LedgerEntry }
  | { type: "rate"; rate: Rate; previous: Rate }
  | { type: "carry"; date: string; balanceCents: number };

export interface LedgerView {
  rows: LedgerRow[];
  /** First day of the month «Mostra …» would reveal, or null when everything is shown. */
  nextHiddenMonth: string | null;
  /** How many entries are shown (0 = the ledger is a blank page). */
  shownEntries: number;
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function monthsBefore(date: string, months: number): string {
  const day = parseIsoDate(firstOfMonth(date));
  return day ? day.subtract({ months }).toString() : date;
}

/**
 * Display order: scheduled lessons first (not yet in the balance), then the rest, newest first
 * (the API already sends them newest first; the sort is stable).
 */
export function orderEntries(items: readonly LedgerEntry[]): LedgerEntry[] {
  return [...items].sort((a, b) => Number(a.settled) - Number(b.settled));
}

/** How many months (from the current one back) are needed to show the entry dated `date`. */
export function monthsToShow(date: string, today: string): number {
  const a = parseIsoDate(firstOfMonth(date));
  const b = parseIsoDate(firstOfMonth(today));
  if (!a || !b) return 1;
  const diff = (b.year - a.year) * 12 + (b.month - a.month);
  return Math.max(1, diff + 1);
}

/**
 * Rows of the ledger for the months on screen: by default the current month and the one before
 * (03 §5); `months` grows with «Mostra agosto». When the window holds no entry at all, it widens
 * to the most recent month that has one. Rate changes come from `student.rates`, below the rows of
 * the day they start from (they govern the lessons «da questa data»). The carry-over row («Riporto
 * al 31 ago») takes the running balance of the newest hidden entry.
 */
export function buildLedgerView(
  items: readonly LedgerEntry[],
  rates: readonly Rate[],
  { today, months }: { today: string; months: number },
): LedgerView {
  const ordered = orderEntries(items);
  let cutoff = monthsBefore(today, Math.max(1, months) - 1);
  const newestHidden = ordered.find((entry) => entry.date < cutoff);
  if (!ordered.some((entry) => entry.date >= cutoff) && newestHidden) {
    cutoff = firstOfMonth(newestHidden.date);
  }
  const shown = ordered.filter((entry) => entry.date >= cutoff);
  const hidden = ordered.filter((entry) => entry.date < cutoff);

  const changes = rates
    .map((rate) => ({ rate, previous: previousRate(rates, rate) }))
    .filter(
      (change): change is { rate: Rate; previous: Rate } =>
        change.previous !== null && change.rate.effective_from >= cutoff,
    )
    .sort((a, b) => (a.rate.effective_from < b.rate.effective_from ? 1 : -1));

  const rows: LedgerRow[] = [];
  let next = 0;
  for (const entry of shown) {
    while (next < changes.length && changes[next]!.rate.effective_from > entry.date) {
      rows.push({ type: "rate", ...changes[next]! });
      next += 1;
    }
    rows.push({ type: "entry", entry });
  }
  for (; next < changes.length; next += 1) rows.push({ type: "rate", ...changes[next]! });

  const carry = hidden[0];
  if (carry) {
    rows.push({
      type: "carry",
      date: addDays(cutoff, -1),
      balanceCents: carry.running_balance_cents,
    });
  }
  return {
    rows,
    nextHiddenMonth: carry ? firstOfMonth(addDays(cutoff, -1)) : null,
    shownEntries: shown.length,
  };
}

/** «Mostra agosto» (with the year when it is not the current one: «Mostra dicembre 2025»). */
export function showMonthLabel(month: string, today: string): string {
  const label = formatMonthYear(month);
  return `Mostra ${month.slice(0, 4) === today.slice(0, 4) ? label.replace(/\s\d{4}$/, "") : label}`;
}

const METHOD_PHRASE = {
  cash: "in contanti",
  bank_transfer: "con bonifico",
  other: "con un altro metodo",
} as const;

/**
 * «Ultimo pagamento 50,00 € il 2 ott, con bonifico. Da allora 1 lezione, 2 h (più 23,00 €
 * rimasti dopo il bonifico).» Computed from the ledger: the newest payment, then the lessons in
 * the balance after it (03 §5). Null when the ledger has nothing yet.
 */
export function lastPaymentSentence(items: readonly LedgerEntry[]): string | null {
  if (items.length === 0) return null;
  const index = items.findIndex((entry) => entry.kind === "payment");
  if (index === -1) return "Nessun pagamento registrato.";
  const payment = items[index]!;
  const method = payment.method
    ? payment.method === "other" && payment.note
      ? `con ${payment.note}`
      : METHOD_PHRASE[payment.method]
    : "";
  let sentence = `Ultimo pagamento ${formatEuroAbs(payment.credit_cents)} il ${dayMonth(payment.date)}${method ? `, ${method}` : ""}.`;
  const since = items.slice(0, index).filter((entry) => entry.kind === "lesson" && entry.settled);
  if (since.length > 0) {
    const minutes = since.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0);
    const after = payment.running_balance_cents;
    const noun = payment.method === "bank_transfer" ? "il bonifico" : "il pagamento";
    const left = after < 0 ? ` (più ${formatEuroAbs(after)} rimasti dopo ${noun})` : "";
    sentence += ` Da allora ${lessonsCount(since.length)}, ${formatMinutes(minutes)}${left}.`;
  }
  return sentence;
}
