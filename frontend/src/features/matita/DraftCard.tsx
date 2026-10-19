// Matita's proposals as cards «a matita» (02 §9.13, 03 §9.1–9.3): dashed graphite with the 45°
// hatch, «Matita propone», the sentence Matita read, the draft's fields as the server computed
// them, the server's warnings, and «Ripassa a penna · Modifica · Scarta». Message drafts can be
// edited, copied or opened in WhatsApp / email: nothing is ever sent by itself.
import { CopyIcon, EnvelopeSimpleIcon, WarningIcon, WhatsappLogoIcon } from "@phosphor-icons/react";
import { type ReactNode, useId, useRef, useState } from "react";
import { Button, InlineButton } from "@/components/Button";
import { buttonClasses } from "@/components/button-styles";
import { FormNote } from "@/components/Field";
import { INK_ICON, MATITA_ICON, PAYMENT_METHOD_LABEL } from "@/components/icon-map";
import { useToast } from "@/components/toast-context";
import { cx, formatDayFieldValue } from "@/components/utils";
import type { MessageDraft } from "@/lib/api/types";
import { formatEuro, formatMinutes, toWhatsAppNumber, whatsAppLink } from "@/lib/format";
import { formatRate } from "@/features/forms";
import { MATITA_TEXT, messageHeading, noPhoneText } from "./messages";
import { draftSummary, proposalKeys, relativeDay } from "./draft-format";
import { type WritableDraft, draftMinutes } from "./model";
import type { DraftItem } from "./session";

/** Graphite card with the dashed border on a pseudo-element; it turns to ink while `inking`. */
const CARD = cx(
  "relative isolate rounded-sm bg-paper-raised p-4 transition-colors duration-(--rf-dur-ink) ease-ink",
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-sm before:pencil-draft before:transition-opacity before:duration-(--rf-dur-ink) before:ease-ink before:content-['']",
);

const WHO = "m-0 mb-2 flex items-center gap-2 text-caption uppercase";

