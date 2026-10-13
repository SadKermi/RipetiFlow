"""Google Calendar one-way sync (D-31): connect/resync/disconnect + the outbox worker.

Lesson changes are queued in `app.calendar_outbox` by triggers, in the same transaction as the
change, while the tutor's link is `active`. The worker claims due rows with a short lease (`for update
skip locked`), coalesces the operations per lesson (the latest wins) and pushes them to the dedicated
"RipetiFlow" calendar. Events carry `extendedProperties.private.ripetiflow_lesson_id`, which makes every
operation idempotent: an event that already exists for a lesson is adopted instead of duplicated, and
the orphan sweep of "Risincronizza" decides by that property alone.

Link lifecycle: `active` → `revoked` (Google refused the refresh token: the tutor reconnects) or
`disconnected` ("Scollega": token revoked and erased, calendar id kept so that the next "Collega"
re-uses the same calendar; `calendarList.list` is not allowed by the `calendar.app.created` scope).
Connect, resync, disconnect and the recovery of a calendar deleted in Google are serialised per tutor:
first by an in-process lock (concurrent requests of one tutor wait without holding a pool connection),
then by a Postgres advisory lock held for the length of a transaction, so it also works across
processes.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import uuid
import weakref
from collections import defaultdict
from collections.abc import AsyncIterator
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
from app.domain.common import display_name, tutor_clock, zone
from app.domain.dashboard import calendar_counts
from app.schemas import CalendarStatus

logger = logging.getLogger("ripetiflow.calendar")

MAX_ATTEMPTS = 8
# Delay (minutes) before retry n, n = failures so far (1..7): 1 min → 6 h. The 8th failure parks the
# row until "Risincronizza" or a reconnect re-arms it.
RETRY_DELAYS_MINUTES = (1, 5, 15, 60, 120, 240, 360)
BATCH_SIZE = 100
LEASE = dt.timedelta(minutes=5)
SWEEP_RETRY = dt.timedelta(minutes=15)  # also the lease of a running sweep
SWEEP_BATCH = 10
LOCK_NAMESPACE = "ripetiflow.calendar"
TOKEN_FIELD = "provider_refresh_token"  # noqa: S105 (a field name, not a secret)

REVOKED_MESSAGE = "Accesso a Google Calendar revocato: ricollega il calendario in Impostazioni."
NOT_CONFIGURED = "La sincronizzazione con Google Calendar non è configurata su questo server."
NOT_CONNECTED = "Collega prima Google Calendar dalle Impostazioni."
AUTH_REFUSED = "Google non ha accettato l'autorizzazione: riprova a collegare il calendario."
SCOPE_MISSING = (
    "Per sincronizzare devi concedere l'accesso a Google Calendar: riprova e lascia selezionata "
    "l'autorizzazione al calendario."
)
GOOGLE_DOWN = "Google Calendar non risponde. Riprova tra poco."
CREATE_FAILED = "Non è stato possibile creare il calendario su Google."
DELETE_FAILED = (
    "Non è stato possibile eliminare il calendario da Google: il collegamento è ancora attivo, "
    "riprova tra poco."
)
RETRY_SUFFIX = " Nuovo tentativo automatico più tardi."
PARKED_SUFFIX = " Tentativi esauriti: usa «Risincronizza» nelle Impostazioni."


def backoff(attempts: int) -> dt.timedelta:
    """Delay before the next try after `attempts` failures (1..7); the 8th failure parks the row."""
    index = min(max(attempts, 1), len(RETRY_DELAYS_MINUTES)) - 1
    return dt.timedelta(minutes=RETRY_DELAYS_MINUTES[index])


def failure_text(exc: GoogleError) -> str:
    """Italian description of a failed Google call for the UI. Google's own text only goes to the log."""
    if exc.status is None:
        return "Google Calendar non è raggiungibile."
    if exc.rate_limited:
        return "Limite di richieste a Google Calendar raggiunto."
    if exc.status == 401:
        return "La sessione con Google è scaduta."
    if exc.insufficient_scope:
        return "Manca l'autorizzazione a Google Calendar: ricollega il calendario."
    if exc.status == 403:
        return "Google Calendar ha rifiutato l'operazione."
    if exc.status in (404, 410):
        return "Calendario o evento non trovato su Google."
    if exc.status >= 500:
        return "Google Calendar non risponde."
    return "Google Calendar non ha accettato l'evento."


