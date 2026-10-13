"""Google Calendar one-way sync (D-31, docs/05 "Google Calendar", docs/03 "Sync calendario").

Google is replaced by `FakeGoogle`, a stateful in-memory implementation of the GoogleCalendarApi
protocol (OAuth grants with their scopes, calendars, events with private properties, per-method
failure injection and a call log). The worker is never started: tests call `run_once()` directly, so
every step is deterministic and nothing sleeps. Backoff waits are skipped by moving
`next_attempt_at` to now in the database.
"""

from __future__ import annotations

import asyncio
import copy
import datetime as dt
import itertools
import time
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
from zoneinfo import ZoneInfo

import asyncpg
import httpx
import pytest
from cryptography.fernet import Fernet

from app.calendar.google import (
    CALENDAR_SCOPE,
    LESSON_PROPERTY,
    AccessToken,
    GoogleAuthError,
    GoogleError,
    GoogleNotFound,
    GoogleUnauthorized,
)
from app.calendar.sync import CalendarSync, backoff, failure_text
from tests.conftest import AppFactory, User, create_lesson, create_student

API = "/api/v1"
CAL = f"{API}/integrations/google-calendar"
PROBLEM = "application/problem+json"
KEY = Fernet.generate_key().decode()
PUBLIC_URL = "http://localhost:5173"  # Settings default for public_app_url
LOGIN_SCOPES = (
    "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
)
FULL_SCOPES = f"{LOGIN_SCOPES} {CALENDAR_SCOPE}"

MSG_REVOKED = "Accesso a Google Calendar revocato: ricollega il calendario in Impostazioni."
MSG_SCOPE = (
    "Per sincronizzare devi concedere l'accesso a Google Calendar: riprova e lascia selezionata "
    "l'autorizzazione al calendario."
)
MSG_AUTH = "Google non ha accettato l'autorizzazione: riprova a collegare il calendario."
MSG_DOWN = "Google Calendar non risponde. Riprova tra poco."
MSG_CREATE_FAILED = "Non è stato possibile creare il calendario su Google."
MSG_DELETE_FAILED = (
    "Non è stato possibile eliminare il calendario da Google: il collegamento è ancora attivo, "
    "riprova tra poco."
)
MSG_NOT_CONNECTED = "Collega prima Google Calendar dalle Impostazioni."
MSG_NOT_CONFIGURED = "La sincronizzazione con Google Calendar non è configurata su questo server."
RETRY = " Nuovo tentativo automatico più tardi."
PARKED = " Tentativi esauriti: usa «Risincronizza» nelle Impostazioni."
DELAYS_MINUTES = [1, 5, 15, 60, 120, 240, 360]
MAX_ATTEMPTS = 8


# ---------------------------------------------------------------------------------------------
# Fake Google
# ---------------------------------------------------------------------------------------------


def _prop(event: dict[str, Any]) -> str | None:
    value = ((event.get("extendedProperties") or {}).get("private") or {}).get(LESSON_PROPERTY)
    return str(value) if value is not None else None


class FakeGoogle:
    """In-memory Google OAuth + Calendar v3 with the semantics of HttpGoogleCalendar.

    - `grant(scope)` issues a refresh token; refreshing it returns an access token with that scope.
    - Access tokens are checked on every call (unknown -> 401 GoogleUnauthorized).
    - Missing calendar/event -> GoogleNotFound, except delete_calendar/delete_event (already gone = ok).
    - `cancel(calendar, event)` is a deletion made by hand in Google's UI: the event is kept as
      `status: cancelled`, hidden from listings, and (pessimistic model) an update brings it back only
      if the body says `status: confirmed`.
    - `fail(method, *errors)` makes the next calls of `method` raise those errors, in order.
    - `calls` logs every call as (method, *ids); `delay` adds latency to every call; `entered[method]`
      is set on the first call of `method`, and `holds[method]` (an Event) blocks its calls until set.
    """

    def __init__(self) -> None:
        self.grants: dict[str, str] = {}
        self.access: dict[str, str] = {}
        self.calendars: dict[str, dict[str, Any]] = {}
        self.revoked: list[str] = []
        self.calls: list[tuple[str, ...]] = []
        self.failures: dict[str, list[GoogleError]] = defaultdict(list)
        self.delay = 0.0
        self.holds: dict[str, asyncio.Event] = {}
        self.entered: dict[str, asyncio.Event] = defaultdict(asyncio.Event)
        self.email = "anna.tutor@gmail.com"
        self._seq = itertools.count(1)

    # -- test controls ---------------------------------------------------------------------
    def grant(self, scope: str = FULL_SCOPES) -> str:
        token = f"1//refresh-{next(self._seq)}-{uuid.uuid4().hex}"
        self.grants[token] = scope
        return token

    def expire(self, refresh_token: str) -> None:
        """Google drops the grant (Testing mode: after 7 days): refresh -> invalid_grant."""
        self.grants.pop(refresh_token, None)
        for access, refresh in list(self.access.items()):
            if refresh == refresh_token:
                del self.access[access]

    def fail(self, method: str, *errors: GoogleError) -> None:
        self.failures[method].extend(errors)

    def names(self) -> list[str]:
        return [call[0] for call in self.calls]

    def count(self, method: str) -> int:
        return self.names().count(method)

    def events(self, calendar_id: str) -> dict[str, dict[str, Any]]:
        events: dict[str, dict[str, Any]] = self.calendars[calendar_id]["events"]
        return events

    def add_event(self, calendar_id: str, lesson_id: str | None, summary: str = "A mano") -> str:
        """An event created outside the app (by hand, or by an older version of it)."""
        event_id = f"manual{next(self._seq)}"
        body: dict[str, Any] = {"summary": summary}
        if lesson_id is not None:
            body["extendedProperties"] = {"private": {LESSON_PROPERTY: lesson_id}}
        self.events(calendar_id)[event_id] = body
        return event_id

    def cancel(self, calendar_id: str, event_id: str) -> None:
        """Deleted by hand in Google Calendar: Google keeps the event as cancelled."""
        self.events(calendar_id)[event_id]["status"] = "cancelled"

    def visible(self, calendar_id: str) -> dict[str | None, list[str]]:
        """What the tutor sees in Google: lesson id -> event ids, cancelled events excluded."""
        result: dict[str | None, list[str]] = defaultdict(list)
        for event_id, event in self.events(calendar_id).items():
            if event.get("status") != "cancelled":
                result[_prop(event)].append(event_id)
        return dict(result)

    # -- protocol ----------------------------------------------------------------------------
    async def _enter(self, method: str, *args: str) -> None:
        self.calls.append((method, *args))
        self.entered[method].set()
        if self.delay:
            await asyncio.sleep(self.delay)
        hold = self.holds.get(method)
        if hold is not None:
            await hold.wait()
        if self.failures[method]:
            raise self.failures[method].pop(0)

    def _check(self, access_token: str) -> None:
        if access_token not in self.access:
            raise GoogleUnauthorized("Invalid Credentials", 401, "authError")

    def _calendar(self, calendar_id: str) -> dict[str, Any]:
        calendar = self.calendars.get(calendar_id)
        if calendar is None:
            raise GoogleNotFound("Not Found", 404, "notFound")
        return calendar

    async def refresh_access_token(self, refresh_token: str) -> AccessToken:
        await self._enter("refresh_access_token")
        scope = self.grants.get(refresh_token)
        if scope is None:
            raise GoogleAuthError("Token has been expired or revoked.", 400, "invalid_grant")
        access = f"ya29.{uuid.uuid4().hex}"
        self.access[access] = refresh_token
        return AccessToken(token=access, expires_at=time.time() + 3600, scope=scope)

    async def revoke(self, token: str) -> None:
        await self._enter("revoke")
        self.revoked.append(token)
        self.expire(token)

    async def user_email(self, access_token: str) -> str | None:
        await self._enter("user_email")
        self._check(access_token)
        return self.email

    async def calendar_exists(self, access_token: str, calendar_id: str) -> bool:
        await self._enter("calendar_exists", calendar_id)
        self._check(access_token)
        return calendar_id in self.calendars

    async def create_calendar(self, access_token: str, summary: str, time_zone: str) -> str:
        await self._enter("create_calendar", summary, time_zone)
        self._check(access_token)
        calendar_id = f"c{next(self._seq)}-{uuid.uuid4().hex[:8]}@group.calendar.google.com"
        self.calendars[calendar_id] = {"summary": summary, "timeZone": time_zone, "events": {}}
        return calendar_id

    async def delete_calendar(self, access_token: str, calendar_id: str) -> None:
        await self._enter("delete_calendar", calendar_id)
        self._check(access_token)
        self.calendars.pop(calendar_id, None)

    async def insert_event(self, access_token: str, calendar_id: str, body: dict[str, Any]) -> str:
        await self._enter("insert_event", calendar_id)
        self._check(access_token)
        calendar = self._calendar(calendar_id)
        event_id = f"ev{next(self._seq)}"
        calendar["events"][event_id] = copy.deepcopy(body)
        return event_id

    async def update_event(
        self, access_token: str, calendar_id: str, event_id: str, body: dict[str, Any]
    ) -> None:
        await self._enter("update_event", calendar_id, event_id)
        self._check(access_token)
        events = self._calendar(calendar_id)["events"]
        if event_id not in events:
            raise GoogleNotFound("Not Found", 404, "notFound")
        replacement = copy.deepcopy(body)
        if events[event_id].get("status") == "cancelled":
            replacement.setdefault("status", "cancelled")
        events[event_id] = replacement

    async def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> None:
        await self._enter("delete_event", calendar_id, event_id)
        self._check(access_token)
        calendar = self.calendars.get(calendar_id)
        if calendar is not None:
            calendar["events"].pop(event_id, None)

    async def find_lesson_events(self, access_token: str, calendar_id: str, lesson_id: str) -> list[str]:
        await self._enter("find_lesson_events", calendar_id, lesson_id)
        self._check(access_token)
        return [
            eid
            for eid, ev in self._calendar(calendar_id)["events"].items()
            if _prop(ev) == lesson_id and ev.get("status") != "cancelled"  # showDeleted=false
        ]

    async def list_events(self, access_token: str, calendar_id: str) -> list[tuple[str, str | None]]:
        await self._enter("list_events", calendar_id)
        self._check(access_token)
        return [
            (eid, _prop(ev))
            for eid, ev in self._calendar(calendar_id)["events"].items()
            if ev.get("status") != "cancelled"  # showDeleted=false
        ]


