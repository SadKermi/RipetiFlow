// The ⌘K dialog (03 §9.2): on pages without a Matita line, a dialog 720 px wide at 12 vh with the
// line alone and, under it, the last 3 phrases used in graphite (kept only in this browser; Tab
// reaches them). Proposals appear as cards; «Ripassa a penna» saves and closes. Esc closes.
import type { RefObject } from "react";
import { useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useAuth } from "@/app/auth";
import { cx } from "@/components/utils";
import { useTutorClock } from "@/features/forms";
import { useExampleName, useProposalFocus } from "./hooks";
import { MatitaLine } from "./MatitaLine";
import { Announcer, UnavailableNote } from "./MatitaNotes";
import { MATITA_TEXT, placeholderWithStudent } from "./messages";
import { MatitaResults } from "./MatitaResults";
import type { MatitaSession } from "./session";
import { readRecentPhrases, useMatitaAvailable } from "./store";

const OVERLAY =
  "fixed inset-0 z-(--rf-z-overlay) flex items-start justify-center bg-scrim px-4 pt-[12vh] transition-opacity duration-(--rf-dur-3) ease-out starting:opacity-0 data-exiting:opacity-0 data-exiting:ease-in";

const MODAL =
  "flex max-h-[76vh] w-full max-w-[720px] flex-col overflow-hidden rounded-sm bg-paper-raised shadow-sheet outline-none transition-[translate,opacity] duration-(--rf-dur-3) ease-out starting:translate-y-2 starting:opacity-0 data-exiting:translate-y-2 data-exiting:opacity-0 data-exiting:ease-in";

export interface CommandDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept by the top bar button: the drafts survive the dialog closing for «Modifica». */
  session: MatitaSession;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onNewLesson: () => void;
}

export function CommandDialog({
  isOpen,
  onOpenChange,
  session,
  inputRef,
  onNewLesson,
}: CommandDialogProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={OVERLAY}>
      <Modal className={MODAL}>
        <Dialog aria-label="Matita" className="flex min-h-0 flex-1 flex-col outline-none">
          <DialogBody
            session={session}
            inputRef={inputRef}
            onNewLesson={onNewLesson}
            onClose={() => onOpenChange(false)}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function DialogBody({
  session,
  inputRef,
  onNewLesson,
  onClose,
}: {
  session: MatitaSession;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onNewLesson: () => void;
  onClose: () => void;
}) {
  const available = useMatitaAvailable();
  const { user } = useAuth();
  const { today } = useTutorClock();
  const name = useExampleName();
  // Read when the dialog opens: the phrases of this browser only.
  const [recent] = useState(() => readRecentPhrases(user?.id));
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  useProposalFocus(session, () => body, inputRef);

  if (!available) {
    return (
      <div className="p-5">
        <UnavailableNote />
      </div>
    );
  }

  const hasResults =
    session.blocked !== null ||
    session.note !== null ||
    session.failure !== null ||
    session.drafts.length > 0;
  const showRecent =
    recent.length > 0 && session.text === "" && session.pending === null && !hasResults;

  return (
    <>
      <h2 className="sr-only">Matita</h2>
      <MatitaLine
        session={session}
        variant="dialog"
        placeholder={placeholderWithStudent(name)}
        onNewLesson={onNewLesson}
        inputRef={inputRef}
        focusOnMount
        rowClassName="pl-5"
      />
      <Announcer text={session.announcement} />
      <div
        ref={setBody}
        className={cx("min-h-0 overflow-y-auto px-4", (hasResults || showRecent) && "pt-3 pb-4")}
      >
        {showRecent && (
          <div>
            <p className="m-0 mb-1 text-caption text-ink-3 uppercase">{MATITA_TEXT.recent}</p>
            <ul className="m-0 list-none p-0">
              {recent.map((phrase) => (
                <li key={phrase}>
                  <button
                    type="button"
                    className="block min-h-11 w-full cursor-pointer truncate rounded-xs px-1 text-left font-display text-body text-pencil italic hover:bg-paper-sunk"
                    onClick={() => {
                      session.setText(phrase);
                      inputRef.current?.focus();
                    }}
                  >
                    {phrase}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <MatitaResults
          session={session}
          today={today}
          onUseForm={onNewLesson}
          onConfirmed={onClose}
        />
      </div>
    </>
  );
}
