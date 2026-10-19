// Fixtures for Matita's tests (used only by *.test.tsx): drafts and replies as the API sends them
// (docs/05 «Assistente Matita»), with the example data of docs/design/03-schermate.md.
import type {
  AssistantReply,
  Lesson,
  LessonDraft,
  MessageDraft,
  Payment,
  PaymentDraft,
  PublicConfig,
} from "@/lib/api/types";
import { TEST_CONFIG, json } from "@/features/forms/test-utils";

export const MATITA_CONFIG: PublicConfig = { ...TEST_CONFIG, assistant_available: true };

/** «oggi 13-14 chimica con sara, stechiometria» (03 §9.1): over at 14:20, 25,00 €/h. */
export function lessonDraft(extra: Partial<LessonDraft> = {}): LessonDraft {
  return {
    type: "lesson",
    id: "d-lesson",
    student: { id: "sara", display_name: "Sara Conti" },
    subject: { id: "chi", name: "Chimica" },
    date: "2026-10-06",
    start_time: "13:00",
    end_time: "14:00",
    hourly_rate_cents: 2500,
    amount_cents: 2500,
    topic: "stechiometria",
    notes: null,
    warnings: [],
    ...extra,
  };
}

export function paymentDraft(extra: Partial<PaymentDraft> = {}): PaymentDraft {
  return {
    type: "payment",
    id: "d-payment",
    student: { id: "giulia", display_name: "Giulia Ferri" },
    amount_cents: 5000,
    paid_on: "2026-10-06",
    method: "cash",
    note: null,
    warnings: [],
    ...extra,
  };
}

export function messageDraft(extra: Partial<MessageDraft> = {}): MessageDraft {
  return {
    type: "message",
    id: "d-message",
    recipient_hint: "mamma di Giulia",
    channel: "whatsapp",
    text: "Buongiorno, le scrivo per il saldo di Giulia: 67,00 €. Grazie, Daniele",
    ...extra,
  };
}

export function reply(extra: Partial<AssistantReply> = {}): AssistantReply {
  return {
    reply: "Ecco cosa ho preparato.",
    drafts: [],
    refused: false,
    usage: { requests_today: 3, daily_limit: 60 },
    ...extra,
  };
}

/** The lesson the server creates for `lessonDraft()`. */
export function savedLesson(extra: Partial<Lesson> = {}): Lesson {
  return {
    id: "l-new",
    student: { id: "sara", display_name: "Sara Conti" },
    subject: { id: "chi", name: "Chimica" },
    date: "2026-10-06",
    start_time: "13:00",
    end_time: "14:00",
    duration_minutes: 60,
    hourly_rate_cents: 2500,
    amount_cents: 2500,
    topic: "stechiometria",
    notes: null,
    settled: true,
    calendar: { status: "off", error: null },
    created_at: "2026-10-06T12:20:00Z",
    updated_at: "2026-10-06T12:20:00Z",
    ...extra,
  };
}

export function savedPayment(extra: Partial<Payment> = {}): Payment {
  return {
    id: "p-new",
    student: { id: "giulia", display_name: "Giulia Ferri" },
    amount_cents: 5000,
    paid_on: "2026-10-06",
    method: "cash",
    note: null,
    created_at: "2026-10-06T12:20:00Z",
    updated_at: "2026-10-06T12:20:00Z",
    ...extra,
  };
}

/** A problem+json answer with its `code` (429 rate_limited, 502 upstream_error, 503 unavailable…). */
export function problemWithCode(status: number, code: string, detail: string): Response {
  return json({ type: "about:blank", title: "Errore", status, detail, code }, status);
}
