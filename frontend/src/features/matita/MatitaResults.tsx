// What a Matita line shows under it outside the ledger (Oggi, the mobile bar, the ⌘K dialog): the
// daily limit, an error with «Riprova», the margin note, and the proposals as cards «a matita»
// with «Ripassa tutte a penna (n)» when there are two or more lessons/payments.
import { INK_ICON } from "@/components/icon-map";
import { Button } from "@/components/Button";
import { cx } from "@/components/utils";
import { type MessageContact, MessageCard, ProposalCard } from "./DraftCard";
import { confirmAllLabel } from "./messages";
import { FailureNote, LimitNote, ReplyNote } from "./MatitaNotes";
import { isWritable } from "./model";
import type { MatitaSession } from "./session";

export interface MatitaResultsProps {
  session: MatitaSession;
  today: string;
  /** «oppure usa il modulo» under a reply. */
  onUseForm: () => void;
  /** The page's student, for the message drafts' WhatsApp / email (null outside their page). */
  contact?: MessageContact | null;
  onAddPhone?: () => void;
  /** After a draft (or all of them) went over in ink: the ⌘K dialog closes. */
  onConfirmed?: () => void;
  className?: string;
}

export function MatitaResults({
  session,
  today,
  onUseForm,
  contact = null,
  onAddPhone,
  onConfirmed,
  className,
}: MatitaResultsProps) {
  const writable = session.drafts.filter(
    (item) => isWritable(item.draft) && item.status === "idle",
  );
  const empty =
    !session.blocked && !session.failure && !session.note && session.drafts.length === 0;
  if (empty) return null;

  async function confirm(key: string) {
    if (await session.confirm(key)) onConfirmed?.();
  }
  async function confirmAll() {
    if (await session.confirmAll()) onConfirmed?.();
  }

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      {session.blocked && <LimitNote detail={session.blocked} />}
      {session.failure && (
        <FailureNote failure={session.failure} onRetry={() => session.submit()} />
      )}
      {session.note && <ReplyNote note={session.note} onUseForm={onUseForm} />}
      {writable.length >= 2 && (
        <div>
          <Button variant="line" size="sm" icon={INK_ICON} onPress={() => void confirmAll()}>
            {confirmAllLabel(writable.length)}
          </Button>
        </div>
      )}
      {session.drafts.map((item) =>
        item.draft.type === "message" ? (
          <MessageCard
            key={item.key}
            item={item}
            contact={contact}
            onTextChange={(text) => session.setMessageText(item.key, text)}
            onDiscard={() => session.discard(item.key)}
            onAddPhone={onAddPhone}
          />
        ) : (
          <ProposalCard
            key={item.key}
            item={item}
            today={today}
            onConfirm={() => void confirm(item.key)}
            onEdit={() => session.edit(item.key)}
            onDiscard={() => session.discard(item.key)}
          />
        ),
      )}
    </div>
  );
}
