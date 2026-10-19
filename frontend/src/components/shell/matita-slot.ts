// Where Matita mounts in the app shell (docs/design/02-design-system.md §9.13 c, §9.14). The shell
// renders whatever is provided here and nothing otherwise; the Matita feature fills it:
//
//   // src/app/router.tsx (or AppShell.tsx)
//   <MatitaSlotContext value={{ MobileBar: MatitaMobileBar, TopBarButton: MatitaTopButton }}>
//     <AppShell />
//   </MatitaSlotContext>
//
// Both components are rendered inside the authenticated shell, so they can use useAuth(), the
// query hooks and useToast(). Keep them null-rendering when /public/config says
// `assistant_available: false` (the mobile bar then shows only the square «+», 02 §9.13).
import { type ComponentType, createContext, useContext } from "react";
import type { LessonCreate, PaymentCreate } from "@/lib/api/types";

/** Options when Matita opens a manual form («Modifica» on a draft, a 422 after «Ripassa a penna»). */
export interface MatitaFormOptions {
  /** `assistant`: the save confirms a draft (X-RipetiFlow-Source: assistant). */
  source?: "app" | "assistant";
  /** The failed write's error, shown on the fields when the form opens. */
  error?: unknown;
  /** Called after the form saved (e.g. to drop the draft). */
  onSaved?: () => void;
}

/**
 * Props of the Matita line inside a student's ledger (02 §9.13 a): the component renders one or
 * more ledger rows (LedgerSlotRow for the line, LedgerDraftRow for each draft) — it is placed as
 * the first rows of the <Ledger> on /studenti/:id (src/features/ledger).
 */
export interface LedgerLineProps {
  student: { id: string; first_name: string; display_name: string };
  /** Balance now (negative = owes): drafts show «sarà deve 100,00 €». */
  balanceCents: number;
  /** Today in the tutor's timezone. */
  today: string;
  /** «Promemoria» pressed: send this request at once (a new `nonce` every press). */
  prompt: { text: string; nonce: number } | null;
  /** The «+» of the line and «Modifica» on a draft: the manual forms, prefilled. */
  openLessonForm: (initial?: Partial<LessonCreate>, options?: MatitaFormOptions) => void;
  openPaymentForm: (initial?: Partial<PaymentCreate>, options?: MatitaFormOptions) => void;
}

export interface MatitaSlots {
  /**
   * Below 1024 px: the fixed bar above the tab bar (Matita line + square «+» for the manual form,
   * 56 px). Not rendered on /studenti/:id, where the line is the first row of the ledger.
   */
  MobileBar?: ComponentType;
  /** From 1024 px: «Matita ⌘K» line button on the right of the top bar, before the avatar. */
  TopBarButton?: ComponentType;
  /** First rows of the student's ledger (all sizes): the line with the student as context. */
  LedgerLine?: ComponentType<LedgerLineProps>;
  /** From 1024 px, under the title of «Oggi»: «Scrivi una riga… «ieri 15–16:30 …»» + «+». */
  TodayLine?: ComponentType;
}

export const MatitaSlotContext = createContext<MatitaSlots>({});

export function useMatitaSlots(): MatitaSlots {
  return useContext(MatitaSlotContext);
}
