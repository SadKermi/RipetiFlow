// Toasts (docs/design/02-design-system.md §9.11): ink background, on-ink text, radius 6, ≥ 48 px,
// max 420 px; bottom centre above the tab bar on mobile, bottom left on desktop. 5 s (8 s with
// «Annulla»), paused on hover/focus, announced through a polite live region that is always there.
import { CheckIcon } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import {
  TOAST_DURATION_MS,
  TOAST_WITH_ACTION_DURATION_MS,
  type ToastApi,
  ToastContext,
  type ToastOptions,
} from "./toast-context";

interface QueuedToast extends ToastOptions {
  id: string;
  durationMs: number;
}

/** At most this many toasts on screen; older ones leave first. */
const MAX_VISIBLE = 3;

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((input: ToastOptions | string) => {
    const options = typeof input === "string" ? { message: input } : input;
    counter += 1;
    const id = `toast-${String(counter)}`;
    const durationMs =
      options.durationMs ?? (options.action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS);
    setToasts((current) => [...current, { ...options, id, durationMs }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={api}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

/**
 * On the phone, sheets and confirmations rise from the bottom, right where the toasts are: while
 * one is open (its scrim is on the page) the toasts go under the scrim instead of covering the
 * question and the sentence on its effect (02 §9.12). On desktop the dialog is centred: no clash.
 */
const UNDER_OPEN_SHEET = "max-lg:[body:has(.bg-scrim)_&]:z-(--rf-z-sticky)";

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: QueuedToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
      className={`pointer-events-none fixed inset-x-0 bottom-[calc(max(var(--rf-shell-bottom,0px),env(safe-area-inset-bottom,0px))_+_0.75rem)] z-(--rf-z-toast) flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-start lg:px-gutter ${UNDER_OPEN_SHEET}`}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: QueuedToast; onDismiss: (id: string) => void }) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toast.durationMs);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, onDismiss, toast.id]);

  return (
    <div
      ref={itemRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      // On the phone only the newest toast shows: a stack would cover the sheet or the
      // confirmation that is often open right after (the others keep their timers, hidden).
      className="pointer-events-auto flex min-h-12 w-full max-w-[420px] items-center gap-3 rounded-sm bg-ink py-1 pr-1 pl-3.5 text-[0.9375rem] leading-[1.375rem] text-on-ink shadow-popover transition-[opacity,translate] duration-(--rf-dur-2) ease-out starting:translate-y-2 starting:opacity-0 max-lg:not-last:hidden"
    >
      <CheckIcon size={18} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 py-2">{toast.message}</span>
      {toast.action && (
        <AriaButton
          onPress={() => {
            const hadFocus = itemRef.current?.contains(document.activeElement) ?? false;
            toast.action?.onAction();
            onDismiss(toast.id);
            // The button leaves with the toast: the focus would fall back to <body> (WCAG
            // 2.4.3). It goes to the page's content instead.
            if (hadFocus) document.getElementById("main")?.focus();
          }}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center px-2.5 font-semibold text-on-ink underline underline-offset-4 data-focus-visible:outline-on-ink"
        >
          {toast.action.label}
        </AriaButton>
      )}
    </div>
  );
}
