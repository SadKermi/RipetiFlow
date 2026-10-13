"""Libro mastro, CSV export, dashboard "Oggi" and activity history (docs/05, D-17, D-18, D-21, D-24).

Covers GET /students/{id}/ledger (order, date filters, every LedgerEntry field, a running balance that
only counts settled entries), "settled" in each tutor's own timezone (Pacific/Kiritimati UTC+14 vs
Pacific/Pago_Pago UTC-11, lessons around midnight), the Italian Excel CSV exports, GET /dashboard and
GET /students/{id}/activity (Italian summaries, sources, cursor pagination), plus tenant isolation.

Dates are relative to "today" in the tutor's timezone. Tests that depend on the time of day use a
fixed-offset zone (Etc/GMT±N) whose local time is currently around noon, so "already ended" and
"still to come" never depend on when the suite runs.
"""

from __future__ import annotations

import datetime as dt
import json
import uuid
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.domain.activity import _Lookup, build_activity
from tests.conftest import User, create_lesson, create_payment, create_student

API = "/api/v1"
PROBLEM = "application/problem+json"
KIRI = "Pacific/Kiritimati"  # UTC+14, no DST
PAGO = "Pacific/Pago_Pago"  # UTC-11, no DST

LEDGER_ENTRY_KEYS = {
    "kind",
    "id",
    "date",
    "start_time",
    "end_time",
    "duration_minutes",
    "hourly_rate_cents",
    "subject",
    "topic",
    "method",
    "note",
    "debit_cents",
    "credit_cents",
    "settled",
    "running_balance_cents",
    "calendar",
}
BALANCE_KEYS = {
    "balance_cents",
    "projected_balance_cents",
    "charged_cents",
    "paid_cents",
    "scheduled_cents",
    "done_minutes",
    "scheduled_minutes",
    "current_hourly_rate_cents",
    "status",
    "credit_minutes",
}
DASHBOARD_KEYS = {"today", "upcoming", "owing", "in_credit", "totals", "month", "calendar"}
ACTIVITY_KEYS = {"id", "entity", "entity_id", "action", "source", "occurred_at", "summary", "changes"}
CAL_OFF = {"status": "off", "error": None}

CSV_HEADER = (
    "Data;Tipo;Descrizione;Inizio;Fine;Durata (min);Tariffa oraria (€);Dare (€);Avere (€);Saldo (€);Stato"
)
CSV_CONTENT_TYPE = "text/csv; charset=utf-8"
BOM = "﻿"

MONTHS_IT = [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
]

STUDENT_NOT_FOUND = "Studente non trovato."
BAD_ID = "Identificativo non valido."


# ---------------------------------------------------------------------------------------------
# Helpers (local to this file)
# ---------------------------------------------------------------------------------------------


def local_now(tz: str = "Europe/Rome") -> dt.datetime:
    """Naive wall-clock time in `tz`."""
    return dt.datetime.now(ZoneInfo(tz)).replace(tzinfo=None)


def today(tz: str = "Europe/Rome") -> dt.date:
    """Today in the tutor's timezone (the profile default is Europe/Rome)."""
    return local_now(tz).date()


def days(n: int, tz: str = "Europe/Rome") -> dt.date:
    return today(tz) + dt.timedelta(days=n)


def midday_zone() -> str:
    """A fixed-offset zone whose local time is now between 12:00 and 13:00 (>= 11 h from midnight)."""
    names = ["Etc/GMT", *(f"Etc/GMT-{n}" for n in range(1, 15)), *(f"Etc/GMT+{n}" for n in range(1, 13))]
    for name in names:
        if local_now(name).hour == 12:
            return name
    raise AssertionError("no Etc/GMT zone is at noon")  # pragma: no cover - offsets cover 27 hours


def euro(cents: int) -> str:
    """Independent oracle for the Italian money format: 1.234,50 €."""
    sign = "-" if cents < 0 else ""
    whole, rest = divmod(abs(cents), 100)
    return sign + f"{whole:,}".replace(",", ".") + f",{rest:02d} €"


def decimal_it(cents: int) -> str:
    """Spreadsheet number: comma decimals, no thousands separator."""
    sign = "-" if cents < 0 else ""
    whole, rest = divmod(abs(cents), 100)
    return f"{sign}{whole},{rest:02d}"


def date_it(day: dt.date) -> str:
    return f"{day.day:02d}/{day.month:02d}/{day.year}"


def short_day(day: dt.date) -> str:
    """Dates in activity summaries: dd/mm in the current year, dd/mm/yyyy otherwise."""
    return f"{day.day:02d}/{day.month:02d}" if day.year == dt.date.today().year else date_it(day)


def amount(rate_cents: int, minutes: int) -> int:
    """D-10: round(rate x minutes / 60), half up."""
    whole, rest = divmod(rate_cents * minutes, 60)
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


def assert_invalid(response: httpx.Response, field: str, message: str) -> None:
    assert_problem(
        response, 422, "validation_error", detail=message, errors=[{"field": field, "message": message}]
    )


def assert_not_found(response: httpx.Response, message: str = STUDENT_NOT_FOUND) -> None:
    body = assert_problem(response, 404, "not_found", detail=message)
    assert body["title"] == "Non trovato"


async def new_student(
    client: httpx.AsyncClient,
    user: User,
    first_name: str = "Luca",
    rate_cents: int = 2000,
    since: dt.date | None = None,
    **fields: Any,
) -> dict[str, Any]:
    """Student whose first rate started one year ago (unless `since` says otherwise)."""
    effective = since or days(-365)
    return await create_student(
        client, user, first_name, rate_cents, rate_effective_from=str(effective), **fields
    )


async def subject_id(client: httpx.AsyncClient, user: User, name: str) -> str:
    response = await client.get(f"{API}/subjects", headers=user.headers)
    assert response.status_code == 200, response.text
    for item in response.json()["items"]:
        if item["name"] == name:
            return str(item["id"])
    raise AssertionError(f"subject {name!r} not found")


