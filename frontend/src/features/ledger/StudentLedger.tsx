// The student's ledger on /studenti/:id (docs/design/03-schermate.md §5, 02 §9.6): the Matita line
// (or the «+» alone) as first row, then scheduled lessons, then the rows in the balance, newest
// first; the current and previous month, «Mostra agosto» for older ones, «Esporta CSV».
// Tap on a row → edit sheet; desktop rows have «Modifica · ⋯» (Duplica…, Elimina).
import {
  CaretDownIcon,
  CopySimpleIcon,
  DownloadSimpleIcon,
  EraserIcon,
  PencilSimpleIcon,
  PencilSimpleSlashIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/auth";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FormNote } from "@/components/Field";
import {
  Ledger,
  LedgerCarryRow,
  LedgerEntryRow,
  type LedgerEntryRowProps,
  LedgerRateRow,
  LedgerSlotRow,
} from "@/components/Ledger";
import { useLedgerLayout } from "@/components/ledger-context";
import { type LedgerLineProps, useMatitaSlots } from "@/components/shell/matita-slot";
import { cx, formatShortDate, lessonTiming } from "@/components/utils";
import { downloadStudentLedgerCsv } from "@/lib/api/download";
import { errorMessage } from "@/lib/api/problem";
import type { LedgerEntry, Ledger as LedgerData, Student } from "@/lib/api/types";
import { addDays } from "@/lib/format";
import { useDuplicateLesson } from "@/lib/queries";
import {
  ActionMenu,
  DeleteLessonDialog,
  DeletePaymentDialog,
  DuplicateToStudentDialog,
  LessonFormDialog,
  type LessonToDelete,
  PaymentFormDialog,
  type PaymentToDelete,
  deleteLessonNow,
  lessonSavedMessage,
  useUndoToast,
} from "@/features/forms";
import { focusWhenLost } from "@/features/settings/focus";
import { buildLedgerView, monthsToShow, showMonthLabel } from "./ledger-model";

export interface StudentLedgerProps {
  student: Student;
  ledger: LedgerData;
  today: string;
  nowMinutes: number;
  /** Row to highlight (from Oggi / Agenda: ?riga=…), for 1,2 s. */
  highlightId?: string | null;
  /** Props for the Matita line (openLessonForm etc. come from the page). */
  line: Omit<LedgerLineProps, "student" | "balanceCents" | "today">;
  /** «+» when Matita is not there. */
  onNewLesson: () => void;
}

type EditTarget = { kind: "lesson" | "payment"; id: string } | null;

export function StudentLedger({
  student,
  ledger,
  today,
  nowMinutes,
  highlightId = null,
  line,
  onNewLesson,
}: StudentLedgerProps) {
  const { LedgerLine } = useMatitaSlots();
  const { config } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const highlighted = ledger.items.find((entry) => entry.id === highlightId) ?? null;
  const [months, setMonths] = useState(() =>
    Math.max(2, highlighted ? monthsToShow(highlighted.date, today) : 2),
  );
  const view = buildLedgerView(ledger.items, student.rates, { today, months });
  const [editing, setEditing] = useState<EditTarget>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LessonToDelete | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentToDelete | null>(null);
  const [duplicateFor, setDuplicateFor] = useState<LedgerEntry | null>(null);
  const duplicate = useDuplicateLesson();
  const showToast = useUndoToast();
  const csv = useMutation({ mutationFn: () => downloadStudentLedgerCsv(student.id) });
  const [rowError, setRowError] = useState<string | null>(null);
  /** Position (among the entries on screen) of the row last opened or acted on. */
  const actedOn = useRef<number | null>(null);

  function actOn(id: string) {
    actedOn.current = view.rows
      .filter((row) => row.type === "entry")
      .findIndex((row) => row.entry.id === id);
  }

  /**
   * After a sheet or a confirmation closes: when its row is gone (deleted, moved to another
   * student) the focus would fall back to <body> (WCAG 2.4.3). It goes to the row that took its
   * place instead, or to the line at the top of the ledger.
   */
  function keepFocusInLedger() {
    const index = actedOn.current;
    if (index === null || index < 0) return;
    focusWhenLost(() => {
      const container = containerRef.current;
      const openers = container?.querySelectorAll<HTMLElement>("[data-ledger-open]") ?? [];
      return (
        openers[Math.min(index, openers.length - 1)] ??
        container?.querySelector<HTMLElement>("textarea, button")
      );
    });
  }

  // Scroll the highlighted row into view once (instant with reduced motion).
  const highlightIndex = view.rows.findIndex(
    (row) => row.type === "entry" && row.entry.id === highlightId,
  );
  useEffect(() => {
    if (highlightIndex < 0) return;
    const rows = containerRef.current?.querySelectorAll("tbody > tr, ol > li");
    const target = rows?.[highlightIndex + 1];
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [highlightIndex]);

  async function duplicateNextWeek(entry: LedgerEntry) {
    setRowError(null);
    try {
      const copy = await duplicate.mutateAsync({
        id: entry.id,
        body: { date: addDays(entry.date, 7) },
      });
      showToast(lessonSavedMessage(copy, today), (qc) => deleteLessonNow(qc, copy));
    } catch (error) {
      setRowError(errorMessage(error));
    }
  }

  function rowActions(entry: LedgerEntry) {
    const when = formatShortDate(entry.date, today);
    const isLesson = entry.kind === "lesson";
    const edit = {
      id: "edit",
      label: "Modifica",
      icon: PencilSimpleIcon,
      onAction: () => {
        actOn(entry.id);
        setEditing({ kind: entry.kind, id: entry.id });
      },
    };
    // Only the «⋯» (with «Modifica» in it: the row itself opens it too), in a zero-width box that
    // floats over the end of the Voce cell on hover/focus, so the text keeps the column's width.
    return (
      <span className="relative block h-9 w-0">
        <ActionMenu
          className="absolute top-0 right-0 bg-paper-raised"
          size="sm"
          label={
            isLesson ? `Azioni per la lezione di ${when}` : `Azioni per il pagamento del ${when}`
          }
          items={
            isLesson
              ? [
                  edit,
                  {
                    id: "next-week",
                    label: "Duplica la settimana dopo",
                    icon: CopySimpleIcon,
                    onAction: () => void duplicateNextWeek(entry),
                  },
                  {
                    id: "other-student",
                    label: "Duplica per un altro studente",
                    icon: CopySimpleIcon,
                    onAction: () => {
                      actOn(entry.id);
                      setDuplicateFor(entry);
                    },
                  },
                  {
                    id: "delete",
                    label: "Elimina",
                    icon: EraserIcon,
                    danger: true,
                    onAction: () => {
                      actOn(entry.id);
                      setLessonToDelete({
                        id: entry.id,
                        studentId: student.id,
                        date: entry.date,
                        amountCents: entry.debit_cents,
                        settled: entry.settled,
                        inCalendar: entry.calendar !== null && entry.calendar.status !== "off",
                      });
                    },
                  },
                ]
              : [
                  edit,
                  {
                    id: "delete",
                    label: "Elimina",
                    icon: EraserIcon,
                    danger: true,
                    onAction: () => {
                      actOn(entry.id);
                      setPaymentToDelete({
                        id: entry.id,
                        studentId: student.id,
                        date: entry.date,
                        amountCents: entry.credit_cents,
                        method: entry.method ?? "cash",
                        note: entry.note,
                      });
                    },
                  },
                ]
          }
        />
      </span>
    );
  }

  // ↑/↓ move between the rows, Enter opens one (02 §10.5); the row's first button opens it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const container = containerRef.current;
    if (!container) return;
    const openers = [...container.querySelectorAll("tbody > tr, ol > li")]
      .map((row) => row.querySelector<HTMLButtonElement>("button"))
      .filter((button): button is HTMLButtonElement => button !== null);
    const index = openers.findIndex((button) => button === document.activeElement);
    if (index === -1) return;
    const next = openers[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  const lineProps: LedgerLineProps = {
    ...line,
    student: {
      id: student.id,
      first_name: student.first_name,
      display_name: student.display_name,
    },
    balanceCents: ledger.balance.balance_cents,
    today,
  };

  return (
    <div>
      {/* The keydown only moves focus between row buttons that are already in the tab order. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div ref={containerRef} onKeyDown={onKeyDown}>
        <Ledger caption={`Registro di ${student.display_name}`}>
          {LedgerLine && config?.assistant_available ? (
            <LedgerLine {...lineProps} />
          ) : (
            <ManualLineRow
              assistantOff={config?.assistant_available === false}
              onNewLesson={onNewLesson}
            />
          )}
          {view.shownEntries === 0 && <BlankPageRow />}
          {view.rows.map((row) => {
            switch (row.type) {
              case "entry": {
                const entry = row.entry;
                const timing =
                  entry.kind === "lesson" && !entry.settled && entry.start_time && entry.end_time
                    ? lessonTiming(
                        {
                          date: entry.date,
                          start_time: entry.start_time,
                          end_time: entry.end_time,
                        },
                        today,
                        nowMinutes,
                      )
                    : null;
                return (
                  <EntryRow
                    key={`${entry.kind}-${entry.id}`}
                    entry={entry}
                    today={today}
                    timing={
                      timing ? (timing.inProgress ? timing.label : `oggi · ${timing.label}`) : null
                    }
                    highlighted={entry.id === highlightId}
                    onOpen={() => {
                      actOn(entry.id);
                      setEditing({ kind: entry.kind, id: entry.id });
                    }}
                    actions={rowActions(entry)}
                  />
                );
              }
              case "rate":
                return (
                  <LedgerRateRow
                    key={`rate-${row.rate.id}`}
                    date={row.rate.effective_from}
                    today={today}
                    fromCents={row.previous.hourly_rate_cents}
                    toCents={row.rate.hourly_rate_cents}
                  />
                );
              case "carry":
                return (
                  <LedgerCarryRow
                    key="carry"
                    date={row.date}
                    today={today}
                    balanceCents={row.balanceCents}
                  />
                );
            }
          })}
        </Ledger>
      </div>
      {rowError && <FormNote className="mt-3">{rowError}</FormNote>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {view.nextHiddenMonth ? (
          <Button variant="quiet" icon={CaretDownIcon} onPress={() => setMonths((m) => m + 1)}>
            {showMonthLabel(view.nextHiddenMonth, today)}
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="line"
          size="sm"
          icon={DownloadSimpleIcon}
          isPending={csv.isPending}
          onPress={() => csv.mutate()}
        >
          Esporta CSV
        </Button>
      </div>
      {csv.isError && <FormNote className="mt-2">{errorMessage(csv.error)}</FormNote>}

      <LessonFormDialog
        isOpen={editing?.kind === "lesson"}
        onOpenChange={(open) => {
          if (open) return;
          setEditing(null);
          keepFocusInLedger();
        }}
        lessonId={editing?.kind === "lesson" ? editing.id : null}
      />
      <PaymentFormDialog
        isOpen={editing?.kind === "payment"}
        onOpenChange={(open) => {
          if (open) return;
          setEditing(null);
          keepFocusInLedger();
        }}
        paymentId={editing?.kind === "payment" ? editing.id : null}
      />
      <DeleteLessonDialog
        lesson={lessonToDelete}
        onOpenChange={(open) => {
          if (open) return;
          setLessonToDelete(null);
          keepFocusInLedger();
        }}
      />
      <DeletePaymentDialog
        payment={paymentToDelete}
        onOpenChange={(open) => {
          if (open) return;
          setPaymentToDelete(null);
          keepFocusInLedger();
        }}
      />
      {duplicateFor && (
        <DuplicateToStudentDialog
          isOpen
          onOpenChange={(open) => {
            if (open) return;
            setDuplicateFor(null);
            keepFocusInLedger();
          }}
          lesson={{
            id: duplicateFor.id,
            date: duplicateFor.date,
            start_time: duplicateFor.start_time,
            student: { id: student.id, display_name: student.display_name },
          }}
        />
      )}
    </div>
  );
}

/** A ledger row; the desktop «Modifica · ⋯» actions only exist in the table layout. */
function EntryRow({ actions, ...props }: LedgerEntryRowProps & { actions: ReactNode }) {
  const layout = useLedgerLayout();
  return <LedgerEntryRow {...props} actions={layout === "table" ? actions : undefined} />;
}

/**
 * Empty ledger (03 §5): six blank dashed lines and «Pagina bianca…», written in the Voce column,
 * after the red margin line, aligned with the first row above it (as ManualLineRow).
 */
function BlankPageRow() {
  const layout = useLedgerLayout();
  return (
    <LedgerSlotRow>
      <EmptyState
        blankPage
        className={cx("pt-2 pr-3 pb-4", layout === "table" ? "pl-[116px]" : "pl-[84px]")}
      >
        Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo.
      </EmptyState>
    </LedgerSlotRow>
  );
}

/** First row without Matita: the «+» for the lesson form (and why Matita is not there). */
function ManualLineRow({
  assistantOff,
  onNewLesson,
}: {
  assistantOff: boolean;
  onNewLesson: () => void;
}) {
  const layout = useLedgerLayout();
  return (
    <LedgerSlotRow>
      {/* Text starts after the red margin line (104 px in the table, 72 px in the list). */}
      <div
        className={cx(
          "flex min-h-14 items-center gap-3 border-b border-ink-3 py-1.5 pr-3",
          layout === "table" ? "pl-[116px]" : "pl-[84px]",
        )}
      >
        {assistantOff ? (
          <p className="m-0 flex min-w-0 flex-1 items-start gap-2 text-[0.875rem] leading-5 text-ink-3">
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
          onPress={onNewLesson}
        />
      </div>
    </LedgerSlotRow>
  );
}
