"""Lessons and payments (docs/05 "Lezioni" / "Pagamenti", D-10, D-11, D-15, D-16, D-20).

Covers the rate snapshot taken from the history at the lesson date (and the hand-typed override flag),
amounts with half-up rounding, validation messages, the agenda range, single-lesson CRUD, duplicate,
payments CRUD, tenant isolation and the `X-RipetiFlow-Source: assistant` marker in the activity log.
Dates are relative to "today" in the tutor's timezone (default Europe/Rome).
"""

from __future__ import annotations

import datetime as dt
import uuid
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import asyncpg
import httpx
import pytest

from tests.conftest import User, create_lesson, create_payment, create_student

API = "/api/v1"
PROBLEM = "application/problem+json"

LESSON_KEYS = {
    "id",
    "student",
    "subject",
    "date",
    "start_time",
    "end_time",
    "duration_minutes",
    "hourly_rate_cents",
    "amount_cents",
    "topic",
    "notes",
    "settled",
    "calendar",
    "created_at",
    "updated_at",
}
PAYMENT_KEYS = {"id", "student", "amount_cents", "paid_on", "method", "note", "created_at", "updated_at"}

MSG_REQUIRED = "Campo obbligatorio."
MSG_END_AFTER_START = "L'orario di fine deve essere successivo a quello di inizio."
MSG_MAX_12H = "Una lezione non può durare più di 12 ore."
MSG_DATE_WINDOW = "La data deve essere entro due anni da oggi."
MSG_HHMM = "L'orario deve essere nel formato HH:MM (es. 15:30)."
MSG_BAD_DATE = "Data non valida (formato AAAA-MM-GG)."
MSG_BAD_ID = "Identificativo non valido."
MSG_STUDENT_NOT_FOUND = "Studente non trovato."
MSG_SUBJECT_NOT_FOUND = "Materia non trovata."
MSG_LESSON_NOT_FOUND = "Lezione non trovata."
MSG_PAYMENT_NOT_FOUND = "Pagamento non trovato."


# ---------------------------------------------------------------------------------------------
# Helpers (local to this file)
# ---------------------------------------------------------------------------------------------


def today(tz: str = "Europe/Rome") -> dt.date:
    """Today in the tutor's timezone (the profile default is Europe/Rome)."""
    return dt.datetime.now(ZoneInfo(tz)).date()


def days(n: int) -> dt.date:
    return today() + dt.timedelta(days=n)


def shift_years(day: dt.date, years: int) -> dt.date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # 29 February
        return day.replace(year=day.year + years, day=28)


def half_up_amount(rate_cents: int, minutes: int) -> int:
    """Independent oracle for D-10: round(rate x minutes / 60), half up."""
    numerator = rate_cents * minutes
    whole, rest = divmod(numerator, 60)
    return whole + (1 if rest * 2 >= 60 else 0)


def assert_problem(
    response: httpx.Response,
    status: int,
    code: str,
    *,
    detail: str | None = None,
    errors: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith(PROBLEM)
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert body["code"] == code
    if detail is not None:
        assert body["detail"] == detail
    if errors is not None:
        assert body["errors"] == errors
    return body


def assert_invalid(response: httpx.Response, field: str, message: str) -> dict[str, Any]:
    """A 422 with exactly one field error, whose message is also the detail."""
    body = assert_problem(
        response, 422, "validation_error", detail=message, errors=[{"field": field, "message": message}]
    )
    assert body["title"] == "Dati non validi"
    assert body["type"] == "https://ripetiflow.app/errors/validation"
    return body


def assert_not_found(response: httpx.Response, message: str) -> None:
    body = assert_problem(response, 404, "not_found", detail=message)
    assert body["title"] == "Non trovato"
    assert "errors" not in body


async def new_student(
    client: httpx.AsyncClient,
    user: User,
    first_name: str = "Luca",
    rate_cents: int = 2000,
    since: dt.date | None = None,
    **fields: Any,
) -> dict[str, Any]:
    """Student whose first rate starts one year ago (unless `since` says otherwise)."""
    effective = since or days(-365)
    return await create_student(
        client, user, first_name, rate_cents, rate_effective_from=str(effective), **fields
    )


async def add_rate(
    client: httpx.AsyncClient,
    user: User,
    student_id: str,
    rate_cents: int,
    effective_from: dt.date,
    *,
    reprice: bool = False,
) -> dict[str, Any]:
    response = await client.post(
        f"{API}/students/{student_id}/rates",
        json={
            "hourly_rate_cents": rate_cents,
            "effective_from": str(effective_from),
            "reprice_existing": reprice,
        },
        headers=user.headers,
    )
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def subject_id(client: httpx.AsyncClient, user: User, name: str) -> str:
    response = await client.get(f"{API}/subjects", headers=user.headers)
    assert response.status_code == 200, response.text
    for item in response.json()["items"]:
        if item["name"] == name:
            return str(item["id"])
    raise AssertionError(f"subject {name!r} not found")


async def lesson_row(db: asyncpg.Pool[asyncpg.Record], lesson_id: str) -> asyncpg.Record:
    row = await db.fetchrow(
        """select student_id, lesson_date, hourly_rate_cents, rate_overridden, amount_cents
           from app.lessons where id = $1""",
        uuid.UUID(lesson_id),
    )
    assert row is not None
    return row


async def activity_rows(db: asyncpg.Pool[asyncpg.Record], entity_id: str) -> list[asyncpg.Record]:
    return list(
        await db.fetch(
            """select tutor_id, student_id, entity, action, source from app.activity_log
               where entity_id = $1 order by id""",
            uuid.UUID(entity_id),
        )
    )


async def get_lesson(client: httpx.AsyncClient, user: User, lesson_id: str) -> dict[str, Any]:
    response = await client.get(f"{API}/lessons/{lesson_id}", headers=user.headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    return data


async def patch_lesson(
    client: httpx.AsyncClient, user: User, lesson_id: str, body: dict[str, Any]
) -> httpx.Response:
    return await client.patch(f"{API}/lessons/{lesson_id}", json=body, headers=user.headers)


async def post_lesson(client: httpx.AsyncClient, user: User, body: dict[str, Any]) -> httpx.Response:
    return await client.post(f"{API}/lessons", json=body, headers=user.headers)


def lesson_body(student_id: str, day: dt.date | str, start: str = "15:00", end: str = "16:00", **extra: Any):
    return {"student_id": student_id, "date": str(day), "start_time": start, "end_time": end, **extra}


async def list_lessons(
    client: httpx.AsyncClient, user: User, start: dt.date, end: dt.date, **params: Any
) -> httpx.Response:
    query = {"from": str(start), "to": str(end), **params}
    return await client.get(f"{API}/lessons", params=query, headers=user.headers)


# ---------------------------------------------------------------------------------------------
# POST /lessons: shape, rate snapshot, subject default
# ---------------------------------------------------------------------------------------------


async def test_create_lesson_returns_the_full_lesson(client, make_user, db) -> None:
    tutor = await make_user("Anna")
    student = await new_student(client, tutor, "Luca", 2000, last_name="Rossi")
    day = days(-30)
    response = await post_lesson(
        client,
        tutor,
        lesson_body(
            student["id"], day, "15:00", "16:30", topic="  Equazioni di secondo grado  ", notes="Ripasso"
        ),
    )
    assert response.status_code == 201, response.text
    lesson = response.json()
    assert set(lesson) == LESSON_KEYS
    uuid.UUID(lesson["id"])
    assert lesson["student"] == {"id": student["id"], "display_name": "Luca Rossi"}
    assert lesson["subject"] is None  # the student has no default subject
    assert lesson["date"] == str(day)
    assert lesson["start_time"] == "15:00"
    assert lesson["end_time"] == "16:30"
    assert lesson["duration_minutes"] == 90
    assert lesson["hourly_rate_cents"] == 2000
    assert lesson["amount_cents"] == 3000
    assert lesson["topic"] == "Equazioni di secondo grado"  # trimmed
    assert lesson["notes"] == "Ripasso"
    assert lesson["settled"] is True
    assert lesson["calendar"] == {"status": "off", "error": None}
    dt.datetime.fromisoformat(lesson["created_at"])
    dt.datetime.fromisoformat(lesson["updated_at"])

    # GET returns the very same representation.
    assert await get_lesson(client, tutor, lesson["id"]) == lesson
    row = await lesson_row(db, lesson["id"])
    assert row["rate_overridden"] is False
    assert row["student_id"] == uuid.UUID(student["id"])


async def test_create_lesson_takes_the_rate_valid_at_the_lesson_date(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000, since=days(-365))
    await add_rate(client, tutor, student["id"], 2500, days(-10))

    expected = {
        -400: 2000,  # before the first rate: the earliest rate applies
        -365: 2000,
        -11: 2000,
        -10: 2500,  # effective_from is inclusive
        30: 2500,
    }
    for offset, rate in expected.items():
        lesson = await create_lesson(client, tutor, student["id"], days(offset), "10:00", "11:00")
        assert lesson["hourly_rate_cents"] == rate, offset
        assert lesson["amount_cents"] == rate, offset
        row = await lesson_row(db, lesson["id"])
        assert row["rate_overridden"] is False, offset


async def test_create_lesson_with_explicit_rate(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)

    typed = await create_lesson(
        client, tutor, student["id"], days(-5), "15:00", "16:30", hourly_rate_cents=1800
    )
    assert typed["hourly_rate_cents"] == 1800
    assert typed["amount_cents"] == 2700
    assert (await lesson_row(db, typed["id"]))["rate_overridden"] is True

    # A rate sent equal to the history counts as "follows the history".
    same = await create_lesson(client, tutor, student["id"], days(-4), hourly_rate_cents=2000)
    assert same["hourly_rate_cents"] == 2000
    assert (await lesson_row(db, same["id"]))["rate_overridden"] is False

    # Explicit null behaves like an omitted rate.
    null_rate = await create_lesson(client, tutor, student["id"], days(-3), hourly_rate_cents=None)
    assert null_rate["hourly_rate_cents"] == 2000
    assert (await lesson_row(db, null_rate["id"]))["rate_overridden"] is False

    # A free lesson is allowed.
    free = await create_lesson(client, tutor, student["id"], days(-2), hourly_rate_cents=0)
    assert free["hourly_rate_cents"] == 0
    assert free["amount_cents"] == 0
    assert (await lesson_row(db, free["id"]))["rate_overridden"] is True


async def test_create_lesson_subject_defaults_to_the_students_subject(client, make_user) -> None:
    tutor = await make_user()
    math = await subject_id(client, tutor, "Matematica")
    physics = await subject_id(client, tutor, "Fisica")
    student = await new_student(client, tutor, default_subject_id=math)

    omitted = await create_lesson(client, tutor, student["id"], days(-3))
    assert omitted["subject"] == {"id": math, "name": "Matematica"}

    explicit_null = await create_lesson(client, tutor, student["id"], days(-2), subject_id=None)
    assert explicit_null["subject"] is None

    explicit = await create_lesson(client, tutor, student["id"], days(-1), subject_id=physics)
    assert explicit["subject"] == {"id": physics, "name": "Fisica"}

    # A student without a default subject: omitted stays empty.
    plain = await new_student(client, tutor, "Sara")
    assert (await create_lesson(client, tutor, plain["id"], days(-1)))["subject"] is None


@pytest.mark.parametrize("whose", ["other_tutor", "unknown"])
async def test_create_lesson_rejects_a_student_that_is_not_yours(client, make_user, whose) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    if whose == "other_tutor":
        student_id = (await new_student(client, other, "Marta"))["id"]
    else:
        student_id = str(uuid.uuid4())
    response = await post_lesson(client, tutor, lesson_body(student_id, days(-1)))
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)
    # Nothing was written for the other tutor either.
    listed = await list_lessons(client, other, days(-5), days(5))
    assert listed.json()["items"] == []


@pytest.mark.parametrize("whose", ["other_tutor", "unknown"])
async def test_create_lesson_rejects_a_subject_that_is_not_yours(client, make_user, whose) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, tutor)
    foreign = await subject_id(client, other, "Matematica") if whose == "other_tutor" else str(uuid.uuid4())
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), subject_id=foreign))
    assert_invalid(response, "subject_id", MSG_SUBJECT_NOT_FOUND)
    assert (await list_lessons(client, tutor, days(-5), days(5))).json()["items"] == []


