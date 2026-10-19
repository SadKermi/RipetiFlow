// One Matita line's conversation (02 §9.13, docs/05 «Assistente Matita»): the turns sent with each
// request, the margin notes, the drafts «a matita» and what happens when the tutor goes over them
// «a penna». Every line (ledger, Oggi, mobile bar, ⌘K dialog) has its own session; nothing is kept
// on the server and nothing is written without «Ripassa a penna» or a form saved by the tutor.
import type { QueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/app/auth";
import type { MatitaFormOptions } from "@/components/shell/matita-slot";
import { errorMessage, isApiProblem } from "@/lib/api/problem";
import type { AssistantDraft, ChatTurn, LessonCreate, PaymentCreate } from "@/lib/api/types";
import {
  assistantTurns,
  useCreateLesson,
  useCreatePayment,
  useSendAssistantMessage,
} from "@/lib/queries";
import {
  deleteLessonNow,
  deletePaymentNow,
  lessonSavedMessage,
  paymentSavedMessage,
  useTutorClock,
  useUndoToast,
} from "@/features/forms";
import { MATITA_TEXT, proposalAnnouncement } from "./messages";
import {
  type MatitaFailure,
  failureFromError,
  isWritable,
  lessonBody,
  lessonInitial,
  paymentBody,
  paymentInitial,
  plainReply,
} from "./model";
import {
  markUnavailable,
  recordRateLimit,
  recordUsage,
  rememberPhrase,
  useMatitaQuota,
} from "./store";

/** How many margin notes stay reachable with ↑ in the line (03 §9.3). */
const NOTES_KEPT = 5;

export interface DraftItem {
  /** The draft's id (a fresh UUID from the server for every reply). */
  key: string;
  draft: AssistantDraft;
  /** The tutor's sentence that produced it: «Matita ha letto: «…»». */
  sourceText: string;
  /** `saving`: «Ripassa a penna» in flight; `inking`: saved, the ink animation is running. */
  status: "idle" | "saving" | "inking";
  /** A failed confirmation that has no field to go to (a 422 opens the form instead). */
  error: string | null;
  /** Message drafts: the text as the tutor edited it (what Copia / WhatsApp / Email use). */
  text: string;
}

export interface MatitaNote {
  id: number;
  question: string;
  /** `reply` as the server wrote it (limited markdown). */
  reply: string;
  refused: boolean;
  /** Drafts that came with the reply: the note is then a short line above them. */
  drafts: number;
}

export interface MatitaSessionOptions {
  /** The student of the page (scheda studente): sent as `context.student_id`. */
  studentId?: string | null;
  /** «Modifica» on a draft and the 422 of «Ripassa a penna»: the manual forms, prefilled. */
  openLessonForm: (initial: Partial<LessonCreate>, options?: MatitaFormOptions) => void;
  openPaymentForm: (initial: Partial<PaymentCreate>, options?: MatitaFormOptions) => void;
}

export interface MatitaSession {
  /** What is in the line (while thinking: the sentence being processed). */
  text: string;
  setText: (text: string) => void;
  /** The sentence of the request in flight, or null. */
  pending: string | null;
  failure: MatitaFailure | null;
  /** The margin note on screen (the last reply, or an older one reached with ↑). */
  note: MatitaNote | null;
  drafts: DraftItem[];
  /** After a 429, until midnight in Rome: the server's sentence. */
  blocked: string | null;
  usage: { requests_today: number; daily_limit: number } | null;
  /** Text for the polite live region («Matita sta scrivendo…», the reply, «Matita propone…»). */
  announcement: string;
  /** Changes every time a reply brings drafts: hosts move the focus to the first one. */
  proposedNonce: number;
  /** Sends the line (or `override`, e.g. «Promemoria»). */
  submit: (override?: string) => void;
  /** Esc in the line; true when it did something (stop the event there). */
  escape: (clearText?: boolean) => boolean;
  /** ↑ / ↓ in an empty line: the previous / next of the last 5 notes. */
  browseNotes: (direction: -1 | 1) => boolean;
  /** Clears everything (page changed, the mobile panel closed). */
  reset: () => void;
  discard: (key: string) => void;
  edit: (key: string) => void;
  /** «Ripassa a penna»: true when written. */
  confirm: (key: string) => Promise<boolean>;
  /** «Ripassa tutte a penna»: one at a time, stopping at the first error. */
  confirmAll: () => Promise<boolean>;
  setMessageText: (key: string, text: string) => void;
}

/**
 * The note on screen. The short line that came with drafts goes once they have all been gone over
 * or discarded: it only introduced them.
 */
function shownNote(notes: MatitaNote[], id: number | null, drafts: number): MatitaNote | null {
  const note = notes.find((candidate) => candidate.id === id) ?? null;
  return note && note.drafts > 0 && !note.refused && drafts === 0 ? null : note;
}

/** Length of the ink animation (`--rf-dur-ink`, 0 with reduced motion or without the CSS). */
function inkDurationMs(): number {
  if (typeof window.getComputedStyle !== "function") return 0;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue("--rf-dur-ink");
  const ms = Number.parseFloat(value);
  return Number.isFinite(ms) && ms > 0 ? (value.trim().endsWith("ms") ? ms : ms * 1000) : 0;
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => window.setTimeout(resolve, ms)) : Promise.resolve();
}

