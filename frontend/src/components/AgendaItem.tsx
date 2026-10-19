// A lesson in a day list (docs/design/02-design-system.md §9.9): Oggi «Prossime lezioni» and the
// mobile Agenda. Grid 58 px | 1fr | auto. Lessons already in the balance are ink-2, scheduled ones
// ink: nothing else, because a finished lesson enters the balance by itself.
import { CaretRightIcon, CloudSlashIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import type { Lesson } from "@/lib/api/types";
import { formatDateShort, formatWeekdayLong } from "@/lib/format";
import { cx, lessonTiming } from "./utils";

export interface AgendaItemProps {
  lesson: Pick<
    Lesson,
    "id" | "date" | "start_time" | "end_time" | "settled" | "student" | "subject" | "calendar"
  >;
  /** Today and the minutes since midnight, in the tutor's timezone («tra 40 min», «in corso»). */
  today: string;
  nowMinutes: number;
  /** Where the row leads: by default the student's page with this lesson highlighted. */
  href?: string;
  className?: string;
}

export function AgendaItem({ lesson, today, nowMinutes, href, className }: AgendaItemProps) {
  const timing = lessonTiming(lesson, today, nowMinutes);
  const done = lesson.settled;
  const start = lesson.start_time.slice(0, 5);
  const end = lesson.end_time.slice(0, 5);
  const calendarError = lesson.calendar.status === "error";
  return (
    // The link is named by its whole visible text, in reading order («15:00 – 16:00 Luca Bianchi
    // Latino, tra 40 min»): a name limited to the student would break WCAG 2.5.3 (label in name).
    <Link
      to={href ?? `/studenti/${lesson.student.id}?riga=${lesson.id}`}
      className={cx(
        "grid min-h-[3.75rem] grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2 no-underline transition-colors hover:bg-paper-sunk",
        done ? "text-ink-2" : "text-ink",
        className,
      )}
    >
      <span className="font-money tabular-nums">
        <span className="block text-[1rem] leading-5 font-medium">{start}</span>
        <span className="sr-only">–</span>
        <span className="block text-[0.75rem] leading-4 text-ink-3">{end}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[1rem] leading-[1.375rem] font-semibold">
          {lesson.student.display_name}
        </span>
        <span className="flex items-center gap-1 text-[0.875rem] leading-5 text-ink-2">
          <span className="truncate">{lesson.subject?.name ?? "Lezione"}</span>
          {timing && (
            <>
              <span className="sr-only">,</span> <span aria-hidden>·</span>{" "}
              <span className="marker whitespace-nowrap">{timing.label}</span>
            </>
          )}
          {calendarError && (
            <>
              <CloudSlashIcon size={16} aria-hidden className="shrink-0 text-danger" />
              <span className="sr-only">Non è in Google Calendar</span>
            </>
          )}
        </span>
      </span>
      <CaretRightIcon size={20} aria-hidden className="text-ink-3" />
    </Link>
  );
}

/**
 * Day separator of a lesson list: caption «MER 7 OTT» (a heading, so screen readers can jump
 * between days). `today` adds «· OGGI» as in the mobile Agenda.
 */
export function DayHeading({
  date,
  today,
  level = 3,
  long = false,
  className,
}: {
  date: string;
  today?: string;
  level?: 2 | 3 | 4;
  /** «MARTEDÌ 6 OTT» (Agenda mobile) instead of «MAR 6 OTT». */
  long?: boolean;
  className?: string;
}) {
  const Tag = `h${String(level)}` as "h2" | "h3" | "h4";
  const short = formatDateShort(date);
  const label = long
    ? `${formatWeekdayLong(date).split(" ")[0] ?? ""} ${short.slice(short.indexOf(" ") + 1)}`
    : short;
  return (
    <Tag className={cx("m-0 pt-3.5 pb-1 text-caption text-ink-3 uppercase", className)}>
      {label}
      {today === date && " · oggi"}
    </Tag>
  );
}
