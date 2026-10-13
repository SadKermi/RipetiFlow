"""Core: authentication (D-04, D-30), JWKS cache, dev routes, settings guards, problem+json errors,
OpenAPI, SPA serving (D-02), profile, subjects (D-14) and the public config (docs/05-api.md).

Everything runs offline: JWKS answers come from httpx.MockTransport, the assistant provider is a
fake and Google is never contacted.
"""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
import json
import re
import time
import uuid
import zoneinfo
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import asyncpg
import httpx
import jwt
import pytest
from asgi_lifespan import LifespanManager
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI
from pydantic import ValidationError

from app.assistant.providers.fake import FakeProvider
from app.core.auth import JwksCache, JwksUnavailableError, issue_dev_token
from app.core.errors import ApiError
from app.core.settings import (
    DEFAULT_DEV_JWT_SECRET,
    DEV_DEMO_EMAIL,
    DEV_DEMO_USER_ID,
    DEV_JWT_ISSUER,
    Settings,
)
from app.main import create_app
from tests.conftest import (
    TEST_KID,
    TEST_SUPABASE_URL,
    AppFactory,
    SigningKey,
    User,
    create_lesson,
    create_student,
    make_settings,
    sign_token,
)

API = "/api/v1"
JWKS_URL = f"{TEST_SUPABASE_URL}/auth/v1/.well-known/jwks.json"

TITLES = {
    401: "Accesso richiesto",
    404: "Non trovato",
    405: "Metodo non consentito",
    409: "Conflitto",
    422: "Dati non validi",
    502: "Servizio esterno non disponibile",
}
SLUGS = {
    401: "unauthorized",
    404: "not-found",
    405: "method-not-allowed",
    409: "conflict",
    422: "validation",
    502: "upstream",
}

LOGIN_REQUIRED = "Accesso richiesto: effettua il login."
SESSION_INVALID = "Sessione non valida o scaduta. Accedi di nuovo."
JWKS_DOWN = "Impossibile verificare la sessione. Riprova."
RESOURCE_MISSING = "La risorsa richiesta non esiste."
FILE_MISSING = "File non trovato."
SUBJECT_NOT_FOUND = "Materia non trovata."
DUPLICATE_SUBJECT = "Esiste già una materia con questo nome."
BAD_TIMEZONE = "Fuso orario non valido (es. Europe/Rome)."
REQUIRED = "Campo obbligatorio."

DEFAULT_SUBJECTS = [
    "Matematica",
    "Fisica",
    "Chimica",
    "Scienze",
    "Italiano",
    "Latino",
    "Inglese",
    "Storia",
    "Filosofia",
    "Informatica",
]
PROFILE_KEYS = {
    "id",
    "email",
    "full_name",
    "timezone",
    "default_lesson_minutes",
    "default_hourly_rate_cents",
    "created_at",
}
SUBJECT_KEYS = {"id", "name", "position", "archived"}
PUBLIC_CONFIG_KEYS = {
    "supabase_url",
    "supabase_publishable_key",
    "google_login_enabled",
    "magic_link_enabled",
    "dev_auth_enabled",
    "calendar_sync_available",
    "assistant_available",
}


# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------


def assert_problem(
    response: httpx.Response,
    status: int,
    code: str,
    detail: str | None = None,
    field: str | None = None,
) -> dict[str, Any]:
    """RFC 9457 body with exactly the documented keys (`errors` only when there are field errors)."""
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == "application/problem+json"
    body: dict[str, Any] = response.json()
    expected_keys = {"type", "title", "status", "detail", "code"}
    assert set(body) in (expected_keys, expected_keys | {"errors"}), body
    assert body["status"] == status
    assert body["code"] == code
    assert body["type"] == f"https://ripetiflow.app/errors/{SLUGS[status]}"
    assert body["title"] == TITLES[status]
    if detail is not None:
        assert body["detail"] == detail
    if field is not None:
        assert {"field": field, "message": body["detail"]} in body["errors"], body
    return body


def assert_unauthorized(response: httpx.Response, detail: str = SESSION_INVALID) -> None:
    body = assert_problem(response, 401, "unauthorized", detail)
    assert "errors" not in body
    assert response.headers["www-authenticate"] == "Bearer"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def with_header(token: str, header: dict[str, Any]) -> str:
    """Same payload and signature, different (unsigned) header segment."""
    _, payload, signature = token.split(".")
    return f"{b64url(json.dumps(header).encode())}.{payload}.{signature}"


