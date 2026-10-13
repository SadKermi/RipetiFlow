"""Shared test infrastructure.

- A real PostgreSQL database per test session: the Supabase shim plus every migration, in order.
  Server from TEST_DATABASE_URL (default: the local cluster on port 54329); the database is
  created with a random name and dropped at the end.
- Real JWT verification: tokens are ES256-signed with a key generated per session and served by a
  mocked JWKS endpoint, so tests go through the same TokenVerifier as production.
- Every test creates its own users, so tests are isolated by tenant (RLS) without truncating.
"""

from __future__ import annotations

import datetime as dt
import os
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import httpx
import jwt
import pytest
from asgi_lifespan import LifespanManager
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI

from app.core.auth import JwksCache, TokenVerifier
from app.core.settings import Settings
from app.main import create_app

REPO = Path(__file__).resolve().parents[2]
SHIM = REPO / "supabase" / "tests" / "supabase_shim.sql"
MIGRATIONS = sorted((REPO / "supabase" / "migrations").glob("*.sql"))
TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_KID = "test-es256-key"


def _with_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture(scope="session")
async def database_url() -> AsyncIterator[str]:
    server = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@localhost:54329/postgres")
    name = f"rf_test_{uuid.uuid4().hex[:10]}"
    admin = await asyncpg.connect(server)
    try:
        await admin.execute(f'create database "{name}"')
    finally:
        await admin.close()
    url = _with_database(server, name)
    conn = await asyncpg.connect(url)
    try:
        await conn.execute(SHIM.read_text())
        for migration in MIGRATIONS:
            await conn.execute(migration.read_text())
    finally:
        await conn.close()
    yield url
    admin = await asyncpg.connect(server)
    try:
        await admin.execute(f'drop database if exists "{name}" with (force)')
    finally:
        await admin.close()


@pytest.fixture(scope="session")
async def db(database_url: str) -> AsyncIterator[asyncpg.Pool[asyncpg.Record]]:
    """Owner-role pool for test setup and direct assertions (bypasses RLS, like privileged_tx)."""
    pool = await asyncpg.create_pool(database_url, min_size=1, max_size=4)
    assert pool is not None
    yield pool
    await pool.close()


# ---------------------------------------------------------------------------------------------
# Auth: ES256 tokens verified through a mocked JWKS
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class SigningKey:
    private: ec.EllipticCurvePrivateKey
    jwk: dict[str, Any]


@pytest.fixture(scope="session")
def signing_key() -> SigningKey:
    private = ec.generate_private_key(ec.SECP256R1())
    public_jwk = jwt.algorithms.ECAlgorithm.to_jwk(private.public_key(), as_dict=True)
    public_jwk.update({"kid": TEST_KID, "use": "sig", "alg": "ES256"})
    return SigningKey(private=private, jwk=public_jwk)


def jwks_transport(signing_key: SigningKey, *, fail: bool = False) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if fail:
            return httpx.Response(503, text="unavailable")
        return httpx.Response(200, json={"keys": [signing_key.jwk]})

    return httpx.MockTransport(handler)


def sign_token(
    signing_key: SigningKey,
    user_id: uuid.UUID,
    email: str,
    *,
    issuer: str = f"{TEST_SUPABASE_URL}/auth/v1",
    ttl: int = 3600,
    extra: dict[str, Any] | None = None,
    headers: dict[str, Any] | None = None,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": issuer,
        "iat": now,
        "exp": now + ttl,
        **(extra or {}),
    }
    return jwt.encode(
        claims, signing_key.private, algorithm="ES256", headers={"kid": TEST_KID, **(headers or {})}
    )


