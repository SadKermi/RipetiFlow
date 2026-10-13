// Query keys, hierarchical so that invalidating a prefix refreshes everything below it:
//   ["student", id]            → that student's detail, ledger, activity, rates, rate preview
//   ["students"]               → every students list (any filter/sort)
//   ["lessons"]                → every lessons range and single lesson
import type { ApiPaths } from "../api/client";

type QueryOf<P extends keyof ApiPaths, M extends keyof ApiPaths[P]> = ApiPaths[P][M] extends {
  parameters: { query?: infer Q };
}
  ? NonNullable<Q>
  : never;

export type StudentListParams = QueryOf<"/students", "get">;
export type LedgerParams = QueryOf<"/students/{student_id}/ledger", "get">;
export type LessonRangeParams = QueryOf<"/lessons", "get">;

export const queryKeys = {
  profile: () => ["profile"] as const,

  subjects: {
    all: () => ["subjects"] as const,
    list: (includeArchived: boolean) => ["subjects", { includeArchived }] as const,
  },

  students: {
    all: () => ["students"] as const,
    list: (params: StudentListParams) => ["students", params] as const,
  },

  student: {
    all: () => ["student"] as const,
    scope: (id: string) => ["student", id] as const,
    detail: (id: string) => ["student", id, "detail"] as const,
    rates: (id: string) => ["student", id, "rates"] as const,
    ratePreview: (id: string, input: { hourly_rate_cents: number; effective_from: string }) =>
      ["student", id, "rate-preview", input] as const,
    ledger: (id: string, params: LedgerParams) => ["student", id, "ledger", params] as const,
    activity: (id: string, limit: number) => ["student", id, "activity", { limit }] as const,
  },

  lessons: {
    all: () => ["lessons"] as const,
    range: (params: LessonRangeParams) => ["lessons", "range", params] as const,
    detail: (id: string) => ["lessons", "detail", id] as const,
  },

  payments: {
    all: () => ["payments"] as const,
    detail: (id: string) => ["payments", "detail", id] as const,
  },

  dashboard: {
    all: () => ["dashboard"] as const,
    detail: (days: number) => ["dashboard", { days }] as const,
  },

  calendar: {
    all: () => ["calendar"] as const,
    status: () => ["calendar", "status"] as const,
  },
} as const;
