// Matita under the title of «Oggi» on desktop (02 §9.13 b, 03 §3): «Scrivi una riga… «ieri
// 15–16:30 matematica con Luca»» + ⌘K + «+»; proposals and answers as cards and notes under it.
import { PlusIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { Button } from "@/components/Button";
import { useTutorClock } from "@/features/forms";
import { DraftForms } from "./DraftForms";
import { useDraftForms, useExampleName, useProposalFocus } from "./hooks";
import { MatitaLine } from "./MatitaLine";
import { Announcer, UnavailableNote } from "./MatitaNotes";
import { MATITA_TEXT, placeholderWithStudent } from "./messages";
import { MatitaResults } from "./MatitaResults";
import { useMatitaSession } from "./session";
import { useMatitaAvailable } from "./store";

export function TodayLine() {
  const available = useMatitaAvailable();
  const { today } = useTutorClock();
  const forms = useDraftForms();
  const session = useMatitaSession({
    openLessonForm: forms.openLessonForm,
    openPaymentForm: forms.openPaymentForm,
  });
  const name = useExampleName();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useProposalFocus(session, () => containerRef.current, inputRef);

  const newLesson = () => forms.openLessonForm({});

  return (
    <div ref={containerRef}>
      {available ? (
        <>
          <MatitaLine
            session={session}
            variant="page"
            placeholder={placeholderWithStudent(name)}
            onNewLesson={newLesson}
            inputRef={inputRef}
          />
          <Announcer text={session.announcement} />
          <MatitaResults className="mt-3" session={session} today={today} onUseForm={newLesson} />
        </>
      ) : (
        <div className="flex min-h-14 items-center gap-3 border-b border-ink-3">
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
      )}
      <DraftForms forms={forms} />
    </div>
  );
}
