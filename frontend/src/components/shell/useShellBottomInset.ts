import { useLayoutEffect, useRef } from "react";

/**
 * Measures the fixed bottom chrome (Matita bar + tab bar + safe area) and publishes its height as
 * `--rf-shell-bottom` on <html>: the page leaves that much room at the end and toasts sit above
 * it (02 §9.11). 0 on desktop, where the chrome is hidden.
 */
export function useShellBottomInset<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--rf-shell-bottom", `${String(element.offsetHeight)}px`);
    };
    update();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--rf-shell-bottom");
    };
  }, []);
  return ref;
}
