import { describe, expect, it } from "vitest";
import {
  addMinutesToTime,
  formatTime,
  minutesBetween,
  normalizeTime,
  parseTime,
  roundDownToQuarter,
} from "./time";

describe("parseTime", () => {
  it.each([
    ["15:30", 930],
    ["00:00", 0],
    ["23:59", 1439],
    ["9:05", 545],
    ["09:05", 545],
    ["15.30", 930],
    ["15:30:00", 930],
    [" 8:00 ", 480],
  ])("%j → %i", (text, expected) => {
    expect(parseTime(text)).toBe(expected);
  });

  it.each([["24:00"], ["12:60"], ["1530"], ["9:5"], ["ab:cd"], [""], ["-1:00"], ["123:00"]])(
    "rejects %j",
    (text) => {
      expect(parseTime(text)).toBeNull();
    },
  );
});

describe("formatTime", () => {
  it.each([
    [0, "00:00"],
    [545, "09:05"],
    [930, "15:30"],
    [1439, "23:59"],
  ])("%i → %s", (minutes, expected) => {
    expect(formatTime(minutes)).toBe(expected);
  });

  it("rejects minutes outside the day", () => {
    expect(() => formatTime(-1)).toThrow(RangeError);
    expect(() => formatTime(1440)).toThrow(RangeError);
    expect(() => formatTime(10.5)).toThrow(RangeError);
  });
});

describe("normalizeTime", () => {
  it("returns canonical HH:MM", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("15.30")).toBe("15:30");
    expect(normalizeTime("15:30:00")).toBe("15:30");
    expect(normalizeTime("nope")).toBeNull();
  });
});

describe("addMinutesToTime", () => {
  it("adds within the day", () => {
    expect(addMinutesToTime("15:30", 90)).toBe("17:00");
    expect(addMinutesToTime("08:00", 60)).toBe("09:00");
    expect(addMinutesToTime("10:00", -30)).toBe("09:30");
    expect(addMinutesToTime("22:59", 60)).toBe("23:59");
  });

  it("returns null past midnight (lessons never span two days)", () => {
    expect(addMinutesToTime("23:30", 60)).toBeNull();
    expect(addMinutesToTime("23:00", 60)).toBeNull();
    expect(addMinutesToTime("00:10", -15)).toBeNull();
    expect(addMinutesToTime("bad", 60)).toBeNull();
  });
});

describe("minutesBetween", () => {
  it("computes durations", () => {
    expect(minutesBetween("15:00", "16:30")).toBe(90);
    expect(minutesBetween("15:00", "15:00")).toBe(0);
    expect(minutesBetween("16:00", "15:00")).toBe(-60);
    expect(minutesBetween("x", "15:00")).toBeNull();
  });
});

describe("roundDownToQuarter", () => {
  it.each([
    [937, 930],
    [930, 930],
    [944, 930],
    [945, 945],
    [14, 0],
    [1439, 1425],
  ])("%i → %i", (minutes, expected) => {
    expect(roundDownToQuarter(minutes)).toBe(expected);
  });
});
