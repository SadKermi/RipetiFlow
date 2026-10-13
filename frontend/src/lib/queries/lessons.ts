import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, sourceHeaders, unwrap, type WriteSource } from "../api/client";
import type {
  Lesson,
  LessonCreate,
  LessonDuplicate,
  LessonPatch,
  Payment,
  PaymentCreate,
  PaymentPatch,
} from "../api/types";
import { invalidateAfter } from "./invalidation";
import { type LessonRangeParams, queryKeys } from "./keys";

// --- Lessons ----------------------------------------------------------------------------------

/** Lessons in a date range (max 62 days, docs/05): only for Agenda and Dashboard (D-20). */
export const lessonsRangeQuery = (params: LessonRangeParams) =>
  queryOptions({
    queryKey: queryKeys.lessons.range(params),
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/lessons", { params: { query: params }, signal })).items,
  });

export function useLessons(params: LessonRangeParams) {
  return useQuery({ ...lessonsRangeQuery(params), placeholderData: keepPreviousData });
}

export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.lessons.detail(id),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/lessons/{lesson_id}", { params: { path: { lesson_id: id } }, signal }),
      ),
  });

export function useLesson(id: string) {
  return useQuery(lessonQuery(id));
}

/** `source: "assistant"` when confirming a Matita draft. */
export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      source,
    }: {
      body: LessonCreate;
      source?: WriteSource;
    }): Promise<Lesson> =>
      unwrap(await api.POST("/lessons", { body, headers: sourceHeaders(source) })),
    onSuccess: (lesson) =>
      invalidateAfter(queryClient, { type: "lesson", studentIds: [lesson.student.id] }),
  });
}

/**
 * `previousStudentId`: the lesson's student before the edit, so that moving a lesson to another
 * student refreshes both ledgers.
 */
export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      patch: LessonPatch;
      previousStudentId?: string;
      source?: WriteSource;
    }): Promise<Lesson> =>
      unwrap(
        await api.PATCH("/lessons/{lesson_id}", {
          params: { path: { lesson_id: vars.id } },
          body: vars.patch,
          headers: sourceHeaders(vars.source),
        }),
      ),
    onSuccess: (lesson, vars) => {
      queryClient.setQueryData(queryKeys.lessons.detail(lesson.id), lesson);
      return invalidateAfter(queryClient, {
        type: "lesson",
        studentIds: [lesson.student.id, vars.previousStudentId ?? ""],
      });
    },
  });
}

export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      unwrap(await api.DELETE("/lessons/{lesson_id}", { params: { path: { lesson_id: id } } }));
    },
    onSuccess: (_data, { id, studentId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.lessons.detail(id) });
      return invalidateAfter(queryClient, { type: "lesson", studentIds: [studentId] });
    },
  });
}

/** Group lessons / weekly repetition: copy a lesson to another student and/or date. */
export function useDuplicateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body?: LessonDuplicate }): Promise<Lesson> =>
      unwrap(
        await api.POST("/lessons/{lesson_id}/duplicate", {
          params: { path: { lesson_id: id } },
          body: body ?? {},
        }),
      ),
    onSuccess: (lesson) =>
      invalidateAfter(queryClient, { type: "lesson", studentIds: [lesson.student.id] }),
  });
}

// --- Payments (no global list: they live in the student's ledger, D-20) ----------------------

export const paymentQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.payments.detail(id),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/payments/{payment_id}", { params: { path: { payment_id: id } }, signal }),
      ),
  });

export function usePayment(id: string) {
  return useQuery(paymentQuery(id));
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      source,
    }: {
      body: PaymentCreate;
      source?: WriteSource;
    }): Promise<Payment> =>
      unwrap(await api.POST("/payments", { body, headers: sourceHeaders(source) })),
    onSuccess: (payment) =>
      invalidateAfter(queryClient, { type: "payment", studentIds: [payment.student.id] }),
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      patch: PaymentPatch;
      previousStudentId?: string;
      source?: WriteSource;
    }): Promise<Payment> =>
      unwrap(
        await api.PATCH("/payments/{payment_id}", {
          params: { path: { payment_id: vars.id } },
          body: vars.patch,
          headers: sourceHeaders(vars.source),
        }),
      ),
    onSuccess: (payment, vars) => {
      queryClient.setQueryData(queryKeys.payments.detail(payment.id), payment);
      return invalidateAfter(queryClient, {
        type: "payment",
        studentIds: [payment.student.id, vars.previousStudentId ?? ""],
      });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      unwrap(await api.DELETE("/payments/{payment_id}", { params: { path: { payment_id: id } } }));
    },
    onSuccess: (_data, { id, studentId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.payments.detail(id) });
      return invalidateAfter(queryClient, { type: "payment", studentIds: [studentId] });
    },
  });
}
