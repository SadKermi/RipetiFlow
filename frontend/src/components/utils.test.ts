import { describe, expect, it } from "vitest";
import {
  balanceSpeech,
  balanceStatus,
  formatAmountColumn,
  formatDayFieldValue,
  formatMinutesColumn,
  formatShortDate,
  initialsOf,
  lessonTiming,
  loadErrorText,
  speakEuro,
  splitLedgerDate,
  studentMeta,
} from "./utils";

const TODAY = "2026-10-06";

describe("money in words and columns", () => {
  it("reads amounts aloud without a sign", () => {
    expect(speakEuro(-6700)).toBe("67 euro");
    expect(speakEuro(6750)).toBe("67 euro e 50 centesimi");
    expect(speakEuro(100)).toBe("1 euro");
    expect(speakEuro(1)).toBe("1 centesimo");
    expect(speakEuro(45)).toBe("45 centesimi");
    expect(speakEuro(123450)).toBe("1.234 euro e 50 centesimi");
  });

  it("says the balance with a word (02 §10.6)", () => {
    expect(balanceStatus(-1)).toBe("debt");
    expect(balanceStatus(0)).toBe("settled");
    expect(balanceStatus(1)).toBe("credit");
    expect(balanceSpeech(-6700)).toBe("ti deve 67 euro");
    expect(balanceSpeech(-6700, null, { short: true })).toBe("deve 67 euro");
    expect(balanceSpeech(4000, 120)).toBe("in credito di 40 euro, circa 2 h");
    expect(balanceSpeech(4000, null)).toBe("in credito di 40 euro");
    expect(balanceSpeech(0)).toBe("in pari");
  });

  it("formats column amounts without € and durations as H h MM", () => {
    expect(formatAmountColumn(4400)).toBe("44,00");
    expect(formatAmountColumn(-123450)).toBe("1.234,50");
    expect(formatMinutesColumn(90)).toBe("1 h 30");
    expect(formatMinutesColumn(65)).toBe("1 h 05");
    expect(formatMinutesColumn(120)).toBe("2 h");
    expect(formatMinutesColumn(45)).toBe("45 min");
  });
});

describe("dates", () => {
  it("splits a ledger date and adds the year only when it is another one", () => {
    expect(splitLedgerDate("2026-10-05", TODAY)).toEqual({ day: "lun 5", month: "ott" });
    expect(splitLedgerDate("2025-09-28", TODAY)).toEqual({ day: "dom 28", month: "set 2025" });
    expect(formatShortDate("2025-09-29", TODAY)).toBe("lun 29 set 2025");
    expect(formatDayFieldValue("2026-10-06")).toBe("mar 6 ott 2026");
    expect(formatDayFieldValue("non-una-data")).toBe("");
  });
});

describe("lessonTiming", () => {
  const lesson = { date: TODAY, start_time: "15:00", end_time: "16:00" };
  it("counts down within 3 h, says «in corso» during the lesson", () => {
    expect(lessonTiming(lesson, TODAY, 14 * 60 + 20)).toEqual({
      label: "tra 40 min",
      inProgress: false,
    });
    expect(lessonTiming(lesson, TODAY, 12 * 60 + 50)).toEqual({
      label: "tra 2 h 10 min",
      inProgress: false,
    });
    expect(lessonTiming(lesson, TODAY, 15 * 60)).toEqual({ label: "adesso", inProgress: true });
    expect(lessonTiming(lesson, TODAY, 15 * 60 + 30)).toEqual({
      label: "in corso",
      inProgress: true,
    });
  });

  it("says nothing far ahead, after the end, or on another day", () => {
    expect(lessonTiming(lesson, TODAY, 11 * 60)).toBeNull();
    expect(lessonTiming(lesson, TODAY, 16 * 60)).toBeNull();
    expect(lessonTiming({ ...lesson, date: "2026-10-07" }, TODAY, 14 * 60 + 50)).toBeNull();
  });
});

describe("studentMeta", () => {
  const base = {
    grade: "2ª liceo classico",
    school: "Liceo Parini",
    next_lesson: null,
    last_lesson_date: null,
  };
  it("shows class then next or last lesson", () => {
    expect(
      studentMeta({ ...base, next_lesson: { date: "2026-10-08", start_time: "15:00" } }, TODAY),
    ).toBe("2ª liceo classico · prossima gio 8 ott, 15:00");
    expect(
      studentMeta({ ...base, next_lesson: { date: TODAY, start_time: "15:00:00" } }, TODAY),
    ).toBe("2ª liceo classico · oggi 15:00");
    expect(studentMeta({ ...base, grade: null, last_lesson_date: "2026-09-28" }, TODAY)).toBe(
      "Liceo Parini · ultima lun 28 set",
    );
    expect(studentMeta({ ...base, grade: null, school: null }, TODAY)).toBe("");
  });
});

describe("initialsOf / loadErrorText", () => {
  it("builds avatar initials", () => {
    expect(initialsOf("Daniele Marchi", "d.marchi@esempio.it")).toBe("DM");
    expect(initialsOf("anna maria ferri", null)).toBe("AF");
    expect(initialsOf(null, "demo@ripetiflow.local")).toBe("D");
    expect(initialsOf("  ", null)).toBe("?");
  });

  it("says how old the cached data is", () => {
    const at = Date.UTC(2026, 9, 6, 7, 12); // 9:12 in Rome (UTC+2)
    expect(loadErrorText({})).toBe("Non riesco a caricare i dati.");
    expect(loadErrorText({ cachedAt: at })).toBe(
      "Non riesco ad aggiornare i dati: quelli che vedi sono delle 9:12.",
    );
    expect(loadErrorText({ cachedAt: at, offline: true })).toBe(
      "Sei offline: quelli che vedi sono i dati delle 9:12.",
    );
  });
});
