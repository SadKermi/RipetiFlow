import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { remainingText } from "./messages";
import {
  balanceAfter,
  counterText,
  failureFromError,
  isLessonOver,
  isNearLimit,
  lessonBody,
  lessonInitial,
  nextQuotaReset,
  parseReply,
  paymentBody,
  plainReply,
  requestsLeft,
} from "./model";
import { lessonDraft, paymentDraft } from "./test-helpers";

function problem(status: number, code: string, detail = "Testo del server.") {
  return new ApiProblem({ status, code, title: "Errore", detail });
}

describe("failureFromError", () => {
  it("maps each answer of POST /assistant/messages to the note of 02 §9.13", () => {
    expect(failureFromError(problem(429, "rate_limited", "Hai raggiunto il limite."))).toEqual({
      kind: "rate_limited",
      detail: "Hai raggiunto il limite.",
    });
    expect(failureFromError(problem(503, "unavailable"))).toEqual({ kind: "unavailable" });
    expect(failureFromError(problem(502, "upstream_error"))).toEqual({ kind: "upstream" });
    expect(failureFromError(problem(504, "internal_error"))).toEqual({ kind: "upstream" });
    expect(failureFromError(ApiProblem.network())).toEqual({ kind: "offline" });
    expect(failureFromError(problem(422, "validation_error", "Messaggio troppo lungo."))).toEqual({
      kind: "other",
      detail: "Messaggio troppo lungo.",
    });
    expect(failureFromError(new Error("boom"))).toEqual({
      kind: "other",
      detail: "Qualcosa è andato storto. Riprova tra poco.",
    });
  });
});

describe("nextQuotaReset", () => {
  it("is the next midnight in Rome, whatever the machine's timezone", () => {
    // 6 Oct 2026 14:20 in Rome (UTC+2) → 7 Oct 00:00 Rome = 6 Oct 22:00 UTC.
    expect(new Date(nextQuotaReset(new Date("2026-10-06T12:20:00Z"))).toISOString()).toBe(
      "2026-10-06T22:00:00.000Z",
    );
    // Just after midnight in Rome it is already the next day there.
    expect(new Date(nextQuotaReset(new Date("2026-10-06T22:30:00Z"))).toISOString()).toBe(
      "2026-10-07T22:00:00.000Z",
    );
    // The night the clocks go back (25 Oct 2026): midnight of the 26th is at UTC+1.
    expect(new Date(nextQuotaReset(new Date("2026-10-25T10:00:00Z"))).toISOString()).toBe(
      "2026-10-25T23:00:00.000Z",
    );
  });
});

describe("quota", () => {
  it("is «quasi al limite» with 10 requests or fewer left", () => {
    expect(isNearLimit({ requests_today: 49, daily_limit: 60 })).toBe(false);
    expect(isNearLimit({ requests_today: 50, daily_limit: 60 })).toBe(true);
    expect(requestsLeft({ requests_today: 52, daily_limit: 60 })).toBe(8);
    expect(requestsLeft({ requests_today: 61, daily_limit: 60 })).toBe(0);
    expect(remainingText(8)).toBe("Ancora 8 richieste a Matita oggi.");
    expect(remainingText(1)).toBe("Ancora 1 richiesta a Matita oggi.");
  });

  it("counts the characters only when 200 or fewer are left, grouped the Italian way", () => {
    expect(counterText(1799, 2000)).toBeNull();
    expect(counterText(1840, 2000)).toBe("1.840/2000");
  });
});

describe("drafts", () => {
  it("knows when a lesson is over in the tutor's day", () => {
    const draft = lessonDraft({ date: "2026-10-06", end_time: "14:00" });
    expect(isLessonOver(draft, "2026-10-06", 14 * 60 + 20)).toBe(true);
    expect(isLessonOver(draft, "2026-10-06", 13 * 60 + 59)).toBe(false);
    expect(isLessonOver({ ...draft, date: "2026-10-05" }, "2026-10-06", 0)).toBe(true);
    expect(isLessonOver({ ...draft, date: "2026-10-07" }, "2026-10-06", 23 * 60)).toBe(false);
  });

  it("«sarà»: the balance after confirming; nothing for a lesson still to come", () => {
    const now = 14 * 60 + 20;
    expect(balanceAfter(lessonDraft(), -6700, "2026-10-06", now)).toBe(-9200);
    expect(balanceAfter(paymentDraft({ amount_cents: 5000 }), -6700, "2026-10-06", now)).toBe(
      -1700,
    );
    expect(
      balanceAfter(
        lessonDraft({ start_time: "16:30", end_time: "18:00" }),
        -6700,
        "2026-10-06",
        now,
      ),
    ).toBeNull();
  });

  it("confirms without a rate (the server takes it from the history, D-16)", () => {
    expect(lessonBody(lessonDraft())).toEqual({
      student_id: "sara",
      subject_id: "chi",
      date: "2026-10-06",
      start_time: "13:00",
      end_time: "14:00",
      topic: "stechiometria",
      notes: null,
    });
    expect(lessonInitial(lessonDraft({ subject: null }))).not.toHaveProperty("hourly_rate_cents");
    expect(lessonInitial(lessonDraft({ subject: null })).subject_id).toBeNull();
    expect(paymentBody(paymentDraft({ method: "bank_transfer", note: "acconto" }))).toEqual({
      student_id: "giulia",
      amount_cents: 5000,
      paid_on: "2026-10-06",
      method: "bank_transfer",
      note: "acconto",
    });
  });
});

describe("reply markdown", () => {
  it("splits paragraphs, line breaks and lists", () => {
    expect(
      parseReply("Ti devono in tre:\n- **Marco**: 120,00 €\n- Giulia: 67,00 €\n\nTotale 187,00 €."),
    ).toEqual([
      { kind: "paragraph", lines: ["Ti devono in tre:"] },
      { kind: "list", ordered: false, items: ["**Marco**: 120,00 €", "Giulia: 67,00 €"] },
      { kind: "paragraph", lines: ["Totale 187,00 €."] },
    ]);
    expect(parseReply("1. uno\n2) due")).toEqual([
      { kind: "list", ordered: true, items: ["uno", "due"] },
    ]);
    expect(parseReply("riga uno\nriga due")).toEqual([
      { kind: "paragraph", lines: ["riga uno", "riga due"] },
    ]);
  });

  it("reads as plain text for the live region", () => {
    expect(plainReply("Giulia ti deve **67,00 €**.\n- *ultima* lezione")).toBe(
      "Giulia ti deve 67,00 €. ultima lezione",
    );
  });
});