export function useMatitaSession(options: MatitaSessionOptions): MatitaSession {
  const { today } = useTutorClock();
  const { user } = useAuth();
  const sendMessage = useSendAssistantMessage();
  const createLesson = useCreateLesson();
  const createPayment = useCreatePayment();
  const showToast = useUndoToast();
  const quota = useMatitaQuota(user?.id ?? null);

  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<MatitaFailure | null>(null);
  const [notes, setNotes] = useState<MatitaNote[]>([]);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [drafts, setDraftsState] = useState<DraftItem[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [proposedNonce, setProposedNonce] = useState(0);

  const turns = useRef<ChatTurn[]>([]);
  const controller = useRef<AbortController | null>(null);
  const draftsRef = useRef<DraftItem[]>([]);
  const noteSeq = useRef(0);

  function updateDrafts(change: (items: DraftItem[]) => DraftItem[]) {
    draftsRef.current = change(draftsRef.current);
    setDraftsState(draftsRef.current);
  }

  function patchDraft(key: string, patch: Partial<DraftItem>) {
    updateDrafts((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setPending(null);
    setAnnouncement("");
  }

  /** Esc in the empty line: the conversation starts over, the note goes (still reachable with ↑). */
  function clearConversation() {
    turns.current = [];
    setNoteId(null);
    setFailure(null);
  }

  async function submit(override?: string) {
    const content = (override ?? text).trim();
    if (!content || controller.current || quota.blocked) return;
    const messages = assistantTurns([...turns.current, { role: "user", content }]);
    const abort = new AbortController();
    controller.current = abort;
    if (override !== undefined) setText(override);
    setPending(content);
    setFailure(null);
    setNoteId(null); // the note goes away at the next question (03 §9.3)
    setAnnouncement(MATITA_TEXT.thinking);
    rememberPhrase(user?.id, content);
    try {
      const reply = await sendMessage.mutateAsync({
        body: { messages, context: { student_id: options.studentId ?? null, today } },
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      recordUsage(reply.usage, user?.id ?? null);
      turns.current = [...messages, { role: "assistant", content: reply.reply }];
      setText("");
      // Ids are fresh UUIDs; a repeated one would only duplicate a card already on screen.
      const known = new Set(draftsRef.current.map((item) => item.key));
      const fresh: DraftItem[] = reply.drafts
        .filter((draft) => !known.has(draft.id))
        .map((draft) => ({
          key: draft.id,
          draft,
          sourceText: content,
          status: "idle",
          error: null,
          text: draft.type === "message" ? draft.text : "",
        }));
      // Earlier drafts stay «a matita» until the tutor goes over them or discards them.
      if (fresh.length > 0) updateDrafts((items) => [...fresh, ...items]);
      noteSeq.current += 1;
      const note: MatitaNote = {
        id: noteSeq.current,
        question: content,
        reply: reply.reply,
        refused: reply.refused,
        drafts: reply.drafts.length,
      };
      setNotes((current) => [...current, note].slice(-NOTES_KEPT));
      setNoteId(note.id);
      const said = plainReply(reply.reply);
      setAnnouncement(
        fresh.length > 0 ? `${proposalAnnouncement(fresh.length)} ${said}`.trim() : said,
      );
      if (fresh.length > 0) setProposedNonce((n) => n + 1);
    } catch (error) {
      if (abort.signal.aborted) return;
      const failed = failureFromError(error);
      if (failed.kind === "rate_limited") recordRateLimit(failed.detail, user?.id ?? null);
      if (failed.kind === "unavailable") markUnavailable();
      setFailure(failed);
      setAnnouncement("");
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setPending(null);
      }
    }
  }

  function escape(clearText = true): boolean {
    if (controller.current) {
      cancel();
      return true;
    }
    if (clearText && text !== "") {
      setText("");
      return true;
    }
    if (noteId !== null || failure !== null || turns.current.length > 0) {
      // Drafts stay until gone over or discarded one by one.
      clearConversation();
      return true;
    }
    return false;
  }

  function browseNotes(direction: -1 | 1): boolean {
    if (notes.length === 0) return false;
    const current = noteId === null ? notes.length : notes.findIndex((n) => n.id === noteId);
    const next = current + direction;
    if (next < 0) return true;
    setNoteId(next >= notes.length ? null : (notes[next]?.id ?? null));
    return true;
  }

  function reset() {
    cancel();
    clearConversation();
    setNotes([]);
    updateDrafts(() => []);
    setText("");
  }

  function discard(key: string) {
    updateDrafts((items) => items.filter((item) => item.key !== key));
  }

  function openForm(item: DraftItem, error?: unknown) {
    const formOptions: MatitaFormOptions = {
      source: "assistant",
      error,
      onSaved: () => discard(item.key),
    };
    if (item.draft.type === "lesson") {
      options.openLessonForm(lessonInitial(item.draft), formOptions);
    } else if (item.draft.type === "payment") {
      options.openPaymentForm(paymentInitial(item.draft), formOptions);
    }
  }

  function edit(key: string) {
    const item = draftsRef.current.find((candidate) => candidate.key === key);
    if (item) openForm(item);
  }

  async function confirm(key: string): Promise<boolean> {
    const item = draftsRef.current.find((candidate) => candidate.key === key);
    if (!item || item.status !== "idle" || !isWritable(item.draft)) return false;
    const draft = item.draft;
    // The toast names the student when the draft is not about the page's student.
    const other = draft.student.id !== options.studentId;
    patchDraft(key, { status: "saving", error: null });
    try {
      let message: string;
      let undo: (qc: QueryClient) => Promise<unknown>;
      if (draft.type === "lesson") {
        const saved = await createLesson.mutateAsync({
          body: lessonBody(draft),
          source: "assistant",
        });
        message = lessonSavedMessage(saved, today, other ? saved.student.display_name : undefined);
        undo = (qc) => deleteLessonNow(qc, saved);
      } else {
        const saved = await createPayment.mutateAsync({
          body: paymentBody(draft),
          source: "assistant",
        });
        message = paymentSavedMessage(saved.amount_cents);
        undo = (qc) => deletePaymentNow(qc, { id: saved.id, studentId: saved.student.id });
      }
      patchDraft(key, { status: "inking" });
      await wait(inkDurationMs());
      discard(key);
      showToast(message, undo);
      return true;
    } catch (error) {
      if (isApiProblem(error) && error.status === 422) {
        // Stays «a matita»; the form opens prefilled with the error on its field (02 §9.13).
        patchDraft(key, { status: "idle" });
        openForm(item, error);
      } else {
        patchDraft(key, { status: "idle", error: errorMessage(error) });
      }
      return false;
    }
  }

  async function confirmAll(): Promise<boolean> {
    const keys = draftsRef.current
      .filter((item) => isWritable(item.draft) && item.status === "idle")
      .map((item) => item.key);
    for (const key of keys) {
      if (!(await confirm(key))) return false;
    }
    return true;
  }

  function setMessageText(key: string, value: string) {
    patchDraft(key, { text: value });
  }

  return {
    text: pending ?? text,
    setText,
    pending,
    failure,
    note: shownNote(notes, noteId, drafts.length),
    drafts,
    blocked: quota.blocked?.detail ?? null,
    usage: quota.usage,
    announcement,
    proposedNonce,
    submit: (override) => void submit(override),
    escape,
    browseNotes,
    reset,
    discard,
    edit,
    confirm,
    confirmAll,
    setMessageText,
  };
}
