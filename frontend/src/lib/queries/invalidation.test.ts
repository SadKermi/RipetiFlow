import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { type WriteEvent, invalidateAfter, keysToInvalidate } from "./invalidation";
import { queryKeys } from "./keys";

const A = "student-a";
const B = "student-b";

/** A cache with one entry for every kind of query the app makes. */
const CACHE: Record<string, QueryKey> = {
  profile: queryKeys.profile(),
  subjects: queryKeys.subjects.list(false),
  subjectsArchived: queryKeys.subjects.list(true),
  studentsByName: queryKeys.students.list({ sort: "name" }),
  studentsSearch: queryKeys.students.list({ q: "luca" }),
  aDetail: queryKeys.student.detail(A),
  aLedger: queryKeys.student.ledger(A, {}),
  aActivity: queryKeys.student.activity(A, 50),
  aRates: queryKeys.student.rates(A),
  aRatePreview: queryKeys.student.ratePreview(A, {
    hourly_rate_cents: 2500,
    effective_from: "2026-09-01",
  }),
  bDetail: queryKeys.student.detail(B),
  bLedger: queryKeys.student.ledger(B, { order: "asc" }),
  lessonsWeek: queryKeys.lessons.range({ from: "2026-10-05", to: "2026-10-11" }),
  lessonDetail: queryKeys.lessons.detail("lesson-1"),
  paymentDetail: queryKeys.payments.detail("payment-1"),
  dashboard: queryKeys.dashboard.detail(7),
  calendar: queryKeys.calendar.status(),
};

async function invalidatedBy(event: WriteEvent): Promise<string[]> {
  const client = new QueryClient();
  for (const key of Object.values(CACHE)) client.setQueryData(key, { cached: true });
  await invalidateAfter(client, event);
  return Object.entries(CACHE)
    .filter(([, key]) => {
      const state = client.getQueryState(key);
      return state === undefined || state.isInvalidated;
    })
    .map(([name]) => name)
    .sort();
}

describe("invalidation after writes", () => {
  it("a lesson refreshes that student, every list, the agenda, the dashboard and sync counts", async () => {
    expect(await invalidatedBy({ type: "lesson", studentIds: [A] })).toEqual(
      [
        "aActivity",
        "aDetail",
        "aLedger",
        "aRatePreview",
        "aRates",
        "calendar",
        "dashboard",
        "lessonDetail",
        "lessonsWeek",
        "studentsByName",
        "studentsSearch",
      ].sort(),
    );
  });

  it("a lesson moved between students refreshes both ledgers", async () => {
    const touched = await invalidatedBy({ type: "lesson", studentIds: [A, B] });
    expect(touched).toEqual(expect.arrayContaining(["aLedger", "bLedger", "aDetail", "bDetail"]));
    expect(touched).not.toContain("profile");
    expect(touched).not.toContain("subjects");
  });

  it("a payment refreshes balances but not the agenda", async () => {
    const touched = await invalidatedBy({ type: "payment", studentIds: [B, ""] });
    expect(touched).toEqual(
      [
        "bDetail",
        "bLedger",
        "dashboard",
        "paymentDetail",
        "studentsByName",
        "studentsSearch",
      ].sort(),
    );
  });

  it("a new student refreshes the lists only", async () => {
    expect(await invalidatedBy({ type: "student", change: "created", studentId: "new" })).toEqual(
      ["dashboard", "studentsByName", "studentsSearch"].sort(),
    );
  });

  it("renaming or archiving a student refreshes where the name appears", async () => {
    const touched = await invalidatedBy({ type: "student", change: "updated", studentId: A });
    expect(touched).toEqual(
      expect.arrayContaining([
        "aDetail",
        "aLedger",
        "studentsByName",
        "dashboard",
        "lessonsWeek",
        "paymentDetail",
      ]),
    );
    expect(touched).not.toContain("bDetail");
  });

  it("a deleted student's queries are dropped", async () => {
    const touched = await invalidatedBy({ type: "student", change: "deleted", studentId: A });
    expect(touched).toEqual(
      expect.arrayContaining(["aDetail", "aLedger", "aActivity", "studentsByName"]),
    );
  });

  it("a rate change refreshes amounts everywhere for that student", async () => {
    const touched = await invalidatedBy({ type: "rate", studentId: A });
    expect(touched).toEqual(
      [
        "aActivity",
        "aDetail",
        "aLedger",
        "aRatePreview",
        "aRates",
        "dashboard",
        "lessonDetail",
        "lessonsWeek",
        "studentsByName",
        "studentsSearch",
      ].sort(),
    );
  });

  it("a subject change refreshes subjects and everything showing subject names", async () => {
    const touched = await invalidatedBy({ type: "subject" });
    expect(touched).toEqual(
      expect.arrayContaining([
        "subjects",
        "subjectsArchived",
        "lessonsWeek",
        "aLedger",
        "bLedger",
        "dashboard",
      ]),
    );
    expect(touched).not.toContain("profile");
  });

  it("the profile refreshes itself and the dashboard (timezone → today)", async () => {
    expect(await invalidatedBy({ type: "profile" })).toEqual(["dashboard", "profile"]);
  });

  it("a new timezone also refreshes balances, ledgers and lessons (what is already over)", async () => {
    const touched = await invalidatedBy({ type: "profile", timezoneChanged: true });
    expect(touched).toEqual(
      expect.arrayContaining([
        "profile",
        "dashboard",
        "studentsByName",
        "studentsSearch",
        "aDetail",
        "aLedger",
        "bLedger",
        "lessonsWeek",
        "lessonDetail",
      ]),
    );
    expect(touched).not.toContain("subjects");
    expect(touched).not.toContain("calendar");
  });

  it("calendar changes refresh sync states", async () => {
    const touched = await invalidatedBy({ type: "calendar" });
    expect(touched).toEqual(
      expect.arrayContaining(["calendar", "dashboard", "lessonsWeek", "aLedger"]),
    );
    expect(touched).not.toContain("studentsByName");
  });

  it("a demo reset refreshes everything", async () => {
    expect(await invalidatedBy({ type: "everything" })).toEqual(Object.keys(CACHE).sort());
  });
});

describe("keysToInvalidate", () => {
  it("never lists the same student twice and skips empty ids", () => {
    const keys = keysToInvalidate({ type: "lesson", studentIds: [A, A, ""] });
    const studentScopes = keys.filter((key) => key[0] === "student");
    expect(studentScopes).toEqual([queryKeys.student.scope(A)]);
  });
});
