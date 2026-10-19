import { describe, expect, it } from "vitest";
import {
  daysOf,
  gridHours,
  layoutDay,
  lessonsByDay,
  summaryText,
  weekFromParam,
  weekLabel,
  weekSummary,
} from "./week";

const at = (id: string, start: string, end: string, date = "2026-10-06") => ({
  id,
  date,
  start_time: start,
  end_time: end,
});

describe("week helpers (03 §6)", () => {
  it("starts on Monday, from the URL when it is a real date", () => {
    expect(weekFromParam(null, "2026-10-06")).toBe("2026-10-05");
    expect(weekFromParam("2026-10-14", "2026-10-06")).toBe("2026-10-12");
    expect(weekFromParam("2026-02-30", "2026-10-06")).toBe("2026-10-05");
    expect(weekFromParam("domani", "2026-10-06")).toBe("2026-10-05");
    expect(daysOf("2026-10-05")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("labels the week like the screens", () => {
    expect(weekLabel("2026-10-05")).toBe("5–11 ottobre 2026");
    expect(weekLabel("2026-10-05", { year: false, currentYear: 2026 })).toBe("5–11 ottobre");
    expect(weekLabel("2026-09-28")).toBe("28 settembre – 4 ottobre 2026");
    expect(weekLabel("2026-09-28", { year: false, currentYear: 2026 })).toBe(
      "28 settembre – 4 ottobre",
    );
    expect(weekLabel("2026-12-28", { year: false, currentYear: 2026 })).toBe(
      "28 dicembre 2026 – 3 gennaio 2027",
    );
    expect(weekLabel("2027-03-01", { year: false, currentYear: 2026 })).toBe("1–7 marzo 2027");
  });

  it("sums the week, scheduled lessons included", () => {
    const summary = weekSummary([
      { duration_minutes: 60, amount_cents: 2000 },
      { duration_minutes: 90, amount_cents: 3300 },
    ]);
    expect(summary).toEqual({ lessons: 2, minutes: 150, amountCents: 5300 });
    expect(summaryText(summary)).toBe("2 lezioni · 2 h 30 min · 53,00 €");
    expect(summaryText({ lessons: 1, minutes: 45, amountCents: 123450 })).toBe(
      "1 lezione · 45 min · 1.234,50 €",
    );
  });

  it("groups by day and sorts by start", () => {
    const days = lessonsByDay([
      at("b", "16:00", "17:00"),
      at("a", "15:00", "16:00"),
      at("c", "09:00", "10:00", "2026-10-07"),
    ]);
    expect(days.get("2026-10-06")?.map((lesson) => lesson.id)).toEqual(["a", "b"]);
    expect(days.get("2026-10-07")?.map((lesson) => lesson.id)).toEqual(["c"]);
  });

  it("draws 07:00–21:00, wider for earlier or later lessons", () => {
    expect(gridHours([])).toEqual({ startHour: 7, endHour: 21 });
    expect(gridHours([at("a", "06:30", "07:30"), at("b", "21:00", "22:15")])).toEqual({
      startHour: 6,
      endHour: 23,
    });
  });

  it("puts overlapping lessons side by side (group lessons, D-12)", () => {
    const layout = layoutDay([
      at("a", "15:00", "16:00"),
      at("b", "15:00", "16:00"),
      at("c", "15:30", "17:00"),
      at("d", "17:00", "18:00"),
    ]);
    expect(layout.get("a")).toMatchObject({ lane: 0, lanes: 3 });
    expect(layout.get("b")).toMatchObject({ lane: 1, lanes: 3 });
    expect(layout.get("c")).toMatchObject({ lane: 2, lanes: 3 });
    // Starts when the cluster ends: a cluster of its own, full width.
    expect(layout.get("d")).toEqual({ start: 17 * 60, end: 18 * 60, lane: 0, lanes: 1 });
  });

  it("reuses a lane freed inside the same cluster", () => {
    const layout = layoutDay([
      at("long", "14:00", "18:00"),
      at("first", "14:00", "15:00"),
      at("second", "15:00", "16:00"),
    ]);
    expect(layout.get("long")).toMatchObject({ lane: 0, lanes: 2 });
    expect(layout.get("first")).toMatchObject({ lane: 1, lanes: 2 });
    expect(layout.get("second")).toMatchObject({ lane: 1, lanes: 2 });
  });
});
