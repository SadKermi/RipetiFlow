// Small helpers shared by the draft cards and the ledger's draft rows.
import type { KeyboardEvent } from "react";
import { formatShortDate } from "@/components/utils";
import { daysBetween } from "@/lib/format";
import type { WritableDraft } from "./model";

/** «lezione di Sara Conti, mar 6 ott 13:00–14:00» (accessible names of a proposal and its buttons). */
export function draftSummary(draft: WritableDraft, today: string): string {
  const when = formatShortDate(draft.type === "lesson" ? draft.date : draft.paid_on, today);
  return draft.type === "lesson"
    ? `lezione di ${draft.student.display_name}, ${when} ${draft.start_time}–${draft.end_time}`
    : `pagamento di ${draft.student.display_name}, ${when}`;
}

/** «oggi» / «ieri» / «domani» next to the day of a draft, otherwise null. */
export function relativeDay(date: string, today: string): string | null {
  switch (daysBetween(today, date)) {
    case 0:
      return "oggi";
    case -1:
      return "ieri";
    case 1:
      return "domani";
    default:
      return null;
  }
}

function isTextField(target: EventTarget): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
}

/**
 * Keyboard of a focused proposal (02 §9.13): Cmd/Ctrl + Enter goes over it in ink, Esc discards
 * it. Meant for the capture phase, so a focused «Modifica» does not get the Enter as well.
 */
export function proposalKeys(onConfirm: (() => void) | null, onDiscard: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onConfirm) {
      event.preventDefault();
      event.stopPropagation();
      onConfirm();
    } else if (event.key === "Escape" && !isTextField(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      onDiscard();
    }
  };
}
