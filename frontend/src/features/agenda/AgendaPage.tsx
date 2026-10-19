// Agenda (03 §6, D-20): the week Monday → Sunday, planning only (no payments here). Data: GET
// /lessons?from=<Monday>&to=<Sunday>; the summary counts every lesson of the week, scheduled ones
// included. Desktop: day columns 07:00–21:00; mobile: a list per day. Tap on a lesson → the
// student's page with that row highlighted; tap on an empty slot (desktop) → a new lesson then.
import { CalendarDotsIcon, CaretLeftIcon, CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@/app/auth";
import { Button, EmptyState, LoadErrorBand, cx, useMediaQuery, useNow } from "@/components";
import { LessonFormDialog } from "@/features/forms/LessonFormDialog";
import { isApiProblem } from "@/lib/api/problem";
import {
  DEFAULT_TIMEZONE,
  addDays,
  minutesNowIn,
  parseIsoDate,
  startOfWeek,
  todayIn,
} from "@/lib/format";
import { calendarStatusQuery, useLessons, useProfile } from "@/lib/queries";
import { DayList } from "./DayList";
import { type NewLessonAt, WeekGrid } from "./WeekGrid";
import { WEEK_PARAM, daysOf, summaryText, weekFromParam, weekLabel, weekSummary } from "./week";

/** Day columns from 1024 px (the top navigation appears there too, 02 §2). */
const DESKTOP_QUERY = "(min-width: 64rem)";

export function AgendaPage() {
  const { config } = useAuth();
  const profile = useProfile();
  const timeZone = profile.data?.timezone ?? DEFAULT_TIMEZONE;
  const now = useNow();
  const today = todayIn(timeZone, now);
  const nowMinutes = minutesNowIn(timeZone, now);
  const desktop = useMediaQuery(DESKTOP_QUERY, false);

  const [params, setParams] = useSearchParams();
  const monday = weekFromParam(params.get(WEEK_PARAM), today);
  const sunday = addDays(monday, 6);
  const days = daysOf(monday);
  const thisWeek = startOfWeek(today);

  const lessons = useLessons({ from: monday, to: sunday });
  const calendar = useQuery({
    ...calendarStatusQuery(),
    enabled: config?.calendar_sync_available === true,
  });

  const [newLesson, setNewLesson] = useState<NewLessonAt | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function showWeek(target: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (target === thisWeek) next.delete(WEEK_PARAM);
        else next.set(WEEK_PARAM, target);
        return next;
      },
      { replace: false },
    );
  }

  function openNewLesson(at: NewLessonAt) {
    setNewLesson(at);
    setFormOpen(true);
  }

  const loading = lessons.isPending || lessons.isPlaceholderData;
  const items = loading ? [] : (lessons.data ?? []);
  const failedWithoutData = lessons.isError && lessons.data === undefined;
  const stale = lessons.isError && lessons.data !== undefined;
  const summary = weekSummary(items);
  const empty = !loading && !lessons.isError && items.length === 0;
  const currentYear = parseIsoDate(today)?.year;
  const label = weekLabel(monday, { year: desktop, currentYear });
  const offline = isApiProblem(lessons.error) && lessons.error.code === "network_error";
  const emptyDay = today >= monday && today <= sunday ? today : monday;

  const todayButton = (
    <Button onPress={() => showWeek(thisWeek)} aria-label="Vai alla settimana di oggi">
      Oggi
    </Button>
  );

  return (
    <div>
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 font-display text-display-l font-normal text-ink">Agenda</h1>
          {!desktop && todayButton}
        </div>
        <div className="-ml-2.5 flex items-center gap-1 lg:ml-0">
          <Button
            variant="quiet"
            square
            icon={CaretLeftIcon}
            aria-label="Settimana precedente"
            onPress={() => showWeek(addDays(monday, -7))}
          />
          <p
            aria-live="polite"
            className="m-0 min-w-0 text-center text-title font-semibold text-ink lg:min-w-[13rem]"
          >
            <span className="sr-only">Settimana </span>
            {label}
          </p>
          <Button
            variant="quiet"
            square
            icon={CaretRightIcon}
            aria-label="Settimana successiva"
            onPress={() => showWeek(addDays(monday, 7))}
          />
          {desktop && <div className="ml-2">{todayButton}</div>}
        </div>
        {desktop && summary.lessons > 0 && (
          <p className="m-0 ml-auto text-[0.9375rem] text-ink-2">{summaryText(summary)}</p>
        )}
      </header>

      {lessons.isError && (
        <LoadErrorBand
          className="mt-4"
          onRetry={() => void lessons.refetch()}
          isRetrying={lessons.isFetching}
          offline={offline}
          cachedAt={stale ? lessons.dataUpdatedAt : null}
          timeZone={timeZone}
        />
      )}

      {empty && (
        <EmptyState
          className="mt-2"
          action={
            <Button icon={PlusIcon} onPress={() => openNewLesson({ date: emptyDay })}>
              Lezione
            </Button>
          }
        >
          Nessuna lezione questa settimana.
        </EmptyState>
      )}

      {!failedWithoutData && (
        <div className={cx(desktop ? "mt-4" : "mt-1", stale && "text-ink-2")}>
          {desktop ? (
            <WeekGrid
              days={days}
              lessons={items}
              today={today}
              nowMinutes={nowMinutes}
              isLoading={loading}
              onNewLesson={openNewLesson}
            />
          ) : (
            !empty && (
              <DayList
                days={days}
                lessons={items}
                today={today}
                nowMinutes={nowMinutes}
                isLoading={loading}
              />
            )
          )}
        </div>
      )}

      {!desktop && summary.lessons > 0 && (
        <p className="mt-4 mb-0 text-[0.9375rem] text-ink-2">{summaryText(summary)}</p>
      )}

      {calendar.data?.connected && (
        <p className="mt-6 mb-0 flex items-start gap-2 text-[0.875rem] leading-5 text-ink-2">
          <CalendarDotsIcon size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
          <span>
            Le lezioni sono anche nel calendario «RipetiFlow» di Google. Se le sposti lì, qui non
            cambiano.
          </span>
        </p>
      )}

      <LessonFormDialog
        isOpen={formOpen}
        onOpenChange={setFormOpen}
        initial={
          newLesson
            ? {
                date: newLesson.date,
                ...(newLesson.startTime ? { start_time: newLesson.startTime } : {}),
              }
            : undefined
        }
      />
    </div>
  );
}