# ---------------------------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------------------------


async def _quiesce(db: asyncpg.Pool[asyncpg.Record]) -> None:
    """The session database is shared: no outbox row or sweep of another test may reach this
    test's worker (it would call this test's FakeGoogle)."""
    await db.execute("update app.calendar_outbox set processed_at = now() where processed_at is null")
    await db.execute(
        "update app.google_calendar_links set sweep_requested_at = null where sweep_requested_at is not null"
    )


@pytest.fixture(autouse=True)
async def isolated_outbox(db: asyncpg.Pool[asyncpg.Record]) -> AsyncIterator[None]:
    await _quiesce(db)
    yield
    await _quiesce(db)


@pytest.fixture
def google() -> FakeGoogle:
    return FakeGoogle()


def calendar_settings() -> dict[str, Any]:
    return {
        "google_client_id": "test-client.apps.googleusercontent.com",
        "google_client_secret": "test-client-secret",
        "token_encryption_key": KEY,
    }


@pytest.fixture
async def cal(app_client: AppFactory, google: FakeGoogle) -> httpx.AsyncClient:
    """App with calendar sync configured against the fake Google (worker not started)."""
    return await app_client(google=google, **calendar_settings())


MakeUser = Callable[..., Awaitable[User]]


def today(tz: str = "Europe/Rome") -> dt.date:
    return dt.datetime.now(ZoneInfo(tz)).date()


def days(n: int, tz: str = "Europe/Rome") -> dt.date:
    return today(tz) + dt.timedelta(days=n)


def sync_of(client: httpx.AsyncClient) -> CalendarSync:
    sync: CalendarSync = client.app.state.calendar  # type: ignore[attr-defined]
    return sync


async def tutor_with_student(
    client: httpx.AsyncClient, make_user: MakeUser, name: str = "Anna", timezone: str | None = None
) -> tuple[User, str]:
    user = await make_user(name, timezone=timezone)
    student = await create_student(
        client,
        user,
        "Luca",
        2000,
        last_name="Bianchi",
        rate_effective_from=str(days(-400, timezone or "Europe/Rome")),
    )
    return user, str(student["id"])


async def lesson(client: httpx.AsyncClient, user: User, student_id: str, day: dt.date, **fields: Any) -> str:
    created = await create_lesson(client, user, student_id, day, **fields)
    return str(created["id"])


async def connect(client: httpx.AsyncClient, user: User, refresh_token: str) -> httpx.Response:
    return await client.post(
        f"{CAL}/connect",
        json={"provider_refresh_token": refresh_token, "provider_token": "ya29.short-lived"},
        headers=user.headers,
    )


async def connected(client: httpx.AsyncClient, user: User, google: FakeGoogle) -> tuple[dict[str, Any], str]:
    refresh = google.grant()
    response = await connect(client, user, refresh)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body, refresh


async def get_status(client: httpx.AsyncClient, user: User) -> dict[str, Any]:
    response = await client.get(CAL, headers=user.headers)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def resync(client: httpx.AsyncClient, user: User, scope: str = "upcoming") -> httpx.Response:
    return await client.post(f"{CAL}/resync", json={"scope": scope}, headers=user.headers)


async def disconnect(client: httpx.AsyncClient, user: User, remove_calendar: bool = False) -> httpx.Response:
    return await client.delete(
        CAL, params={"remove_calendar": str(remove_calendar).lower()}, headers=user.headers
    )


async def patch_lesson(client: httpx.AsyncClient, user: User, lesson_id: str, **body: Any) -> None:
    response = await client.patch(f"{API}/lessons/{lesson_id}", json=body, headers=user.headers)
    assert response.status_code == 200, response.text


async def delete_lesson(client: httpx.AsyncClient, user: User, lesson_id: str) -> None:
    response = await client.delete(f"{API}/lessons/{lesson_id}", headers=user.headers)
    assert response.status_code == 204, response.text


async def calendar_state(client: httpx.AsyncClient, user: User, lesson_id: str) -> dict[str, Any]:
    response = await client.get(f"{API}/lessons/{lesson_id}", headers=user.headers)
    assert response.status_code == 200, response.text
    state: dict[str, Any] = response.json()["calendar"]
    return state


