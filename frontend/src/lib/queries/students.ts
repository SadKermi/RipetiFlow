import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { RateCreate, RateInput, Student, StudentCreate, StudentPatch } from "../api/types";
import { invalidateAfter } from "./invalidation";
import { type LedgerParams, type StudentListParams, queryKeys } from "./keys";

// --- Students list and detail ---------------------------------------------------------------

export const studentsQuery = (params: StudentListParams = {}) =>
  queryOptions({
    queryKey: queryKeys.students.list(params),
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/students", { params: { query: params }, signal })).items,
  });

/** Students index (`q` search, archived filter, sort). Keeps the previous list while typing. */
export function useStudents(params: StudentListParams = {}) {
  return useQuery({ ...studentsQuery(params), placeholderData: keepPreviousData });
}

export const studentQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.student.detail(id),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/students/{student_id}", { params: { path: { student_id: id } }, signal }),
      ),
  });

export function useStudent(id: string) {
  return useQuery(studentQuery(id));
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: StudentCreate): Promise<Student> =>
      unwrap(await api.POST("/students", { body })),
    onSuccess: (student) => {
      queryClient.setQueryData(queryKeys.student.detail(student.id), student);
      return invalidateAfter(queryClient, {
        type: "student",
        change: "created",
        studentId: student.id,
      });
    },
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StudentPatch }): Promise<Student> =>
      unwrap(
        await api.PATCH("/students/{student_id}", {
          params: { path: { student_id: id } },
          body: patch,
        }),
      ),
    onSuccess: (student) => {
      queryClient.setQueryData(queryKeys.student.detail(student.id), student);
      return invalidateAfter(queryClient, {
        type: "student",
        change: "updated",
        studentId: student.id,
      });
    },
  });
}

/** Archive (`archived: true`) or restore a student (D-19). */
export function useSetStudentArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }): Promise<Student> => {
      const params = { params: { path: { student_id: id } } };
      return unwrap(
        archived
          ? await api.POST("/students/{student_id}/archive", params)
          : await api.POST("/students/{student_id}/unarchive", params),
      );
    },
    onSuccess: (student) => {
      queryClient.setQueryData(queryKeys.student.detail(student.id), student);
      return invalidateAfter(queryClient, {
        type: "student",
        change: "archived",
        studentId: student.id,
      });
    },
  });
}

/** Physical delete: 409 `conflict` when the student has lessons or payments (archive instead). */
export function useDeleteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await api.DELETE("/students/{student_id}", { params: { path: { student_id: id } } }));
    },
    onSuccess: (_data, id) =>
      invalidateAfter(queryClient, { type: "student", change: "deleted", studentId: id }),
  });
}

// --- Rates (D-16) -----------------------------------------------------------------------------

export const ratesQuery = (studentId: string) =>
  queryOptions({
    queryKey: queryKeys.student.rates(studentId),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/students/{student_id}/rates", {
          params: { path: { student_id: studentId } },
          signal,
        }),
      ).items,
  });

export function useRates(studentId: string) {
  return useQuery(ratesQuery(studentId));
}

/**
 * Preview of a new rate (lessons affected, amount delta). A POST without side effects, cached
 * like a query; pass `null` while the form is incomplete.
 */
export function useRatePreview(studentId: string, input: RateInput | null) {
  return useQuery({
    queryKey: queryKeys.student.ratePreview(
      studentId,
      input ?? { hourly_rate_cents: 0, effective_from: "" },
    ),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.POST("/students/{student_id}/rates/preview", {
          params: { path: { student_id: studentId } },
          body: input!,
          signal,
        }),
      ),
    enabled: input !== null,
    placeholderData: keepPreviousData,
  });
}

export function useCreateRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, body }: { studentId: string; body: RateCreate }) =>
      unwrap(
        await api.POST("/students/{student_id}/rates", {
          params: { path: { student_id: studentId } },
          body,
        }),
      ),
    onSuccess: (_created, { studentId }) =>
      invalidateAfter(queryClient, { type: "rate", studentId }),
  });
}

export function useDeleteRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { studentId: string; rateId: string; repriceExisting: boolean }) => {
      unwrap(
        await api.DELETE("/students/{student_id}/rates/{rate_id}", {
          params: {
            path: { student_id: vars.studentId, rate_id: vars.rateId },
            query: { reprice_existing: vars.repriceExisting },
          },
        }),
      );
    },
    onSuccess: (_data, { studentId }) => invalidateAfter(queryClient, { type: "rate", studentId }),
  });
}

// --- Ledger and activity (D-18) --------------------------------------------------------------

export const ledgerQuery = (studentId: string, params: LedgerParams = {}) =>
  queryOptions({
    queryKey: queryKeys.student.ledger(studentId, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/students/{student_id}/ledger", {
          params: { path: { student_id: studentId }, query: params },
          signal,
        }),
      ),
  });

/** Ledger rows + balance (default: everything, newest first). */
export function useLedger(studentId: string, params: LedgerParams = {}) {
  return useQuery(ledgerQuery(studentId, params));
}

export const activityQuery = (studentId: string, limit = 50) =>
  infiniteQueryOptions({
    queryKey: queryKeys.student.activity(studentId, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET("/students/{student_id}/activity", {
          params: {
            path: { student_id: studentId },
            query: { limit, ...(pageParam ? { before: pageParam } : {}) },
          },
          signal,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });

/** Change history, paginated with the opaque `next_cursor` ("Carica altre modifiche"). */
export function useActivity(studentId: string, limit = 50) {
  return useInfiniteQuery(activityQuery(studentId, limit));
}
