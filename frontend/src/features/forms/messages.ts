// Toast texts after a write (docs/design/03-schermate.md §7, 02 §9.11).
import type { Lesson } from "@/lib/api/types";
import { formatEuro } from "@/lib/format";
import { formatShortDate } from "@/components/utils";
import { dayMonth, formatRate } from "./money-words";

/**
 * «Lezione registrata · nel saldo» (already over) / «Lezione programmata per mar 6 ott alle
 * 16:30». `forStudent` names the student when the lesson is not the one on screen.
 */
export function lessonSavedMessage(lesson: Lesson, today: string, forStudent?: string): string {
  const who = forStudent ? ` di ${forStudent}` : "";
  if (lesson.settled) return `Lezione${who} registrata · nel saldo`;
  return `Lezione${who} programmata per ${formatShortDate(lesson.date, today)} alle ${lesson.start_time.slice(0, 5)}`;
}

/** «Pagamento di 67,00 € registrato». */
export function paymentSavedMessage(amountCents: number): string {
  return `Pagamento di ${formatEuro(amountCents)} registrato`;
}

/** «Tariffa di 24,00 €/h dal 5 ott salvata · 2 lezioni ricalcolate». */
export function rateSavedMessage(rateCents: number, from: string, repriced: number): string {
  const tail =
    repriced === 0
      ? "nessuna lezione ricalcolata"
      : repriced === 1
        ? "1 lezione ricalcolata"
        : `${String(repriced)} lezioni ricalcolate`;
  return `Tariffa di ${formatRate(rateCents)} dal ${dayMonth(from)} salvata · ${tail}`;
}
