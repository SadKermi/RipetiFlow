// Matita on mobile (02 §9.13 c, 03 §9.1): the bar fixed above the tab bar on every main page but
// the student's (there the line is the first row of the ledger). «Scrivi a Matita…» + «+» (the
// lesson form), which becomes «Invia» while there is text. Proposals and answers open in a panel
// above the bar, up to about half the screen; «Chiudi Matita» clears it. A new page starts over.
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useEffectEvent, useRef } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/Button";
import { MATITA_ICON } from "@/components/icon-map";
import { useTutorClock } from "@/features/forms";
import { DraftForms } from "./DraftForms";
import { useDraftForms, useProposalFocus } from "./hooks";
import { MatitaLine } from "./MatitaLine";
import { Announcer } from "./MatitaNotes";
import { MATITA_TEXT } from "./messages";
import { MatitaResults } from "./MatitaResults";
import { useMatitaSession } from "./session";
import { useMatitaAvailable } from "./store";

export function MobileBar() {
  const available = useMatitaAvailable();
  const { today } = useTutorClock();
  const { pathname } = useLocation();
  const forms = useDraftForms();
  const session = useMatitaSession({
    openLessonForm: forms.openLessonForm,
    openPaymentForm: forms.openPaymentForm,
  });
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useProposalFocus(session, () => panelRef.current, inputRef);

  // «La conversazione si azzera cambiando pagina» (02 §9.13): the bar outlives the pages.
  const startOver = useEffectEvent(() => session.reset());
  const visited = useRef(pathname);
  useEffect(() => {
    if (visited.current === pathname) return;
    visited.current = pathname;
    startOver();
  }, [pathname]);

  const newLesson = () => forms.openLessonForm({});
  const hasPanel =
    session.blocked !== null ||
    (session.failure !== null && session.failure.kind !== "rate_limited") ||
    session.note !== null ||
    session.drafts.length > 0;

  if (!available) {
    // Without Matita the bar keeps only the «+» (02 §9.13 «Non disponibile»).
    return (
      <div className="flex justify-end px-4 py-1.5">
        <Button
          variant="line"
          square
          icon={PlusIcon}
          aria-label={MATITA_TEXT.newLesson}
          onPress={newLesson}
        />
        <DraftForms forms={forms} />
      </div>
    );
  }

  return (
    <div>
      {hasPanel && (
        <section
          ref={panelRef}
          aria-label="Matita"
          className="max-h-[55dvh] overflow-y-auto overscroll-contain border-b border-rule px-4 pb-4"
        >
          <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-paper-raised pr-2 pl-4">
            <p className="m-0 flex items-center gap-2 text-caption text-pencil uppercase">
              <MATITA_ICON size={16} aria-hidden />
              Matita
            </p>
            <Button
              variant="quiet"
              square
              icon={XIcon}
              aria-label={MATITA_TEXT.close}
              onPress={() => {
                session.reset();
                inputRef.current?.focus();
              }}
            />
          </div>
          <MatitaResults session={session} today={today} onUseForm={newLesson} />
        </section>
      )}
      <MatitaLine
        session={session}
        variant="mobile"
        placeholder={MATITA_TEXT.placeholderMobile}
        onNewLesson={newLesson}
        inputRef={inputRef}
      />
      <Announcer text={session.announcement} />
      <DraftForms forms={forms} />
    </div>
  );
}
