// State Matita shares across its lines (the page line, the mobile bar, the ⌘K dialog): whether the
// server said it is not configured (503), the daily quota, which line ⌘K should focus and the last
// phrases used in this browser. Module-level and tiny: the lines live in different subtrees.
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/app/auth";
import type { AssistantReply } from "@/lib/api/types";
import { nextQuotaReset } from "./model";

type Listener = () => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      notify();
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => {
      value = initial;
      notify();
    },
  };
}

// --- Availability ----------------------------------------------------------------------------

/** A 503 during this visit: Matita behaves as with `assistant_available: false` until reload. */
const offStore = createStore(false);

export function markUnavailable(): void {
  offStore.set(true);
}

/** Matita exists only if /public/config says so and the server has not answered 503 since. */
export function useMatitaAvailable(): boolean {
  const { config } = useAuth();
  const off = useSyncExternalStore(offStore.subscribe, offStore.get, offStore.get);
  return config?.assistant_available === true && !off;
}

// --- Daily quota -------------------------------------------------------------------------------

export interface QuotaState {
  usage: AssistantReply["usage"] | null;
  /** After a 429: the server's sentence and when the line works again (midnight in Rome). */
  blocked: { detail: string; until: number } | null;
}

// The quota is per tutor: what was seen for one account says nothing about the next one signed in
// in the same tab (demo, then a real account).
interface StoredQuota extends QuotaState {
  userId: string | null;
}

const NO_QUOTA: QuotaState = { usage: null, blocked: null };
const quotaStore = createStore<StoredQuota>({ ...NO_QUOTA, userId: null });

export function recordUsage(usage: AssistantReply["usage"], userId: string | null): void {
  quotaStore.set({ usage, blocked: null, userId });
}

export function recordRateLimit(
  detail: string,
  userId: string | null,
  now: Date = new Date(),
): void {
  const previous = quotaStore.get();
  quotaStore.set({
    usage: previous.userId === userId ? previous.usage : null,
    blocked: { detail, until: nextQuotaReset(now) },
    userId,
  });
}

function endBlock(until: number): void {
  const state = quotaStore.get();
  if (state.blocked?.until === until) quotaStore.set({ ...NO_QUOTA, userId: state.userId });
}

/** The tutor's quota as last seen; a block ends by itself at midnight (Europe/Rome). */
export function useMatitaQuota(userId: string | null): QuotaState {
  const stored = useSyncExternalStore(quotaStore.subscribe, quotaStore.get, quotaStore.get);
  const state = stored.userId === userId ? stored : NO_QUOTA;
  const until = state.blocked?.until ?? null;
  useEffect(() => {
    if (until === null) return;
    // Midnight is always less than a day away (setTimeout overflows only after ~24.8 days).
    const timer = window.setTimeout(() => endBlock(until), Math.max(0, until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [until]);
  return state;
}

// --- Lines that ⌘K can focus -----------------------------------------------------------------

export interface RegisteredLine {
  /** `page`: the line of «Oggi» or of the ledger; `bar`: the mobile bar above the tab bar. */
  kind: "page" | "bar";
  element: HTMLElement;
}

const lines: RegisteredLine[] = [];

export function registerLine(line: RegisteredLine): () => void {
  lines.push(line);
  return () => {
    const index = lines.indexOf(line);
    if (index !== -1) lines.splice(index, 1);
  };
}

function isShown(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[hidden], [inert]")) return false;
  // checkVisibility() sees `display: none` up the tree (e.g. the mobile bar on desktop).
  return "checkVisibility" in element ? element.checkVisibility() : true;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * ⌘K / Ctrl K (03 §9.2): focuses the line of the page (the ledger's, Oggi's), or the mobile bar,
 * scrolling smoothly to it (instantly with reduced motion). False when there is none on screen:
 * the caller opens the dialog.
 */
export function focusPageLine(): boolean {
  const shown = lines.filter((line) => isShown(line.element));
  const target =
    shown.filter((line) => line.kind === "page").at(-1) ??
    shown.filter((line) => line.kind === "bar").at(-1);
  if (!target) return false;
  target.element.focus({ preventScroll: true });
  target.element.scrollIntoView?.({
    block: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
  return true;
}

// --- Last phrases (⌘K dialog: «salvate solo in questo browser») ------------------------------

const RECENT_MAX = 3;

function recentKey(userId: string | null | undefined): string {
  return `rf.matita.recenti.${userId ?? "anonimo"}`;
}

export function readRecentPhrases(userId: string | null | undefined): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberPhrase(userId: string | null | undefined, phrase: string): void {
  const text = phrase.trim();
  if (!text) return;
  const next = [text, ...readRecentPhrases(userId).filter((item) => item !== text)].slice(
    0,
    RECENT_MAX,
  );
  try {
    window.localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch {
    // Private mode or full storage: the dialog simply shows no recent phrases.
  }
}

/** Tests only: back to a fresh page load. */
export function resetMatitaStores(): void {
  offStore.reset();
  quotaStore.reset();
  lines.length = 0;
}
