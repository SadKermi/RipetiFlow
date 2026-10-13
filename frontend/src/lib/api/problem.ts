// RFC 9457 problem details (docs/05-api.md "Convenzioni"): every non-2xx answer of the API is an
// `application/problem+json` body with Italian `title`/`detail` ready for the UI. ApiProblem is the
// one error type the data layer throws, so components only ever handle this.
import type { components } from "./schema";

export type ProblemBody = components["schemas"]["Problem"];

/** `code` values of docs/05, plus `network_error` for requests that never reached the API. */
export type ProblemCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "validation_error"
  | "rate_limited"
  | "internal_error"
  | "upstream_error"
  | "unavailable"
  | "network_error"
  | (string & {});

const FALLBACK: Record<number, { code: ProblemCode; title: string; detail: string }> = {
  0: {
    code: "network_error",
    title: "Connessione assente",
    detail: "Non riesco a contattare RipetiFlow. Controlla la connessione e riprova.",
  },
  400: { code: "validation_error", title: "Richiesta non valida", detail: "Richiesta non valida." },
  401: {
    code: "unauthorized",
    title: "Accesso richiesto",
    detail: "La sessione è scaduta: accedi di nuovo.",
  },
  403: {
    code: "forbidden",
    title: "Operazione non consentita",
    detail: "Non hai i permessi per questa operazione.",
  },
  404: { code: "not_found", title: "Non trovato", detail: "Elemento non trovato." },
  405: {
    code: "method_not_allowed",
    title: "Metodo non consentito",
    detail: "Operazione non supportata.",
  },
  409: { code: "conflict", title: "Conflitto", detail: "Conflitto con i dati esistenti." },
  422: { code: "validation_error", title: "Dati non validi", detail: "Controlla i dati inseriti." },
  429: {
    code: "rate_limited",
    title: "Troppe richieste",
    detail: "Hai raggiunto il limite di richieste: riprova più tardi.",
  },
  502: {
    code: "upstream_error",
    title: "Servizio esterno non disponibile",
    detail: "Un servizio esterno non risponde: riprova tra poco.",
  },
  503: {
    code: "unavailable",
    title: "Servizio non disponibile",
    detail: "Il servizio non è disponibile in questo momento.",
  },
};

const GENERIC_SERVER = {
  code: "internal_error",
  title: "Errore interno",
  detail: "Qualcosa è andato storto. Riprova tra poco.",
} as const;

function fallbackFor(status: number): { code: ProblemCode; title: string; detail: string } {
  return FALLBACK[status] ?? (status >= 500 ? GENERIC_SERVER : FALLBACK[400]!);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export class ApiProblem extends Error {
  override readonly name = "ApiProblem";
  readonly status: number;
  readonly code: ProblemCode;
  readonly title: string;
  readonly detail: string;
  readonly type: string;
  /** First message for each field of `errors[]` (e.g. `{end_time: "L'orario di fine…"}`). */
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(init: {
    status: number;
    code: ProblemCode;
    title: string;
    detail: string;
    type?: string;
    fieldErrors?: Record<string, string>;
    cause?: unknown;
  }) {
    super(init.detail, init.cause === undefined ? undefined : { cause: init.cause });
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.type = init.type ?? "about:blank";
    this.fieldErrors = Object.freeze({ ...init.fieldErrors });
  }

  /** Builds the error from a parsed body; anything that is not a problem document gets Italian defaults. */
  static fromBody(status: number, body: unknown): ApiProblem {
    const fallback = fallbackFor(status);
    if (!isRecord(body)) return new ApiProblem({ status, ...fallback });
    const fieldErrors: Record<string, string> = {};
    if (Array.isArray(body.errors)) {
      for (const item of body.errors) {
        if (!isRecord(item)) continue;
        const field = nonEmptyString(item.field);
        const message = nonEmptyString(item.message);
        if (field && message && !(field in fieldErrors)) fieldErrors[field] = message;
      }
    }
    return new ApiProblem({
      status,
      code: nonEmptyString(body.code) ?? fallback.code,
      title: nonEmptyString(body.title) ?? fallback.title,
      detail: nonEmptyString(body.detail) ?? fallback.detail,
      type: nonEmptyString(body.type) ?? "about:blank",
      fieldErrors,
    });
  }

  /** Reads (a clone of) a non-2xx response. Never throws: a broken body still yields a problem. */
  static async fromResponse(response: Response): Promise<ApiProblem> {
    let body: unknown = undefined;
    try {
      const text = await response.clone().text();
      body = text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      body = undefined; // HTML from a proxy, truncated body…: fall back to the status defaults
    }
    return ApiProblem.fromBody(response.status, body);
  }

  /** The request never got an HTTP answer (offline, DNS, server down behind the dev proxy). */
  static network(cause?: unknown): ApiProblem {
    return new ApiProblem({ status: 0, ...FALLBACK[0]!, cause });
  }

  /** Message for one form field, if the API rejected it. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors[field];
  }

  get isValidation(): boolean {
    return this.status === 422;
  }
}

export function isApiProblem(error: unknown): error is ApiProblem {
  return error instanceof ApiProblem;
}

/** An error raised by the SPA itself whose message is already Italian and safe to show. */
export class UserFacingError extends Error {
  override readonly name = "UserFacingError";
}

/** Text to show for any error thrown by the data or auth layer (never a raw English message). */
export function errorMessage(error: unknown): string {
  if (isApiProblem(error)) return error.detail;
  if (error instanceof UserFacingError) return error.message;
  return GENERIC_SERVER.detail;
}