async def test_create_lesson_rejects_malformed_ids(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await post_lesson(client, tutor, lesson_body("not-a-uuid", days(-1)))
    assert_invalid(response, "student_id", MSG_BAD_ID)
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), subject_id="42"))
    assert_invalid(response, "subject_id", MSG_BAD_ID)


async def test_create_lesson_requires_student_date_and_times(client, make_user) -> None:
    tutor = await make_user()
    response = await post_lesson(client, tutor, {})
    assert_problem(
        response,
        422,
        "validation_error",
        detail=MSG_REQUIRED,
        errors=[
            {"field": "student_id", "message": MSG_REQUIRED},
            {"field": "date", "message": MSG_REQUIRED},
            {"field": "start_time", "message": MSG_REQUIRED},
            {"field": "end_time", "message": MSG_REQUIRED},
        ],
    )


# ---------------------------------------------------------------------------------------------
# Duration and amount (D-10: integer cents, half up)
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("start", "end", "rate", "minutes", "amount"),
    [
        ("15:00", "15:25", 2333, 25, 972),  # 972.08 -> 972
        ("15:00", "16:00", 2333, 60, 2333),
        ("15:00", "15:50", 2333, 50, 1944),  # 1944.17 -> 1944
        ("15:00", "15:30", 3001, 30, 1501),  # 1500.5 -> 1501 (half up, not half even)
        ("15:00", "15:10", 3003, 10, 501),  # 500.5 -> 501
        ("15:00", "15:45", 2010, 45, 1508),  # 1507.5 -> 1508
        ("15:00", "15:01", 30, 1, 1),  # 0.5 -> 1
        ("15:00", "15:01", 29, 1, 0),  # 0.48 -> 0
        ("15:00", "16:30", 2000, 90, 3000),
        ("08:00", "20:00", 100_000, 720, 1_200_000),  # longest lesson at the highest rate
        ("23:00", "23:59", 1999, 59, 1966),  # 1965.68 -> 1966
    ],
)
async def test_duration_and_amount_round_half_up(
    client, make_user, start, end, rate, minutes, amount
) -> None:
    assert half_up_amount(rate, minutes) == amount  # the oracle agrees with the hand-computed value
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=rate)
    lesson = await create_lesson(client, tutor, student["id"], days(-7), start, end)
    assert lesson["duration_minutes"] == minutes
    assert lesson["hourly_rate_cents"] == rate
    assert lesson["amount_cents"] == amount


async def test_explicit_rate_amount_rounds_half_up(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    lesson = await create_lesson(
        client, tutor, student["id"], days(-7), "15:00", "15:25", hourly_rate_cents=2333
    )
    assert (lesson["duration_minutes"], lesson["amount_cents"]) == (25, 972)


# ---------------------------------------------------------------------------------------------
# Validation (fine > inizio, minuti interi, durata <= 12h, data entro +-2 anni)
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(("start", "end"), [("16:00", "16:00"), ("16:00", "15:59"), ("23:59", "00:00")])
async def test_end_must_be_after_start(client, make_user, start, end) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), start, end))
    assert_invalid(response, "end_time", MSG_END_AFTER_START)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("start_time", "15:00:30"),  # seconds: not whole minutes
        ("end_time", "16:00:59"),
        ("start_time", "15:00:00"),  # seconds are not accepted at all, even :00
        ("start_time", "9:00"),
        ("start_time", "24:00"),
        ("end_time", "16:60"),
        ("start_time", "15.30"),
        ("start_time", "3pm"),
        ("end_time", ""),
        ("start_time", 900),
    ],
)
async def test_times_must_be_hh_mm(client, make_user, field, value) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    body = lesson_body(student["id"], days(-1), "15:00", "16:00")
    body[field] = value
    response = await post_lesson(client, tutor, body)
    assert_invalid(response, field, MSG_HHMM)


