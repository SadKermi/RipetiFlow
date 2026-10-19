import { describe, expect, it } from "vitest";
import { ApiProblem, UserFacingError } from "@/lib/api/problem";
import {
  OFFLINE_WRITE_MESSAGE,
  firstErrorField,
  focusFirstInvalid,
  problemToFormErrors,
} from "./problem";

const LESSON_FIELDS = ["student", "date", "start", "end", "subject", "topic", "notes"] as const;
const LESSON_MAP = {
  student_id: "student",
  subject_id: "subject",
  start_time: "start",
  end_time: "end",
} as const;

describe("problemToFormErrors", () => {
  it("puts each errors[].field on its form field (renamed or same name)", () => {
    const problem = ApiProblem.fromBody(422, {
      code: "validation_error",
      detail: "Controlla i dati inseriti.",
      errors: [
        {
          field: "end_time",
          message: "L'orario di fine deve essere successivo a quello di inizio.",
        },
        { field: "topic", message: "Al massimo 200 caratteri." },
      ],
    });
    const errors = problemToFormErrors(problem, { fields: LESSON_FIELDS, map: LESSON_MAP });
    expect(errors.fields).toEqual({
      end: "L'orario di fine deve essere successivo a quello di inizio.",
      topic: "Al massimo 200 caratteri.",
    });
    expect(errors.form).toBeNull();
  });

  it("sends a field the form does not have to the note above the actions", () => {
    const problem = ApiProblem.fromBody(422, {
      code: "validation_error",
      detail: "Controlla i dati inseriti.",
      errors: [
        { field: "hourly_rate_cents", message: "La tariffa deve essere positiva." },
        { field: "date", message: "Data non valida." },
      ],
    });
    const errors = problemToFormErrors(problem, { fields: LESSON_FIELDS, map: LESSON_MAP });
    expect(errors.fields).toEqual({ date: "Data non valida." });
    expect(errors.form).toBe("La tariffa deve essere positiva.");
  });

  it("uses the server's detail when there is no field (409, 422 without errors, 502)", () => {
    const conflict = ApiProblem.fromBody(409, {
      code: "conflict",
      detail: "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.",
    });
    expect(problemToFormErrors(conflict, { fields: LESSON_FIELDS })).toEqual({
      fields: {},
      form: "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.",
    });
    const upstream = ApiProblem.fromBody(502, {
      code: "upstream_error",
      detail: "Google non risponde.",
    });
    expect(problemToFormErrors(upstream, { fields: LESSON_FIELDS }).form).toBe(
      "Google non risponde.",
    );
  });

  it("adds «Riprova tra poco.» to a 500 and never shows technical details", () => {
    const internal = ApiProblem.fromBody(500, {
      code: "internal_error",
      detail: "Errore interno.",
    });
    expect(problemToFormErrors(internal, { fields: [] }).form).toBe(
      "Errore interno. Riprova tra poco.",
    );
    const fallback = ApiProblem.fromBody(500, "<html>boom</html>");
    expect(problemToFormErrors(fallback, { fields: [] }).form).toBe(
      "Qualcosa è andato storto. Riprova tra poco.",
    );
  });

  it("says nothing was saved when the request never left", () => {
    expect(problemToFormErrors(ApiProblem.network(), { fields: [] }).form).toBe(
      OFFLINE_WRITE_MESSAGE,
    );
  });

  it("handles errors that are not problems", () => {
    expect(
      problemToFormErrors(new UserFacingError("Scegli uno studente."), { fields: [] }).form,
    ).toBe("Scegli uno studente.");
    expect(problemToFormErrors(new Error("TypeError: x is undefined"), { fields: [] }).form).toBe(
      "Qualcosa è andato storto. Riprova tra poco.",
    );
  });
});

describe("firstErrorField / focusFirstInvalid", () => {
  it("follows the screen order", () => {
    expect(firstErrorField({ end: "x", student: "y" }, LESSON_FIELDS)).toBe("student");
    expect(firstErrorField({}, LESSON_FIELDS)).toBeNull();
  });

  it("focuses the first invalid control, inputs and day/select buttons alike", () => {
    document.body.innerHTML = `
      <form>
        <input id="ok" />
        <button id="day" data-rf-invalid="true">mar 6 ott 2026</button>
        <input id="bad" aria-invalid="true" />
      </form>`;
    expect(focusFirstInvalid(document.querySelector("form"))).toBe(true);
    expect(document.activeElement?.id).toBe("day");
    expect(focusFirstInvalid(document.getElementById("ok"))).toBe(false);
    document.body.innerHTML = "";
  });
});
