// «Nuova lezione» / «Modifica lezione» (docs/design/03-schermate.md §7.1): POST /lessons and
// PATCH /lessons/{id}. Sheet on mobile, 560 px dialog on desktop. The rate comes from the student's
// history and is shown read-only; it is sent only when the tutor writes one for this lesson (D-16).
// Exported for Matita: «Modifica» on a draft opens this form prefilled (`initial`, `source`).
import {
  CaretDownIcon,
  CaretRightIcon,
  CloudCheckIcon,
  CloudIcon,
  CloudSlashIcon,
  CopySimpleIcon,
  EraserIcon,
  StudentIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/app/auth";
import { Button, InlineButton } from "@/components/Button";
import { DayField, TimeRangeField } from "@/components/DateTime";
import { Sheet, SheetActions } from "@/components/Dialog";
import { FormNote, MoneyField, TextAreaField, TextField } from "@/components/Field";
import { SearchSelect, Select, type SelectOption } from "@/components/Select";
import { LoadErrorBand, Note, SkeletonRows } from "@/components/States";
import { formatShortDate } from "@/components/utils";
import type { WriteSource } from "@/lib/api/client";
import { isApiProblem } from "@/lib/api/problem";
import type { Lesson, LedgerEntry, Ledger } from "@/lib/api/types";
import { addDays, daysBetween } from "@/lib/format";
import { useFormErrors } from "@/lib/forms";
import {
  calendarStatusQuery,
  lessonQuery,
  queryKeys,
  studentQuery,
  studentsQuery,
  subjectsQuery,
  useCreateLesson,
  useDuplicateLesson,
  useUpdateLesson,
} from "@/lib/queries";
import { ActionMenu } from "./ActionMenu";
import { useTutorClock } from "./clock";
import { DeleteLessonDialog } from "./confirmations";
import { DuplicateToStudentDialog } from "./DuplicateToStudentDialog";
import type { LessonToDelete } from "./effects";
import {
  LESSON_PROBLEM_MAPPING,
  type LessonField,
  type LessonInitial,
  type LessonValues,
  NOTES_MAX,
  TOPIC_MAX,
  checkLesson,
  lessonCreateBody,
  lessonDateRange,
  lessonPatchBody,
  lessonToValues,
  lessonUndoPatch,
  lessonValuesDiffer,
  newLessonValues,
  timeToMinutes,
} from "./lesson-model";
import { lessonSavedMessage } from "./messages";
import { dayMonth, formatRate, lessonSummary, rateOn } from "./money-words";
import { StudentFormDialog } from "./StudentFormDialog";
import { deleteLessonNow, patchLessonNow } from "./undo";
import { useUndoToast } from "./useUndoToast";

export interface LessonFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Edit this lesson (read with GET /lessons/{id}, private notes included). */
  lessonId?: string | null;
  /** Prefill of a new lesson: the student page passes the student, a Matita draft everything. */
  initial?: LessonInitial;
  /** `assistant` when the form confirms a Matita draft (X-RipetiFlow-Source). */
  source?: WriteSource;
  /** Errors of a failed write to show at opening (e.g. the 422 of «Ripassa a penna»). */
  initialError?: unknown;
  /** After a successful save (the toast is already shown). */
  onSaved?: (lesson: Lesson) => void;
}

/** A fresh form every time it opens (the sheet stays mounted while it closes, for the animation). */
export function LessonFormDialog(props: LessonFormDialogProps) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.isOpen);
  if (props.isOpen !== wasOpen) {
    setWasOpen(props.isOpen);
    if (props.isOpen) setSession((n) => n + 1);
  }
  return <LessonFormSheet key={session} {...props} />;
}

const NO_FIELD_ERRORS: Partial<Record<LessonField, string>> = {};

function lastSubjectOf(ledger: Ledger | undefined): string | null {
  const entry = ledger?.items.find((item: LedgerEntry) => item.kind === "lesson" && item.subject);
  return entry?.subject?.id ?? null;
}

