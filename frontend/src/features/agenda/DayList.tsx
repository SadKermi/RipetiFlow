// Mobile agenda (03 §6, below 1024 px): no hour grid. A strip of the seven days (44 px, a dot
// when the day has lessons) jumps to that day; under it the days one after the other, each with
// its lessons (AgendaItem, 02 §9.9) and, today, the dashed «adesso 14:20» line.
import { useId } from "react";
import { AgendaItem, DayHeading, SkeletonRows, cx, useMediaQuery } from "@/components";
import type { Lesson } from "@/lib/api/types";
import { formatTime, formatWeekdayLong, parseIsoDate, parseTime } from "@/lib/format";
import { lessonsByDay } from "./week";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function dayAnchor(prefix: string, date: string): string {
  return `${prefix}-${date}`;
}

/** «L», «M», «M», «G», «V», «S», «D» + day number. */
function stripLabel(date: string): {
  initial: string;
  weekday: string;
  day: string;
  month: string;
} {
  // «lunedì 19 ottobre» → «L» on screen, the whole words for screen readers.
  const [weekday = "", , month = ""] = formatWeekdayLong(date).split(" ");
  return {
    initial: weekday.slice(0, 1).toLocaleUpperCase("it-IT"),
    weekday,
    day: String(parseIsoDate(date)?.day ?? ""),
    month,
  };
}

/** «─ ─ adesso 14:20 ─ ─» between the lessons of today. */
function NowLine({ minutes }: { minutes: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-[0.8125rem] leading-4 text-ink">
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-ink" />
      <span>
        adesso <span className="font-money">{formatTime(minutes)}</span>
      </span>
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-ink" />
    </div>
  );
}

export function DayList({
  days,
  lessons,
  today,
  nowMinutes,
  isLoading,
}: {
  days: readonly string[];
  lessons: readonly Lesson[];
  today: string;
  nowMinutes: number;
  isLoading: boolean;
}) {
  const prefix = useId().replace(/:/g, "");
  const reducedMotion = useMediaQuery(REDUCED_MOTION, false);
  const byDay = lessonsByDay(lessons);

  function jumpTo(date: string) {
    const section = document.getElementById(dayAnchor(prefix, date));
    if (!section) return;
    section.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    section.focus({ preventScroll: true });
  }

  return (
    <>
      <nav aria-label="Giorni della settimana" className="mt-3">
        <ul className="m-0 grid list-none grid-cols-7 gap-1 p-0">
          {days.map((date) => {
            const { initial, weekday, day, month } = stripLabel(date);
            const count = byDay.get(date)?.length ?? 0;
            const isToday = date === today;
            const tail = `${isToday ? ", oggi" : ""}${
              isLoading
                ? ""
                : count === 0
                  ? ", nessuna lezione"
                  : count === 1
                    ? ", 1 lezione"
                    : `, ${String(count)} lezioni`
            }`;
            // Named by its content, «lunedì 19 ottobre, oggi, 1 lezione»: the visible «19» is
            // part of the name (WCAG 2.5.3) and the initial «L» is spelled out for screen readers.
            return (
              <li key={date}>
                <button
                  type="button"
                  onClick={() => jumpTo(date)}
                  className="flex h-touch w-full cursor-pointer flex-col items-center justify-center rounded-xs border border-rule bg-paper-raised text-ink hover:border-ink-3"
                >
                  {/* The spaces between the spans name the button; flex does not draw them. */}
                  <span className="flex items-baseline gap-0.5 text-[0.875rem] leading-5">
                    <span aria-hidden className="text-ink-3">
                      {initial}
                    </span>
                    <span className="sr-only">{weekday}</span>{" "}
                    <span className={cx("font-semibold", isToday && "marker")}>{day}</span>{" "}
                    <span className="sr-only">{`${month}${tail}`}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cx(
                      "mt-0.5 size-1 rounded-full",
                      count > 0 && !isLoading ? "bg-ink" : "bg-transparent",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div aria-busy={isLoading || undefined} className="mt-4 border-t-2 border-ink">
        {isLoading && (
          <p role="status" className="sr-only">
            Caricamento…
          </p>
        )}
        {days.map((date) => {
          const list = byDay.get(date) ?? [];
          const isToday = date === today;
          // The «adesso» line goes after the lessons already started (finished or in progress).
          const nowIndex = isToday
            ? list.filter((lesson) => (parseTime(lesson.start_time.slice(0, 5)) ?? 0) <= nowMinutes)
                .length
            : -1;
          return (
            <section
              key={date}
              id={dayAnchor(prefix, date)}
              tabIndex={-1}
              aria-label={`${formatWeekdayLong(date)}${isToday ? ", oggi" : ""}`}
              className="scroll-mt-4 focus:outline-none focus-visible:shadow-none"
            >
              <DayHeading date={date} today={today} level={2} long />
              {isLoading ? (
                <SkeletonRows rows={2} rowClassName="min-h-[3.75rem]" label="" />
              ) : list.length === 0 ? (
                <>
                  {isToday && <NowLine minutes={nowMinutes} />}
                  <p className="m-0 border-b border-rule pb-3 text-[0.875rem] leading-5 text-ink-3">
                    Nessuna lezione.
                  </p>
                </>
              ) : (
                <ol className="m-0 list-none p-0">
                  {list.map((lesson, index) => (
                    <li key={lesson.id}>
                      {index === nowIndex && <NowLine minutes={nowMinutes} />}
                      <AgendaItem lesson={lesson} today={today} nowMinutes={nowMinutes} />
                    </li>
                  ))}
                  {nowIndex === list.length && (
                    <li>
                      <NowLine minutes={nowMinutes} />
                    </li>
                  )}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
