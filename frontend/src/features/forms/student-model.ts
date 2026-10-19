// The student form's data (docs/design/03-schermate.md §7.4): fields 1:1 with the API, server
// limits in brackets. The rate is asked only when the student is created.
import type { Student, StudentCreate, StudentPatch } from "@/lib/api/types";
import { parseIsoDate } from "@/lib/format";
import type { ProblemMapping } from "@/lib/forms";
import { RATE_MAX_CENTS } from "./lesson-model";

/** Text fields of the student, with the server's maximum length. */
export const STUDENT_TEXT_LIMITS = {
  first_name: 80,
  last_name: 80,
  grade: 60,
  school: 120,
  phone: 40,
  email: 254,
  guardian_name: 120,
  guardian_phone: 40,
  guardian_email: 254,
  notes: 4000,
} as const;

export type StudentTextField = keyof typeof STUDENT_TEXT_LIMITS;

export type StudentField =
  StudentTextField | "default_subject_id" | "hourly_rate_cents" | "rate_effective_from";

/** Screen order (03 §7.4). */
export const STUDENT_FIELDS: readonly StudentField[] = [
  "first_name",
  "last_name",
  "grade",
  "school",
  "default_subject_id",
  "hourly_rate_cents",
  "rate_effective_from",
  "phone",
  "email",
  "guardian_name",
  "guardian_phone",
  "guardian_email",
  "notes",
];

export const STUDENT_PROBLEM_MAPPING: ProblemMapping<StudentField> = { fields: STUDENT_FIELDS };

export const STUDENT_MESSAGES = {
  firstName: "Scrivi il nome.",
  rate: "Scrivi la tariffa oraria, per esempio 20,00.",
  rateTooHigh: "La tariffa può essere al massimo di 1.000,00 €/h.",
  email: "Scrivi un indirizzo email valido.",
  date: "Scegli il giorno.",
} as const;

export interface StudentValues {
  text: Record<StudentTextField, string>;
  subjectId: string | null;
  rateCents: number | null;
  rateFrom: string;
}

const EMPTY_TEXT: Record<StudentTextField, string> = {
  first_name: "",
  last_name: "",
  grade: "",
  school: "",
  phone: "",
  email: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  notes: "",
};

/** A new student: the rate is the profile's default if there is one, valid from today. */
export function newStudentValues(
  initial: { first_name?: string; last_name?: string },
  defaults: { today: string; rateCents: number | null },
): StudentValues {
  return {
    text: {
      ...EMPTY_TEXT,
      first_name: initial.first_name ?? "",
      last_name: initial.last_name ?? "",
    },
    subjectId: null,
    rateCents: defaults.rateCents,
    rateFrom: defaults.today,
  };
}

export function studentToValues(student: Student): StudentValues {
  const text = { ...EMPTY_TEXT };
  for (const field of Object.keys(EMPTY_TEXT) as StudentTextField[]) {
    text[field] = student[field] ?? "";
  }
  return { text, subjectId: student.default_subject_id ?? null, rateCents: null, rateFrom: "" };
}

/** «Giovanni Rossi» typed in the search → first name «Giovanni», last name «Rossi». */
export function splitName(query: string): { first_name: string; last_name: string } {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return { first_name: words[0] ?? "", last_name: words.slice(1).join(" ") };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkStudent(
  values: StudentValues,
  mode: "create" | "edit",
): Partial<Record<StudentField, string>> {
  const errors: Partial<Record<StudentField, string>> = {};
  if (values.text.first_name.trim() === "") errors.first_name = STUDENT_MESSAGES.firstName;
  for (const field of ["email", "guardian_email"] as const) {
    const email = values.text[field].trim();
    if (email !== "" && !EMAIL.test(email)) errors[field] = STUDENT_MESSAGES.email;
  }
  if (mode === "create") {
    if (values.rateCents === null) errors.hourly_rate_cents = STUDENT_MESSAGES.rate;
    else if (values.rateCents > RATE_MAX_CENTS) {
      errors.hourly_rate_cents = STUDENT_MESSAGES.rateTooHigh;
    }
    if (!parseIsoDate(values.rateFrom)) errors.rate_effective_from = STUDENT_MESSAGES.date;
  }
  return errors;
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

export function studentCreateBody(values: StudentValues): StudentCreate {
  return {
    first_name: values.text.first_name.trim(),
    last_name: textOrNull(values.text.last_name),
    grade: textOrNull(values.text.grade),
    school: textOrNull(values.text.school),
    phone: textOrNull(values.text.phone),
    email: textOrNull(values.text.email),
    guardian_name: textOrNull(values.text.guardian_name),
    guardian_phone: textOrNull(values.text.guardian_phone),
    guardian_email: textOrNull(values.text.guardian_email),
    notes: textOrNull(values.text.notes),
    default_subject_id: values.subjectId,
    hourly_rate_cents: values.rateCents ?? 0,
    rate_effective_from: values.rateFrom,
  };
}

/** PATCH /students/{id}: only the fields that changed (an emptied field becomes null). */
export function studentPatchBody(values: StudentValues, original: Student): StudentPatch {
  const patch: StudentPatch = {};
  for (const field of Object.keys(EMPTY_TEXT) as StudentTextField[]) {
    const next =
      field === "first_name" ? values.text[field].trim() : textOrNull(values.text[field]);
    if (next !== (original[field] ?? null)) patch[field] = next;
  }
  if (values.subjectId !== (original.default_subject_id ?? null)) {
    patch.default_subject_id = values.subjectId;
  }
  return patch;
}

export function studentUndoPatch(patch: StudentPatch, original: Student): StudentPatch {
  const undo: StudentPatch = {};
  for (const key of Object.keys(patch) as (keyof StudentPatch)[]) {
    undo[key] = original[key] ?? null;
  }
  return undo;
}

export function studentValuesDiffer(a: StudentValues, b: StudentValues): boolean {
  if (a.subjectId !== b.subjectId || a.rateCents !== b.rateCents || a.rateFrom !== b.rateFrom) {
    return true;
  }
  return (Object.keys(a.text) as StudentTextField[]).some(
    (field) => a.text[field] !== b.text[field],
  );
}
