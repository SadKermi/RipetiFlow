import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { recordRateLimit, recordUsage, resetMatitaStores, useMatitaQuota } from "./store";

afterEach(() => resetMatitaStores());

describe("Matita quota", () => {
  it("belongs to the tutor who received it", () => {
    recordRateLimit("Hai usato tutte le richieste di oggi.", "tutor-a");
    expect(renderHook(() => useMatitaQuota("tutor-a")).result.current.blocked?.detail).toBe(
      "Hai usato tutte le richieste di oggi.",
    );
    // Another account signed in in the same tab is not blocked by the first one's limit.
    const other = renderHook(() => useMatitaQuota("tutor-b")).result.current;
    expect(other).toEqual({ usage: null, blocked: null });
  });

  it("keeps the usage of the same tutor when the limit is reached", () => {
    const usage = { requests_today: 59, daily_limit: 60 };
    recordUsage(usage, "tutor-a");
    recordRateLimit("Limite raggiunto.", "tutor-a");
    expect(renderHook(() => useMatitaQuota("tutor-a")).result.current.usage).toEqual(usage);
  });
});