def event_body(lesson: asyncpg.Record | dict[str, Any], public_app_url: str) -> dict[str, Any]:
    """Event payload. Private notes are never sent (D-13, D-31)."""
    name = display_name(lesson["first_name"], lesson["last_name"])
    title = f"{lesson['subject_name']} · {name}" if lesson["subject_name"] else f"Lezione · {name}"
    link = f"{public_app_url.rstrip('/')}/studenti/{lesson['student_id']}"
    description = f"{lesson['topic']}\n\n" if lesson["topic"] else ""
    description += f"Scheda studente: {link}"
    day = lesson["lesson_date"].isoformat()
    return {
        # Google keeps an event deleted by hand as `cancelled`, and a PUT on it may leave it hidden:
        # stating the status makes the update (and "Risincronizza") bring it back.
        "status": "confirmed",
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


def _lesson_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


# Lessons selected by _requeue. $2 null = every lesson; otherwise lessons dated $2 or later, plus
# (with $3, the previous connection time) the lessons that sync missed while the link was not active:
# pushed ones changed after their last push, never-pushed ones created after $3. A never-pushed
# lesson created earlier stays out even if a bulk change (rate recompute, notes) touched it: history
# from before the first connection is not pushed by a reconnect. Plus (with $4) lessons that already
# have an event.
_REQUEUE_SELECT = """
select l.id from app.lessons l
where l.tutor_id = $1
  and ($2::date is null
       or l.lesson_date >= $2
       or ($3::timestamptz is not null
           and (l.updated_at > l.gcal_synced_at
                or (l.gcal_synced_at is null and l.created_at > $3::timestamptz)))
       or ($4::boolean and l.gcal_event_id is not null))
"""


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
        self._locks: weakref.WeakValueDictionary[uuid.UUID, asyncio.Lock] = weakref.WeakValueDictionary()
        self._wake = asyncio.Event()
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
    # Tokens, lock, link state
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

    def _local_lock(self, tutor_id: uuid.UUID) -> asyncio.Lock:
        lock = self._locks.get(tutor_id)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[tutor_id] = lock
        return lock

    @contextlib.asynccontextmanager
    async def _tutor_lock(self, tutor_id: uuid.UUID) -> AsyncIterator[Conn]:
        """Privileged transaction that holds the tutor's calendar lock until it ends.

        The transaction stays open across Google calls, so it pins a pool connection: the in-process
        lock comes first, so that a burst of requests from one tutor (double submit, retries) waits
        without taking the whole pool. The advisory lock is transaction-scoped (released on commit,
        rollback or a lost connection), works through the Supabase pooler and covers other processes.
        Inside, use only `conn`: never open a second transaction (pool deadlock) and never call
        _mark_revoked (it would wait on our own row lock).
        """
        async with self._local_lock(tutor_id), self.db.privileged_tx() as conn:
            await conn.execute(
                "select pg_advisory_xact_lock(hashtextextended($1, 0))", f"{LOCK_NAMESPACE}:{tutor_id}"
            )
            yield conn

    async def _mark_revoked(self, tutor_id: uuid.UUID, ciphertext: str) -> None:
        """Google refused the refresh token in `ciphertext` (or it cannot be decrypted).

        Only a link that still holds that token is switched to `revoked`: a reconnect that stored a
        new token while the failing call was in flight must not be undone.
        """
        self._tokens.pop(tutor_id, None)
        async with self.db.privileged_tx() as conn:
            revoked = await conn.fetchval(
                """update app.google_calendar_links set status = 'revoked', last_error = $3
                   where tutor_id = $1 and status = 'active' and refresh_token_ciphertext = $2
                   returning true""",
                tutor_id,
                ciphertext,
                REVOKED_MESSAGE,
            )
            if not revoked:
                return
            # Park the pending rows as failed: lessons show the error until the tutor reconnects, and
            # the reconnect re-arms them.
            await conn.execute(
                """update app.calendar_outbox set attempts = $2, last_error = $3
                   where tutor_id = $1 and processed_at is null""",
                tutor_id,
                MAX_ATTEMPTS,
                REVOKED_MESSAGE,
            )

    async def _forget_events(self, conn: Conn, tutor_id: uuid.UUID) -> None:
        """The calendar was replaced: stored event ids point to the old one."""
        await conn.execute(
            """update app.lessons set gcal_event_id = null, gcal_synced_at = null
               where tutor_id = $1 and (gcal_event_id is not null or gcal_synced_at is not null)""",
            tutor_id,
        )

    async def _requeue(
        self,
        conn: Conn,
        tutor_id: uuid.UUID,
        *,
        since: dt.date | None,
        changed_after: dt.datetime | None = None,
        with_events: bool = False,
    ) -> int:
        """Queue an upsert for the selected lessons (see _REQUEUE_SELECT) and re-arm the rest.

        Pending upserts of the selected lessons are superseded by the new rows. Every other pending row
        (deletes, upserts of lessons out of scope, rows parked by a revocation or by the backoff) is
        re-armed: attempts 0, no error, due now. Nothing that is still owed to Google is dropped.
        """
        ids = [
            r["id"] for r in await conn.fetch(_REQUEUE_SELECT, tutor_id, since, changed_after, with_events)
        ]
        await conn.execute(
            """update app.calendar_outbox set processed_at = now()
               where tutor_id = $1 and processed_at is null and op = 'upsert'
                 and lesson_id = any($2::uuid[])""",
            tutor_id,
            ids,
        )
        await conn.execute(
            """update app.calendar_outbox set attempts = 0, last_error = null, next_attempt_at = now()
               where tutor_id = $1 and processed_at is null""",
            tutor_id,
        )
        if ids:
            await conn.execute(
                """insert into app.calendar_outbox (tutor_id, lesson_id, op, gcal_event_id)
                   select l.tutor_id, l.id, 'upsert', l.gcal_event_id from app.lessons l
                   where l.id = any($1::uuid[])
                   order by l.lesson_date, l.start_time""",
                ids,
            )
        return len(ids)

    async def _replace_missing_calendar(self, tutor_id: uuid.UUID, missing_id: str) -> bool:
        """`missing_id` answered 404. If it is really gone (deleted by hand in Google), create a new
        calendar, point the link at it and queue the lessons again (upcoming ones and every lesson that
        had an event). Returns False when the calendar still exists; True when the caller's work for
        this tutor is obsolete (replaced now or by a concurrent call, sync was switched off, or Google
        refused the token: the link is then marked revoked and its rows parked).
        Raises GoogleError with nothing changed.
        """
        assert self.google is not None
        ciphertext: str | None = None
        try:
            async with self._tutor_lock(tutor_id) as conn:
                link = await conn.fetchrow(
                    "select calendar_id, status, refresh_token_ciphertext from app.google_calendar_links"
                    " where tutor_id = $1",
                    tutor_id,
                )
                if (
                    link is None
                    or link["status"] != "active"
                    or link["calendar_id"] != missing_id
                    or link["refresh_token_ciphertext"] is None
                ):
                    return True
                ciphertext = link["refresh_token_ciphertext"]
                token = await self._access_token(tutor_id, link["refresh_token_ciphertext"])
                if await self.google.calendar_exists(token.token, missing_id):
                    return False
                tz_name = (
                    await conn.fetchval("select timezone from app.profiles where id = $1", tutor_id)
                    or "Europe/Rome"
                )
                calendar_id = await self.google.create_calendar(token.token, CALENDAR_SUMMARY, tz_name)
                logger.warning(
                    "calendar %s of tutor %s no longer exists in Google: recreated as %s",
                    missing_id,
                    tutor_id,
                    calendar_id,
                )
                await conn.execute(
                    """update app.google_calendar_links
                       set calendar_id = $2, last_error = null, sweep_requested_at = null
                       where tutor_id = $1""",
                    tutor_id,
                    calendar_id,
                )
                today = dt.datetime.now(zone(tz_name)).date()
                await self._requeue(conn, tutor_id, since=today, with_events=True)
                await self._forget_events(conn, tutor_id)
        except (GoogleAuthError, TokenDecryptError):
            if ciphertext is not None:  # outside the lock: _mark_revoked writes the link row
                await self._mark_revoked(tutor_id, ciphertext)
            return True
        except GoogleUnauthorized:
            self._tokens.pop(tutor_id, None)
            raise
        self.kick()
        return True

    # -----------------------------------------------------------------------------------------
    # Worker iteration
    # -----------------------------------------------------------------------------------------

    async def run_once(self) -> int:
        """Process one batch of due outbox rows, then the due sweeps; returns the lessons handled."""
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
        for row in sorted(claimed, key=lambda r: r["id"]):
            by_tutor[row["tutor_id"]][row["lesson_id"]].append(row)

        handled = 0
        for tutor_id, lessons in by_tutor.items():
            handled += await self._process_tutor(tutor_id, lessons)
        await self._run_sweeps()
        return handled

    async def _process_tutor(
        self, tutor_id: uuid.UUID, lessons: dict[uuid.UUID, list[asyncpg.Record]]
    ) -> int:
        async with self.db.privileged_tx() as conn:
            link = await conn.fetchrow(
                """select calendar_id, status, refresh_token_ciphertext, last_error
                   from app.google_calendar_links where tutor_id = $1""",
                tutor_id,
            )
        all_ids = [r["id"] for rows in lessons.values() for r in rows]
        if (
            link is None
            or link["status"] == "disconnected"
            or link["calendar_id"] is None
            or link["refresh_token_ciphertext"] is None
        ):
            # Sync is off: nothing to push. A reconnect re-queues what changed meanwhile and its sweep
            # removes the events of lessons deleted meanwhile.
            await self._finish(all_ids, [])
            return 0
        if link["status"] != "active":  # revoked/error: wait for the tutor to reconnect
            await self._park(all_ids, link["last_error"] or REVOKED_MESSAGE)
            return 0
        calendar_id: str = link["calendar_id"]
        ciphertext: str = link["refresh_token_ciphertext"]
        try:
            token = await self._access_token(tutor_id, ciphertext)
        except (GoogleAuthError, TokenDecryptError):
            await self._mark_revoked(tutor_id, ciphertext)
            return 0
        except GoogleError as exc:
            await self._retry(all_ids, exc)
            return 0

        handled = 0
        items = list(lessons.items())
        for position, (lesson_id, rows) in enumerate(items):
            latest = max(rows, key=lambda r: r["id"])
            ids = [r["id"] for r in rows]
            try:
                await self._sync_lesson(token.token, tutor_id, calendar_id, lesson_id, latest)
            except GoogleUnauthorized as exc:
                self._tokens.pop(tutor_id, None)
                await self._retry(ids, exc)
                continue
            except GoogleNotFound as exc:
                # A missing event is handled inside _sync_lesson: here the calendar itself is gone.
                remaining = [r["id"] for _, later in items[position:] for r in later]
                try:
                    obsolete = await self._replace_missing_calendar(tutor_id, calendar_id)
                except GoogleError as recovery_exc:
                    await self._retry(remaining, recovery_exc)  # backoff: no polling every iteration
                    return handled
                if obsolete:
                    return handled  # the re-queue superseded or re-armed the claimed rows
                await self._retry(ids, exc)
                continue
            except GoogleError as exc:
                await self._retry(ids, exc)
                continue
            await self._finish(ids, [lesson_id], max(ids))
            handled += 1
        if handled:
            async with self.db.privileged_tx() as conn:
                await conn.execute(
                    "update app.google_calendar_links set last_synced_at = now(), last_error = null"
                    " where tutor_id = $1 and status = 'active'",
                    tutor_id,
                )
        return handled

    async def _sync_lesson(
        self, token: str, tutor_id: uuid.UUID, calendar_id: str, lesson_id: uuid.UUID, row: asyncpg.Record
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
                   where l.id = $1 and l.tutor_id = $2""",
                lesson_id,
                tutor_id,
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
            except GoogleNotFound:  # deleted by hand in Google (or the calendar is gone: see below)
                event_id = None
        if not event_id:
            # events.list answers 404 only when the calendar itself is missing.
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

    async def _retry(self, ids: list[int], exc: GoogleError) -> None:
        """Count a failure: back off per RETRY_DELAYS_MINUTES, park after MAX_ATTEMPTS failures.

        The stored message (shown on the lesson) is Italian; Google's text only goes to the log.
        """
        if not ids:
            return
        logger.warning(
            "google calendar call failed (status=%s reason=%s): %s", exc.status, exc.reason, exc.message
        )
        text = failure_text(exc)
        async with self.db.privileged_tx() as conn:
            await conn.execute(
                """update app.calendar_outbox set
                     attempts = attempts + 1,
                     last_error = case when attempts + 1 >= $2 then $4 else $3 end,
                     next_attempt_at = now() + make_interval(
                       mins => ($5::int[])[least(attempts + 1, cardinality($5::int[]))])
                   where id = any($1::bigint[])""",
                ids,
                MAX_ATTEMPTS,
                text + RETRY_SUFFIX,
                text + PARKED_SUFFIX,
                list(RETRY_DELAYS_MINUTES),
            )

    async def _park(self, ids: list[int], message: str) -> None:
        async with self.db.privileged_tx() as conn:
            await conn.execute(
                """update app.calendar_outbox set attempts = greatest(attempts, $2), last_error = $3
                   where id = any($1::bigint[])""",
                ids,
                MAX_ATTEMPTS,
                message,
            )

    # -----------------------------------------------------------------------------------------
    # Orphan sweep (part of "Risincronizza", persisted in google_calendar_links.sweep_requested_at)
    # -----------------------------------------------------------------------------------------

    async def _run_sweeps(self) -> None:
        """Run the due sweeps of tutors whose outbox has drained (parked rows do not count).

        Claiming moves sweep_requested_at forward by SWEEP_RETRY: that is the lease against a second
        process and, when the sweep fails, the delay before the next try.
        """
        async with self.db.privileged_tx() as conn:
            due = await conn.fetch(
                """update app.google_calendar_links g set sweep_requested_at = now() + $1::interval
                   where g.tutor_id in (
                     select l.tutor_id from app.google_calendar_links l
                     where l.sweep_requested_at <= now() and l.status = 'active'
                       and l.calendar_id is not null
                       and not exists (select 1 from app.calendar_outbox o
                                       where o.tutor_id = l.tutor_id and o.processed_at is null
                                         and o.attempts < $2)
                     order by l.sweep_requested_at limit $3
                     for update skip locked)
                   returning g.tutor_id, g.calendar_id, g.refresh_token_ciphertext, g.sweep_requested_at""",
                SWEEP_RETRY,
                MAX_ATTEMPTS,
                SWEEP_BATCH,
            )
        for row in due:
            await self._sweep(row["tutor_id"], row["calendar_id"], row["refresh_token_ciphertext"], row)

    async def _sweep(
        self, tutor_id: uuid.UUID, calendar_id: str, ciphertext: str, claim: asyncpg.Record
    ) -> None:
        """Remove the events that are not the event of a lesson of this tutor.

        Decided by `ripetiflow_lesson_id` alone: an event is deleted only when the property is missing,
        does not name a lesson of this tutor, or the lesson already has another event (duplicate). An
        event of an existing lesson whose stored event id is empty or stale is adopted (the id is
        written back), so past lessons never lose their event.
        """
        assert self.google is not None
        try:
            token = await self._access_token(tutor_id, ciphertext)
            events = await self.google.list_events(token.token, calendar_id)
        except (GoogleAuthError, TokenDecryptError):
            await self._mark_revoked(tutor_id, ciphertext)
            return
        except GoogleNotFound:
            try:
                await self._replace_missing_calendar(tutor_id, calendar_id)
            except GoogleError as exc:
                logger.warning("calendar recovery for tutor %s failed: %s", tutor_id, exc.message)
            return  # a replaced calendar has nothing to sweep; otherwise retried after the lease
        except GoogleError as exc:
            if isinstance(exc, GoogleUnauthorized):
                self._tokens.pop(tutor_id, None)
            logger.warning("orphan sweep for tutor %s failed: %s", tutor_id, exc.message)
            return

        candidates = {lid for _, prop in events if (lid := _lesson_uuid(prop)) is not None}
        async with self.db.privileged_tx() as conn:
            current: dict[uuid.UUID, str | None] = {
                r["id"]: r["gcal_event_id"]
                for r in await conn.fetch(
                    "select id, gcal_event_id from app.lessons where tutor_id = $1 and id = any($2::uuid[])",
                    tutor_id,
                    list(candidates),
                )
            }
        by_lesson: dict[uuid.UUID, list[str]] = defaultdict(list)
        to_delete: list[str] = []
        for event_id, prop in events:
            lesson_id = _lesson_uuid(prop)
            if lesson_id is None or lesson_id not in current:
                to_delete.append(event_id)
            else:
                by_lesson[lesson_id].append(event_id)
        adopt: list[tuple[uuid.UUID, str, str | None]] = []
        for lesson_id, event_ids in by_lesson.items():
            linked = current[lesson_id]
            keep = linked if linked in event_ids else event_ids[0]
            if keep != linked:
                adopt.append((lesson_id, keep, linked))
            to_delete.extend(e for e in event_ids if e != keep)

        if adopt:
            async with self.db.privileged_tx() as conn:
                for lesson_id, event_id, linked in adopt:
                    await conn.execute(
                        """update app.lessons set gcal_event_id = $3
                           where id = $1 and tutor_id = $2 and gcal_event_id is not distinct from $4""",
                        lesson_id,
                        tutor_id,
                        event_id,
                        linked,
                    )
        try:
            for event_id in to_delete:
                await self.google.delete_event(token.token, calendar_id, event_id)
        except GoogleError as exc:
            if isinstance(exc, GoogleUnauthorized):
                self._tokens.pop(tutor_id, None)
            logger.warning("orphan sweep for tutor %s failed: %s", tutor_id, exc.message)
            return
        async with self.db.privileged_tx() as conn:
            # Only the request we claimed: a newer "Risincronizza" keeps its own.
            await conn.execute(
                """update app.google_calendar_links set sweep_requested_at = null
                   where tutor_id = $1 and sweep_requested_at = $2""",
                tutor_id,
                claim["sweep_requested_at"],
            )
        if to_delete or adopt:
            logger.info(
                "orphan sweep for tutor %s: %d deleted, %d adopted", tutor_id, len(to_delete), len(adopt)
            )

    # -----------------------------------------------------------------------------------------
    # API operations
    # -----------------------------------------------------------------------------------------

    async def status(self, conn: Conn) -> CalendarStatus:
        # A disconnected link is the backend's memory of the calendar: for the tutor it does not exist
        # (RLS hides it too).
        row = await conn.fetchrow(
            """select google_email, calendar_id, status, last_synced_at, last_error
               from app.google_calendar_links
               where tutor_id = (select auth.uid()) and status <> 'disconnected'"""
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
        """Store the token, re-use (or create) the calendar and queue the lessons to push.

        Queued: lessons from today on, plus what sync missed while it was not active (pushed lessons
        changed after their last push, never-pushed lessons created after the previous connection).
        Pending rows are re-armed.
        Re-using the calendar after a pause also requests an orphan sweep, which removes the events of
        lessons deleted meanwhile. A new calendar makes the stored event ids meaningless: they are
        cleared, so the worker creates the events again (all the lessons that had one when the old
        calendar was deleted by hand in Google).
        """
        google, cipher = self._require_available()
        try:
            token = await google.refresh_access_token(refresh_token)
        except GoogleAuthError as exc:
            raise invalid(AUTH_REFUSED, TOKEN_FIELD) from exc
        except GoogleError as exc:
            logger.warning("google token refresh failed on connect: %s", exc.message)
            raise ApiError("upstream_error", GOOGLE_DOWN) from exc
        # Google's granular consent lets the user untick the calendar permission.
        scopes = token.scope.split()
        if CALENDAR_SCOPE not in scopes:
            raise invalid(SCOPE_MISSING, TOKEN_FIELD)

        async with self.db.user_tx(user) as conn:
            clock = await tutor_clock(conn)
        async with self._tutor_lock(user.id) as conn:
            previous = await conn.fetchrow(
                "select calendar_id, status, connected_at from app.google_calendar_links where tutor_id = $1",
                user.id,
            )
            try:
                calendar_id: str | None = None
                if (
                    previous is not None
                    and previous["calendar_id"]
                    and await google.calendar_exists(token.token, previous["calendar_id"])
                ):
                    calendar_id = previous["calendar_id"]
                reused = calendar_id is not None
                if calendar_id is None:
                    calendar_id = await google.create_calendar(token.token, CALENDAR_SUMMARY, clock.timezone)
                google_email = await google.user_email(token.token) or user.email
            except GoogleError as exc:
                logger.warning("google calendar setup failed for %s: %s", user.id, exc.message)
                if exc.insufficient_scope:
                    raise invalid(SCOPE_MISSING, TOKEN_FIELD) from exc
                raise ApiError("upstream_error", CREATE_FAILED) from exc

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
            if not reused:
                await conn.execute(
                    "update app.google_calendar_links set sweep_requested_at = null where tutor_id = $1",
                    user.id,
                )
            elif previous is not None and previous["status"] != "active":
                await conn.execute(
                    "update app.google_calendar_links set sweep_requested_at = now() where tutor_id = $1",
                    user.id,
                )
            # A calendar id that no longer exists in Google was deleted by hand (Scollega with
            # remove_calendar clears the id): restore every event it had, like the worker recovery.
            lost_calendar = not reused and previous is not None and previous["calendar_id"] is not None
            await self._requeue(
                conn,
                user.id,
                since=clock.today,
                changed_after=previous["connected_at"] if previous is not None else None,
                with_events=lost_calendar,
            )
            if not reused:
                await self._forget_events(conn, user.id)
        self._tokens[user.id] = token
        self.kick()
        async with self.db.user_tx(user) as conn:
            return await self.status(conn)

    async def resync(self, user: CurrentUser, scope: Literal["upcoming", "all"]) -> int:
        """Re-queue the lessons in scope and request the orphan sweep (D-31).

        A calendar deleted by hand in Google is recreated here, with every lesson that had an event.
        The grant is checked with a fresh refresh (not the cached access token): access removed from
        the Google account answers 409 "revocato" at once instead of a misleading 502.
        """
        google, _ = self._require_available()
        async with self.db.user_tx(user) as conn:
            clock = await tutor_clock(conn)
        since = clock.today if scope == "upcoming" else None
        ciphertext: str | None = None
        try:
            async with self._tutor_lock(user.id) as conn:
                link = await conn.fetchrow(
                    "select calendar_id, status, refresh_token_ciphertext from app.google_calendar_links"
                    " where tutor_id = $1",
                    user.id,
                )
                if (
                    link is None
                    or link["status"] == "disconnected"
                    or link["calendar_id"] is None
                    or link["refresh_token_ciphertext"] is None
                ):
                    raise conflict(NOT_CONNECTED)
                if link["status"] != "active":
                    raise conflict(REVOKED_MESSAGE)
                ciphertext = link["refresh_token_ciphertext"]
                self._tokens.pop(user.id, None)
                token = await self._access_token(user.id, link["refresh_token_ciphertext"])
                if await google.calendar_exists(token.token, link["calendar_id"]):
                    queued = await self._requeue(conn, user.id, since=since)
                    await conn.execute(
                        "update app.google_calendar_links set sweep_requested_at = now() where tutor_id = $1",
                        user.id,
                    )
                else:
                    calendar_id = await google.create_calendar(token.token, CALENDAR_SUMMARY, clock.timezone)
                    logger.warning(
                        "calendar %s of tutor %s no longer exists in Google: recreated as %s",
                        link["calendar_id"],
                        user.id,
                        calendar_id,
                    )
                    await conn.execute(
                        """update app.google_calendar_links
                           set calendar_id = $2, last_error = null, sweep_requested_at = null
                           where tutor_id = $1""",
                        user.id,
                        calendar_id,
                    )
                    queued = await self._requeue(conn, user.id, since=since, with_events=True)
                    await self._forget_events(conn, user.id)
        except (GoogleAuthError, TokenDecryptError) as exc:
            if ciphertext is not None:  # outside the lock: _mark_revoked writes the link row
                await self._mark_revoked(user.id, ciphertext)
            raise conflict(REVOKED_MESSAGE) from exc
        except GoogleError as exc:
            if isinstance(exc, GoogleUnauthorized):
                self._tokens.pop(user.id, None)
            logger.warning("resync for %s failed: %s", user.id, exc.message)
            raise ApiError("upstream_error", GOOGLE_DOWN) from exc
        self.kick()
        return queued

    async def disconnect(self, user: CurrentUser, remove_calendar: bool) -> None:
        """Scollega: revoke and erase the token; keep the calendar id for a later reconnect.

        With remove_calendar the calendar is deleted first. If that fails for a transient reason the
        endpoint answers 502 and nothing changes (token not revoked, link still active), so the tutor
        can simply retry. In every other case the revoke is attempted once the token is decrypted, and
        the link is switched off even if Google does not answer.
        """
        async with self._tutor_lock(user.id) as conn:
            link = await conn.fetchrow(
                "select calendar_id, status, refresh_token_ciphertext from app.google_calendar_links"
                " where tutor_id = $1",
                user.id,
            )
            if link is None or link["status"] == "disconnected":
                return
            refresh_token = self._decrypt(user.id, link["refresh_token_ciphertext"])
            calendar_removed = False
            if refresh_token is not None and self.google is not None:
                if remove_calendar and link["calendar_id"]:
                    try:
                        token = await self.google.refresh_access_token(refresh_token)
                        await self.google.delete_calendar(token.token, link["calendar_id"])
                        calendar_removed = True
                    except GoogleAuthError as exc:
                        # The grant is already gone: the app can no longer delete the calendar.
                        logger.warning("calendar of %s not deleted, token refused: %s", user.id, exc.message)
                    except GoogleError as exc:
                        logger.warning("calendar of %s not deleted: %s", user.id, exc.message)
                        raise ApiError("upstream_error", DELETE_FAILED) from exc
                try:
                    await self.google.revoke(refresh_token)
                except GoogleError as exc:
                    logger.warning("google token revoke for %s failed: %s", user.id, exc.message)
            await conn.execute(
                """update app.google_calendar_links set
                     status = 'disconnected', refresh_token_ciphertext = null, last_error = null,
                     sweep_requested_at = null,
                     calendar_id = case when $2 then null else calendar_id end
                   where tutor_id = $1""",
                user.id,
                calendar_removed,
            )
            await conn.execute(
                "update app.calendar_outbox set processed_at = now()"
                " where tutor_id = $1 and processed_at is null",
                user.id,
            )
        self._tokens.pop(user.id, None)

    def _decrypt(self, tutor_id: uuid.UUID, ciphertext: str | None) -> str | None:
        if ciphertext is None or self.cipher is None:
            return None
        try:
            return self.cipher.decrypt(ciphertext)
        except TokenDecryptError:
            logger.warning("refresh token of %s cannot be decrypted: it cannot be revoked", tutor_id)
            return None