/** «Ripassa a penna» (ink) · «Modifica» · «Scarta». The first is full width on mobile. */
export function ProposalActions({
  item,
  today,
  onConfirm,
  onEdit,
  onDiscard,
}: {
  item: DraftItem;
  today: string;
  onConfirm: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const busy = item.status !== "idle";
  const summary = item.draft.type === "message" ? "" : draftSummary(item.draft, today);
  return (
    <>
      <Button
        variant="ink"
        size="sm"
        icon={INK_ICON}
        isPending={item.status === "saving"}
        isDisabled={item.status === "inking"}
        onPress={onConfirm}
        aria-label={`${MATITA_TEXT.confirm}: ${summary}`}
        className="max-md:basis-full"
      >
        {MATITA_TEXT.confirm}
      </Button>
      <Button variant="line" size="sm" isDisabled={busy} onPress={onEdit} className="max-md:flex-1">
        {MATITA_TEXT.edit}
      </Button>
      <Button
        variant="quiet"
        size="sm"
        isDisabled={busy}
        onPress={onDiscard}
        className="max-md:flex-1"
      >
        {MATITA_TEXT.discard}
      </Button>
    </>
  );
}

/** The server's `warnings[]`, one per line: Warning 16 + ink text 14 px. */
export function DraftWarnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="m-0 mb-3 flex list-none flex-col gap-1 p-0">
      {warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-1.5 text-[0.875rem] leading-5 text-ink">
          <WarningIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
          {warning}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt>{label}</dt>
      <dd className="m-0 min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** A lesson or payment proposed by Matita, outside the student's ledger (Oggi, bar, ⌘K). */
export function ProposalCard({
  item,
  today,
  onConfirm,
  onEdit,
  onDiscard,
}: {
  item: DraftItem;
  today: string;
  onConfirm: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const headingId = useId();
  const draft = item.draft as WritableDraft;
  const inking = item.status === "inking";
  const date = draft.type === "lesson" ? draft.date : draft.paid_on;
  const relative = relativeDay(date, today);
  const day = (
    <>
      {formatDayFieldValue(date)}
      {relative && <span className="text-ink-3"> ({relative})</span>}
    </>
  );
  const minutes = draft.type === "lesson" ? draftMinutes(draft) : null;

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      tabIndex={-1}
      data-matita-proposal=""
      onKeyDownCapture={proposalKeys(onConfirm, onDiscard)}
      className={cx(CARD, inking ? "text-ink before:opacity-0" : "text-pencil")}
    >
      <h3 id={headingId} className={WHO}>
        <MATITA_ICON size={16} aria-hidden />
        {MATITA_TEXT.proposes}
        <span className="sr-only">: {draftSummary(draft, today)}</span>
      </h3>
      <p className="m-0 text-[0.8125rem] leading-[1.1875rem]">
        {MATITA_TEXT.read}{" "}
        <q className="font-display text-[0.9375rem] break-words text-ink-2 italic">
          {item.sourceText}
        </q>
      </p>
      <dl className="my-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-[0.875rem] leading-5">
        <Field label="Studente">{draft.student.display_name}</Field>
        {draft.type === "lesson" ? (
          <>
            <Field label="Giorno">{day}</Field>
            <Field label="Orario">
              <span className="font-money">
                {draft.start_time}–{draft.end_time}
              </span>
              {minutes !== null && minutes > 0 && ` · ${formatMinutes(minutes)}`}
            </Field>
            <Field label="Materia">{draft.subject?.name ?? "Nessuna materia"}</Field>
            {draft.topic && (
              <Field label="Argomento">
                <span className="font-display italic">{draft.topic}</span>
              </Field>
            )}
            {draft.notes && <Field label="Note">{draft.notes}</Field>}
            <Field label="Importo">
              <span className="font-money font-medium">{formatEuro(draft.amount_cents)}</span>{" "}
              <span className="text-ink-3">a {formatRate(draft.hourly_rate_cents)}</span>
            </Field>
          </>
        ) : (
          <>
            <Field label="Importo">
              <span className="font-money font-medium">{formatEuro(draft.amount_cents)}</span>
            </Field>
            <Field label="Giorno">{day}</Field>
            <Field label="Come">{PAYMENT_METHOD_LABEL[draft.method]}</Field>
            {draft.note && <Field label="Nota">{draft.note}</Field>}
          </>
        )}
      </dl>
      <DraftWarnings warnings={draft.warnings} />
      <div className="flex flex-wrap gap-2">
        <ProposalActions
          item={item}
          today={today}
          onConfirm={onConfirm}
          onEdit={onEdit}
          onDiscard={onDiscard}
        />
      </div>
      {item.error && <FormNote className="mt-3">{item.error}</FormNote>}
      <span
        aria-hidden
        className={cx(
          "absolute right-0 bottom-0 left-0 h-0.5 origin-left bg-ink transition-transform duration-(--rf-dur-ink) ease-ink",
          inking ? "scale-x-100" : "scale-x-0",
        )}
      />
    </div>
  );
}

/** The student of the page, for WhatsApp and email (02 §7: only in the student's page). */
export interface MessageContact {
  firstName: string;
  phone: string | null;
  email: string | null;
}

/**
 * A message draft (promemoria, riepilogo…): heading from `recipient_hint`, the text (editable in
 * place), Copia always; WhatsApp for `whatsapp`, Email for `email`, only Copia for `sms`.
 * WhatsApp goes to the student's number only from their page; elsewhere wa.me asks whom.
 */
export function MessageCard({
  item,
  contact,
  onTextChange,
  onDiscard,
  onAddPhone,
}: {
  item: DraftItem;
  /** The student of the page, if any (`context.student_id`). */
  contact: MessageContact | null;
  onTextChange: (text: string) => void;
  onDiscard: () => void;
  /** «Aggiungi il numero»: the student form. */
  onAddPhone?: () => void;
}) {
  const draft = item.draft as MessageDraft;
  const headingId = useId();
  const textId = useId();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const text = item.text;

  async function copy() {
    setCopyFailed(false);
    try {
      if (!navigator.clipboard) throw new Error("clipboard");
      await navigator.clipboard.writeText(text);
      toast.show(MATITA_TEXT.copied);
    } catch {
      setCopyFailed(true);
    }
  }

  const number = contact ? toWhatsAppNumber(contact.phone) : null;
  const whatsappLabel = number && contact?.phone ? `WhatsApp · ${contact.phone}` : "WhatsApp";
  const mailTo = contact?.email ?? "";
  const linkClass = buttonClasses({ variant: "line", size: "sm", className: "max-md:flex-1" });

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      tabIndex={-1}
      data-matita-proposal=""
      onKeyDownCapture={proposalKeys(null, onDiscard)}
      className={cx(CARD, "text-pencil")}
    >
      <h3 id={headingId} className={WHO}>
        <MATITA_ICON size={16} aria-hidden />
        {messageHeading(draft.recipient_hint)}
      </h3>
      {editing ? (
        <textarea
          ref={textRef}
          id={textId}
          aria-label={MATITA_TEXT.messageLabel}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          rows={6}
          className="my-2 block min-h-[9rem] w-full resize-y rounded-xs border border-control bg-paper-raised px-3 py-2.5 text-body text-ink"
        />
      ) : (
        <p
          id={textId}
          className="my-2 rounded-xs bg-paper px-3.5 py-3 text-[0.9375rem] leading-[1.4375rem] break-words whitespace-pre-line text-ink"
        >
          {text}
        </p>
      )}
      {contact && draft.channel === "whatsapp" && !number && (
        <p className="m-0 mb-3 flex items-start gap-1.5 text-[0.875rem] leading-5 text-ink">
          <WarningIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {noPhoneText(contact.firstName)}{" "}
            {onAddPhone && (
              <InlineButton onPress={onAddPhone} className="text-ink">
                {MATITA_TEXT.addPhone}
              </InlineButton>
            )}
          </span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ink"
          size="sm"
          icon={CopyIcon}
          onPress={() => void copy()}
          className="max-md:basis-full"
        >
          {MATITA_TEXT.copy}
        </Button>
        {draft.channel === "whatsapp" && (
          <a
            href={whatsAppLink(contact?.phone ?? null, text)}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <WhatsappLogoIcon size={16} aria-hidden className="shrink-0" />
            {whatsappLabel}
          </a>
        )}
        {draft.channel === "email" && (
          <a href={`mailto:${mailTo}?body=${encodeURIComponent(text)}`} className={linkClass}>
            <EnvelopeSimpleIcon size={16} aria-hidden className="shrink-0" />
            Email
          </a>
        )}
        <Button
          variant="quiet"
          size="sm"
          onPress={() => {
            setEditing((value) => !value);
            if (!editing) window.setTimeout(() => textRef.current?.focus(), 0);
          }}
          className="max-md:flex-1"
        >
          {editing ? MATITA_TEXT.editDone : MATITA_TEXT.edit}
        </Button>
        <Button variant="quiet" size="sm" onPress={onDiscard} className="max-md:flex-1">
          {MATITA_TEXT.discard}
        </Button>
      </div>
      {copyFailed && <FormNote className="mt-3">{MATITA_TEXT.copyFailed}</FormNote>}
    </div>
  );
}
