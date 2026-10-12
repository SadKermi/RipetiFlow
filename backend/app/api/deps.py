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
    type: str
    title: str
    status: int
    detail: str
    code: str
    errors: list[dict[str, str]] | None = None


PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {"model": Problem, "content": {"application/problem+json": {}}}
    for status in (401, 403, 404, 409, 422)
}