@dataclass(frozen=True)
class User:
    id: uuid.UUID
    email: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def make_user(db: asyncpg.Pool[asyncpg.Record], signing_key: SigningKey) -> Callable[..., Awaitable[User]]:
    """Create a tutor in auth.users (the trigger creates profile + default subjects)."""

    async def factory(name: str = "Tutor", timezone: str | None = None) -> User:
        user_id = uuid.uuid4()
        email = f"{name.lower()}-{user_id.hex[:8]}@example.it"
        async with db.acquire() as conn:
            await conn.execute(
                "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
                user_id,
                email,
                f'{{"full_name": "{name}"}}',
            )
            if timezone:
                await conn.execute("update app.profiles set timezone = $2 where id = $1", user_id, timezone)
        return User(id=user_id, email=email, token=sign_token(signing_key, user_id, email))

    return factory


# ---------------------------------------------------------------------------------------------
# App + client
# ---------------------------------------------------------------------------------------------


def make_settings(database_url: str, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "app_env": "development",
        "database_url": database_url,
        "supabase_url": TEST_SUPABASE_URL,
        "calendar_worker_enabled": False,
        "assistant_provider": "none",
        "dev_auth": False,
        "db_pool_max_size": 4,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


AppFactory = Callable[..., Awaitable[httpx.AsyncClient]]


@pytest.fixture
async def app_client(database_url: str, signing_key: SigningKey) -> AsyncIterator[AppFactory]:
    """`await app_client(**settings_overrides, google=..., assistant_provider=...)` -> AsyncClient.

    The app's lifespan runs for the duration of the test; its TokenVerifier is swapped for one that
    reads the session's mocked JWKS.
    """
    managers: list[LifespanManager] = []
    clients: list[httpx.AsyncClient] = []
    jwks_clients: list[httpx.AsyncClient] = []

    async def factory(
        *, google: Any = None, assistant_provider: Any = None, jwks_fail: bool = False, **overrides: Any
    ) -> httpx.AsyncClient:
        settings = make_settings(database_url, **overrides)
        app: FastAPI = create_app(settings, google=google, assistant_provider=assistant_provider)
        manager = LifespanManager(app)
        await manager.__aenter__()
        managers.append(manager)
        jwks_http = httpx.AsyncClient(transport=jwks_transport(signing_key, fail=jwks_fail))
        jwks_clients.append(jwks_http)
        app.state.verifier = TokenVerifier(settings, JwksCache(settings.jwks_url, jwks_http))
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=manager.app), base_url="http://test")
        client.app = app  # type: ignore[attr-defined]  # convenient access to app.state in tests
        clients.append(client)
        return client

    yield factory
    for client in clients:
        await client.aclose()
    for jwks_http in jwks_clients:
        await jwks_http.aclose()
    for manager in reversed(managers):
        await manager.__aexit__(None, None, None)


@pytest.fixture
async def client(app_client: AppFactory) -> httpx.AsyncClient:
    return await app_client()


# ---------------------------------------------------------------------------------------------
# Small helpers for building data through the API
# ---------------------------------------------------------------------------------------------


async def create_student(
    client: httpx.AsyncClient, user: User, first_name: str = "Luca", rate_cents: int = 2000, **fields: Any
) -> dict[str, Any]:
    body = {"first_name": first_name, "hourly_rate_cents": rate_cents, **fields}
    response = await client.post("/api/v1/students", json=body, headers=user.headers)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def create_lesson(
    client: httpx.AsyncClient,
    user: User,
    student_id: str,
    day: dt.date | str,
    start: str = "15:00",
    end: str = "16:00",
    **fields: Any,
) -> dict[str, Any]:
    body = {"student_id": student_id, "date": str(day), "start_time": start, "end_time": end, **fields}
    response = await client.post("/api/v1/lessons", json=body, headers=user.headers)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def create_payment(
    client: httpx.AsyncClient,
    user: User,
    student_id: str,
    amount_cents: int,
    paid_on: dt.date | str,
    method: str = "cash",
    **fields: Any,
) -> dict[str, Any]:
    body = {"student_id": student_id, "amount_cents": amount_cents, "paid_on": str(paid_on), "method": method}
    response = await client.post("/api/v1/payments", json={**body, **fields}, headers=user.headers)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data
