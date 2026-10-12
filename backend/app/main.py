"""Application factory: API under /api, SPA static files at / (D-02).

Run with:  uvicorn app.main:create_app --factory
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import APIRouter, FastAPI, Request
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
from app.core.errors import install_error_handlers, problem_response
from app.core.settings import Settings, get_settings
from app.db.pool import Database, create_pool
from app.schemas import Health

logger = logging.getLogger("ripetiflow")


def _build_calendar(
    settings: Settings, db: Database, http: httpx.AsyncClient, google: GoogleCalendarApi | None
) -> CalendarSync:
    cipher = None
    if settings.token_encryption_key is not None:
        cipher = TokenCipher(settings.token_encryption_key.get_secret_value())
    if google is None and settings.calendar_sync_available and settings.google_client_secret is not None:
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
        db = Database(pool)
        app.state.db = db
        app.state.http = http
        app.state.verifier = TokenVerifier(settings, JwksCache(settings.jwks_url, http))
        calendar = _build_calendar(settings, db, http, google)
        app.state.calendar = calendar
        app.state.calendar_worker = calendar if calendar.available else None
        app.state.assistant_provider = assistant_provider or build_provider(settings)
        if settings.calendar_worker_enabled:
            calendar.start()
        try:
            yield
        finally:
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

    v1 = APIRouter(prefix="/api/v1", responses=PROBLEM_RESPONSES)
    v1.include_router(core_api.public_router)
    v1.include_router(core_api.router)
    v1.include_router(students_api.router)
    v1.include_router(lessons_api.router)
    v1.include_router(calendar_api.router)
    v1.include_router(assistant_api.router)
    if settings.dev_auth_enabled:
        # D-30: demo routes exist only in development with DEV_AUTH=1.
        from app.api.v1 import dev as dev_api

        v1.include_router(dev_api.router)
    app.include_router(v1)

    if settings.static_dir is not None and settings.static_dir.is_dir():
        mount_spa(app, settings.static_dir)
    return app


def mount_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve the built SPA; unknown non-file paths fall back to index.html (client routing)."""
    root = static_dir.resolve()
    index = root / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> Response:
        if full_path == "api" or full_path.startswith("api/"):
            return problem_response("not_found", "La risorsa richiesta non esiste.")
        if full_path:
            candidate = (root / full_path).resolve()
            if candidate.is_relative_to(root) and candidate.is_file():
                immutable = full_path.startswith("assets/")
                cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache})
            if Path(full_path).suffix:  # a missing file is a 404, not the app shell
                return problem_response("not_found", "File non trovato.")
        if not index.is_file():
            return problem_response("not_found", "La risorsa richiesta non esiste.")
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