async def test_times_are_trimmed(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    lesson = await create_lesson(client, tutor, student["id"], days(-1), " 09:05 ", "10:35 ")
    assert (lesson["start_time"], lesson["end_time"], lesson["duration_minutes"]) == ("09:05", "10:35", 90)


async def test_duration_is_at_most_twelve_hours(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=1000)
    twelve = await create_lesson(client, tutor, student["id"], days(-1), "06:00", "18:00")
    assert (twelve["duration_minutes"], twelve["amount_cents"]) == (720, 12_000)

    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), "06:00", "18:01"))
    assert_invalid(response, "end_time", MSG_MAX_12H)
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), "00:00", "23:59"))
    assert_invalid(response, "end_time", MSG_MAX_12H)


@pytest.mark.parametrize(
    ("label", "accepted"),
    [("past_inside", True), ("future_inside", True), ("past_outside", False), ("future_outside", False)],
)
async def test_lesson_date_within_two_years(client, make_user, label, accepted) -> None:
    # A few days of margin from the exact boundary: the outcome never depends on the clock.
    base = today()
    day = {
        "past_inside": shift_years(base, -2) + dt.timedelta(days=3),
        "future_inside": shift_years(base, 2) - dt.timedelta(days=3),
        "past_outside": shift_years(base, -2) - dt.timedelta(days=3),
        "future_outside": shift_years(base, 2) + dt.timedelta(days=3),
    }[label]
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await post_lesson(client, tutor, lesson_body(student["id"], day))
    if accepted:
        assert response.status_code == 201, response.text
        assert response.json()["date"] == str(day)
    else:
        assert_invalid(response, "date", MSG_DATE_WINDOW)


@pytest.mark.parametrize("value", ["12/10/2026", "2026-13-01", "2026-02-30", "domani", ""])
async def test_lesson_date_format(client, make_user, value) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await post_lesson(client, tutor, lesson_body(student["id"], value))
    assert_invalid(response, "date", MSG_BAD_DATE)


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (-1, "Il valore minimo è 0."),
        (100_001, "Il valore massimo è 100000."),
        (12.5, "Deve essere un numero intero."),
        ("venti", "Deve essere un numero intero."),
    ],
)
async def test_lesson_rate_bounds(client, make_user, value, message) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), hourly_rate_cents=value))
    assert_invalid(response, "hourly_rate_cents", message)


async def test_lesson_rate_upper_bound_is_accepted(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    lesson = await create_lesson(client, tutor, student["id"], days(-1), hourly_rate_cents=100_000)
    assert (lesson["hourly_rate_cents"], lesson["amount_cents"]) == (100_000, 100_000)


async def test_topic_and_notes_limits(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    ok = await create_lesson(client, tutor, student["id"], days(-1), topic="t" * 200, notes="n" * 4000)
    assert (len(ok["topic"]), len(ok["notes"])) == (200, 4000)

    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), topic="t" * 201))
    assert_invalid(response, "topic", "Testo troppo lungo (massimo 200 caratteri).")
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), notes="n" * 4001))
    assert_invalid(response, "notes", "Testo troppo lungo (massimo 4000 caratteri).")

    blank = await create_lesson(client, tutor, student["id"], days(-1), topic="   ", notes="")
    assert (blank["topic"], blank["notes"]) == (None, None)


# ---------------------------------------------------------------------------------------------
# Settled flag (lesson concluded when date + end <= now in the tutor's timezone)
# ---------------------------------------------------------------------------------------------


