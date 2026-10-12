"""JWT verification: Supabase ES256/RS256 tokens via JWKS (D-04), HS256 demo tokens in dev (D-30)."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import jwt
from fastapi import Request
from jwt.types import Options

from app.core.errors import ApiError
from app.core.settings import DEV_JWT_ISSUER, Settings

logger = logging.getLogger("ripetiflow.auth")

_ASYMMETRIC_ALGS = ("ES256", "RS256")
_UNAUTHORIZED_DETAIL = "Sessione non valida o scaduta. Accedi di nuovo."


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None
    claims: dict[str, Any] = field(repr=False)


def unauthorized(detail: str = _UNAUTHORIZED_DETAIL) -> ApiError:
    return ApiError("unauthorized", detail, headers={"WWW-Authenticate": "Bearer"})


class JwksCache:
    """Async JWKS cache: keys live `ttl` seconds; an unknown `kid` forces a (throttled) refetch."""

    def __init__(
        self,
        url: str,
        http: httpx.AsyncClient,
        ttl: float = 600.0,
        min_refetch_interval: float = 30.0,
    ) -> None:
        self._url = url
        self._http = http
        self._ttl = ttl
        self._min_refetch = min_refetch_interval
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._lock = asyncio.Lock()

    async def _refresh(self) -> None:
        response = await self._http.get(self._url, timeout=10.0)
        response.raise_for_status()
        keys: dict[str, jwt.PyJWK] = {}
        for item in response.json().get("keys", []):
            if item.get("use", "sig") != "sig" or "kid" not in item:
                continue
            try:
                keys[item["kid"]] = jwt.PyJWK(item)
            except jwt.PyJWTError:
                logger.warning("skipping unsupported JWK kid=%s", item.get("kid"))
        self._keys = keys
        self._fetched_at = time.monotonic()

    async def get(self, kid: str) -> jwt.PyJWK:
        now = time.monotonic()
        expired = now - self._fetched_at > self._ttl
        if expired or (kid not in self._keys and now - self._fetched_at > self._min_refetch):
            async with self._lock:
                # Another request may have refreshed while we waited for the lock.
                now = time.monotonic()
                if now - self._fetched_at > self._ttl or (
                    kid not in self._keys and now - self._fetched_at > self._min_refetch
                ):
                    await self._refresh()
        key = self._keys.get(kid)
        if key is None:
            raise unauthorized()
        return key


class TokenVerifier:
    def __init__(self, settings: Settings, jwks: JwksCache) -> None:
        self._settings = settings
        self._jwks = jwks

    async def verify(self, token: str) -> CurrentUser:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise unauthorized() from exc
        alg = header.get("alg")
        options: Options = {"require": ["exp", "sub", "aud", "iss"]}
        try:
            if alg == "HS256":
                if not self._settings.dev_auth_enabled:
                    raise unauthorized()
                claims = jwt.decode(
                    token,
                    self._settings.dev_jwt_secret.get_secret_value(),
                    algorithms=["HS256"],
                    audience="authenticated",
                    issuer=DEV_JWT_ISSUER,
                    options=options,
                )
            elif alg in _ASYMMETRIC_ALGS:
                kid = header.get("kid")
                if not isinstance(kid, str):
                    raise unauthorized()
                try:
                    key = await self._jwks.get(kid)
                except httpx.HTTPError as exc:
                    logger.error("JWKS fetch failed: %s", exc)
                    raise ApiError("upstream_error", "Impossibile verificare la sessione. Riprova.") from exc
                claims = jwt.decode(
                    token,
                    key.key,
                    algorithms=[alg],
                    audience="authenticated",
                    issuer=self._settings.jwt_issuer,
                    leeway=30,
                    options=options,
                )
            else:
                raise unauthorized()
        except jwt.PyJWTError as exc:
            raise unauthorized() from exc

        if claims.get("role") != "authenticated":
            raise unauthorized()
        try:
            user_id = uuid.UUID(str(claims["sub"]))
        except ValueError as exc:
            raise unauthorized() from exc
        email = claims.get("email")
        return CurrentUser(id=user_id, email=email if isinstance(email, str) else None, claims=claims)


def issue_dev_token(settings: Settings, user_id: uuid.UUID, email: str, ttl_seconds: int = 12 * 3600) -> str:
    if not settings.dev_auth_enabled:
        raise RuntimeError("dev tokens are only available with DEV_AUTH=1 in development")
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": DEV_JWT_ISSUER,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(claims, settings.dev_jwt_secret.get_secret_value(), algorithm="HS256")


async def current_user(request: Request) -> CurrentUser:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized("Accesso richiesto: effettua il login.")
    verifier: TokenVerifier = request.app.state.verifier
    return await verifier.verify(token.strip())
