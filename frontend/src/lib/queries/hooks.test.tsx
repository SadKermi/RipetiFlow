import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSessionBridge } from "../api/session";
import type { Lesson, RateInput } from "../api/types";
import { queryKeys } from "./keys";
import {
  useActivity,
  useCreateLesson,
  useLessons,
  useRatePreview,
  useUpdateLesson,
  useUpdateProfile,
} from "./index";

const LESSON: Lesson = {
  id: "l1",
  student: { id: "s1", display_name: "Luca Bianchi" },
  subject: null,
  date: "2026-10-06",
  start_time: "15:00",
  end_time: "16:30",
  duration_minutes: 90,
  hourly_rate_cents: 3000,
  amount_cents: 4500,
  topic: "Equazioni",
  notes: null,
  settled: false,
  calendar: { status: "off", error: null },
  created_at: "2026-10-06T13:00:00+00:00",
  updated_at: "2026-10-06T13:00:00+00:00",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function setup(respond: (request: Request) => Response) {
  restore = setSessionBridge({
    getAccessToken: () => Promise.resolve("token"),
    onUnauthorized: () => undefined,
  });
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((request: Request) => {
      requests.push(request);
      return Promise.resolve(respond(request));
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper, requests };
}

describe("lesson mutations", () => {
  it("confirming a Matita draft sends the assistant source and refreshes the student", async () => {
    const { queryClient, wrapper, requests } = setup(() => json(LESSON, 201));
    const ledgerKey = queryKeys.student.ledger("s1", {});
    const otherLedgerKey = queryKeys.student.ledger("s2", {});
    queryClient.setQueryData(ledgerKey, { items: [] });
    queryClient.setQueryData(otherLedgerKey, { items: [] });

    const { result } = renderHook(() => useCreateLesson(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        body: { student_id: "s1", date: "2026-10-06", start_time: "15:00", end_time: "16:30" },
        source: "assistant",
      }),
    );

    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/lessons");
    expect(requests[0]!.headers.get("X-RipetiFlow-Source")).toBe("assistant");
    expect(queryClient.getQueryState(ledgerKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherLedgerKey)?.isInvalidated).toBe(false);
  });

  it("moving a lesson to another student refreshes both students", async () => {
    const moved = { ...LESSON, student: { id: "s2", display_name: "Giulia" } };
    const { queryClient, wrapper, requests } = setup(() => json(moved));
    queryClient.setQueryData(queryKeys.student.detail("s1"), {});
    queryClient.setQueryData(queryKeys.student.detail("s2"), {});

    const { result } = renderHook(() => useUpdateLesson(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        id: "l1",
        patch: { student_id: "s2" },
        previousStudentId: "s1",
      }),
    );

    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.headers.get("X-RipetiFlow-Source")).toBeNull();
    expect(queryClient.getQueryState(queryKeys.student.detail("s1"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.student.detail("s2"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(queryKeys.lessons.detail("l1"))).toEqual(moved);
  });
});

describe("queries", () => {
  it("lessons range passes from/to as query parameters", async () => {
    const { wrapper, requests } = setup(() => json({ items: [LESSON] }));
    const { result } = renderHook(() => useLessons({ from: "2026-10-05", to: "2026-10-11" }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([LESSON]);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("from")).toBe("2026-10-05");
    expect(url.searchParams.get("to")).toBe("2026-10-11");
    expect(requests[0]!.headers.get("Authorization")).toBe("Bearer token");
  });

  it("activity pages through next_cursor", async () => {
    const { wrapper, requests } = setup((request) => {
      const before = new URL(request.url).searchParams.get("before");
      return before === null
        ? json({ items: [{ id: "a2" }], next_cursor: "cursor-1" })
        : json({ items: [{ id: "a1" }], next_cursor: null });
    });
    const { result } = renderHook(() => useActivity("s1", 1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(new URL(requests[1]!.url).searchParams.get("before")).toBe("cursor-1");
    expect(new URL(requests[1]!.url).searchParams.get("limit")).toBe("1");
  });

  it("rate preview waits for a complete input", async () => {
    const { wrapper, requests } = setup(() =>
      json({
        affected_lessons: 3,
        current_total_cents: 9000,
        new_total_cents: 10500,
        delta_cents: 1500,
      }),
    );
    const { result, rerender } = renderHook(
      ({ input }: { input: RateInput | null }) => useRatePreview("s1", input),
      { wrapper, initialProps: { input: null as RateInput | null } },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);

    rerender({ input: { hourly_rate_cents: 3500, effective_from: "2026-09-01" } });
    await waitFor(() => expect(result.current.data?.delta_cents).toBe(1500));
    expect(requests[0]!.method).toBe("POST");
    expect(await requests[0]!.json()).toEqual({
      hourly_rate_cents: 3500,
      effective_from: "2026-09-01",
    });
  });
});

describe("profile mutation", () => {
  const PROFILE = {
    id: "u1",
    email: "d.marchi@esempio.it",
    full_name: "Daniele Marchi",
    timezone: "America/New_York",
    default_lesson_minutes: 60,
    default_hourly_rate_cents: null,
    created_at: "2026-09-01T10:00:00Z",
  };

  function seed(queryClient: QueryClient) {
    const keys = {
      ledger: queryKeys.student.ledger("s1", {}),
      detail: queryKeys.student.detail("s1"),
      students: queryKeys.students.list({ sort: "balance" }),
      week: queryKeys.lessons.range({ from: "2026-10-05", to: "2026-10-11" }),
      dashboard: queryKeys.dashboard.detail(7),
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, { cached: true });
    return keys;
  }

  it("a new timezone refreshes balances, ledgers and lessons (it decides what is «svolta»)", async () => {
    const { queryClient, wrapper } = setup(() => json(PROFILE));
    const keys = seed(queryClient);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    await act(() => result.current.mutateAsync({ timezone: "America/New_York" }));
    for (const key of Object.values(keys)) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });

  it("a new name refreshes only the profile and the dashboard", async () => {
    const { queryClient, wrapper } = setup(() => json(PROFILE));
    const keys = seed(queryClient);
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    await act(() => result.current.mutateAsync({ full_name: "Daniele Marchi" }));
    expect(queryClient.getQueryState(keys.dashboard)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.ledger)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.students)?.isInvalidated).toBe(false);
  });
});
