// Phone numbers → digits for https://wa.me/<digits> links (international format, no "+").
// Students' numbers are typed by hand ("333 123 4567", "+39 06 1234 5678", "0039…"), so the
// rules are deliberately conservative: when we cannot be sure of the country, we return null and
// the UI falls back to a link without a recipient (https://wa.me/?text=…).

const SEPARATORS = /[\s.\-/()[\]\u00a0]/g;
const MIN_INTERNATIONAL = 8; // E.164 numbers are at most 15 digits; very short ones are typos.
const MAX_INTERNATIONAL = 15;

function isInternationalLength(digits: string): boolean {
  return digits.length >= MIN_INTERNATIONAL && digits.length <= MAX_INTERNATIONAL;
}

/** Italian mobile: 3xx…, 9–10 digits in total (e.g. 3331234567). */
function isItalianMobile(national: string): boolean {
  return /^3\d{8,9}$/.test(national);
}

/** Italian landline: starts with 0 and keeps it after +39 (e.g. 0612345678 → 39 0612345678). */
function isItalianLandline(national: string): boolean {
  return /^0\d{5,10}$/.test(national);
}

/**
 * Normalises a phone number for wa.me. Rules:
 * 1. spaces, dots, dashes, slashes and brackets are removed;
 * 2. "+" or "00" prefix → already international: the remaining digits are used as they are;
 * 3. Italian mobile (3…, 9–10 digits) or landline (0…) → "39" is prepended;
 * 4. a number already starting with 39 followed by a valid Italian number → kept as is;
 * 5. anything else (letters, unknown national formats) → null.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(SEPARATORS, "");
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    return /^\d+$/.test(digits) && isInternationalLength(digits) ? digits : null;
  }
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith("00")) {
    const digits = s.slice(2);
    return isInternationalLength(digits) ? digits : null;
  }
  // Checked before the "39…" rule: 39x is also a valid Italian mobile prefix (e.g. 3921234567).
  if (isItalianMobile(s) || isItalianLandline(s)) return `39${s}`;
  if (s.startsWith("39")) {
    const national = s.slice(2);
    if (isItalianMobile(national) || isItalianLandline(national)) return s;
  }
  return null;
}

/** wa.me link with an optional prefilled message; without a usable number, WhatsApp asks whom. */
export function whatsAppLink(phone: string | null | undefined, text?: string): string {
  const number = toWhatsAppNumber(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number ?? ""}${query}`;
}
