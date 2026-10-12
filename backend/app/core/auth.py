"""JWT verification: Supabase ES256/RS256 tokens via JWKS (D-04), HS256 demo tokens in dev (D-30)."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.types import Options

from app.core.errors import ApiError
from app.core.settings import DEV_DEMO_USER_ID, DEV_JWT_ISSUER, Settings

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


class JwksUnavailableError(Exception):
    """The JWKS endpoint failed and no usable cached key exists for the requested kid."""


class JwksCache:
    """Async JWKS cache.

    Keys live `ttl` seconds; an unknown `kid` forces a refetch, at most every `min_refetch_interval`
    seconds. If a refresh fails, keys already known stay valid (a short Supabase blip must not log
    everybody out) and the next attempt waits `min_refetch_interval`.
    """

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
        self._fetched_at = float("-inf")  # last successful refresh
        self._attempted_at = float("-inf")  # last attempt, successful or not
        self._failing = False  # the last attempt failed
        self._lock = asyncio.Lock()

    async def _fetch(self) -> dict[str, jwt.PyJWK]:
        response = await self._http.get(self._url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        keys: dict[str, jwt.PyJWK] = {}
        for item in payload.get("keys", []) if isinstance(payload, dict) else []:
            if not isinstance(item, dict) or item.get("use", "sig") != "sig" or "kid" not in item:
                continue
            try:
                keys[str(item["kid"])] = jwt.PyJWK(item)
            except (jwt.PyJWTError, ValueError, TypeError):
                logger.warning("skipping unsupported JWK kid=%s", item.get("kid"))
        return keys

    def _due(self, kid: str, now: float) -> bool:
        if now - self._attempted_at < self._min_refetch:
            return False  # throttle every refetch, successful or not
        return now - self._fetched_at > self._ttl or kid not in self._keys

    async def get(self, kid: str) -> jwt.PyJWK:
        if self._due(kid, time.monotonic()):
            async with self._lock:
                now = time.monotonic()
                if self._due(kid, now):  # another request may have refreshed meanwhile
                    self._attempted_at = now
                    try:
                        keys = await self._fetch()
                    except (httpx.HTTPError, ValueError) as exc:
                        self._failing = True
                        logger.warning(
                            "JWKS refresh failed (%s); keeping %d cached keys", exc, len(self._keys)
                        )
                    else:
                        self._failing = False
                        if keys:  # never replace a working key set with an empty one
                            self._keys = keys
                            self._fetched_at = now
        key = self._keys.get(kid)
        if key is None:
            # Unknown kid while the endpoint is down: we cannot tell, so 502 rather than "logged out".
            if self._failing:
                raise JwksUnavailableError
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
                if claims.get("sub") != str(DEV_DEMO_USER_ID):
                    raise unauthorized()  # demo tokens can only ever be the demo user
            elif alg in _ASYMMETRIC_ALGS:
                kid = header.get("kid")
                if not isinstance(kid, str):
                    raise unauthorized()
                try:
                    key = await self._jwks.get(kid)
                except JwksUnavailableError as exc:
                    raise ApiError("upstream_error", "Impossibile verificare la sessione. Riprova.") from exc
                # Passing the PyJWK (not the raw key) makes PyJWT check that the token's alg matches
                # the key's algorithm: an RS256 header on an EC key is rejected, not a crash.
                claims = jwt.decode(
                    token,
                    key,
                    algorithms=list(_ASYMMETRIC_ALGS),
                    audience="authenticated",
                    issuer=self._settings.jwt_issuer,
                    leeway=30,
                    options=options,
                )
            else:
                raise unauthorized()
        except (jwt.PyJWTError, TypeError, ValueError) as exc:
            raise unauthorized() from exc

        if claims.get("role") != "authenticated":
            raise unauthorized()
        try:
            user_id = uuid.UUID(str(claims["sub"]))
        except ValueError as exc:
            raise unauthorized() from exc
        email = claims.get("email")
        return CurrentUser(id=user_id, email=email if isinstance(email, str) else None, claims=claims)


def issue_dev_token(settings: Settings, email: str, ttl_seconds: int = 12 * 3600) -> str:
    """Sign a demo token for the fixed demo user (development with DEV_AUTH=1 only)."""
    if not settings.dev_auth_enabled:
        raise RuntimeError("dev tokens are only available with DEV_AUTH=1 in development")
    now = int(time.time())
    claims = {
        "sub": str(DEV_DEMO_USER_ID),
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": DEV_JWT_ISSUER,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(claims, settings.dev_jwt_secret.get_secret_value(), algorithm="HS256")


# auto_error=False: missing/invalid headers become our Italian problem+json 401, and the scheme still
# appears in OpenAPI (Swagger "Authorize", typed clients).
_bearer = HTTPBearer(auto_error=False, description="Access token di Supabase Auth")


async def current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if credentials is None or not credentials.credentials.strip():
        raise unauthorized("Accesso richiesto: effettua il login.")
    verifier: TokenVerifier = request.app.state.verifier
    return await verifier.verify(credentials.credentials.strip())
