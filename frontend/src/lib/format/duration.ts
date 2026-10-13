// Durations are integer minutes everywhere in the API.

/** 90 → "1 h 30 min", 45 → "45 min", 120 → "2 h", 0 → "0 min", -90 → "-1 h 30 min". */
export function formatMinutes(minutes: number): string {
  if (!Number.isInteger(minutes)) throw new RangeError(`Minuti non interi: ${String(minutes)}`);
  if (minutes < 0) return `-${formatMinutes(-minutes)}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest)} min`;
}

/**
 * Prepaid credit expressed in time at the current rate (D-17): 136 → "≈ 2 h 16 min".
 * The API already rounds `credit_minutes` to whole minutes; the "≈" says it is an equivalence.
 * Note (fonts.md): the UI fonts have no "≈" glyph, so components show the compact form as an
 * icon + `formatMinutes`, and use `formatCreditMinutesText` in sentences and aria-labels.
 */
export function formatCreditMinutes(minutes: number): string {
  return `≈ ${formatMinutes(Math.abs(minutes))}`;
}

/** Same equivalence in words: 136 → "circa 2 h 16 min" (sentences, aria-label). */
export function formatCreditMinutesText(minutes: number): string {
  return `circa ${formatMinutes(Math.abs(minutes))}`;
}