function LessonFormSheet({
  isOpen,
  onOpenChange,
  lessonId,
  initial,
  source,
  initialError,
  onSaved,
}: LessonFormDialogProps) {
  const editing = Boolean(lessonId);
  const { today, timeZone, nowMinutes, profile } = useTutorClock();
  const { config } = useAuth();
  const queryClient = useQueryClient();
  const showToast = useUndoToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const errors = useFormErrors(LESSON_PROBLEM_MAPPING, bodyRef);
  const rateId = useId();

  const [toDelete, setToDelete] = useState<LessonToDelete | null>(null);

  // --- data ---
  // Not while its deletion is being confirmed: the delete drops the cached lesson, and a refetch
  // from this still-open sheet would ask the server for a lesson that no longer exists (404).
  const lessonResult = useQuery({
    ...lessonQuery(lessonId ?? ""),
    enabled: isOpen && editing && toDelete === null,
  });
  const original = lessonResult.data ?? null;
  const [startValues] = useState<LessonValues | null>(() =>
    editing
      ? null
      : newLessonValues(initial ?? {}, {
          today,
          timeZone,
          lessonMinutes: profile?.default_lesson_minutes ?? 60,
        }),
  );
  const [values, setValues] = useState<LessonValues | null>(startValues);
  const [baseline, setBaseline] = useState<LessonValues | null>(startValues);
  if (editing && original && values === null) {
    const loaded = lessonToValues(original);
    setValues(loaded);
    setBaseline(loaded);
  }

  const students = useQuery({
    ...studentsQuery({ archived: false, sort: "name" }),
    enabled: isOpen,
  }).data;
  const subjects = useQuery({ ...subjectsQuery(false), enabled: isOpen }).data;
  const studentId = values?.studentId ?? null;
  const student = useQuery({
    ...studentQuery(studentId ?? ""),
    enabled: isOpen && !!studentId,
  }).data;
  const calendar = useQuery({
    ...calendarStatusQuery(),
    enabled: isOpen && !editing && config?.calendar_sync_available === true,
  }).data;

  const create = useCreateLesson();
  const update = useUpdateLesson();
  const duplicate = useDuplicateLesson();
  const [studentQueryText, setStudentQueryText] = useState("");
  const [rateOpenByUser, setRateOpenByUser] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [newStudentName, setNewStudentName] = useState<string | null>(null);

  // A failed «Ripassa a penna» opens the form with the server's errors on the fields (02 §9.13).
  const { fromProblem } = errors;
  useEffect(() => {
    if (initialError) fromProblem(initialError);
  }, [initialError, fromProblem]);

  // A lesson that no longer exists: the ledger behind is stale too (03 §10.3).
  const notFound = isApiProblem(lessonResult.error) && lessonResult.error.status === 404;
  useEffect(() => {
    if (notFound) void queryClient.invalidateQueries({ queryKey: queryKeys.student.all() });
  }, [notFound, queryClient]);

  // --- derived ---
  const subjectOptions: SelectOption[] = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }));
  if (original?.subject && !subjectOptions.some((o) => o.id === original.subject?.id)) {
    subjectOptions.push({ id: original.subject.id, label: original.subject.name });
  }
  const studentOptions: SelectOption[] = (students ?? []).map((s) => ({
    id: s.id,
    label: s.display_name,
    detail: s.grade ?? s.school ?? undefined,
  }));
  const extraStudent =
    original && original.student.id === studentId
      ? { id: original.student.id, label: original.student.display_name }
      : student && student.id === studentId
        ? { id: student.id, label: student.display_name }
        : null;
  if (extraStudent && !studentOptions.some((o) => o.id === extraStudent.id)) {
    studentOptions.push(extraStudent);
  }

  const cachedLedger = studentId
    ? queryClient.getQueryData<Ledger>(queryKeys.student.ledger(studentId, {}))
    : undefined;
  const usualSubject = student?.default_subject_id ?? lastSubjectOf(cachedLedger);
  const fallbackSubject =
    usualSubject && subjectOptions.some((o) => o.id === usualSubject) ? usualSubject : null;
  const subjectShown = values?.subjectId === undefined ? fallbackSubject : values.subjectId;

  const check = values ? checkLesson(values, today) : null;
  const studentChanged = Boolean(original && studentId && studentId !== original.student.id);
  const historic =
    student && student.id === studentId && values ? rateOn(student.rates, values.date) : null;
  const followRate = original && !studentChanged ? original.hourly_rate_cents : null;
  const rateShown = values?.rateTouched
    ? values.rateCents
    : (followRate ?? historic?.hourly_rate_cents ?? null);
  const rateOpen = rateOpenByUser || Boolean(errors.fields.rate);
  const dirty = values !== null && baseline !== null && lessonValuesDiffer(values, baseline);
  const pending = create.isPending || update.isPending || duplicate.isPending;
  const fieldErrors = values ? errors.fields : NO_FIELD_ERRORS;

  function set(patch: Partial<LessonValues>, field?: LessonField) {
    setValues((current) => (current ? { ...current, ...patch } : current));
    if (field) errors.clearField(field);
  }

  // --- submit ---
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || pending) return;
    const result = checkLesson(values, today);
    if (Object.keys(result.errors).length > 0) {
      errors.show(result.errors);
      return;
    }
    try {
      if (editing && original) {
        const patch = lessonPatchBody(values, result, original);
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
        const saved = await update.mutateAsync({
          id: original.id,
          patch,
          previousStudentId: original.student.id,
          source,
        });
        onOpenChange(false);
        const undo = lessonUndoPatch(patch, original);
        showToast("Lezione modificata", (qc) =>
          patchLessonNow(qc, saved.id, undo, [saved.student.id, original.student.id]),
        );
        onSaved?.(saved);
      } else {
        const body = lessonCreateBody(values, result, fallbackSubject);
        const saved = await create.mutateAsync({ body, source });
        onOpenChange(false);
        showToast(lessonSavedMessage(saved, today), (qc) => deleteLessonNow(qc, saved));
        onSaved?.(saved);
      }
    } catch (error) {
      errors.fromProblem(error);
    }
  }

  async function duplicateNextWeek() {
    if (!original) return;
    try {
      const copy = await duplicate.mutateAsync({
        id: original.id,
        body: { date: addDays(original.date, 7) },
      });
      onOpenChange(false);
      showToast(lessonSavedMessage(copy, today), (qc) => deleteLessonNow(qc, copy));
    } catch (error) {
      errors.fromProblem(error);
    }
  }

  // --- render ---
  let body: ReactNode;
  if (editing && !original) {
    body = notFound ? (
      <Note icon={CloudSlashIcon} tone="danger" role="alert">
        Questa riga non c&apos;è più: forse è stata eliminata da un&apos;altra finestra.
      </Note>
    ) : lessonResult.isError ? (
      <LoadErrorBand
        onRetry={() => void lessonResult.refetch()}
        isRetrying={lessonResult.isFetching}
        timeZone={timeZone}
      />
    ) : (
      <SkeletonRows rows={4} rowClassName="min-h-16" />
    );
  } else if (values && check) {
    body = (
      <div ref={bodyRef} className="flex flex-col gap-5 pt-1">
        <SearchSelect
          label="Studente"
          icon={StudentIcon}
          required
          options={studentOptions}
          value={values.studentId}
          onChange={(id) => set({ studentId: id }, "student")}
          query={studentQueryText}
          onQueryChange={setStudentQueryText}
          placeholder="Scegli lo studente"
          createLabel="Nuovo studente"
          onCreate={(text) => setNewStudentName(text)}
          emptyText={(text) => `Nessuno studente con «${text}» nel nome.`}
          error={fieldErrors.student}
          hint={
            studentChanged && student
              ? `Passa alla tariffa di ${student.first_name}${
                  historic ? ` (${formatRate(historic.hourly_rate_cents)})` : ""
                }, salvo che fosse scritta a mano.`
              : undefined
          }
        />
        <DayField
          value={values.date}
          today={today}
          timeZone={timeZone}
          onChange={(date) => set({ date }, "date")}
          minValue={lessonDateRange(today).min}
          maxValue={lessonDateRange(today).max}
          error={fieldErrors.date}
          hint={
            original &&
            !studentChanged &&
            !values.rateTouched &&
            values.date !== original.date &&
            historic &&
            student &&
            historic.hourly_rate_cents !== original.hourly_rate_cents ? (
              <>
                La tariffa resta {formatRate(original.hourly_rate_cents)}. Dal{" "}
                {dayMonth(historic.effective_from)} {student.first_name} ha{" "}
                {formatRate(historic.hourly_rate_cents)}.{" "}
                <InlineButton
                  onPress={() =>
                    set({ rateCents: historic.hourly_rate_cents, rateTouched: true }, "rate")
                  }
                >
                  Usa {formatRate(historic.hourly_rate_cents)}
                </InlineButton>
              </>
            ) : undefined
          }
        />
        <TimeRangeField
          start={values.start}
          end={values.end}
          onStartChange={(start) => set({ start }, "start")}
          onEndChange={(end) => set({ end }, "end")}
          startError={fieldErrors.start}
          endError={fieldErrors.end}
          warning={check.warning}
          summary={check.minutes !== null ? lessonSummary(check.minutes, rateShown) : undefined}
          note={scheduledNote(values.date, check.end, today, nowMinutes)}
        />
        <Select
          label="Materia"
          options={subjectOptions}
          value={subjectShown}
          onChange={(id) => set({ subjectId: id }, "subject")}
          emptyOption="Nessuna materia"
          optional
          error={fieldErrors.subject}
        />
        <TextField
          label="Argomento"
          optional
          value={values.topic}
          onChange={(topic) => set({ topic }, "topic")}
          maxLength={TOPIC_MAX}
          placeholder="es. equazioni di secondo grado"
          inputClassName="font-display italic"
          error={fieldErrors.topic}
        />
        <TextAreaField
          label="Note (solo per te)"
          value={values.notes}
          onChange={(notes) => set({ notes }, "notes")}
          maxLength={NOTES_MAX}
          placeholder="es. esercizi 4–9 pag. 112"
          error={fieldErrors.notes}
        />
        <div>
          <button
            type="button"
            aria-expanded={rateOpen}
            aria-controls={rateId}
            onClick={() => setRateOpenByUser((open) => !open)}
            className="-mx-1 flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-left text-[0.9375rem] font-medium text-ink-2 hover:text-ink"
          >
            {rateOpen ? (
              <CaretDownIcon size={16} aria-hidden className="shrink-0" />
            ) : (
              <CaretRightIcon size={16} aria-hidden className="shrink-0" />
            )}
            <span>
              Tariffa per questa lezione
              {rateShown !== null && (
                <>
                  : <span className="font-money">{formatRate(rateShown)}</span>
                </>
              )}
            </span>
          </button>
          <div id={rateId} hidden={!rateOpen} className="pt-2">
            {rateOpen && (
              <MoneyField
                label="Tariffa oraria"
                unit="€/h"
                value={rateShown}
                onChange={(cents) => set({ rateCents: cents, rateTouched: true }, "rate")}
                error={fieldErrors.rate}
                hint={rateHint({
                  firstName: student?.first_name ?? null,
                  date: values.date,
                  followsHistory: historic !== null && rateShown === historic.hourly_rate_cents,
                })}
              />
            )}
          </div>
        </div>
        {original ? (
          <CalendarState lesson={original} />
        ) : calendar?.connected && calendar.status === "active" ? (
          <p className="m-0 text-[0.875rem] leading-5 text-ink-3">
            Andrà in Google Calendar, calendario «RipetiFlow»: «
            {subjectOptions.find((o) => o.id === subjectShown)?.label ?? "Lezione"} ·{" "}
            {studentOptions.find((o) => o.id === values.studentId)?.label ?? "studente"}». Le note
            restano qui.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        title={editing ? "Modifica lezione" : "Nuova lezione"}
        isDirty={dirty}
        onSubmit={(event) => void submit(event)}
        hideCloseButton
        note={errors.form ? <FormNote>{errors.form}</FormNote> : null}
        actions={({ close }) =>
          editing && !original ? (
            <SheetActions>
              <Button variant="line" onPress={close}>
                Chiudi
              </Button>
            </SheetActions>
          ) : (
            <SheetActions
              start={
                original ? (
                  <div className="flex gap-2 *:flex-1 md:*:flex-none">
                    <Button
                      variant="danger"
                      icon={EraserIcon}
                      isDisabled={pending}
                      onPress={() =>
                        setToDelete({
                          id: original.id,
                          studentId: original.student.id,
                          date: original.date,
                          amountCents: original.amount_cents,
                          settled: original.settled,
                          inCalendar: original.calendar.status !== "off",
                        })
                      }
                    >
                      Elimina
                    </Button>
                    <ActionMenu
                      label="Duplica la lezione"
                      triggerLabel="Duplica"
                      variant="line"
                      items={[
                        {
                          id: "next-week",
                          label: "Duplica la settimana dopo",
                          icon: CopySimpleIcon,
                          onAction: () => void duplicateNextWeek(),
                        },
                        {
                          id: "other-student",
                          label: "Duplica per un altro studente",
                          icon: CopySimpleIcon,
                          onAction: () => setDuplicating(true),
                        },
                      ]}
                    />
                  </div>
                ) : undefined
              }
            >
              <Button variant="line" onPress={close} isDisabled={pending}>
                Annulla
              </Button>
              <Button variant="ink" type="submit" isPending={pending}>
                Salva lezione
              </Button>
            </SheetActions>
          )
        }
      >
        {body}
      </Sheet>
      <DeleteLessonDialog
        lesson={toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        onDeleted={() => onOpenChange(false)}
      />
      {original && (
        <DuplicateToStudentDialog
          isOpen={duplicating}
          onOpenChange={setDuplicating}
          lesson={original}
          onDuplicated={() => onOpenChange(false)}
        />
      )}
      <StudentFormDialog
        isOpen={newStudentName !== null}
        onOpenChange={(open) => {
          if (!open) setNewStudentName(null);
        }}
        initialName={newStudentName ?? ""}
        openAfterCreate={false}
        onSaved={(created) => set({ studentId: created.id, subjectId: undefined }, "student")}
      />
    </>
  );
}

/** «Programmata: entra nel saldo alle 18:00 di oggi.» when the lesson ends after now. */
function scheduledNote(
  date: string,
  end: string | null,
  today: string,
  nowMinutes: number,
): string | null {
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const days = daysBetween(today, date);
  if (days < 0 || (days === 0 && timeToMinutes(end) <= nowMinutes)) return null;
  const when = days === 0 ? "oggi" : days === 1 ? "domani" : formatShortDate(date, today);
  return `Programmata: entra nel saldo alle ${end} di ${when}.`;
}

function rateHint({
  firstName,
  date,
  followsHistory,
}: {
  firstName: string | null;
  date: string;
  followsHistory: boolean;
}): string {
  const tail =
    "Cambiala solo per questa lezione (sconto, lezione doppia): resterà scritta a mano e un cambio di tariffa non la toccherà.";
  if (!followsHistory || !firstName) return tail;
  return `È la tariffa di ${firstName} per il ${dayMonth(date)}. ${tail}`;
}

/** Calendar state of an existing lesson, read-only (03 §7.1). */
function CalendarState({ lesson }: { lesson: Lesson }) {
  switch (lesson.calendar.status) {
    case "synced":
      return (
        <Note icon={CloudCheckIcon} className="text-ink-2">
          In Google Calendar
        </Note>
      );
    case "pending":
      return (
        <Note icon={CloudIcon} className="text-ink-2">
          In coda per Google Calendar
        </Note>
      );
    case "error":
      return (
        <Note icon={CloudSlashIcon} tone="danger">
          {lesson.calendar.error ?? "Non è in Google Calendar."}{" "}
          <Link
            to="/impostazioni"
            className="relative -my-3 inline-flex items-center py-3 whitespace-nowrap text-ink-2 underline underline-offset-[3px]"
          >
            Risincronizza in Impostazioni
            <CaretRightIcon size={14} aria-hidden />
          </Link>
        </Note>
      );
    case "off":
      return null;
  }
}
