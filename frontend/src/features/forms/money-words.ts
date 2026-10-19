// Words for amounts inside sentences (docs/design/02-design-system.md §7, 03 §7). A balance is
// always said with a word, never with a sign: «deve 67,00 €», «credito 40,00 €», «in pari».
import type { Rate } from "@/lib/api/types";
import { formatDateShort, formatEuro, formatEuroAbs, formatMinutes } from "@/lib/format";

/** «deve 67,00 €» / «credito 40,00 €» / «in pari» (03 §7.2 «Dopo: …», §7.5 confirmations). */
export function balanceWords(cents: number): string {
  if (cents < 0) return `deve ${formatEuroAbs(cents)}`;
  if (cents > 0) return `credito ${formatEuroAbs(cents)}`;
  return "in pari";
}

/** «22,00 €/h». */
export function formatRate(cents: number): string {
  return `${formatEuro(cents)}/h`;
}

/** «5 ott» (a day inside a sentence: «dal 5 ott», «il 2 ott»). */
export function dayMonth(date: string): string {
  const short = formatDateShort(date);
  return short.slice(short.indexOf(" ") + 1);
}

/** «1 lezione» / «3 lezioni». */
export function lessonsCount(count: number): string {
  return count === 1 ? "1 lezione" : `${String(count)} lezioni`;
}

/** The rate in effect on `date`: a rate governs [effective_from, next effective_from) (D-16). */
export function rateOn(rates: readonly Rate[], date: string): Rate | null {
  let best: Rate | null = null;
  for (const rate of rates) {
    if (
      rate.effective_from <= date &&
      (best === null || rate.effective_from > best.effective_from)
    ) {
      best = rate;
    }
  }
  return best;
}

/** The rate that precedes `rate` in the history (null for the first one). */
export function previousRate(rates: readonly Rate[], rate: Rate): Rate | null {
  let best: Rate | null = null;
  for (const other of rates) {
    if (
      other.effective_from < rate.effective_from &&
      (best === null || other.effective_from > best.effective_from)
    ) {
      best = other;
    }
  }
  return best;
}

/**
 * Amount of a lesson as the database computes it: round(rate × minutes / 60), half away from zero
 * (all integers here, so no float ever touches the cents).
 */
export function lessonAmountCents(rateCents: number, minutes: number): number {
  return Math.floor((rateCents * minutes + 30) / 60);
}

/** Credit in minutes at a rate, rounded down to the minute (the server's rule, docs/04). */
export function creditMinutesAt(creditCents: number, rateCents: number): number | null {
  if (rateCents <= 0 || creditCents <= 0) return null;
  return Math.floor((creditCents * 60) / rateCents);
}

/** «1 h 30 min · 33,00 € a 22,00 €/h» (live line under «Orario»). */
export function lessonSummary(minutes: number, rateCents: number | null): string {
  const duration = formatMinutes(minutes);
  if (rateCents === null) return duration;
  return `${duration} · ${formatEuro(lessonAmountCents(rateCents, minutes))} a ${formatRate(rateCents)}`;
}