async def drain(client: httpx.AsyncClient, db: asyncpg.Pool[asyncpg.Record], *tutors: User) -> None:
    """Run the worker until nothing is due for these tutors (rows in backoff are not due)."""
    sync = sync_of(client)
    ids = [t.id for t in tutors]
    for _ in range(40):
        await sync.run_once()
        due = await db.fetchval(
            """select (select count(*) from app.calendar_outbox
                       where tutor_id = any($1::uuid[]) and processed_at is null and attempts < $2
                         and next_attempt_at <= now())
                    + (select count(*) from app.google_calendar_links g
                       where g.tutor_id = any($1::uuid[]) and g.sweep_requested_at <= now()
                         and g.status = 'active' and g.calendar_id is not null
                         and not exists (select 1 from app.calendar_outbox o
                                         where o.tutor_id = g.tutor_id and o.processed_at is null
                                           and o.attempts < $2))""",
            ids,
            MAX_ATTEMPTS,
        )
        if due == 0:
            return
    raise AssertionError("the calendar outbox did not drain")


async def make_due(db: asyncpg.Pool[asyncpg.Record], user: User) -> None:
    """Skip the backoff wait."""
    await db.execute(
        "update app.calendar_outbox set next_attempt_at = now() where tutor_id = $1 and processed_at is null",
        user.id,
    )


async def link_row(db: asyncpg.Pool[asyncpg.Record], user: User) -> asyncpg.Record | None:
    return await db.fetchrow("select * from app.google_calendar_links where tutor_id = $1", user.id)


async def pending(db: asyncpg.Pool[asyncpg.Record], user: User) -> list[asyncpg.Record]:
    return list(
        await db.fetch(
            """select id, lesson_id, op, attempts, last_error,
                      extract(epoch from next_attempt_at - now()) as wait_seconds
               from app.calendar_outbox where tutor_id = $1 and processed_at is null order by id""",
            user.id,
        )
    )


async def event_id_of(db: asyncpg.Pool[asyncpg.Record], lesson_id: str) -> str | None:
    value: str | None = await db.fetchval(
        "select gcal_event_id from app.lessons where id = $1", uuid.UUID(lesson_id)
    )
    return value


def by_lesson(google: FakeGoogle, calendar_id: str) -> dict[str | None, list[str]]:
    result: dict[str | None, list[str]] = defaultdict(list)
    for event_id, event in google.events(calendar_id).items():
        result[_prop(event)].append(event_id)
    return dict(result)


def assert_problem(response: httpx.Response, status: int, code: str, detail: str) -> dict[str, Any]:
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith(PROBLEM)
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert body["code"] == code
    assert body["detail"] == detail
    return body


# ---------------------------------------------------------------------------------------------
# Availability and status
# ---------------------------------------------------------------------------------------------


async def test_not_configured_reports_unavailable(client: httpx.AsyncClient, make_user: MakeUser) -> None:
    user = await make_user("Nina")
    body = await get_status(client, user)
    assert body == {
        "available": False,
        "connected": False,
        "google_email": None,
        "calendar_id": None,
        "status": None,
        "last_synced_at": None,
        "last_error": None,
        "pending": 0,
        "errors": 0,
    }
    response = await connect(client, user, "1//some-refresh-token")
    assert_problem(response, 503, "unavailable", MSG_NOT_CONFIGURED)
    assert_problem(await resync(client, user), 503, "unavailable", MSG_NOT_CONFIGURED)
    assert (await disconnect(client, user)).status_code == 204  # nothing to disconnect
    assert await sync_of(client).run_once() == 0


async def test_status_requires_auth(cal: httpx.AsyncClient) -> None:
    assert (await cal.get(CAL)).status_code == 401
    assert (await cal.post(f"{CAL}/connect", json={"provider_refresh_token": "x" * 20})).status_code == 401


# ---------------------------------------------------------------------------------------------
# Connect
# ---------------------------------------------------------------------------------------------


