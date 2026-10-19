import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveEffect, lessonDeleteEffect, paymentDeleteEffect } from "./effects";
import {
  checkLesson,
  lessonCreateBody,
  lessonPatchBody,
  lessonRecreateBody,
  lessonToValues,
  lessonUndoPatch,
  newLessonValues,
} from "./lesson-model";
import { lessonSavedMessage, paymentSavedMessage, rateSavedMessage } from "./messages";
import {
  balanceWords,
  creditMinutesAt,
  lessonAmountCents,
  lessonSummary,
  previousRate,
  rateOn,
} from "./money-words";
import {
  balanceAfterPayment,
  checkPayment,
  highAmountWarning,
  newPaymentValues,
} from "./payment-model";
import { checkStudent, newStudentValues, splitName, studentPatchBody } from "./student-model";
import { NOW, TODAY, giulia, lesson } from "./test-utils";

const nbsp = (text: string) => text.replace(/ €/g, " €");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("money words", () => {
  it("says a balance with a word, never a sign", () => {
    expect(balanceWords(-6700)).toBe(nbsp("deve 67,00 €"));
    expect(balanceWords(4000)).toBe(nbsp("credito 40,00 €"));
    expect(balanceWords(0)).toBe("in pari");
  });

  it("finds the rate of a day in the history (D-16)", () => {
    const { rates } = giulia();
    expect(rateOn(rates, "2026-10-05")?.hourly_rate_cents).toBe(2200);
    expect(rateOn(rates, "2026-09-30")?.hourly_rate_cents).toBe(2000);
    expect(rateOn(rates, "2025-01-01")).toBeNull();
    expect(previousRate(rates, rates[0]!)?.id).toBe("r1");
    expect(previousRate(rates, rates[1]!)).toBeNull();
  });

  it("computes amounts like the database (round half away from zero) and credit time down", () => {
    expect(lessonAmountCents(2200, 90)).toBe(3300);
    expect(lessonAmountCents(2000, 50)).toBe(1667); // 1666,67
    expect(lessonAmountCents(1, 30)).toBe(1); // 0,5 → 1
    expect(creditMinutesAt(23300, 2200)).toBe(635); // 10 h 35 min, rounded down
    expect(lessonSummary(90, 2200)).toBe(nbsp("1 h 30 min · 33,00 € a 22,00 €/h"));
    expect(lessonSummary(90, null)).toBe("1 h 30 min");
  });
});

describe("lesson model", () => {
  it("a new lesson starts now rounded down to the quarter hour and lasts the default length", () => {
    const values = newLessonValues(
      { student_id: "giulia" },
      { today: TODAY, timeZone: "Europe/Rome", lessonMinutes: 90 },
    );
    expect(values).toMatchObject({
      studentId: "giulia",
      subjectId: undefined,
      date: TODAY,
      start: "14:15",
      end: "15:45",
      rateTouched: false,
    });
  });

  it("a Matita draft prefills everything; its rate is sent as written", () => {
    const values = newLessonValues(
      {
        student_id: "luca",
        subject_id: null,
        date: "2026-10-05",
        start_time: "15:00",
        end_time: "16:30",
        topic: "equazioni",
        hourly_rate_cents: 2500,
      },
      { today: TODAY, timeZone: "Europe/Rome", lessonMinutes: 60 },
    );
    expect(values.subjectId).toBeNull();
    const check = checkLesson(values, TODAY);
    expect(lessonCreateBody(values, check, "mat")).toEqual({
      student_id: "luca",
      subject_id: null,
      date: "2026-10-05",
      start_time: "15:00",
      end_time: "16:30",
      topic: "equazioni",
      notes: null,
      hourly_rate_cents: 2500,
    });
  });

  it("validates with the server's texts", () => {
    const base = newLessonValues({}, { today: TODAY, timeZone: "Europe/Rome", lessonMinutes: 60 });
    expect(checkLesson({ ...base, start: "16:00", end: "15:00" }, TODAY).errors).toEqual({
      student: "Scegli lo studente.",
      end: "L'orario di fine deve essere successivo a quello di inizio.",
    });
    const long = checkLesson({ ...base, studentId: "s", start: "8", end: "1730" }, TODAY);
    expect(long.errors).toEqual({});
    expect(long.warning).toBe("Sono 9 h 30 min di lezione: è giusto?");
    expect(checkLesson({ ...base, studentId: "s", start: "7", end: "20" }, TODAY).errors.end).toBe(
      "Una lezione non può durare più di 12 ore.",
    );
    expect(checkLesson({ ...base, studentId: "s", date: "2028-10-07" }, TODAY).errors.date).toBe(
      "La data è troppo lontana: al massimo due anni da oggi.",
    );
    expect(checkLesson({ ...base, studentId: "s", end: "" }, TODAY).errors.end).toBe(
      "Scrivi l'orario di fine.",
    );
  });

  it("without a written rate the body has no hourly_rate_cents (the history decides)", () => {
    const values = {
      ...newLessonValues(
        { student_id: "giulia" },
        { today: TODAY, timeZone: "Europe/Rome", lessonMinutes: 60 },
      ),
      start: "1630",
      end: "18",
      topic: "  equazioni ",
    };
    const body = lessonCreateBody(values, checkLesson(values, TODAY), "mat");
    expect(body).toEqual({
      student_id: "giulia",
      subject_id: "mat",
      date: TODAY,
      start_time: "16:30",
      end_time: "18:00",
      topic: "equazioni",
      notes: null,
    });
  });

  it("an edit sends only what changed; the rate only when written, and undo puts it back", () => {
    const original = lesson();
    const values = { ...lessonToValues(original), date: "2026-10-06", topic: "" };
    const patch = lessonPatchBody(values, checkLesson(values, TODAY), original);
    expect(patch).toEqual({ date: "2026-10-06", topic: null });
    expect(lessonUndoPatch(patch, original)).toEqual({
      date: "2026-10-05",
      topic: "moto rettilineo uniforme",
    });
    const rated = { ...values, rateCents: 2000, rateTouched: true };
    expect(lessonPatchBody(rated, checkLesson(rated, TODAY), original).hourly_rate_cents).toBe(
      2000,
    );
    expect(lessonRecreateBody(original)).toMatchObject({
      student_id: "giulia",
      hourly_rate_cents: 2200,
      notes: "esercizi 4–9",
    });
  });
});

