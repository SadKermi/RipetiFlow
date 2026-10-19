import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

const APP_NAME = "RipetiFlow";

/** «Studenti · RipetiFlow»: every page names itself in the tab and for screen readers (WCAG 2.4.2). */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}

/**
 * After a client-side move to another page, focus goes to the page's <main> (tabIndex -1), so
 * keyboard and screen-reader users start from the new content instead of <body> or a link that no
 * longer exists (WCAG 2.4.3). Not on the first render, not when only the query or hash changes
 * (?riga=, #calendar), and not while focus is inside a dialog that is still open.
 */
export function useFocusMainOnNavigation(targetId = "main") {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[role="dialog"], [role="alertdialog"]')) {
      return;
    }
    document.getElementById(targetId)?.focus({ preventScroll: true });
  }, [pathname, targetId]);
}
