"""RFC 9457 problem details and the mapping from Postgres errors to API errors."""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import asyncpg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("ripetiflow.errors")

PROBLEM_MEDIA_TYPE = "application/problem+json"

# code -> (status, url slug, Italian title)
_CODES: dict[str, tuple[int, str, str]] = {
    "unauthorized": (401, "unauthorized", "Accesso richiesto"),
    "forbidden": (403, "forbidden", "Operazione non consentita"),
    "not_found": (404, "not-found", "Non trovato"),
    "method_not_allowed": (405, "method-not-allowed", "Metodo non consentito"),
    "conflict": (409, "conflict", "Conflitto"),
    "validation_error": (422, "validation", "Dati non validi"),
    "rate_limited": (429, "rate-limited", "Troppe richieste"),
    "internal_error": (500, "internal", "Errore interno"),
    "upstream_error": (502, "upstream", "Servizio esterno non disponibile"),
    "unavailable": (503, "unavailable", "Servizio non disponibile"),
}


@dataclass(frozen=True)
class FieldError:
    field: str
    message: str


@dataclass(eq=False)
class ApiError(Exception):
    code: str
    detail: str
    errors: Sequence[FieldError] = field(default_factory=tuple)
    headers: dict[str, str] | None = None

    @property
    def status(self) -> int:
        return _CODES[self.code][0]

    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"


def not_found(detail: str = "Elemento non trovato.") -> ApiError:
    return ApiError("not_found", detail)


def conflict(detail: str, field_name: str | None = None) -> ApiError:
    errors = (FieldError(field_name, detail),) if field_name else ()
    return ApiError("conflict", detail, errors)


def invalid(detail: str, field_name: str | None = None) -> ApiError:
    errors = (FieldError(field_name, detail),) if field_name else ()
    return ApiError("validation_error", detail, errors)


def invalid_many(errors: Sequence[FieldError]) -> ApiError:
    return ApiError("validation_error", errors[0].message, tuple(errors))


def problem_response(
    code: str,
    detail: str,
    errors: Sequence[FieldError] = (),
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    status, slug, title = _CODES[code]
    body: dict[str, Any] = {
        "type": f"https://ripetiflow.app/errors/{slug}",
        "title": title,
        "status": status,
        "detail": detail,
        "code": code,
    }
    if errors:
        body["errors"] = [{"field": e.field, "message": e.message} for e in errors]
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE, headers=headers)


# ---------------------------------------------------------------------------------------------
# Postgres -> API
# ---------------------------------------------------------------------------------------------

_TABLES = ("profiles", "subjects", "students", "student_rates", "lessons", "payments")

_CHECK_MESSAGES: dict[str, tuple[str, str]] = {
    "lessons_time_order": ("end_time", "L'orario di fine deve essere successivo a quello di inizio."),
    "lessons_whole_minutes": ("start_time", "Gli orari devono essere espressi in minuti interi."),
    "payments_amount_cents_check": (
        "amount_cents",
        "L'importo deve essere compreso tra 0,01 € e 100.000,00 €.",
    ),
    "payments_method_check": ("method", "Metodo di pagamento non valido."),
}

_UNIQUE_MESSAGES: dict[str, tuple[str, str]] = {
    "subjects_tutor_name_key": ("name", "Esiste già una materia con questo nome."),
    "student_rates_student_day_key": (
        "effective_from",
        "Esiste già una tariffa con questa data di decorrenza.",
    ),
}

_STUDENT_IN_USE = "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo."


def _check_field(constraint: str) -> str | None:
    for table in sorted(_TABLES, key=len, reverse=True):
        prefix = f"{table}_"
        if constraint.startswith(prefix) and constraint.endswith("_check"):
            return constraint[len(prefix) : -len("_check")] or None
    return None


def map_pg_error(exc: asyncpg.PostgresError) -> ApiError | None:
    """Translate the database errors a user can cause; None means "unexpected" (500)."""
    constraint = getattr(exc, "constraint_name", None) or ""
    if isinstance(exc, asyncpg.ForeignKeyViolationError):
        message = str(getattr(exc, "message", "") or exc)
        if constraint in ("lessons_student_fkey", "payments_student_fkey"):
            if message.startswith("update or delete"):
                return conflict(_STUDENT_IN_USE)
            return invalid("Studente non trovato.", "student_id")
        if constraint in ("lessons_subject_fkey",):
            return invalid("Materia non trovata.", "subject_id")
        if constraint == "students_default_subject_fkey":
            return invalid("Materia non trovata.", "default_subject_id")
        return conflict("L'elemento è collegato ad altri dati e non può essere modificato così.")
    if isinstance(exc, asyncpg.UniqueViolationError):
        if constraint in _UNIQUE_MESSAGES:
            field_name, msg = _UNIQUE_MESSAGES[constraint]
            return conflict(msg, field_name)
        return conflict("Esiste già un elemento con questi dati.")
    if isinstance(exc, asyncpg.CheckViolationError):
        if constraint in _CHECK_MESSAGES:
            field_name, msg = _CHECK_MESSAGES[constraint]
            return invalid(msg, field_name)
        field_name = _check_field(constraint) or "body"
        return invalid("Valore non valido.", field_name)
    if isinstance(exc, asyncpg.NotNullViolationError):
        column = getattr(exc, "column_name", None) or "body"
        return invalid("Campo obbligatorio.", column)
    if isinstance(exc, asyncpg.RaiseError) and getattr(exc, "hint", None) == "RF_NO_RATE":
        return invalid("Lo studente non ha una tariffa.", "hourly_rate_cents")
    if isinstance(exc, asyncpg.InsufficientPrivilegeError):
        return ApiError("forbidden", "Non hai i permessi per questa operazione.")
    if isinstance(exc, asyncpg.DataError):
        return invalid("Valore non valido.")
    return None


