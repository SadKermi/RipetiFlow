import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  defaultStartTime,
  formatDateLong,
  formatDateShort,
  formatDayMonth,
  formatMonthYear,
  formatRelativeDate,
  formatWeekdayLong,
  minutesNowIn,
  monthRange,
  parseIsoDate,
  startOfWeek,
  todayIn,
  weekDays,
} from "./date";

describe("parseIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(parseIsoDate("2026-10-06")?.toString()).toBe("2026-10-06");
    expect(parseIsoDate("2028-02-29")?.toString()).toBe("2028-02-29");
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-10-6")).toBeNull();
    expect(parseIsoDate("06/10/2026")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("Italian date formats", () => {
  it("short: weekday, day, month", () => {
    expect(formatDateShort("2026-10-05")).toBe("lun 5 ott");
    expect(formatDateShort("2026-10-06")).toBe("mar 6 ott");
    expect(formatDateShort("2026-11-01")).toBe("dom 1 nov");
  });

  it("long: day, month, year", () => {
    expect(formatDateLong("2026-10-06")).toBe("6 ottobre 2026");
    expect(formatDateLong("2027-01-01")).toBe("1 gennaio 2027");
  });

  it("weekday long, month-year and day/month", () => {
    expect(formatWeekdayLong("2026-10-06")).toBe("martedì 6 ottobre");
    expect(formatMonthYear("2026-10-06")).toBe("ottobre 2026");
    expect(formatDayMonth("2026-09-12")).toBe("12/09");
  });

  it("does not shift the day with the machine timezone (tests run in UTC+14)", () => {
    expect(formatDateShort("2026-01-01")).toBe("gio 1 gen");
    expect(formatDateLong("2026-12-31")).toBe("31 dicembre 2026");
  });

  it("throws on malformed dates", () => {
    expect(() => formatDateShort("2026-02-30")).toThrow(RangeError);
  });
});

describe("today and now in the tutor's timezone", () => {
  // 2026-10-06 23:30 in Rome (CEST, UTC+2) = 21:30 UTC.
  const lateEvening = new Date("2026-10-06T21:30:00Z");

  it("uses the tutor's zone, not the browser's", () => {
    expect(todayIn("Europe/Rome", lateEvening)).toBe("2026-10-06");
    expect(todayIn("Pacific/Kiritimati", lateEvening)).toBe("2026-10-07");
    expect(todayIn("America/New_York", lateEvening)).toBe("2026-10-06");
    expect(minutesNowIn("Europe/Rome", lateEvening)).toBe(23 * 60 + 30);
  });

  it("handles the DST change in Rome", () => {
    // 2026-10-25 01:30 UTC = 02:30 CET (after clocks go back at 03:00 CEST).
    expect(minutesNowIn("Europe/Rome", new Date("2026-10-25T01:30:00Z"))).toBe(2 * 60 + 30);
    // 2026-03-29 01:30 UTC = 03:30 CEST (clocks jumped from 02:00 to 03:00).
    expect(minutesNowIn("Europe/Rome", new Date("2026-03-29T01:30:00Z"))).toBe(3 * 60 + 30);
  });

  it("default start time is now rounded down to the quarter hour", () => {
    expect(defaultStartTime("Europe/Rome", new Date("2026-10-06T13:37:00Z"))).toBe("15:30");
    expect(defaultStartTime("Europe/Rome", new Date("2026-10-06T13:45:00Z"))).toBe("15:45");
    expect(defaultStartTime("Europe/Rome", new Date("2026-10-06T22:14:59Z"))).toBe("00:00");
  });
});

describe("relative dates", () => {
  const now = new Date("2026-10-06T10:00:00Z"); // 12:00 in Rome

  it("oggi / domani / ieri, otherwise the short date", () => {
    expect(formatRelativeDate("2026-10-06", "Europe/Rome", now)).toBe("oggi");
    expect(formatRelativeDate("2026-10-07", "Europe/Rome", now)).toBe("domani");
    expect(formatRelativeDate("2026-10-05", "Europe/Rome", now)).toBe("ieri");
    expect(formatRelativeDate("2026-10-08", "Europe/Rome", now)).toBe("gio 8 ott");
    expect(formatRelativeDate("2026-10-04", "Europe/Rome", now)).toBe("dom 4 ott");
  });

  it("depends on the tutor's zone around midnight", () => {
    const nearMidnight = new Date("2026-10-06T22:30:00Z"); // 00:30 of the 7th in Rome
    expect(formatRelativeDate("2026-10-07", "Europe/Rome", nearMidnight)).toBe("oggi");
    expect(formatRelativeDate("2026-10-07", "Europe/London", nearMidnight)).toBe("domani");
  });
});

describe("date arithmetic", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
  });

  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(startOfWeek("2026-10-07")).toBe("2026-10-05"); // Wednesday
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week before
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // across months
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28"); // across years
  });

  it("lists the seven days of the week", () => {
    expect(weekDays("2026-10-08")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("month range", () => {
    expect(monthRange("2026-10-15")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
