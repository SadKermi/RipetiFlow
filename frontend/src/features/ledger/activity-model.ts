// «Storico modifiche» (docs/design/03-schermate.md §5.1): grouping by day in the tutor's timezone
// and the labels of the changed fields (the same words the server uses in its summaries).
import type { Activity } from "@/lib/api/types";
import { addDays, formatDateShort, todayIn } from "@/lib/format";

const FIELD_LABELS: Record<Activity["entity"], Record<string, string>> = {
  lesson: {
    student_id: "studente",
    subject_id: "materia",
    lesson_date: "data",
    start_time: "inizio",
    end_time: "fine",
    hourly_rate_cents: "tariffa",
    amount_cents: "importo",
    topic: "argomento",
    notes: "note",
  },
  payment: {
    student_id: "studente",
    amount_cents: "importo",
    paid_on: "data",
    method: "metodo",
    note: "nota",
  },
  student: {
    first_name: "nome",
    last_name: "cognome",
    school: "scuola",
    grade: "classe",
    email: "email",
    phone: "telefono",
    guardian_name: "genitore",
    guardian_email: "email del genitore",
    guardian_phone: "telefono del genitore",
    notes: "note",
    default_subject_id: "materia predefinita",
    archived_at: "archiviato",
  },
  student_rate: { hourly_rate_cents: "tariffa", effective_from: "decorrenza" },
};

/** Private notes: the history says that they changed, not what they say. */
const HIDDEN_VALUES = new Set(["notes"]);

export function fieldLabel(entity: Activity["entity"], field: string): string {
  return FIELD_LABELS[entity][field] ?? field.replaceAll("_", " ");
}

export function hidesValues(field: string): boolean {
  return HIDDEN_VALUES.has(field);
}

/** «da Matita» / «importata» / «automatica»; nothing for the tutor's own changes. */
export function sourceLabel(source: Activity["source"]): string | null {
  switch (source) {
    case "assistant":
      return "da Matita";
    case "import":
      return "importata";
    case "system":
      return "automatica";
    case "app":
      return null;
  }
}

export interface ActivityDay {
  /** "YYYY-MM-DD" in the tutor's timezone. */
  date: string;
  /** «oggi», «ieri», «ven 2 ott» (shown as a caption, uppercase). */
  label: string;
  items: Activity[];
}

/** Groups the (newest first) activity by day in the tutor's timezone. */
export function groupByDay(
  items: readonly Activity[],
  timeZone: string,
  today: string,
): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const item of items) {
    const date = todayIn(timeZone, new Date(item.occurred_at));
    let day = days[days.length - 1];
    if (!day || day.date !== date) {
      day = { date, label: dayLabel(date, today), items: [] };
      days.push(day);
    }
    day.items.push(item);
  }
  return days;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "oggi";
  if (date === addDays(today, -1)) return "ieri";
  const short = formatDateShort(date);
  return date.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${date.slice(0, 4)}`;
}

/** «14:31» in the tutor's timezone. */
export function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
}
