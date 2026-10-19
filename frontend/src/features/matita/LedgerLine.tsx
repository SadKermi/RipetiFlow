// Matita as the first row of a student's ledger (02 §9.13 a, §9.6; 03 §5): the student is the
// context, so «oggi 16:30–18 mate, equazioni» is enough. Lesson and payment drafts for this student
// become ledger rows «a matita» (with «sarà deve …», or «Bozza · programmata» for a future
// lesson); answers, message drafts and drafts for other students are notes and cards under the
// line. «Promemoria» on the page sends its request through `prompt`.
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { FormNote } from "@/components/Field";
import { LedgerDraftRow, LedgerSlotRow } from "@/components/Ledger";
import { useLedgerLayout } from "@/components/ledger-context";
import type { LedgerLineProps } from "@/components/shell/matita-slot";
import { INK_ICON, PAYMENT_METHOD_LABEL } from "@/components/icon-map";
import { cx } from "@/components/utils";
import { studentQuery } from "@/lib/queries";
import { StudentFormDialog, useTutorClock } from "@/features/forms";
import { type MessageContact, MessageCard, ProposalActions, ProposalCard } from "./DraftCard";
import { draftSummary, proposalKeys } from "./draft-format";
import { useProposalFocus } from "./hooks";
import { MatitaLine } from "./MatitaLine";
import { Announcer, FailureNote, LimitNote, ReplyNote, UnavailableNote } from "./MatitaNotes";
import { MATITA_TEXT, confirmAllLabel } from "./messages";
import { type WritableDraft, balanceAfter, draftMinutes, isWritable } from "./model";
import { type DraftItem, useMatitaSession } from "./session";
import { useMatitaAvailable } from "./store";

/** Full-width rows under the line cover the red margin line, like the line itself. */
const COVER = "relative bg-paper-raised";

function draftRowTitle(draft: WritableDraft): { title: string; detail: string | null } {
  if (draft.type === "lesson")
    return { title: draft.subject?.name ?? "Lezione", detail: draft.topic };
  const method = PAYMENT_METHOD_LABEL[draft.method].toLowerCase();
  return { title: "Pagamento", detail: draft.note ? `${method} · ${draft.note}` : method };
}

