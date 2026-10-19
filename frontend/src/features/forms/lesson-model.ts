// The lesson form's data (docs/design/03-schermate.md §7.1) as pure functions: initial values,
// local validation (same texts as the server), and the bodies of POST /lessons and PATCH.
import type { Lesson, LessonCreate, LessonPatch } from "@/lib/api/types";
import { addMinutesToTime, defaultStartTime, parseIsoDate } from "@/lib/format";
import { type ProblemMapping, checkTimeRange } from "@/lib/forms";

export type LessonField =
  "student" | "date" | "start" | "end" | "subject" | "topic" | "notes" | "rate";

/** Screen order: the first field in error gets the focus. */
export const LESSON_FIELDS: readonly LessonField[] = [
  "student",
  "date",
  "start",
  "end",
  "subject",
  "topic",
  "notes",
  "rate",
];

/** API field → form field (03 §10.4). */
export const LESSON_PROBLEM_MAPPING: ProblemMapping<LessonField> = {
  fields: LESSON_FIELDS,
  map: {
    student_id: "student",
    subject_id: "subject",
    date: "date",
    start_time: "start",
    end_time: "end",
    hourly_rate_cents: "rate",
    topic: "topic",
    notes: "notes",
  },
};

export const TOPIC_MAX = 200;
export const NOTES_MAX = 4000;
/** Server limit of a rate: 0 to 1.000,00 €/h. */
export const RATE_MAX_CENTS = 100_000;

export const LESSON_MESSAGES = {
  student: "Scegli lo studente.",
  date: "Scegli il giorno.",
  tooFar: "La data è troppo lontana: al massimo due anni da oggi.",
  start: "Scrivi l'orario di inizio.",
  end: "Scrivi l'orario di fine.",
  rate: "Scrivi la tariffa oraria, per esempio 20,00.",
  rateTooHigh: "La tariffa può essere al massimo di 1.000,00 €/h.",
} as const;

/**
 * What the form opens with. Every field is optional: the student page passes the student, a
 * Matita draft passes everything it read («Modifica» on a draft opens the form prefilled).
 */
export interface LessonInitial {
  student_id?: string | null;
  /** `null` = «Nessuna materia»; absent = the student's usual subject. */
  subject_id?: string | null;
  date?: string;
  start_time?: string;
  end_time?: string;
  topic?: string | null;
  notes?: string | null;
  /** A rate written by hand for this lesson (sent as is: equal to the history = follows it). */
  hourly_rate_cents?: number | null;
}

export interface LessonValues {
  studentId: string | null;
  /** `undefined` = not chosen yet: the student's usual subject (default_subject_id) applies. */
  subjectId: string | null | undefined;
  date: string;
  /** What the tutor typed in «Inizio» / «Fine» (normalized on blur). */
  start: string;
  end: string;
  topic: string;
  notes: string;
  /** The rate written in «Tariffa per questa lezione»; only sent when `rateTouched` (D-16). */
  rateCents: number | null;
  rateTouched: boolean;
}

/** Values of a new lesson: today, now rounded down to the quarter hour, default length (§5). */
export function newLessonValues(
  initial: LessonInitial,
  defaults: { today: string; timeZone: string; lessonMinutes: number; now?: Date },
): LessonValues {
  const start = initial.start_time ?? defaultStartTime(defaults.timeZone, defaults.now);
  const end = initial.end_time ?? addMinutesToTime(start, defaults.lessonMinutes) ?? "";
  const rate = initial.hourly_rate_cents ?? null;
  return {
    studentId: initial.student_id ?? null,
    subjectId: initial.subject_id === undefined ? undefined : initial.subject_id,
    date: initial.date ?? defaults.today,
    start: start.slice(0, 5),
    end: end.slice(0, 5),
    topic: initial.topic ?? "",
    notes: initial.notes ?? "",
    rateCents: rate,
    rateTouched: rate !== null,
  };
}

/** Values of an existing lesson (edit). */
export function lessonToValues(lesson: Lesson): LessonValues {
  return {
    studentId: lesson.student.id,
    subjectId: lesson.subject?.id ?? null,
    date: lesson.date,
    start: lesson.start_time.slice(0, 5),
    end: lesson.end_time.slice(0, 5),
    topic: lesson.topic ?? "",
    notes: lesson.notes ?? "",
    rateCents: lesson.hourly_rate_cents,
    rateTouched: false,
  };
}

/** First and last allowed day: the server accepts dates within two years from today. */
export function lessonDateRange(today: string): { min: string; max: string } {
  const day = parseIsoDate(today);
  if (!day) return { min: today, max: today };
  return {
    min: day.subtract({ years: 2 }).toString(),
    max: day.add({ years: 2 }).toString(),
  };
}

export interface LessonCheck {
  errors: Partial<Record<LessonField, string>>;
  /** Non-blocking («Sono 9 h di lezione: è giusto?»). */
  warning?: string;
  /** Lesson length when both times are valid and in order. */
  minutes: number | null;
  /** Normalized "HH:MM", or null when unreadable. */
  start: string | null;
  end: string | null;
}

