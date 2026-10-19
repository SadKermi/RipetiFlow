// Desktop agenda (03 §6, ≥ 1024 px): seven day columns over the hours 07:00–21:00 (wider when a
// lesson falls outside), the «adesso» line in today's column, lessons as blocks with a 3 px rule on
// the left. Lessons already in the balance are ink-2 with an ink-3 rule, scheduled ones ink.
// Screen readers get one section per day with a heading and a list of lessons (links).
import { CloudSlashIcon } from "@phosphor-icons/react";
import { type MouseEvent, useId } from "react";
import { Link } from "react-router";
import { cx, lessonTiming } from "@/components";
import type { Lesson } from "@/lib/api/types";
import { formatDateShort, formatTime, formatWeekdayLong } from "@/lib/format";
import { type DayPlacement, gridHours, layoutDay, lessonsByDay } from "./week";

/** Height of one hour (px). */
const HOUR_PX = 56;
const PX_PER_MINUTE = HOUR_PX / 60;

export interface NewLessonAt {
  date: string;
  /** "HH:MM", rounded to the quarter hour; absent from the keyboard (the form proposes one). */
  startTime?: string;
}

function LessonBlock({
  lesson,
  placement,
  gridStart,
  today,
  nowMinutes,
}: {
  lesson: Lesson;
  placement: DayPlacement;
  gridStart: number;
  today: string;
  nowMinutes: number;
}) {
  const timing = lessonTiming(lesson, today, nowMinutes);
  const done = lesson.settled;
  const top = (placement.start - gridStart) * PX_PER_MINUTE;
  const height = Math.max(22, (placement.end - placement.start) * PX_PER_MINUTE - 2);
  const width = 100 / placement.lanes;
  const time = `${lesson.start_time.slice(0, 5)}–${lesson.end_time.slice(0, 5)}`;
  const calendarError = lesson.calendar.status === "error";
  return (
    <li
      className="absolute px-0.5"
      style={{
        top,
        height,
        left: `${String(placement.lane * width)}%`,
        width: `${String(width)}%`,
      }}
    >
      <Link
        to={`/studenti/${lesson.student.id}?riga=${lesson.id}`}
        className={cx(
          "relative flex h-full flex-col overflow-hidden border-l-[3px] bg-paper-raised px-1.5 py-1 text-[0.8125rem] leading-[1.125rem] no-underline transition-colors hover:bg-paper-sunk",
          done ? "border-ink-3 text-ink-2" : "border-ink text-ink",
        )}
      >
        <span className="sr-only">{time}, </span>
        <span className="truncate pr-4 font-semibold">{lesson.student.display_name}</span>
        <span className="truncate">
          {lesson.subject?.name ?? "Lezione"}
          {timing && (
            <>
              <span className="sr-only">, </span> <span className="marker">{timing.label}</span>
            </>
          )}
        </span>
        <span aria-hidden className="truncate font-money text-[0.75rem] leading-4 text-ink-3">
          {time}
        </span>
        {calendarError && (
          <>
            <CloudSlashIcon
              size={16}
              aria-hidden
              className="absolute top-1 right-1 shrink-0 text-danger"
            />
            <span className="sr-only">, non è in Google Calendar</span>
          </>
        )}
      </Link>
    </li>
  );
}

