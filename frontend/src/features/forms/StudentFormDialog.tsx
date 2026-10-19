// «Nuovo studente» / «Modifica dati» (docs/design/03-schermate.md §7.4): POST /students and
// PATCH /students/{id}. Fields 1:1 with the API; the rate is asked only at creation (later it
// changes with «Cambia tariffa…»).
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/Button";
import { DayField } from "@/components/DateTime";
import { Sheet, SheetActions } from "@/components/Dialog";
import { FormNote, MoneyField, TextAreaField, TextField } from "@/components/Field";
import { Select } from "@/components/Select";
import { LoadErrorBand, SkeletonRows } from "@/components/States";
import type { Student } from "@/lib/api/types";
import { useFormErrors } from "@/lib/forms";
import { studentQuery, subjectsQuery, useCreateStudent, useUpdateStudent } from "@/lib/queries";
import { useTutorClock } from "./clock";
import {
  STUDENT_PROBLEM_MAPPING,
  STUDENT_TEXT_LIMITS,
  type StudentTextField,
  type StudentValues,
  checkStudent,
  newStudentValues,
  splitName,
  studentCreateBody,
  studentPatchBody,
  studentToValues,
  studentUndoPatch,
  studentValuesDiffer,
} from "./student-model";
import { patchStudentNow } from "./undo";
import { useUndoToast } from "./useUndoToast";

export interface StudentFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Edit this student («Modifica dati»); absent = a new student. */
  studentId?: string | null;
  /** New student: what was typed in a search («Aggiungi Giovanni come studente»). */
  initialName?: string;
  /** New student: open their page after saving (default true). */
  openAfterCreate?: boolean;
  onSaved?: (student: Student) => void;
}

export function StudentFormDialog(props: StudentFormDialogProps) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.isOpen);
  if (props.isOpen !== wasOpen) {
    setWasOpen(props.isOpen);
    if (props.isOpen) setSession((n) => n + 1);
  }
  return <StudentFormSheet key={session} {...props} />;
}

const SECTION = "m-0 border-t border-rule pt-4 text-caption text-ink-3 uppercase";
const PHONE_HINT = "Per WhatsApp: se non è un numero italiano scrivi il prefisso (es. +41 …).";