async def test_settled_for_past_lessons_only(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    past = await create_lesson(client, tutor, student["id"], days(-30))
    future = await create_lesson(client, tutor, student["id"], days(30))
    assert past["settled"] is True
    assert future["settled"] is False
    assert (await get_lesson(client, tutor, past["id"]))["settled"] is True
    assert (await get_lesson(client, tutor, future["id"]))["settled"] is False
    items = (await list_lessons(client, tutor, days(-30), days(30))).json()["items"]
    assert [(i["id"], i["settled"]) for i in items] == [(past["id"], True), (future["id"], False)]


async def test_settled_uses_the_tutors_timezone(client, make_user) -> None:
    """Same date and time for two tutors 25 hours apart: concluded for one, scheduled for the other."""
    ahead, behind = "Pacific/Kiritimati", "Pacific/Pago_Pago"  # UTC+14 and UTC-11, no DST
    behind_now = dt.datetime.now(ZoneInfo(behind)).replace(tzinfo=None)
    target = (behind_now + dt.timedelta(hours=12)).replace(minute=0, second=0, microsecond=0)
    if target.hour == 0:
        target = target.replace(minute=30)
    start = (target - dt.timedelta(minutes=30)).strftime("%H:%M")
    end = target.strftime("%H:%M")
    # `end` is 11-12.5 hours after "now" in Pago Pago and 12.5-14 hours before "now" in Kiritimati.

    early = await make_user("Kiri", timezone=ahead)
    late = await make_user("Pago", timezone=behind)
    for tutor, expected in ((early, True), (late, False)):
        student = await new_student(client, tutor)
        lesson = await create_lesson(client, tutor, student["id"], target.date(), start, end)
        assert lesson["settled"] is expected, tutor.email


# ---------------------------------------------------------------------------------------------
# GET /lessons (agenda range)
# ---------------------------------------------------------------------------------------------


async def test_list_range_is_inclusive_and_ordered(client, make_user) -> None:
    tutor = await make_user()
    marco = await new_student(client, tutor, "Marco")
    anna = await new_student(client, tutor, "Anna")
    first, last = days(10), days(20)

    before = await create_lesson(client, tutor, marco["id"], first - dt.timedelta(days=1), "09:00", "10:00")
    marco_late = await create_lesson(client, tutor, marco["id"], first, "17:00", "18:00")
    anna_late = await create_lesson(client, tutor, anna["id"], first, "17:00", "18:00")
    marco_early = await create_lesson(client, tutor, marco["id"], first, "09:00", "10:00")
    anna_mid = await create_lesson(client, tutor, anna["id"], first + dt.timedelta(days=5), "10:00", "11:00")
    marco_last = await create_lesson(client, tutor, marco["id"], last, "08:00", "09:00")
    after = await create_lesson(client, tutor, marco["id"], last + dt.timedelta(days=1), "08:00", "09:00")

    response = await list_lessons(client, tutor, first, last)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    ids = [i["id"] for i in body["items"]]
    # Ordered by date, start time, then student first name (Anna before Marco at the same slot).
    assert ids == [marco_early["id"], anna_late["id"], marco_late["id"], anna_mid["id"], marco_last["id"]]
    assert before["id"] not in ids
    assert after["id"] not in ids
    assert all(set(i) == LESSON_KEYS for i in body["items"])
    assert body["items"][1]["student"] == {"id": anna["id"], "display_name": "Anna"}

    # Single-day range.
    single = (await list_lessons(client, tutor, last, last)).json()["items"]
    assert [i["id"] for i in single] == [marco_last["id"]]


async def test_list_filters_by_student(client, make_user) -> None:
    tutor = await make_user()
    marco = await new_student(client, tutor, "Marco")
    anna = await new_student(client, tutor, "Anna")
    m1 = await create_lesson(client, tutor, marco["id"], days(2), "10:00", "11:00")
    await create_lesson(client, tutor, anna["id"], days(2), "09:00", "10:00")
    m2 = await create_lesson(client, tutor, marco["id"], days(4), "10:00", "11:00")

    items = (await list_lessons(client, tutor, days(0), days(7), student_id=marco["id"])).json()["items"]
    assert [i["id"] for i in items] == [m1["id"], m2["id"]]
    assert {i["student"]["id"] for i in items} == {marco["id"]}

    unknown = await list_lessons(client, tutor, days(0), days(7), student_id=str(uuid.uuid4()))
    assert unknown.json() == {"items": []}

    bad = await list_lessons(client, tutor, days(0), days(7), student_id="marco")
    assert_invalid(bad, "student_id", MSG_BAD_ID)


async def test_list_range_is_at_most_62_days(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    start = days(-20)
    edge = await create_lesson(client, tutor, student["id"], start + dt.timedelta(days=62))

    ok = await list_lessons(client, tutor, start, start + dt.timedelta(days=62))
    assert ok.status_code == 200, ok.text
    assert [i["id"] for i in ok.json()["items"]] == [edge["id"]]

    too_long = await list_lessons(client, tutor, start, start + dt.timedelta(days=63))
    assert_invalid(too_long, "to", "L'intervallo massimo è di 62 giorni.")

    reversed_range = await list_lessons(client, tutor, start, start - dt.timedelta(days=1))
    assert_invalid(reversed_range, "to", "La data finale deve essere successiva a quella iniziale.")


async def test_list_requires_a_valid_range(client, make_user) -> None:
    tutor = await make_user()
    only_to = await client.get(f"{API}/lessons", params={"to": str(days(1))}, headers=tutor.headers)
    assert_invalid(only_to, "from", MSG_REQUIRED)
    only_from = await client.get(f"{API}/lessons", params={"from": str(days(1))}, headers=tutor.headers)
    assert_invalid(only_from, "to", MSG_REQUIRED)
    neither = await client.get(f"{API}/lessons", headers=tutor.headers)
    assert_problem(
        neither,
        422,
        "validation_error",
        detail=MSG_REQUIRED,
        errors=[{"field": "from", "message": MSG_REQUIRED}, {"field": "to", "message": MSG_REQUIRED}],
    )
    bad = await client.get(
        f"{API}/lessons", params={"from": "01/10/2026", "to": "2026-10-31"}, headers=tutor.headers
    )
    assert_invalid(bad, "from", MSG_BAD_DATE)


# ---------------------------------------------------------------------------------------------
# GET / DELETE single lesson
# ---------------------------------------------------------------------------------------------


async def test_unknown_lesson_is_404(client, make_user) -> None:
    tutor = await make_user()
    missing = str(uuid.uuid4())
    assert_not_found(
        await client.get(f"{API}/lessons/{missing}", headers=tutor.headers), MSG_LESSON_NOT_FOUND
    )
    assert_not_found(await patch_lesson(client, tutor, missing, {"notes": "x"}), MSG_LESSON_NOT_FOUND)
    assert_not_found(
        await client.delete(f"{API}/lessons/{missing}", headers=tutor.headers), MSG_LESSON_NOT_FOUND
    )
    assert_not_found(
        await client.post(f"{API}/lessons/{missing}/duplicate", headers=tutor.headers), MSG_LESSON_NOT_FOUND
    )
    malformed = await client.get(f"{API}/lessons/abc", headers=tutor.headers)
    assert_invalid(malformed, "lesson_id", MSG_BAD_ID)


async def test_delete_lesson(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    keep = await create_lesson(client, tutor, student["id"], days(-2))
    gone = await create_lesson(client, tutor, student["id"], days(-1))

    response = await client.delete(f"{API}/lessons/{gone['id']}", headers=tutor.headers)
    assert response.status_code == 204
    assert response.content == b""
    assert_not_found(
        await client.get(f"{API}/lessons/{gone['id']}", headers=tutor.headers), MSG_LESSON_NOT_FOUND
    )
    assert_not_found(
        await client.delete(f"{API}/lessons/{gone['id']}", headers=tutor.headers), MSG_LESSON_NOT_FOUND
    )
    items = (await list_lessons(client, tutor, days(-5), days(5))).json()["items"]
    assert [i["id"] for i in items] == [keep["id"]]
    assert await db.fetchval("select count(*) from app.lessons where id = $1", uuid.UUID(gone["id"])) == 0


# ---------------------------------------------------------------------------------------------
# PATCH /lessons/{id}
# ---------------------------------------------------------------------------------------------


async def test_patch_date_keeps_the_rate(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    lesson = await create_lesson(client, tutor, student["id"], days(-30), "15:00", "16:00")
    await add_rate(client, tutor, student["id"], 2500, days(-10))

    response = await patch_lesson(client, tutor, lesson["id"], {"date": str(days(30))})
    assert response.status_code == 200, response.text
    moved = response.json()
    assert moved["date"] == str(days(30))
    assert moved["hourly_rate_cents"] == 2000  # D-16: not re-derived at the new date
    assert moved["amount_cents"] == 2000
    assert moved["settled"] is False
    assert (await lesson_row(db, lesson["id"]))["rate_overridden"] is False
    # A fresh lesson on that date would take the newer rate.
    fresh = await create_lesson(client, tutor, student["id"], days(30), "17:00", "18:00")
    assert fresh["hourly_rate_cents"] == 2500


async def test_patch_explicit_rate_sets_and_clears_the_override(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    lesson = await create_lesson(client, tutor, student["id"], days(-3), "15:00", "16:30")

    typed = (await patch_lesson(client, tutor, lesson["id"], {"hourly_rate_cents": 1800})).json()
    assert (typed["hourly_rate_cents"], typed["amount_cents"]) == (1800, 2700)
    assert (await lesson_row(db, lesson["id"]))["rate_overridden"] is True

    back = (await patch_lesson(client, tutor, lesson["id"], {"hourly_rate_cents": 2000})).json()
    assert (back["hourly_rate_cents"], back["amount_cents"]) == (2000, 3000)
    assert (await lesson_row(db, lesson["id"]))["rate_overridden"] is False


async def test_patch_times_recompute_duration_and_amount(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    lesson = await create_lesson(client, tutor, student["id"], days(-3), "15:00", "16:00")

    longer = (await patch_lesson(client, tutor, lesson["id"], {"end_time": "16:30"})).json()
    assert (longer["start_time"], longer["end_time"]) == ("15:00", "16:30")
    assert (longer["duration_minutes"], longer["amount_cents"]) == (90, 3000)

    earlier = (await patch_lesson(client, tutor, lesson["id"], {"start_time": "14:45"})).json()
    assert (earlier["duration_minutes"], earlier["amount_cents"]) == (105, 3500)

    both = (
        await patch_lesson(client, tutor, lesson["id"], {"start_time": "18:00", "end_time": "18:25"})
    ).json()
    assert (both["duration_minutes"], both["amount_cents"]) == (25, 833)  # 833.33 -> 833


async def test_patch_validates_times_against_the_stored_values(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    lesson = await create_lesson(client, tutor, student["id"], days(-3), "15:00", "16:00")

    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"start_time": "16:00"}),
        "end_time",
        MSG_END_AFTER_START,
    )
    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"end_time": "14:59"}),
        "end_time",
        MSG_END_AFTER_START,
    )
    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"start_time": "03:59"}), "end_time", MSG_MAX_12H
    )
    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"start_time": "15:00:30"}), "start_time", MSG_HHMM
    )
    assert_invalid(await patch_lesson(client, tutor, lesson["id"], {"end_time": "4pm"}), "end_time", MSG_HHMM)
    assert_invalid(
        await patch_lesson(
            client, tutor, lesson["id"], {"date": str(shift_years(today(), 2) + dt.timedelta(days=3))}
        ),
        "date",
        MSG_DATE_WINDOW,
    )
    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"hourly_rate_cents": -1}),
        "hourly_rate_cents",
        "Il valore minimo è 0.",
    )
    # The exact 12 hours are fine.
    ok = await patch_lesson(client, tutor, lesson["id"], {"start_time": "04:00"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["duration_minutes"] == 720
    # Rejected patches changed nothing else.
    current = await get_lesson(client, tutor, lesson["id"])
    assert (current["date"], current["start_time"], current["end_time"]) == (str(days(-3)), "04:00", "16:00")
    assert current["hourly_rate_cents"] == 2000


@pytest.mark.parametrize("field", ["student_id", "date", "start_time", "end_time", "hourly_rate_cents"])
async def test_patch_explicit_null_for_a_required_field(client, make_user, field) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    lesson = await create_lesson(client, tutor, student["id"], days(-3))
    response = await patch_lesson(client, tutor, lesson["id"], {field: None})
    assert_invalid(response, field, MSG_REQUIRED)
    assert await get_lesson(client, tutor, lesson["id"]) == lesson


async def test_patch_nullable_fields(client, make_user) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    math = await subject_id(client, tutor, "Matematica")
    latin = await subject_id(client, tutor, "Latino")
    student = await new_student(client, tutor, default_subject_id=math)
    lesson = await create_lesson(client, tutor, student["id"], days(-3), topic="Derivate", notes="Bene")
    assert lesson["subject"] == {"id": math, "name": "Matematica"}

    changed = (await patch_lesson(client, tutor, lesson["id"], {"subject_id": latin})).json()
    assert changed["subject"] == {"id": latin, "name": "Latino"}
    assert (changed["topic"], changed["notes"]) == ("Derivate", "Bene")

    cleared = (
        await patch_lesson(client, tutor, lesson["id"], {"subject_id": None, "topic": None, "notes": "  "})
    ).json()
    assert (cleared["subject"], cleared["topic"], cleared["notes"]) == (None, None, None)

    foreign = await subject_id(client, other, "Latino")
    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"subject_id": foreign}),
        "subject_id",
        MSG_SUBJECT_NOT_FOUND,
    )
    assert_invalid(
        await patch_lesson(client, tutor, lesson["id"], {"topic": "x" * 201}),
        "topic",
        "Testo troppo lungo (massimo 200 caratteri).",
    )


