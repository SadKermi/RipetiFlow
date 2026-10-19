// Sentences of the destructive confirmations (docs/design/03-schermate.md §7.5): the effect with
// the real numbers, never «Sei sicuro?» alone.
import type { Student } from "@/lib/api/types";
import { formatEuro, formatEuroAbs } from "@/lib/format";
import { balanceWords } from "./money-words";

/** What the delete dialog needs to know about a lesson (from the ledger, Oggi or the edit form). */
export interface LessonToDelete {
  id: string;
  studentId: string;
  date: string;
  amountCents: number;
  settled: boolean;
  /** The lesson is (or is being put) in Google Calendar: «L'evento sparisce da Google Calendar.» */
  inCalendar: boolean;
}

export interface PaymentToDelete {
  id: string;
  studentId: string;
  date: string;
  amountCents: number;
  method: "cash" | "bank_transfer" | "other";
  note: string | null;
}

/** «Il saldo passa da deve 67,00 € a deve 23,00 €.» / «Il saldo non cambia; il previsto passa…». */
export function lessonDeleteEffect(
  lesson: Pick<LessonToDelete, "amountCents" | "settled" | "inCalendar">,
  balance: { balance_cents: number; projected_balance_cents: number } | null,
): string {
  const calendar = lesson.inCalendar ? " L'evento sparisce da Google Calendar." : "";
  if (lesson.settled) {
    const change = balance
      ? `Il saldo passa da ${balanceWords(balance.balance_cents)} a ${balanceWords(balance.balance_cents + lesson.amountCents)}.`
      : `Il saldo cambia di ${formatEuro(lesson.amountCents)}.`;
    return `${change} Resta traccia nello storico modifiche.${calendar}`;
  }
  const projected = balance
    ? `; il previsto passa da ${balanceWords(balance.projected_balance_cents)} a ${balanceWords(balance.projected_balance_cents + lesson.amountCents)}.`
    : ".";
  return `Il saldo non cambia${projected}${calendar}`;
}

/** «Il saldo passa da deve 67,00 € a deve 117,00 €.» */
export function paymentDeleteEffect(amountCents: number, balanceCents: number | null): string {
  if (balanceCents === null) return `Il saldo cambia di ${formatEuro(amountCents)}.`;
  return `Il saldo passa da ${balanceWords(balanceCents)} a ${balanceWords(balanceCents - amountCents)}.`;
}

/** «Marco ti deve ancora 120,00 €. Resterà in «Conti aperti» finché il saldo non torna in pari.» */
export function archiveEffect(student: Pick<Student, "first_name" | "balance">): string {
  const cents = student.balance.balance_cents;
  const stays = "Resterà in «Conti aperti» finché il saldo non torna in pari.";
  if (cents < 0) return `${student.first_name} ti deve ancora ${formatEuroAbs(cents)}. ${stays}`;
  if (cents > 0) {
    return `${student.first_name} ha ancora ${formatEuroAbs(cents)} di credito. ${stays}`;
  }
  return "Non comparirà più nelle liste. Il registro resta e si può ripristinare.";
}
