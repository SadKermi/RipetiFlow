import { describe, expect, it } from "vitest";
import { centsToInput, formatEuro, formatEuroAbs, parseEuroInput } from "./money";

const NBSP = "\u00a0";

describe("formatEuro", () => {
  it.each([
    [123450, `1.234,50${NBSP}€`],
    [4500, `45,00${NBSP}€`],
    [1, `0,01${NBSP}€`],
    [99, `0,99${NBSP}€`],
    [100, `1,00${NBSP}€`],
    [99950, `999,50${NBSP}€`],
    [100000, `1.000,00${NBSP}€`],
    [123456789, `1.234.567,89${NBSP}€`],
  ])("%i cents → %s", (cents, expected) => {
    expect(formatEuro(cents)).toBe(expected);
  });

  it("formats zero (and negative zero) without a sign", () => {
    expect(formatEuro(0)).toBe(`0,00${NBSP}€`);
    expect(formatEuro(-0)).toBe(`0,00${NBSP}€`);
  });

  it("formats negative amounts with a leading minus", () => {
    expect(formatEuro(-4500)).toBe(`-45,00${NBSP}€`);
    expect(formatEuro(-5)).toBe(`-0,05${NBSP}€`);
    expect(formatEuro(-123450)).toBe(`-1.234,50${NBSP}€`);
  });

  it("is exact for the largest safe integer (no float rounding)", () => {
    expect(formatEuro(Number.MAX_SAFE_INTEGER)).toBe(`90.071.992.547.409,91${NBSP}€`);
    expect(formatEuro(-Number.MAX_SAFE_INTEGER)).toBe(`-90.071.992.547.409,91${NBSP}€`);
  });

  it("rejects non-integer or unsafe amounts", () => {
    expect(() => formatEuro(12.5)).toThrow(RangeError);
    expect(() => formatEuro(Number.NaN)).toThrow(RangeError);
    expect(() => formatEuro(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatEuro(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe("formatEuroAbs", () => {
  it("drops the sign", () => {
    expect(formatEuroAbs(-4500)).toBe(`45,00${NBSP}€`);
    expect(formatEuroAbs(4500)).toBe(`45,00${NBSP}€`);
  });
});

describe("centsToInput", () => {
  it.each([
    [1250, "12,50"],
    [1200, "12,00"],
    [5, "0,05"],
    [0, "0,00"],
    [123450, "1234,50"],
    [-4500, "-45,00"],
  ])("%i → %s", (cents, expected) => {
    expect(centsToInput(cents)).toBe(expected);
  });

  it("round-trips through parseEuroInput", () => {
    for (const cents of [0, 1, 99, 1250, 123450, 999999]) {
      expect(parseEuroInput(centsToInput(cents))).toBe(cents);
    }
  });
});

describe("parseEuroInput", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50", 1250],
    ["12,05", 1205],
    ["0,5", 50],
    [",50", 50],
    ["12,", 1200],
    ["1.234,50", 123450],
    ["1.234", 123400],
    ["12.345.678,90", 1234567890],
    ["12.50", 1250],
    ["12.5", 1250],
    ["0.99", 99],
    ["0", 0],
    ["007", 700],
    ["  25 € ", 2500],
    ["€25", 2500],
    ["25\u00a0€", 2500],
    ["+25", 2500],
    ["1 234,50", 123450],
  ])("%j → %i cents", (text, expected) => {
    expect(parseEuroInput(text)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    ["€"],
    [","],
    ["."],
    ["abc"],
    ["12a"],
    ["12,345"], // three decimals
    ["12,3,4"],
    ["1,234.50"], // English format: ambiguous
    ["1.2345"],
    ["12.50.3"],
    ["1.23.456"],
    ["12.3456,00"],
    ["1e3"],
    ["0x10"],
    ["12..5"],
  ])("rejects %j", (text) => {
    expect(parseEuroInput(text)).toBeNull();
  });

  it("rejects negative amounts unless allowed", () => {
    expect(parseEuroInput("-12,50")).toBeNull();
    expect(parseEuroInput("-12,50", { allowNegative: true })).toBe(-1250);
    expect(parseEuroInput("\u221212,50", { allowNegative: true })).toBe(-1250);
    expect(parseEuroInput("-0", { allowNegative: true })).toBe(0);
  });

  it("rejects amounts beyond the safe integer range", () => {
    expect(parseEuroInput("999999999999999999")).toBeNull();
  });
});
