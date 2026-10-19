// Small helpers shared by the components (non-component module: hooks and pure functions only).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  formatCreditMinutesText,
  formatDateShort,
  formatEuroAbs,
  formatMinutes,
  parseIsoDate,
} from "@/lib/format";

/** Joins class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** < 768 px: bottom sheets, 44 px buttons, tab bar (02 §2). */
export const MOBILE_QUERY = "(max-width: 47.9375rem)";
/** ≥ 760 px of effective viewport: the ledger is a real table, below it a list (02 §10.9). */
export const LEDGER_TABLE_QUERY = "(min-width: 47.5rem)";

/** Live result of a media query; `fallback` where matchMedia does not exist (tests, SSR). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY, false);
}

/** `true` once `delayMs` have passed since mount (skeletons appear only after 300 ms, 02 §9.15). */
export function useDelayedFlag(delayMs: number): boolean {
  const [ready, setReady] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return ready;
}

/** The current time, refreshed every `intervalMs` («tra 40 min» is updated every minute, 02 §7). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Amount for a ledger column: no «€» (the column header says it), never a sign. 4400 → "44,00". */
export function formatAmountColumn(cents: number): string {
  return formatEuroAbs(cents).replace(/[\s  ]*€$/, "");
}

/** Duration in a column, `H h MM` (02 §7): 90 → "1 h 30", 120 → "2 h", 45 → "45 min". */
export function formatMinutesColumn(minutes: number): string {
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  if (hours === 0) return formatMinutes(rest);
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest).padStart(2, "0")}`;
}

/**
 * Amount read aloud (screen readers), without sign: 6700 → "67 euro", 6750 → "67 euro e 50
 * centesimi", 100 → "1 euro", 1 → "1 centesimo". The ledger's aria text says «ti deve 67 euro».
 */
export function speakEuro(cents: number): string {
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100);
  const rest = abs % 100;
  const eurosText = `${euros.toLocaleString("it-IT", { useGrouping: true })} euro`;
  if (rest === 0) return eurosText;
  const restText = rest === 1 ? "1 centesimo" : `${String(rest)} centesimi`;
  return euros === 0 ? restText : `${eurosText} e ${restText}`;
}

export type BalanceStatus = "debt" | "credit" | "settled";

/** Balance sign convention of the API: negative = the student owes the tutor. */
export function balanceStatus(cents: number): BalanceStatus {
  if (cents < 0) return "debt";
  if (cents > 0) return "credit";
  return "settled";
}

/**
 * A balance in words for screen readers (02 §10.6): «ti deve 67 euro», «in credito di 40 euro,
 * circa 2 h», «in pari». `subject` drops «ti» for running balances in the ledger («deve 67 euro»).
 */
export function balanceSpeech(
  cents: number,
  creditMinutes: number | null = null,
  { short = false }: { short?: boolean } = {},
): string {
  switch (balanceStatus(cents)) {
    case "debt":
      return `${short ? "deve" : "ti deve"} ${speakEuro(cents)}`;
    case "credit":
      return creditMinutes === null
        ? `in credito di ${speakEuro(cents)}`
        : `in credito di ${speakEuro(cents)}, ${formatCreditMinutesText(creditMinutes)}`;
    case "settled":
      return "in pari";
  }
}

/** "2026-10-06" → "mar 6 ott 2026": the day field always shows the year (03 §7.1). */
export function formatDayFieldValue(date: string): string {
  const day = parseIsoDate(date);
  return day ? `${formatDateShort(date)} ${String(day.year)}` : "";
}

/**
 * The two parts of a ledger date (02 §9.6): "lun 5" and "ott"; the month part gets the year when
 * it is not the current one ("set 2025").
 */
export function splitLedgerDate(date: string, today: string): { day: string; month: string } {
  const short = formatDateShort(date);
  const cut = short.lastIndexOf(" ");
  const parsed = parseIsoDate(date);
  const todayParsed = parseIsoDate(today);
  const month = short.slice(cut + 1);
  const otherYear = parsed && todayParsed && parsed.year !== todayParsed.year;
  return {
    day: short.slice(0, cut),
    month: otherYear ? `${month} ${String(parsed.year)}` : month,
  };
}

/** Lessons that start within this many minutes get «tra 40 min» on the highlighter (02 §7). */
export const SOON_MINUTES = 3 * 60;

/**
 * «in corso», «adesso», «tra 40 min», «tra 2 h 10 min» for a lesson of today, or null (02 §7,
 * §9.9). `today` and `nowMinutes` are in the tutor's timezone (todayIn / minutesNowIn).
 */
export function lessonTiming(
  lesson: { date: string; start_time: string; end_time: string },
  today: string,
  nowMinutes: number,
): { label: string; inProgress: boolean } | null {
  if (lesson.date !== today) return null;
  const [sh = 0, sm = 0] = lesson.start_time.split(":").map(Number);
  const [eh = 0, em = 0] = lesson.end_time.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (nowMinutes >= start && nowMinutes < end) {
    return nowMinutes === start
      ? { label: "adesso", inProgress: true }
      : { label: "in corso", inProgress: true };
  }
  const wait = start - nowMinutes;
  if (wait > 0 && wait < SOON_MINUTES) return { label: `tra ${formatMinutes(wait)}`, inProgress: false };
  return null;
}

/** Short date with the year only when it is not the current one: «lun 28 set 2025» (02 §7). */
export function formatShortDate(date: string, today: string): string {
  const { day, month } = splitLedgerDate(date, today);
  return `${day} ${month}`;
}

/** «2ª liceo classico · prossima gio 8 ott, 15:00» / «… · oggi 15:00» / «… · ultima lun 5 ott». */
export function studentMeta(
  student: {
    grade: string | null;
    school: string | null;
    next_lesson: { date: string; start_time: string } | null;
    last_lesson_date: string | null;
  },
  today: string,
): string {
  const parts: string[] = [];
  const klass = student.grade ?? student.school;
  if (klass) parts.push(klass);
  if (student.next_lesson) {
    const { date, start_time: start } = student.next_lesson;
    const time = start.slice(0, 5);
    parts.push(date === today ? `oggi ${time}` : `prossima ${formatShortDate(date, today)}, ${time}`);
  } else if (student.last_lesson_date) {
    parts.push(`ultima ${formatShortDate(student.last_lesson_date, today)}`);
  }
  return parts.join(" · ");
}
