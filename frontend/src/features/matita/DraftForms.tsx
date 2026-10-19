// The manual forms opened by a Matita line outside the ledger: «+», «Modifica» on a draft, the
// 422 of «Ripassa a penna» (prefilled, saved with X-RipetiFlow-Source: assistant).
import { LessonFormDialog, PaymentFormDialog } from "@/features/forms";
import type { DraftForms as DraftFormsState } from "./hooks";

export function DraftForms({ forms }: { forms: DraftFormsState }) {
  const { form, close } = forms;
  return (
    <>
      <LessonFormDialog
        isOpen={form?.kind === "lesson"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        initial={form?.kind === "lesson" ? form.initial : undefined}
        source={form?.options?.source}
        initialError={form?.options?.error}
        onSaved={() => form?.options?.onSaved?.()}
      />
      <PaymentFormDialog
        isOpen={form?.kind === "payment"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        initial={form?.kind === "payment" ? form.initial : undefined}
        source={form?.options?.source}
        initialError={form?.options?.error}
        onSaved={() => form?.options?.onSaved?.()}
      />
    </>
  );
}