async def get_ledger(client: httpx.AsyncClient, user: User, student_id: str, **params: Any) -> dict[str, Any]:
    response = await client.get(f"{API}/students/{student_id}/ledger", params=params, headers=user.headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    assert set(data) == {"items", "balance"}
    return data


async def student_balance(client: httpx.AsyncClient, user: User, student_id: str) -> dict[str, Any]:
    response = await client.get(f"{API}/students/{student_id}", headers=user.headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()["balance"]
    return data


async def get_activity(
    client: httpx.AsyncClient, user: User, student_id: str, **params: Any
) -> dict[str, Any]:
    response = await client.get(f"{API}/students/{student_id}/activity", params=params, headers=user.headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    assert set(data) == {"items", "next_cursor"}
    for item in data["items"]:
        assert set(item) == ACTIVITY_KEYS
    return data


async def get_dashboard(client: httpx.AsyncClient, user: User, **params: Any) -> dict[str, Any]:
    response = await client.get(f"{API}/dashboard", params=params, headers=user.headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    assert set(data) == DASHBOARD_KEYS
    return data


async def patch(
    client: httpx.AsyncClient, user: User, path: str, body: dict[str, Any], **headers: str
) -> Any:
    response = await client.patch(f"{API}{path}", json=body, headers={**user.headers, **headers})
    assert response.status_code == 200, response.text
    return response.json()


async def delete(client: httpx.AsyncClient, user: User, path: str, **headers: str) -> None:
    response = await client.delete(f"{API}{path}", headers={**user.headers, **headers})
    assert response.status_code == 204, response.text


def compact(entry: dict[str, Any]) -> tuple[Any, ...]:
    """(kind, date, start, debit, credit, settled, running) of a ledger entry."""
    return (
        entry["kind"],
        entry["date"],
        entry["start_time"],
        entry["debit_cents"],
        entry["credit_cents"],
        entry["settled"],
        entry["running_balance_cents"],
    )


def csv_text(response: httpx.Response) -> str:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == CSV_CONTENT_TYPE
    assert response.content.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM for Excel
    return response.content.decode("utf-8")


def disposition(filename: str) -> str:
    return f"attachment; filename=\"{filename}\"; filename*=UTF-8''{filename}"


# ---------------------------------------------------------------------------------------------
# GET /students/{id}/ledger
# ---------------------------------------------------------------------------------------------


async def test_ledger_entries_carry_every_field(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, "Luca", 2000, last_name="Rossi")
    math = await subject_id(client, tutor, "Matematica")
    lesson = await create_lesson(
        client, tutor, student["id"], days(-3), "15:00", "16:30", subject_id=math, topic="Frazioni"
    )
    payment = await create_payment(
        client, tutor, student["id"], 5000, days(-2), "bank_transfer", note="Acconto"
    )
    bare = await create_lesson(
        client, tutor, student["id"], days(-1), "09:15", "10:00", hourly_rate_cents=2500
    )
    cash = await create_payment(client, tutor, student["id"], 700, days(-1), "cash")

    data = await get_ledger(client, tutor, student["id"])
    assert all(set(item) == LEDGER_ENTRY_KEYS for item in data["items"])
    # Default order is newest first (desc), payments after lessons on the same day.
    assert data["items"] == [
        {
            "kind": "payment",
            "id": cash["id"],
            "date": str(days(-1)),
            "start_time": None,
            "end_time": None,
            "duration_minutes": None,
            "hourly_rate_cents": None,
            "subject": None,
            "topic": None,
            "method": "cash",
            "note": None,
            "debit_cents": 0,
            "credit_cents": 700,
            "settled": True,
            "running_balance_cents": -3000 + 5000 - 1875 + 700,
            "calendar": None,
        },
        {
            "kind": "lesson",
            "id": bare["id"],
            "date": str(days(-1)),
            "start_time": "09:15",
            "end_time": "10:00",
            "duration_minutes": 45,
            "hourly_rate_cents": 2500,
            "subject": None,
            "topic": None,
            "method": None,
            "note": None,
            "debit_cents": 1875,
            "credit_cents": 0,
            "settled": True,
            "running_balance_cents": -3000 + 5000 - 1875,
            "calendar": CAL_OFF,
        },
        {
            "kind": "payment",
            "id": payment["id"],
            "date": str(days(-2)),
            "start_time": None,
            "end_time": None,
            "duration_minutes": None,
            "hourly_rate_cents": None,
            "subject": None,
            "topic": None,
            "method": "bank_transfer",
            "note": "Acconto",
            "debit_cents": 0,
            "credit_cents": 5000,
            "settled": True,
            "running_balance_cents": 2000,
            "calendar": None,
        },
        {
            "kind": "lesson",
            "id": lesson["id"],
            "date": str(days(-3)),
            "start_time": "15:00",
            "end_time": "16:30",
            "duration_minutes": 90,
            "hourly_rate_cents": 2000,
            "subject": {"id": math, "name": "Matematica"},
            "topic": "Frazioni",
            "method": None,
            "note": None,
            "debit_cents": 3000,
            "credit_cents": 0,
            "settled": True,
            "running_balance_cents": -3000,
            "calendar": CAL_OFF,
        },
    ]
    assert set(data["balance"]) == BALANCE_KEYS
    assert data["balance"]["balance_cents"] == 825
    assert data["balance"] == await student_balance(client, tutor, student["id"])


async def test_ledger_running_balance_counts_only_settled_entries(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    sid = student["id"]
    await create_lesson(client, tutor, sid, days(-10), "15:00", "16:00")  # -2000
    await create_payment(client, tutor, sid, 5000, days(-8))  # +5000
    await create_lesson(client, tutor, sid, days(3), "15:00", "17:00")  # scheduled 4000
    await create_lesson(client, tutor, sid, days(-5), "15:00", "16:30")  # -3000
    await create_payment(client, tutor, sid, 1000, days(5))  # a future-dated payment still counts
    await create_lesson(client, tutor, sid, days(7), "15:00", "16:00")  # scheduled 2000

    asc = await get_ledger(client, tutor, sid, order="asc")
    assert [compact(e) for e in asc["items"]] == [
        ("lesson", str(days(-10)), "15:00", 2000, 0, True, -2000),
        ("payment", str(days(-8)), None, 0, 5000, True, 3000),
        ("lesson", str(days(-5)), "15:00", 3000, 0, True, 0),
        ("lesson", str(days(3)), "15:00", 4000, 0, False, 0),  # scheduled: balance unchanged
        ("payment", str(days(5)), None, 0, 1000, True, 1000),
        ("lesson", str(days(7)), "15:00", 2000, 0, False, 1000),
    ]
    desc = await get_ledger(client, tutor, sid)
    assert desc["items"] == list(reversed(asc["items"]))
    assert await get_ledger(client, tutor, sid, order="desc") == desc

    balance = await student_balance(client, tutor, sid)
    assert asc["balance"] == desc["balance"] == balance
    assert balance["balance_cents"] == 1000  # = the last running balance
    assert balance["charged_cents"] == 5000
    assert balance["paid_cents"] == 6000
    assert balance["scheduled_cents"] == 6000
    assert balance["projected_balance_cents"] == -5000
    assert balance["status"] == "credit"


async def test_ledger_same_day_ordering(client, make_user) -> None:
    """Same day: lessons by start time, then payments (in the order they were recorded)."""
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=6000)
    sid = student["id"]
    day = days(-4)
    first_payment = await create_payment(client, tutor, sid, 1000, day)
    late = await create_lesson(client, tutor, sid, day, "18:00", "19:00")
    second_payment = await create_payment(client, tutor, sid, 2500, day)
    early = await create_lesson(client, tutor, sid, day, "08:00", "08:30")
    evening = await create_lesson(client, tutor, sid, day, "23:00", "23:59")
    previous = await create_payment(client, tutor, sid, 400, days(-5))

    asc = (await get_ledger(client, tutor, sid, order="asc"))["items"]
    assert [(e["id"], e["running_balance_cents"]) for e in asc] == [
        (previous["id"], 400),
        (early["id"], 400 - 3000),
        (late["id"], 400 - 3000 - 6000),
        (evening["id"], 400 - 3000 - 6000 - 5900),
        (first_payment["id"], 400 - 3000 - 6000 - 5900 + 1000),
        (second_payment["id"], 400 - 3000 - 6000 - 5900 + 1000 + 2500),
    ]
    desc = (await get_ledger(client, tutor, sid))["items"]
    assert [e["id"] for e in desc] == [e["id"] for e in reversed(asc)]
    assert desc[0]["running_balance_cents"] == (await student_balance(client, tutor, sid))["balance_cents"]


async def test_ledger_date_filters_keep_the_balance_of_the_whole_history(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2000)
    sid = student["id"]
    await create_lesson(client, tutor, sid, days(-30))  # -2000
    await create_payment(client, tutor, sid, 3000, days(-20))  # 1000
    await create_lesson(client, tutor, sid, days(-10))  # -1000
    await create_payment(client, tutor, sid, 500, days(-10))  # -500
    await create_lesson(client, tutor, sid, days(-1), "10:00", "12:00")  # -4500
    await create_lesson(client, tutor, sid, days(10))  # scheduled, -4500
    full = await get_ledger(client, tutor, sid)

    def window(start: dt.date | None, end: dt.date | None) -> list[tuple[Any, ...]]:
        return [
            compact(e)
            for e in full["items"]
            if (start is None or e["date"] >= str(start)) and (end is None or e["date"] <= str(end))
        ]

    cases: list[tuple[dt.date | None, dt.date | None, int]] = [
        (days(-20), None, 5),
        (None, days(-10), 4),
        (days(-10), days(-10), 2),  # both bounds are inclusive
        (days(-20), days(-1), 4),
        (days(-9), days(-2), 0),
        (days(11), None, 0),
    ]
    for start, end, count in cases:
        params = {k: str(v) for k, v in (("from", start), ("to", end)) if v is not None}
        filtered = await get_ledger(client, tutor, sid, **params)
        items = [compact(e) for e in filtered["items"]]
        assert items == window(start, end), params
        assert len(items) == count, params
        # The balance block is always the whole-history balance.
        assert filtered["balance"] == full["balance"]

    # Running balances inside a window still include everything before it.
    only_ten = await get_ledger(
        client, tutor, sid, order="asc", **{"from": str(days(-10)), "to": str(days(-10))}
    )
    assert [compact(e) for e in only_ten["items"]] == [
        ("lesson", str(days(-10)), "15:00", 2000, 0, True, -1000),
        ("payment", str(days(-10)), None, 0, 500, True, -500),
    ]


async def test_ledger_of_a_student_without_movements(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, rate_cents=2400)
    data = await get_ledger(client, tutor, student["id"])
    assert data["items"] == []
    assert data["balance"] == {
        "balance_cents": 0,
        "projected_balance_cents": 0,
        "charged_cents": 0,
        "paid_cents": 0,
        "scheduled_cents": 0,
        "done_minutes": 0,
        "scheduled_minutes": 0,
        "current_hourly_rate_cents": 2400,
        "status": "settled",
        "credit_minutes": None,
    }


async def test_ledger_query_validation(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    url = f"{API}/students/{student['id']}/ledger"
    response = await client.get(url, params={"order": "sideways"}, headers=tutor.headers)
    assert_invalid(response, "order", "Valore non ammesso (valori possibili: asc, desc).")
    response = await client.get(url, params={"from": "13/10/2026"}, headers=tutor.headers)
    assert_invalid(response, "from", "Data non valida (formato AAAA-MM-GG).")
    response = await client.get(url, params={"to": "ieri"}, headers=tutor.headers)
    assert_invalid(response, "to", "Data non valida (formato AAAA-MM-GG).")
    response = await client.get(f"{API}/students/{uuid.uuid4()}/ledger", headers=tutor.headers)
    assert_not_found(response)
    response = await client.get(f"{API}/students/not-a-uuid/ledger", headers=tutor.headers)
    assert_invalid(response, "student_id", BAD_ID)


async def test_ledger_moving_a_lesson_moves_its_entry(client, make_user) -> None:
    tutor = await make_user()
    luca = await new_student(client, tutor, "Luca", 2000)
    marco = await new_student(client, tutor, "Marco", 3000)
    lesson = await create_lesson(client, tutor, luca["id"], days(-2))
    await patch(client, tutor, f"/lessons/{lesson['id']}", {"student_id": marco["id"]})
    assert (await get_ledger(client, tutor, luca["id"]))["items"] == []
    moved = (await get_ledger(client, tutor, marco["id"]))["items"]
    assert [compact(e) for e in moved] == [("lesson", str(days(-2)), "15:00", 3000, 0, True, -3000)]
    assert moved[0]["hourly_rate_cents"] == 3000  # it followed the history: re-derived for Marco


async def test_ledger_calendar_state_of_lessons(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    before_link = await create_lesson(client, tutor, student["id"], days(1), "09:00", "10:00")
    async with db.acquire() as conn:
        await conn.execute(
            "insert into app.google_calendar_links (tutor_id, refresh_token_ciphertext, status)"
            " values ($1, 'ciphertext', 'active')",
            tutor.id,
        )
    queued = await create_lesson(client, tutor, student["id"], days(2), "09:00", "10:00")
    failed = await create_lesson(client, tutor, student["id"], days(3), "09:00", "10:00")
    synced = await create_lesson(client, tutor, student["id"], days(4), "09:00", "10:00")
    await create_payment(client, tutor, student["id"], 1000, days(-1))
    async with db.acquire() as conn:
        await conn.execute(
            "update app.calendar_outbox set last_error = 'Google non risponde', attempts = 1"
            " where lesson_id = $1",
            uuid.UUID(failed["id"]),
        )
        await conn.execute(
            "update app.calendar_outbox set processed_at = now() where lesson_id = $1",
            uuid.UUID(synced["id"]),
        )
        await conn.execute(
            "update app.lessons set gcal_event_id = 'evt-1' where id = $1", uuid.UUID(synced["id"])
        )

    items = (await get_ledger(client, tutor, student["id"], order="asc"))["items"]
    assert [(e["kind"], e["id"] if e["kind"] == "lesson" else None, e["calendar"]) for e in items] == [
        ("payment", None, None),
        ("lesson", before_link["id"], CAL_OFF),  # linked, but never queued nor synced
        ("lesson", queued["id"], {"status": "pending", "error": None}),
        ("lesson", failed["id"], {"status": "error", "error": "Google non risponde"}),
        ("lesson", synced["id"], {"status": "synced", "error": None}),
    ]


# ---------------------------------------------------------------------------------------------
# "Settled" in each tutor's own timezone (lessons around midnight)
# ---------------------------------------------------------------------------------------------


def midnight_lessons() -> list[tuple[dt.date, str, str, bool, bool]]:
    """(date, start, end, settled for the Kiritimati tutor, settled for the Pago Pago tutor).

    Kiritimati (UTC+14) is always 25 hours ahead of Pago Pago (UTC-11), so its "today" is one or two
    days after Pago Pago's. Every expectation below holds at any time of day.
    """
    pago, kiri = today(PAGO), today(KIRI)
    return [
        (pago - dt.timedelta(days=1), "23:30", "23:59", True, True),  # yesterday everywhere
        (kiri - dt.timedelta(days=1), "23:30", "23:59", True, False),  # Kiri's yesterday, Pago's day/tomorrow
        (pago + dt.timedelta(days=1), "00:00", "00:30", True, False),  # Pago's tomorrow, ended in Kiri
        (kiri + dt.timedelta(days=1), "00:00", "00:30", False, False),  # tomorrow everywhere
    ]


async def test_ledger_settled_follows_each_tutors_timezone(client, make_user) -> None:
    kiri_tutor = await make_user("Kiri", timezone=KIRI)
    pago_tutor = await make_user("Pago")
    me = await patch(client, pago_tutor, "/me", {"timezone": PAGO})
    assert me["timezone"] == PAGO

    lessons = midnight_lessons()
    for tutor, tz, column in ((kiri_tutor, KIRI, 3), (pago_tutor, PAGO, 4)):
        student = await new_student(client, tutor, rate_cents=2000)
        for day, start, end, *_ in lessons:
            await create_lesson(client, tutor, student["id"], day, start, end)

        expected = []
        running = 0
        for lesson in sorted(lessons, key=lambda x: (x[0], x[1])):
            day, start, end = lesson[0], lesson[1], lesson[2]
            settled: bool = lesson[column]  # type: ignore[assignment]
            minutes = 29 if start == "23:30" else 30
            debit = amount(2000, minutes)
            running -= debit if settled else 0
            expected.append(("lesson", str(day), start, debit, 0, settled, running))

        data = await get_ledger(client, tutor, student["id"], order="asc")
        assert [compact(e) for e in data["items"]] == expected, tutor.email
        done = [e for e in expected if e[5]]
        scheduled = [e for e in expected if not e[5]]
        balance = data["balance"]
        assert balance["balance_cents"] == running == -sum(e[3] for e in done)
        assert balance["charged_cents"] == sum(e[3] for e in done)
        assert balance["scheduled_cents"] == sum(e[3] for e in scheduled)
        assert balance["done_minutes"] == sum(29 if e[2] == "23:30" else 30 for e in done)
        assert balance == await student_balance(client, tutor, student["id"])

        # The CSV says the same thing in words.
        rows = csv_text(await client.get(f"{API}/students/{student['id']}/ledger.csv", headers=tutor.headers))
        states = [line.split(";")[-1] for line in rows.removeprefix(BOM).split("\r\n")[1:-1]]
        assert states == ["Svolta" if e[5] else "Programmata" for e in expected]

        # The dashboard's "today" is the tutor's own date.
        assert (await get_dashboard(client, tutor))["today"] == str(today(tz))

    assert [e[3] for e in lessons].count(True) == 3
    assert [e[4] for e in lessons].count(True) == 1


async def test_changing_the_timezone_moves_lessons_between_scheduled_and_settled(client, make_user) -> None:
    tutor = await make_user("Viaggiatore", timezone=PAGO)
    student = await new_student(client, tutor, rate_cents=6000)
    for day, start, end, *_ in midnight_lessons():
        await create_lesson(client, tutor, student["id"], day, start, end)

    def flags(data: dict[str, Any]) -> list[bool]:
        return [e["settled"] for e in data["items"]]

    in_pago = await get_ledger(client, tutor, student["id"], order="asc")
    expected_pago = [x[4] for x in sorted(midnight_lessons(), key=lambda x: (x[0], x[1]))]
    expected_kiri = [x[3] for x in sorted(midnight_lessons(), key=lambda x: (x[0], x[1]))]
    assert flags(in_pago) == expected_pago
    assert in_pago["balance"]["balance_cents"] == -2900  # only yesterday's 29 minutes

    await patch(client, tutor, "/me", {"timezone": KIRI})
    in_kiri = await get_ledger(client, tutor, student["id"], order="asc")
    assert flags(in_kiri) == expected_kiri
    assert in_kiri["balance"]["balance_cents"] == -2900 - 2900 - 3000
    assert in_kiri["items"][-1]["running_balance_cents"] == -2900 - 2900 - 3000
    assert in_kiri["balance"]["scheduled_cents"] == 3000


# ---------------------------------------------------------------------------------------------
# CSV exports (Italian Excel: BOM, ';', comma decimals, dd/mm/yyyy, CRLF)
# ---------------------------------------------------------------------------------------------


async def test_student_ledger_csv_exact_content(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, "Niccolò", 2000, last_name="D'Amico")
    sid = student["id"]
    math = await subject_id(client, tutor, "Matematica")
    physics = await subject_id(client, tutor, "Fisica")
    await create_lesson(
        client, tutor, sid, days(-20), "15:00", "16:30", subject_id=math, topic='Frazioni; "equivalenti"'
    )
    await create_payment(client, tutor, sid, 5000, days(-20), "cash", note="Acconto ottobre")
    await create_lesson(
        client, tutor, sid, days(-10), "16:00", "17:30", subject_id=physics, hourly_rate_cents=100_000
    )
    await create_payment(client, tutor, sid, 1000, days(-1), "bank_transfer")
    await create_payment(client, tutor, sid, 1, days(-1), "other", note="=1+1")
    await create_lesson(client, tutor, sid, days(5), "09:00", "10:00")

    response = await client.get(f"{API}/students/{sid}/ledger.csv", headers=tutor.headers)
    text = csv_text(response)
    assert response.headers["content-disposition"] == disposition("libro-mastro-niccolo-d-amico.csv")
    expected = [
        CSV_HEADER,
        f'{date_it(days(-20))};Lezione;"Lezione · Matematica · Frazioni; ""equivalenti""";15:00;16:30;90;'
        "20,00;30,00;;-30,00;Svolta",
        f"{date_it(days(-20))};Pagamento;Pagamento · Contanti · Acconto ottobre;;;;;;50,00;20,00;Ricevuto",
        f"{date_it(days(-10))};Lezione;Lezione · Fisica;16:00;17:30;90;1000,00;1500,00;;-1480,00;Svolta",
        f"{date_it(days(-1))};Pagamento;Pagamento · Bonifico;;;;;;10,00;-1470,00;Ricevuto",
        f"{date_it(days(-1))};Pagamento;Pagamento · Altro · =1+1;;;;;;0,01;-1469,99;Ricevuto",
        f"{date_it(days(5))};Lezione;Lezione;09:00;10:00;60;20,00;20,00;;-1469,99;Programmata",
    ]
    assert text == BOM + "\r\n".join(expected) + "\r\n"

    # Same numbers as the JSON ledger.
    ledger = await get_ledger(client, tutor, sid, order="asc")
    assert [decimal_it(e["running_balance_cents"]) for e in ledger["items"]] == [
        line.split(";")[-2] for line in expected[1:]
    ]


@pytest.mark.parametrize(
    ("first_name", "last_name", "slug"),
    [
        ("Élodie", "Müller-Lüdenscheidt", "elodie-muller-ludenscheidt"),
        ("Zoë", "O'Neill", "zoe-o-neill"),
        ("  Anna   Maria ", None, "anna-maria"),
        ("李", None, "studente"),
        ("=HYPERLINK", "(x)", "hyperlink-x"),
    ],
)
async def test_student_ledger_csv_filename_slug(client, make_user, first_name, last_name, slug) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, first_name, last_name=last_name)
    response = await client.get(f"{API}/students/{student['id']}/ledger.csv", headers=tutor.headers)
    assert csv_text(response) == BOM + CSV_HEADER + "\r\n"  # no movements: just the header
    assert response.headers["content-disposition"] == disposition(f"libro-mastro-{slug}.csv")


async def test_full_export_csv(client, make_user) -> None:
    tutor = await make_user("Kiri", timezone=KIRI)
    other = await make_user("Altro")
    zara = await new_student(client, tutor, "zara", 2000, since=days(-365, KIRI))
    anna = await new_student(client, tutor, "Anna", 3000, last_name="Bianchi", since=days(-365, KIRI))
    sneaky = await new_student(client, tutor, "=cmd|' /C calc'!A0", 1000, since=days(-365, KIRI))
    archived = await new_student(client, tutor, "Bruno", 2000, since=days(-365, KIRI))
    await new_student(client, tutor, "Carla", 2000, since=days(-365, KIRI))  # no movements: no rows
    foreign = await new_student(client, other, "Anna", 9900)
    await create_lesson(client, other, foreign["id"], days(-1))
    await create_payment(client, other, foreign["id"], 9900, days(-1))

    d1, d2 = days(-7, KIRI), days(-3, KIRI)
    await create_payment(client, tutor, zara["id"], 4000, d2)
    await create_lesson(client, tutor, zara["id"], d1, "10:00", "11:00")
    await create_lesson(client, tutor, anna["id"], d2, "18:00", "19:00")
    await create_payment(client, tutor, anna["id"], 1500, d1, "bank_transfer", note="metà")
    await create_lesson(client, tutor, sneaky["id"], d1, "10:00", "10:30")
    await create_payment(client, tutor, archived["id"], 2000, d2, "other")
    archive = await client.post(f"{API}/students/{archived['id']}/archive", headers=tutor.headers)
    assert archive.status_code == 200, archive.text

    response = await client.get(f"{API}/export/ledger.csv", headers=tutor.headers)
    text = csv_text(response)
    filename = f"ripetiflow-libro-mastro-{today(KIRI).isoformat()}.csv"  # the tutor's own date
    assert response.headers["content-disposition"] == disposition(filename)
    expected = [
        "Studente;" + CSV_HEADER,
        # Students sorted by name, case-insensitively; a formula-like name is neutralised.
        f"'=cmd|' /C calc'!A0;{date_it(d1)};Lezione;Lezione;10:00;10:30;30;10,00;5,00;;-5,00;Svolta",
        f"Anna Bianchi;{date_it(d1)};Pagamento;Pagamento · Bonifico · metà;;;;;;15,00;15,00;Ricevuto",
        f"Anna Bianchi;{date_it(d2)};Lezione;Lezione;18:00;19:00;60;30,00;30,00;;-15,00;Svolta",
        f"Bruno;{date_it(d2)};Pagamento;Pagamento · Altro;;;;;;20,00;20,00;Ricevuto",
        f"zara;{date_it(d1)};Lezione;Lezione;10:00;11:00;60;20,00;20,00;;-20,00;Svolta",
        f"zara;{date_it(d2)};Pagamento;Pagamento · Contanti;;;;;;40,00;20,00;Ricevuto",
    ]
    assert text == BOM + "\r\n".join(expected) + "\r\n"

    # The other tutor only exports their own data.
    theirs = csv_text(await client.get(f"{API}/export/ledger.csv", headers=other.headers))
    lines = theirs.removeprefix(BOM).split("\r\n")
    assert lines[0] == "Studente;" + CSV_HEADER
    assert [line.split(";")[0] for line in lines[1:-1]] == ["Anna", "Anna"]
    assert lines[-1] == ""


async def test_full_export_of_a_new_tutor_is_just_the_header(client, make_user) -> None:
    tutor = await make_user()
    response = await client.get(f"{API}/export/ledger.csv", headers=tutor.headers)
    assert csv_text(response) == BOM + "Studente;" + CSV_HEADER + "\r\n"
    assert response.headers["content-disposition"] == disposition(
        f"ripetiflow-libro-mastro-{today().isoformat()}.csv"
    )


async def test_csv_numbers_cents_zero_and_large_amounts(client, make_user) -> None:
    """Sub-euro and negative cents, an exact zero balance, a free lesson, no thousands separator."""
    tutor = await make_user()
    student = await new_student(client, tutor, "Ugo", 100)  # 1,00 €/h
    sid = student["id"]
    await create_lesson(client, tutor, sid, days(-3), "10:00", "10:03")  # 3 min at 1 €/h = 0,05 €
    await create_payment(client, tutor, sid, 5, days(-2))
    await create_lesson(client, tutor, sid, days(-1), "10:00", "10:01", hourly_rate_cents=0)  # free
    await create_payment(client, tutor, sid, 9_876_543, days(-1), "bank_transfer")

    text = csv_text(await client.get(f"{API}/students/{sid}/ledger.csv", headers=tutor.headers))
    expected = [
        CSV_HEADER,
        f"{date_it(days(-3))};Lezione;Lezione;10:00;10:03;3;1,00;0,05;;-0,05;Svolta",
        f"{date_it(days(-2))};Pagamento;Pagamento · Contanti;;;;;;0,05;0,00;Ricevuto",
        # A zero amount leaves "Dare" empty, but a zero rate is still written.
        f"{date_it(days(-1))};Lezione;Lezione;10:00;10:01;1;0,00;;;0,00;Svolta",
        f"{date_it(days(-1))};Pagamento;Pagamento · Bonifico;;;;;;98765,43;98765,43;Ricevuto",
    ]
    assert text == BOM + "\r\n".join(expected) + "\r\n"
    assert decimal_it(-5) == "-0,05"  # the oracles themselves
    assert euro(9_876_543) == "98.765,43 €"

    full = csv_text(await client.get(f"{API}/export/ledger.csv", headers=tutor.headers))
    assert (
        full
        == BOM + "\r\n".join(["Studente;" + CSV_HEADER, *(f"Ugo;{line}" for line in expected[1:])]) + "\r\n"
    )


# ---------------------------------------------------------------------------------------------
# GET /dashboard
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "message"),
    [
        ("0", "Il valore minimo è 1."),
        ("-3", "Il valore minimo è 1."),
        ("32", "Il valore massimo è 31."),
        ("abc", "Deve essere un numero intero."),
        ("2.5", "Deve essere un numero intero."),
    ],
)
async def test_dashboard_days_bounds(client, make_user, value, message) -> None:
    tutor = await make_user()
    response = await client.get(f"{API}/dashboard", params={"days": value}, headers=tutor.headers)
    assert_invalid(response, "days", message)


async def test_dashboard_of_a_new_tutor(client, make_user) -> None:
    tutor = await make_user()
    for params in ({}, {"days": 1}, {"days": 31}):
        data = await get_dashboard(client, tutor, **params)
        t = today()
        assert data == {
            "today": str(t),
            "upcoming": [],
            "owing": [],
            "in_credit": [],
            "totals": {"owed_to_you_cents": 0, "credit_held_cents": 0},
            "month": {
                "label": f"{MONTHS_IT[t.month - 1]} {t.year}",
                "lessons": 0,
                "minutes": 0,
                "earned_cents": 0,
                "collected_cents": 0,
            },
            "calendar": {"connected": False, "pending": 0, "errors": 0},
        }


async def test_dashboard_upcoming_window_and_order(client, make_user) -> None:
    tz = midday_zone()
    tutor = await make_user("Mezzogiorno", timezone=tz)
    other = await make_user("Altro", timezone=tz)
    t = today(tz)

    def on(n: int) -> dt.date:
        return t + dt.timedelta(days=n)

    since = on(-365)
    anna = await new_student(client, tutor, "Anna", since=since)
    bruno = await new_student(client, tutor, "Bruno", since=since)
    carla = await new_student(client, tutor, "Carla", since=since)
    stranger = await new_student(client, other, "Anna", since=since)

    await create_lesson(client, tutor, anna["id"], on(-1), "10:00", "11:00")  # past
    await create_lesson(client, tutor, anna["id"], t, "00:00", "01:00")  # ended this morning
    running = await create_lesson(client, tutor, bruno["id"], t, "06:00", "18:00")  # in progress
    tonight = await create_lesson(client, tutor, carla["id"], t, "23:00", "23:59")
    b_tomorrow = await create_lesson(client, tutor, bruno["id"], on(1), "15:00", "16:00")
    a_tomorrow = await create_lesson(client, tutor, anna["id"], on(1), "15:00", "16:00")  # same slot
    c_tomorrow = await create_lesson(client, tutor, carla["id"], on(1), "09:00", "10:00")
    in_three = await create_lesson(client, tutor, anna["id"], on(3), "10:00", "11:00")
    in_seven = await create_lesson(client, tutor, bruno["id"], on(7), "20:00", "21:00")
    in_eight = await create_lesson(client, tutor, carla["id"], on(8), "08:00", "09:00")
    in_31 = await create_lesson(client, tutor, anna["id"], on(31), "08:00", "09:00")
    await create_lesson(client, tutor, anna["id"], on(32), "08:00", "09:00")
    await create_lesson(client, other, stranger["id"], on(1), "12:00", "13:00")

    first_days = [running, tonight, c_tomorrow, a_tomorrow, b_tomorrow]
    windows = {
        1: first_days,
        2: first_days,
        3: [*first_days, in_three],
        7: [*first_days, in_three, in_seven],
        8: [*first_days, in_three, in_seven, in_eight],
        31: [*first_days, in_three, in_seven, in_eight, in_31],
    }
    for n, expected in windows.items():
        data = await get_dashboard(client, tutor, days=n)
        assert data["today"] == str(t)
        assert [lesson["id"] for lesson in data["upcoming"]] == [e["id"] for e in expected], n
    default = await get_dashboard(client, tutor)
    assert [lesson["id"] for lesson in default["upcoming"]] == [e["id"] for e in windows[7]]

    # Upcoming items are full lessons, the same as GET /lessons/{id}.
    for item in default["upcoming"]:
        response = await client.get(f"{API}/lessons/{item['id']}", headers=tutor.headers)
        assert item == response.json()
    assert [item["settled"] for item in default["upcoming"]] == [False] * 7
    assert default["upcoming"][0]["student"] == {"id": bruno["id"], "display_name": "Bruno"}


async def test_dashboard_owing_in_credit_and_totals(client, make_user) -> None:
    tutor = await make_user()
    other = await make_user("Altro")

    async def student_with(name: str, lessons_cents: list[int], paid: int, **fields: Any) -> dict[str, Any]:
        student = await new_student(client, tutor, name, 6000, **fields)
        for i, cents in enumerate(lessons_cents):
            minutes = cents // 100  # 60 €/h: one minute per euro
            end = (dt.datetime(2000, 1, 1, 8) + dt.timedelta(minutes=minutes)).strftime("%H:%M")
            await create_lesson(client, tutor, student["id"], days(-10 - i), "08:00", end)
        if paid:
            await create_payment(client, tutor, student["id"], paid, days(-2))
        return student

    bruno = await student_with("Bruno", [3000, 3000], 0)  # -60,00
    anna = await student_with("Anna", [2000], 0)  # -20,00
    aldo = await student_with("Aldo", [3000], 1000)  # -20,00 (tie with Anna: by name)
    elena = await student_with("Elena", [1000], 0)  # -10,00, archived below
    carla = await student_with("Carla", [], 5000)  # +50,00
    franco = await student_with("Franco", [2000], 3000)  # +10,00
    await student_with("Dario", [2000], 2000)  # settled
    gino = await new_student(client, tutor, "Gino", 6000)
    await create_lesson(client, tutor, gino["id"], days(5))  # only scheduled: settled
    foreign = await new_student(client, other, "Zeno", 6000)
    await create_lesson(client, other, foreign["id"], days(-3))
    response = await client.post(f"{API}/students/{elena['id']}/archive", headers=tutor.headers)
    assert response.status_code == 200, response.text

    data = await get_dashboard(client, tutor)
    assert [s["display_name"] for s in data["owing"]] == ["Bruno", "Aldo", "Anna", "Elena"]
    assert [s["balance"]["balance_cents"] for s in data["owing"]] == [-6000, -2000, -2000, -1000]
    assert [s["display_name"] for s in data["in_credit"]] == ["Carla", "Franco"]
    assert [s["balance"]["balance_cents"] for s in data["in_credit"]] == [5000, 1000]
    assert data["totals"] == {"owed_to_you_cents": 11000, "credit_held_cents": 6000}

    # Items are the same StudentSummary the students list returns (archived ones included).
    active = (await client.get(f"{API}/students", headers=tutor.headers)).json()["items"]
    archived = (
        await client.get(f"{API}/students", params={"archived": "true"}, headers=tutor.headers)
    ).json()
    summaries = {s["id"]: s for s in [*active, *archived["items"]]}
    for item in [*data["owing"], *data["in_credit"]]:
        assert item == summaries[item["id"]]
    assert data["owing"][3]["archived"] is True
    assert {s["id"] for s in data["owing"]} == {bruno["id"], anna["id"], aldo["id"], elena["id"]}
    assert {s["id"] for s in data["in_credit"]} == {carla["id"], franco["id"]}
    assert data["in_credit"][0]["balance"]["credit_minutes"] == 50  # 50 € at 60 €/h

    theirs = await get_dashboard(client, other)
    assert [s["display_name"] for s in theirs["owing"]] == ["Zeno"]
    assert theirs["totals"] == {"owed_to_you_cents": 6000, "credit_held_cents": 0}


async def test_dashboard_month_block(client, make_user) -> None:
    tz = midday_zone()
    tutor = await make_user("Mese", timezone=tz)
    other = await make_user("Altro", timezone=tz)
    t = today(tz)
    month_start = t.replace(day=1)
    next_month = (month_start + dt.timedelta(days=32)).replace(day=1)
    last_day = next_month - dt.timedelta(days=1)
    previous = month_start - dt.timedelta(days=1)
    since = previous - dt.timedelta(days=365)

    student = await new_student(client, tutor, "Anna", 2000, since=since)
    await create_lesson(client, tutor, student["id"], month_start, "00:00", "01:00")  # 60 min, 20,00
    await create_lesson(client, tutor, student["id"], t, "01:00", "02:30")  # 90 min, 30,00
    await create_lesson(  # 45 min at 33,33 €/h = 24,9975 -> 25,00
        client, tutor, student["id"], month_start, "02:00", "02:45", hourly_rate_cents=3333
    )
    await create_lesson(client, tutor, student["id"], t, "06:00", "18:00")  # in progress: not yet
    await create_lesson(client, tutor, student["id"], t, "23:00", "23:59")  # tonight: not yet
    await create_lesson(client, tutor, student["id"], previous, "10:00", "11:00")  # last month
    await create_lesson(client, tutor, student["id"], next_month, "10:00", "11:00")  # next month
    await create_payment(client, tutor, student["id"], 1000, month_start)
    await create_payment(client, tutor, student["id"], 2000, t)
    await create_payment(client, tutor, student["id"], 4000, last_day)  # dated later this month
    await create_payment(client, tutor, student["id"], 8000, previous)
    await create_payment(client, tutor, student["id"], 16000, next_month)
    stranger = await new_student(client, other, "Anna", 2000, since=since)
    await create_lesson(client, other, stranger["id"], month_start, "00:00", "01:00")
    await create_payment(client, other, stranger["id"], 32000, t)

    data = await get_dashboard(client, tutor)
    assert data["today"] == str(t)
    assert data["month"] == {
        "label": f"{MONTHS_IT[t.month - 1]} {t.year}",
        "lessons": 3,
        "minutes": 60 + 90 + 45,
        "earned_cents": 2000 + 3000 + amount(3333, 45),
        "collected_cents": 1000 + 2000 + 4000,
    }
    assert amount(3333, 45) == 2500


async def test_dashboard_today_and_month_label_follow_the_tutors_timezone(client, make_user) -> None:
    for tz in (KIRI, PAGO, "Europe/Rome"):
        tutor = await make_user("Fuso", timezone=tz)
        t = today(tz)
        data = await get_dashboard(client, tutor)
        assert data["today"] == str(t), tz
        assert data["month"]["label"] == f"{MONTHS_IT[t.month - 1]} {t.year}", tz
    assert MONTHS_IT[9] == "ottobre"  # the docs/05 example: "ottobre 2026"


async def test_dashboard_upcoming_and_month_follow_each_tutors_timezone(client, make_user) -> None:
    """Lessons around midnight: "still to come" and "done this month" use the tutor's own clock."""
    lessons = sorted(midnight_lessons(), key=lambda x: (x[0], x[1]))
    for tz, column in ((KIRI, 3), (PAGO, 4)):
        tutor = await make_user("Fuso", timezone=tz)
        student = await new_student(client, tutor, rate_cents=6000)
        created = []
        for lesson in lessons:
            day, start, end = lesson[0], lesson[1], lesson[2]
            created.append((lesson, await create_lesson(client, tutor, student["id"], day, start, end)))
        t = today(tz)

        for n in (1, 2, 31):
            data = await get_dashboard(client, tutor, days=n)
            assert data["today"] == str(t)
            expected = [
                item["id"]
                for lesson, item in created
                if not lesson[column] and lesson[0] <= t + dt.timedelta(days=n)
            ]
            assert [item["id"] for item in data["upcoming"]] == expected, (tz, n)
            assert all(item["settled"] is False for item in data["upcoming"])

        done = [
            lesson
            for lesson, _ in created
            if lesson[column] and (lesson[0].year, lesson[0].month) == (t.year, t.month)
        ]
        minutes = [29 if lesson[1] == "23:30" else 30 for lesson in done]
        assert data["month"] == {
            "label": f"{MONTHS_IT[t.month - 1]} {t.year}",
            "lessons": len(done),
            "minutes": sum(minutes),
            "earned_cents": sum(amount(6000, m) for m in minutes),
            "collected_cents": 0,
        }, tz


async def test_dashboard_calendar_block(client, make_user, db) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    await create_lesson(client, tutor, student["id"], days(1))  # before the link: never queued
    assert (await get_dashboard(client, tutor))["calendar"] == {"connected": False, "pending": 0, "errors": 0}

    async with db.acquire() as conn:
        await conn.execute(
            "insert into app.google_calendar_links (tutor_id, refresh_token_ciphertext, status)"
            " values ($1, 'ciphertext', 'active')",
            tutor.id,
        )
    first = await create_lesson(client, tutor, student["id"], days(2))
    second = await create_lesson(client, tutor, student["id"], days(3))
    third = await create_lesson(client, tutor, student["id"], days(4))
    await patch(client, tutor, f"/lessons/{first['id']}", {"end_time": "17:00"})  # second outbox row
    async with db.acquire() as conn:
        assert (
            await conn.fetchval("select count(*) from app.calendar_outbox where tutor_id = $1", tutor.id) == 4
        )
        await conn.execute(
            "update app.calendar_outbox set last_error = 'quota' where lesson_id = $1",
            uuid.UUID(second["id"]),
        )
    # Lessons are counted once, however many changes are queued for them.
    assert (await get_dashboard(client, tutor))["calendar"] == {"connected": True, "pending": 2, "errors": 1}

    async with db.acquire() as conn:
        await conn.execute(
            "update app.calendar_outbox set processed_at = now() where lesson_id = any($1::uuid[])",
            [uuid.UUID(first["id"]), uuid.UUID(second["id"])],
        )
    assert (await get_dashboard(client, tutor))["calendar"] == {"connected": True, "pending": 1, "errors": 0}
    response = await client.get(f"{API}/lessons/{third['id']}", headers=tutor.headers)
    assert response.json()["calendar"] == {"status": "pending", "error": None}  # the one still waiting

    # A revoked link is "not connected", whatever is left in the queue.
    async with db.acquire() as conn:
        await conn.execute(
            "update app.google_calendar_links set status = 'revoked' where tutor_id = $1", tutor.id
        )
    assert (await get_dashboard(client, tutor))["calendar"]["connected"] is False


# ---------------------------------------------------------------------------------------------
# GET /students/{id}/activity
# ---------------------------------------------------------------------------------------------

ASSISTANT = {"X-RipetiFlow-Source": "assistant"}


def brief(item: dict[str, Any]) -> tuple[str, str, str, str]:
    """(entity, action, source, summary) of an activity item."""
    return (item["entity"], item["action"], item["source"], item["summary"])


def change(field: str, before: str | None, after: str | None) -> dict[str, str | None]:
    return {"field": field, "before": before, "after": after}


def assert_newest_first(items: list[dict[str, Any]]) -> None:
    ids = [int(item["id"]) for item in items]  # opaque strings, but strictly decreasing
    assert ids == sorted(ids, reverse=True)
    assert len(set(ids)) == len(ids)
    stamps = [dt.datetime.fromisoformat(item["occurred_at"]) for item in items]
    assert all(stamp.tzinfo is not None for stamp in stamps)  # ISO 8601 with offset
    assert stamps == sorted(stamps, reverse=True)


async def test_activity_of_student_profile_and_rates(client, make_user, db) -> None:
    tutor = await make_user()
    math = await subject_id(client, tutor, "Matematica")
    since, d10, d9 = days(-30), days(-10), days(-9)
    student = await new_student(client, tutor, "Luca", 2000, since=since, last_name="Rossi")
    sid = student["id"]
    first_rate = student["rates"][0]["id"]
    profile = {
        "school": "Liceo Galilei",
        "grade": "3B",
        "phone": "333 1234567",
        "notes": "Segue bene",
        "default_subject_id": math,
    }
    await patch(client, tutor, f"/students/{sid}", profile)
    await patch(
        client, tutor, f"/students/{sid}", {"first_name": "Lucia", "school": None, "notes": "Progressi"}
    )
    await patch(client, tutor, f"/students/{sid}", {"grade": "3B"})  # nothing changes: nothing logged
    for action in ("archive", "unarchive"):
        response = await client.post(f"{API}/students/{sid}/{action}", headers=tutor.headers)
        assert response.status_code == 200, response.text
    response = await client.post(
        f"{API}/students/{sid}/rates",
        json={"hourly_rate_cents": 2550, "effective_from": str(d10), "reprice_existing": False},
        headers={**tutor.headers, **ASSISTANT},
    )
    assert response.status_code == 201, response.text
    rate_id = response.json()["rate"]["id"]
    async with db.acquire() as conn:  # no endpoint edits a rate in place: a correction made in the DB
        await conn.execute(
            "update app.student_rates set hourly_rate_cents = 2600, effective_from = $2 where id = $1",
            uuid.UUID(rate_id),
            d9,
        )
    await delete(client, tutor, f"/students/{sid}/rates/{rate_id}")

    data = await get_activity(client, tutor, sid)
    assert data["next_cursor"] is None
    items = data["items"]
    assert_newest_first(items)
    assert [brief(item) for item in items] == [
        ("student_rate", "delete", "app", f"Tariffa di 26,00 €/h dal {date_it(d9)} eliminata"),
        (
            "student_rate",
            "update",
            "app",
            f"Tariffa modificata: tariffa 25,50 €/h → 26,00 €/h, decorrenza {short_day(d10)} → {short_day(d9)}",
        ),
        ("student_rate", "insert", "assistant", f"Nuova tariffa: 25,50 €/h dal {date_it(d10)}"),
        ("student", "update", "app", "Studente ripristinato"),
        ("student", "update", "app", "Studente archiviato"),
        (
            "student",
            "update",
            "app",
            "Scheda di Lucia Rossi modificata: nome «Luca» → «Lucia», scuola «Liceo Galilei» → —, note modificate",
        ),
        (
            "student",
            "update",
            "app",
            "Scheda di Luca Rossi modificata: scuola — → «Liceo Galilei», classe — → «3B», "
            "telefono — → 333 1234567, note modificate, materia predefinita — → Matematica",
        ),
        ("student_rate", "insert", "app", f"Nuova tariffa: 20,00 €/h dal {date_it(since)}"),
        ("student", "insert", "app", "Studente aggiunto: Luca Rossi"),
    ]
    assert [item["changes"] for item in items] == [
        [],
        [
            change("hourly_rate_cents", "25,50 €/h", "26,00 €/h"),
            change("effective_from", short_day(d10), short_day(d9)),
        ],
        [],
        [change("archived_at", "sì", None)],
        [change("archived_at", None, "sì")],
        [
            change("first_name", "Luca", "Lucia"),
            change("school", "Liceo Galilei", None),
            change("notes", "Segue bene", "Progressi"),  # the summary hides private notes, changes do not
        ],
        [
            change("school", None, "Liceo Galilei"),
            change("grade", None, "3B"),
            change("phone", None, "333 1234567"),
            change("notes", None, "Segue bene"),
            change("default_subject_id", None, "Matematica"),
        ],
        [],
        [],
    ]
    assert [item["entity_id"] for item in items] == [rate_id] * 3 + [sid] * 4 + [first_rate, sid]


async def test_activity_of_lessons_and_payments(client, make_user) -> None:
    tutor = await make_user()
    math = await subject_id(client, tutor, "Matematica")
    physics = await subject_id(client, tutor, "Fisica")
    student = await new_student(client, tutor, "Luca", 2000)
    sid = student["id"]
    d3, d2 = days(-3), days(-2)
    a3, a2 = short_day(d3), short_day(d2)

    response = await client.post(
        f"{API}/lessons",
        json={
            "student_id": sid,
            "date": str(d3),
            "start_time": "15:00",
            "end_time": "16:00",
            "subject_id": math,
            "topic": "Frazioni",
        },
        headers={**tutor.headers, **ASSISTANT},  # a Matita draft confirmed by the tutor
    )
    assert response.status_code == 201, response.text
    lesson = response.json()
    url = f"/lessons/{lesson['id']}"
    edit = {"end_time": "16:30", "topic": "Equazioni", "subject_id": physics, "notes": "Compiti pag. 12"}
    await patch(client, tutor, url, edit)
    await patch(client, tutor, url, {"date": str(d2), "hourly_rate_cents": 3000})
    await patch(client, tutor, url, {"topic": "Equazioni"})  # same value: nothing logged
    await delete(client, tutor, url, **ASSISTANT)

    payment = await create_payment(client, tutor, sid, 5000, d3)
    purl = f"/payments/{payment['id']}"
    await patch(client, tutor, purl, {"amount_cents": 3000, "method": "bank_transfer", "note": "Acconto"})
    await patch(client, tutor, purl, {"paid_on": str(d2), "note": None}, **ASSISTANT)
    await delete(client, tutor, purl)

    items = (await get_activity(client, tutor, sid))["items"]
    assert_newest_first(items)
    assert [brief(item) for item in items] == [
        ("payment", "delete", "app", f"Pagamento di 30,00 € del {a2} eliminato"),
        (
            "payment",
            "update",
            "assistant",
            f"Pagamento del {a2} modificato: data {a3} → {a2}, nota «Acconto» → —",
        ),
        (
            "payment",
            "update",
            "app",
            f"Pagamento del {a3} modificato: importo 50,00 € → 30,00 €, metodo Contanti → Bonifico, "
            "nota — → «Acconto»",
        ),
        ("payment", "insert", "app", f"Pagamento di 50,00 € del {a3} registrato (Contanti)"),
        ("lesson", "delete", "assistant", f"Lezione del {a2} eliminata (15:00–16:30, 45,00 €)"),
        (
            "lesson",
            "update",
            "app",
            f"Lezione del {a2} modificata: data {a3} → {a2}, tariffa 20,00 €/h → 30,00 €/h, "
            "importo 30,00 € → 45,00 €",
        ),
        (
            "lesson",
            "update",
            "app",
            f"Lezione del {a3} modificata: materia Matematica → Fisica, fine 16:00 → 16:30, "
            "importo 20,00 € → 30,00 €, argomento «Frazioni» → «Equazioni», note modificate",
        ),
        ("lesson", "insert", "assistant", f"Lezione del {a3} registrata (15:00–16:00, 20,00 €)"),
        ("student_rate", "insert", "app", f"Nuova tariffa: 20,00 €/h dal {date_it(days(-365))}"),
        ("student", "insert", "app", "Studente aggiunto: Luca"),
    ]
    assert [item["changes"] for item in items[:8]] == [
        [],
        [change("paid_on", a3, a2), change("note", "Acconto", None)],
        [
            change("amount_cents", "50,00 €", "30,00 €"),
            change("method", "Contanti", "Bonifico"),
            change("note", None, "Acconto"),
        ],
        [],
        [],
        [
            change("lesson_date", a3, a2),
            change("hourly_rate_cents", "20,00 €/h", "30,00 €/h"),
            change("amount_cents", "30,00 €", "45,00 €"),
        ],
        [
            change("subject_id", "Matematica", "Fisica"),
            change("end_time", "16:00", "16:30"),
            change("amount_cents", "20,00 €", "30,00 €"),
            change("topic", "Frazioni", "Equazioni"),
            change("notes", None, "Compiti pag. 12"),
        ],
        [],
    ]
    assert [item["entity_id"] for item in items[:8]] == [payment["id"]] * 4 + [lesson["id"]] * 4
    # Deleted rows leave the ledger, never the history (D-18).
    assert (await get_ledger(client, tutor, sid))["items"] == []


async def test_activity_long_text_is_shortened(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor, "Luca")
    lesson = await create_lesson(client, tutor, student["id"], days(-1), topic="a" * 200)
    await patch(client, tutor, f"/lessons/{lesson['id']}", {"topic": "b" * 120})
    latest = (await get_activity(client, tutor, student["id"], limit=1))["items"][0]
    assert latest["changes"] == [change("topic", "a" * 119 + "…", "b" * 120)]
    assert latest["summary"].endswith(f"argomento «{'a' * 119}…» → «{'b' * 120}»")


async def test_activity_moved_lesson_and_payment_show_in_both_histories(client, make_user) -> None:
    """D-18: nothing disappears from the record of the student a lesson or payment left."""
    tutor = await make_user()
    luca = await new_student(client, tutor, "Luca", 2000, last_name="Rossi")
    marco = await new_student(client, tutor, "Marco", 3000, last_name="Bianchi")
    day = short_day(days(-2))
    lesson = await create_lesson(client, tutor, luca["id"], days(-2))
    payment = await create_payment(client, tutor, luca["id"], 1000, days(-2))
    await patch(client, tutor, f"/lessons/{lesson['id']}", {"student_id": marco["id"]})
    await patch(client, tutor, f"/payments/{payment['id']}", {"student_id": marco["id"]})
    await patch(client, tutor, f"/lessons/{lesson['id']}", {"topic": "Ripasso"})  # now Marco's only

    moved_payment = (
        "payment",
        "update",
        "app",
        f"Pagamento del {day} modificato: studente Luca Rossi → Marco Bianchi",
    )
    moved_lesson = (
        "lesson",
        "update",
        "app",
        f"Lezione del {day} modificata: studente Luca Rossi → Marco Bianchi, "
        "tariffa 20,00 €/h → 30,00 €/h, importo 20,00 € → 30,00 €",
    )
    luca_items = (await get_activity(client, tutor, luca["id"]))["items"]
    marco_items = (await get_activity(client, tutor, marco["id"]))["items"]
    assert [brief(item) for item in luca_items] == [
        moved_payment,
        moved_lesson,
        ("payment", "insert", "app", f"Pagamento di 10,00 € del {day} registrato (Contanti)"),
        ("lesson", "insert", "app", f"Lezione del {day} registrata (15:00–16:00, 20,00 €)"),
        ("student_rate", "insert", "app", f"Nuova tariffa: 20,00 €/h dal {date_it(days(-365))}"),
        ("student", "insert", "app", "Studente aggiunto: Luca Rossi"),
    ]
    assert [brief(item) for item in marco_items] == [
        ("lesson", "update", "app", f"Lezione del {day} modificata: argomento — → «Ripasso»"),
        moved_payment,
        moved_lesson,
        ("student_rate", "insert", "app", f"Nuova tariffa: 30,00 €/h dal {date_it(days(-365))}"),
        ("student", "insert", "app", "Studente aggiunto: Marco Bianchi"),
    ]
    # The very same log entries, not copies.
    assert luca_items[:2] == marco_items[1:3]
    assert luca_items[1]["changes"] == [
        change("student_id", "Luca Rossi", "Marco Bianchi"),
        change("hourly_rate_cents", "20,00 €/h", "30,00 €/h"),
        change("amount_cents", "20,00 €", "30,00 €"),
    ]
    # Paging Luca's history uses the same cursor rules across the two kinds of rows.
    first = await get_activity(client, tutor, luca["id"], limit=1)
    assert first["items"] == luca_items[:1]
    second = await get_activity(client, tutor, luca["id"], limit=1, before=first["next_cursor"])
    assert second["items"] == luca_items[1:2]


async def test_activity_cursor_pagination(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    sid = student["id"]
    for cents in (100, 200, 300, 400, 500):
        await create_payment(client, tutor, sid, cents, days(-1))

    full = await get_activity(client, tutor, sid, limit=200)
    assert full["next_cursor"] is None
    assert len(full["items"]) == 7  # student + first rate + 5 payments
    assert_newest_first(full["items"])
    assert [item["summary"] for item in full["items"][:5]] == [
        f"Pagamento di {euro(c)} del {short_day(days(-1))} registrato (Contanti)"
        for c in (500, 400, 300, 200, 100)
    ]
    assert await get_activity(client, tutor, sid) == full  # default limit: 50

    pages: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        params: dict[str, Any] = {"limit": 3} | ({"before": cursor} if cursor else {})
        page = await get_activity(client, tutor, sid, **params)
        pages.append(page)
        cursor = page["next_cursor"]
        if cursor is None:
            break
        assert cursor == page["items"][-1]["id"]
    assert [len(page["items"]) for page in pages] == [3, 3, 1]
    assert [item for page in pages for item in page["items"]] == full["items"]

    # Exactly `limit` items left: no cursor to an empty page.
    assert await get_activity(client, tutor, sid, limit=7) == full
    six = await get_activity(client, tutor, sid, limit=6)
    assert six["items"] == full["items"][:6]
    assert six["next_cursor"] == full["items"][5]["id"]
    rest = await get_activity(client, tutor, sid, limit=6, before=six["next_cursor"])
    assert rest == {"items": full["items"][6:], "next_cursor": None}

    # A write made while paging does not shift the following pages.
    first = await get_activity(client, tutor, sid, limit=3)
    await create_payment(client, tutor, sid, 999, days(-1))
    second = await get_activity(client, tutor, sid, limit=3, before=first["next_cursor"])
    assert second["items"] == full["items"][3:6]
    newest = (await get_activity(client, tutor, sid, limit=1))["items"]
    assert newest[0]["summary"] == f"Pagamento di 9,99 € del {short_day(days(-1))} registrato (Contanti)"

    # A cursor older than everything, or an empty one (= first page).
    for value in ("1", "0", "-5"):
        assert await get_activity(client, tutor, sid, before=value) == {"items": [], "next_cursor": None}
    assert (await get_activity(client, tutor, sid, before=""))["items"][0] == newest[0]


@pytest.mark.parametrize(
    ("params", "field", "message"),
    [
        ({"before": "abc"}, "before", "Cursore non valido."),
        ({"before": "12.5"}, "before", "Cursore non valido."),
        ({"before": "1" * 21}, "before", "Testo troppo lungo (massimo 20 caratteri)."),
        ({"limit": "0"}, "limit", "Il valore minimo è 1."),
        ({"limit": "201"}, "limit", "Il valore massimo è 200."),
        ({"limit": "dieci"}, "limit", "Deve essere un numero intero."),
    ],
)
async def test_activity_query_validation(client, make_user, params, field, message) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    response = await client.get(
        f"{API}/students/{student['id']}/activity", params=params, headers=tutor.headers
    )
    assert_invalid(response, field, message)


async def test_activity_cursor_outside_the_bigint_range(client, make_user) -> None:
    tutor = await make_user()
    student = await new_student(client, tutor)
    url = f"{API}/students/{student['id']}/activity"
    assert (
        await client.get(url, params={"before": str(2**63 - 1)}, headers=tutor.headers)
    ).status_code == 200
    for value in (str(2**63), "99999999999999999999", str(-(2**63) - 1)):
        response = await client.get(url, params={"before": value}, headers=tutor.headers)
        assert_invalid(response, "before", "Cursore non valido.")


async def test_activity_of_a_deleted_student_stays_in_the_log(client, make_user, db) -> None:
    """A student without movements can be deleted: the endpoint 404s, the log keeps every row."""
    tutor = await make_user()
    student = await new_student(client, tutor, "Elisa", 2200, since=days(-30), last_name="Neri")
    sid = student["id"]
    await delete(client, tutor, f"/students/{sid}")
    assert_not_found(await client.get(f"{API}/students/{sid}/activity", headers=tutor.headers))

    async with db.acquire() as conn:
        rows = await conn.fetch(
            """select id, entity, entity_id, action, before, after, source, occurred_at
               from app.activity_log where tutor_id = $1 and student_id = $2 order by id desc""",
            tutor.id,
            uuid.UUID(sid),
        )
    records = [
        {**dict(r), "before": json.loads(r["before"] or "null"), "after": json.loads(r["after"] or "null")}
        for r in rows
    ]
    rendered = [build_activity(r, _Lookup({}, {}), dt.date.today().year) for r in records]
    assert [(a.entity, a.action, a.summary) for a in rendered] == [
        # The rate is removed by the FK cascade, after the student row itself.
        ("student_rate", "delete", f"Tariffa di 22,00 €/h dal {date_it(days(-30))} eliminata"),
        ("student", "delete", "Studente eliminato: Elisa Neri"),
        ("student_rate", "insert", f"Nuova tariffa: 22,00 €/h dal {date_it(days(-30))}"),
        ("student", "insert", "Studente aggiunto: Elisa Neri"),
    ]


# ---------------------------------------------------------------------------------------------
# Tenant isolation and authentication
# ---------------------------------------------------------------------------------------------


async def test_another_tutors_student_is_not_found(client, make_user) -> None:
    owner = await make_user("Proprietario")
    intruder = await make_user("Intruso")
    student = await new_student(client, owner, "Luca")
    sid = student["id"]
    await create_lesson(client, owner, sid, days(-1))
    await create_lesson(client, owner, sid, days(1))
    await create_payment(client, owner, sid, 1000, days(-1))
    cursor = (await get_activity(client, owner, sid))["items"][0]["id"]

    for path, params in [
        (f"/students/{sid}/ledger", {}),
        (f"/students/{sid}/ledger", {"order": "asc", "from": str(days(-5)), "to": str(days(5))}),
        (f"/students/{sid}/ledger.csv", {}),
        (f"/students/{sid}/activity", {}),
        (f"/students/{sid}/activity", {"limit": 1, "before": cursor}),
    ]:
        response = await client.get(f"{API}{path}", params=params, headers=intruder.headers)
        assert_not_found(response)

    # Nothing of the owner's leaks into the intruder's own views.
    mine = await new_student(client, intruder, "Luca")
    assert [brief(item)[:2] for item in (await get_activity(client, intruder, mine["id"]))["items"]] == [
        ("student_rate", "insert"),
        ("student", "insert"),
    ]
    assert (await get_ledger(client, intruder, mine["id"]))["items"] == []
    dashboard = await get_dashboard(client, intruder, days=31)
    assert (dashboard["upcoming"], dashboard["owing"], dashboard["in_credit"]) == ([], [], [])
    assert dashboard["totals"] == {"owed_to_you_cents": 0, "credit_held_cents": 0}
    assert (dashboard["month"]["lessons"], dashboard["month"]["collected_cents"]) == (0, 0)
    export = csv_text(await client.get(f"{API}/export/ledger.csv", headers=intruder.headers))
    assert export == BOM + "Studente;" + CSV_HEADER + "\r\n"

    # The owner still sees all of it.
    assert len((await get_ledger(client, owner, sid))["items"]) == 3
    owner_dashboard = await get_dashboard(client, owner, days=31)
    assert [lesson["student"]["id"] for lesson in owner_dashboard["upcoming"]] == [sid]


async def test_unknown_or_malformed_student_ids(client, make_user) -> None:
    tutor = await make_user()
    for suffix in ("ledger", "ledger.csv", "activity"):
        response = await client.get(f"{API}/students/{uuid.uuid4()}/{suffix}", headers=tutor.headers)
        assert_not_found(response)
        response = await client.get(f"{API}/students/not-a-uuid/{suffix}", headers=tutor.headers)
        assert_invalid(response, "student_id", BAD_ID)


@pytest.mark.parametrize(
    "path",
    [
        f"/students/{uuid.UUID(int=1)}/ledger",
        f"/students/{uuid.UUID(int=1)}/ledger.csv",
        f"/students/{uuid.UUID(int=1)}/activity",
        "/export/ledger.csv",
        "/dashboard",
    ],
)
async def test_reads_require_a_session(client, path) -> None:
    response = await client.get(f"{API}{path}")
    assert_problem(response, 401, "unauthorized")
    response = await client.get(f"{API}{path}", headers={"Authorization": "Bearer not-a-token"})
    assert_problem(response, 401, "unauthorized")
