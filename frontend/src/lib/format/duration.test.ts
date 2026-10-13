import { describe, expect, it } from "vitest";
import { formatCreditMinutes, formatCreditMinutesText, formatMinutes } from "./duration";

describe("formatMinutes", () => {
  it.each([
    [0, "0 min"],
    [1, "1 min"],
    [45, "45 min"],
    [59, "59 min"],
    [60, "1 h"],
    [90, "1 h 30 min"],
    [120, "2 h"],
    [136, "2 h 16 min"],
    [61, "1 h 1 min"],
    [600, "10 h"],
    [-90, "-1 h 30 min"],
  ])("%i → %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  it("rejects fractional minutes", () => {
    expect(() => formatMinutes(1.5)).toThrow(RangeError);
  });
});

describe("formatCreditMinutes", () => {
  it.each([
    [136, "≈ 2 h 16 min"],
    [210, "≈ 3 h 30 min"],
    [45, "≈ 45 min"],
    [120, "≈ 2 h"],
    [0, "≈ 0 min"],
  ])("%i → %s", (minutes, expected) => {
    expect(formatCreditMinutes(minutes)).toBe(expected);
  });
});

describe("formatCreditMinutesText", () => {
  it("uses words instead of the ≈ glyph (missing from the UI fonts)", () => {
    expect(formatCreditMinutesText(136)).toBe("circa 2 h 16 min");
    expect(formatCreditMinutesText(45)).toBe("circa 45 min");
    expect(formatCreditMinutesText(-120)).toBe("circa 2 h");
  });
});
