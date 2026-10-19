// Pure helpers of the week agenda (03 §6, D-20, D-23: weeks start on Monday).
import type { Lesson } from "@/lib/api/types";
import {
  addDays,
  formatDateLong,
  formatEuro,
  formatMinutes,
  parseIsoDate,
  parseTime,
  startOfWeek,
} from "@/lib/format";

/** Search parameter holding the Monday of the week shown (absent = the current week). */
export const WEEK_PARAM = "settimana";

/** Monday of the week to show: from `?settimana=` when it is a real date, else this week. */
export function weekFromParam(param: string | null, today: string): string {
  const date = param ? parseIsoDate(param) : null;
  return startOfWeek(date ? date.toString() : today);
}

/** The seven days of the week starting at `monday`. */
export function daysOf(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function withoutYear(text: string): string {
  return text.replace(/\s\d{4}$/, "");
}

/**
 * «5–11 ottobre 2026», «28 settembre – 4 ottobre 2026», «29 dicembre 2025 – 4 gennaio 2026».
 * `year: false` drops the year when both days are in `currentYear` (mobile header).
 */
export function weekLabel(
  monday: string,
  { year = true, currentYear }: { year?: boolean; currentYear?: number } = {},
): string {
  const sunday = addDays(monday, 6);
  const start = parseIsoDate(monday);
  const end = parseIsoDate(sunday);
  if (!start || !end) return "";
  const keepYear = year || start.year !== currentYear || end.year !== currentYear;
  let label: string;
  if (start.year !== end.year) {
    label = `${formatDateLong(monday)} – ${formatDateLong(sunday)}`;
  } else if (start.month !== end.month) {
    label = `${withoutYear(formatDateLong(monday))} – ${formatDateLong(sunday)}`;
  } else {
    label = `${String(start.day)}–${formatDateLong(sunday)}`;
  }
  return keepYear || start.year !== end.year ? label : withoutYear(label);
}

export interface WeekSummary {
  lessons: number;
  minutes: number;
  amountCents: number;
}

/** Totals of the week, scheduled lessons included (03 §6). */
export function weekSummary(
  lessons: readonly Pick<Lesson, "duration_minutes" | "amount_cents">[],
): WeekSummary {
  return lessons.reduce<WeekSummary>(
    (sum, lesson) => ({
      lessons: sum.lessons + 1,
      minutes: sum.minutes + lesson.duration_minutes,
      amountCents: sum.amountCents + lesson.amount_cents,
    }),
    { lessons: 0, minutes: 0, amountCents: 0 },
  );
}

/** «7 lezioni · 8 h 30 min · 186,00 €». */
export function summaryText(summary: WeekSummary): string {
  const count = summary.lessons === 1 ? "1 lezione" : `${String(summary.lessons)} lezioni`;
  return `${count} · ${formatMinutes(summary.minutes)} · ${formatEuro(summary.amountCents)}`;
}

/** Lessons grouped by date, each day sorted by start time. */
export function lessonsByDay<L extends Pick<Lesson, "date" | "start_time" | "end_time">>(
  lessons: readonly L[],
): Map<string, L[]> {
  const days = new Map<string, L[]>();
  for (const lesson of lessons) {
    const list = days.get(lesson.date) ?? [];
    list.push(lesson);
    days.set(lesson.date, list);
  }
  for (const list of days.values()) {
    list.sort(
      (a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time),
    );
  }
  return days;
}

function minutesOf(time: string): number {
  return parseTime(time.slice(0, 5)) ?? 0;
}

/** Hours drawn by the desktop grid: 07:00–21:00, widened to fit earlier or later lessons. */
export function gridHours(lessons: readonly Pick<Lesson, "start_time" | "end_time">[]): {
  startHour: number;
  endHour: number;
} {
  let startHour = 7;
  let endHour = 21;
  for (const lesson of lessons) {
    startHour = Math.min(startHour, Math.floor(minutesOf(lesson.start_time) / 60));
    endHour = Math.max(endHour, Math.ceil(minutesOf(lesson.end_time) / 60));
  }
  return { startHour, endHour: Math.min(24, endHour) };
}

export interface DayPlacement {
  /** Minutes since midnight. */
  start: number;
  end: number;
  /** Side-by-side position among overlapping lessons (group lessons are one per student, D-12). */
  lane: number;
  lanes: number;
}

/**
 * Places a day's lessons in lanes: lessons that overlap in time sit side by side, each cluster of
 * overlapping lessons sharing the same number of lanes.
 */
export function layoutDay(
  lessons: readonly Pick<Lesson, "id" | "start_time" | "end_time">[],
): Map<string, DayPlacement> {
  const sorted = [...lessons]
    .map((lesson) => ({
      id: lesson.id,
      start: minutesOf(lesson.start_time),
      end: minutesOf(lesson.end_time),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const result = new Map<string, DayPlacement>();
  let cluster: { id: string; start: number; end: number; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const item of cluster) {
      result.set(item.id, { start: item.start, end: item.end, lane: item.lane, lanes });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ ...item, lane });
    clusterEnd = cluster.length === 1 ? item.end : Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}