async def test_patch_notes_does_not_touch_the_rate(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    lesson = await create_lesson(client, tutor, student["id"], days(-30), "15:00", "16:00")
    typed = await create_lesson(client, tutor, student["id"], days(-29), hourly_rate_cents=1500)
    # The history moves on without repricing: both lessons now differ from it.
    await add_rate(client, tutor, student["id"], 2500, days(-60))

    for item, rate, overridden in ((lesson, 2000, False), (typed, 1500, True)):
        patched = (
            await patch_lesson(client, tutor, item["id"], {"notes": "Portare il libro", "topic": "Limiti"})
        ).json()
        assert (patched["notes"], patched["topic"]) == ("Portare il libro", "Limiti")
        assert (patched["hourly_rate_cents"], patched["amount_cents"]) == (rate, rate)
        assert (await lesson_row(db, item["id"]))["rate_overridden"] is overridden
        # Re-sending the same student is not a move either.
        same = (await patch_lesson(client, tutor, item["id"], {"student_id": student["id"]})).json()
        assert same["hourly_rate_cents"] == rate


async def test_patch_empty_body_changes_nothing(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    lesson = await create_lesson(client, tutor, student["id"], days(-3))
    response = await patch_lesson(client, tutor, lesson["id"], {})
    assert response.status_code == 200, response.text
    assert response.json() == lesson
    assert [r["action"] for r in await activity_rows(db, lesson["id"])] == ["insert"]


async def test_patch_move_to_another_student_rederives_the_history_rate(client, make_user, db) -> None:
    tutor = await make_user()
    luca = await new_student(client, tutor, "Luca", 2000)
    sara = await new_student(client, tutor, "Sara", 3000, last_name="Bianchi")
    await add_rate(client, tutor, sara["id"], 3600, days(-60))
    lesson = await create_lesson(client, tutor, luca["id"], days(-30), "15:00", "16:30")
    assert lesson["hourly_rate_cents"] == 2000

    moved = (await patch_lesson(client, tutor, lesson["id"], {"student_id": sara["id"]})).json()
    assert moved["student"] == {"id": sara["id"], "display_name": "Sara Bianchi"}
    assert moved["hourly_rate_cents"] == 3600  # Sara's rate at the lesson date
    assert moved["amount_cents"] == 5400
    row = await lesson_row(db, lesson["id"])
    assert (row["student_id"], row["rate_overridden"]) == (uuid.UUID(sara["id"]), False)

    # Moving together with a new date uses the new student's rate at the new date.
    back = (await patch_lesson(client, tutor, lesson["id"], {"student_id": luca["id"]})).json()
    assert back["hourly_rate_cents"] == 2000
    again = (
        await patch_lesson(client, tutor, lesson["id"], {"student_id": sara["id"], "date": str(days(-90))})
    ).json()
    assert (again["date"], again["hourly_rate_cents"], again["amount_cents"]) == (str(days(-90)), 3000, 4500)
    assert (await lesson_row(db, lesson["id"]))["rate_overridden"] is False


async def test_patch_move_keeps_a_hand_typed_rate(client, make_user, db) -> None:
    tutor = await make_user()
    luca = await new_student(client, tutor, "Luca", 2000)
    sara = await new_student(client, tutor, "Sara", 3000)
    lesson = await create_lesson(client, tutor, luca["id"], days(-30), hourly_rate_cents=1500)

    moved = (await patch_lesson(client, tutor, lesson["id"], {"student_id": sara["id"]})).json()
    assert moved["student"]["id"] == sara["id"]
    assert (moved["hourly_rate_cents"], moved["amount_cents"]) == (1500, 1500)
    assert (await lesson_row(db, lesson["id"]))["rate_overridden"] is True


async def test_patch_move_with_an_explicit_rate(client, make_user, db) -> None:
    tutor = await make_user()
    luca = await new_student(client, tutor, "Luca", 2000)
    sara = await new_student(client, tutor, "Sara", 3000)
    lesson = await create_lesson(client, tutor, luca["id"], days(-30))

    typed = (
        await patch_lesson(client, tutor, lesson["id"], {"student_id": sara["id"], "hourly_rate_cents": 2222})
    ).json()
    assert (typed["hourly_rate_cents"], typed["amount_cents"]) == (2222, 2222)
    assert (await lesson_row(db, lesson["id"]))["rate_overridden"] is True

    # Sending exactly the new student's history rate counts as "follows the history".
    follows = await create_lesson(client, tutor, luca["id"], days(-29))
    sent = (
        await patch_lesson(
            client, tutor, follows["id"], {"student_id": sara["id"], "hourly_rate_cents": 3000}
        )
    ).json()
    assert sent["hourly_rate_cents"] == 3000
    assert (await lesson_row(db, follows["id"]))["rate_overridden"] is False


async def test_patch_move_to_a_student_that_is_not_yours(client, make_user) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, tutor)
    foreign = await new_student(client, other, "Marta", 9000)
    lesson = await create_lesson(client, tutor, student["id"], days(-3))
    for target in (foreign["id"], str(uuid.uuid4())):
        response = await patch_lesson(client, tutor, lesson["id"], {"student_id": target})
        assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)
    assert await get_lesson(client, tutor, lesson["id"]) == lesson


# ---------------------------------------------------------------------------------------------
# POST /lessons/{id}/duplicate
# ---------------------------------------------------------------------------------------------


async def test_duplicate_without_body_copies_the_lesson(client, make_user, db) -> None:
    tutor = await make_user()
    math = await subject_id(client, tutor, "Matematica")
    student = await new_student(client, tutor, rate_cents=2000, default_subject_id=math)
    source = await create_lesson(
        client, tutor, student["id"], days(-7), "15:30", "17:00", topic="Integrali", notes="Privato"
    )

    for body in (None, {}):
        if body is None:
            response = await client.post(f"{API}/lessons/{source['id']}/duplicate", headers=tutor.headers)
        else:
            response = await client.post(
                f"{API}/lessons/{source['id']}/duplicate", json=body, headers=tutor.headers
            )
        assert response.status_code == 201, response.text
        copy = response.json()
        assert copy["id"] != source["id"]
        same = {k: v for k, v in copy.items() if k not in ("id", "created_at", "updated_at")}
        expected = {k: v for k, v in source.items() if k not in ("id", "created_at", "updated_at")}
        assert same == expected
        assert (copy["hourly_rate_cents"], copy["amount_cents"]) == (2000, 3000)
        assert (await lesson_row(db, copy["id"]))["rate_overridden"] is False

    # The source is untouched; both copies are separate lessons.
    items = (await list_lessons(client, tutor, days(-7), days(-7))).json()["items"]
    assert len(items) == 3
    assert await get_lesson(client, tutor, source["id"]) == source


