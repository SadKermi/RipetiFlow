// Focus management when the control that was used disappears (a deleted row, a closed dialog
// whose trigger is gone): the focus must not fall back to <body> (WCAG 2.4.3).

/** Longer than a dialog's exit (--rf-dur-3, 240 ms): its own focus restoration runs first. */
const AFTER_DIALOG_MS = 320;
/** While the focus is still inside a dialog that is closing, look again this often… */
const STEP_MS = 80;
/** …but not forever. */
const GIVE_UP_MS = 2000;

/**
 * Focuses what `target` returns once the dialog has gone, but only if the focus was lost on the
 * way (nothing focused, <body>, or an element no longer in the page): a focus the user moved
 * meanwhile is left alone. Two dialogs closing one after the other (a confirmation over a sheet)
 * keep the focus in the closing sheet for a while: then it waits for the sheet to be gone.
 */
export function focusWhenLost(target: () => HTMLElement | null | undefined): void {
  let waited = AFTER_DIALOG_MS;
  const check = () => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      target()?.focus();
      return;
    }
    if (active.closest("[data-exiting]") && waited < GIVE_UP_MS) {
      waited += STEP_MS;
      window.setTimeout(check, STEP_MS);
    }
  };
  window.setTimeout(check, AFTER_DIALOG_MS);
}
