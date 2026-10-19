// «Oggi» (docs/design/03-schermate.md §3): «Cosa ho adesso e chi mi deve soldi?», in this order.
// GET /dashboard?days=7: next lessons (from now to today + 7, in progress included), open accounts
// with totals, the month in numbers. Date and title show at once: they are local.
import {
  CaretRightIcon,
  ChatTextIcon,
  CloudSlashIcon,
  CoinsIcon,
  CopySimpleIcon,
  EraserIcon,
  PencilSimpleIcon,
  PencilSimpleSlashIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/app/auth";
import { AgendaItem, DayHeading } from "@/components/AgendaItem";
import { BalanceInline } from "@/components/BalanceBadge";
import { Button, InlineButton, InlineLink } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FormNote } from "@/components/Field";
import { AccountMenu } from "@/components/shell/Navigation";
import { useMatitaSlots } from "@/components/shell/matita-slot";
import { Wordmark } from "@/components/shell/Wordmark";
import { LoadErrorBand, SkeletonRows } from "@/components/States";
import { cx, initialsOf, lessonTiming, useMediaQuery } from "@/components/utils";
import { errorMessage, isApiProblem } from "@/lib/api/problem";
import type { Dashboard, Lesson, StudentSummary } from "@/lib/api/types";
import { addDays, formatEuro, formatMinutes, formatWeekdayLong } from "@/lib/format";
import { profileQuery, studentsQuery, useDashboard, useDuplicateLesson } from "@/lib/queries";
import { focusWhenLost } from "@/features/settings/focus";
import {
  ActionMenu,
  DeleteLessonDialog,
  LessonFormDialog,
  type LessonToDelete,
  PaymentFormDialog,
  StudentFormDialog,
  deleteLessonNow,
  lessonSavedMessage,
  useTutorClock,
  useUndoToast,
} from "@/features/forms";

const DESKTOP_QUERY = "(min-width: 64rem)";

const SECTION = "border-t-2 border-ink pt-2.5";
const SECTION_TITLE = "m-0 font-display text-display-s font-normal text-ink";

function SectionHeader({ id, title, link }: { id: string; title: string; link: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-1">
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      {link}
    </div>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <InlineLink
      to={to}
      className="inline-flex items-center gap-0.5 text-[0.9375rem] font-medium text-ink-2 no-underline hover:underline"
    >
      {children}
      <CaretRightIcon size={16} aria-hidden />
    </InlineLink>
  );
}

/** «2 lezioni non sono in Google Calendar.» / «1 lezione non è in Google Calendar.» */
function calendarWarning(errors: number): string {
  return errors === 1
    ? "1 lezione non è in Google Calendar."
    : `${String(errors)} lezioni non sono in Google Calendar.`;
}

/** «6 lezioni svolte · 7 h 30 min». */
function monthLine(month: Dashboard["month"]): string {
  const lessons =
    month.lessons === 1 ? "1 lezione svolta" : `${String(month.lessons)} lezioni svolte`;
  return `${lessons} · ${formatMinutes(month.minutes)}`;
}