function StudentFormSheet({
  isOpen,
  onOpenChange,
  studentId,
  initialName = "",
  openAfterCreate = true,
  onSaved,
}: StudentFormDialogProps) {
  const editing = Boolean(studentId);
  const navigate = useNavigate();
  const { today, timeZone, profile } = useTutorClock();
  const showToast = useUndoToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const errors = useFormErrors(STUDENT_PROBLEM_MAPPING, bodyRef);
  const studentResult = useQuery({ ...studentQuery(studentId ?? ""), enabled: isOpen && editing });
  const original = studentResult.data ?? null;
  const subjects = useQuery({ ...subjectsQuery(false), enabled: isOpen }).data;
  const create = useCreateStudent();
  const update = useUpdateStudent();

  const [startValues] = useState<StudentValues | null>(() =>
    editing
      ? null
      : newStudentValues(splitName(initialName), {
          today,
          rateCents: profile?.default_hourly_rate_cents ?? null,
        }),
  );
  const [values, setValues] = useState<StudentValues | null>(startValues);
  const [baseline, setBaseline] = useState<StudentValues | null>(startValues);
  if (editing && original && values === null) {
    const loaded = studentToValues(original);
    setValues(loaded);
    setBaseline(loaded);
  }
  const pending = create.isPending || update.isPending;
  const dirty = values !== null && baseline !== null && studentValuesDiffer(values, baseline);

  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }));
  const usual = original?.default_subject_id;
  if (usual && !subjectOptions.some((o) => o.id === usual)) {
    subjectOptions.push({ id: usual, label: "Materia archiviata" });
  }

  function setText(field: StudentTextField, text: string) {
    setValues((current) =>
      current ? { ...current, text: { ...current.text, [field]: text } } : current,
    );
    errors.clearField(field);
  }

  function textField(
    field: StudentTextField,
    label: string,
    extra: Partial<{
      required: boolean;
      hint: string;
      type: string;
      autoComplete: string;
      inputMode: "tel" | "email";
    }> = {},
  ) {
    if (!values) return null;
    return (
      <TextField
        label={label}
        value={values.text[field]}
        onChange={(text) => setText(field, text)}
        maxLength={STUDENT_TEXT_LIMITS[field]}
        error={errors.fields[field]}
        required={extra.required}
        hint={extra.hint}
        type={extra.type}
        autoComplete={extra.autoComplete ?? "off"}
        inputMode={extra.inputMode}
      />
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || pending) return;
    const local = checkStudent(values, editing ? "edit" : "create");
    if (Object.keys(local).length > 0) {
      errors.show(local);
      return;
    }
    try {
      if (editing && original) {
        const patch = studentPatchBody(values, original);
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
        const saved = await update.mutateAsync({ id: original.id, patch });
        onOpenChange(false);
        const undo = studentUndoPatch(patch, original);
        showToast(`Dati di ${saved.display_name} salvati`, (qc) =>
          patchStudentNow(qc, saved.id, undo),
        );
        onSaved?.(saved);
      } else {
        const saved = await create.mutateAsync(studentCreateBody(values));
        onOpenChange(false);
        showToast(`Scheda di ${saved.display_name} creata`);
        onSaved?.(saved);
        if (openAfterCreate) void navigate(`/studenti/${saved.id}`);
      }
    } catch (error) {
      errors.fromProblem(error);
    }
  }

  let body;
  if (editing && !original) {
    body = studentResult.isError ? (
      <LoadErrorBand
        onRetry={() => void studentResult.refetch()}
        isRetrying={studentResult.isFetching}
        timeZone={timeZone}
      />
    ) : (
      <SkeletonRows rows={4} rowClassName="min-h-16" />
    );
  } else if (values) {
    body = (
      <div ref={bodyRef} className="flex flex-col gap-5 pt-1">
        <div className="grid gap-5 md:grid-cols-2">
          {textField("first_name", "Nome", { required: true, autoComplete: "off" })}
          {textField("last_name", "Cognome")}
          {textField("grade", "Classe", { hint: "es. 3ª liceo scientifico" })}
          {textField("school", "Scuola")}
        </div>
        <Select
          label="Materia abituale"
          options={subjectOptions}
          value={values.subjectId}
          onChange={(id) => {
            setValues((current) => (current ? { ...current, subjectId: id } : current));
            errors.clearField("default_subject_id");
          }}
          emptyOption="Nessuna materia"
          optional
          hint="È la materia proposta nel modulo Lezione."
          error={errors.fields.default_subject_id}
        />
        {!editing && (
          <div className="grid gap-5 md:grid-cols-2">
            <MoneyField
              label="Tariffa oraria"
              unit="€/h"
              required
              value={values.rateCents}
              onChange={(cents) => {
                setValues((current) => (current ? { ...current, rateCents: cents } : current));
                errors.clearField("hourly_rate_cents");
              }}
              error={errors.fields.hourly_rate_cents}
            />
            <DayField
              label="Valida dal"
              value={values.rateFrom}
              today={today}
              timeZone={timeZone}
              shortcuts={false}
              onChange={(date) => {
                setValues((current) => (current ? { ...current, rateFrom: date } : current));
                errors.clearField("rate_effective_from");
              }}
              error={errors.fields.rate_effective_from}
              hint="Una data passata serve per chi segue già da prima."
            />
          </div>
        )}
        {/* Groups named by their heading: «Telefono» of the student vs of the guardian. */}
        <div role="group" aria-labelledby={`${formId}-student`} className="flex flex-col gap-5">
          <h3 id={`${formId}-student`} className={SECTION}>
            Studente
          </h3>
          <div className="grid gap-5 md:grid-cols-2">
            {textField("phone", "Telefono", { type: "tel", inputMode: "tel", hint: PHONE_HINT })}
            {textField("email", "Email", { type: "email", inputMode: "email" })}
          </div>
        </div>
        <div role="group" aria-labelledby={`${formId}-guardian`} className="flex flex-col gap-5">
          <h3 id={`${formId}-guardian`} className={SECTION}>
            Genitore o referente
          </h3>
          {textField("guardian_name", "Nome")}
          <div className="grid gap-5 md:grid-cols-2">
            {textField("guardian_phone", "Telefono", {
              type: "tel",
              inputMode: "tel",
              hint: PHONE_HINT,
            })}
            {textField("guardian_email", "Email", { type: "email", inputMode: "email" })}
          </div>
        </div>
        <TextAreaField
          label="Note (solo per te)"
          value={values.text.notes}
          onChange={(text) => setText("notes", text)}
          maxLength={STUDENT_TEXT_LIMITS.notes}
          error={errors.fields.notes}
        />
      </div>
    );
  }

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={editing ? "Modifica dati" : "Nuovo studente"}
      subtitle={editing && original ? original.display_name : undefined}
      isDirty={dirty}
      onSubmit={(event) => void submit(event)}
      hideCloseButton
      note={errors.form ? <FormNote>{errors.form}</FormNote> : null}
      actions={({ close }) => (
        <SheetActions>
          <Button variant="line" onPress={close} isDisabled={pending}>
            Annulla
          </Button>
          {(!editing || original) && (
            <Button variant="ink" type="submit" isPending={pending}>
              Salva studente
            </Button>
          )}
        </SheetActions>
      )}
    >
      {body}
    </Sheet>
  );
}
