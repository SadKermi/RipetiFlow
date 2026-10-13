// Money is always an integer number of cents (D-10). Formatting goes through a decimal *string*
// ("1234.50"), never through cents / 100, so no float ever touches an amount.

// useGrouping: true = always group. The Italian default ("auto") leaves 4-digit amounts
// ungrouped ("1234,50 €"); D-10 wants "1.234,50 €" so columns of amounts read the same.
const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  useGrouping: true,
});
const plain = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Importo non valido: ${String(cents)} (servono centesimi interi)`);
  }
}

/** 123450 → "1234.50", -5 → "-0.05": exact decimal string for Intl (ES2023 string formatting). */
function centsToDecimal(cents: number): `${number}` {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.trunc(abs / 100);
  const rest = abs % 100;
  return `${sign}${String(units)}.${String(rest).padStart(2, "0")}` as `${number}`;
}

/**
 * Euro amount in Italian format: 123450 → "1.234,50 €", -4500 → "-45,00 €", 0 → "0,00 €".
 * The space before € is a no-break space (U+00A0), as Intl produces it: the symbol never wraps.
 */
export function formatEuro(cents: number): string {
  assertCents(cents);
  return euro.format(centsToDecimal(cents === 0 ? 0 : cents)); // -0 → "0,00 €", not "-0,00 €"
}

/** Absolute value, for UI that shows the sign with words ("Ti deve 45,00 €"). */
export function formatEuroAbs(cents: number): string {
  assertCents(cents);
  return formatEuro(Math.abs(cents));
}

/** Value for a money input field: 1250 → "12,50", 1200 → "12,00" (no symbol, no grouping). */
export function centsToInput(cents: number): string {
  assertCents(cents);
  return plain.format(centsToDecimal(cents === 0 ? 0 : cents));
}

const GROUPED_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Parses what a tutor types in a money field and returns integer cents, or `null` when the text is
 * not an amount we can read with certainty.
 *
 * Rules (Italian first, but tolerant of keypads without a comma):
 * - spaces, "€" and a leading "+" are ignored; a leading "-" is accepted only with
 *   `allowNegative`;
 * - with a comma: the comma is the decimal separator (max 2 decimals) and dots may only be
 *   thousands separators in groups of three: "1.234,50" → 123450, "12,5" → 1250, "12," → 1200;
 * - without a comma, one dot followed by 1–2 digits is a decimal point (phone keypads often
 *   have only "."): "12.50" → 1250, "12.5" → 1250;
 * - without a comma, dots followed by exactly three digits are thousands separators (Italian
 *   reading): "1.234" → 123400 (milleduecentotrentaquattro euro);
 * - anything else is ambiguous or malformed → null: "1,234.50", "12,345", "1.2345", "12.50.3".
 */
export function parseEuroInput(
  text: string,
  options: { allowNegative?: boolean } = {},
): number | null {
  let s = text.replace(/[\s\u00a0\u202f€]/g, "");
  let negative = false;
  if (s.startsWith("-") || s.startsWith("\u2212")) {
    if (!options.allowNegative) return null;
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s === "") return null;

  let integerPart: string;
  let decimalPart: string;
  const comma = s.indexOf(",");
  if (comma !== -1) {
    if (s.indexOf(",", comma + 1) !== -1) return null; // two commas
    integerPart = s.slice(0, comma);
    decimalPart = s.slice(comma + 1);
    if (decimalPart.includes(".")) return null; // "1,234.50": English format, ambiguous
    if (integerPart.includes(".")) {
      if (!GROUPED_THOUSANDS.test(integerPart)) return null;
      integerPart = integerPart.replaceAll(".", "");
    }
  } else if (s.includes(".")) {
    const dots = s.split(".").length - 1;
    const lastGroup = s.slice(s.lastIndexOf(".") + 1);
    if (dots === 1 && /^\d{1,2}$/.test(lastGroup)) {
      [integerPart, decimalPart] = s.split(".") as [string, string];
    } else if (GROUPED_THOUSANDS.test(s)) {
      integerPart = s.replaceAll(".", "");
      decimalPart = "";
    } else {
      return null;
    }
  } else {
    integerPart = s;
    decimalPart = "";
  }

  if (integerPart === "" && decimalPart === "") return null;
  if (!/^\d*$/.test(integerPart) || !/^\d{0,2}$/.test(decimalPart)) return null;
  const digits = `${integerPart === "" ? "0" : integerPart}${decimalPart.padEnd(2, "0")}`;
  const cents = Number(digits);
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}