def dev_token(
    sub: uuid.UUID | str,
    *,
    secret: str = DEFAULT_DEV_JWT_SECRET,
    issuer: str = DEV_JWT_ISSUER,
    **extra: Any,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": str(sub),
        "email": DEV_DEMO_EMAIL,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": issuer,
        "iat": now,
        "exp": now + 3600,
        **extra,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def rome_today() -> dt.date:
    return dt.datetime.now(ZoneInfo("Europe/Rome")).date()


def settings(**values: Any) -> Settings:
    """Settings from explicit values only (no .env file)."""
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@asynccontextmanager
async def open_client(database_url: str, **overrides: Any) -> AsyncIterator[httpx.AsyncClient]:
    """An app with arbitrary settings (app_client reserves the `assistant_provider` keyword)."""
    app: FastAPI = create_app(make_settings(database_url, **overrides), assistant_provider=FakeProvider([]))
    async with (
        LifespanManager(app) as manager,
        httpx.AsyncClient(transport=httpx.ASGITransport(app=manager.app), base_url="http://test") as client,
    ):
        yield client


async def raw_get(app: Any, path: str) -> tuple[int, dict[str, str], bytes]:
    """GET with the path exactly as given: httpx would normalize `..` segments away."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"test")],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    }
    sent: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    await app(scope, receive, send)
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    return start["status"], headers, body


async def get_subjects(
    client: httpx.AsyncClient, user: User, include_archived: bool | None = None
) -> list[dict[str, Any]]:
    params = {} if include_archived is None else {"include_archived": str(include_archived).lower()}
    response = await client.get(f"{API}/subjects", params=params, headers=user.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    items: list[dict[str, Any]] = body["items"]
    return items


async def subject_named(client: httpx.AsyncClient, user: User, name: str) -> dict[str, Any]:
    return next(s for s in await get_subjects(client, user, True) if s["name"] == name)


# ---------------------------------------------------------------------------------------------
# Authentication through the API
# ---------------------------------------------------------------------------------------------


async def test_missing_authorization_is_401_problem(client) -> None:
    response = await client.get(f"{API}/me")
    assert_unauthorized(response, LOGIN_REQUIRED)


@pytest.mark.parametrize(
    "authorization",
    ["", "Bearer", "Bearer    ", "Basic dXNlcjpwYXNz", "Token abc.def.ghi", "abc.def.ghi"],
)
async def test_malformed_authorization_header_asks_to_log_in(client, authorization: str) -> None:
    response = await client.get(f"{API}/me", headers={"Authorization": authorization})
    assert_unauthorized(response, LOGIN_REQUIRED)


@pytest.mark.parametrize("token", ["not-a-jwt", "a.b.c", "....", "e30.e30.e30"])
async def test_garbage_bearer_token_is_session_invalid(client, token: str) -> None:
    response = await client.get(f"{API}/me", headers=bearer(token))
    assert_unauthorized(response)


async def test_valid_token_with_lowercase_scheme_is_accepted(client, make_user) -> None:
    user = await make_user("Anna")
    response = await client.get(f"{API}/me", headers={"Authorization": f"bearer {user.token}"})
    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(user.id)


async def test_expired_token_is_401(client, make_user, signing_key: SigningKey) -> None:
    user = await make_user()
    token = sign_token(signing_key, user.id, user.email, ttl=-120)  # past the 30 s leeway
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


async def test_token_within_leeway_is_accepted(client, make_user, signing_key: SigningKey) -> None:
    user = await make_user()
    token = sign_token(signing_key, user.id, user.email, ttl=-5)
    response = await client.get(f"{API}/me", headers=bearer(token))
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(
    "extra",
    [
        {"aud": "anon"},
        {"aud": "service_role"},
        {"role": "anon"},
        {"role": "service_role"},
        {"role": None},
        {"sub": "not-a-uuid"},
    ],
    ids=["aud-anon", "aud-service", "role-anon", "role-service", "role-missing", "sub-not-uuid"],
)
async def test_wrong_claims_are_401(
    client, make_user, signing_key: SigningKey, extra: dict[str, Any]
) -> None:
    user = await make_user()
    token = sign_token(signing_key, user.id, user.email, extra=extra)
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


async def test_wrong_issuer_is_401(client, make_user, signing_key: SigningKey) -> None:
    user = await make_user()
    for issuer in ("https://other-project.supabase.co/auth/v1", TEST_SUPABASE_URL, DEV_JWT_ISSUER):
        token = sign_token(signing_key, user.id, user.email, issuer=issuer)
        assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


async def test_missing_required_claim_is_401(client, make_user, signing_key: SigningKey) -> None:
    user = await make_user()
    now = int(time.time())
    base = {
        "sub": str(user.id),
        "role": "authenticated",
        "aud": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "exp": now + 600,
    }
    for missing in ("exp", "sub", "aud", "iss"):
        claims = {k: v for k, v in base.items() if k != missing}
        token = jwt.encode(claims, signing_key.private, algorithm="ES256", headers={"kid": TEST_KID})
        assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


async def test_unknown_or_missing_kid_is_401(client, make_user, signing_key: SigningKey) -> None:
    user = await make_user()
    unknown = sign_token(signing_key, user.id, user.email, headers={"kid": "rotated-away"})
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(unknown)))
    no_kid = with_header(user.token, {"alg": "ES256", "typ": "JWT"})
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(no_kid)))
    numeric_kid = with_header(user.token, {"alg": "ES256", "typ": "JWT", "kid": 7})
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(numeric_kid)))


async def test_token_signed_by_another_key_is_401(client, make_user) -> None:
    user = await make_user()
    impostor = SigningKey(private=ec.generate_private_key(ec.SECP256R1()), jwk={})
    token = sign_token(impostor, user.id, user.email)  # same kid, different private key
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


async def test_rs256_header_on_the_ec_key_is_401_not_500(client, make_user) -> None:
    user = await make_user()
    token = with_header(user.token, {"alg": "RS256", "typ": "JWT", "kid": TEST_KID})
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


@pytest.mark.parametrize("alg", ["none", "HS512", "ES384", "PS256", ""])
async def test_unsupported_algorithms_are_401(client, make_user, alg: str) -> None:
    user = await make_user()
    token = with_header(user.token, {"alg": alg, "typ": "JWT", "kid": TEST_KID})
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer(token)))


async def test_jwks_down_without_cached_key_is_502(app_client: AppFactory, make_user) -> None:
    client = await app_client(jwks_fail=True)
    user = await make_user()
    response = await client.get(f"{API}/me", headers=user.headers)
    body = assert_problem(response, 502, "upstream_error", JWKS_DOWN)
    assert "errors" not in body
    assert "www-authenticate" not in response.headers
    # Tokens that never reach the JWKS are still plain 401s.
    assert_unauthorized(await client.get(f"{API}/me", headers=bearer("garbage")))
    assert_unauthorized(await client.get(f"{API}/me"), LOGIN_REQUIRED)


async def test_hs256_rejected_when_dev_auth_is_off(client, make_user) -> None:
    user = await make_user()
    for sub in (DEV_DEMO_USER_ID, user.id):
        assert_unauthorized(await client.get(f"{API}/me", headers=bearer(dev_token(sub))))


async def test_issue_dev_token_refuses_without_dev_auth(database_url: str) -> None:
    with pytest.raises(RuntimeError, match="DEV_AUTH=1"):
        issue_dev_token(make_settings(database_url), DEV_DEMO_EMAIL)


# ---------------------------------------------------------------------------------------------
# JwksCache (unit, MockTransport with call counters)
# ---------------------------------------------------------------------------------------------


class FakeJwks:
    """A JWKS endpoint whose answer the test switches between calls."""

    def __init__(self, *jwks: dict[str, Any]) -> None:
        self.keys: list[dict[str, Any]] = list(jwks)
        self.mode = "ok"
        self.calls = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert str(request.url) == JWKS_URL
        self.calls += 1
        if self.mode == "fail":
            return httpx.Response(503, text="unavailable")
        if self.mode == "html":
            return httpx.Response(200, text="<html>maintenance</html>", headers={"content-type": "text/html"})
        if self.mode == "list":
            return httpx.Response(200, json=self.keys)
        if self.mode == "empty":
            return httpx.Response(200, json={"keys": []})
        if self.mode == "unusable":
            valid = self.keys[0]
            no_kid = {k: v for k, v in valid.items() if k != "kid"}
            return httpx.Response(
                200,
                json={
                    "keys": [
                        {**valid, "use": "enc"},
                        no_kid,
                        {"kty": "EC", "crv": "P-256", "kid": "broken", "x": "AAAA", "y": "AAAA"},
                        {"kty": "oct", "kid": "weird", "k": 5},
                        "not-a-dict",
                    ]
                },
            )
        return httpx.Response(200, json={"keys": self.keys})

    def cache(self, ttl: float, min_refetch: float) -> tuple[JwksCache, httpx.AsyncClient]:
        http = httpx.AsyncClient(transport=httpx.MockTransport(self.handler))
        return JwksCache(JWKS_URL, http, ttl=ttl, min_refetch_interval=min_refetch), http


def other_jwk(kid: str) -> dict[str, Any]:
    private = ec.generate_private_key(ec.SECP256R1())
    jwk = jwt.algorithms.ECAlgorithm.to_jwk(private.public_key(), as_dict=True)
    jwk.update({"kid": kid, "use": "sig", "alg": "ES256"})
    return jwk


async def test_jwks_cache_reuses_keys_within_ttl(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    cache, http = server.cache(ttl=600, min_refetch=0)
    async with http:
        first = await cache.get(TEST_KID)
        for _ in range(5):
            assert await cache.get(TEST_KID) is first
    assert server.calls == 1
    assert first.algorithm_name == "ES256"


async def test_jwks_cache_refreshes_after_ttl(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    cache, http = server.cache(ttl=0.01, min_refetch=0)
    async with http:
        await cache.get(TEST_KID)
        await asyncio.sleep(0.03)
        await cache.get(TEST_KID)
    assert server.calls == 2


async def test_jwks_cache_keeps_keys_after_a_failed_refresh(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    cache, http = server.cache(ttl=0.01, min_refetch=0)
    async with http:
        key = await cache.get(TEST_KID)
        server.mode = "fail"
        await asyncio.sleep(0.03)
        assert await cache.get(TEST_KID) is key  # refresh attempted and failed: old key still valid
        assert server.calls == 2
        with pytest.raises(JwksUnavailableError):  # unknown kid while failing: cannot tell -> 502
            await cache.get("rotated-kid")
        assert server.calls == 3
        server.mode = "ok"
        await asyncio.sleep(0.03)
        assert (await cache.get(TEST_KID)).algorithm_name == "ES256"
        assert server.calls == 4
        with pytest.raises(ApiError) as excinfo:  # endpoint healthy again: unknown kid is a 401
            await cache.get("rotated-kid")
    assert excinfo.value.code == "unauthorized"
    assert excinfo.value.status == 401
    assert excinfo.value.headers == {"WWW-Authenticate": "Bearer"}


async def test_jwks_cache_throttles_refetch_for_unknown_kids(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    cache, http = server.cache(ttl=600, min_refetch=0.3)
    async with http:
        await cache.get(TEST_KID)
        assert server.calls == 1
        for _ in range(5):  # a burst of forged kids cannot hammer the endpoint
            with pytest.raises(ApiError):
                await cache.get(f"forged-{uuid.uuid4().hex}")
        assert server.calls == 1
        # Key rotation: after the throttle window the new kid is fetched and accepted.
        rotated = other_jwk("rotated-kid")
        server.keys.append(rotated)
        await asyncio.sleep(0.35)
        key = await cache.get("rotated-kid")
        assert server.calls == 2
        assert key.algorithm_name == "ES256"
        assert await cache.get(TEST_KID) is not None
        assert server.calls == 2


async def test_jwks_cache_throttles_failed_attempts(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    server.mode = "fail"
    cache, http = server.cache(ttl=600, min_refetch=0.3)
    async with http:
        for _ in range(3):
            with pytest.raises(JwksUnavailableError):
                await cache.get(TEST_KID)
        assert server.calls == 1
        server.mode = "ok"
        await asyncio.sleep(0.35)
        assert (await cache.get(TEST_KID)).algorithm_name == "ES256"
    assert server.calls == 2


async def test_jwks_cache_non_json_body_counts_as_failure(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    server.mode = "html"
    cache, http = server.cache(ttl=0.01, min_refetch=0)
    async with http:
        with pytest.raises(JwksUnavailableError):
            await cache.get(TEST_KID)
        server.mode = "ok"
        key = await cache.get(TEST_KID)
        server.mode = "html"
        await asyncio.sleep(0.03)
        assert await cache.get(TEST_KID) is key
    assert server.calls == 3


async def test_jwks_cache_never_replaces_keys_with_an_empty_set(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    cache, http = server.cache(ttl=0.01, min_refetch=0)
    async with http:
        key = await cache.get(TEST_KID)
        for mode in ("empty", "unusable", "list"):
            server.mode = mode
            await asyncio.sleep(0.03)
            assert await cache.get(TEST_KID) is key, mode
        # A well-formed (if empty) answer is not an outage: unknown kids stay 401, not 502.
        with pytest.raises(ApiError) as excinfo:
            await cache.get("missing")
    assert excinfo.value.status == 401
    assert server.calls == 5


async def test_jwks_cache_empty_answer_without_cache_is_401(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    server.mode = "unusable"
    cache, http = server.cache(ttl=600, min_refetch=0)
    async with http:
        with pytest.raises(ApiError) as excinfo:
            await cache.get(TEST_KID)
    assert excinfo.value.status == 401
    assert server.calls == 1


async def test_jwks_cache_skips_unusable_keys_but_keeps_valid_ones(signing_key: SigningKey) -> None:
    server = FakeJwks(
        {"kty": "EC", "crv": "P-256", "kid": "broken", "x": "AAAA", "y": "AAAA"},
        {**other_jwk("encryption"), "use": "enc"},
        signing_key.jwk,
    )
    cache, http = server.cache(ttl=600, min_refetch=0)
    async with http:
        assert (await cache.get(TEST_KID)).algorithm_name == "ES256"
        for kid in ("broken", "encryption"):
            with pytest.raises(ApiError):
                await cache.get(kid)


async def test_jwks_cache_concurrent_misses_fetch_once(signing_key: SigningKey) -> None:
    server = FakeJwks(signing_key.jwk)
    cache, http = server.cache(ttl=600, min_refetch=0)
    async with http:
        keys = await asyncio.gather(*(cache.get(TEST_KID) for _ in range(10)))
    assert server.calls == 1
    assert all(k is keys[0] for k in keys)


# ---------------------------------------------------------------------------------------------
# Dev auth (D-30) and dev routes
# ---------------------------------------------------------------------------------------------


@pytest.fixture
async def dev_client(app_client: AppFactory, database_url: str) -> httpx.AsyncClient:
    host = urlsplit(database_url).hostname
    if host not in {"localhost", "127.0.0.1", "::1", "postgres", "db"}:
        pytest.skip(f"DEV_AUTH needs a local test database (host {host!r})")
    return await app_client(dev_auth=True)


async def dev_login(dev_client: httpx.AsyncClient) -> str:
    response = await dev_client.post(f"{API}/dev/login")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"] == {"id": str(DEV_DEMO_USER_ID), "email": DEV_DEMO_EMAIL}
    assert set(body) == {"access_token", "user"}
    token: str = body["access_token"]
    return token


async def test_dev_routes_are_not_mounted_without_dev_auth(client) -> None:
    for path in ("/dev/login", "/dev/seed"):
        response = await client.post(f"{API}{path}")
        assert_problem(response, 404, "not_found", RESOURCE_MISSING)
    schema = (await client.get("/api/openapi.json")).json()
    assert not [p for p in schema["paths"] if p.startswith(f"{API}/dev")]


async def test_dev_login_token_works_for_the_demo_user(dev_client: httpx.AsyncClient) -> None:
    token = await dev_login(dev_client)
    header = jwt.get_unverified_header(token)
    assert header["alg"] == "HS256"
    claims = jwt.decode(token, options={"verify_signature": False})
    assert claims["sub"] == str(DEV_DEMO_USER_ID)
    assert claims["iss"] == DEV_JWT_ISSUER
    me = await dev_client.get(f"{API}/me", headers=bearer(token))
    assert me.status_code == 200, me.text
    assert me.json()["id"] == str(DEV_DEMO_USER_ID)
    assert me.json()["email"] == DEV_DEMO_EMAIL
    # Logging in again keeps the same identity.
    again = await dev_login(dev_client)
    assert (await dev_client.get(f"{API}/me", headers=bearer(again))).json()["id"] == str(DEV_DEMO_USER_ID)


async def test_dev_tokens_are_only_valid_for_the_demo_user(dev_client: httpx.AsyncClient, make_user) -> None:
    await dev_login(dev_client)
    real = await make_user("Reale")
    for sub in (real.id, uuid.uuid4()):
        assert_unauthorized(await dev_client.get(f"{API}/me", headers=bearer(dev_token(sub))))
    # Right subject, wrong secret / issuer / audience / role.
    for token in (
        dev_token(DEV_DEMO_USER_ID, secret="another-secret-that-is-long-enough-for-hs256"),
        dev_token(DEV_DEMO_USER_ID, issuer=f"{TEST_SUPABASE_URL}/auth/v1"),
        dev_token(DEV_DEMO_USER_ID, aud="anon"),
        dev_token(DEV_DEMO_USER_ID, role="service_role"),
        dev_token(DEV_DEMO_USER_ID, exp=int(time.time()) - 60),
    ):
        assert_unauthorized(await dev_client.get(f"{API}/me", headers=bearer(token)))
    ok = await dev_client.get(f"{API}/me", headers=bearer(dev_token(DEV_DEMO_USER_ID)))
    assert ok.status_code == 200, ok.text
    # Real Supabase tokens keep working in demo mode.
    assert (await dev_client.get(f"{API}/me", headers=real.headers)).json()["id"] == str(real.id)


async def test_dev_seed_creates_the_demo_ledger(
    dev_client: httpx.AsyncClient, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    token = await dev_login(dev_client)
    response = await dev_client.post(f"{API}/dev/seed", headers=bearer(token))
    assert response.status_code == 200, response.text
    result = response.json()
    assert set(result) == {"students", "lessons", "payments"}
    assert result["students"] == 6
    assert result["lessons"] > 50
    assert result["payments"] > 0

    students = await dev_client.get(f"{API}/students", headers=bearer(token))
    assert students.status_code == 200, students.text
    items = students.json()["items"]
    assert len(items) == 6
    statuses = {s["balance"]["status"] for s in items}
    assert {"debt", "credit"} <= statuses

    async def stored() -> dict[str, int]:
        async with db.acquire() as conn:
            row = await conn.fetchrow(
                """select (select count(*) from app.students where tutor_id = $1) as students,
                          (select count(*) from app.lessons where tutor_id = $1) as lessons,
                          (select count(*) from app.payments where tutor_id = $1) as payments""",
                DEV_DEMO_USER_ID,
            )
        assert row is not None
        return dict(row)

    assert await stored() == result
    # Seeding again wipes and recreates: same counts, not doubled; the old token stays valid.
    again = await dev_client.post(f"{API}/dev/seed", headers=bearer(token))
    assert again.status_code == 200, again.text
    assert again.json() == result
    assert await stored() == result
    relisted = await dev_client.get(f"{API}/students", headers=bearer(token))
    assert len(relisted.json()["items"]) == 6


# ---------------------------------------------------------------------------------------------
# Settings guards
# ---------------------------------------------------------------------------------------------


def test_dev_auth_is_refused_in_production() -> None:
    with pytest.raises(ValidationError, match="DEV_AUTH=1 non è ammesso con APP_ENV=production"):
        settings(app_env="production", dev_auth=True, database_url="postgresql://postgres@localhost/x")


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql://postgres:pw@db.abcdefghijkl.supabase.co:5432/postgres",
        "postgresql://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
        "postgresql://10.0.0.5/ripetiflow",
    ],
)
def test_dev_auth_is_refused_with_a_non_local_database(database_url: str) -> None:
    host = urlsplit(database_url).hostname
    expected = re.escape(f"DEV_AUTH=1 è ammesso solo con un database locale (host attuale: {host!r})")
    with pytest.raises(ValidationError, match=expected):
        settings(app_env="development", dev_auth=True, database_url=database_url)


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "postgres", "db"])
def test_dev_auth_is_allowed_with_a_local_database(host: str) -> None:
    value = settings(
        app_env="development", dev_auth=True, database_url=f"postgresql://postgres@{host}:5432/rf"
    )
    assert value.dev_auth_enabled is True


def test_default_app_env_is_production(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("APP_ENV", "DEV_AUTH"):
        monkeypatch.delenv(name, raising=False)
    value = settings()
    assert value.app_env == "production"
    assert value.is_production is True
    assert value.dev_auth is False
    assert value.dev_auth_enabled is False


@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
@pytest.mark.parametrize(
    "name", ["google_client_secret", "token_encryption_key", "openai_api_key", "anthropic_api_key"]
)
def test_blank_secrets_are_unset(name: str, blank: str) -> None:
    assert getattr(settings(**{name: blank}), name) is None


def test_blank_secrets_from_the_environment_are_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.setenv(name, "  ")
    value = settings()
    assert value.google_client_secret is None
    assert value.token_encryption_key is None
    assert value.openai_api_key is None
    assert value.anthropic_api_key is None


@pytest.mark.parametrize("key", ["not-a-fernet-key", "a" * 44, base64.urlsafe_b64encode(b"short").decode()])
def test_invalid_token_encryption_key_names_the_variable(key: str) -> None:
    with pytest.raises(
        ValidationError, match="TOKEN_ENCRYPTION_KEY non è una chiave Fernet valida"
    ) as excinfo:
        settings(token_encryption_key=key)
    [error] = excinfo.value.errors()
    assert error["loc"] == ("token_encryption_key",)
    assert "Fernet.generate_key()" in error["msg"]  # tells the operator how to make a valid key


def test_valid_token_encryption_key_and_calendar_availability() -> None:
    key = Fernet.generate_key().decode()
    assert settings(token_encryption_key=key).token_encryption_key is not None
    assert settings(token_encryption_key=key).calendar_sync_available is False
    complete = settings(google_client_id="cid", google_client_secret="s3cret", token_encryption_key=key)
    assert complete.calendar_sync_available is True
    assert (
        settings(
            google_client_id="cid", google_client_secret="  ", token_encryption_key=key
        ).calendar_sync_available
        is False
    )


@pytest.mark.parametrize(
    ("values", "available"),
    [
        ({"assistant_provider": "openai", "openai_api_key": ""}, False),
        ({"assistant_provider": "openai", "openai_api_key": "   "}, False),
        ({"assistant_provider": "openai"}, False),
        ({"assistant_provider": "openai", "anthropic_api_key": "sk-ant-x"}, False),
        ({"assistant_provider": "openai", "openai_api_key": "sk-test"}, True),
        ({"assistant_provider": "anthropic", "anthropic_api_key": ""}, False),
        ({"assistant_provider": "anthropic", "anthropic_api_key": " \t "}, False),
        ({"assistant_provider": "anthropic", "openai_api_key": "sk-test"}, False),
        ({"assistant_provider": "anthropic", "anthropic_api_key": "sk-ant-x"}, True),
        ({"assistant_provider": "none", "openai_api_key": "sk-test", "anthropic_api_key": "sk-ant-x"}, False),
    ],
)
def test_assistant_available(values: dict[str, Any], available: bool) -> None:
    assert settings(**values).assistant_available is available


# ---------------------------------------------------------------------------------------------
# Errors: problem+json, Italian validation messages
# ---------------------------------------------------------------------------------------------


async def test_unknown_api_path_and_wrong_method(client, make_user) -> None:
    user = await make_user()
    body = assert_problem(await client.get(f"{API}/nope", headers=user.headers), 404, "not_found")
    assert body == {
        "type": "https://ripetiflow.app/errors/not-found",
        "title": "Non trovato",
        "status": 404,
        "detail": RESOURCE_MISSING,
        "code": "not_found",
    }
    assert_problem(await client.post("/api/nope"), 404, "not_found", RESOURCE_MISSING)
    assert_problem(
        await client.delete(f"{API}/me", headers=user.headers),
        405,
        "method_not_allowed",
        "Metodo non consentito per questa risorsa.",
    )


async def test_missing_field(client, make_user) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json={}, headers=user.headers)
    body = assert_problem(response, 422, "validation_error", REQUIRED, "name")
    assert body["errors"] == [{"field": "name", "message": REQUIRED}]


@pytest.mark.parametrize("name", ["", "   ", "\t\n"])
async def test_blank_required_text(client, make_user, name: str) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json={"name": name}, headers=user.headers)
    body = assert_problem(response, 422, "validation_error", REQUIRED, "name")
    assert body["errors"] == [{"field": "name", "message": REQUIRED}]


async def test_too_long_optional_text(client, make_user) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"full_name": "x" * 121}, headers=user.headers)
    assert_problem(
        response, 422, "validation_error", "Testo troppo lungo (massimo 120 caratteri).", "full_name"
    )
    response = await client.post(
        f"{API}/students",
        json={"first_name": "Luca", "last_name": "x" * 81, "hourly_rate_cents": 2000},
        headers=user.headers,
    )
    assert_problem(
        response, 422, "validation_error", "Testo troppo lungo (massimo 80 caratteri).", "last_name"
    )


async def test_required_text_is_trimmed_before_the_length_check(client, make_user) -> None:
    user = await make_user()
    ok = await client.post(f"{API}/subjects", json={"name": f"  {'y' * 60}  "}, headers=user.headers)
    assert ok.status_code == 201, ok.text
    assert ok.json()["name"] == "y" * 60


async def test_too_long_required_text(client, make_user) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json={"name": "x" * 61}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Testo troppo lungo (massimo 60 caratteri).", "name")
    latino = await subject_named(client, user, "Latino")
    response = await client.patch(
        f"{API}/subjects/{latino['id']}", json={"name": "z" * 61}, headers=user.headers
    )
    assert_problem(response, 422, "validation_error", "Testo troppo lungo (massimo 60 caratteri).", "name")
    response = await client.post(
        f"{API}/students", json={"first_name": "x" * 81, "hourly_rate_cents": 2000}, headers=user.headers
    )
    assert_problem(
        response, 422, "validation_error", "Testo troppo lungo (massimo 80 caratteri).", "first_name"
    )


async def test_wrong_type(client, make_user) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json={"name": 5}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Deve essere un testo.", "name")


async def test_invalid_json_body(client, make_user) -> None:
    user = await make_user()
    response = await client.post(
        f"{API}/subjects",
        content=b'{"name": "Musica",',
        headers={**user.headers, "Content-Type": "application/json"},
    )
    body = assert_problem(response, 422, "validation_error", "JSON non valido.", "body")
    assert body["errors"] == [{"field": "body", "message": "JSON non valido."}]


async def test_body_of_the_wrong_shape(client, make_user) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json=["Musica"], headers=user.headers)
    assert_problem(response, 422, "validation_error", "Formato non valido.", "body")


async def test_invalid_uuid_path_param(client, make_user) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/subjects/not-a-uuid", json={}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Identificativo non valido.", "subject_id")
    response = await client.delete(f"{API}/subjects/123", headers=user.headers)
    assert_problem(response, 422, "validation_error", "Identificativo non valido.", "subject_id")


async def test_invalid_query_params(client, make_user) -> None:
    user = await make_user()
    response = await client.get(f"{API}/subjects", params={"include_archived": "forse"}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Deve essere vero o falso.", "include_archived")
    response = await client.get(f"{API}/dashboard", params={"days": 0}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Il valore minimo è 1.", "days")
    response = await client.get(f"{API}/dashboard", params={"days": 32}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Il valore massimo è 31.", "days")


async def test_invalid_enum_lists_the_allowed_values_in_italian(client, make_user) -> None:
    user = await make_user()
    student = await create_student(client, user)
    response = await client.post(
        f"{API}/payments",
        json={"student_id": student["id"], "amount_cents": 1000, "paid_on": "2026-01-10", "method": "card"},
        headers=user.headers,
    )
    body = assert_problem(
        response,
        422,
        "validation_error",
        "Valore non ammesso (valori possibili: cash, bank_transfer, other).",
        "method",
    )
    assert " or " not in body["detail"]
    assert "'" not in body["detail"]


async def test_every_invalid_field_is_reported(client, make_user) -> None:
    user = await make_user()
    response = await client.post(
        f"{API}/payments",
        json={"student_id": "nope", "amount_cents": 0, "paid_on": "10/01/2026", "method": "card"},
        headers=user.headers,
    )
    body = assert_problem(response, 422, "validation_error", "Identificativo non valido.")
    assert body["errors"] == [
        {"field": "student_id", "message": "Identificativo non valido."},
        {"field": "amount_cents", "message": "Il valore minimo è 1."},
        {"field": "paid_on", "message": "Data non valida (formato AAAA-MM-GG)."},
        {"field": "method", "message": "Valore non ammesso (valori possibili: cash, bank_transfer, other)."},
    ]


async def test_auth_runs_before_body_validation(client) -> None:
    response = await client.post(f"{API}/subjects", content=b"{broken")
    assert_unauthorized(response, LOGIN_REQUIRED)


# ---------------------------------------------------------------------------------------------
# OpenAPI
# ---------------------------------------------------------------------------------------------


async def test_openapi_documents_problem_json_errors(client) -> None:
    response = await client.get("/api/openapi.json")
    assert response.status_code == 200, response.text
    schema = response.json()
    error_responses = 0
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            for status, documented in operation["responses"].items():
                if int(status) < 400:
                    continue
                error_responses += 1
                content = documented.get("content", {})
                assert set(content) == {"application/problem+json"}, (path, method, status)
                assert content["application/problem+json"]["schema"] == {
                    "$ref": "#/components/schemas/Problem"
                }, (path, method, status)
    assert error_responses > 50
    problem = schema["components"]["schemas"]["Problem"]
    assert set(problem["required"]) == {"type", "title", "status", "detail", "code"}
    assert schema["components"]["securitySchemes"]["HTTPBearer"] == {
        "type": "http",
        "scheme": "bearer",
        "description": "Access token di Supabase Auth",
    }


async def test_openapi_route_specific_errors_and_security(client) -> None:
    paths = (await client.get("/api/openapi.json")).json()["paths"]
    assistant = paths[f"{API}/assistant/messages"]["post"]
    assert {"401", "422", "429", "502", "503"} <= set(assistant["responses"])
    assert assistant["security"] == [{"HTTPBearer": []}]

    public = paths[f"{API}/public/config"]["get"]
    assert set(public["responses"]) == {"200"}
    assert "security" not in public
    assert "401" not in paths["/api/health"]["get"]["responses"]

    me = paths[f"{API}/me"]["get"]
    assert me["security"] == [{"HTTPBearer": []}]
    assert {"401", "404"} <= set(me["responses"])


async def test_docs_are_served_in_development(client) -> None:
    response = await client.get("/api/docs")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


async def test_docs_are_disabled_in_production(app_client: AppFactory) -> None:
    client = await app_client(app_env="production")
    for path in ("/api/docs", "/api/openapi.json", "/api/redoc", "/docs", "/openapi.json"):
        assert_problem(await client.get(path), 404, "not_found", RESOURCE_MISSING)
    assert (await client.get("/api/health")).status_code == 200


# ---------------------------------------------------------------------------------------------
# SPA serving (D-02)
# ---------------------------------------------------------------------------------------------

INDEX_HTML = "<!doctype html><title>RipetiFlow</title><div id=root></div>"
APP_JS = "console.log('ripetiflow')"
SECRET = "TOP-SECRET-OUTSIDE-STATIC-DIR"


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(INDEX_HTML)
    (dist / "assets" / "app.js").write_text(APP_JS)
    (dist / "robots.txt").write_text("User-agent: *")
    (tmp_path / "secret.txt").write_text(SECRET)
    return dist


@pytest.fixture
async def spa_client(app_client: AppFactory, static_dir: Path) -> httpx.AsyncClient:
    return await app_client(static_dir=static_dir)


def assert_index(response: httpx.Response) -> None:
    assert response.status_code == 200, response.text
    assert response.text == INDEX_HTML
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["content-type"].startswith("text/html")


@pytest.mark.parametrize("path", ["/", "/studenti", "/studenti/3f2c/registro", "/oggi?x=1", "/impostazioni/"])
async def test_spa_deep_links_get_the_app_shell(spa_client: httpx.AsyncClient, path: str) -> None:
    assert_index(await spa_client.get(path))


async def test_spa_head_request(spa_client: httpx.AsyncClient) -> None:
    response = await spa_client.head("/studenti")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


async def test_spa_assets_are_immutable(spa_client: httpx.AsyncClient) -> None:
    response = await spa_client.get("/assets/app.js")
    assert response.status_code == 200
    assert response.text == APP_JS
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    robots = await spa_client.get("/robots.txt")
    assert robots.status_code == 200
    assert robots.headers["cache-control"] == "no-cache"
    index = await spa_client.get("/index.html")
    assert_index(index)


@pytest.mark.parametrize(
    "path", ["/assets/missing.js", "/favicon.ico", "/studenti/foto.png", "/assets/app.js.map"]
)
async def test_spa_missing_files_are_404(spa_client: httpx.AsyncClient, path: str) -> None:
    assert_problem(await spa_client.get(path), 404, "not_found", FILE_MISSING)


@pytest.mark.parametrize(
    "path",
    [
        "/%2e%2e/secret.txt",
        "/assets/%2e%2e/%2e%2e/secret.txt",
        "/%2E%2E/secret.txt",
        "/..%2fsecret.txt",
        "/assets/..%2F..%2Fsecret.txt",
        "/%2e%2e%2fsecret.txt",
    ],
)
async def test_spa_encoded_traversal_is_404(spa_client: httpx.AsyncClient, path: str) -> None:
    response = await spa_client.get(path)
    assert_problem(response, 404, "not_found", FILE_MISSING)
    assert SECRET not in response.text


@pytest.mark.parametrize(
    "path", ["/../secret.txt", "/assets/../../secret.txt", "/assets/../../../etc/passwd.txt"]
)
async def test_spa_raw_traversal_is_404(spa_client: httpx.AsyncClient, path: str) -> None:
    status, headers, body = await raw_get(spa_client.app, path)  # type: ignore[attr-defined]
    assert status == 404
    assert headers["content-type"] == "application/problem+json"
    assert json.loads(body)["detail"] == FILE_MISSING
    assert SECRET.encode() not in body


@pytest.mark.parametrize("path", ["/index.html%00.js", "/%00", "/assets/app.js%00", "/studenti%00"])
async def test_spa_nul_byte_is_404(spa_client: httpx.AsyncClient, path: str) -> None:
    assert_problem(await spa_client.get(path), 404, "not_found", FILE_MISSING)


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
@pytest.mark.parametrize("path", ["/api/v1/unknown", "/api/v2/students", "/api", "/api/x.json"])
async def test_spa_unknown_api_paths_are_404_for_every_method(
    spa_client: httpx.AsyncClient, method: str, path: str
) -> None:
    response = await spa_client.request(method, path, json={})
    assert_problem(response, 404, "not_found", RESOURCE_MISSING)


async def test_spa_never_serves_the_shell_for_api_or_writes(spa_client: httpx.AsyncClient, make_user) -> None:
    assert_problem(await spa_client.get("/api/v1/unknown"), 404, "not_found", RESOURCE_MISSING)
    assert_problem(await spa_client.get("/api"), 404, "not_found", RESOURCE_MISSING)
    assert_problem(await spa_client.post("/studenti", json={}), 404, "not_found", RESOURCE_MISSING)
    # Real API routes still win over the catch-all.
    assert (await spa_client.get("/api/health")).json()["db"] == "ok"
    user = await make_user()
    me = await spa_client.get(f"{API}/me", headers=user.headers)
    assert me.status_code == 200, me.text
    assert_unauthorized(await spa_client.get(f"{API}/me"), LOGIN_REQUIRED)


async def test_spa_not_mounted_when_static_dir_is_missing(app_client: AppFactory, tmp_path: Path) -> None:
    client = await app_client(static_dir=tmp_path / "does-not-exist")
    assert_problem(await client.get("/"), 404, "not_found", RESOURCE_MISSING)
    assert_problem(await client.get("/studenti"), 404, "not_found", RESOURCE_MISSING)


# ---------------------------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------------------------


async def test_get_profile_defaults(client, make_user) -> None:
    user = await make_user("Anna")
    response = await client.get(f"{API}/me", headers=user.headers)
    assert response.status_code == 200, response.text
    profile = response.json()
    assert set(profile) == PROFILE_KEYS
    assert profile["id"] == str(user.id)
    assert profile["email"] == user.email
    assert profile["full_name"] == "Anna"
    assert profile["timezone"] == "Europe/Rome"
    assert profile["default_lesson_minutes"] == 60
    assert profile["default_hourly_rate_cents"] is None
    dt.datetime.fromisoformat(profile["created_at"])


async def test_patch_profile_is_partial(client, make_user) -> None:
    user = await make_user("Anna")
    before = (await client.get(f"{API}/me", headers=user.headers)).json()
    response = await client.patch(f"{API}/me", json={}, headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json() == before

    response = await client.patch(
        f"{API}/me",
        json={"full_name": "  Anna Verdi  ", "default_hourly_rate_cents": 2500, "default_lesson_minutes": 90},
        headers=user.headers,
    )
    assert response.status_code == 200, response.text
    after = response.json()
    assert after == {
        **before,
        "full_name": "Anna Verdi",
        "default_hourly_rate_cents": 2500,
        "default_lesson_minutes": 90,
    }

    response = await client.patch(
        f"{API}/me", json={"full_name": "   ", "default_hourly_rate_cents": None}, headers=user.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] is None
    assert response.json()["default_hourly_rate_cents"] is None
    assert response.json()["default_lesson_minutes"] == 90


@pytest.mark.parametrize("timezone", ["Europe/Rome", "America/New_York", "UTC", "Asia/Kolkata"])
async def test_patch_valid_timezone(client, make_user, timezone: str) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"timezone": timezone}, headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json()["timezone"] == timezone


@pytest.mark.parametrize(
    "timezone", ["Mars/Base", "EST", "Rome", "../etc/passwd", "Europe/", "/etc/localtime"]
)
async def test_patch_invalid_timezone(client, make_user, timezone: str) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"timezone": timezone}, headers=user.headers)
    body = assert_problem(response, 422, "validation_error", BAD_TIMEZONE, "timezone")
    assert body["errors"] == [{"field": "timezone", "message": BAD_TIMEZONE}]
    assert (await client.get(f"{API}/me", headers=user.headers)).json()["timezone"] == "Europe/Rome"


async def test_patch_timezone_too_long(client, make_user) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"timezone": "Europe/" + "x" * 60}, headers=user.headers)
    assert_problem(
        response, 422, "validation_error", "Testo troppo lungo (massimo 64 caratteri).", "timezone"
    )


async def test_patch_timezone_alias_unknown_to_postgres(
    client, make_user, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    async with db.acquire() as conn:
        postgres_names = {r["name"] for r in await conn.fetch("select name from pg_timezone_names")}
    aliases = sorted(n for n in zoneinfo.available_timezones() if "/" in n and n not in postgres_names)
    if not aliases:
        pytest.skip("every zoneinfo name with a region is known to this Postgres")
    alias = aliases[0]
    ZoneInfo(alias)  # Python accepts it ...
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"timezone": alias}, headers=user.headers)
    assert_problem(response, 422, "validation_error", BAD_TIMEZONE, "timezone")  # ... the API does not


async def test_patch_required_profile_fields_cannot_be_null(client, make_user) -> None:
    user = await make_user()
    response = await client.patch(
        f"{API}/me", json={"timezone": None, "default_lesson_minutes": None}, headers=user.headers
    )
    body = assert_problem(response, 422, "validation_error", REQUIRED)
    assert body["errors"] == [
        {"field": "timezone", "message": REQUIRED},
        {"field": "default_lesson_minutes", "message": REQUIRED},
    ]


@pytest.mark.parametrize(
    ("minutes", "message"),
    [
        (14, "Il valore minimo è 15."),
        (0, "Il valore minimo è 15."),
        (481, "Il valore massimo è 480."),
        (1.5, None),
    ],
)
async def test_default_lesson_minutes_out_of_bounds(
    client, make_user, minutes: Any, message: str | None
) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"default_lesson_minutes": minutes}, headers=user.headers)
    expected = message or "Deve essere un numero intero."
    assert_problem(response, 422, "validation_error", expected, "default_lesson_minutes")


@pytest.mark.parametrize("minutes", [15, 480])
async def test_default_lesson_minutes_bounds_are_inclusive(client, make_user, minutes: int) -> None:
    user = await make_user()
    response = await client.patch(f"{API}/me", json={"default_lesson_minutes": minutes}, headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json()["default_lesson_minutes"] == minutes


@pytest.mark.parametrize(
    ("cents", "message"), [(-1, "Il valore minimo è 0."), (100_001, "Il valore massimo è 100000.")]
)
async def test_default_hourly_rate_bounds(client, make_user, cents: int, message: str) -> None:
    user = await make_user()
    response = await client.patch(
        f"{API}/me", json={"default_hourly_rate_cents": cents}, headers=user.headers
    )
    assert_problem(response, 422, "validation_error", message, "default_hourly_rate_cents")


async def test_profiles_are_per_tenant(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    await client.patch(f"{API}/me", json={"timezone": "America/New_York"}, headers=anna.headers)
    bruno_profile = (await client.get(f"{API}/me", headers=bruno.headers)).json()
    assert bruno_profile["id"] == str(bruno.id)
    assert bruno_profile["timezone"] == "Europe/Rome"


# ---------------------------------------------------------------------------------------------
# Subjects (D-14)
# ---------------------------------------------------------------------------------------------


async def test_new_tutor_gets_ten_default_subjects(client, make_user) -> None:
    user = await make_user()
    subjects = await get_subjects(client, user)
    assert [s["name"] for s in subjects] == DEFAULT_SUBJECTS
    assert [s["position"] for s in subjects] == list(range(1, 11))
    assert all(set(s) == SUBJECT_KEYS for s in subjects)
    assert not any(s["archived"] for s in subjects)
    assert await get_subjects(client, user, True) == subjects


async def test_create_subject(client, make_user) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json={"name": "  Musica  "}, headers=user.headers)
    assert response.status_code == 201, response.text
    created = response.json()
    assert set(created) == SUBJECT_KEYS
    assert created["name"] == "Musica"
    assert created["position"] == 11
    assert created["archived"] is False
    uuid.UUID(created["id"])
    assert (await get_subjects(client, user))[-1] == created
    second = await client.post(f"{API}/subjects", json={"name": "Arte"}, headers=user.headers)
    assert second.json()["position"] == 12


@pytest.mark.parametrize("name", ["Matematica", "matematica", "MATEMATICA", "  Matematica  ", "mAtEmAtIcA"])
async def test_duplicate_subject_name_is_409_case_insensitive(client, make_user, name: str) -> None:
    user = await make_user()
    response = await client.post(f"{API}/subjects", json={"name": name}, headers=user.headers)
    body = assert_problem(response, 409, "conflict", DUPLICATE_SUBJECT, "name")
    assert body["errors"] == [{"field": "name", "message": DUPLICATE_SUBJECT}]
    assert len(await get_subjects(client, user, True)) == 10


async def test_duplicate_of_an_archived_subject_is_still_409(client, make_user) -> None:
    user = await make_user()
    storia = await subject_named(client, user, "Storia")
    await client.patch(f"{API}/subjects/{storia['id']}", json={"archived": True}, headers=user.headers)
    response = await client.post(f"{API}/subjects", json={"name": "storia"}, headers=user.headers)
    assert_problem(response, 409, "conflict", DUPLICATE_SUBJECT, "name")


async def test_same_subject_name_for_different_tutors(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    for user in (anna, bruno):
        response = await client.post(f"{API}/subjects", json={"name": "Musica"}, headers=user.headers)
        assert response.status_code == 201, response.text


async def test_archived_filter(client, make_user) -> None:
    user = await make_user()
    fisica = await subject_named(client, user, "Fisica")

    response = await client.patch(
        f"{API}/subjects/{fisica['id']}", json={"archived": True}, headers=user.headers
    )
    assert response.status_code == 200, response.text
    assert response.json() == {**fisica, "archived": True}
    active = await get_subjects(client, user)
    assert "Fisica" not in [s["name"] for s in active]
    assert len(active) == 9
    assert await get_subjects(client, user, False) == active
    everything = await get_subjects(client, user, True)
    assert len(everything) == 10
    assert {**fisica, "archived": True} in everything

    # Archiving twice keeps it archived.
    again = await client.patch(
        f"{API}/subjects/{fisica['id']}", json={"archived": True}, headers=user.headers
    )
    assert again.json()["archived"] is True

    response = await client.patch(
        f"{API}/subjects/{fisica['id']}", json={"archived": False}, headers=user.headers
    )
    assert response.json() == fisica
    assert len(await get_subjects(client, user)) == 10


async def test_patch_subject_every_field(client, make_user) -> None:
    user = await make_user()
    chimica = await subject_named(client, user, "Chimica")
    url = f"{API}/subjects/{chimica['id']}"

    empty = await client.patch(url, json={}, headers=user.headers)
    assert empty.status_code == 200, empty.text
    assert empty.json() == chimica

    nulls = await client.patch(
        url, json={"name": None, "position": None, "archived": None}, headers=user.headers
    )
    assert nulls.status_code == 200, nulls.text
    assert nulls.json() == chimica

    renamed = await client.patch(url, json={"name": "  Chimica organica "}, headers=user.headers)
    assert renamed.json() == {**chimica, "name": "Chimica organica"}

    moved = await client.patch(url, json={"position": 0}, headers=user.headers)
    assert moved.json()["position"] == 0
    assert (await get_subjects(client, user))[0]["id"] == chimica["id"]

    everything = await client.patch(
        url, json={"name": "Biochimica", "position": 32767, "archived": True}, headers=user.headers
    )
    assert everything.json() == {
        "id": chimica["id"],
        "name": "Biochimica",
        "position": 32767,
        "archived": True,
    }

    # Changing only the case of its own name is not a duplicate.
    recased = await client.patch(url, json={"name": "BIOCHIMICA", "archived": False}, headers=user.headers)
    assert recased.status_code == 200, recased.text
    assert recased.json()["name"] == "BIOCHIMICA"
    assert recased.json()["archived"] is False


async def test_patch_subject_validation(client, make_user) -> None:
    user = await make_user()
    latino = await subject_named(client, user, "Latino")
    url = f"{API}/subjects/{latino['id']}"
    cases: list[tuple[dict[str, Any], int, str, str, str]] = [
        ({"name": "Fisica"}, 409, "conflict", DUPLICATE_SUBJECT, "name"),
        ({"name": " inglese "}, 409, "conflict", DUPLICATE_SUBJECT, "name"),
        ({"name": "  "}, 422, "validation_error", REQUIRED, "name"),
        ({"name": 7}, 422, "validation_error", "Deve essere un testo.", "name"),
        ({"position": -1}, 422, "validation_error", "Il valore minimo è 0.", "position"),
        ({"position": 32768}, 422, "validation_error", "Il valore massimo è 32767.", "position"),
        ({"archived": "forse"}, 422, "validation_error", "Deve essere vero o falso.", "archived"),
    ]
    for body, status, code, detail, field in cases:
        assert_problem(await client.patch(url, json=body, headers=user.headers), status, code, detail, field)
    assert await subject_named(client, user, "Latino") == latino


async def test_delete_subject_keeps_lessons_and_students(client, make_user) -> None:
    user = await make_user()
    informatica = await subject_named(client, user, "Informatica")
    student = await create_student(client, user, default_subject_id=informatica["id"])
    assert student["default_subject_id"] == informatica["id"]
    lesson = await create_lesson(
        client, user, student["id"], rome_today() - dt.timedelta(days=10), subject_id=informatica["id"]
    )
    assert lesson["subject"] == {"id": informatica["id"], "name": "Informatica"}

    response = await client.delete(f"{API}/subjects/{informatica['id']}", headers=user.headers)
    assert response.status_code == 204
    assert response.content == b""

    kept = await client.get(f"{API}/lessons/{lesson['id']}", headers=user.headers)
    assert kept.status_code == 200, kept.text
    assert kept.json()["subject"] is None
    assert kept.json()["amount_cents"] == lesson["amount_cents"]
    owner = await client.get(f"{API}/students/{student['id']}", headers=user.headers)
    assert owner.json()["default_subject_id"] is None
    assert "Informatica" not in [s["name"] for s in await get_subjects(client, user, True)]

    again = await client.delete(f"{API}/subjects/{informatica['id']}", headers=user.headers)
    assert_problem(again, 404, "not_found", SUBJECT_NOT_FOUND)
    # The name is free again.
    recreated = await client.post(f"{API}/subjects", json={"name": "Informatica"}, headers=user.headers)
    assert recreated.status_code == 201, recreated.text


async def test_unknown_subject_is_404(client, make_user) -> None:
    user = await make_user()
    missing = uuid.uuid4()
    assert_problem(
        await client.patch(f"{API}/subjects/{missing}", json={"name": "X"}, headers=user.headers),
        404,
        "not_found",
        SUBJECT_NOT_FOUND,
    )
    assert_problem(
        await client.delete(f"{API}/subjects/{missing}", headers=user.headers),
        404,
        "not_found",
        SUBJECT_NOT_FOUND,
    )


async def test_subjects_cross_tenant(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    matematica = await subject_named(client, anna, "Matematica")
    url = f"{API}/subjects/{matematica['id']}"

    for response in (
        await client.patch(url, json={"name": "Rubata"}, headers=bruno.headers),
        await client.patch(url, json={}, headers=bruno.headers),
        await client.delete(url, headers=bruno.headers),
    ):
        assert_problem(response, 404, "not_found", SUBJECT_NOT_FOUND)
    assert matematica["id"] not in {s["id"] for s in await get_subjects(client, bruno, True)}
    assert await subject_named(client, anna, "Matematica") == matematica

    # Referencing another tutor's subject in a body is a form error on the field (422), not 404.
    student = await create_student(client, bruno)
    response = await client.post(
        f"{API}/lessons",
        json={
            "student_id": student["id"],
            "subject_id": matematica["id"],
            "date": (rome_today() - dt.timedelta(days=3)).isoformat(),
            "start_time": "15:00",
            "end_time": "16:00",
        },
        headers=bruno.headers,
    )
    assert_problem(response, 422, "validation_error", SUBJECT_NOT_FOUND, "subject_id")


async def test_subjects_require_authentication(client) -> None:
    assert_unauthorized(await client.get(f"{API}/subjects"), LOGIN_REQUIRED)
    assert_unauthorized(await client.post(f"{API}/subjects", json={"name": "X"}), LOGIN_REQUIRED)


# ---------------------------------------------------------------------------------------------
# Public config
# ---------------------------------------------------------------------------------------------


async def test_public_config_defaults(client) -> None:
    response = await client.get(f"{API}/public/config")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "supabase_url": TEST_SUPABASE_URL,
        "supabase_publishable_key": "",
        "google_login_enabled": True,
        "magic_link_enabled": True,
        "dev_auth_enabled": False,
        "calendar_sync_available": False,
        "assistant_available": False,
    }
    # Public: an invalid token is ignored, not a 401.
    with_bad_token = await client.get(f"{API}/public/config", headers=bearer("garbage"))
    assert with_bad_token.status_code == 200
    assert with_bad_token.json() == response.json()


async def test_public_config_reflects_settings(database_url: str) -> None:
    overrides: dict[str, Any] = {
        "supabase_url": "https://abcdefgh.supabase.co/",
        "supabase_publishable_key": "sb_publishable_test",
        "google_login_enabled": False,
        "magic_link_enabled": False,
        "google_client_id": "client.apps.googleusercontent.com",
        "google_client_secret": "google-secret",
        "token_encryption_key": Fernet.generate_key().decode(),
        "assistant_provider": "anthropic",
        "anthropic_api_key": "sk-ant-test",
    }
    async with open_client(database_url, **overrides) as client:
        response = await client.get(f"{API}/public/config")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == PUBLIC_CONFIG_KEYS
    assert body == {
        "supabase_url": "https://abcdefgh.supabase.co/",
        "supabase_publishable_key": "sb_publishable_test",
        "google_login_enabled": False,
        "magic_link_enabled": False,
        "dev_auth_enabled": False,
        "calendar_sync_available": True,
        "assistant_available": True,
    }
    # Secrets never leak into the public config.
    for secret in ("google-secret", "sk-ant-test", overrides["token_encryption_key"]):
        assert secret not in response.text


async def test_public_config_blank_keys_mean_unavailable(database_url: str) -> None:
    overrides: dict[str, Any] = {
        "google_client_id": "client.apps.googleusercontent.com",
        "google_client_secret": "   ",
        "token_encryption_key": Fernet.generate_key().decode(),
        "assistant_provider": "openai",
        "openai_api_key": "",
    }
    async with open_client(database_url, **overrides) as client:
        body = (await client.get(f"{API}/public/config")).json()
    assert body["calendar_sync_available"] is False
    assert body["assistant_available"] is False


async def test_public_config_dev_auth(dev_client: httpx.AsyncClient) -> None:
    response = await dev_client.get(f"{API}/public/config")
    assert response.json()["dev_auth_enabled"] is True
