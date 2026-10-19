// «Annulla» in the toasts (02 §9.11): on a creation it deletes what was just created, on an edit
// it PATCHes the previous values back, on a deletion it recreates the row (a new row: the activity
// log records both operations, 03 §7.5). The toast outlives the form that showed it, so these are
// plain functions on the query client instead of hooks bound to a component.
import type { QueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type {
  Lesson,
  LessonCreate,
  LessonPatch,
  Payment,
  PaymentCreate,
  PaymentPatch,
  Student,
  StudentPatch,
} from "@/lib/api/types";
import { invalidateAfter } from "@/lib/queries";

export async function deleteLessonNow(qc: QueryClient, lesson: Lesson): Promise<void> {
  unwrap(await api.DELETE("/lessons/{lesson_id}", { params: { path: { lesson_id: lesson.id } } }));
  await invalidateAfter(qc, { type: "lesson", studentIds: [lesson.student.id] });
}

export async function createLessonNow(qc: QueryClient, body: LessonCreate): Promise<Lesson> {
  const lesson = unwrap(await api.POST("/lessons", { body }));
  await invalidateAfter(qc, { type: "lesson", studentIds: [lesson.student.id] });
  return lesson;
}

export async function patchLessonNow(
  qc: QueryClient,
  id: string,
  patch: LessonPatch,
  studentIds: readonly string[],
): Promise<Lesson> {
  const lesson = unwrap(
    await api.PATCH("/lessons/{lesson_id}", { params: { path: { lesson_id: id } }, body: patch }),
  );
  await invalidateAfter(qc, { type: "lesson", studentIds: [...studentIds, lesson.student.id] });
  return lesson;
}

export async function deletePaymentNow(
  qc: QueryClient,
  payment: { id: string; studentId: string },
): Promise<void> {
  unwrap(
    await api.DELETE("/payments/{payment_id}", { params: { path: { payment_id: payment.id } } }),
  );
  await invalidateAfter(qc, { type: "payment", studentIds: [payment.studentId] });
}

export async function createPaymentNow(qc: QueryClient, body: PaymentCreate): Promise<Payment> {
  const payment = unwrap(await api.POST("/payments", { body }));
  await invalidateAfter(qc, { type: "payment", studentIds: [payment.student.id] });
  return payment;
}

export async function patchPaymentNow(
  qc: QueryClient,
  id: string,
  patch: PaymentPatch,
  studentIds: readonly string[],
): Promise<Payment> {
  const payment = unwrap(
    await api.PATCH("/payments/{payment_id}", {
      params: { path: { payment_id: id } },
      body: patch,
    }),
  );
  await invalidateAfter(qc, { type: "payment", studentIds: [...studentIds, payment.student.id] });
  return payment;
}

export async function patchStudentNow(
  qc: QueryClient,
  id: string,
  patch: StudentPatch,
): Promise<Student> {
  const student = unwrap(
    await api.PATCH("/students/{student_id}", {
      params: { path: { student_id: id } },
      body: patch,
    }),
  );
  await invalidateAfter(qc, { type: "student", change: "updated", studentId: id });
  return student;
}

export async function setStudentArchivedNow(
  qc: QueryClient,
  id: string,
  archived: boolean,
): Promise<Student> {
  const params = { params: { path: { student_id: id } } };
  const student = unwrap(
    archived
      ? await api.POST("/students/{student_id}/archive", params)
      : await api.POST("/students/{student_id}/unarchive", params),
  );
  await invalidateAfter(qc, { type: "student", change: "archived", studentId: id });
  return student;
}