async def test_connect_creates_calendar_encrypts_token_and_queues_upcoming(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    past = await lesson(cal, user, student, days(-3))
    future = await lesson(cal, user, student, days(2))
    assert await calendar_state(cal, user, future) == {"status": "off", "error": None}
    assert await pending(db, user) == []  # no link: lesson changes are not queued

    refresh = google.grant()
    response = await connect(cal, user, refresh)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(google.calendars) == 1
    calendar_id, calendar = next(iter(google.calendars.items()))
    assert calendar["summary"] == "RipetiFlow"
    assert calendar["timeZone"] == "Europe/Rome"
    assert body == {
        "available": True,
        "connected": True,
        "google_email": google.email,
        "calendar_id": calendar_id,
        "status": "active",
        "last_synced_at": None,
        "last_error": None,
        "pending": 1,  # lessons from today on (docs/05)
        "errors": 0,
    }

    row = await link_row(db, user)
    assert row is not None
    assert row["status"] == "active"
    assert row["refresh_token_ciphertext"] != refresh
    assert refresh not in row["refresh_token_ciphertext"]
    assert Fernet(KEY.encode()).decrypt(row["refresh_token_ciphertext"].encode()).decode() == refresh
    assert CALENDAR_SCOPE in row["scopes"]
    assert row["sweep_requested_at"] is None

    assert await calendar_state(cal, user, future) == {"status": "pending", "error": None}
    assert await calendar_state(cal, user, past) == {"status": "off", "error": None}

    await drain(cal, db, user)
    assert await calendar_state(cal, user, future) == {"status": "synced", "error": None}
    assert by_lesson(google, calendar_id) == {future: [await event_id_of(db, future)]}
    status = await get_status(cal, user)
    assert status["pending"] == 0
    assert status["errors"] == 0
    assert status["last_synced_at"] is not None


@pytest.mark.parametrize(
    ("scope", "failure"),
    [
        pytest.param(LOGIN_SCOPES, None, id="scope-unticked"),
        pytest.param("", None, id="no-scope"),
        pytest.param(
            FULL_SCOPES,
            GoogleError("Request had insufficient authentication scopes.", 403, "insufficientPermissions"),
            id="calendar-403-insufficient-scope",
        ),
    ],
)
async def test_connect_without_calendar_permission_is_422(
    cal: httpx.AsyncClient,
    google: FakeGoogle,
    make_user: MakeUser,
    db: asyncpg.Pool[asyncpg.Record],
    scope: str,
    failure: GoogleError | None,
) -> None:
    user = await make_user("Sara")
    if failure is not None:
        google.fail("create_calendar", failure)
    response = await connect(cal, user, google.grant(scope))
    body = assert_problem(response, 422, "validation_error", MSG_SCOPE)
    assert body["errors"] == [{"field": "provider_refresh_token", "message": MSG_SCOPE}]
    if failure is None:
        # Checked right after the refresh: no Calendar call is made without the scope.
        assert google.names() == ["refresh_access_token"]
    assert google.calendars == {}
    assert await link_row(db, user) is None


async def test_connect_google_errors(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user = await make_user("Ugo")
    body = assert_problem(
        await connect(cal, user, "1//never-granted-token"), 422, "validation_error", MSG_AUTH
    )
    assert body["errors"] == [{"field": "provider_refresh_token", "message": MSG_AUTH}]

    google.fail("refresh_access_token", GoogleError("Backend Error", 503))
    assert_problem(await connect(cal, user, google.grant()), 502, "upstream_error", MSG_DOWN)

    google.fail("create_calendar", GoogleError("Backend Error", 503))
    response = await connect(cal, user, google.grant())
    body = assert_problem(response, 502, "upstream_error", MSG_CREATE_FAILED)
    assert "Backend Error" not in response.text
    assert await link_row(db, user) is None

    # Too short / missing token: request validation.
    response = await cal.post(
        f"{CAL}/connect", json={"provider_refresh_token": "short"}, headers=user.headers
    )
    assert response.status_code == 422


async def test_concurrent_connect_creates_exactly_one_calendar(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    await lesson(cal, user, student, days(1))
    google.delay = 0.05  # widen the race window between "read link" and "create calendar"
    refresh = google.grant()
    first, second = await asyncio.gather(connect(cal, user, refresh), connect(cal, user, refresh))
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert google.count("create_calendar") == 1
    assert len(google.calendars) == 1
    calendar_id = next(iter(google.calendars))
    assert first.json()["calendar_id"] == second.json()["calendar_id"] == calendar_id
    row = await link_row(db, user)
    assert row is not None
    assert row["calendar_id"] == calendar_id
    google.delay = 0.0
    await drain(cal, db, user)
    assert len(google.events(calendar_id)) == 1


async def test_a_burst_of_requests_from_one_tutor_does_not_take_the_pool(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser
) -> None:
    # The calendar lock is a transaction kept open across Google calls, so it pins a pool connection
    # (4 in tests). Six /connect of one tutor must queue in-process, not hold a connection each while
    # waiting for the advisory lock: another tutor's request still gets through.
    user = await make_user("Ivo")
    other = await make_user("Lia")
    gate = asyncio.Event()
    google.holds["create_calendar"] = gate  # the first connect holds the lock until released
    refresh = google.grant()
    burst = [asyncio.create_task(connect(cal, user, refresh)) for _ in range(6)]
    try:
        await asyncio.wait_for(google.entered["create_calendar"].wait(), 10)
        for _ in range(100):  # every request has passed the token check and reached the lock
            if google.count("refresh_access_token") == len(burst):
                break
            await asyncio.sleep(0.02)
        await asyncio.sleep(0.2)
        response = await asyncio.wait_for(cal.get(f"{API}/students", headers=other.headers), 5)
        assert response.status_code == 200, response.text
    finally:
        gate.set()
        results = await asyncio.gather(*burst)
    assert [r.status_code for r in results] == [200] * len(burst)
    assert google.count("create_calendar") == 1
    assert len({r.json()["calendar_id"] for r in results}) == 1


# ---------------------------------------------------------------------------------------------
# Worker: events
# ---------------------------------------------------------------------------------------------


async def test_events_follow_lessons_insert_update_delete(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    tz = "America/New_York"
    user, student = await tutor_with_student(cal, make_user, "Marta", timezone=tz)
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    assert google.calendars[calendar_id]["timeZone"] == tz

    subjects = (await cal.get(f"{API}/subjects", headers=user.headers)).json()["items"]
    maths = next(s["id"] for s in subjects if s["name"] == "Matematica")
    day = days(3, tz)
    with_subject = await lesson(
        cal,
        user,
        student,
        day,
        start="15:00",
        end="16:30",
        subject_id=maths,
        topic="Equazioni",
        notes="Nota privata: paga in ritardo",
    )
    plain = await lesson(cal, user, student, days(4, tz), start="09:00", end="10:00", subject_id=None)
    await drain(cal, db, user)

    event_id = await event_id_of(db, with_subject)
    assert event_id is not None
    event = google.events(calendar_id)[event_id]
    assert event == {
        "status": "confirmed",
        "summary": "Matematica · Luca Bianchi",
        "description": f"Equazioni\n\nScheda studente: {PUBLIC_URL}/studenti/{student}",
        "start": {"dateTime": f"{day.isoformat()}T15:00:00", "timeZone": tz},
        "end": {"dateTime": f"{day.isoformat()}T16:30:00", "timeZone": tz},
        "extendedProperties": {"private": {LESSON_PROPERTY: with_subject}},
    }
    assert "privata" not in str(google.events(calendar_id))  # notes are never sent (D-13)
    plain_event = google.events(calendar_id)[str(await event_id_of(db, plain))]
    assert plain_event["summary"] == "Lezione · Luca Bianchi"
    assert plain_event["description"] == f"Scheda studente: {PUBLIC_URL}/studenti/{student}"

    # Update: the same event is rewritten (PUT), no new event.
    inserts = google.count("insert_event")
    new_day = days(5, tz)
    await patch_lesson(cal, user, with_subject, date=str(new_day), start_time="17:00", end_time="18:00")
    await drain(cal, db, user)
    assert google.count("insert_event") == inserts
    event = google.events(calendar_id)[event_id]
    assert event["start"] == {"dateTime": f"{new_day.isoformat()}T17:00:00", "timeZone": tz}
    assert event["end"] == {"dateTime": f"{new_day.isoformat()}T18:00:00", "timeZone": tz}
    assert await calendar_state(cal, user, with_subject) == {"status": "synced", "error": None}

    # Notes only: nothing to push.
    calls = len(google.calls)
    await patch_lesson(cal, user, with_subject, notes="Altra nota privata")
    assert await pending(db, user) == []
    await drain(cal, db, user)
    assert len(google.calls) == calls

    # Renaming the student refreshes the upcoming events.
    response = await cal.patch(
        f"{API}/students/{student}", json={"first_name": "Luca M."}, headers=user.headers
    )
    assert response.status_code == 200, response.text
    await drain(cal, db, user)
    assert google.events(calendar_id)[event_id]["summary"] == "Matematica · Luca M. Bianchi"

    # An event deleted by hand in Google is recreated on the next change.
    del google.events(calendar_id)[event_id]
    await patch_lesson(cal, user, with_subject, topic="Disequazioni")
    await drain(cal, db, user)
    recreated = await event_id_of(db, with_subject)
    assert recreated is not None
    assert recreated != event_id
    assert google.events(calendar_id)[recreated]["description"].startswith("Disequazioni\n\n")

    # Delete.
    await delete_lesson(cal, user, with_subject)
    await drain(cal, db, user)
    assert with_subject not in by_lesson(google, calendar_id)
    assert list(by_lesson(google, calendar_id)) == [plain]


async def test_worker_coalesces_changes_per_lesson(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]

    lesson_id = await lesson(cal, user, student, days(1), topic="Uno")
    await patch_lesson(cal, user, lesson_id, topic="Due")
    await patch_lesson(cal, user, lesson_id, topic="Tre", start_time="16:00", end_time="17:00")
    assert [r["op"] for r in await pending(db, user)] == ["upsert", "upsert", "upsert"]

    assert await sync_of(cal).run_once() == 1
    assert google.count("insert_event") == 1
    assert google.count("update_event") == 0
    assert await pending(db, user) == []
    event = google.events(calendar_id)[str(await event_id_of(db, lesson_id))]
    assert event["description"].startswith("Tre\n\n")
    assert event["start"]["dateTime"].endswith("T16:00:00")

    # Created and deleted before the worker ran: the latest operation wins, nothing reaches Google.
    short_lived = await lesson(cal, user, student, days(2))
    await delete_lesson(cal, user, short_lived)
    assert [r["op"] for r in await pending(db, user)] == ["upsert", "delete"]
    await drain(cal, db, user)
    assert google.count("insert_event") == 1
    assert short_lived not in by_lesson(google, calendar_id)


# ---------------------------------------------------------------------------------------------
# Worker: errors
# ---------------------------------------------------------------------------------------------


def test_backoff_schedule_reaches_six_hours_in_seven_retries() -> None:
    assert [backoff(n) for n in range(1, 8)] == [dt.timedelta(minutes=m) for m in DELAYS_MINUTES]
    assert backoff(7) == dt.timedelta(hours=6)


@pytest.mark.parametrize(
    ("error", "text"),
    [
        (GoogleError("network error: ConnectError"), "Google Calendar non è raggiungibile."),
        (GoogleError("Backend Error", 503), "Google Calendar non risponde."),
        (
            GoogleError("Rate Limit Exceeded", 403, "rateLimitExceeded"),
            "Limite di richieste a Google Calendar raggiunto.",
        ),
        (GoogleError("Too Many Requests", 429), "Limite di richieste a Google Calendar raggiunto."),
        (GoogleUnauthorized("Invalid Credentials", 401), "La sessione con Google è scaduta."),
        (
            GoogleError("Request had insufficient authentication scopes.", 403, "insufficientPermissions"),
            "Manca l'autorizzazione a Google Calendar: ricollega il calendario.",
        ),
        (GoogleError("Forbidden", 403, "forbidden"), "Google Calendar ha rifiutato l'operazione."),
        (GoogleNotFound("Not Found", 404), "Calendario o evento non trovato su Google."),
        (GoogleError("Bad Request", 400, "badRequest"), "Google Calendar non ha accettato l'evento."),
    ],
)
def test_failure_text_is_italian(error: GoogleError, text: str) -> None:
    assert failure_text(error) == text


async def test_backoff_then_parking_with_italian_errors(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    lesson_id = await lesson(cal, user, student, days(1))
    google.fail("insert_event", *[GoogleError("Backend Error", 503, "backendError")] * MAX_ATTEMPTS)
    sync = sync_of(cal)

    for attempt in range(1, MAX_ATTEMPTS + 1):
        await sync.run_once()
        (row,) = await pending(db, user)
        assert row["attempts"] == attempt
        if attempt < MAX_ATTEMPTS:
            expected = DELAYS_MINUTES[attempt - 1] * 60
            assert expected - 30 < row["wait_seconds"] <= expected, (attempt, row["wait_seconds"])
            assert row["last_error"] == "Google Calendar non risponde." + RETRY
            # Not due yet: another iteration does not call Google.
            calls = len(google.calls)
            await sync.run_once()
            assert len(google.calls) == calls
            await make_due(db, user)
    assert google.count("insert_event") == MAX_ATTEMPTS
    parked_text = "Google Calendar non risponde." + PARKED
    assert row["last_error"] == parked_text
    assert await calendar_state(cal, user, lesson_id) == {"status": "error", "error": parked_text}
    status = await get_status(cal, user)
    assert (status["pending"], status["errors"]) == (0, 1)
    assert status["last_error"] is None  # the link itself is fine

    # Parked: never claimed again, even when due.
    await make_due(db, user)
    await sync.run_once()
    assert google.count("insert_event") == MAX_ATTEMPTS

    # "Risincronizza" re-queues it.
    response = await resync(cal, user)
    assert response.status_code == 202, response.text
    await drain(cal, db, user)
    assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}
    assert len(google.events(status["calendar_id"])) == 1


async def test_raw_google_text_never_reaches_the_lesson(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    await connected(cal, user, google)
    lesson_id = await lesson(cal, user, student, days(1))
    google.fail("insert_event", GoogleError("Rate Limit Exceeded", 403, "rateLimitExceeded"))
    await sync_of(cal).run_once()
    state = await calendar_state(cal, user, lesson_id)
    assert state == {"status": "error", "error": "Limite di richieste a Google Calendar raggiunto." + RETRY}
    await make_due(db, user)
    await drain(cal, db, user)
    assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}


async def test_invalid_grant_revokes_link_and_reconnect_catches_up(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, refresh = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    moved = await lesson(cal, user, student, days(-2), topic="Passata")
    cancelled = await lesson(cal, user, student, days(3))
    await drain(cal, db, user)
    assert len(google.events(calendar_id)) == 2

    # Google drops the grant (Testing mode: every 7 days). The cached access token dies with it.
    google.expire(refresh)
    upcoming = await lesson(cal, user, student, days(4))
    sync = sync_of(cal)
    await sync.run_once()
    (row,) = await pending(db, user)
    assert row["last_error"] == "La sessione con Google è scaduta." + RETRY
    await make_due(db, user)
    await sync.run_once()  # refresh -> invalid_grant

    row_link = await link_row(db, user)
    assert row_link is not None
    assert (row_link["status"], row_link["last_error"]) == ("revoked", MSG_REVOKED)
    status = await get_status(cal, user)
    assert status["connected"] is False
    assert status["status"] == "revoked"
    assert status["last_error"] == MSG_REVOKED
    assert status["calendar_id"] == calendar_id
    assert await calendar_state(cal, user, upcoming) == {"status": "error", "error": MSG_REVOKED}
    assert_problem(await resync(cal, user), 409, "conflict", MSG_REVOKED)

    # While revoked: a past lesson is moved (not queued: sync is off) and a lesson is cancelled
    # (its delete is queued because it has an event, then parked by the worker).
    await patch_lesson(cal, user, moved, start_time="09:00", end_time="10:00")
    await delete_lesson(cal, user, cancelled)
    await sync.run_once()
    assert {(r["op"], r["attempts"], r["last_error"]) for r in await pending(db, user)} == {
        ("upsert", MAX_ATTEMPTS, MSG_REVOKED),
        ("delete", MAX_ATTEMPTS, MSG_REVOKED),
    }
    assert google.count("delete_event") == 0

    # Reconnect: same calendar, parked rows re-armed, the past edit re-queued.
    status, _ = await connected(cal, user, google)
    assert status["calendar_id"] == calendar_id
    assert status["status"] == "active"
    assert google.count("create_calendar") == 1
    await drain(cal, db, user)
    events = by_lesson(google, calendar_id)
    assert cancelled not in events
    assert set(events) == {moved, upcoming}
    moved_event = google.events(calendar_id)[events[moved][0]]
    assert moved_event["start"]["dateTime"].endswith("T09:00:00")
    for lesson_id in (moved, upcoming):
        assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}


async def test_a_stale_refresh_failure_does_not_revoke_a_fresh_reconnect(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    _, old_refresh = await connected(cal, user, google)
    google.expire(old_refresh)
    sync = sync_of(cal)
    sync._tokens.clear()  # the worker has to refresh the stored (dead) token
    lesson_id = await lesson(cal, user, student, days(1))

    # The worker's refresh of the old token is still in flight when the tutor reconnects.
    refresh_in_flight = asyncio.Event()
    release = asyncio.Event()
    real_refresh = google.refresh_access_token

    async def slow_refresh(token: str) -> AccessToken:
        if token == old_refresh:
            refresh_in_flight.set()
            await release.wait()
        return await real_refresh(token)

    google.refresh_access_token = slow_refresh  # type: ignore[method-assign]
    worker = asyncio.create_task(sync.run_once())
    await asyncio.wait_for(refresh_in_flight.wait(), 10)
    reconnected, _ = await connected(cal, user, google)
    release.set()
    await worker  # invalid_grant for the OLD token

    row = await link_row(db, user)
    assert row is not None
    assert (row["status"], row["last_error"]) == ("active", None)
    assert all(r["attempts"] == 0 for r in await pending(db, user))  # nothing parked
    await drain(cal, db, user)
    assert list(by_lesson(google, reconnected["calendar_id"])) == [lesson_id]
    assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}


async def test_resync_checks_the_grant_not_the_cached_access_token(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    # The tutor removes the app's access from their Google account: the cached access token dies
    # with the grant. "Risincronizza" reports the revocation (409), not "Google non risponde" (502).
    user, student = await tutor_with_student(cal, make_user)
    _, refresh = await connected(cal, user, google)
    lesson_id = await lesson(cal, user, student, days(1))
    await drain(cal, db, user)
    google.expire(refresh)

    assert_problem(await resync(cal, user), 409, "conflict", MSG_REVOKED)
    row = await link_row(db, user)
    assert row is not None
    assert (row["status"], row["last_error"]) == ("revoked", MSG_REVOKED)
    assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}


# ---------------------------------------------------------------------------------------------
# Disconnect / reconnect
# ---------------------------------------------------------------------------------------------


async def test_disconnect_keeps_calendar_and_reconnect_reuses_it(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, refresh = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    past_edited = await lesson(cal, user, student, days(-5), topic="Vecchio")
    past_kept = await lesson(cal, user, student, days(-4))
    future_kept = await lesson(cal, user, student, days(2))
    future_cancelled = await lesson(cal, user, student, days(3))
    await drain(cal, db, user)
    assert len(google.events(calendar_id)) == 4
    kept_event = await event_id_of(db, past_kept)

    response = await disconnect(cal, user)
    assert response.status_code == 204, response.text
    assert google.revoked == [refresh]
    assert google.count("delete_calendar") == 0
    row = await link_row(db, user)
    assert row is not None
    assert row["status"] == "disconnected"
    assert row["refresh_token_ciphertext"] is None
    assert row["calendar_id"] == calendar_id  # kept for the reconnect
    assert await get_status(cal, user) == {
        "available": True,
        "connected": False,
        "google_email": None,
        "calendar_id": None,
        "status": None,
        "last_synced_at": None,
        "last_error": None,
        "pending": 0,
        "errors": 0,
    }
    assert await calendar_state(cal, user, past_kept) == {"status": "off", "error": None}
    assert_problem(await resync(cal, user), 409, "conflict", MSG_NOT_CONNECTED)

    # While disconnected nothing reaches Google.
    calls = len(google.calls)
    await patch_lesson(cal, user, past_edited, topic="Nuovo argomento")
    await delete_lesson(cal, user, future_cancelled)
    created_meanwhile = await lesson(cal, user, student, days(-1))
    await sync_of(cal).run_once()
    assert len(google.calls) == calls
    assert await pending(db, user) == []
    assert (await disconnect(cal, user)).status_code == 204  # idempotent
    assert google.revoked == [refresh]

    # Reconnect: the same calendar, no event ids forgotten, what changed meanwhile is caught up.
    status, _ = await connected(cal, user, google)
    assert status["calendar_id"] == calendar_id
    assert len(google.calendars) == 1
    assert google.count("create_calendar") == 1
    assert await event_id_of(db, past_kept) == kept_event
    row = await link_row(db, user)
    assert row is not None
    assert row["sweep_requested_at"] is not None  # removes events of lessons deleted meanwhile
    await drain(cal, db, user)

    events = by_lesson(google, calendar_id)
    assert set(events) == {past_edited, past_kept, future_kept, created_meanwhile}
    assert all(len(ids) == 1 for ids in events.values())
    assert events[past_kept] == [kept_event]
    edited = google.events(calendar_id)[events[past_edited][0]]
    assert edited["description"].startswith("Nuovo argomento\n\n")
    for lesson_id in (past_edited, past_kept, future_kept, created_meanwhile):
        assert await event_id_of(db, lesson_id) == events[lesson_id][0]
    assert (await link_row(db, user))["sweep_requested_at"] is None  # type: ignore[index]


async def test_reconnect_does_not_push_history_touched_by_bookkeeping(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    # Lessons from before the first connection are never pushed by a connect. Re-pricing them or
    # editing their notes while sync is off (fields that are not in the event) must not push them on
    # the reconnect either: only what sync missed is caught up.
    user, student = await tutor_with_student(cal, make_user)
    history = [await lesson(cal, user, student, days(-30 - i)) for i in range(3)]
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    pushed_past = await lesson(cal, user, student, days(-10))  # created while active: pushed
    await drain(cal, db, user)
    assert list(by_lesson(google, calendar_id)) == [pushed_past]
    assert (await disconnect(cal, user)).status_code == 204

    response = await cal.post(
        f"{API}/students/{student}/rates",
        json={"hourly_rate_cents": 2500, "effective_from": str(days(-60)), "reprice_existing": True},
        headers=user.headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["repriced_lessons"] == 4
    await patch_lesson(cal, user, history[0], notes="Ripassare le frazioni")
    created_meanwhile = await lesson(cal, user, student, days(-5))

    status, _ = await connected(cal, user, google)
    assert status["calendar_id"] == calendar_id
    await drain(cal, db, user)
    assert set(by_lesson(google, calendar_id)) == {pushed_past, created_meanwhile}
    for lesson_id in history:
        assert await event_id_of(db, lesson_id) is None


async def test_disconnect_with_remove_calendar(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, refresh = await connected(cal, user, google)
    old_calendar = status["calendar_id"]
    future = await lesson(cal, user, student, days(1))
    await drain(cal, db, user)

    response = await disconnect(cal, user, remove_calendar=True)
    assert response.status_code == 204, response.text
    assert old_calendar not in google.calendars
    assert google.revoked == [refresh]
    row = await link_row(db, user)
    assert row is not None
    assert (row["status"], row["calendar_id"], row["refresh_token_ciphertext"]) == (
        "disconnected",
        None,
        None,
    )

    # A later connect creates a new calendar and pushes the lessons again.
    status, _ = await connected(cal, user, google)
    assert status["calendar_id"] != old_calendar
    assert list(google.calendars) == [status["calendar_id"]]
    await drain(cal, db, user)
    assert list(by_lesson(google, status["calendar_id"])) == [future]
    assert await calendar_state(cal, user, future) == {"status": "synced", "error": None}


async def test_disconnect_calendar_delete_failure_is_502_and_retryable(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user = await make_user("Pia")
    status, refresh = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    before = await link_row(db, user)

    google.fail("delete_calendar", GoogleError("Backend Error", 503))
    response = await disconnect(cal, user, remove_calendar=True)
    assert_problem(response, 502, "upstream_error", MSG_DELETE_FAILED)
    assert "Backend Error" not in response.text
    # Nothing changed: the link still works, so the tutor can retry.
    assert await link_row(db, user) == before
    assert google.revoked == []
    assert refresh in google.grants
    assert calendar_id in google.calendars
    assert (await get_status(cal, user))["connected"] is True

    response = await disconnect(cal, user, remove_calendar=True)
    assert response.status_code == 204, response.text
    assert calendar_id not in google.calendars
    assert google.revoked == [refresh]


async def test_disconnect_always_attempts_the_revoke(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    # The grant is already gone: the calendar cannot be deleted, the revoke is still attempted.
    user = await make_user("Rita")
    status, refresh = await connected(cal, user, google)
    google.expire(refresh)
    response = await disconnect(cal, user, remove_calendar=True)
    assert response.status_code == 204, response.text
    assert google.revoked == [refresh]
    row = await link_row(db, user)
    assert row is not None
    assert (row["status"], row["refresh_token_ciphertext"]) == ("disconnected", None)
    assert row["calendar_id"] == status["calendar_id"]  # still in Google: a reconnect re-uses it

    # Google does not answer the revoke: the link is switched off anyway.
    other = await make_user("Sofia")
    _, other_refresh = await connected(cal, other, google)
    google.fail("revoke", GoogleError("network error: ConnectTimeout"))
    response = await disconnect(cal, other)
    assert response.status_code == 204, response.text
    assert google.calls[-1] == ("revoke",)
    assert other_refresh not in google.revoked
    row = await link_row(db, other)
    assert row is not None
    assert (row["status"], row["refresh_token_ciphertext"]) == ("disconnected", None)

    # Without remove_calendar there is no refresh: just the revoke.
    third = await make_user("Tea")
    _, third_refresh = await connected(cal, third, google)
    calls = len(google.calls)
    assert (await disconnect(cal, third)).status_code == 204
    assert google.calls[calls:] == [("revoke",)]
    assert third_refresh in google.revoked


# ---------------------------------------------------------------------------------------------
# Resync and orphan sweep
# ---------------------------------------------------------------------------------------------


async def test_resync_sweep_adopts_unlinked_and_never_deletes_past_events(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    past_unlinked = await lesson(cal, user, student, days(-10))
    past_linked = await lesson(cal, user, student, days(-3))
    future = await lesson(cal, user, student, days(2))
    await drain(cal, db, user)
    unlinked_event = await event_id_of(db, past_unlinked)
    future_event = await event_id_of(db, future)

    # Legacy state: an event exists but the lesson lost its id (older versions cleared them).
    await db.execute("update app.lessons set gcal_event_id = null where id = $1", uuid.UUID(past_unlinked))
    other, other_student = await tutor_with_student(cal, make_user, "Bruno")
    foreign_lesson = await lesson(cal, other, other_student, days(1))
    orphan_manual = google.add_event(calendar_id, None, "Evento creato a mano")
    orphan_deleted = google.add_event(calendar_id, str(uuid.uuid4()))
    orphan_foreign = google.add_event(calendar_id, foreign_lesson)
    orphan_garbage = google.add_event(calendar_id, "not-a-uuid")
    duplicate = google.add_event(calendar_id, future)

    response = await resync(cal, user, "upcoming")
    assert response.status_code == 202, response.text
    assert response.json() == {"queued": 1}
    row = await link_row(db, user)
    assert row is not None
    assert row["sweep_requested_at"] is not None  # persisted, survives a restart

    await drain(cal, db, user)
    events = google.events(calendar_id)
    for gone in (orphan_manual, orphan_deleted, orphan_foreign, orphan_garbage, duplicate):
        assert gone not in events
    assert by_lesson(google, calendar_id) == {
        past_unlinked: [unlinked_event],
        past_linked: [await event_id_of(db, past_linked)],
        future: [future_event],
    }
    assert await event_id_of(db, past_unlinked) == unlinked_event  # adopted
    assert (await link_row(db, user))["sweep_requested_at"] is None  # type: ignore[index]

    # "all" re-pushes every lesson; nothing is deleted.
    deletes = google.count("delete_event")
    response = await resync(cal, user, "all")
    assert response.json() == {"queued": 3}
    await drain(cal, db, user)
    assert google.count("delete_event") == deletes
    assert len(google.events(calendar_id)) == 3
    assert google.count("insert_event") == 3  # only the original inserts: everything else was adopted


async def test_resync_restores_events_deleted_by_hand(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    # Deleted in Google's UI, an event is kept as "cancelled" under the same id: the stored id still
    # answers, so the update itself has to bring it back ("ricrea mancanti", D-31).
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    lesson_id = await lesson(cal, user, student, days(2))
    await drain(cal, db, user)
    event_id = str(await event_id_of(db, lesson_id))
    google.cancel(calendar_id, event_id)
    assert google.visible(calendar_id) == {}

    assert (await resync(cal, user, "upcoming")).status_code == 202
    await drain(cal, db, user)
    assert google.visible(calendar_id) == {lesson_id: [event_id]}
    assert google.events(calendar_id)[event_id]["status"] == "confirmed"
    assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}


async def test_resync_keeps_pending_changes_out_of_scope(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    past = await lesson(cal, user, student, days(-2), start="15:00", end="16:00")
    future = await lesson(cal, user, student, days(2))
    await drain(cal, db, user)

    # A past lesson is moved while Google fails: its upsert waits on the backoff.
    google.fail("update_event", GoogleError("Backend Error", 503))
    await patch_lesson(cal, user, past, start_time="09:00", end_time="10:00")
    await sync_of(cal).run_once()
    (row,) = await pending(db, user)
    assert row["attempts"] == 1

    # "Risincronizza" (upcoming) re-queues the future lesson and re-arms the past one: not dropped.
    response = await resync(cal, user, "upcoming")
    assert response.json() == {"queued": 1}
    rows = await pending(db, user)
    assert {(str(r["lesson_id"]), r["attempts"], r["last_error"]) for r in rows} == {
        (past, 0, None),
        (future, 0, None),
    }
    assert await calendar_state(cal, user, past) == {"status": "pending", "error": None}
    await drain(cal, db, user)
    event = google.events(calendar_id)[str(await event_id_of(db, past))]
    assert event["start"]["dateTime"].endswith("T09:00:00")
    assert await calendar_state(cal, user, past) == {"status": "synced", "error": None}


async def test_sweep_request_survives_restart_and_failures_do_not_poll(
    app_client: AppFactory,
    cal: httpx.AsyncClient,
    google: FakeGoogle,
    make_user: MakeUser,
    db: asyncpg.Pool[asyncpg.Record],
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    calendar_id = status["calendar_id"]
    await lesson(cal, user, student, days(1))
    await drain(cal, db, user)
    orphan = google.add_event(calendar_id, None)
    assert (await resync(cal, user)).status_code == 202

    # The sweep waits for the outbox to drain.
    sync = sync_of(cal)
    google.fail("update_event", GoogleError("Backend Error", 503))
    await sync.run_once()
    assert google.count("list_events") == 0
    assert len(await pending(db, user)) == 1

    # A failed sweep is postponed, not retried on every iteration.
    await make_due(db, user)
    google.fail("list_events", GoogleError("Backend Error", 503))
    await sync.run_once()
    assert google.count("list_events") == 1
    postponed = await db.fetchval(
        """select extract(epoch from sweep_requested_at - now())
           from app.google_calendar_links where tutor_id = $1""",
        user.id,
    )
    assert 14 * 60 < postponed <= 15 * 60
    await sync.run_once()
    await sync.run_once()
    assert google.count("list_events") == 1
    assert orphan in google.events(calendar_id)

    # "Restart": a brand-new app (fresh worker, empty memory) still runs the requested sweep.
    await db.execute(
        "update app.google_calendar_links set sweep_requested_at = now() where tutor_id = $1", user.id
    )
    restarted = await app_client(google=google, **calendar_settings())
    await drain(restarted, db, user)
    assert orphan not in google.events(calendar_id)
    assert (await link_row(db, user))["sweep_requested_at"] is None  # type: ignore[index]


# ---------------------------------------------------------------------------------------------
# Calendar deleted in Google
# ---------------------------------------------------------------------------------------------


async def test_calendar_deleted_in_google_is_recovered_by_the_worker(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    first = status["calendar_id"]
    past = await lesson(cal, user, student, days(-6))
    future = await lesson(cal, user, student, days(6))
    await drain(cal, db, user)

    del google.calendars[first]  # deleted by hand in Google
    await patch_lesson(cal, user, future, start_time="18:00", end_time="19:00")
    await drain(cal, db, user)

    row = await link_row(db, user)
    assert row is not None
    second = row["calendar_id"]
    assert second != first
    assert list(google.calendars) == [second]
    assert row["status"] == "active"
    # Every lesson that had an event is back, with ids pointing to the new calendar.
    events = by_lesson(google, second)
    assert set(events) == {past, future}
    for lesson_id in (past, future):
        assert await event_id_of(db, lesson_id) == events[lesson_id][0]
        assert await calendar_state(cal, user, lesson_id) == {"status": "synced", "error": None}
    assert google.events(second)[events[future][0]]["start"]["dateTime"].endswith("T18:00:00")
    assert (await get_status(cal, user))["calendar_id"] == second

    # Recovery failing: back off like any error, with an Italian message, and no polling.
    del google.calendars[second]
    google.fail("create_calendar", GoogleError("Backend Error", 503))
    await patch_lesson(cal, user, future, topic="Ripasso")
    sync = sync_of(cal)
    await sync.run_once()
    (pending_row,) = await pending(db, user)
    assert pending_row["attempts"] == 1
    assert pending_row["last_error"] == "Google Calendar non risponde." + RETRY
    calls = len(google.calls)
    for _ in range(3):
        await sync.run_once()
    assert len(google.calls) == calls

    await make_due(db, user)
    await drain(cal, db, user)
    third = (await link_row(db, user))["calendar_id"]  # type: ignore[index]
    assert third not in (first, second)
    assert set(by_lesson(google, third)) == {past, future}


async def test_resync_recreates_a_deleted_calendar(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    status, _ = await connected(cal, user, google)
    first = status["calendar_id"]
    past = await lesson(cal, user, student, days(-6))
    future = await lesson(cal, user, student, days(6))
    await drain(cal, db, user)
    del google.calendars[first]

    response = await resync(cal, user, "upcoming")
    assert response.status_code == 202, response.text
    assert response.json() == {"queued": 2}  # upcoming + every lesson that had an event
    status = await get_status(cal, user)
    assert status["calendar_id"] != first
    assert list(google.calendars) == [status["calendar_id"]]
    await drain(cal, db, user)
    assert set(by_lesson(google, status["calendar_id"])) == {past, future}

    # Google down while checking: 502 with an Italian message.
    google.fail("calendar_exists", GoogleError("Backend Error", 503))
    assert_problem(await resync(cal, user), 502, "upstream_error", MSG_DOWN)


async def test_reconnect_after_calendar_deleted_by_hand_restores_events(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    user, student = await tutor_with_student(cal, make_user)
    never_pushed = await lesson(cal, user, student, days(-20))  # past, before the first connect
    status, _ = await connected(cal, user, google)
    first = status["calendar_id"]
    past = await lesson(cal, user, student, days(-6))
    await drain(cal, db, user)
    assert set(by_lesson(google, first)) == {past}
    assert (await disconnect(cal, user)).status_code == 204
    del google.calendars[first]

    status, _ = await connected(cal, user, google)
    assert status["calendar_id"] != first
    await drain(cal, db, user)
    assert set(by_lesson(google, status["calendar_id"])) == {past}
    assert await event_id_of(db, never_pushed) is None


# ---------------------------------------------------------------------------------------------
# The real HTTP client (no network: httpx.MockTransport)
# ---------------------------------------------------------------------------------------------


def _google_handler(log: list[str]) -> Callable[[httpx.Request], httpx.Response]:
    scope_error = {
        "error": {
            "code": 403,
            "message": "Request had insufficient authentication scopes.",
            "status": "PERMISSION_DENIED",
            "errors": [{"reason": "insufficientPermissions", "domain": "global"}],
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        log.append(f"{request.method} {request.url.host}{path}")
        body = request.content.decode()
        if path == "/token":
            if "refresh_token=dead" in body:
                return httpx.Response(
                    400,
                    json={
                        "error": "invalid_grant",
                        "error_description": "Token has been expired or revoked.",
                    },
                )
            return httpx.Response(
                200, json={"access_token": "ya29.ok", "expires_in": 3599, "scope": CALENDAR_SCOPE}
            )
        if path == "/revoke":
            if "token=gone" in body:
                return httpx.Response(
                    400, json={"error": "invalid_token", "error_description": "Token expired"}
                )
            if "token=flaky" in body:
                return httpx.Response(503, text="unavailable")
            return httpx.Response(200)
        if path.endswith("/calendars") and request.method == "POST":
            return httpx.Response(403, json=scope_error)
        if "/calendars/missing" in path:
            return httpx.Response(404, json={"error": {"code": 404, "message": "Not Found"}})
        return httpx.Response(500, json={"error": {"code": 500, "message": "Backend Error"}})

    return handler


async def test_http_client_errors_and_revoke() -> None:
    from app.calendar.google import HttpGoogleCalendar

    log: list[str] = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(_google_handler(log))) as http:
        client = HttpGoogleCalendar(http, "client-id", "client-secret")
        token = await client.refresh_access_token("good")
        assert (token.token, token.scope) == ("ya29.ok", CALENDAR_SCOPE)
        with pytest.raises(GoogleAuthError):
            await client.refresh_access_token("dead")

        with pytest.raises(GoogleError) as scope_exc:
            await client.create_calendar("ya29.ok", "RipetiFlow", "Europe/Rome")
        assert scope_exc.value.status == 403
        assert scope_exc.value.reason == "insufficientPermissions"
        assert scope_exc.value.insufficient_scope
        assert not scope_exc.value.rate_limited

        assert await client.calendar_exists("ya29.ok", "missing@group.calendar.google.com") is False
        await client.delete_calendar("ya29.ok", "missing@group.calendar.google.com")  # gone = ok
        with pytest.raises(GoogleNotFound):
            await client.list_events("ya29.ok", "missing@group.calendar.google.com")

        await client.revoke("ok")
        await client.revoke("gone")  # already revoked: nothing to do
        with pytest.raises(GoogleError) as revoke_exc:
            await client.revoke("flaky")
        assert revoke_exc.value.status == 503

    assert not any("calendarList" in entry for entry in log)
    assert not hasattr(client, "find_calendar")


# ---------------------------------------------------------------------------------------------
# Tenancy
# ---------------------------------------------------------------------------------------------


async def test_cross_tenant_isolation(
    cal: httpx.AsyncClient, google: FakeGoogle, make_user: MakeUser, db: asyncpg.Pool[asyncpg.Record]
) -> None:
    anna, anna_student = await tutor_with_student(cal, make_user, "Anna")
    bruno, bruno_student = await tutor_with_student(cal, make_user, "Bruno")
    carla, carla_student = await tutor_with_student(cal, make_user, "Carla")
    anna_status, anna_refresh = await connected(cal, anna, google)
    bruno_status, _ = await connected(cal, bruno, google)
    assert anna_status["calendar_id"] != bruno_status["calendar_id"]

    anna_lesson = await lesson(cal, anna, anna_student, days(1))
    bruno_lesson = await lesson(cal, bruno, bruno_student, days(1))
    carla_lesson = await lesson(cal, carla, carla_student, days(1))
    assert await pending(db, carla) == []
    await drain(cal, db, anna, bruno, carla)
    assert list(by_lesson(google, anna_status["calendar_id"])) == [anna_lesson]
    assert list(by_lesson(google, bruno_status["calendar_id"])) == [bruno_lesson]
    assert await calendar_state(cal, carla, carla_lesson) == {"status": "off", "error": None}

    # Each tutor sees only their own link.
    assert (await get_status(cal, bruno))["calendar_id"] == bruno_status["calendar_id"]
    carla_status = await get_status(cal, carla)
    assert (carla_status["connected"], carla_status["calendar_id"]) == (False, None)
    response = await cal.get(f"{API}/lessons/{anna_lesson}", headers=bruno.headers)
    assert response.status_code == 404

    # Carla's operations never touch the others.
    assert_problem(await resync(cal, carla), 409, "conflict", MSG_NOT_CONNECTED)
    assert (await disconnect(cal, carla, remove_calendar=True)).status_code == 204
    # Bruno disconnecting leaves Anna's link and calendar alone.
    assert (await disconnect(cal, bruno, remove_calendar=True)).status_code == 204
    assert bruno_status["calendar_id"] not in google.calendars
    assert anna_status["calendar_id"] in google.calendars
    assert anna_refresh not in google.revoked
    row = await link_row(db, anna)
    assert row is not None
    assert row["status"] == "active"
    assert (await get_status(cal, anna))["connected"] is True
