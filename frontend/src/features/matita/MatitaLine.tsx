// The Matita line (02 §9.13 «riga di comando»): PencilSimpleLine in graphite · the field in Literata
// italic (17 px, 16 on mobile) · the ⌘K / Ctrl K chip (desktop, hidden once there is text) · the
// square «+» for the manual form (on mobile it becomes «Invia» while there is text). Bottom rule in
// ink-3: «qui si scrive». Enter proposes, Esc cancels, ↑/↓ in the empty line go through the notes.
import { PaperPlaneRightIcon, PlusIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, type RefObject, useEffect, useId, useRef } from "react";
import { Button } from "@/components/Button";
import { MATITA_ICON } from "@/components/icon-map";
import { ShortcutKbd } from "@/components/icons";
import { cx } from "@/components/utils";
import { ASSISTANT_MAX_CHARS } from "@/lib/queries";
import { MATITA_TEXT, remainingText } from "./messages";
import { counterText, isNearLimit, requestsLeft } from "./model";
import { Scribble } from "./Scribble";
import type { MatitaSession } from "./session";
import { registerLine } from "./store";

export interface MatitaLineProps {
  session: MatitaSession;
  placeholder: string;
  /**
   * `page`: the line of a page (ledger, Oggi) — ⌘K focuses it; `mobile`: the bar above the tab
   * bar («+» becomes «Invia»); `dialog`: the line of the ⌘K dialog (Esc closes the dialog).
   */
  variant: "page" | "mobile" | "dialog";
  /** The square «+»: the lesson form. Absent = no button. */
  onNewLesson?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** The ⌘K dialog opens on the line: the tutor asked for it. */
  focusOnMount?: boolean;
  className?: string;
  /** Classes of the row itself (e.g. the dialog's left padding). */
  rowClassName?: string;
  /** Side padding of the hint and quota lines when the line spans a box (ledger, bar, dialog). */
  metaInset?: string;
}

export function MatitaLine({
  session,
  placeholder,
  variant,
  onNewLesson,
  inputRef,
  focusOnMount = false,
  className,
  rowClassName,
  metaInset,
}: MatitaLineProps) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;
  const hintId = useId();
  const pending = session.pending !== null;
  const blocked = session.blocked !== null;
  const hasText = session.text.trim() !== "";
  const counter = counterText(session.text.length, ASSISTANT_MAX_CHARS);
  const usage = session.usage;

  // ⌘K / Ctrl K reaches the page's line, or the mobile bar (03 §9.2).
  useEffect(() => {
    const element = ref.current;
    if (variant === "dialog" || !element) return;
    return registerLine({ kind: variant === "page" ? "page" : "bar", element });
  }, [variant, ref]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!pending && !blocked) session.submit();
      return;
    }
    if (event.key === "Escape") {
      // In the dialog Esc closes it (unless it stops a request in flight).
      if (session.escape(variant !== "dialog")) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && session.text === "") {
      if (session.browseNotes(event.key === "ArrowUp" ? -1 : 1)) event.preventDefault();
    }
  }

  let trailing = null;
  if (variant === "mobile" && (hasText || pending)) {
    trailing = (
      <Button
        variant="ink"
        icon={PaperPlaneRightIcon}
        isPending={pending}
        isDisabled={blocked}
        onPress={() => session.submit()}
      >
        {MATITA_TEXT.send}
      </Button>
    );
  } else if (onNewLesson) {
    trailing = (
      <Button
        variant="line"
        square
        size={variant === "mobile" ? "md" : "sm"}
        icon={PlusIcon}
        aria-label={MATITA_TEXT.newLesson}
        onPress={onNewLesson}
      />
    );
  }

  // Phones have no Esc key: the mobile bar shows only «Matita sta scrivendo…».
  const hint = pending ? (
    <>
      <span className="marker">{MATITA_TEXT.thinking}</span>
      {variant !== "mobile" && <> · {MATITA_TEXT.cancelHint}</>}
    </>
  ) : hasText && variant !== "mobile" ? (
    MATITA_TEXT.writingHint
  ) : null;
  const usageText =
    usage && !blocked && isNearLimit(usage) ? remainingText(requestsLeft(usage)) : null;
  const inset = metaInset ?? (variant === "page" ? null : "px-4");

  return (
    <div className={className}>
      <div
        className={cx(
          "relative flex min-h-14 items-center gap-2.5 border-b bg-paper-raised py-1.5 pr-2 pl-3.5 focus-within:shadow-[inset_0_0_0_2px_var(--rf-ink),0_0_0_5px_var(--rf-highlight)]",
          variant === "mobile" ? "border-rule" : "border-ink-3",
          rowClassName,
        )}
      >
        <MATITA_ICON size={20} aria-hidden className="shrink-0 text-pencil" />
        <textarea
          ref={ref}
          rows={1}
          value={session.text}
          onChange={(event) => session.setText(event.target.value)}
          onKeyDown={onKeyDown}
          readOnly={pending || blocked}
          aria-disabled={blocked || undefined}
          aria-label={MATITA_TEXT.inputLabel}
          aria-describedby={hintId}
          aria-keyshortcuts={variant === "dialog" ? undefined : "Meta+K Control+K"}
          placeholder={placeholder}
          maxLength={ASSISTANT_MAX_CHARS}
          enterKeyHint="send"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the ⌘K dialog opens on its line
          autoFocus={focusOnMount}
          className={cx(
            "field-sizing-content block max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 font-display text-[1rem] leading-6 italic placeholder:text-pencil placeholder:opacity-100 focus-visible:shadow-none focus-visible:outline-none md:text-voice",
            pending ? "text-pencil" : "text-ink",
            blocked && "cursor-not-allowed",
          )}
        />
        {variant === "page" && !hasText && <ShortcutKbd className="shrink-0" />}
        {trailing}
        {pending && (
          <Scribble className="absolute right-14 bottom-1 left-11 w-[calc(100%-6.25rem)]" />
        )}
      </div>
      <p
        id={hintId}
        className={cx(
          "m-0 flex items-baseline gap-3 text-[0.8125rem] leading-[1.125rem] text-ink-3",
          inset,
          (hint || counter) && "mt-1.5",
          (hint || counter) && !usageText && inset && "mb-2",
        )}
      >
        {hint && <span className="min-w-0">{hint}</span>}
        {counter && <span className="ml-auto shrink-0">{counter}</span>}
      </p>
      {usageText && (
        <p
          className={cx(
            "m-0 mt-1 text-[0.8125rem] leading-[1.125rem] text-ink-3",
            inset,
            inset && "mb-2",
          )}
        >
          {usageText}
        </p>
      )}
    </div>
  );
}