export function TodayScreen() {
  const { today, nowMinutes, timeZone } = useTutorClock();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { config } = useAuth();
  const { TodayLine } = useMatitaSlots();
  const navigate = useNavigate();
  const dashboard = useDashboard(7);
  const data = dashboard.data ?? null;
  const showToast = useUndoToast();
  const duplicate = useDuplicateLesson();

  const [lessonForm, setLessonForm] = useState<{ lessonId?: string } | null>(null);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState(false);
  const [toDelete, setToDelete] = useState<LessonToDelete | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const upcomingRef = useRef<HTMLElement>(null);
  /** Position in «Prossime lezioni» of the lesson last edited or deleted from its menu. */
  const actedOn = useRef<number | null>(null);

  function actOn(lesson: Lesson) {
    actedOn.current = data?.upcoming.findIndex((item) => item.id === lesson.id) ?? null;
  }

  /**
   * After the sheet or the confirmation closes: a deleted (or moved) lesson takes its row and
   * the menu that opened them away, so the focus goes to the lesson that took its place instead
   * of falling back to <body> (WCAG 2.4.3).
   */
  function keepFocusInUpcoming() {
    const index = actedOn.current;
    if (index === null || index < 0) return;
    focusWhenLost(() => {
      const links = upcomingRef.current?.querySelectorAll<HTMLElement>("li a") ?? [];
      return links[Math.min(index, links.length - 1)] ?? upcomingRef.current?.querySelector("a");
    });
  }

  // The welcome is only for a tutor without students: asked only when the dashboard is all empty.
  const allEmpty =
    data !== null &&
    data.upcoming.length === 0 &&
    data.owing.length === 0 &&
    data.in_credit.length === 0 &&
    data.month.lessons === 0 &&
    data.month.collected_cents === 0;
  const students = useQuery({
    ...studentsQuery({ archived: false, sort: "name" }),
    enabled: allEmpty,
  });
  const welcome = allEmpty && students.data?.length === 0;

  const offline = isApiProblem(dashboard.error) && dashboard.error.code === "network_error";

  async function repeatNextWeek(lesson: Lesson) {
    setRowError(null);
    try {
      const copy = await duplicate.mutateAsync({
        id: lesson.id,
        body: { date: addDays(lesson.date, 7) },
      });
      showToast(lessonSavedMessage(copy, today), (qc) => deleteLessonNow(qc, copy));
    } catch (error) {
      setRowError(errorMessage(error));
    }
  }

  const header = (
    <header>
      {!desktop && <MobileMasthead />}
      <p className="m-0 text-body-s text-ink-3">{formatWeekdayLong(today)}</p>
      <h1 className="m-0 font-display text-display-l font-normal text-ink">Oggi</h1>
      {desktop &&
        (TodayLine && config?.assistant_available ? (
          <div className="mt-4">
            <TodayLine />
          </div>
        ) : (
          <div className="mt-4 flex min-h-14 items-center gap-3 border-b border-ink-3">
            {config?.assistant_available === false ? (
              <p className="m-0 flex flex-1 items-start gap-2 text-[0.875rem] leading-5 text-ink-3">
                <PencilSimpleSlashIcon size={20} aria-hidden className="shrink-0" />
                Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.
              </p>
            ) : (
              <span className="flex-1" />
            )}
            <Button
              variant="line"
              square
              icon={PlusIcon}
              aria-label="Nuova lezione con il modulo"
              onPress={() => setLessonForm({})}
            />
          </div>
        ))}
      {data?.calendar.connected && data.calendar.errors > 0 && (
        <p className="m-0 mt-3 flex flex-wrap items-center gap-x-2 text-[0.9375rem] leading-[1.375rem] text-ink">
          <CloudSlashIcon size={20} aria-hidden className="shrink-0 text-danger" />
          <span className="min-w-0 flex-1">{calendarWarning(data.calendar.errors)}</span>
          <SectionLink to="/impostazioni#calendar">Impostazioni</SectionLink>
        </p>
      )}
    </header>
  );

  if (dashboard.isError && !data) {
    return (
      <>
        {header}
        <LoadErrorBand
          className="mt-4"
          onRetry={() => void dashboard.refetch()}
          isRetrying={dashboard.isFetching}
          offline={offline}
          timeZone={timeZone}
        />
      </>
    );
  }

  if (welcome) {
    return (
      <>
        {header}
        <EmptyState
          className="mt-6"
          action={
            <Button variant="ink" icon={PlusIcon} onPress={() => setNewStudent(true)}>
              Aggiungi studente
            </Button>
          }
        >
          Benvenuto nel registro. Inizia dal primo studente: nome e tariffa bastano.
        </EmptyState>
        <StudentFormDialog isOpen={newStudent} onOpenChange={setNewStudent} />
      </>
    );
  }

  const upcoming = (
    <section ref={upcomingRef} aria-labelledby="oggi-prossime" className={SECTION}>
      <SectionHeader
        id="oggi-prossime"
        title="Prossime lezioni"
        link={<SectionLink to="/agenda">Agenda</SectionLink>}
      />
      {!data ? (
        <SkeletonRows rows={3} rowClassName="min-h-[3.75rem]" />
      ) : data.upcoming.length === 0 ? (
        <EmptyState
          className="py-4"
          action={
            <InlineButton onPress={() => setLessonForm({})}>Aggiungi una lezione</InlineButton>
          }
        >
          Nessuna lezione in programma nei prossimi 7 giorni.
        </EmptyState>
      ) : (
        <UpcomingList
          lessons={data.upcoming}
          today={today}
          nowMinutes={nowMinutes}
          desktop={desktop}
          onEdit={(lesson) => {
            actOn(lesson);
            setLessonForm({ lessonId: lesson.id });
          }}
          onRepeat={(lesson) => void repeatNextWeek(lesson)}
          onDelete={(lesson) => {
            actOn(lesson);
            setToDelete({
              id: lesson.id,
              studentId: lesson.student.id,
              date: lesson.date,
              amountCents: lesson.amount_cents,
              settled: lesson.settled,
              inCalendar: lesson.calendar.status !== "off",
            });
          }}
        />
      )}
      {rowError && <FormNote className="mt-3">{rowError}</FormNote>}
    </section>
  );

  const accounts = (
    <section aria-labelledby="oggi-conti" className={SECTION}>
      <SectionHeader
        id="oggi-conti"
        title="Conti aperti"
        link={<SectionLink to="/studenti">Studenti</SectionLink>}
      />
      {!data ? (
        <SkeletonRows rows={3} rowClassName="min-h-12" />
      ) : data.owing.length === 0 && data.in_credit.length === 0 ? (
        <EmptyState tone="quiet" className="py-4">
          Tutti in pari.
        </EmptyState>
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {[...data.owing, ...data.in_credit].map((student) => (
              <li key={student.id}>
                <AccountRow
                  student={student}
                  desktop={desktop}
                  onPayment={() => setPaymentFor(student.id)}
                  onReminder={() => void navigate(`/studenti/${student.id}?promemoria=1`)}
                  reminder={Boolean(config?.assistant_available)}
                />
              </li>
            ))}
          </ul>
          <dl className="m-0 mt-2">
            <div className="flex items-baseline justify-between gap-3 py-2 rule-total">
              <dt className="text-body font-medium text-ink">Da incassare</dt>
              <dd className="m-0 font-display text-money-l font-medium tabular-nums text-ink">
                {formatEuro(data.totals.owed_to_you_cents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-body text-ink-2">Anticipi ricevuti</dt>
              <dd className="m-0 font-money text-money tabular-nums text-ink-2">
                {formatEuro(data.totals.credit_held_cents)}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );

  const month = (
    <section aria-labelledby="oggi-mese" className={SECTION}>
      {!data ? (
        <SkeletonRows rows={1} rowClassName="min-h-12" />
      ) : data.month.lessons === 0 ? (
        <>
          <h2 id="oggi-mese" className="m-0 text-body text-ink-2">
            {data.month.label} · nessuna lezione svolta finora.
          </h2>
          {data.month.collected_cents > 0 && (
            <p className="m-0 mt-1 text-body text-ink">
              Incassato {formatEuro(data.month.collected_cents)}
            </p>
          )}
        </>
      ) : (
        <>
          <h2 id="oggi-mese" className={SECTION_TITLE}>
            {data.month.label}
          </h2>
          <p className="m-0 mt-1 text-body text-ink">{monthLine(data.month)}</p>
          <p className="m-0 text-body text-ink">
            Maturato {formatEuro(data.month.earned_cents)} · Incassato{" "}
            {formatEuro(data.month.collected_cents)}
          </p>
          <p className="m-0 mt-1 text-[0.75rem] leading-4 text-ink-3">
            Maturato: lezioni svolte nel mese. Incassato: pagamenti ricevuti nel mese.
          </p>
        </>
      )}
    </section>
  );

  return (
    <>
      {header}
      {dashboard.isError && data && (
        <LoadErrorBand
          className="mt-4"
          onRetry={() => void dashboard.refetch()}
          isRetrying={dashboard.isFetching}
          offline={offline}
          cachedAt={dashboard.dataUpdatedAt}
          timeZone={timeZone}
        />
      )}
      <div
        className={cx(
          "mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12",
          dashboard.isError && "text-ink-2",
        )}
      >
        <div className="lg:col-span-7">{upcoming}</div>
        <div className="flex flex-col gap-8 lg:col-span-5">
          {accounts}
          {month}
        </div>
      </div>

      <LessonFormDialog
        isOpen={lessonForm !== null}
        onOpenChange={(open) => {
          if (open) return;
          if (lessonForm?.lessonId) keepFocusInUpcoming();
          setLessonForm(null);
        }}
        lessonId={lessonForm?.lessonId ?? null}
      />
      <PaymentFormDialog
        isOpen={paymentFor !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentFor(null);
        }}
        initial={{ student_id: paymentFor }}
      />
      <DeleteLessonDialog
        lesson={toDelete}
        onOpenChange={(open) => {
          if (open) return;
          setToDelete(null);
          keepFocusInUpcoming();
        }}
      />
    </>
  );
}

/**
 * «▮R RipetiFlow (DM)» above the date on the phone (03 §3, mobile): the app has no top bar below
 * 1024 px, so Oggi, the home, carries the wordmark and the account menu (Impostazioni, Esci).
 */
function MobileMasthead() {
  const { user, signOut } = useAuth();
  // Name for the avatar from the cache only, as in the desktop top bar: no request of its own.
  const profile = useQuery({ ...profileQuery(), enabled: false }).data;
  const name = profile?.full_name ?? null;
  const email = user?.email ?? profile?.email ?? null;
  return (
    <div className="-mt-1 mb-3 flex items-center justify-between gap-3">
      <Wordmark size="sm" />
      <AccountMenu
        initials={initialsOf(name, email)}
        name={name}
        email={email}
        onSignOut={() => void signOut()}
      />
    </div>
  );
}

/**
 * Lessons by day: today's first without a heading (the page title says it), then «MER 7 OTT»…
 * Mobile rows are AgendaItem (start over end); desktop one line «15:00–16:00 Luca Bianchi Latino
 * tra 40 min» with a «⋯» menu (Modifica · Ripeti la settimana dopo · Elimina).
 */
function UpcomingList({
  lessons,
  today,
  nowMinutes,
  desktop,
  onEdit,
  onRepeat,
  onDelete,
}: {
  lessons: readonly Lesson[];
  today: string;
  nowMinutes: number;
  desktop: boolean;
  onEdit: (lesson: Lesson) => void;
  onRepeat: (lesson: Lesson) => void;
  onDelete: (lesson: Lesson) => void;
}) {
  const days: { date: string; lessons: Lesson[] }[] = [];
  for (const lesson of lessons) {
    const last = days[days.length - 1];
    if (last && last.date === lesson.date) last.lessons.push(lesson);
    else days.push({ date: lesson.date, lessons: [lesson] });
  }
  return (
    <div>
      {days.map((day) => (
        <div key={day.date}>
          {day.date !== today && <DayHeading date={day.date} />}
          <ul className="m-0 list-none p-0">
            {day.lessons.map((lesson) => (
              <li key={lesson.id}>
                {desktop ? (
                  <UpcomingRow
                    lesson={lesson}
                    today={today}
                    nowMinutes={nowMinutes}
                    onEdit={() => onEdit(lesson)}
                    onRepeat={() => onRepeat(lesson)}
                    onDelete={() => onDelete(lesson)}
                  />
                ) : (
                  <AgendaItem lesson={lesson} today={today} nowMinutes={nowMinutes} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UpcomingRow({
  lesson,
  today,
  nowMinutes,
  onEdit,
  onRepeat,
  onDelete,
}: {
  lesson: Lesson;
  today: string;
  nowMinutes: number;
  onEdit: () => void;
  onRepeat: () => void;
  onDelete: () => void;
}) {
  const timing = lessonTiming(lesson, today, nowMinutes);
  const time = `${lesson.start_time.slice(0, 5)}–${lesson.end_time.slice(0, 5)}`;
  // Fixed columns, the same in every row: name, subject and «tra 40 min» line up down the list
  // (an `auto` timing column would shift the subject of the one row that has it).
  return (
    <div
      className={cx(
        "relative grid min-h-12 grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem_auto] items-center gap-3 border-b border-rule transition-colors hover:bg-paper-sunk",
        lesson.settled ? "text-ink-2" : "text-ink",
      )}
    >
      <span className="font-money text-[0.9375rem] tabular-nums">{time}</span>
      <Link
        to={`/studenti/${lesson.student.id}?riga=${lesson.id}`}
        className="truncate font-semibold text-inherit no-underline after:absolute after:inset-0 after:content-['']"
      >
        {lesson.student.display_name}
      </Link>
      <span className="truncate text-[0.9375rem] text-ink-2">
        {lesson.subject?.name ?? "Lezione"}
        {lesson.calendar.status === "error" && (
          <>
            <CloudSlashIcon
              size={16}
              aria-hidden
              className="ml-1 inline-block align-[-3px] text-danger"
            />
            <span className="sr-only">, non è in Google Calendar</span>
          </>
        )}
      </span>
      <span className="text-right text-[0.875rem] whitespace-nowrap">
        {timing && <span className="marker">{timing.label}</span>}
      </span>
      <ActionMenu
        size="sm"
        className="relative z-10"
        label={`Azioni per la lezione di ${lesson.student.display_name} alle ${lesson.start_time.slice(0, 5)}`}
        items={[
          { id: "edit", label: "Modifica", icon: PencilSimpleIcon, onAction: onEdit },
          {
            id: "repeat",
            label: "Ripeti la settimana dopo",
            icon: CopySimpleIcon,
            onAction: onRepeat,
          },
          { id: "delete", label: "Elimina", icon: EraserIcon, danger: true, onAction: onDelete },
        ]}
      />
    </div>
  );
}

/** «Marco Rossi   DEVE 120,00 €» (+ «archiviato»); desktop «⋯»: Registra pagamento · Promemoria. */
function AccountRow({
  student,
  desktop,
  onPayment,
  onReminder,
  reminder,
}: {
  student: StudentSummary;
  desktop: boolean;
  onPayment: () => void;
  onReminder: () => void;
  reminder: boolean;
}) {
  return (
    <div className="relative flex min-h-12 items-center gap-3 border-b border-rule transition-colors hover:bg-paper-sunk">
      <Link
        to={`/studenti/${student.id}`}
        className="min-w-0 flex-1 py-2 text-ink no-underline after:absolute after:inset-0 after:content-['']"
      >
        <span className="block truncate font-medium">{student.display_name}</span>
        {student.archived && (
          <span className="block text-[0.8125rem] leading-4 text-ink-3">archiviato</span>
        )}
      </Link>
      <BalanceInline
        cents={student.balance.balance_cents}
        creditMinutes={student.balance.credit_minutes}
      />
      {desktop && (
        <ActionMenu
          size="sm"
          className="relative z-10"
          label={`Azioni per ${student.display_name}`}
          items={[
            { id: "payment", label: "Registra pagamento", icon: CoinsIcon, onAction: onPayment },
            ...(reminder
              ? [{ id: "reminder", label: "Promemoria", icon: ChatTextIcon, onAction: onReminder }]
              : []),
          ]}
        />
      )}
    </div>
  );
}