async def test_duplicate_same_day_copies_a_hand_typed_rate(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    source = await create_lesson(client, tutor, student["id"], days(-7), hourly_rate_cents=4000)
    copy = (await client.post(f"{API}/lessons/{source['id']}/duplicate", headers=tutor.headers)).json()
    assert (copy["hourly_rate_cents"], copy["amount_cents"]) == (4000, 4000)
    assert (await lesson_row(db, copy["id"]))["rate_overridden"] is True


async def test_duplicate_same_day_follows_the_current_history(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    source = await create_lesson(client, tutor, student["id"], days(-30))
    await add_rate(client, tutor, student["id"], 2400, days(-60))  # not repriced: source keeps 2000
    assert (await get_lesson(client, tutor, source["id"]))["hourly_rate_cents"] == 2000

    copy = (await client.post(f"{API}/lessons/{source['id']}/duplicate", headers=tutor.headers)).json()
    # Same as registering that lesson now (POST /lessons without a rate) ...
    fresh = await create_lesson(client, tutor, student["id"], days(-30), "18:00", "19:00")
    assert fresh["hourly_rate_cents"] == 2400
    # ... and never silently marked as typed by hand.
    assert (await lesson_row(db, copy["id"]))["rate_overridden"] is False
    assert copy["hourly_rate_cents"] == 2400


async def test_duplicate_for_another_student_uses_their_history(client, make_user, db) -> None:
    tutor = await make_user()
    physics = await subject_id(client, tutor, "Fisica")
    luca = await new_student(client, tutor, "Luca", 2000)
    sara = await new_student(client, tutor, "Sara", 3000, last_name="Verdi")
    await add_rate(client, tutor, sara["id"], 3600, days(-60))

    for rate in (None, 1500):  # history-derived and hand-typed sources alike
        extra = {} if rate is None else {"hourly_rate_cents": rate}
        source = await create_lesson(
            client,
            tutor,
            luca["id"],
            days(-30),
            "15:00",
            "16:30",
            subject_id=physics,
            topic="Ottica",
            **extra,
        )
        response = await client.post(
            f"{API}/lessons/{source['id']}/duplicate", json={"student_id": sara["id"]}, headers=tutor.headers
        )
        assert response.status_code == 201, response.text
        copy = response.json()
        assert copy["student"] == {"id": sara["id"], "display_name": "Sara Verdi"}
        assert (copy["date"], copy["start_time"], copy["end_time"]) == (str(days(-30)), "15:00", "16:30")
        assert copy["subject"] == {"id": physics, "name": "Fisica"}
        assert copy["topic"] == "Ottica"
        assert (copy["hourly_rate_cents"], copy["amount_cents"]) == (3600, 5400)
        assert (await lesson_row(db, copy["id"]))["rate_overridden"] is False

    # Another student and another date: their history at that date.
    source = await create_lesson(client, tutor, luca["id"], days(-30))
    response = await client.post(
        f"{API}/lessons/{source['id']}/duplicate",
        json={"student_id": sara["id"], "date": str(days(-90))},
        headers=tutor.headers,
    )
    assert response.status_code == 201, response.text
    assert (response.json()["date"], response.json()["hourly_rate_cents"]) == (str(days(-90)), 3000)


async def test_duplicate_same_student_other_date(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    await add_rate(client, tutor, student["id"], 2500, days(-10))
    follows = await create_lesson(
        client, tutor, student["id"], days(-30), "15:00", "16:00", notes="Settimanale"
    )
    typed = await create_lesson(
        client, tutor, student["id"], days(-30), "17:00", "18:00", hourly_rate_cents=1500
    )
    target = days(7)

    # History-derived: re-derived at the new date.
    response = await client.post(
        f"{API}/lessons/{follows['id']}/duplicate", json={"date": str(target)}, headers=tutor.headers
    )
    assert response.status_code == 201, response.text
    copy = response.json()
    assert (copy["date"], copy["start_time"], copy["end_time"]) == (str(target), "15:00", "16:00")
    assert (copy["hourly_rate_cents"], copy["amount_cents"]) == (2500, 2500)
    assert copy["notes"] == "Settimanale"
    assert copy["settled"] is False
    assert (await lesson_row(db, copy["id"]))["rate_overridden"] is False

    # Hand-typed: copied as is (explicit same student id behaves the same).
    response = await client.post(
        f"{API}/lessons/{typed['id']}/duplicate",
        json={"student_id": student["id"], "date": str(target)},
        headers=tutor.headers,
    )
    assert response.status_code == 201, response.text
    copy = response.json()
    assert (copy["date"], copy["hourly_rate_cents"], copy["amount_cents"]) == (str(target), 1500, 1500)
    assert (await lesson_row(db, copy["id"]))["rate_overridden"] is True


async def test_duplicate_validation(client, make_user) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, tutor)
    foreign = await new_student(client, other, "Marta")
    source = await create_lesson(client, tutor, student["id"], days(-3))
    url = f"{API}/lessons/{source['id']}/duplicate"

    for target in (foreign["id"], str(uuid.uuid4())):
        response = await client.post(url, json={"student_id": target}, headers=tutor.headers)
        assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)
    far = shift_years(today(), 2) + dt.timedelta(days=3)
    assert_invalid(
        await client.post(url, json={"date": str(far)}, headers=tutor.headers), "date", MSG_DATE_WINDOW
    )
    assert_invalid(
        await client.post(url, json={"date": "domani"}, headers=tutor.headers), "date", MSG_BAD_DATE
    )
    # Nothing was created by the rejected requests.
    assert len((await list_lessons(client, tutor, days(-5), days(5))).json()["items"]) == 1
    assert (await list_lessons(client, other, days(-5), days(5))).json()["items"] == []


# ---------------------------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------------------------


async def test_create_and_get_payment(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, "Giulia", last_name="Neri")
    response = await client.post(
        f"{API}/payments",
        json={
            "student_id": student["id"],
            "amount_cents": 4550,
            "paid_on": str(days(-2)),
            "method": "bank_transfer",
            "note": "  Bonifico di settembre  ",
        },
        headers=tutor.headers,
    )
    assert response.status_code == 201, response.text
    payment = response.json()
    assert set(payment) == PAYMENT_KEYS
    uuid.UUID(payment["id"])
    assert payment["student"] == {"id": student["id"], "display_name": "Giulia Neri"}
    assert payment["amount_cents"] == 4550
    assert payment["paid_on"] == str(days(-2))
    assert payment["method"] == "bank_transfer"
    assert payment["note"] == "Bonifico di settembre"
    dt.datetime.fromisoformat(payment["created_at"])
    dt.datetime.fromisoformat(payment["updated_at"])

    fetched = await client.get(f"{API}/payments/{payment['id']}", headers=tutor.headers)
    assert fetched.status_code == 200
    assert fetched.json() == payment


@pytest.mark.parametrize("method", ["cash", "bank_transfer", "other"])
async def test_payment_methods(client, make_user, method) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    payment = await create_payment(client, tutor, student["id"], 2000, days(-1), method)
    assert payment["method"] == method
    assert payment["note"] is None


@pytest.mark.parametrize("method", ["paypal", "Cash", "contanti", "", None])
async def test_payment_invalid_method(client, make_user, method) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    body = {"student_id": student["id"], "amount_cents": 2000, "paid_on": str(days(-1)), "method": method}
    response = await client.post(f"{API}/payments", json=body, headers=tutor.headers)
    body = assert_problem(response, 422, "validation_error")
    assert [e["field"] for e in body["errors"]] == ["method"]
    message = body["errors"][0]["message"]
    assert body["detail"] == message
    assert message.startswith("Valore non ammesso (valori possibili: ")
    for allowed in ("cash", "bank_transfer", "other"):
        assert allowed in message


async def test_payment_invalid_method_message_is_italian(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    body = {"student_id": student["id"], "amount_cents": 2000, "paid_on": str(days(-1)), "method": "paypal"}
    response = await client.post(f"{API}/payments", json=body, headers=tutor.headers)
    detail = assert_problem(response, 422, "validation_error")["detail"]
    assert detail.startswith("Valore non ammesso")
    assert " or " not in detail


@pytest.mark.parametrize(
    ("amount", "message"),
    [
        (1, None),
        (10_000_000, None),
        (0, "Il valore minimo è 1."),
        (-500, "Il valore minimo è 1."),
        (10_000_001, "Il valore massimo è 10000000."),
        (12.5, "Deve essere un numero intero."),
        ("dieci", "Deve essere un numero intero."),
    ],
)
async def test_payment_amount_bounds(client, make_user, amount, message) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    body = {"student_id": student["id"], "amount_cents": amount, "paid_on": str(days(-1)), "method": "cash"}
    response = await client.post(f"{API}/payments", json=body, headers=tutor.headers)
    if message is None:
        assert response.status_code == 201, response.text
        assert response.json()["amount_cents"] == amount
    else:
        assert_invalid(response, "amount_cents", message)


async def test_payment_note_length(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    longest = await create_payment(client, tutor, student["id"], 100, days(-1), "other", note="n" * 500)
    assert longest["note"] == "n" * 500
    blank = await create_payment(client, tutor, student["id"], 100, days(-1), "other", note="   ")
    assert blank["note"] is None

    body = {"student_id": student["id"], "amount_cents": 100, "paid_on": str(days(-1)), "method": "other"}
    response = await client.post(f"{API}/payments", json={**body, "note": "n" * 501}, headers=tutor.headers)
    assert_invalid(response, "note", "Testo troppo lungo (massimo 500 caratteri).")


async def test_payment_required_fields_and_formats(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await client.post(f"{API}/payments", json={}, headers=tutor.headers)
    assert_problem(
        response,
        422,
        "validation_error",
        detail=MSG_REQUIRED,
        errors=[
            {"field": "student_id", "message": MSG_REQUIRED},
            {"field": "amount_cents", "message": MSG_REQUIRED},
            {"field": "paid_on", "message": MSG_REQUIRED},
            {"field": "method", "message": MSG_REQUIRED},
        ],
    )
    body = {"student_id": student["id"], "amount_cents": 100, "paid_on": "31/12/2026", "method": "cash"}
    assert_invalid(
        await client.post(f"{API}/payments", json=body, headers=tutor.headers), "paid_on", MSG_BAD_DATE
    )
    body = {"student_id": "x", "amount_cents": 100, "paid_on": str(days(-1)), "method": "cash"}
    assert_invalid(
        await client.post(f"{API}/payments", json=body, headers=tutor.headers), "student_id", MSG_BAD_ID
    )


@pytest.mark.parametrize("whose", ["other_tutor", "unknown"])
async def test_payment_for_a_student_that_is_not_yours(client, make_user, whose) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    student_id = (
        (await new_student(client, other, "Marta"))["id"] if whose == "other_tutor" else str(uuid.uuid4())
    )
    body = {"student_id": student_id, "amount_cents": 100, "paid_on": str(days(-1)), "method": "cash"}
    response = await client.post(f"{API}/payments", json=body, headers=tutor.headers)
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)


async def test_patch_payment(client, make_user) -> None:
    tutor = await make_user()
    luca = await new_student(client, tutor, "Luca")
    sara = await new_student(client, tutor, "Sara")
    payment = await create_payment(client, tutor, luca["id"], 4000, days(-5), "cash", note="Acconto")
    url = f"{API}/payments/{payment['id']}"

    response = await client.patch(
        url, json={"amount_cents": 4500, "method": "other", "paid_on": str(days(-4))}, headers=tutor.headers
    )
    assert response.status_code == 200, response.text
    patched = response.json()
    assert (patched["amount_cents"], patched["method"], patched["paid_on"]) == (4500, "other", str(days(-4)))
    assert patched["note"] == "Acconto"  # untouched
    assert patched["student"] == {"id": luca["id"], "display_name": "Luca"}
    assert patched["created_at"] == payment["created_at"]
    assert dt.datetime.fromisoformat(patched["updated_at"]) > dt.datetime.fromisoformat(payment["updated_at"])

    moved = (
        await client.patch(url, json={"student_id": sara["id"], "note": None}, headers=tutor.headers)
    ).json()
    assert moved["student"] == {"id": sara["id"], "display_name": "Sara"}
    assert moved["note"] is None
    assert moved["amount_cents"] == 4500

    same = await client.patch(url, json={}, headers=tutor.headers)
    assert same.status_code == 200
    assert same.json() == moved


@pytest.mark.parametrize("field", ["student_id", "amount_cents", "paid_on", "method"])
async def test_patch_payment_explicit_null_for_a_required_field(client, make_user, field) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    payment = await create_payment(client, tutor, student["id"], 4000, days(-5))
    response = await client.patch(
        f"{API}/payments/{payment['id']}", json={field: None}, headers=tutor.headers
    )
    assert_invalid(response, field, MSG_REQUIRED)
    fetched = await client.get(f"{API}/payments/{payment['id']}", headers=tutor.headers)
    assert fetched.json() == payment


async def test_patch_payment_validation(client, make_user) -> None:
    tutor, other = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, tutor)
    foreign = await new_student(client, other, "Marta")
    payment = await create_payment(client, tutor, student["id"], 4000, days(-5))
    url = f"{API}/payments/{payment['id']}"

    assert_invalid(
        await client.patch(url, json={"amount_cents": 0}, headers=tutor.headers),
        "amount_cents",
        "Il valore minimo è 1.",
    )
    assert_invalid(
        await client.patch(url, json={"amount_cents": 10_000_001}, headers=tutor.headers),
        "amount_cents",
        "Il valore massimo è 10000000.",
    )
    bad_method = await client.patch(url, json={"method": "satispay"}, headers=tutor.headers)
    assert [e["field"] for e in assert_problem(bad_method, 422, "validation_error")["errors"]] == ["method"]
    assert_invalid(
        await client.patch(url, json={"note": "x" * 501}, headers=tutor.headers),
        "note",
        "Testo troppo lungo (massimo 500 caratteri).",
    )
    assert_invalid(
        await client.patch(url, json={"student_id": foreign["id"]}, headers=tutor.headers),
        "student_id",
        MSG_STUDENT_NOT_FOUND,
    )
    assert (await client.get(url, headers=tutor.headers)).json() == payment


async def test_delete_payment_and_unknown_payment(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    payment = await create_payment(client, tutor, student["id"], 4000, days(-5))
    url = f"{API}/payments/{payment['id']}"

    response = await client.delete(url, headers=tutor.headers)
    assert response.status_code == 204
    assert response.content == b""
    assert_not_found(await client.get(url, headers=tutor.headers), MSG_PAYMENT_NOT_FOUND)
    assert_not_found(await client.delete(url, headers=tutor.headers), MSG_PAYMENT_NOT_FOUND)
    assert_not_found(
        await client.patch(url, json={"amount_cents": 1}, headers=tutor.headers), MSG_PAYMENT_NOT_FOUND
    )
    assert await db.fetchval("select count(*) from app.payments where id = $1", uuid.UUID(payment["id"])) == 0
    malformed = await client.get(f"{API}/payments/123", headers=tutor.headers)
    assert_invalid(malformed, "payment_id", MSG_BAD_ID)


async def test_there_is_no_global_payments_list(client, make_user, app_client, tmp_path: Path) -> None:
    """D-20: payments are read through the student ledger; GET /payments does not exist."""
    tutor = await make_user()
    student = await new_student(client, tutor)
    await create_payment(client, tutor, student["id"], 4000, days(-5))

    # API only: the path exists for POST, so a GET is "method not allowed" (no list is ever served).
    for params in ({}, {"student_id": student["id"]}):
        response = await client.get(f"{API}/payments", params=params, headers=tutor.headers)
        body = assert_problem(
            response, 405, "method_not_allowed", detail="Metodo non consentito per questa risorsa."
        )
        assert body["title"] == "Metodo non consentito"
        assert "items" not in body

    # With the SPA mounted (production layout) every unknown call under /api is a plain 404.
    (tmp_path / "index.html").write_text("<!doctype html><title>RipetiFlow</title>")
    spa = await app_client(static_dir=tmp_path)
    response = await spa.get(f"{API}/payments", headers=tutor.headers)
    body = assert_problem(response, 404, "not_found", detail="La risorsa richiesta non esiste.")
    assert "items" not in body


# ---------------------------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------------------------


async def test_lessons_are_isolated_between_tutors(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, anna)
    lesson = await create_lesson(client, anna, student["id"], days(-3), topic="Segreto")
    bruno_student = await new_student(client, bruno, "Piero")
    url = f"{API}/lessons/{lesson['id']}"

    assert_not_found(await client.get(url, headers=bruno.headers), MSG_LESSON_NOT_FOUND)
    assert_not_found(
        await client.patch(url, json={"notes": "preso"}, headers=bruno.headers), MSG_LESSON_NOT_FOUND
    )
    assert_not_found(
        await client.patch(url, json={"student_id": bruno_student["id"]}, headers=bruno.headers),
        MSG_LESSON_NOT_FOUND,
    )
    assert_not_found(await client.delete(url, headers=bruno.headers), MSG_LESSON_NOT_FOUND)
    assert_not_found(await client.post(f"{url}/duplicate", headers=bruno.headers), MSG_LESSON_NOT_FOUND)
    assert_not_found(
        await client.post(
            f"{url}/duplicate", json={"student_id": bruno_student["id"]}, headers=bruno.headers
        ),
        MSG_LESSON_NOT_FOUND,
    )
    assert (await list_lessons(client, bruno, days(-5), days(5))).json() == {"items": []}
    assert (await list_lessons(client, bruno, days(-5), days(5), student_id=student["id"])).json() == {
        "items": []
    }

    # Anna still sees her lesson exactly as it was, and only it.
    assert await get_lesson(client, anna, lesson["id"]) == lesson
    assert [i["id"] for i in (await list_lessons(client, anna, days(-5), days(5))).json()["items"]] == [
        lesson["id"]
    ]

    # Bruno cannot attach his lessons to Anna's student or subject either.
    response = await post_lesson(client, bruno, lesson_body(student["id"], days(-1)))
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)
    anna_math = await subject_id(client, anna, "Matematica")
    response = await post_lesson(
        client, bruno, lesson_body(bruno_student["id"], days(-1), subject_id=anna_math)
    )
    assert_invalid(response, "subject_id", MSG_SUBJECT_NOT_FOUND)
    own = await create_lesson(client, bruno, bruno_student["id"], days(-1))
    response = await patch_lesson(client, bruno, own["id"], {"student_id": student["id"]})
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)
    response = await client.post(
        f"{API}/lessons/{own['id']}/duplicate", json={"student_id": student["id"]}, headers=bruno.headers
    )
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)