/** Local checks before sending (03 §7.1): the same rules and texts as the server. */
export function checkLesson(values: LessonValues, today: string): LessonCheck {
  const errors: Partial<Record<LessonField, string>> = {};
  if (!values.studentId) errors.student = LESSON_MESSAGES.student;
  if (!parseIsoDate(values.date)) {
    errors.date = LESSON_MESSAGES.date;
  } else {
    const { min, max } = lessonDateRange(today);
    if (values.date < min || values.date > max) errors.date = LESSON_MESSAGES.tooFar;
  }
  const time = checkTimeRange(values.start, values.end);
  if (values.start.trim() === "") errors.start = LESSON_MESSAGES.start;
  else if (time.startError) errors.start = time.startError;
  if (values.end.trim() === "") errors.end = LESSON_MESSAGES.end;
  else if (time.endError) errors.end = time.endError;
  if (values.rateTouched) {
    if (values.rateCents === null) errors.rate = LESSON_MESSAGES.rate;
    else if (values.rateCents > RATE_MAX_CENTS) errors.rate = LESSON_MESSAGES.rateTooHigh;
  }
  const minutes = time.minutes !== null && time.minutes > 0 && !time.endError ? time.minutes : null;
  return { errors, warning: time.warning, minutes, start: time.start, end: time.end };
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * POST /lessons. `subjectId` undefined resolves to `fallbackSubjectId` (the student's usual one).
 * `hourly_rate_cents` only when the tutor wrote it (otherwise the history decides, D-16).
 */
export function lessonCreateBody(
  values: LessonValues,
  check: LessonCheck,
  fallbackSubjectId: string | null,
): LessonCreate {
  const body: LessonCreate = {
    student_id: values.studentId ?? "",
    subject_id: values.subjectId === undefined ? fallbackSubjectId : values.subjectId,
    date: values.date,
    start_time: check.start ?? values.start,
    end_time: check.end ?? values.end,
    topic: textOrNull(values.topic),
    notes: textOrNull(values.notes),
  };
  if (values.rateTouched && values.rateCents !== null) body.hourly_rate_cents = values.rateCents;
  return body;
}

/** PATCH /lessons/{id}: only what changed. The rate is sent only when written explicitly. */
export function lessonPatchBody(
  values: LessonValues,
  check: LessonCheck,
  original: Lesson,
): LessonPatch {
  const patch: LessonPatch = {};
  const subjectId =
    values.subjectId === undefined ? (original.subject?.id ?? null) : values.subjectId;
  const start = check.start ?? values.start;
  const end = check.end ?? values.end;
  if (values.studentId && values.studentId !== original.student.id) {
    patch.student_id = values.studentId;
  }
  if (subjectId !== (original.subject?.id ?? null)) patch.subject_id = subjectId;
  if (values.date !== original.date) patch.date = values.date;
  if (start !== original.start_time.slice(0, 5)) patch.start_time = start;
  if (end !== original.end_time.slice(0, 5)) patch.end_time = end;
  const topic = textOrNull(values.topic);
  if (topic !== (original.topic ?? null)) patch.topic = topic;
  const notes = textOrNull(values.notes);
  if (notes !== (original.notes ?? null)) patch.notes = notes;
  if (
    values.rateTouched &&
    values.rateCents !== null &&
    values.rateCents !== original.hourly_rate_cents
  ) {
    patch.hourly_rate_cents = values.rateCents;
  }
  return patch;
}

/** The PATCH that puts back what `patch` changed («Annulla» on an edit, 02 §9.11). */
export function lessonUndoPatch(patch: LessonPatch, original: Lesson): LessonPatch {
  const undo: LessonPatch = {};
  if ("student_id" in patch) undo.student_id = original.student.id;
  if ("subject_id" in patch) undo.subject_id = original.subject?.id ?? null;
  if ("date" in patch) undo.date = original.date;
  if ("start_time" in patch) undo.start_time = original.start_time.slice(0, 5);
  if ("end_time" in patch) undo.end_time = original.end_time.slice(0, 5);
  if ("topic" in patch) undo.topic = original.topic;
  if ("notes" in patch) undo.notes = original.notes;
  if ("hourly_rate_cents" in patch || "student_id" in patch) {
    undo.hourly_rate_cents = original.hourly_rate_cents;
  }
  return undo;
}

/** The body that recreates a deleted lesson («Annulla» after «Lezione eliminata», 03 §7.5). */
export function lessonRecreateBody(lesson: Lesson): LessonCreate {
  return {
    student_id: lesson.student.id,
    subject_id: lesson.subject?.id ?? null,
    date: lesson.date,
    start_time: lesson.start_time.slice(0, 5),
    end_time: lesson.end_time.slice(0, 5),
    hourly_rate_cents: lesson.hourly_rate_cents,
    topic: lesson.topic,
    notes: lesson.notes,
  };
}

/** Whether the form differs from what it opened with (closing then asks «Scartare le modifiche?»). */
export function lessonValuesDiffer(a: LessonValues, b: LessonValues): boolean {
  return (
    a.studentId !== b.studentId ||
    a.subjectId !== b.subjectId ||
    a.date !== b.date ||
    a.start !== b.start ||
    a.end !== b.end ||
    a.topic !== b.topic ||
    a.notes !== b.notes ||
    a.rateCents !== b.rateCents
  );
}

/** Minutes since midnight of an "HH:MM" (already validated). */
export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}
