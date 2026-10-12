"""FastAPI dependencies: current user, user-scoped transaction, settings."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import Depends, Request
from pydantic import BaseModel

from app.core.auth import CurrentUser, current_user
from app.core.settings import Settings
from app.db.pool import Conn, Database, Source

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]


def get_settings_from_app(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_database(request: Request) -> Database:
    db: Database = request.app.state.db
    return db


SettingsDep = Annotated[Settings, Depends(get_settings_from_app)]
DatabaseDep = Annotated[Database, Depends(get_database)]


def request_source(request: Request) -> Source:
    """`X-RipetiFlow-Source: assistant` marks writes that confirm a Matita draft."""
    value = request.headers.get("x-ripetiflow-source", "").strip().lower()
    return "assistant" if value == "assistant" else "app"


async def user_conn(request: Request, user: CurrentUserDep) -> AsyncIterator[Conn]:
    """One transaction per request, as role `authenticated` with the user's claims (D-03).

    Commits when the endpoint returns, rolls back if it raises. Function scope: the transaction
    ends before the response is sent, so a failed commit can never produce a 2xx.
    """
    db: Database = request.app.state.db
    async with db.user_tx(user, request_source(request)) as conn:
        yield conn
    if request.method not in _SAFE_METHODS:
        worker = getattr(request.app.state, "calendar_worker", None)
        if worker is not None:
            worker.kick()


UserConn = Annotated[Conn, Depends(user_conn, scope="function")]


class Problem(BaseModel):
    """RFC 9457 problem details, served as `application/problem+json`."""

    type: str
    title: str
    status: int
    detail: str
    code: str
    errors: list[dict[str, str]] | None = None


_DESCRIPTIONS = {
    401: "Accesso richiesto o sessione scaduta",
    403: "Operazione non consentita",
    404: "Risorsa non trovata",
    409: "Conflitto con i dati esistenti",
    422: "Dati non validi",
    429: "Limite di richieste raggiunto",
    502: "Servizio esterno non disponibile",
    503: "Funzione non configurata o non disponibile",
}


def problem_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI entries for error responses. `model` registers the Problem schema; the media type is
    moved from application/json to application/problem+json by `app.main.customize_openapi`."""
    return {status: {"model": Problem, "description": _DESCRIPTIONS[status]} for status in statuses}


PROBLEM_RESPONSES = problem_responses(401, 403, 404, 409, 422)
