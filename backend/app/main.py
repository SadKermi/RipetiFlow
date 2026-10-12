"""Application factory: API under /api, SPA static files at / (D-02).

Run with:  uvicorn app.main:create_app --factory
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, FastAPI, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, JSONResponse, Response

from app import __version__
from app.api.deps import PROBLEM_RESPONSES
from app.api.v1 import assistant as assistant_api
from app.api.v1 import calendar as calendar_api
from app.api.v1 import core as core_api
from app.api.v1 import lessons as lessons_api
from app.api.v1 import students as students_api
from app.assistant.providers import AssistantProvider, build_provider
from app.calendar.crypto import TokenCipher
from app.calendar.google import GoogleCalendarApi, HttpGoogleCalendar
from app.calendar.sync import CalendarSync
from app.core.auth import JwksCache, TokenVerifier
from app.core.errors import PROBLEM_MEDIA_TYPE, install_error_handlers, problem_response
from app.core.settings import Settings, get_settings
from app.db.pool import Database, create_pool
from app.schemas import Health

logger = logging.getLogger("ripetiflow")

_SPA_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


def _build_calendar(
    settings: Settings, db: Database, http: httpx.AsyncClient, google: GoogleCalendarApi | None
) -> CalendarSync:
    """Calendar sync is optional (D-31): without the Google client and the key it is just off."""
    cipher = None
    if settings.calendar_sync_available and settings.token_encryption_key is not None:
        cipher = TokenCipher(settings.token_encryption_key.get_secret_value())
        if google is None and settings.google_client_secret is not None:
            google = HttpGoogleCalendar(
                http, settings.google_client_id, settings.google_client_secret.get_secret_value()
            )
    return CalendarSync(
        db,
        google if cipher is not None else None,
        cipher,
        settings.public_app_url,
        settings.calendar_worker_interval_seconds,
    )


def _build_assistant(settings: Settings) -> AssistantProvider | None:
    """A broken assistant configuration must not take the ledger down: Matita answers 503."""
    try:
        return build_provider(settings)
    except Exception:
        logger.exception("Matita disabled: the assistant provider could not be configured")
        return None


def create_app(
    settings: Settings | None = None,
    *,
    google: GoogleCalendarApi | None = None,
    assistant_provider: AssistantProvider | None = None,
) -> FastAPI:
    """`google` and `assistant_provider` let tests inject fakes (no network in tests)."""
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper())

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = await create_pool(settings.database_url, settings.db_pool_min_size, settings.db_pool_max_size)
        http = httpx.AsyncClient(timeout=20.0)
        calendar: CalendarSync | None = None
        try:
            db = Database(pool)
            app.state.db = db
            app.state.http = http
            app.state.verifier = TokenVerifier(settings, JwksCache(settings.jwks_url, http))
            calendar = _build_calendar(settings, db, http, google)
            app.state.calendar = calendar
            app.state.calendar_worker = calendar if calendar.available else None
            app.state.assistant_provider = assistant_provider or _build_assistant(settings)
            if settings.calendar_worker_enabled:
                calendar.start()
            yield
        finally:
            if calendar is not None:
                await calendar.stop()
            await http.aclose()
            await pool.close()

    dev = not settings.is_production
    app = FastAPI(
        title="RipetiFlow API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if dev else None,
        openapi_url="/api/openapi.json" if dev else None,
        redoc_url=None,
    )
    app.state.settings = settings
    install_error_handlers(app)

    @app.get("/api/health", response_model=Health, tags=["public"])
    async def health(request: Request) -> JSONResponse:
        ok = await request.app.state.db.ping()
        body = Health(status="ok" if ok else "error", version=__version__, db="ok" if ok else "error")
        return JSONResponse(body.model_dump(), status_code=200 if ok else 503)

    public = APIRouter(prefix="/api/v1")
    public.include_router(core_api.public_router)
    app.include_router(public)

    v1 = APIRouter(prefix="/api/v1", responses=PROBLEM_RESPONSES)
    v1.include_router(core_api.router)
    v1.include_router(students_api.router)
    v1.include_router(lessons_api.router)
    v1.include_router(calendar_api.router)
    v1.include_router(assistant_api.router)
    if settings.dev_auth_enabled:
        # D-30: demo routes exist only in development with DEV_AUTH=1 (and a local database).
        from app.api.v1 import dev as dev_api

        v1.include_router(dev_api.router)
    app.include_router(v1)

    customize_openapi(app)
    if settings.static_dir is not None and settings.static_dir.is_dir():
        mount_spa(app, settings.static_dir)
    return app


def customize_openapi(app: FastAPI) -> None:
    """Document error bodies as application/problem+json (what the server really sends)."""

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        for operations in schema.get("paths", {}).values():
            for operation in operations.values():
                for status, response in operation.get("responses", {}).items():
                    content = response.get("content")
                    if not status.isdigit() or int(status) < 400 or not content:
                        continue
                    body = content.pop("application/json", None)
                    if body is not None:
                        content[PROBLEM_MEDIA_TYPE] = body
        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]


def mount_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve the built SPA; unknown non-file paths fall back to index.html (client routing).

    Registered for every method so that a wrong call under /api answers 404, not 405.
    """
    root = static_dir.resolve()
    index = root / "index.html"

    @app.api_route("/{full_path:path}", methods=_SPA_METHODS, include_in_schema=False)
    async def spa(request: Request, full_path: str) -> Response:
        if full_path == "api" or full_path.startswith("api/") or request.method not in ("GET", "HEAD"):
            return problem_response("not_found", "La risorsa richiesta non esiste.")
        if full_path:
            if "\x00" in full_path:
                return problem_response("not_found", "File non trovato.")
            try:
                candidate = (root / full_path).resolve()
            except (OSError, ValueError):
                return problem_response("not_found", "File non trovato.")
            if candidate.is_relative_to(root) and candidate.is_file():
                immutable = full_path.startswith("assets/")
                cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache})
            if Path(full_path).suffix:  # a missing file is a 404, not the app shell
                return problem_response("not_found", "File non trovato.")
        if not index.is_file():
            return problem_response("not_found", "La risorsa richiesta non esiste.")
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
