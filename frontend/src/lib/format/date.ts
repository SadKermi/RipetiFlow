// Dates are "YYYY-MM-DD" calendar dates in the tutor's timezone (profile.timezone, default
// Europe/Rome). They are never converted through the browser's local timezone: "today" is computed
// for the tutor's zone, and formatting treats the date as a plain calendar day.
import {
  type CalendarDate,
  fromAbsolute,
  parseDate,
  toCalendarDate,
} from "@internationalized/date";
import { formatTime, roundDownToQuarter } from "./time";

export const DEFAULT_TIMEZONE = "Europe/Rome";

const shortFmt = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const longFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayLongFmt = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat("it-IT", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Parses "YYYY-MM-DD"; null for anything else (including impossible dates like 2026-02-30). */
export function parseIsoDate(text: string): CalendarDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  try {
    const date = parseDate(text);
    return date.toString() === text ? date : null;
  } catch {
    return null;
  }
}

function toDate(text: string): CalendarDate {
  const date = parseIsoDate(text);
  if (!date) throw new RangeError(`Data non valida: ${JSON.stringify(text)} (atteso YYYY-MM-DD)`);
  return date;
}

/** Midnight UTC of the calendar day: used only to feed Intl with timeZone "UTC". */
function utcInstant(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

/** Today's date in the tutor's timezone. `now` is injectable for tests. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return toCalendarDate(fromAbsolute(now.getTime(), timeZone)).toString();
}

/** Minutes since midnight right now in the tutor's timezone. */
export function minutesNowIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): number {
  const zoned = fromAbsolute(now.getTime(), timeZone);
  return zoned.hour * 60 + zoned.minute;
}

/** Default start time for a new lesson: now, rounded down to the quarter hour ("15:37" → "15:30"). */
export function defaultStartTime(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  return formatTime(roundDownToQuarter(minutesNowIn(timeZone, now)));
}

export function addDays(date: string, days: number): string {
  return toDate(date).add({ days }).toString();
}

/** Days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return toDate(to).compare(toDate(from));
}

/** Monday of the week containing `date` (D-23: weeks start on Monday, whatever the browser says). */
export function startOfWeek(date: string): string {
  const d = toDate(date);
  const mondayBased = (utcInstant(d).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return d.subtract({ days: mondayBased }).toString();
}

/** The seven dates (Monday → Sunday) of the week containing `date`. */
export function weekDays(date: string): string[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** First and last day of the month containing `date`. */
export function monthRange(date: string): { from: string; to: string } {
  const d = toDate(date);
  const first = d.set({ day: 1 });
  return { from: first.toString(), to: first.add({ months: 1 }).subtract({ days: 1 }).toString() };
}

/** "2026-10-05" → "lun 5 ott". */
export function formatDateShort(date: string): string {
  return shortFmt.format(utcInstant(toDate(date)));
}

/** "2026-10-06" → "6 ottobre 2026". */
export function formatDateLong(date: string): string {
  return longFmt.format(utcInstant(toDate(date)));
}

/** "2026-10-06" → "martedì 6 ottobre". */
export function formatWeekdayLong(date: string): string {
  return weekdayLongFmt.format(utcInstant(toDate(date)));
}

/** "2026-10-06" → "ottobre 2026". */
export function formatMonthYear(date: string): string {
  return monthFmt.format(utcInstant(toDate(date)));
}

/** "2026-10-06" → "06/10" (the short form used in activity summaries). */
export function formatDayMonth(date: string): string {
  const d = toDate(date);
  return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}`;
}

/**
 * "oggi" / "domani" / "ieri" relative to today in the tutor's timezone, otherwise the short date
 * ("lun 5 ott").
 */
export function formatRelativeDate(
  date: string,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  switch (daysBetween(todayIn(timeZone, now), date)) {
    case 0:
      return "oggi";
    case 1:
      return "domani";
    case -1:
      return "ieri";
    default:
      return formatDateShort(date);
  }
}
