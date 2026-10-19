// Destructive confirmations (docs/design/03-schermate.md §7.5, 02 §9.12): a question as title, one
// sentence with the real numbers, [Annulla] and the verb. The server's error stays in the dialog.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { formatShortDate } from "@/components/utils";
import { isApiProblem } from "@/lib/api/problem";
import type { Lesson, Student } from "@/lib/api/types";
import { formatEuro } from "@/lib/format";
import {
  lessonQuery,
  studentQuery,
  useDeleteLesson,
  useDeletePayment,
  useDeleteStudent,
} from "@/lib/queries";
import { useTutorClock } from "./clock";
import {
  type LessonToDelete,
  type PaymentToDelete,
  archiveEffect,
  lessonDeleteEffect,
  paymentDeleteEffect,
} from "./effects";
import { lessonRecreateBody } from "./lesson-model";
import { dayMonth } from "./money-words";
import { createLessonNow, createPaymentNow } from "./undo";
import { useUndoToast } from "./useUndoToast";

/** Keeps the last non-null value, so the dialog's text does not vanish while it closes. */
function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}

export function DeleteLessonDialog({
  lesson,
  onOpenChange,
  onDeleted,
}: {
  /** null = closed. */
  lesson: LessonToDelete | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { today } = useTutorClock();
  const queryClient = useQueryClient();
  const remove = useDeleteLesson();
  const showToast = useUndoToast();
  const shown = useLast(lesson);
  const student = useQuery({
    ...studentQuery(shown?.studentId ?? ""),
    enabled: lesson !== null,
  }).data;

  async function confirm() {
    if (!lesson) return;
    // Read the whole lesson first (private notes included) so «Annulla» can recreate it as it was.
    const full: Lesson = await queryClient.fetchQuery(lessonQuery(lesson.id));
    await remove.mutateAsync({ id: lesson.id, studentId: lesson.studentId });
    onDeleted?.();
    showToast("Lezione eliminata", (qc) => createLessonNow(qc, lessonRecreateBody(full)));
  }

  return (
    <ConfirmDialog
      isOpen={lesson !== null}
      onOpenChange={onOpenChange}
      title={shown ? `Eliminare la lezione di ${formatShortDate(shown.date, today)}?` : ""}
      effect={shown ? lessonDeleteEffect(shown, student?.balance ?? null) : null}
      confirmLabel="Elimina lezione"
      onConfirm={confirm}
    />
  );
}

export function DeletePaymentDialog({
  payment,
  onOpenChange,
  onDeleted,
}: {
  /** null = closed. */
  payment: PaymentToDelete | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const remove = useDeletePayment();
  const showToast = useUndoToast();
  const shown = useLast(payment);
  const student = useQuery({
    ...studentQuery(shown?.studentId ?? ""),
    enabled: payment !== null,
  }).data;

  async function confirm() {
    if (!payment) return;
    await remove.mutateAsync({ id: payment.id, studentId: payment.studentId });
    onDeleted?.();
    showToast("Pagamento eliminato", (qc) =>
      createPaymentNow(qc, {
        student_id: payment.studentId,
        amount_cents: payment.amountCents,
        paid_on: payment.date,
        method: payment.method,
        note: payment.note,
      }),
    );
  }

  return (
    <ConfirmDialog
      isOpen={payment !== null}
      onOpenChange={onOpenChange}
      title={
        shown
          ? `Eliminare il pagamento di ${formatEuro(shown.amountCents)} del ${dayMonth(shown.date)}?`
          : ""
      }
      effect={
        shown
          ? paymentDeleteEffect(shown.amountCents, student?.balance.balance_cents ?? null)
          : null
      }
      confirmLabel="Elimina pagamento"
      onConfirm={confirm}
    />
  );
}

export function ArchiveStudentDialog({
  student,
  isOpen,
  onOpenChange,
  onConfirm,
}: {
  student: Pick<Student, "first_name" | "display_name" | "balance">;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<unknown>;
}) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Archiviare ${student.display_name}?`}
      effect={archiveEffect(student)}
      confirmLabel="Archivia"
      tone="ink"
      onConfirm={onConfirm}
    />
  );
}

/**
 * «Eliminare Sara Conti?»: only possible without lessons or payments; the server answers 409
 * otherwise and the dialog offers [Archivia] next to its text (03 §5, §7.5).
 */
export function DeleteStudentDialog({
  student,
  isOpen,
  onOpenChange,
  onDeleted,
  onArchive,
}: {
  student: Pick<Student, "id" | "display_name">;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
  /** [Archivia] after a 409. */
  onArchive: () => void;
}) {
  const remove = useDeleteStudent();
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Eliminare ${student.display_name}?`}
      effect="Si può solo se non ha lezioni né pagamenti; altrimenti archivialo."
      confirmLabel="Elimina studente"
      onConfirm={async () => {
        await remove.mutateAsync(student.id);
        onDeleted();
      }}
      recovery={(error) =>
        isApiProblem(error) && error.status === 409 ? (
          <Button
            variant="ink"
            onPress={() => {
              onOpenChange(false);
              onArchive();
            }}
          >
            Archivia
          </Button>
        ) : null
      }
    />
  );
}