describe("payment model", () => {
  it("the balance after is balance + amount (an edited payment is taken out first)", () => {
    expect(balanceAfterPayment(-6700, 5000)).toBe(-1700);
    expect(balanceAfterPayment(-6700, 6700)).toBe(0);
    expect(balanceAfterPayment(-1700, 6000, 5000)).toBe(-700);
  });

  it("warns about a very high amount with the credit in time (03 §7.2)", () => {
    expect(
      highAmountWarning({
        amountCents: 30000,
        balanceCents: -6700,
        rateCents: 2200,
        firstName: "Giulia",
      }),
    ).toBe(
      nbsp("Sono 300,00 €: dopo, Giulia avrà 233,00 € di credito (circa 10 h 35 min a 22,00 €/h)."),
    );
    expect(
      highAmountWarning({
        amountCents: 20000,
        balanceCents: -6700,
        rateCents: 2200,
        firstName: "Giulia",
      }),
    ).toBeNull();
    expect(
      highAmountWarning({
        amountCents: 23000,
        balanceCents: 0,
        rateCents: 2200,
        firstName: "Sara",
      }),
    ).toBe(
      nbsp("Sono 230,00 €: dopo, Sara avrà 230,00 € di credito (circa 10 h 27 min a 22,00 €/h)."),
    );
  });

  it("checks the server's limits", () => {
    const values = newPaymentValues({}, TODAY);
    expect(checkPayment(values)).toEqual({
      student: "Scegli chi ha pagato.",
      amount: "Scrivi l'importo ricevuto, per esempio 50,00.",
    });
    expect(checkPayment({ ...values, studentId: "s", amountCents: 10_000_001 }).amount).toBe(
      "L'importo deve essere compreso tra 0,01 € e 100.000,00 €.",
    );
    expect(values.method).toBe("cash");
  });
});

describe("student model", () => {
  it("splits a searched name and requires the first name and the rate", () => {
    expect(splitName(" Giovanni  De Luca ")).toEqual({
      first_name: "Giovanni",
      last_name: "De Luca",
    });
    const values = newStudentValues({}, { today: TODAY, rateCents: null });
    expect(checkStudent(values, "create")).toEqual({
      first_name: "Scrivi il nome.",
      hourly_rate_cents: "Scrivi la tariffa oraria, per esempio 20,00.",
    });
    expect(checkStudent(values, "edit")).toEqual({ first_name: "Scrivi il nome." });
  });

  it("an edit sends only the changed fields, emptied ones as null", () => {
    const original = giulia();
    const values = newStudentValues({}, { today: TODAY, rateCents: null });
    values.text = {
      ...values.text,
      first_name: "Giulia",
      last_name: "Ferri",
      grade: "4ª liceo scientifico",
      school: "Liceo Galilei",
      guardian_name: "",
      guardian_phone: "347 512 0896",
    };
    values.subjectId = "mat";
    expect(studentPatchBody(values, original)).toEqual({
      grade: "4ª liceo scientifico",
      guardian_name: null,
    });
  });
});

describe("confirmation and toast texts (03 §7.5)", () => {
  it("deleting a lesson in the balance says how the balance changes", () => {
    expect(
      lessonDeleteEffect(
        { amountCents: 4400, settled: true, inCalendar: true },
        { balance_cents: -6700, projected_balance_cents: -8900 },
      ),
    ).toBe(
      nbsp(
        "Il saldo passa da deve 67,00 € a deve 23,00 €. Resta traccia nello storico modifiche. L'evento sparisce da Google Calendar.",
      ),
    );
    expect(
      lessonDeleteEffect(
        { amountCents: 2200, settled: false, inCalendar: false },
        { balance_cents: -6700, projected_balance_cents: -8900 },
      ),
    ).toBe(nbsp("Il saldo non cambia; il previsto passa da deve 89,00 € a deve 67,00 €."));
  });

  it("deleting a payment and archiving with an open balance", () => {
    expect(paymentDeleteEffect(5000, -6700)).toBe(
      nbsp("Il saldo passa da deve 67,00 € a deve 117,00 €."),
    );
    expect(archiveEffect({ first_name: "Marco", balance: giulia().balance })).toBe(
      nbsp(
        "Marco ti deve ancora 67,00 €. Resterà in «Conti aperti» finché il saldo non torna in pari.",
      ),
    );
  });

  it("toasts after saving", () => {
    expect(lessonSavedMessage(lesson(), TODAY)).toBe("Lezione registrata · nel saldo");
    expect(
      lessonSavedMessage(
        lesson({ settled: false, date: "2026-10-13", start_time: "15:00" }),
        TODAY,
      ),
    ).toBe("Lezione programmata per mar 13 ott alle 15:00");
    expect(paymentSavedMessage(6700)).toBe(nbsp("Pagamento di 67,00 € registrato"));
    expect(rateSavedMessage(2400, "2026-10-05", 2)).toBe(
      nbsp("Tariffa di 24,00 €/h dal 5 ott salvata · 2 lezioni ricalcolate"),
    );
    expect(rateSavedMessage(2400, "2026-10-05", 0)).toMatch(/· nessuna lezione ricalcolata$/);
  });
});