# ---------------------------------------------------------------------------------------------
# Request validation errors in Italian
# ---------------------------------------------------------------------------------------------

_PYDANTIC_MESSAGES: dict[str, str] = {
    "missing": "Campo obbligatorio.",
    "string_type": "Deve essere un testo.",
    "int_type": "Deve essere un numero intero.",
    "int_parsing": "Deve essere un numero intero.",
    "int_from_float": "Deve essere un numero intero.",
    "bool_type": "Deve essere vero o falso.",
    "bool_parsing": "Deve essere vero o falso.",
    "date_type": "Data non valida (formato AAAA-MM-GG).",
    "date_parsing": "Data non valida (formato AAAA-MM-GG).",
    "date_from_datetime_parsing": "Data non valida (formato AAAA-MM-GG).",
    "date_from_datetime_inexact": "Data non valida (formato AAAA-MM-GG).",
    "uuid_type": "Identificativo non valido.",
    "uuid_parsing": "Identificativo non valido.",
    "json_invalid": "JSON non valido.",
    "model_type": "Formato non valido.",
    "model_attributes_type": "Formato non valido.",
    "list_type": "Deve essere un elenco.",
    "dict_type": "Formato non valido.",
    "extra_forbidden": "Campo non previsto.",
}


def _pydantic_message(err: dict[str, Any]) -> str:
    kind = str(err.get("type", ""))
    ctx = err.get("ctx") or {}
    if kind == "value_error":
        raw = str(err.get("msg", ""))
        return re.sub(r"^Value error, ", "", raw)
    if kind in _PYDANTIC_MESSAGES:
        return _PYDANTIC_MESSAGES[kind]
    if kind == "string_too_long":
        return f"Testo troppo lungo (massimo {ctx.get('max_length')} caratteri)."
    if kind == "string_too_short":
        return "Campo obbligatorio." if ctx.get("min_length") == 1 else "Testo troppo corto."
    if kind in ("greater_than_equal", "greater_than"):
        return f"Il valore minimo è {ctx.get('ge', ctx.get('gt'))}."
    if kind in ("less_than_equal", "less_than"):
        return f"Il valore massimo è {ctx.get('le', ctx.get('lt'))}."
    if kind in ("literal_error", "enum"):
        return f"Valore non ammesso (valori possibili: {ctx.get('expected')})."
    if kind in ("too_long",):
        return f"Troppi elementi (massimo {ctx.get('max_length')})."
    if kind in ("too_short",):
        return f"Servono almeno {ctx.get('min_length')} elementi."
    if kind == "string_pattern_mismatch":
        return "Formato non valido."
    return "Valore non valido."


def _field_name(loc: Sequence[Any]) -> str:
    parts = [str(p) for p in loc]
    if parts and parts[0] in ("body", "query", "path", "header"):
        parts = parts[1:]
    # Discriminated unions add the tag to the location; it is noise for the UI.
    return ".".join(parts) or "body"


def validation_errors(errors: Sequence[Any]) -> list[FieldError]:
    return [FieldError(_field_name(e.get("loc", ())), _pydantic_message(e)) for e in errors]


# ---------------------------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------------------------


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return problem_response(exc.code, exc.detail, exc.errors, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = validation_errors(list(exc.errors()))
        detail = errors[0].message if errors else "Controlla i dati inseriti."
        return problem_response("validation_error", detail, errors)

    @app.exception_handler(asyncpg.PostgresError)
    async def _postgres(request: Request, exc: asyncpg.PostgresError) -> JSONResponse:
        mapped = map_pg_error(exc)
        if mapped is None:
            logger.exception("unexpected database error on %s %s", request.method, request.url.path)
            return problem_response("internal_error", "Si è verificato un errore imprevisto. Riprova.")
        return problem_response(mapped.code, mapped.detail, mapped.errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return problem_response("not_found", "La risorsa richiesta non esiste.")
        if exc.status_code == 405:
            return problem_response("method_not_allowed", "Metodo non consentito per questa risorsa.")
        if exc.status_code == 401:
            return problem_response("unauthorized", "Accesso richiesto.")
        logger.warning("unhandled HTTP status %s", exc.status_code)
        return problem_response("internal_error", "Si è verificato un errore imprevisto. Riprova.")

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return problem_response("internal_error", "Si è verificato un errore imprevisto. Riprova.")
