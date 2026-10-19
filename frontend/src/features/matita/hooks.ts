// Hooks shared by Matita's lines: the manual forms a draft opens, the focus that follows the
// proposals, the student's name in the «Oggi» example.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";
import type { MatitaFormOptions } from "@/components/shell/matita-slot";
import type { StudentSummary } from "@/lib/api/types";
import { dashboardQuery, queryKeys, studentsQuery } from "@/lib/queries";
import type { LessonInitial, PaymentInitial } from "@/features/forms";
import { firstWord } from "./model";
import type { MatitaSession } from "./session";

export type DraftFormRequest =
  | { kind: "lesson"; initial: LessonInitial; options?: MatitaFormOptions }
  | { kind: "payment"; initial: PaymentInitial; options?: MatitaFormOptions };

export interface DraftForms {
  form: DraftFormRequest | null;
  close: () => void;
  openLessonForm: (initial: LessonInitial, options?: MatitaFormOptions) => void;
  openPaymentForm: (initial: PaymentInitial, options?: MatitaFormOptions) => void;
}

/** The lesson / payment form of a line outside the ledger («+», «Modifica», a 422). */
export function useDraftForms(): DraftForms {
  const [form, setForm] = useState<DraftFormRequest | null>(null);
  return {
    form,
    close: () => setForm(null),
    openLessonForm: (initial, options) => setForm({ kind: "lesson", initial, options }),
    openPaymentForm: (initial, options) => setForm({ kind: "payment", initial, options }),
  };
}

/**
 * The first proposal in `container`: a card or a ledger row (focusable groups). Never the
 * «Ripassa a penna» button itself: a Space or Enter typed on after the reply would write.
 */
const PROPOSAL = "[data-matita-proposal]";

/**
 * Focus with the proposals (02 §9.13, «la proposta a fuoco»): when a reply brings drafts the focus
 * goes to the first one (Cmd/Ctrl + Enter confirms it, Esc discards it); when the focused draft
 * goes away (confirmed, discarded) it moves to the next one, or back to the line.
 */
export function useProposalFocus(
  session: MatitaSession,
  getContainer: () => HTMLElement | null,
  inputRef: RefObject<HTMLTextAreaElement | null>,
): void {
  const focusFirst = useEffectEvent((fallback: boolean) => {
    const target = getContainer()?.querySelector<HTMLElement>(PROPOSAL);
    (target ?? (fallback ? inputRef.current : null))?.focus();
  });

  useEffect(() => {
    if (session.proposedNonce > 0) focusFirst(false);
  }, [session.proposedNonce]);

  const count = session.drafts.length;
  const previous = useRef(count);
  useEffect(() => {
    const shrank = count < previous.current;
    previous.current = count;
    const active = document.activeElement;
    if (shrank && (!active || active === document.body)) focusFirst(true);
  }, [count]);
}

/**
 * The first name for «Scrivi una riga… «ieri 15–16:30 matematica con Luca»»: a student already in
 * the cache (the students list, or Oggi's data). Null without students: no example (03 §3).
 * Reads the cache only: the line never adds a request of its own.
 */
export function useExampleName(): string | null {
  const queryClient = useQueryClient();
  const students = useQuery({
    ...studentsQuery({ archived: false, sort: "name" }),
    enabled: false,
  }).data;
  const dashboard = useQuery({ ...dashboardQuery(7), enabled: false }).data;
  const fromList = students?.[0]?.first_name;
  if (fromList) return fromList;
  const fromAccounts = dashboard?.owing[0]?.first_name ?? dashboard?.in_credit[0]?.first_name;
  if (fromAccounts) return fromAccounts;
  const fromLessons = dashboard?.upcoming[0]?.student.display_name;
  if (fromLessons) return firstWord(fromLessons);
  // Any other students list already loaded (Studenti sorted by balance, a search…).
  for (const [, items] of queryClient.getQueriesData<StudentSummary[]>({
    queryKey: queryKeys.students.all(),
  })) {
    const name = items?.find((item) => !item.archived)?.first_name;
    if (name) return name;
  }
  return null;
}
