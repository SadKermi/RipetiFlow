// The payment form's data (docs/design/03-schermate.md §7.2) as pure functions.
import type { Payment, PaymentCreate, PaymentMethod, PaymentPatch } from "@/lib/api/types";
import { formatCreditMinutesText, formatEuro, formatEuroAbs, parseIsoDate } from "@/lib/format";
import type { ProblemMapping } from "@/lib/forms";
import { creditMinutesAt, formatRate } from "./money-words";

export type PaymentField = "student" | "amount" | "method" | "date" | "note";

export const PAYMENT_FIELDS: readonly PaymentField[] = [
  "student",
  "amount",
  "method",
  "date",
  "note",
];

export const PAYMENT_PROBLEM_MAPPING: ProblemMapping<PaymentField> = {
  fields: PAYMENT_FIELDS,
  map: {
    student_id: "student",
    amount_cents: "amount",
    paid_on: "date",
    method: "method",
    note: "note",
  },
};

export const NOTE_MAX = 500;
/** Server limits: from 0,01 € to 100.000,00 €. */
export const MIN_PAYMENT_CENTS = 1;
export const MAX_PAYMENT_CENTS = 10_000_000;

export const PAYMENT_MESSAGES = {
  student: "Scegli chi ha pagato.",
  amount: "Scrivi l'importo ricevuto, per esempio 50,00.",
  range: "L'importo deve essere compreso tra 0,01 € e 100.000,00 €.",
  date: "Scegli il giorno.",
} as const;

export interface PaymentInitial {
  student_id?: string | null;
  amount_cents?: number | null;
  paid_on?: string;
  method?: PaymentMethod;
  note?: string | null;
}

export interface PaymentValues {
  studentId: string | null;
  amountCents: number | null;
  /** Whether the amount was written (by the tutor or the caller): the debt is suggested otherwise. */
  amountSet: boolean;
  method: PaymentMethod;
  date: string;
  note: string;
}

export function newPaymentValues(initial: PaymentInitial, today: string): PaymentValues {
  const amount = initial.amount_cents ?? null;
  return {
    studentId: initial.student_id ?? null,
    amountCents: amount,
    amountSet: amount !== null,
    method: initial.method ?? "cash",
    date: initial.paid_on ?? today,
    note: initial.note ?? "",
  };
}

export function paymentToValues(payment: Payment): PaymentValues {
  return {
    studentId: payment.student.id,
    amountCents: payment.amount_cents,
    amountSet: true,
    method: payment.method,
    date: payment.paid_on,
    note: payment.note ?? "",
  };
}

export function checkPayment(values: PaymentValues): Partial<Record<PaymentField, string>> {
  const errors: Partial<Record<PaymentField, string>> = {};
  if (!values.studentId) errors.student = PAYMENT_MESSAGES.student;
  if (values.amountCents === null) errors.amount = PAYMENT_MESSAGES.amount;
  else if (values.amountCents < MIN_PAYMENT_CENTS || values.amountCents > MAX_PAYMENT_CENTS) {
    errors.amount = PAYMENT_MESSAGES.range;
  }
  if (!parseIsoDate(values.date)) errors.date = PAYMENT_MESSAGES.date;
  return errors;
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

export function paymentCreateBody(values: PaymentValues): PaymentCreate {
  return {
    student_id: values.studentId ?? "",
    amount_cents: values.amountCents ?? 0,
    paid_on: values.date,
    method: values.method,
    note: textOrNull(values.note),
  };
}

export function paymentPatchBody(values: PaymentValues, original: Payment): PaymentPatch {
  const patch: PaymentPatch = {};
  if (values.studentId && values.studentId !== original.student.id) {
    patch.student_id = values.studentId;
  }
  if (values.amountCents !== null && values.amountCents !== original.amount_cents) {
    patch.amount_cents = values.amountCents;
  }
  if (values.date !== original.paid_on) patch.paid_on = values.date;
  if (values.method !== original.method) patch.method = values.method;
  const note = textOrNull(values.note);
  if (note !== (original.note ?? null)) patch.note = note;
  return patch;
}

export function paymentUndoPatch(patch: PaymentPatch, original: Payment): PaymentPatch {
  const undo: PaymentPatch = {};
  if ("student_id" in patch) undo.student_id = original.student.id;
  if ("amount_cents" in patch) undo.amount_cents = original.amount_cents;
  if ("paid_on" in patch) undo.paid_on = original.paid_on;
  if ("method" in patch) undo.method = original.method;
  if ("note" in patch) undo.note = original.note;
  return undo;
}

export function paymentValuesDiffer(a: PaymentValues, b: PaymentValues): boolean {
  return (
    a.studentId !== b.studentId ||
    a.amountCents !== b.amountCents ||
    a.method !== b.method ||
    a.date !== b.date ||
    a.note !== b.note
  );
}

/**
 * The student's balance once the payment is saved: balance + amount (negative = owes). When
 * editing a payment of the same student, its old amount is taken out first.
 */
export function balanceAfterPayment(
  balanceCents: number,
  amountCents: number,
  previousAmountCents = 0,
): number {
  return balanceCents - previousAmountCents + amountCents;
}

/**
 * Non-blocking warning for a very high amount (03 §7.2): more than 3 times the debt, or more than
 * 10 hours of lessons when nothing is owed. «Sono 300,00 €: dopo, Giulia avrà 233,00 € di credito
 * (circa 10 h 35 min a 22,00 €/h).» The time uses the server's rule (rounded down to the minute).
 */
export function highAmountWarning({
  amountCents,
  balanceCents,
  rateCents,
  firstName,
}: {
  amountCents: number;
  /** Balance before this payment (negative = owes). */
  balanceCents: number;
  rateCents: number | null;
  firstName: string;
}): string | null {
  const debt = balanceCents < 0 ? -balanceCents : 0;
  const tooHigh =
    debt > 0 ? amountCents > 3 * debt : rateCents !== null && amountCents > 10 * rateCents;
  if (!tooHigh) return null;
  const after = balanceCents + amountCents;
  if (after <= 0) return null;
  const minutes = rateCents === null ? null : creditMinutesAt(after, rateCents);
  const time =
    minutes === null || rateCents === null
      ? ""
      : ` (${formatCreditMinutesText(minutes)} a ${formatRate(rateCents)})`;
  return `Sono ${formatEuro(amountCents)}: dopo, ${firstName} avrà ${formatEuroAbs(after)} di credito${time}.`;
}
