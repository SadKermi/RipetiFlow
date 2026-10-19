import { describe, expect, it } from "vitest";
import { TIME_MESSAGES, checkTimeRange, parseTimeInput } from "./time";

describe("parseTimeInput", () => {
  it.each([
    ["15", "15:00"],
    ["9", "09:00"],
    ["1500", "15:00"],
    ["930", "09:30"],
    ["15:00", "15:00"],
    ["15.00", "15:00"],
    ["9:05", "09:05"],
    [" 16:30 ", "16:30"],
  ])("%j → %j", (text, expected) => {
    expect(parseTimeInput(text)).toBe(expected);
  });

  it.each([["24"], ["2460"], ["1575"], ["15:7"], ["ab"], [""], ["12345"], ["-1"]])(
    "rejects %j",
    (text) => {
      expect(parseTimeInput(text)).toBeNull();
    },
  );
});

describe("checkTimeRange", () => {
  it("accepts a normal lesson and gives its length", () => {
    expect(checkTimeRange("1630", "18")).toEqual({ start: "16:30", end: "18:00", minutes: 90 });
  });

  it("refuses an end not after the start, with the server's text", () => {
    expect(checkTimeRange("16:30", "16:00").endError).toBe(TIME_MESSAGES.endNotAfterStart);
    expect(checkTimeRange("16:30", "16:30").endError).toBe(TIME_MESSAGES.endNotAfterStart);
  });

  it("warns above 8 h and blocks above 12 h", () => {
    const nine = checkTimeRange("8", "17");
    expect(nine.warning).toBe("Sono 9 h di lezione: è giusto?");
    expect(nine.endError).toBeUndefined();
    expect(checkTimeRange("7", "20").endError).toBe(TIME_MESSAGES.tooLong);
    expect(checkTimeRange("8", "16").warning).toBeUndefined();
  });

  it("flags unreadable times but not empty ones", () => {
    expect(checkTimeRange("15:7", "").startError).toBe(TIME_MESSAGES.invalid);
    expect(checkTimeRange("", "")).toEqual({ start: null, end: null, minutes: null });
  });
});
