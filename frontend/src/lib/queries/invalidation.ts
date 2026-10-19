// What to refresh after each kind of write. Kept as a pure map (unit-tested) so the rules are in
// one place: the money shown anywhere (balances, ledger, dashboard totals) must never be stale
// after a write.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export type WriteEvent =
  /** Lesson created/updated/deleted/duplicated. `studentIds`: every student touched (old + new). */
  | { type: "lesson"; studentIds: readonly string[] }
  /** Payment created/updated/deleted. */
  | { type: "payment"; studentIds: readonly string[] }
  | { type: "student"; change: "created"; studentId: string }
  | { type: "student"; change: "updated" | "archived" | "deleted"; studentId: string }
  /** Rate added/removed (possibly repricing lessons). */
  | { type: "rate"; studentId: string }
  | { type: "subject" }
  /**
   * Profile saved. `timezoneChanged`: the timezone decides when a lesson is over and enters the
   * balance (D-11, D-17), so balances, ledgers and lessons («svolta» / programmata) change too.
   */
  | { type: "profile"; timezoneChanged?: boolean }
  | { type: "calendar" }
  /** Demo data wiped and recreated: everything is stale. */
  | { type: "everything" };

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id !== ""))];
}

export function keysToInvalidate(event: WriteEvent): QueryKey[] {
  switch (event.type) {
    case "lesson":
      return [
        ...unique(event.studentIds).map((id) => queryKeys.student.scope(id)),
        queryKeys.students.all(), // balances, next lesson
        queryKeys.dashboard.all(),
        queryKeys.lessons.all(), // agenda ranges and the lesson itself
        queryKeys.calendar.all(), // pending sync count
      ];
    case "payment":
      return [
        ...unique(event.studentIds).map((id) => queryKeys.student.scope(id)),
        queryKeys.students.all(),
        queryKeys.dashboard.all(),
        queryKeys.payments.all(),
      ];
    case "student":
      if (event.change === "created") {
        return [queryKeys.students.all(), queryKeys.dashboard.all()];
      }
      // Names and archive state are embedded in lessons, payments and dashboard lists.
      return [
        queryKeys.student.scope(event.studentId),
        queryKeys.students.all(),
        queryKeys.dashboard.all(),
        queryKeys.lessons.all(),
        queryKeys.payments.all(),
      ];
    case "rate":
      // A rate with reprice_existing changes lesson amounts, hence balances everywhere.
      return [
        queryKeys.student.scope(event.studentId),
        queryKeys.students.all(),
        queryKeys.dashboard.all(),
        queryKeys.lessons.all(),
      ];
    case "subject":
      // Subject names appear in lessons, ledgers, dashboard and student defaults.
      return [
        queryKeys.subjects.all(),
        queryKeys.lessons.all(),
        queryKeys.student.all(),
        queryKeys.dashboard.all(),
      ];
    case "profile":
      // The timezone decides "today" for the dashboard, and which lessons are in the balance.
      return event.timezoneChanged
        ? [
            queryKeys.profile(),
            queryKeys.dashboard.all(),
            queryKeys.students.all(),
            queryKeys.student.all(),
            queryKeys.lessons.all(),
          ]
        : [queryKeys.profile(), queryKeys.dashboard.all()];
    case "calendar":
      // Sync state is shown on lessons (agenda, ledger) and on the dashboard.
      return [
        queryKeys.calendar.all(),
        queryKeys.dashboard.all(),
        queryKeys.lessons.all(),
        queryKeys.student.all(),
      ];
    case "everything":
      return [[]];
  }
}

/** Applies the map. A deleted student's cached queries are dropped instead of refetched (404). */
export async function invalidateAfter(queryClient: QueryClient, event: WriteEvent): Promise<void> {
  if (event.type === "student" && event.change === "deleted") {
    queryClient.removeQueries({ queryKey: queryKeys.student.scope(event.studentId) });
  }
  await Promise.all(
    keysToInvalidate(event).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
