// What Matita says without drafts (02 §9.13): the margin note with the reply, the notes for a
// refused request, the daily limit, a provider that does not answer, the network, and the quiet
// line that replaces Matita when it is not configured. Server texts are shown exactly as they are.
import {
  CloudSlashIcon,
  HourglassMediumIcon,
  PencilSimpleSlashIcon,
  ProhibitIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Button, InlineButton } from "@/components/Button";
import { Note } from "@/components/States";
import { cx } from "@/components/utils";
import { MATITA_TEXT } from "./messages";
import type { MatitaFailure } from "./model";
import { ReplyText } from "./ReplyText";
import type { MatitaNote } from "./session";

/**
 * «Nota a margine»: 2 px ink rule on the left, the question in caption above, the reply in Literata
 * italic 16/26. A refused request (`refused: true`) has the Prohibit icon. Under an answer, «oppure
 * usa il modulo». The text is the server's `reply`, never rewritten here.
 */
export function ReplyNote({
  note,
  onUseForm,
  className,
}: {
  note: MatitaNote;
  onUseForm?: () => void;
  className?: string;
}) {
  if (note.drafts > 0 && !note.refused) {
    // With proposals the cards carry «Matita ha letto»: the reply is one line of voice above them
    // (it may say that some drafts were discarded).
    return (
      <ReplyText
        reply={note.reply}
        className={cx("font-display text-body leading-[1.625rem] text-ink-2 italic", className)}
      />
    );
  }
  return (
    <section
      aria-label="Risposta di Matita"
      className={cx("rounded-r-sm border-l-2 border-ink bg-paper-raised py-3 pr-4 pl-4", className)}
    >
      <p className="m-0 mb-1.5 line-clamp-2 text-caption break-words text-ink-3 uppercase">
        {note.question}
      </p>
      <div className="flex items-start gap-2">
        {note.refused && (
          <ProhibitIcon size={20} aria-hidden className="mt-[3px] shrink-0 text-ink-3" />
        )}
        <ReplyText
          reply={note.reply}
          className="min-w-0 font-display text-body leading-[1.625rem] break-words text-ink italic"
        />
      </div>
      {!note.refused && onUseForm && (
        <Button variant="quiet" size="sm" className="mt-1 -ml-2.5" onPress={onUseForm}>
          {MATITA_TEXT.orUseForm}
        </Button>
      )}
    </section>
  );
}

/** 502, network, other errors: the line is still in the field, «Riprova» sends it again. */
export function FailureNote({
  failure,
  onRetry,
  className,
}: {
  failure: MatitaFailure;
  onRetry: () => void;
  className?: string;
}) {
  const retry = (
    <InlineButton onPress={onRetry} className="text-ink">
      {MATITA_TEXT.retry}
    </InlineButton>
  );
  switch (failure.kind) {
    case "upstream":
    case "offline":
      return (
        <Note icon={CloudSlashIcon} tone="danger" role="alert" className={className}>
          {failure.kind === "upstream" ? MATITA_TEXT.upstream : MATITA_TEXT.offline} {retry}
        </Note>
      );
    case "other":
      return (
        <Note icon={WarningIcon} tone="danger" role="alert" className={className}>
          {failure.detail} {retry}
        </Note>
      );
    default:
      // The daily limit is shown by LimitNote (shared by every line); 503 hides Matita.
      return null;
  }
}

/** 429: the server's `detail` + «I moduli funzionano come sempre.»; the line waits for midnight. */
export function LimitNote({ detail, className }: { detail: string; className?: string }) {
  return (
    <Note icon={HourglassMediumIcon} role="status" className={className}>
      {detail} {MATITA_TEXT.limitTail}
    </Note>
  );
}

/** `assistant_available: false` or a 503: a quiet 14 px line instead of Matita (02 §9.13). */
export function UnavailableNote({ className }: { className?: string }) {
  return (
    <p
      className={cx(
        "m-0 flex min-w-0 flex-1 items-start gap-2 text-[0.875rem] leading-5 text-ink-3",
        className,
      )}
    >
      <PencilSimpleSlashIcon size={20} aria-hidden className="shrink-0" />
      {MATITA_TEXT.unavailable}
    </p>
  );
}

/** Polite live region of a line: «Matita sta scrivendo…», the reply, «Matita propone…». */
export function Announcer({ text }: { text: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {text}
    </p>
  );
}
