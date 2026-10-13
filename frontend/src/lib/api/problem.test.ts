import { describe, expect, it } from "vitest";
import { ApiProblem, UserFacingError, errorMessage, isApiProblem } from "./problem";

const PROBLEM_HEADERS = { "Content-Type": "application/problem+json" };

describe("ApiProblem.fromBody", () => {
  it("reads every field of an RFC 9457 body from the API", () => {
    const problem = ApiProblem.fromBody(422, {
      type: "https://ripetiflow.app/errors/validation",
      title: "Dati non validi",
      status: 422,
      detail: "L'orario di fine deve essere successivo a quello di inizio.",
      code: "validation_error",
      errors: [
        {
          field: "end_time",
          message: "L'orario di fine deve essere successivo a quello di inizio.",
        },
        { field: "date", message: "Data non valida (formato AAAA-MM-GG)." },
        { field: "end_time", message: "Secondo messaggio sullo stesso campo." },
      ],
    });
    expect(problem).toBeInstanceOf(Error);
    expect(problem.name).toBe("ApiProblem");
    expect(problem.status).toBe(422);
    expect(problem.code).toBe("validation_error");
    expect(problem.title).toBe("Dati non validi");
    expect(problem.detail).toBe("L'orario di fine deve essere successivo a quello di inizio.");
    expect(problem.message).toBe(problem.detail);
    expect(problem.type).toBe("https://ripetiflow.app/errors/validation");
    expect(problem.fieldErrors).toEqual({
      end_time: "L'orario di fine deve essere successivo a quello di inizio.",
      date: "Data non valida (formato AAAA-MM-GG).",
    });
    expect(problem.fieldError("end_time")).toMatch(/fine/);
    expect(problem.fieldError("topic")).toBeUndefined();
    expect(problem.isValidation).toBe(true);
  });

  it("uses the HTTP status for anything that is not a problem document", () => {
    for (const body of [undefined, null, "Bad Gateway", 42, ["x"]]) {
      const problem = ApiProblem.fromBody(502, body);
      expect(problem.code).toBe("upstream_error");
      expect(problem.title).toBe("Servizio esterno non disponibile");
      expect(problem.fieldErrors).toEqual({});
    }
  });

  it("fills missing or empty fields with Italian defaults", () => {
    const problem = ApiProblem.fromBody(409, { detail: "", errors: "not a list" });
    expect(problem.code).toBe("conflict");
    expect(problem.title).toBe("Conflitto");
    expect(problem.detail).toBe("Conflitto con i dati esistenti.");
    expect(problem.type).toBe("about:blank");
  });

  it("ignores malformed items in errors[]", () => {
    const problem = ApiProblem.fromBody(422, {
      code: "validation_error",
      detail: "x",
      errors: [
        null,
        { field: "a" },
        { message: "m" },
        { field: "", message: "m" },
        { field: "b", message: "ok" },
      ],
    });
    expect(problem.fieldErrors).toEqual({ b: "ok" });
  });

  it("maps unknown 4xx and 5xx statuses", () => {
    expect(ApiProblem.fromBody(418, undefined).code).toBe("validation_error");
    expect(ApiProblem.fromBody(500, undefined).code).toBe("internal_error");
    expect(ApiProblem.fromBody(504, undefined).code).toBe("internal_error");
    expect(ApiProblem.fromBody(429, undefined).detail).toMatch(/limite/);
    expect(ApiProblem.fromBody(401, undefined).code).toBe("unauthorized");
  });

  it("keeps the API's own code even when unknown to the client", () => {
    expect(ApiProblem.fromBody(400, { code: "teapot" }).code).toBe("teapot");
  });
});

describe("ApiProblem.fromResponse", () => {
  it("parses a problem+json response without consuming it", async () => {
    const response = new Response(
      JSON.stringify({
        status: 404,
        code: "not_found",
        title: "Non trovato",
        detail: "Studente non trovato.",
      }),
      { status: 404, headers: PROBLEM_HEADERS },
    );
    const problem = await ApiProblem.fromResponse(response);
    expect(problem.status).toBe(404);
    expect(problem.detail).toBe("Studente non trovato.");
    expect(response.bodyUsed).toBe(false);
  });

  it("survives HTML and empty bodies", async () => {
    const html = await ApiProblem.fromResponse(
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );
    expect(html.code).toBe("upstream_error");
    const empty = await ApiProblem.fromResponse(new Response(null, { status: 503 }));
    expect(empty.code).toBe("unavailable");
  });
});

describe("ApiProblem.network", () => {
  it("represents a request that never got an answer", () => {
    const cause = new TypeError("Failed to fetch");
    const problem = ApiProblem.network(cause);
    expect(problem.status).toBe(0);
    expect(problem.code).toBe("network_error");
    expect(problem.detail).toMatch(/connessione/);
    expect(problem.cause).toBe(cause);
  });
});

describe("errorMessage", () => {
  it("shows Italian text only", () => {
    expect(
      errorMessage(ApiProblem.fromBody(409, { detail: "Archivia invece di eliminare." })),
    ).toBe("Archivia invece di eliminare.");
    expect(errorMessage(new UserFacingError("Inserisci un indirizzo email valido."))).toBe(
      "Inserisci un indirizzo email valido.",
    );
    expect(errorMessage(new Error("Cannot read properties of undefined"))).toBe(
      "Qualcosa è andato storto. Riprova tra poco.",
    );
    expect(isApiProblem(new Error("x"))).toBe(false);
  });
});
