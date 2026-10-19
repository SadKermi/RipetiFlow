// Texts and formatting of the Google Calendar link (03 §8 «Google Calendar», D-31).
import { parseAbsolute, toCalendarDate } from "@internationalized/date";
import { DEFAULT_TIMEZONE, formatRelativeDate } from "@/lib/format";

/** State passed to /impostazioni by /auth/callback when the calendar consent did not work. */
export interface CalendarReturnState {
  calendarError?: string;
}

export function readCalendarReturnState(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const value = (state as CalendarReturnState).calendarError;
  return typeof value === "string" && value !== "" ? value : null;
}

export const CALENDAR_SECTION_ID = "google-calendar";

/** «12 lezioni» / «1 lezione». */
function lessons(count: number): string {
  return count === 1 ? "1 lezione" : `${String(count)} lezioni`;
}

/** Toast after «Collega»: «Calendario collegato · 12 lezioni in coda». */
export function connectedToast(pending: number): string {
  return pending > 0
    ? `Calendario collegato · ${lessons(pending)} in coda`
    : "Calendario collegato";
}

/** Toast after «Risincronizza» (202 `queued`): «12 lezioni in coda per Google Calendar». */
export function queuedToast(queued: number): string {
  return queued > 0
    ? `${lessons(queued)} in coda per Google Calendar`
    : "Nessuna lezione da inviare a Google Calendar";
}

/** `last_synced_at` in the tutor's timezone: «oggi 14:02», «ieri 18:30», «lun 5 ott 09:15». */
export function formatLastSync(
  iso: string,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string | null {
  try {
    const zoned = parseAbsolute(iso, timeZone);
    const date = toCalendarDate(zoned).toString();
    const time = `${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`;
    return `${formatRelativeDate(date, timeZone, now)} ${time}`;
  } catch {
    return null;
  }
}

export const UNVERIFIED_APP_NOTE =
  "Google potrebbe mostrarti un avviso “app non verificata”: è normale finché la verifica non è conclusa.";
