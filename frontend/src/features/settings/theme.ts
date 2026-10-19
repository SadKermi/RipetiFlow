// «Aspetto» (docs/design/02-design-system.md §4 «Modalità scura»): Sistema / Chiaro / Scuro.
// The choice lives in localStorage and is applied as <html data-theme>; index.html applies it again
// with an inline script before the first paint, so a reload never flashes the other theme.

export type ThemeChoice = "system" | "light" | "dark";

/** Same key as the inline script in index.html. */
export const THEME_STORAGE_KEY = "ripetiflow.theme";

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

/** The saved choice; «Sistema» when nothing (or nothing readable) is stored. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system"; // storage blocked by the browser
  }
}

/** Applies a choice to <html> and remembers it (best effort when storage is blocked). */
export function applyThemeChoice(
  choice: ThemeChoice,
  root: HTMLElement = document.documentElement,
) {
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // the choice still holds until the page is reloaded
  }
}
