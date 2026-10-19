// Dialogs and bottom sheets (docs/design/02-design-system.md §9.12). Below 768 px a bottom sheet
// (top corners 14 px, handle, fixed action bar above the safe area, swipe down on the handle);
// from 768 px a 560 px dialog at 12vh. Focus is trapped and returns to the opener (React Aria).
import { XIcon } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { errorMessage } from "@/lib/api/problem";
import { Button } from "./Button";
import { FormNote } from "./Field";
import { cx } from "./utils";

/** Pixels of drag on the handle that close the sheet. */
const SWIPE_CLOSE_PX = 80;

export type SheetSize = "form" | "full" | "small";

export interface SheetApi {
  /** Closes like «Annulla», the scrim or Esc: asks first when there are unsaved changes. */
  close: () => void;
}

export interface SheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Literata display-m: «Nuova lezione», «Pagamento ricevuto», «Storico modifiche». */
  title: string;
  /** Line under the title («Giulia Ferri»). */
  subtitle?: ReactNode;
  children: ReactNode | ((api: SheetApi) => ReactNode);
  /** Fixed action bar (use <SheetActions>): [Annulla] on the left, [■ Salva …] on the right. */
  actions?: ReactNode | ((api: SheetApi) => ReactNode);
  /** Note above the action bar: the server error without a field (<FormNote>). */
  note?: ReactNode;
  /** Unsaved changes: closing first asks «Scartare le modifiche?». */
  isDirty?: boolean;
  /** Wraps body and actions in a <form> (Enter submits on desktop). */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** `form` (auto height up to 92 %), `full` (full height on mobile), `small` (confirmations). */
  size?: SheetSize;
  role?: "dialog" | "alertdialog";
  /** Hide the «Chiudi» button of the header (forms already have «Annulla»). */
  hideCloseButton?: boolean;
  className?: string;
}

const OVERLAY =
  "fixed inset-0 z-(--rf-z-overlay) flex items-end justify-center bg-scrim transition-opacity duration-(--rf-dur-3) ease-out starting:opacity-0 data-exiting:opacity-0 data-exiting:ease-in md:items-start md:pt-[12vh]";

const MODAL =
  "flex w-full flex-col overflow-hidden rounded-t-sheet bg-paper-raised shadow-sheet outline-none transition-[translate,opacity] duration-(--rf-dur-3) ease-out starting:translate-y-full data-exiting:translate-y-full data-exiting:ease-in md:rounded-sm md:starting:translate-y-2 md:starting:opacity-0 md:data-exiting:translate-y-2 md:data-exiting:opacity-0";

const SIZE: Record<SheetSize, string> = {
  form: "max-h-[92dvh] md:max-h-[76vh] md:w-[560px]",
  full: "h-[96dvh] md:h-auto md:max-h-[76vh] md:w-[560px]",
  small: "max-h-[92dvh] md:w-[440px]",
};

