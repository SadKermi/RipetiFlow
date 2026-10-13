// Times of day are "HH:MM" strings (24h, whole minutes) in the tutor's timezone (D-11).
// Internally they are handled as minutes since midnight.

const MINUTES_PER_DAY = 24 * 60;
const TIME = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/;

/** "15:30" → 930. Also accepts "9:05", "15.30" (Italian habit) and "15:30:00". Invalid → null. */
export function parseTime(text: string): number | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 930 → "15:30". Only for minutes within the same day (0–1439). */
export function formatTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new RangeError(`Orario fuori dalla giornata: ${String(minutes)} minuti`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Canonical "HH:MM" for anything `parseTime` accepts: "9.5" → null, "9:05" → "09:05". */
export function normalizeTime(text: string): string | null {
  const minutes = parseTime(text);
  return minutes === null ? null : formatTime(minutes);
}

/**
 * "15:30" + 90 → "17:00". Returns null when the result leaves the day: a lesson starts and ends
 * on the same date (D-11), so the UI must not silently wrap past midnight.
 */
export function addMinutesToTime(time: string, delta: number): string | null {
  const start = parseTime(time);
  if (start === null) return null;
  const end = start + delta;
  if (end < 0 || end >= MINUTES_PER_DAY) return null;
  return formatTime(end);
}

/** Minutes from `start` to `end` ("15:00", "16:30" → 90). Null if either is invalid. */
export function minutesBetween(start: string, end: string): number | null {
  const a = parseTime(start);
  const b = parseTime(end);
  return a === null || b === null ? null : b - a;
}

/** Rounds down to the previous quarter hour: 937 (15:37) → 930 (15:30). */
export function roundDownToQuarter(minutes: number): number {
  return Math.floor(minutes / 15) * 15;
}
