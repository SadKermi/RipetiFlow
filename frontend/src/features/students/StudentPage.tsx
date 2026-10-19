// «Scheda studente», the ledger (docs/design/03-schermate.md §5): name → balance (big number +
// word) → projected → Pagamento / Promemoria → the ledger → rate and contacts. Desktop: a 336 px
// sticky aside next to the ledger; mobile: one column, rate/contacts/notes folded at the bottom.
import {
  ArchiveIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatTextIcon,
  ClockCounterClockwiseIcon,
  CoinsIcon,
  EraserIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/app/auth";
import { Button, InlineButton, LinkButton } from "@/components/Button";
import { FormNote } from "@/components/Field";
import {
  type LedgerLineProps,
  type MatitaFormOptions,
  useMatitaSlots,
} from "@/components/shell/matita-slot";
import { LoadErrorBand, PageMessage, SkeletonRows } from "@/components/States";
import { balanceSpeech, cx, formatAmountColumn, useMediaQuery } from "@/components/utils";
import { errorMessage, isApiProblem } from "@/lib/api/problem";
import type { Balance, Rate, Student, StudentSummary } from "@/lib/api/types";
import { formatCreditMinutesText, formatWeekdayLong, parseIsoDate } from "@/lib/format";
import {
  queryKeys,
  useLedger,
  useSetStudentArchived,
  useStudent,
  useSubjects,
} from "@/lib/queries";
import {
  ActionMenu,
  ArchiveStudentDialog,
  DeleteRateDialog,
  DeleteStudentDialog,
  type LessonInitial,
  LessonFormDialog,
  type PaymentInitial,
  PaymentFormDialog,
  RateChangeDialog,
  StudentFormDialog,
  balanceWords,
  dayMonth,
  formatRate,
  rateOn,
  setStudentArchivedNow,
  useTutorClock,
  useUndoToast,
} from "@/features/forms";
import { ActivitySheet, StudentLedger, lastPaymentSentence } from "@/features/ledger";
import { focusWhenLost } from "@/features/settings/focus";

const DESKTOP_QUERY = "(min-width: 64rem)";

interface FormRequest<I> {
  initial: I;
  options?: MatitaFormOptions;
}

/** «SALDO AL 6 OTTOBRE»: today's day and month, lowercase in the data, caption in the UI. */
function balanceDate(today: string): string {
  return formatWeekdayLong(today).replace(/^\S+\s/, "");
}

/** The student's summary from any students list already in the cache (name and balance at once). */
function useCachedSummary(id: string): StudentSummary | null {
  const queryClient = useQueryClient();
  for (const [, items] of queryClient.getQueriesData<StudentSummary[]>({
    queryKey: queryKeys.students.all(),
  })) {
    const found = items?.find((item) => item.id === id);
    if (found) return found;
  }
  return null;
}

/** True for 1,2 s after `value` changes (the highlighter behind a balance that just changed). */
function useFlash(value: number | null): boolean {
  const [previous, setPrevious] = useState(value);
  const [flashing, setFlashing] = useState(false);
  if (previous !== value) {
    setPrevious(value);
    if (previous !== null && value !== null) setFlashing(true);
  }
  useEffect(() => {
    if (!flashing) return;
    const timer = window.setTimeout(() => setFlashing(false), 1200);
    return () => window.clearTimeout(timer);
  }, [flashing, value]);
  return flashing;
}

export function StudentPage({ id }: { id: string }) {
  const { today, nowMinutes, timeZone } = useTutorClock();
  const { config } = useAuth();
  const { LedgerLine } = useMatitaSlots();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const studentResult = useStudent(id);
  const ledgerResult = useLedger(id);
  const subjects = useSubjects().data;
  const cached = useCachedSummary(id);
  const archive = useSetStudentArchived();
  const showToast = useUndoToast();

  const student = studentResult.data ?? null;
  const ledger = ledgerResult.data ?? null;
  const balance: Balance | null = ledger?.balance ?? student?.balance ?? cached?.balance ?? null;
  const name = student?.display_name ?? cached?.display_name ?? null;
  const matita = Boolean(LedgerLine && config?.assistant_available);

  const [lessonForm, setLessonForm] = useState<FormRequest<LessonInitial> | null>(null);
  const [paymentForm, setPaymentForm] = useState<FormRequest<PaymentInitial> | null>(null);
  const [editing, setEditing] = useState(false);
  const [rateChange, setRateChange] = useState(false);
  const [rateToDelete, setRateToDelete] = useState<Rate | null>(null);
  const changeRateRef = useRef<HTMLButtonElement>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState(() => searchParams.get("riga"));
  const [prompt, setPrompt] = useState<LedgerLineProps["prompt"]>(() =>
    searchParams.get("promemoria") ? { text: "scrivi un promemoria di pagamento", nonce: 1 } : null,
  );

  // «Promemoria» from Oggi asks Matita once (it spends a request of the daily quota): drop it
  // from the address, so a reload or Back/Forward does not ask again by itself.
  const fromReminder = searchParams.has("promemoria");
  useEffect(() => {
    if (!fromReminder) return;
    void setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("promemoria");
        return next;
      },
      { replace: true },
    );
  }, [fromReminder, setSearchParams]);

  const ledgerReady = ledger !== null;
  useEffect(() => {
    if (!highlightId || !ledgerReady) return;
    const timer = window.setTimeout(() => setHighlightId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlightId, ledgerReady]);

  const openLesson = (initial: LessonInitial = {}, options?: MatitaFormOptions) =>
    setLessonForm({ initial: { student_id: id, ...initial }, options });
  const openPayment = (initial: PaymentInitial = {}, options?: MatitaFormOptions) =>
    setPaymentForm({ initial: { student_id: id, ...initial }, options });

  // Keyboard on desktop (02 §10.5): N new lesson, P payment, unless typing or a dialog is open.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return;
    }
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      openLesson();
    } else if (key === "p") {
      event.preventDefault();
      openPayment();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  if (isApiProblem(studentResult.error) && studentResult.error.status === 404) {
    return (
      <PageMessage
        title="Studente non trovato"
        action={
          <LinkButton to="/studenti" variant="ink">
            Torna agli studenti
          </LinkButton>
        }
      >
        Forse è stato eliminato, o il link è di un altro account.
      </PageMessage>
    );
  }

  async function setArchived(archived: boolean) {
    setActionError(null);
    try {
      const saved = await archive.mutateAsync({ id, archived });
      showToast(
        `Scheda di ${saved.display_name} ${archived ? "archiviata" : "ripristinata"}`,
        (qc) => setStudentArchivedNow(qc, id, !archived),
      );
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    }
  }

  function requestArchive() {
    if (!student) return;
    if (student.balance.balance_cents !== 0) setConfirmArchive(true);
    else void setArchived(true).catch(() => undefined);
  }

  const menu = student ? (
    <ActionMenu
      label={`Altre azioni per ${student.display_name}`}
      variant="line"
      items={[
        {
          id: "history",
          label: "Storico modifiche",
          icon: ClockCounterClockwiseIcon,
          onAction: () => setHistory(true),
        },
        student.archived
          ? {
              id: "restore",
              label: "Ripristina",
              icon: ArchiveIcon,
              onAction: () => void setArchived(false).catch(() => undefined),
            }
          : { id: "archive", label: "Archivia", icon: ArchiveIcon, onAction: requestArchive },
        {
          id: "delete",
          label: "Elimina studente",
          icon: TrashIcon,
          danger: true,
          onAction: () => setConfirmDelete(true),
        },
      ]}
    />
  ) : null;

  const usualSubject = student?.default_subject_id
    ? (subjects?.find((s) => s.id === student.default_subject_id)?.name ?? null)
    : null;

  const header = (
    <header>
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/studenti"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-[0.9375rem] font-medium text-ink-2 no-underline hover:text-ink"
        >
          <CaretLeftIcon size={18} aria-hidden />
          Studenti
        </Link>
        {!desktop && menu}
      </div>
      <p className="m-0 mt-2 text-caption text-ink-3 uppercase">Studente</p>
      {name ? (
        <h1 className="m-0 mt-1 font-display text-display-m font-normal text-balance text-ink">
          {name}
        </h1>
      ) : (
        <h1 className="m-0 mt-1 font-display text-display-m font-normal text-ink-3">
          <span aria-hidden className="block h-8 w-48 bg-paper-sunk" />
          <span className="sr-only">Caricamento…</span>
        </h1>
      )}
      {student && <StudentSubline student={student} usualSubject={usualSubject} />}
      {student?.archived && (
        <p className="mt-3 mb-0 border-t border-rule-strong pt-2 text-[0.9375rem] leading-[1.375rem] text-ink-2">
          <ArchiveIcon size={18} aria-hidden className="mr-1.5 inline-block align-[-3px]" />
          Archiviato: non compare nelle liste.{" "}
          <InlineButton onPress={() => void setArchived(false).catch(() => undefined)}>
            Ripristina
          </InlineButton>
        </p>
      )}
    </header>
  );

  const balanceBlock = balance ? (
    <BalanceBlock
      balance={balance}
      today={today}
      lastPayment={ledger ? lastPaymentSentence(ledger.items) : null}
    />
  ) : studentResult.isError ? null : (
    <div aria-hidden className="mt-7 h-[34px] w-40 bg-paper-sunk" />
  );

  const actions = student ? (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Button variant="ink" icon={CoinsIcon} onPress={() => openPayment()}>
        Pagamento
      </Button>
      {matita && (
        <Button
          variant="line"
          icon={ChatTextIcon}
          onPress={() =>
            setPrompt({
              text: `scrivi un promemoria di pagamento${student.guardian_name ? ` per ${student.guardian_name}` : ""}`,
              nonce: Date.now(),
            })
          }
        >
          Promemoria
        </Button>
      )}
    </div>
  ) : null;

  const details = student ? (
    <StudentDetails
      student={student}
      today={today}
      onChangeRate={() => setRateChange(true)}
      changeRateRef={changeRateRef}
      onDeleteRate={setRateToDelete}
      footer={
        <div className="mt-6 flex gap-2">
          <Button variant="line" icon={PencilSimpleIcon} onPress={() => setEditing(true)}>
            Modifica dati
          </Button>
          {desktop && menu}
        </div>
      }
    />
  ) : null;

  const loadError =
    studentResult.isError || ledgerResult.isError ? (
      <LoadErrorBand
        className="mt-4"
        onRetry={() => {
          void studentResult.refetch();
          void ledgerResult.refetch();
        }}
        isRetrying={studentResult.isFetching || ledgerResult.isFetching}
        cachedAt={ledger ? ledgerResult.dataUpdatedAt : null}
        offline={
          (isApiProblem(studentResult.error) && studentResult.error.code === "network_error") ||
          (isApiProblem(ledgerResult.error) && ledgerResult.error.code === "network_error")
        }
        timeZone={timeZone}
      />
    ) : null;

  const ledgerSection =
    student && ledger ? (
      <div className={cx(ledgerResult.isError && "text-ink-2")}>
        <StudentLedger
          student={student}
          ledger={ledger}
          today={today}
          nowMinutes={nowMinutes}
          highlightId={highlightId}
          onNewLesson={() => openLesson()}
          line={{
            prompt,
            openLessonForm: (initial, options) => openLesson(initial, options),
            openPaymentForm: (initial, options) => openPayment(initial, options),
          }}
        />
      </div>
    ) : (studentResult.isError && !student) || (ledgerResult.isError && !ledger) ? null : (
      <SkeletonRows rows={4} rowClassName="min-h-row" className="border-t border-rule-strong" />
    );

  return (
    <>
      {desktop ? (
        <div className="grid grid-cols-[var(--rf-aside-w)_minmax(0,1fr)] items-start gap-12">
          <aside aria-label="Scheda" className="sticky top-[88px]">
            {header}
            {balanceBlock}
            {actions}
            {actionError && <FormNote className="mt-3">{actionError}</FormNote>}
            {details}
          </aside>
          <section aria-label="Registro" className="max-w-ledger min-w-0">
            {loadError}
            {ledgerSection}
          </section>
        </div>
      ) : (
        <div>
          {header}
          {loadError}
          {balanceBlock}
          {actions}
          {actionError && <FormNote className="mt-3">{actionError}</FormNote>}
          <section aria-label="Registro" className="mt-8">
            {ledgerSection}
          </section>
          {details && <MobileDetails>{details}</MobileDetails>}
        </div>
      )}

      <LessonFormDialog
        isOpen={lessonForm !== null}
        onOpenChange={(open) => {
          if (!open) setLessonForm(null);
        }}
        initial={lessonForm?.initial}
        source={lessonForm?.options?.source}
        initialError={lessonForm?.options?.error}
        onSaved={() => lessonForm?.options?.onSaved?.()}
      />
      <PaymentFormDialog
        isOpen={paymentForm !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentForm(null);
        }}
        initial={paymentForm?.initial}
        source={paymentForm?.options?.source}
        initialError={paymentForm?.options?.error}
        onSaved={() => paymentForm?.options?.onSaved?.()}
      />
      {student && (
        <>
          <StudentFormDialog isOpen={editing} onOpenChange={setEditing} studentId={student.id} />
          <RateChangeDialog isOpen={rateChange} onOpenChange={setRateChange} student={student} />
          <DeleteRateDialog
            rate={rateToDelete}
            rates={student.rates}
            studentId={student.id}
            onOpenChange={(open) => {
              if (open) return;
              setRateToDelete(null);
              // The deleted rate's menu is gone with its row: the focus would fall to <body>.
              focusWhenLost(() => changeRateRef.current);
            }}
          />
          <ArchiveStudentDialog
            student={student}
            isOpen={confirmArchive}
            onOpenChange={setConfirmArchive}
            onConfirm={() => setArchived(true)}
          />
          <DeleteStudentDialog
            student={student}
            isOpen={confirmDelete}
            onOpenChange={setConfirmDelete}
            onDeleted={() => {
              showToast(`Scheda di ${student.display_name} eliminata`);
              void navigate("/studenti");
            }}
            onArchive={requestArchive}
          />
          <ActivitySheet
            isOpen={history}
            onOpenChange={setHistory}
            studentId={student.id}
            studentName={student.display_name}
            timeZone={timeZone}
            today={today}
          />
        </>
      )}
    </>
  );
}