async def test_payments_are_isolated_between_tutors(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, anna)
    payment = await create_payment(client, anna, student["id"], 7000, days(-3), "cash", note="Ottobre")
    bruno_student = await new_student(client, bruno, "Piero")
    url = f"{API}/payments/{payment['id']}"

    assert_not_found(await client.get(url, headers=bruno.headers), MSG_PAYMENT_NOT_FOUND)
    assert_not_found(
        await client.patch(url, json={"amount_cents": 1}, headers=bruno.headers), MSG_PAYMENT_NOT_FOUND
    )
    assert_not_found(
        await client.patch(url, json={"student_id": bruno_student["id"]}, headers=bruno.headers),
        MSG_PAYMENT_NOT_FOUND,
    )
    assert_not_found(await client.delete(url, headers=bruno.headers), MSG_PAYMENT_NOT_FOUND)
    assert (await client.get(url, headers=anna.headers)).json() == payment

    body = {"student_id": student["id"], "amount_cents": 100, "paid_on": str(days(-1)), "method": "cash"}
    response = await client.post(f"{API}/payments", json=body, headers=bruno.headers)
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)
    own = await create_payment(client, bruno, bruno_student["id"], 100, days(-1))
    response = await client.patch(
        f"{API}/payments/{own['id']}", json={"student_id": student["id"]}, headers=bruno.headers
    )
    assert_invalid(response, "student_id", MSG_STUDENT_NOT_FOUND)