function DayColumn({
  date,
  lessons,
  gridStart,
  gridEnd,
  today,
  nowMinutes,
  onNewLesson,
}: {
  date: string;
  lessons: Lesson[];
  gridStart: number;
  gridEnd: number;
  today: string;
  nowMinutes: number;
  onNewLesson?: (at: NewLessonAt) => void;
}) {
  const id = useId();
  const isToday = date === today;
  const height = (gridEnd - gridStart) * PX_PER_MINUTE;
  const placements = layoutDay(lessons);
  const long = formatWeekdayLong(date);
  const showNow = isToday && nowMinutes >= gridStart && nowMinutes <= gridEnd;

  function newLessonAt(event: MouseEvent<HTMLButtonElement>) {
    if (!onNewLesson) return;
    // Pointer: the quarter hour under the click. Keyboard (detail 0): the form proposes the time.
    if (event.detail === 0) {
      onNewLesson({ date });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = gridStart + (event.clientY - rect.top) / PX_PER_MINUTE;
    const quarter = Math.min(gridEnd - 15, Math.max(gridStart, Math.floor(minutes / 15) * 15));
    onNewLesson({ date, startTime: formatTime(quarter) });
  }

  return (
    <section aria-labelledby={id} className="min-w-0 border-l border-rule">
      <h2
        id={id}
        className="sticky top-0 z-[1] m-0 flex h-11 items-center border-b border-rule-strong bg-paper px-2 text-caption text-ink-2 uppercase"
      >
        <span aria-hidden className={cx(isToday && "marker")}>
          {formatDateShort(date).replace(/\s\S+$/, "")}
        </span>
        <span className="sr-only">
          {long}
          {isToday ? ", oggi" : ""}
        </span>
      </h2>
      <div className="relative" style={{ height }}>
        {onNewLesson && (
          <button
            type="button"
            onClick={newLessonAt}
            aria-label={`Nuova lezione ${long}`}
            className="absolute inset-0 cursor-cell bg-transparent"
          />
        )}
        {showNow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-ink"
            style={{ top: (nowMinutes - gridStart) * PX_PER_MINUTE - 1 }}
          >
            <span className="absolute -top-2.5 left-0 bg-paper px-1 font-money text-[0.75rem] leading-4 text-ink">
              {formatTime(nowMinutes)}
            </span>
          </div>
        )}
        {lessons.length === 0 ? (
          <p className="sr-only">Nessuna lezione.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {lessons.map((lesson) => {
              const placement = placements.get(lesson.id);
              return placement ? (
                <LessonBlock
                  key={lesson.id}
                  lesson={lesson}
                  placement={placement}
                  gridStart={gridStart}
                  today={today}
                  nowMinutes={nowMinutes}
                />
              ) : null;
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

export function WeekGrid({
  days,
  lessons,
  today,
  nowMinutes,
  isLoading,
  onNewLesson,
}: {
  days: readonly string[];
  lessons: readonly Lesson[];
  today: string;
  nowMinutes: number;
  /** The week's lessons are on their way: the empty grid stays, «Caricamento…» is announced. */
  isLoading: boolean;
  onNewLesson?: (at: NewLessonAt) => void;
}) {
  const { startHour, endHour } = gridHours(lessons);
  const gridStart = startHour * 60;
  const gridEnd = endHour * 60;
  const byDay = lessonsByDay(lessons);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const height = (gridEnd - gridStart) * PX_PER_MINUTE;

  return (
    <div aria-busy={isLoading || undefined} className="relative border-t border-rule-strong">
      {isLoading && (
        <p role="status" className="sr-only">
          Caricamento…
        </p>
      )}
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-rule">
        <div aria-hidden>
          <div className="h-11 border-b border-rule-strong" />
          <div className="relative" style={{ height }}>
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 font-money text-[0.75rem] leading-4 text-ink-3 first:translate-y-0"
                style={{ top: (hour * 60 - gridStart) * PX_PER_MINUTE }}
              >
                {formatTime(hour * 60)}
              </span>
            ))}
          </div>
        </div>
        {days.map((date) => (
          <div key={date} className="relative">
            {/* Hour lines behind the column (decorative). */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-11 bottom-0"
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, var(--rf-rule) 0 1px, transparent 1px ${String(HOUR_PX)}px)`,
              }}
            />
            <DayColumn
              date={date}
              lessons={isLoading ? [] : (byDay.get(date) ?? [])}
              gridStart={gridStart}
              gridEnd={gridEnd}
              today={today}
              nowMinutes={nowMinutes}
              onNewLesson={onNewLesson}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