function StudentSubline({
  student,
  usualSubject,
}: {
  student: Student;
  usualSubject: string | null;
}) {
  const klass = [student.grade, student.school].filter(Boolean).join(" · ");
  return (
    <div className="mt-1 text-[0.9375rem] leading-[1.375rem] text-ink-2">
      {klass && <p className="m-0">{klass}</p>}
      {usualSubject && <p className="m-0">Materia abituale: {usualSubject}</p>}
      {student.guardian_name && (
        <p className="m-0">
          Referente: {student.guardian_name}
          {student.guardian_phone && (
            <>
              {" · "}
              <PhoneLink phone={student.guardian_phone} />
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** A phone number as the tutor wrote it, in the UI face: it sits in a sentence (02 §3, §7). */
function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      className="relative -my-3 inline-block py-3 text-ink-2 underline underline-offset-[3px]"
    >
      {phone}
    </a>
  );
}

/** «67,00 € TI DEVE» (display-l, Literata 500) + last payment + projected, double rule under. */
function BalanceBlock({
  balance,
  today,
  lastPayment,
}: {
  balance: Balance;
  today: string;
  lastPayment: string | null;
}) {
  const cents = balance.balance_cents;
  const flash = useFlash(cents);
  const projectedFlash = useFlash(balance.projected_balance_cents);
  const color = cents < 0 ? "text-debito" : cents > 0 ? "text-credito" : "text-ink-2";
  const word = cents < 0 ? "ti deve" : cents > 0 ? "credito" : "in pari";
  const projected = balance.projected_balance_cents;
  const projectedColor =
    projected < 0 ? "text-debito" : projected > 0 ? "text-credito" : "text-ink-2";
  return (
    <div className="mt-7 rule-total pb-4" aria-live="polite">
      <p className="m-0 text-caption text-ink-3 uppercase">Saldo al {balanceDate(today)}</p>
      <p className="m-0 mt-1.5 mb-1.5">
        <span className="sr-only">{balanceSpeech(cents, balance.credit_minutes)}</span>
        <span
          aria-hidden
          className={cx(
            "font-display text-display-l font-medium tabular-nums",
            color,
            flash && "marker",
          )}
        >
          {formatAmountColumn(cents)}
          <small className="ml-0.5 text-[0.55em] font-normal">€</small>
          <span className="ml-3.5 align-[0.55em] font-ui text-[0.8125rem] font-semibold tracking-[0.06em] uppercase">
            {word}
          </span>
        </span>
      </p>
      {cents > 0 && balance.credit_minutes !== null && balance.current_hourly_rate_cents && (
        <p className="m-0 text-[0.9375rem] leading-[1.375rem] text-ink-2">
          {capitalize(formatCreditMinutesText(balance.credit_minutes))} di lezione a{" "}
          {formatRate(balance.current_hourly_rate_cents)}.
        </p>
      )}
      {lastPayment && (
        <p className="m-0 mt-1 text-[0.9375rem] leading-[1.375rem] text-ink-2">{lastPayment}</p>
      )}
      {balance.scheduled_cents > 0 && (
        <p className="m-0 mt-2 text-[0.9375rem] leading-[1.375rem] text-ink-2">
          Previsto con le lezioni programmate:{" "}
          <b
            className={cx(
              "font-semibold whitespace-nowrap",
              projectedColor,
              projectedFlash && "marker",
            )}
          >
            {balanceWords(projected)}
          </b>
        </p>
      )}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("it-IT") + text.slice(1);
}

/** Rates (with «Cambia tariffa…»), contacts and private notes; the edit buttons at the end. */
function StudentDetails({
  student,
  today,
  onChangeRate,
  changeRateRef,
  onDeleteRate,
  footer,
}: {
  student: Student;
  today: string;
  onChangeRate: () => void;
  changeRateRef?: Ref<HTMLButtonElement>;
  onDeleteRate: (rate: Rate) => void;
  footer: ReactNode;
}) {
  const rates = [...student.rates].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  const current = rateOn(student.rates, today);
  const contacts: { label: string; value: ReactNode }[] = [];
  if (student.phone)
    contacts.push({ label: "Telefono", value: <PhoneLink phone={student.phone} /> });
  if (student.email) contacts.push({ label: "Email", value: <MailLink email={student.email} /> });
  // The guardian's name and phone are already under the student's name.
  if (student.guardian_email) {
    contacts.push({ label: "Email referente", value: <MailLink email={student.guardian_email} /> });
  }
  return (
    <div>
      <section aria-labelledby={`rates-${student.id}`} className="mt-7">
        <h2
          id={`rates-${student.id}`}
          className="m-0 border-b border-rule-strong pb-1.5 text-caption text-ink-3 uppercase"
        >
          Tariffa oraria
        </h2>
        <ul className="m-0 list-none p-0">
          {rates.map((rate) => (
            <li
              key={rate.id}
              className={cx(
                "flex min-h-11 items-center justify-between gap-2 border-b border-rule text-[0.9375rem]",
                current && rate.effective_from < current.effective_from ? "text-ink-3" : "text-ink",
              )}
            >
              <span>dal {dayMonthYear(rate.effective_from)}</span>
              <span className="ml-auto font-money tabular-nums">
                {formatRate(rate.hourly_rate_cents)}
              </span>
              {rates.length > 1 && (
                <ActionMenu
                  size="sm"
                  label={`Azioni per la tariffa dal ${dayMonthYear(rate.effective_from)}`}
                  items={[
                    {
                      id: "delete",
                      label: "Elimina tariffa",
                      icon: EraserIcon,
                      danger: true,
                      onAction: () => onDeleteRate(rate),
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
        <Button variant="quiet" className="-ml-2.5 mt-1" onPress={onChangeRate} ref={changeRateRef}>
          Cambia tariffa…
        </Button>
      </section>
      {contacts.length > 0 && (
        <section aria-labelledby={`contacts-${student.id}`} className="mt-6">
          <h2
            id={`contacts-${student.id}`}
            className="m-0 border-b border-rule-strong pb-1.5 text-caption text-ink-3 uppercase"
          >
            Contatti
          </h2>
          <dl className="m-0">
            {contacts.map((contact) => (
              <div
                key={contact.label}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-rule text-[0.9375rem]"
              >
                <dt className="text-ink-3">{contact.label}</dt>
                <dd className="m-0 min-w-0 truncate text-right text-ink">{contact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {student.notes && (
        <section aria-labelledby={`notes-${student.id}`} className="mt-6">
          <h2
            id={`notes-${student.id}`}
            className="m-0 border-b border-rule-strong pb-1.5 text-caption text-ink-3 uppercase"
          >
            Note (solo per te)
          </h2>
          <p className="m-0 mt-2 text-[0.9375rem] leading-[1.375rem] whitespace-pre-line text-ink-2">
            {student.notes}
          </p>
        </section>
      )}
      {footer}
    </div>
  );
}

function MailLink({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="relative -my-3 inline-block py-3 text-ink-2 underline underline-offset-[3px]"
    >
      {email}
    </a>
  );
}

function dayMonthYear(date: string): string {
  const day = parseIsoDate(date);
  return day ? `${dayMonth(date)} ${String(day.year)}` : date;
}

/** Mobile: «Tariffa · Contatti · Note ▸», a section folded at the bottom of the page. */
function MobileDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-6 border-t-2 border-ink pt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-row w-full cursor-pointer items-center justify-between gap-2 text-left text-body font-medium text-ink"
      >
        Tariffa · Contatti · Note
        {open ? (
          <CaretDownIcon size={20} aria-hidden className="text-ink-3" />
        ) : (
          <CaretRightIcon size={20} aria-hidden className="text-ink-3" />
        )}
      </button>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