# ---------------------------------------------------------------------------------------------
# Activity log source (X-RipetiFlow-Source: assistant)
# ---------------------------------------------------------------------------------------------


async def test_assistant_header_marks_lesson_activity(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    assistant = {**tutor.headers, "X-RipetiFlow-Source": "assistant"}

    response = await client.post(
        f"{API}/lessons", json=lesson_body(student["id"], days(-1)), headers=assistant
    )
    assert response.status_code == 201, response.text
    lesson_id = response.json()["id"]
    await patch_lesson(client, tutor, lesson_id, {"notes": "Dall'app"})
    response = await client.patch(
        f"{API}/lessons/{lesson_id}",
        json={"end_time": "16:30"},
        headers={**tutor.headers, "X-RipetiFlow-Source": " Assistant "},
    )
    assert response.status_code == 200, response.text
    duplicate = await client.post(f"{API}/lessons/{lesson_id}/duplicate", headers=assistant)
    assert duplicate.status_code == 201, duplicate.text
    response = await client.delete(f"{API}/lessons/{lesson_id}", headers=assistant)
    assert response.status_code == 204

    rows = await activity_rows(db, lesson_id)
    assert [(r["entity"], r["action"], r["source"]) for r in rows] == [
        ("lesson", "insert", "assistant"),
        ("lesson", "update", "app"),
        ("lesson", "update", "assistant"),  # header value is trimmed and case-insensitive
        ("lesson", "delete", "assistant"),
    ]
    assert {(r["tutor_id"], r["student_id"]) for r in rows} == {(tutor.id, uuid.UUID(student["id"]))}
    copy_rows = await activity_rows(db, duplicate.json()["id"])
    assert [(r["action"], r["source"]) for r in copy_rows] == [("insert", "assistant")]


async def test_assistant_header_marks_payment_activity(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    body = {"student_id": student["id"], "amount_cents": 2500, "paid_on": str(days(-1)), "method": "cash"}

    response = await client.post(
        f"{API}/payments", json=body, headers={**tutor.headers, "X-RipetiFlow-Source": "assistant"}
    )
    assert response.status_code == 201, response.text
    payment_id = response.json()["id"]
    url = f"{API}/payments/{payment_id}"
    # Any other value is an ordinary app write.
    response = await client.patch(
        url, json={"amount_cents": 3000}, headers={**tutor.headers, "X-RipetiFlow-Source": "matita"}
    )
    assert response.status_code == 200, response.text
    response = await client.delete(url, headers={**tutor.headers, "X-RipetiFlow-Source": "assistant"})
    assert response.status_code == 204

    rows = await activity_rows(db, payment_id)
    assert [(r["entity"], r["action"], r["source"]) for r in rows] == [
        ("payment", "insert", "assistant"),
        ("payment", "update", "app"),
        ("payment", "delete", "assistant"),
    ]
    assert {r["student_id"] for r in rows} == {uuid.UUID(student["id"])}


async def test_writes_without_the_header_are_app(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    lesson = await create_lesson(client, tutor, student["id"], days(-1))
    payment = await create_payment(client, tutor, student["id"], 100, days(-1))
    # A failed write leaves no trace in the log.
    response = await post_lesson(client, tutor, lesson_body(student["id"], days(-1), "16:00", "15:00"))
    assert response.status_code == 422
    assert [(r["action"], r["source"]) for r in await activity_rows(db, lesson["id"])] == [("insert", "app")]
    assert [(r["action"], r["source"]) for r in await activity_rows(db, payment["id"])] == [("insert", "app")]
    count = await db.fetchval(
        "select count(*) from app.activity_log where tutor_id = $1 and entity in ('lesson', 'payment')",
        tutor.id,
    )
    assert count == 2