export function LedgerLine({
  student,
  balanceCents,
  today,
  prompt,
  openLessonForm,
  openPaymentForm,
}: LedgerLineProps) {
  const available = useMatitaAvailable();
  const { nowMinutes } = useTutorClock();
  const layout = useLedgerLayout();
  const session = useMatitaSession({ studentId: student.id, openLessonForm, openPaymentForm });
  // Contacts for the message drafts (WhatsApp / email): the page has already loaded the student.
  const details = useQuery(studentQuery(student.id)).data;
  const [editingStudent, setEditingStudent] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useProposalFocus(
    session,
    () => lineRef.current?.closest<HTMLElement>("table, ol") ?? null,
    inputRef,
  );

  // «Promemoria»: the line fills with the request and sends it (03 §5). Each nonce once only.
  const handled = useRef<number | null>(null);
  const send = useEffectEvent((text: string) => {
    if (available) session.submit(text);
  });
  useEffect(() => {
    if (!prompt || handled.current === prompt.nonce) return;
    handled.current = prompt.nonce;
    send(prompt.text);
  }, [prompt]);

  const newLesson = () => openLessonForm({});

  if (!available) {
    // Like the page's own row without Matita: the text starts after the red margin line.
    return (
      <LedgerSlotRow>
        <div
          className={cx(
            "flex min-h-14 items-center gap-3 border-b border-ink-3 py-1.5 pr-3",
            layout === "table" ? "pl-[116px]" : "pl-[84px]",
          )}
        >
          <UnavailableNote />
          <Button
            variant="line"
            square
            size="sm"
            icon={PlusIcon}
            aria-label={MATITA_TEXT.newLesson}
            onPress={newLesson}
          />
        </div>
      </LedgerSlotRow>
    );
  }

  const contact: MessageContact | null = details
    ? {
        firstName: details.first_name,
        phone: details.guardian_phone ?? details.phone ?? null,
        email: details.guardian_email ?? details.email ?? null,
      }
    : null;
  const inLedger = (item: DraftItem): item is DraftItem & { draft: WritableDraft } =>
    isWritable(item.draft) && item.draft.student.id === student.id;
  const rows = session.drafts.filter(inLedger);
  const cards = session.drafts.filter((item) => !inLedger(item));
  const writable = session.drafts.filter(
    (item) => isWritable(item.draft) && item.status === "idle",
  );
  const showNotes =
    session.blocked !== null ||
    (session.failure !== null && session.failure.kind !== "rate_limited") ||
    session.note !== null ||
    writable.length >= 2;
  const pad = "px-3.5 py-3";

  return (
    <>
      <LedgerSlotRow>
        <div ref={lineRef} className={COVER}>
          <MatitaLine
            session={session}
            variant="page"
            placeholder={MATITA_TEXT.placeholderLedger}
            onNewLesson={newLesson}
            inputRef={inputRef}
            metaInset="px-3.5"
          />
          <Announcer text={session.announcement} />
          <StudentFormDialog
            isOpen={editingStudent}
            onOpenChange={setEditingStudent}
            studentId={student.id}
          />
        </div>
      </LedgerSlotRow>
      {showNotes && (
        <LedgerSlotRow>
          <div className={cx(COVER, "flex flex-col gap-3 border-b border-rule", pad)}>
            {session.blocked && <LimitNote detail={session.blocked} />}
            {session.failure && (
              <FailureNote failure={session.failure} onRetry={() => session.submit()} />
            )}
            {session.note && <ReplyNote note={session.note} onUseForm={newLesson} />}
            {writable.length >= 2 && (
              <div>
                <Button
                  variant="line"
                  size="sm"
                  icon={INK_ICON}
                  onPress={() => void session.confirmAll()}
                >
                  {confirmAllLabel(writable.length)}
                </Button>
              </div>
            )}
          </div>
        </LedgerSlotRow>
      )}
      {rows.map((item) => (
        <DraftRow
          key={item.key}
          item={item}
          today={today}
          balanceAfterCents={balanceAfter(item.draft, balanceCents, today, nowMinutes)}
          onConfirm={() => void session.confirm(item.key)}
          onEdit={() => session.edit(item.key)}
          onDiscard={() => session.discard(item.key)}
        />
      ))}
      {cards.length > 0 && (
        <LedgerSlotRow>
          <div className={cx(COVER, "flex flex-col gap-3 border-b border-rule", pad)}>
            {cards.map((item) =>
              item.draft.type === "message" ? (
                <MessageCard
                  key={item.key}
                  item={item}
                  contact={contact}
                  onTextChange={(text) => session.setMessageText(item.key, text)}
                  onDiscard={() => session.discard(item.key)}
                  onAddPhone={() => setEditingStudent(true)}
                />
              ) : (
                <ProposalCard
                  key={item.key}
                  item={item}
                  today={today}
                  onConfirm={() => void session.confirm(item.key)}
                  onEdit={() => session.edit(item.key)}
                  onDiscard={() => session.discard(item.key)}
                />
              ),
            )}
          </div>
        </LedgerSlotRow>
      )}
    </>
  );
}

/** A draft for this student, as a ledger row «a matita» (+ the error of a failed confirmation). */
function DraftRow({
  item,
  today,
  balanceAfterCents,
  onConfirm,
  onEdit,
  onDiscard,
}: {
  item: DraftItem & { draft: WritableDraft };
  today: string;
  balanceAfterCents: number | null;
  onConfirm: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const draft = item.draft;
  const { title, detail } = draftRowTitle(draft);
  return (
    <>
      <LedgerDraftRow
        kind={draft.type}
        date={draft.type === "lesson" ? draft.date : draft.paid_on}
        today={today}
        startTime={draft.type === "lesson" ? draft.start_time : null}
        endTime={draft.type === "lesson" ? draft.end_time : null}
        durationMinutes={draft.type === "lesson" ? draftMinutes(draft) : null}
        title={title}
        detail={detail}
        amountCents={draft.amount_cents}
        balanceAfterCents={balanceAfterCents}
        sourceText={item.sourceText}
        warnings={draft.warnings}
        inking={item.status === "inking"}
        // The row is the proposal that takes the focus (02 §9.13): Cmd/Ctrl + Enter goes over it
        // in ink, Esc discards it, on the row and on its buttons alike.
        proposalLabel={`${MATITA_TEXT.proposes}: ${draftSummary(draft, today)}`}
        onKeyDownCapture={proposalKeys(onConfirm, onDiscard)}
        actions={
          <ProposalActions
            item={item}
            today={today}
            onConfirm={onConfirm}
            onEdit={onEdit}
            onDiscard={onDiscard}
          />
        }
      />
      {item.error && (
        <LedgerSlotRow>
          <FormNote className={cx(COVER, "border-b border-rule px-3.5 py-2.5")}>
            {item.error}
          </FormNote>
        </LedgerSlotRow>
      )}
    </>
  );
}
