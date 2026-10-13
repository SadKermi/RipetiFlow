"""Minimal Google OAuth + Calendar v3 client over httpx (no Google SDK, D-31)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import quote

import httpx

TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created"
LESSON_PROPERTY = "ripetiflow_lesson_id"
CALENDAR_SUMMARY = "RipetiFlow"


RATE_LIMIT_REASONS = frozenset(
    {"rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"}
)
SCOPE_REASONS = frozenset({"insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"})


class GoogleError(Exception):
    """A failed Google call. `message` is Google's own (English) text: log it, never show it."""

    def __init__(self, message: str, status: int | None = None, reason: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.reason = reason

    @property
    def rate_limited(self) -> bool:
        return self.status == 429 or (self.status == 403 and self.reason in RATE_LIMIT_REASONS)

    @property
    def insufficient_scope(self) -> bool:
        return self.status == 403 and (
            self.reason in SCOPE_REASONS or "insufficient authentication scopes" in self.message.lower()
        )


class GoogleAuthError(GoogleError):
    """The refresh token is no longer valid (`invalid_grant`): the user must reconnect."""


class GoogleUnauthorized(GoogleError):
    """An access token was rejected: drop it and get a new one."""


class GoogleNotFound(GoogleError):
    pass


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_at: float
    scope: str = ""

    def fresh(self, margin: float = 60.0) -> bool:
        return time.time() < self.expires_at - margin


class GoogleCalendarApi(Protocol):
    """What the sync needs from Google. Only calls allowed by `calendar.app.created` (D-31): there is
    no calendarList.list, so the calendar id stored in the link is the only way back to the calendar.

    `delete_calendar` and `delete_event` treat "already gone" (404/410) as success; every other call
    raises GoogleNotFound for it.
    """

    async def refresh_access_token(self, refresh_token: str) -> AccessToken: ...
    async def revoke(self, token: str) -> None: ...
    async def user_email(self, access_token: str) -> str | None: ...
    async def calendar_exists(self, access_token: str, calendar_id: str) -> bool: ...
    async def create_calendar(self, access_token: str, summary: str, time_zone: str) -> str: ...
    async def delete_calendar(self, access_token: str, calendar_id: str) -> None: ...
    async def insert_event(self, access_token: str, calendar_id: str, body: dict[str, Any]) -> str: ...
    async def update_event(
        self, access_token: str, calendar_id: str, event_id: str, body: dict[str, Any]
    ) -> None: ...
    async def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> None: ...
    async def find_lesson_events(self, access_token: str, calendar_id: str, lesson_id: str) -> list[str]: ...
    async def list_events(self, access_token: str, calendar_id: str) -> list[tuple[str, str | None]]: ...


def _error_details(response: httpx.Response) -> tuple[str, str | None]:
    """(message, reason) from a Google error payload (Calendar API or OAuth endpoint)."""
    fallback = f"HTTP {response.status_code}"
    try:
        payload = response.json()
    except ValueError:
        return fallback, None
    if not isinstance(payload, dict):
        return fallback, None
    error = payload.get("error")
    if isinstance(error, dict):
        reason: str | None = None
        errors = error.get("errors")
        if isinstance(errors, list) and errors and isinstance(errors[0], dict):
            reason = errors[0].get("reason")
        for detail in error.get("details") or []:
            if isinstance(detail, dict) and detail.get("reason"):
                reason = reason or str(detail["reason"])
        message = str(error.get("message") or error.get("status") or fallback)
        return message, reason or (str(error["status"]) if error.get("status") else None)
    if isinstance(error, str):
        return str(payload.get("error_description") or error), error
    return fallback, None


def _raise_for(response: httpx.Response) -> None:
    message, reason = _error_details(response)
    if response.status_code in (404, 410):
        raise GoogleNotFound(message, response.status_code, reason)
    if response.status_code == 401:
        raise GoogleUnauthorized(message, 401, reason)
    raise GoogleError(message, response.status_code, reason)


class HttpGoogleCalendar:
    def __init__(self, http: httpx.AsyncClient, client_id: str, client_secret: str) -> None:
        self._http = http
        self._client_id = client_id
        self._client_secret = client_secret

    async def _request(
        self,
        method: str,
        url: str,
        access_token: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
    ) -> httpx.Response:
        try:
            response = await self._http.request(
                method,
                url,
                params=params,
                json=json,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20.0,
            )
        except httpx.HTTPError as exc:
            raise GoogleError(f"network error: {type(exc).__name__}") from exc
        if response.status_code >= 400:
            _raise_for(response)
        return response

    async def refresh_access_token(self, refresh_token: str) -> AccessToken:
        try:
            response = await self._http.post(
                TOKEN_URL,
                data={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=15.0,
            )
        except httpx.HTTPError as exc:
            raise GoogleError(f"network error: {type(exc).__name__}") from exc
        if response.status_code >= 400:
            message, reason = _error_details(response)
            if reason == "invalid_grant" or "invalid_grant" in response.text:
                raise GoogleAuthError(message, response.status_code, reason)
            raise GoogleError(message, response.status_code, reason)
        payload = response.json()
        return AccessToken(
            token=payload["access_token"],
            expires_at=time.time() + float(payload.get("expires_in", 3600)),
            scope=str(payload.get("scope", "")),
        )

    async def revoke(self, token: str) -> None:
        try:
            response = await self._http.post(REVOKE_URL, data={"token": token}, timeout=10.0)
        except httpx.HTTPError as exc:
            raise GoogleError(f"network error: {type(exc).__name__}") from exc
        if response.status_code >= 400:
            message, reason = _error_details(response)
            if reason == "invalid_token":  # already expired or revoked: nothing left to revoke
                return
            raise GoogleError(message, response.status_code, reason)

    async def user_email(self, access_token: str) -> str | None:
        try:
            response = await self._request("GET", USERINFO_URL, access_token)
        except GoogleError:
            return None
        email = response.json().get("email")
        return email if isinstance(email, str) else None

    async def calendar_exists(self, access_token: str, calendar_id: str) -> bool:
        try:
            await self._request(
                "GET", f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}", access_token
            )
        except GoogleNotFound:
            return False
        return True

    async def create_calendar(self, access_token: str, summary: str, time_zone: str) -> str:
        response = await self._request(
            "POST",
            f"{CALENDAR_API}/calendars",
            access_token,
            json={
                "summary": summary,
                "timeZone": time_zone,
                "description": "Lezioni registrate in RipetiFlow",
            },
        )
        return str(response.json()["id"])

    async def delete_calendar(self, access_token: str, calendar_id: str) -> None:
        try:
            await self._request(
                "DELETE", f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}", access_token
            )
        except GoogleNotFound:
            return

    def _events_url(self, calendar_id: str, event_id: str | None = None) -> str:
        base = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events"
        return f"{base}/{quote(event_id, safe='')}" if event_id else base

    async def insert_event(self, access_token: str, calendar_id: str, body: dict[str, Any]) -> str:
        response = await self._request("POST", self._events_url(calendar_id), access_token, json=body)
        return str(response.json()["id"])

    async def update_event(
        self, access_token: str, calendar_id: str, event_id: str, body: dict[str, Any]
    ) -> None:
        # PUT replaces the whole event: manual edits made in Google are overwritten (D-31).
        await self._request("PUT", self._events_url(calendar_id, event_id), access_token, json=body)

    async def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> None:
        try:
            await self._request("DELETE", self._events_url(calendar_id, event_id), access_token)
        except GoogleNotFound:
            return

    async def _list(self, access_token: str, calendar_id: str, extra: dict[str, str]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        page_token: str | None = None
        while True:
            params = {"maxResults": "2500", "showDeleted": "false", **extra}
            if page_token:
                params["pageToken"] = page_token
            response = await self._request("GET", self._events_url(calendar_id), access_token, params=params)
            payload = response.json()
            items.extend(payload.get("items", []))
            page_token = payload.get("nextPageToken")
            if not page_token:
                return items

    async def find_lesson_events(self, access_token: str, calendar_id: str, lesson_id: str) -> list[str]:
        items = await self._list(
            access_token, calendar_id, {"privateExtendedProperty": f"{LESSON_PROPERTY}={lesson_id}"}
        )
        return [str(item["id"]) for item in items]

    async def list_events(self, access_token: str, calendar_id: str) -> list[tuple[str, str | None]]:
        items = await self._list(access_token, calendar_id, {})
        result: list[tuple[str, str | None]] = []
        for item in items:
            private = (item.get("extendedProperties") or {}).get("private") or {}
            result.append((str(item["id"]), private.get(LESSON_PROPERTY)))
        return result