export function Sheet({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  children,
  actions,
  note,
  isDirty = false,
  onSubmit,
  size = "form",
  role = "dialog",
  hideCloseButton = false,
  className,
}: SheetProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const askedDiscard = useRef(false);
  const discardQuestionId = useId();

  // The question replaces the action bar (and the button that was pressed): move the focus into
  // it, and back to the dialog when the tutor keeps editing, so Esc and Tab keep working.
  useEffect(() => {
    if (confirmingDiscard) {
      askedDiscard.current = true;
      keepEditingRef.current?.focus();
    } else if (askedDiscard.current) {
      askedDiscard.current = false;
      dialogRef.current?.focus();
    }
  }, [confirmingDiscard]);

  // Reset the discard question every time the sheet opens again.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setConfirmingDiscard(false);
  }

  const close = () => {
    if (isDirty) setConfirmingDiscard(true);
    else onOpenChange(false);
  };
  const api: SheetApi = { close };

  const body = typeof children === "function" ? children(api) : children;
  const actionBar = typeof actions === "function" ? actions(api) : actions;

  const footer = confirmingDiscard ? (
    <div role="group" aria-labelledby={discardQuestionId} className="flex flex-col gap-3">
      <p id={discardQuestionId} className="m-0 text-body font-medium text-ink">
        Scartare le modifiche?
      </p>
      <SheetActions>
        <Button variant="line" ref={keepEditingRef} onPress={() => setConfirmingDiscard(false)}>
          Continua a modificare
        </Button>
        <Button variant="danger" onPress={() => onOpenChange(false)}>
          Scarta modifiche
        </Button>
      </SheetActions>
    </div>
  ) : (
    actionBar
  );

  const content = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6">{body}</div>
      {(footer || note) && (
        <div className="border-t border-rule bg-paper-raised px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)_+_0.75rem)] md:px-6 md:pb-6">
          {note && !confirmingDiscard && <div className="mb-3">{note}</div>}
          {footer}
        </div>
      )}
    </>
  );

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
        else onOpenChange(true);
      }}
      isDismissable
      className={OVERLAY}
    >
      <Modal
        className={cx(MODAL, SIZE[size], className)}
        style={dragY > 0 ? { transform: `translateY(${String(dragY)}px)` } : undefined}
      >
        <Dialog ref={dialogRef} role={role} className="flex min-h-0 flex-1 flex-col outline-none">
          <div className="px-4 pt-2 md:px-6 md:pt-6">
            <div
              aria-hidden
              className="mx-auto mb-2 flex h-5 w-16 cursor-grab touch-none items-center justify-center md:hidden"
              onPointerDown={(event) => {
                dragStart.current = event.clientY;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (dragStart.current === null) return;
                setDragY(Math.max(0, event.clientY - dragStart.current));
              }}
              onPointerUp={() => {
                const shouldClose = dragY > SWIPE_CLOSE_PX;
                dragStart.current = null;
                setDragY(0);
                if (shouldClose) close();
              }}
              onPointerCancel={() => {
                dragStart.current = null;
                setDragY(0);
              }}
            >
              <span className="block h-1 w-9 rounded-[2px] bg-rule-strong" />
            </div>
            <div className="flex items-start justify-between gap-3 pb-3">
              <div className="min-w-0">
                <Heading
                  slot="title"
                  className="m-0 font-display text-display-m font-normal text-balance text-ink"
                >
                  {title}
                </Heading>
                {subtitle && <div className="mt-1 text-[0.9375rem] text-ink-2">{subtitle}</div>}
              </div>
              {!hideCloseButton && (
                <Button
                  variant="quiet"
                  square
                  icon={XIcon}
                  aria-label="Chiudi"
                  onPress={close}
                  className="-mt-1 -mr-2 shrink-0"
                />
              )}
            </div>
          </div>
          {onSubmit ? (
            <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              {content}
            </form>
          ) : (
            content
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * Action bar of a sheet: on mobile the buttons share the width (one alone takes it all); on
 * desktop they sit on the right, primary last. `start` (e.g. [Elimina]) goes to the far left.
 */
export function SheetActions({ children, start }: { children: ReactNode; start?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 *:flex-1 md:flex-nowrap md:justify-end md:*:flex-none">
      {start && (
        <div className="flex basis-full *:flex-1 md:mr-auto md:basis-auto md:*:flex-none">
          {start}
        </div>
      )}
      {children}
    </div>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** A question: «Eliminare la lezione di lun 5 ott?». Never «Sei sicuro?» alone. */
  title: string;
  /** One sentence with the real numbers: «Il saldo passa da deve 67,00 € a deve 23,00 €.» */
  effect: ReactNode;
  /** The verb: «Elimina lezione», «Archivia», «Scollega». */
  confirmLabel: string;
  /** Runs the action; a rejection keeps the dialog open with the server's text above the buttons. */
  onConfirm: () => Promise<unknown> | void;
  cancelLabel?: string;
  /** `danger` for destructive actions (default); `ink` for non-destructive confirmations. */
  tone?: "danger" | "ink";
  /** Extra controls between the sentence and the buttons (e.g. a checkbox). */
  children?: ReactNode;
  /** Shown next to the error (e.g. [Archivia] when deleting a student answers 409). */
  recovery?: (error: unknown) => ReactNode;
}

/** Destructive confirmation (03 §7.5): title-question, the effect, [Annulla] and the verb. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  effect,
  confirmLabel,
  onConfirm,
  cancelLabel = "Annulla",
  tone = "danger",
  children,
  recovery,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setError(null);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(caught ?? new Error("rejected"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
      title={title}
      size="small"
      role="alertdialog"
      hideCloseButton
      note={
        error ? (
          <FormNote>
            {errorMessage(error)}
            {recovery && <div className="mt-2">{recovery(error)}</div>}
          </FormNote>
        ) : null
      }
      actions={({ close }) => (
        <div className="flex gap-2 *:flex-1 md:justify-end md:*:flex-none">
          <Button variant="line" onPress={close} isDisabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "ink"}
            isPending={pending}
            onPress={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      )}
    >
      <div className="text-body text-ink-2">{effect}</div>
      {children && <div className="mt-4">{children}</div>}
    </Sheet>
  );
}
