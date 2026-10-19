// «Matita ⌘K» in the desktop top bar (02 §9.14) and the shortcut itself (03 §9.2). Cmd K / Ctrl K
// (or the button) focuses the Matita line of the page — the ledger's, Oggi's, the mobile bar —
// and where there is none (Agenda, Studenti, Impostazioni) opens the line in a dialog at the top.
// Absent, with no shortcut, when Matita is not available on this server.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/Button";
import { MATITA_ICON } from "@/components/icon-map";
import { ShortcutKbd } from "@/components/icons";
import { CommandDialog } from "./CommandDialog";
import { DraftForms } from "./DraftForms";
import { useDraftForms } from "./hooks";
import { MATITA_TEXT } from "./messages";
import { useMatitaSession } from "./session";
import { focusPageLine, useMatitaAvailable } from "./store";

/** React Aria's Button drops `aria-keyshortcuts`: set it on the element. */
function announceShortcut(element: HTMLButtonElement | null) {
  element?.setAttribute("aria-keyshortcuts", "Meta+K Control+K");
}

function isShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

export function TopBarButton() {
  const available = useMatitaAvailable();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const forms = useDraftForms();
  // «Modifica» in the dialog: the dialog closes and the form opens in its place; the draft stays
  // in the conversation until the form is saved.
  const session = useMatitaSession({
    openLessonForm: (initial, options) => {
      setOpen(false);
      forms.openLessonForm(initial, options);
    },
    openPaymentForm: (initial, options) => {
      setOpen(false);
      forms.openPaymentForm(initial, options);
    },
  });
  const dialogInputRef = useRef<HTMLTextAreaElement>(null);

  function activate() {
    if (!focusPageLine()) setOpen(true);
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!isShortcut(event)) return;
    if (open) {
      event.preventDefault();
      dialogInputRef.current?.focus();
      return;
    }
    // A form or a confirmation is open: it keeps the focus (and the browser its own shortcut).
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    event.preventDefault();
    activate();
  });
  useEffect(() => {
    if (!available) return;
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [available]);

  // The conversation of the dialog starts over on every page (02 §9.13).
  const startOver = useEffectEvent(() => {
    setOpen(false);
    session.reset();
  });
  const visited = useRef(pathname);
  useEffect(() => {
    if (visited.current === pathname) return;
    visited.current = pathname;
    startOver();
  }, [pathname]);

  return (
    <>
      {available && (
        <Button variant="line" icon={MATITA_ICON} onPress={activate} ref={announceShortcut}>
          {MATITA_TEXT.topBar}
          <ShortcutKbd className="ml-0.5" />
        </Button>
      )}
      <CommandDialog
        isOpen={open}
        onOpenChange={setOpen}
        session={session}
        inputRef={dialogInputRef}
        onNewLesson={() => {
          setOpen(false);
          forms.openLessonForm({});
        }}
      />
      <DraftForms forms={forms} />
    </>
  );
}
