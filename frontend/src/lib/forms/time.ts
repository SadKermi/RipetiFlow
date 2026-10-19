// What a tutor types in the «Inizio» / «Fine» fields (docs/design/02-design-system.md §9.3):
// phone keypads in numeric mode have no colon, so "15", "1500" and "930" are accepted next to
// "15:00", "15.00" and "9:05". Anything else is not a time we can read with certainty.
import { formatMinutes, minutesBetween, normalizeTime } from "@/lib/format";

/** "15" → "15:00", "1500" → "15:00", "930" → "09:30", "15.30" → "15:30"; invalid → null. */
export function parseTimeInput(text: string): string | null {
  const s = text.trim();
  if (/^\d{1,2}$/.test(s)) {
    const hours = Number(s);
    return hours <= 23 ? `${String(hours).padStart(2, "0")}:00` : null;
  }
  if (/^\d{3,4}$/.test(s)) {
    return normalizeTime(`${s.slice(0, -2)}:${s.slice(-2)}`);
  }
  return normalizeTime(s);
}

/** Texts of the time checks: the end/length ones are the server's own (03 §7.1). */
export const TIME_MESSAGES = {
  invalid: "Scrivi un orario, per esempio 15:30.",
  endNotAfterStart: "L'orario di fine deve essere successivo a quello di inizio.",
  tooLong: "Una lezione non può durare più di 12 ore.",
} as const;

/** Above this many minutes the length is only a warning (8 h), above the second an error (12 h). */
export const LONG_LESSON_MINUTES = 8 * 60;
export const MAX_LESSON_MINUTES = 12 * 60;

export interface TimeRangeCheck {
  /** "HH:MM" or null when the text is not a time. */
  start: string | null;
  end: string | null;
  /** Minutes from start to end when both are valid (may be ≤ 0). */
  minutes: number | null;
  startError?: string;
  endError?: string;
  /** Non-blocking: «Sono 9 h di lezione: è giusto?» */
  warning?: string;
}

/**
 * Local checks of «Inizio → Fine» (02 §9.3), same rules and texts as the server: end after start,
 * at most 12 h (blocking), more than 8 h asks for a second look. Empty fields are not errors here:
 * required-ness is the form's call.
 */
export function checkTimeRange(startText: string, endText: string): TimeRangeCheck {
  const start = startText.trim() === "" ? null : parseTimeInput(startText);
  const end = endText.trim() === "" ? null : parseTimeInput(endText);
  const result: TimeRangeCheck = { start, end, minutes: null };
  if (startText.trim() !== "" && start === null) result.startError = TIME_MESSAGES.invalid;
  if (endText.trim() !== "" && end === null) result.endError = TIME_MESSAGES.invalid;
  if (start === null || end === null) return result;

  const minutes = minutesBetween(start, end) ?? 0;
  result.minutes = minutes;
  if (minutes <= 0) result.endError = TIME_MESSAGES.endNotAfterStart;
  else if (minutes > MAX_LESSON_MINUTES) result.endError = TIME_MESSAGES.tooLong;
  else if (minutes > LONG_LESSON_MINUTES) {
    result.warning = `Sono ${formatMinutes(minutes)} di lezione: è giusto?`;
  }
  return result;
}
