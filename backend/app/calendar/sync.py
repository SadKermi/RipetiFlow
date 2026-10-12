"""Google Calendar one-way sync (D-31): connect/resync/disconnect + the outbox worker.

Lesson changes are queued in `app.calendar_outbox` by triggers, in the same transaction as the
change. The worker claims due rows with a short lease (`for update skip locked`), coalesces the
operations per lesson (the latest wins) and pushes them to the dedicated "RipetiFlow" calendar.
Events carry `extendedProperties.private.ripetiflow_lesson_id`, which makes every operation
idempotent: an event that already exists for a lesson is adopted instead of duplicated.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import uuid
from collections import defaultdict
from typing import Any, Literal

import asyncpg

from app.calendar.crypto import TokenCipher, TokenDecryptError
from app.calendar.google import (
    CALENDAR_SCOPE,
    CALENDAR_SUMMARY,
    LESSON_PROPERTY,
    AccessToken,
    GoogleAuthError,
    GoogleCalendarApi,
    GoogleError,
    GoogleNotFound,
    GoogleUnauthorized,
)
from app.core.auth import CurrentUser
from app.core.errors import ApiError, conflict, invalid
from app.db.pool import Conn, Database
from app.domain.common import display_name, tutor_clock
from app.domain.dashboard import calendar_counts
from app.schemas import CalendarStatus

logger = logging.getLogger("ripetiflow.calendar")

MAX_ATTEMPTS = 8
BATCH_SIZE = 100
LEASE = dt.timedelta(minutes=5)
REVOKED_MESSAGE = "Accesso a Google Calendar revocato: ricollega il calendario in Impostazioni."
NOT_CONFIGURED = "La sincronizzazione con Google Calendar non è configurata su questo server."


def backoff(attempts: int) -> dt.timedelta:
    """1 min, 2, 4, ... capped at 6 h (attempts counted after the failure)."""
    return min(dt.timedelta(minutes=2 ** max(attempts - 1, 0)), dt.timedelta(hours=6))


def event_body(lesson: asyncpg.Record | dict[str, Any], public_app_url: str) -> dict[str, Any]:
    """Event payload. Private notes are never sent (D-13, D-31)."""
    name = display_name(lesson["first_name"], lesson["last_name"])
    title = f"{lesson['subject_name']} · {name}" if lesson["subject_name"] else f"Lezione · {name}"
    link = f"{public_app_url.rstrip('/')}/studenti/{lesson['student_id']}"
    description = f"{lesson['topic']}\n\n" if lesson["topic"] else ""
    description += f"Scheda studente: {link}"
    day = lesson["lesson_date"].isoformat()
    return {
        "summary": title,
        "description": description,
        "start": {
            "dateTime": f"{day}T{lesson['start_time'].strftime('%H:%M')}:00",
            "timeZone": lesson["timezone"],
        },
        "end": {
            "dateTime": f"{day}T{lesson['end_time'].strftime('%H:%M')}:00",
            "timeZone": lesson["timezone"],
        },
        "extendedProperties": {"private": {LESSON_PROPERTY: str(lesson["id"])}},
    }


class CalendarSync:
    def __init__(
        self,
        db: Database,
        google: GoogleCalendarApi | None,
        cipher: TokenCipher | None,
        public_app_url: str,
        interval_seconds: float = 10.0,
    ) -> None:
        self.db = db
        self.google = google
        self.cipher = cipher
        self.public_app_url = public_app_url
        self.interval = interval_seconds
        self._tokens: dict[uuid.UUID, AccessToken] = {}
        self._wake = asyncio.Event()
        self._sweeps: set[uuid.UUID] = set()
        self._task: asyncio.Task[None] | None = None

    @property
    def available(self) -> bool:
        return self.google is not None and self.cipher is not None

    # -----------------------------------------------------------------------------------------
    # Worker lifecycle
    # -----------------------------------------------------------------------------------------

    def kick(self) -> None:
        self._wake.set()

    def start(self) -> None:
        if self._task is None and self.available:
            self._task = asyncio.create_task(self._loop(), name="calendar-outbox-worker")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _loop(self) -> None:
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("calendar worker iteration failed")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=self.interval)
            self._wake.clear()

    # -----------------------------------------------------------------------------------------
    # Tokens
    # -----------------------------------------------------------------------------------------

    async def _access_token(self, tutor_id: uuid.UUID, ciphertext: str) -> AccessToken:
        cached = self._tokens.get(tutor_id)
        if cached is not None and cached.fresh():
            return cached
        assert self.google is not None
        assert self.cipher is not None
        token = await self.google.refresh_access_token(self.cipher.decrypt(ciphertext))
        self._tokens[tutor_id] = token
        return token

    async def _mark_revoked(self, tutor_id: uuid.UUID, message: str = REVOKED_MESSAGE) -> None:
        self._tokens.pop(tutor_id, None)
        async with self.db.privileged_tx() as conn:
            await conn.execute(
                "update app.google_calendar_links set status = 'revoked', last_error = $2"
                " where tutor_id = $1",
                tutor_id,
                message,
            )
            # Park the pending rows as failed: lessons show the error until the user reconnects.
            await conn.execute(
                """update app.calendar_outbox set attempts = $2, last_error = $3
                   where tutor_id = $1 and processed_at is null""",
                tutor_id,
                MAX_ATTEMPTS,
                message,
            )

    # -----------------------------------------------------------------------------------------
    # Worker iteration
    # -----------------------------------------------------------------------------------------

    async def run_once(self) -> int:
        """Process one batch of due outbox rows; returns the number of lessons handled."""
        if not self.available:
            return 0
        async with self.db.privileged_tx() as conn:
            claimed = await conn.fetch(
                """update app.calendar_outbox o set next_attempt_at = now() + $1::interval
                   where o.id in (
                     select id from app.calendar_outbox
                     where processed_at is null and attempts < $2 and next_attempt_at <= now()
                     order by id limit $3 for update skip locked)
                   returning o.id, o.tutor_id, o.lesson_id, o.op, o.gcal_event_id, o.attempts""",
                LEASE,
                MAX_ATTEMPTS,
                BATCH_SIZE,
            )
        by_tutor: dict[uuid.UUID, dict[uuid.UUID, list[asyncpg.Record]]] = defaultdict(
            lambda: defaultdict(list)
        )
        for row in claimed:
            by_tutor[row["tutor_id"]][row["lesson_id"]].append(row)

        handled = 0
        for tutor_id, lessons in by_tutor.items():
            handled += await self._process_tutor(tutor_id, lessons)
        for tutor_id in list(self._sweeps):
            await self._maybe_sweep(tutor_id)
        return handled

    async def _process_tutor(
        self, tutor_id: uuid.UUID, lessons: dict[uuid.UUID, list[asyncpg.Record]]
    ) -> int:
        async with self.db.privileged_tx() as conn:
            link = await conn.fetchrow(
                "select calendar_id, status, refresh_token_ciphertext from app.google_calendar_links"
                " where tutor_id = $1",
                tutor_id,
            )
        all_ids = [r["id"] for rows in lessons.values() for r in rows]
        if link is None or link["calendar_id"] is None:
            await self._finish(all_ids, [])  # sync was switched off: nothing to push
            return 0
        if link["status"] != "active":
            await self._mark_revoked(tutor_id, REVOKED_MESSAGE)
            return 0
        try:
            token = await self._access_token(tutor_id, link["refresh_token_ciphertext"])
        except (GoogleAuthError, TokenDecryptError):
            await self._mark_revoked(tutor_id)
            return 0
        except GoogleError as exc:
            await self._retry(all_ids, exc.message)
            return 0

        handled = 0
        for lesson_id, rows in lessons.items():
            latest = max(rows, key=lambda r: r["id"])
            ids = [r["id"] for r in rows]
            try:
                await self._sync_lesson(token.token, link["calendar_id"], lesson_id, latest)
            except GoogleAuthError:
                await self._mark_revoked(tutor_id)
                return handled
            except GoogleUnauthorized as exc:
                self._tokens.pop(tutor_id, None)
                await self._retry(ids, exc.message)
                continue
            except GoogleError as exc:
                logger.warning("calendar sync failed for lesson %s: %s", lesson_id, exc.message)
                await self._retry(ids, exc.message)
                continue
            await self._finish(ids, [lesson_id], max(ids))
            handled += 1
        if handled:
            async with self.db.privileged_tx() as conn:
                await conn.execute(
                    "update app.google_calendar_links set last_synced_at = now(), last_error = null"
                    " where tutor_id = $1",
                    tutor_id,
                )
        return handled

    async def _sync_lesson(
        self, token: str, calendar_id: str, lesson_id: uuid.UUID, row: asyncpg.Record
    ) -> None:
        assert self.google is not None
        async with self.db.privileged_tx() as conn:
            lesson = await conn.fetchrow(
                """select l.id, l.student_id, l.lesson_date, l.start_time, l.end_time, l.topic,
                          l.gcal_event_id,
                          s.first_name, s.last_name, sj.name as subject_name, p.timezone
                   from app.lessons l
                   join app.students s on s.id = l.student_id
                   join app.profiles p on p.id = l.tutor_id
                   left join app.subjects sj on sj.id = l.subject_id
                   where l.id = $1""",
                lesson_id,
            )
        if row["op"] == "delete" or lesson is None:
            event_ids = [row["gcal_event_id"]] if row["gcal_event_id"] else []
            if not event_ids:
                event_ids = await self.google.find_lesson_events(token, calendar_id, str(lesson_id))
            for stale_id in event_ids:
                await self.google.delete_event(token, calendar_id, stale_id)
            return

        body = event_body(lesson, self.public_app_url)
        event_id: str | None = lesson["gcal_event_id"]
        if event_id:
            try:
                await self.google.update_event(token, calendar_id, event_id, body)
            except GoogleNotFound:  # deleted by hand in Google: recreate it
                event_id = None
        if not event_id:
            found = await self.google.find_lesson_events(token, calendar_id, str(lesson_id))
            if found:
                event_id = found[0]
                await self.google.update_event(token, calendar_id, event_id, body)
                for duplicate in found[1:]:
                    await self.google.delete_event(token, calendar_id, duplicate)
            else:
                event_id = await self.google.insert_event(token, calendar_id, body)
        async with self.db.privileged_tx() as conn:
            await conn.execute(
                "update app.lessons set gcal_event_id = $2, gcal_synced_at = now() where id = $1",
                lesson_id,
                event_id,
            )

    async def _finish(self, ids: list[int], lesson_ids: list[uuid.UUID], up_to: int | None = None) -> None:
        async with self.db.privileged_tx() as conn:
            await conn.execute(
                "update app.calendar_outbox set processed_at = now(), last_error = null"
                " where id = any($1::bigint[])",
                ids,
            )
            if lesson_ids and up_to is not None:
                # Older rows for the same lesson still waiting on a backoff are superseded too.
                await conn.execute(
                    """update app.calendar_outbox set processed_at = now()
                       where lesson_id = any($1::uuid[]) and processed_at is null and id <= $2""",
                    lesson_ids,
                    up_to,
                )

    async def _retry(self, ids: list[int], message: str) -> None:
        async with self.db.privileged_tx() as conn:
            rows = await conn.fetch(
                """update app.calendar_outbox set attempts = attempts + 1, last_error = left($2, 1000)
                   where id = any($1::bigint[]) returning id, attempts""",
                ids,
                message,
            )
            for row in rows:
                await conn.execute(
                    "update app.calendar_outbox set next_attempt_at = now() + $2::interval where id = $1",
                    row["id"],
                    backoff(row["attempts"]),
                )

    # -----------------------------------------------------------------------------------------
    # Orphan sweep (part of "Risincronizza")
    # -----------------------------------------------------------------------------------------

    def request_sweep(self, tutor_id: uuid.UUID) -> None:
        self._sweeps.add(tutor_id)
        self.kick()

    async def _maybe_sweep(self, tutor_id: uuid.UUID) -> None:
        assert self.google is not None
        async with self.db.privileged_tx() as conn:
            pending = await conn.fetchval(
                """select exists(select 1 from app.calendar_outbox
                   where tutor_id = $1 and processed_at is null and attempts < $2)""",
                tutor_id,
                MAX_ATTEMPTS,
            )
            link = await conn.fetchrow(
                "select calendar_id, status, refresh_token_ciphertext from app.google_calendar_links"
                " where tutor_id = $1",
                tutor_id,
            )
            known = {
                r["gcal_event_id"]
                for r in await conn.fetch(
                    "select gcal_event_id from app.lessons where tutor_id = $1 and gcal_event_id is not null",
                    tutor_id,
                )
            }
        if link is None or link["status"] != "active" or link["calendar_id"] is None:
            self._sweeps.discard(tutor_id)
            return
        if pending:  # wait until every lesson is in place, then remove what is left over
            return
        try:
            token = await self._access_token(tutor_id, link["refresh_token_ciphertext"])
            for event_id, _lesson in await self.google.list_events(token.token, link["calendar_id"]):
                if event_id not in known:
                    await self.google.delete_event(token.token, link["calendar_id"], event_id)
        except (GoogleAuthError, TokenDecryptError):
            await self._mark_revoked(tutor_id)
        except GoogleError as exc:
            logger.warning("orphan sweep failed for tutor %s: %s", tutor_id, exc.message)
            return
        self._sweeps.discard(tutor_id)

    # -----------------------------------------------------------------------------------------
    # API operations
    # -----------------------------------------------------------------------------------------

    async def status(self, conn: Conn) -> CalendarStatus:
        row = await conn.fetchrow(
            """select google_email, calendar_id, status, last_synced_at, last_error
               from app.google_calendar_links where tutor_id = (select auth.uid())"""
        )
        connected, pending, errors = await calendar_counts(conn)
        return CalendarStatus(
            available=self.available,
            connected=connected,
            google_email=row["google_email"] if row else None,
            calendar_id=row["calendar_id"] if row else None,
            status=row["status"] if row else None,
            last_synced_at=row["last_synced_at"] if row else None,
            last_error=row["last_error"] if row else None,
            pending=pending,
            errors=errors,
        )

    def _require_available(self) -> tuple[GoogleCalendarApi, TokenCipher]:
        if self.google is None or self.cipher is None:
            raise ApiError("unavailable", NOT_CONFIGURED)
        return self.google, self.cipher

    async def connect(self, user: CurrentUser, refresh_token: str) -> CalendarStatus:
        google, cipher = self._require_available()
        try:
            token = await google.refresh_access_token(refresh_token)
        except GoogleAuthError as exc:
            raise invalid(
                "Google non ha accettato l'autorizzazione: riprova a collegare il calendario.",
                "provider_refresh_token",
            ) from exc
        except GoogleError as exc:
            raise ApiError("upstream_error", "Google Calendar non risponde. Riprova tra poco.") from exc

        async with self.db.user_tx(user) as conn:
            clock = await tutor_clock(conn)
        async with self.db.privileged_tx() as conn:
            previous = await conn.fetchval(
                "select calendar_id from app.google_calendar_links where tutor_id = $1", user.id
            )
        try:
            calendar_id = None
            if previous and await google.calendar_exists(token.token, previous):
                calendar_id = previous
            if calendar_id is None:
                calendar_id = await google.find_calendar(token.token, CALENDAR_SUMMARY)
            if calendar_id is None:
                calendar_id = await google.create_calendar(token.token, CALENDAR_SUMMARY, clock.timezone)
            google_email = await google.user_email(token.token) or user.email
        except GoogleError as exc:
            raise ApiError("upstream_error", "Non è stato possibile creare il calendario su Google.") from exc

        scopes = token.scope.split() if token.scope else [CALENDAR_SCOPE]
        async with self.db.privileged_tx() as conn:
            await conn.execute(
                """insert into app.google_calendar_links
                     (tutor_id, google_email, calendar_id, refresh_token_ciphertext, scopes, status,
                      connected_at, last_error)
                   values ($1, $2, $3, $4, $5, 'active', now(), null)
                   on conflict (tutor_id) do update set
                     google_email = excluded.google_email, calendar_id = excluded.calendar_id,
                     refresh_token_ciphertext = excluded.refresh_token_ciphertext, scopes = excluded.scopes,
                     status = 'active', connected_at = now(), last_error = null""",
                user.id,
                google_email,
                calendar_id,
                cipher.encrypt(refresh_token),
                scopes,
            )
            # Event ids may belong to another calendar: forget them; the worker re-adopts existing
            # events through the lesson-id property, so nothing is duplicated.
            await conn.execute(
                """update app.lessons set gcal_event_id = null, gcal_synced_at = null
                   where tutor_id = $1 and gcal_event_id is not null""",
                user.id,
            )
            await self._enqueue(conn, user.id, clock.today)
        self._tokens[user.id] = token
        self.kick()
        async with self.db.user_tx(user) as conn:
            return await self.status(conn)

    async def _enqueue(self, conn: Conn, tutor_id: uuid.UUID, since: dt.date | None) -> int:
        await conn.execute(
            "update app.calendar_outbox set processed_at = now()"
            " where tutor_id = $1 and processed_at is null",
            tutor_id,
        )
        result = await conn.execute(
            """insert into app.calendar_outbox (tutor_id, lesson_id, op, gcal_event_id)
               select tutor_id, id, 'upsert', gcal_event_id from app.lessons
               where tutor_id = $1 and ($2::date is null or lesson_date >= $2)
               order by lesson_date, start_time""",
            tutor_id,
            since,
        )
        return int(result.split()[-1])

    async def resync(self, user: CurrentUser, scope: Literal["upcoming", "all"]) -> int:
        self._require_available()
        async with self.db.user_tx(user) as conn:
            clock = await tutor_clock(conn)
            active = await conn.fetchval(
                """select exists(select 1 from app.google_calendar_links
                   where tutor_id = (select auth.uid()) and status = 'active')"""
            )
        if not active:
            raise conflict("Collega prima Google Calendar dalle Impostazioni.")
        async with self.db.privileged_tx() as conn:
            queued = await self._enqueue(conn, user.id, clock.today if scope == "upcoming" else None)
        self.request_sweep(user.id)
        return queued

    async def disconnect(self, user: CurrentUser, remove_calendar: bool) -> None:
        async with self.db.privileged_tx() as conn:
            link = await conn.fetchrow(
                "select calendar_id, refresh_token_ciphertext from app.google_calendar_links"
                " where tutor_id = $1",
                user.id,
            )
        if link is None:
            return
        if self.google is not None and self.cipher is not None:
            try:
                refresh_token = self.cipher.decrypt(link["refresh_token_ciphertext"])
                if remove_calendar and link["calendar_id"]:
                    token = await self.google.refresh_access_token(refresh_token)
                    await self.google.delete_calendar(token.token, link["calendar_id"])
                await self.google.revoke(refresh_token)
            except (GoogleError, TokenDecryptError) as exc:
                # The local link is removed anyway: the user asked to stop syncing.
                logger.warning("google disconnect for %s incomplete: %s", user.id, exc)
        self._tokens.pop(user.id, None)
        self._sweeps.discard(user.id)
        async with self.db.privileged_tx() as conn:
            await conn.execute("delete from app.google_calendar_links where tutor_id = $1", user.id)
            await conn.execute(
                "update app.calendar_outbox set processed_at = now()"
                " where tutor_id = $1 and processed_at is null",
                user.id,
            )
            await conn.execute(
                """update app.lessons set gcal_event_id = null, gcal_synced_at = null
                   where tutor_id = $1 and gcal_event_id is not null""",
                user.id,
            )
