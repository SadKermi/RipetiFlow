// Pure helpers of Matita (docs/06-assistente-matita.md, 02 §9.13): what a draft becomes when it is
// confirmed or opened in a form, the balance it would leave, how an error is shown. No React here.
import { fromAbsolute, toCalendarDate, toZoned } from "@internationalized/date";
import { errorMessage, isApiProblem } from "@/lib/api/problem";
import type {
  AssistantDraft,
  LessonCreate,
  LessonDraft,
  MessageDraft,
  PaymentCreate,
  PaymentDraft,
} from "@/lib/api/types";
import { minutesBetween, parseTime } from "@/lib/format";

/** The daily limit counts requests on the Europe/Rome day, whatever the profile's timezone. */
export const QUOTA_TIMEZONE = "Europe/Rome";

/** «Quasi al limite» from this many requests left (02 §9.13). */
export const NEAR_LIMIT = 10;

/** The counter under the line appears when this many characters (or fewer) are left. */
export const COUNTER_THRESHOLD = 200;

export type WritableDraft = LessonDraft | PaymentDraft;

export function isWritable(draft: AssistantDraft): draft is WritableDraft {
  return draft.type === "lesson" || draft.type === "payment";
}

export function isMessage(draft: AssistantDraft): draft is MessageDraft {
  return draft.type === "message";
}

/** Why a request did not produce an answer, and so which note to show (02 §9.13). */
export type MatitaFailure =
  /** 429: the line is blocked until midnight in Rome; `detail` is the server's sentence. */
  | { kind: "rate_limited"; detail: string }
  /** 503: no provider on this server — Matita disappears like with `assistant_available: false`. */
  | { kind: "unavailable" }
  /** 502 (or a gateway timeout): the provider failed or took more than 60 s. */
  | { kind: "upstream" }
  /** The request never got an answer. */
  | { kind: "offline" }
  /** Anything else (e.g. a 422 on the request): the server's `detail`. */
  | { kind: "other"; detail: string };

export function failureFromError(error: unknown): MatitaFailure {
  if (!isApiProblem(error)) return { kind: "other", detail: errorMessage(error) };
  if (error.status === 429 || error.code === "rate_limited") {
    return { kind: "rate_limited", detail: error.detail };
  }
  if (error.status === 503 || error.code === "unavailable") return { kind: "unavailable" };
  if (error.status === 502 || error.status === 504 || error.code === "upstream_error") {
    return { kind: "upstream" };
  }
  if (error.code === "network_error") return { kind: "offline" };
  return { kind: "other", detail: error.detail };
}

/** Epoch ms of the next midnight in Rome: when a 429 stops applying (docs/06 §4). */
export function nextQuotaReset(at: Date = new Date()): number {
  const rome = fromAbsolute(at.getTime(), QUOTA_TIMEZONE);
  const tomorrow = toCalendarDate(rome).add({ days: 1 });
  return toZoned(tomorrow, QUOTA_TIMEZONE).toDate().getTime();
}

/** Requests left today, from the last `usage` the server sent. */
export function requestsLeft(usage: { requests_today: number; daily_limit: number }): number {
  return Math.max(0, usage.daily_limit - usage.requests_today);
}

export function isNearLimit(usage: { requests_today: number; daily_limit: number }): boolean {
  return usage.requests_today >= usage.daily_limit - NEAR_LIMIT;
}

/** «1.840/2000» under the line when ≤ 200 characters are left (02 §9.13). */
export function counterText(length: number, max: number): string | null {
  if (max - length > COUNTER_THRESHOLD) return null;
  return `${length.toLocaleString("it-IT", { useGrouping: "always" })}/${String(max)}`;
}

/** Minutes of a lesson draft (start and end come from the server as HH:MM). */
export function draftMinutes(draft: LessonDraft): number | null {
  return minutesBetween(draft.start_time, draft.end_time);
}

/**
 * Whether the lesson of a draft is already over, so that confirming it enters the balance at once
 * (`today` and `nowMinutes` in the tutor's timezone). A future one becomes «Programmata».
 */
export function isLessonOver(
  draft: Pick<LessonDraft, "date" | "end_time">,
  today: string,
  nowMinutes: number,
): boolean {
  if (draft.date !== today) return draft.date < today;
  const end = parseTime(draft.end_time);
  return end !== null && end <= nowMinutes;
}

/**
 * The student's balance after confirming this draft (negative = owes): «sarà deve 100,00 €» in the
 * ledger. `null` for a lesson that is not over yet: it will not enter the balance now.
 */
export function balanceAfter(
  draft: WritableDraft,
  balanceCents: number,
  today: string,
  nowMinutes: number,
): number | null {
  if (draft.type === "payment") return balanceCents + draft.amount_cents;
  return isLessonOver(draft, today, nowMinutes) ? balanceCents - draft.amount_cents : null;
}

/**
 * POST /lessons for «Ripassa a penna». The rate is not sent: the server takes it from the student's
 * history, as it did for the draft (D-16), so the amount cannot differ from what was shown.
 */
export function lessonBody(draft: LessonDraft): LessonCreate {
  return {
    student_id: draft.student.id,
    subject_id: draft.subject?.id ?? null,
    date: draft.date,
    start_time: draft.start_time,
    end_time: draft.end_time,
    topic: draft.topic,
    notes: draft.notes,
  };
}

export function paymentBody(draft: PaymentDraft): PaymentCreate {
  return {
    student_id: draft.student.id,
    amount_cents: draft.amount_cents,
    paid_on: draft.paid_on,
    method: draft.method,
    note: draft.note,
  };
}

/** «Modifica» on a lesson draft: the manual form, prefilled (no rate written by hand, D-16). */
export function lessonInitial(draft: LessonDraft): Partial<LessonCreate> {
  return {
    student_id: draft.student.id,
    subject_id: draft.subject?.id ?? null,
    date: draft.date,
    start_time: draft.start_time,
    end_time: draft.end_time,
    topic: draft.topic,
    notes: draft.notes,
  };
}

export function paymentInitial(draft: PaymentDraft): Partial<PaymentCreate> {
  return {
    student_id: draft.student.id,
    amount_cents: draft.amount_cents,
    paid_on: draft.paid_on,
    method: draft.method,
    note: draft.note,
  };
}

/** The reply as plain text (for the live region): no markdown marks. */
export function plainReply(reply: string): string {
  return reply
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** First word of a name («Luca Bianchi» → «Luca»). */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// --- Reply markdown (docs/05: «markdown limitato: grassetto, elenchi») -------------------------

export type ReplyBlock =
  { kind: "paragraph"; lines: string[] } | { kind: "list"; ordered: boolean; items: string[] };

const LIST_ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;

/**
 * Paragraphs (blank-line separated; single newlines are line breaks) and lists («- …», «* …»,
 * «1. …»). Inline marks are handled when rendering.
 */
export function parseReply(reply: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  for (const chunk of reply.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    let current: ReplyBlock | null = null;
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (line === "") continue;
      const item = LIST_ITEM.exec(raw);
      if (item) {
        const ordered = item[1] !== undefined;
        const text = (item[2] ?? "").trim();
        if (current?.kind === "list" && current.ordered === ordered) {
          current.items.push(text);
        } else {
          current = { kind: "list", ordered, items: [text] };
          blocks.push(current);
        }
      } else if (current?.kind === "paragraph") {
        current.lines.push(line);
      } else {
        current = { kind: "paragraph", lines: [line] };
        blocks.push(current);
      }
    }
  }
  return blocks;
}
