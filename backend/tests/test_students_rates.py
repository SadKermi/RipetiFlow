"""Students and hourly rates (docs/05-api.md "Studenti" / "Tariffe", D-16, D-17, D-19).

Dates are computed relative to "today" in the tutor's timezone (default Europe/Rome) and kept far
from today (±days), so settled/scheduled never depends on the wall clock.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import uuid
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from tests.conftest import User, create_lesson, create_payment, create_student

API = "/api/v1"

STUDENT_KEYS = {
    "id",
    "first_name",
    "last_name",
    "school",
    "grade",
    "email",
    "phone",
    "guardian_name",
    "guardian_email",
    "guardian_phone",
    "notes",
    "default_subject_id",
    "display_name",
    "archived",
    "created_at",
    "balance",
    "rates",
}
SUMMARY_KEYS = {
    "id",
    "first_name",
    "last_name",
    "display_name",
    "grade",
    "school",
    "archived",
    "balance",
    "next_lesson",
    "last_lesson_date",
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
RATE_KEYS = {"id", "hourly_rate_cents", "effective_from", "created_at"}
PREVIEW_KEYS = {"affected_lessons", "current_total_cents", "new_total_cents", "delta_cents"}

TITLES = {404: "Non trovato", 409: "Conflitto", 422: "Dati non validi"}

STUDENT_NOT_FOUND = "Studente non trovato."
RATE_NOT_FOUND = "Tariffa non trovata."
ONLY_RATE = "Non puoi eliminare l'unica tariffa dello studente."
DUPLICATE_RATE = "Esiste già una tariffa con questa data di decorrenza."
STUDENT_IN_USE = "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo."
SUBJECT_NOT_FOUND = "Materia non trovata."


# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------


def today(tz: str = "Europe/Rome") -> dt.date:
    return dt.datetime.now(ZoneInfo(tz)).date()


def day(offset: int) -> dt.date:
    """A date `offset` days from today in the default tutor timezone (Europe/Rome)."""
    return today() + dt.timedelta(days=offset)


def iso(offset: int) -> str:
    return day(offset).isoformat()


def assert_problem(
    response: httpx.Response,
    status: int,
    code: str,
    detail: str | None = None,
    field: str | None = None,
) -> dict[str, Any]:
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith("application/problem+json")
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert body["code"] == code
    if status in TITLES:
        assert body["title"] == TITLES[status]
    if detail is not None:
        assert body["detail"] == detail
    if field is not None:
        assert {"field": field, "message": body["detail"]} in body["errors"], body
    return body


async def new_student(
    client: httpx.AsyncClient,
    user: User,
    first_name: str = "Luca",
    rate: int = 2000,
    since: int = -200,
    **fields: Any,
) -> dict[str, Any]:
    """A student whose first rate starts `since` days from today (well before the test lessons)."""
    return await create_student(client, user, first_name, rate, rate_effective_from=iso(since), **fields)


async def lesson(
    client: httpx.AsyncClient,
    user: User,
    student_id: str,
    offset: int,
    start: str = "15:00",
    end: str = "16:00",
    rate: int | None = None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {} if rate is None else {"hourly_rate_cents": rate}
    return await create_lesson(client, user, student_id, day(offset), start, end, **fields)


async def get_student(client: httpx.AsyncClient, user: User, student_id: str) -> dict[str, Any]:
    response = await client.get(f"{API}/students/{student_id}", headers=user.headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    return data


async def list_students(client: httpx.AsyncClient, user: User, **params: Any) -> list[dict[str, Any]]:
    response = await client.get(f"{API}/students", params=params, headers=user.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    items: list[dict[str, Any]] = body["items"]
    return items


async def list_rates(client: httpx.AsyncClient, user: User, student_id: str) -> list[dict[str, Any]]:
    response = await client.get(f"{API}/students/{student_id}/rates", headers=user.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    items: list[dict[str, Any]] = body["items"]
    return items


async def add_rate(
    client: httpx.AsyncClient, user: User, student_id: str, cents: int, since: int, reprice: bool = False
) -> dict[str, Any]:
    response = await client.post(
        f"{API}/students/{student_id}/rates",
        json={"hourly_rate_cents": cents, "effective_from": iso(since), "reprice_existing": reprice},
        headers=user.headers,
    )
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def preview(
    client: httpx.AsyncClient, user: User, student_id: str, cents: int, since: int
) -> dict[str, Any]:
    response = await client.post(
        f"{API}/students/{student_id}/rates/preview",
        json={"hourly_rate_cents": cents, "effective_from": iso(since)},
        headers=user.headers,
    )
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    assert set(data) == PREVIEW_KEYS
    return data


async def subject_ids(client: httpx.AsyncClient, user: User) -> list[str]:
    response = await client.get(f"{API}/subjects", headers=user.headers)
    assert response.status_code == 200, response.text
    return [s["id"] for s in response.json()["items"]]


async def lesson_state(db: Any, lesson_id: str) -> tuple[int, int, bool]:
    """(hourly_rate_cents, amount_cents, rate_overridden) read with the owner role."""
    row = await db.fetchrow(
        "select hourly_rate_cents, amount_cents, rate_overridden from app.lessons where id = $1",
        uuid.UUID(lesson_id),
    )
    assert row is not None
    return row["hourly_rate_cents"], row["amount_cents"], row["rate_overridden"]


def balance(
    *,
    balance_cents: int,
    projected: int,
    charged: int,
    paid: int,
    scheduled: int,
    done_minutes: int,
    scheduled_minutes: int,
    rate: int | None,
    status: str,
    credit_minutes: int | None,
) -> dict[str, Any]:
    return {
        "balance_cents": balance_cents,
        "projected_balance_cents": projected,
        "charged_cents": charged,
        "paid_cents": paid,
        "scheduled_cents": scheduled,
        "done_minutes": done_minutes,
        "scheduled_minutes": scheduled_minutes,
        "current_hourly_rate_cents": rate,
        "status": status,
        "credit_minutes": credit_minutes,
    }


# ---------------------------------------------------------------------------------------------
# Create / read: shapes, display_name, defaults, validation
# ---------------------------------------------------------------------------------------------


async def test_create_student_returns_full_student(client, make_user) -> None:
    user = await make_user("Anna")
    body = {
        "first_name": "  Luca ",
        "last_name": " Rossi ",
        "school": "Liceo Galilei",
        "grade": "3B",
        "email": "luca@example.it",
        "phone": "+39 333 1234567",
        "guardian_name": "Maria Rossi",
        "guardian_email": "maria@example.it",
        "guardian_phone": "+39 333 7654321",
        "notes": "Preferisce il martedì",
        "hourly_rate_cents": 2500,
        "rate_effective_from": "2026-01-15",
    }
    response = await client.post(f"{API}/students", json=body, headers=user.headers)
    assert response.status_code == 201, response.text
    student = response.json()
    assert set(student) == STUDENT_KEYS
    uuid.UUID(student["id"])
    assert student["first_name"] == "Luca"
    assert student["last_name"] == "Rossi"
    assert student["display_name"] == "Luca Rossi"
    assert student["school"] == "Liceo Galilei"
    assert student["grade"] == "3B"
    assert student["email"] == "luca@example.it"
    assert student["phone"] == "+39 333 1234567"
    assert student["guardian_name"] == "Maria Rossi"
    assert student["guardian_email"] == "maria@example.it"
    assert student["guardian_phone"] == "+39 333 7654321"
    assert student["notes"] == "Preferisce il martedì"
    assert student["default_subject_id"] is None
    assert student["archived"] is False
    dt.datetime.fromisoformat(student["created_at"])
    assert set(student["balance"]) == BALANCE_KEYS
    assert student["balance"] == balance(
        balance_cents=0,
        projected=0,
        charged=0,
        paid=0,
        scheduled=0,
        done_minutes=0,
        scheduled_minutes=0,
        rate=2500,
        status="settled",
        credit_minutes=None,
    )
    assert len(student["rates"]) == 1
    rate = student["rates"][0]
    assert set(rate) == RATE_KEYS
    assert rate["hourly_rate_cents"] == 2500
    assert rate["effective_from"] == "2026-01-15"
    dt.datetime.fromisoformat(rate["created_at"])

    # GET returns the same document.
    assert await get_student(client, user, student["id"]) == student


async def test_display_name_without_last_name_and_blank_optionals_become_null(client, make_user) -> None:
    user = await make_user()
    student = await create_student(
        client, user, "Giulia", 1800, last_name="   ", school="", notes="  ", email=None
    )
    assert student["first_name"] == "Giulia"
    assert student["last_name"] is None
    assert student["school"] is None
    assert student["notes"] is None
    assert student["email"] is None
    assert student["display_name"] == "Giulia"
    [summary] = await list_students(client, user)
    assert set(summary) == SUMMARY_KEYS
    assert summary["display_name"] == "Giulia"
    assert summary["last_name"] is None


async def test_rate_effective_from_defaults_to_today_in_tutor_timezone(client, make_user) -> None:
    # Kiritimati is UTC+14 and Pago Pago UTC-11: at any instant at least one of them is on a
    # different calendar day than Europe/Rome, so a server using the wrong zone is caught.
    for tz in ("Pacific/Kiritimati", "Pacific/Pago_Pago"):
        user = await make_user("Fuso", timezone=tz)
        before = today(tz)
        student = await create_student(client, user, "Luca", 2000)
        after = today(tz)
        [rate] = student["rates"]
        assert rate["effective_from"] in {before.isoformat(), after.isoformat()}, (tz, rate)
        assert rate["hourly_rate_cents"] == 2000
        assert student["balance"]["current_hourly_rate_cents"] == 2000


async def test_create_student_validation_errors(client, make_user) -> None:
    user = await make_user()
    url = f"{API}/students"

    response = await client.post(url, json={"first_name": "Luca"}, headers=user.headers)
    assert_problem(response, 422, "validation_error", "Campo obbligatorio.", "hourly_rate_cents")

    response = await client.post(
        url, json={"first_name": "Luca", "hourly_rate_cents": -1}, headers=user.headers
    )
    assert_problem(response, 422, "validation_error", "Il valore minimo è 0.", "hourly_rate_cents")

    response = await client.post(
        url, json={"first_name": "Luca", "hourly_rate_cents": 100_001}, headers=user.headers
    )
    assert_problem(response, 422, "validation_error", "Il valore massimo è 100000.", "hourly_rate_cents")

    response = await client.post(
        url, json={"first_name": "   ", "hourly_rate_cents": 2000}, headers=user.headers
    )
    assert_problem(response, 422, "validation_error", "Campo obbligatorio.", "first_name")

    response = await client.post(
        url,
        json={"first_name": "Luca", "last_name": "x" * 81, "hourly_rate_cents": 2000},
        headers=user.headers,
    )
    assert_problem(
        response, 422, "validation_error", "Testo troppo lungo (massimo 80 caratteri).", "last_name"
    )

    # Nothing was created by the rejected requests.
    assert await list_students(client, user) == []
    # Boundary values are accepted (free lessons and the maximum rate).
    assert (await create_student(client, user, "Zero", 0))["rates"][0]["hourly_rate_cents"] == 0
    assert (await create_student(client, user, "Max", 100_000))["rates"][0]["hourly_rate_cents"] == 100_000


async def test_get_student_unknown_and_malformed_id(client, make_user) -> None:
    user = await make_user()
    response = await client.get(f"{API}/students/{uuid.uuid4()}", headers=user.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    response = await client.get(f"{API}/students/not-a-uuid", headers=user.headers)
    assert_problem(response, 422, "validation_error", "Identificativo non valido.", "student_id")


async def test_default_subject_id_validation(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    own_subject, other_subject = await subject_ids(client, anna), await subject_ids(client, bruno)
    assert own_subject
    assert other_subject

    # Own subject: accepted.
    student = await create_student(client, anna, "Luca", 2000, default_subject_id=own_subject[0])
    assert student["default_subject_id"] == own_subject[0]

    # Another tutor's subject or an unknown id: 422 on the field (docs/05 conventions), not 404.
    for foreign in (other_subject[0], str(uuid.uuid4())):
        response = await client.post(
            f"{API}/students",
            json={"first_name": "Sara", "hourly_rate_cents": 2000, "default_subject_id": foreign},
            headers=anna.headers,
        )
        assert_problem(response, 422, "validation_error", SUBJECT_NOT_FOUND, "default_subject_id")

        response = await client.patch(
            f"{API}/students/{student['id']}", json={"default_subject_id": foreign}, headers=anna.headers
        )
        assert_problem(response, 422, "validation_error", SUBJECT_NOT_FOUND, "default_subject_id")

    assert [s["first_name"] for s in await list_students(client, anna)] == ["Luca"]
    assert (await get_student(client, anna, student["id"]))["default_subject_id"] == own_subject[0]

    # PATCH to another own subject, then clear it with an explicit null.
    response = await client.patch(
        f"{API}/students/{student['id']}", json={"default_subject_id": own_subject[1]}, headers=anna.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["default_subject_id"] == own_subject[1]
    response = await client.patch(
        f"{API}/students/{student['id']}", json={"default_subject_id": None}, headers=anna.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["default_subject_id"] is None


# ---------------------------------------------------------------------------------------------
# PATCH
# ---------------------------------------------------------------------------------------------


async def test_patch_student_is_partial(client, make_user) -> None:
    user = await make_user()
    student = await new_student(
        client, user, "Luca", 2000, last_name="Rossi", school="Liceo", grade="2A", notes="Note"
    )
    response = await client.patch(
        f"{API}/students/{student['id']}",
        json={"last_name": "Bianchi", "grade": "", "phone": " 333 111 ", "guardian_name": "Paola"},
        headers=user.headers,
    )
    assert response.status_code == 200, response.text
    patched = response.json()
    assert set(patched) == STUDENT_KEYS
    assert patched["first_name"] == "Luca"
    assert patched["last_name"] == "Bianchi"
    assert patched["display_name"] == "Luca Bianchi"
    assert patched["grade"] is None  # "" clears an optional field
    assert patched["phone"] == "333 111"
    assert patched["guardian_name"] == "Paola"
    # Untouched fields keep their values; rates are not part of the PATCH.
    assert patched["school"] == "Liceo"
    assert patched["notes"] == "Note"
    assert patched["rates"] == student["rates"]
    assert patched["created_at"] == student["created_at"]

    # An empty body is a no-op.
    response = await client.patch(f"{API}/students/{student['id']}", json={}, headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json() == patched

    # Removing the last name leaves the first name as display name.
    response = await client.patch(
        f"{API}/students/{student['id']}", json={"last_name": None}, headers=user.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["display_name"] == "Luca"


async def test_patch_student_rejects_missing_first_name(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca")
    url = f"{API}/students/{student['id']}"
    for value in (None, "", "   "):
        response = await client.patch(url, json={"first_name": value}, headers=user.headers)
        assert_problem(response, 422, "validation_error", "Campo obbligatorio.", "first_name")
    assert (await get_student(client, user, student["id"]))["first_name"] == "Luca"

    response = await client.patch(f"{API}/students/{uuid.uuid4()}", json={"notes": "x"}, headers=user.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)


# ---------------------------------------------------------------------------------------------
# Archive / unarchive / list filter
# ---------------------------------------------------------------------------------------------


async def test_archive_unarchive_and_archived_filter(client, make_user, db) -> None:
    user = await make_user()
    anna = await new_student(client, user, "Anna")
    bruno = await new_student(client, user, "Bruno")

    response = await client.post(f"{API}/students/{bruno['id']}/archive", headers=user.headers)
    assert response.status_code == 200, response.text
    archived = response.json()
    assert set(archived) == STUDENT_KEYS
    assert archived["archived"] is True
    archived_at = await db.fetchval(
        "select archived_at from app.students where id = $1", uuid.UUID(bruno["id"])
    )
    assert archived_at is not None

    # Archiving again is idempotent and keeps the original archive timestamp.
    response = await client.post(f"{API}/students/{bruno['id']}/archive", headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json()["archived"] is True
    again = await db.fetchval("select archived_at from app.students where id = $1", uuid.UUID(bruno["id"]))
    assert again == archived_at

    assert [s["id"] for s in await list_students(client, user)] == [anna["id"]]
    assert [s["id"] for s in await list_students(client, user, archived="false")] == [anna["id"]]
    archived_list = await list_students(client, user, archived="true")
    assert [s["id"] for s in archived_list] == [bruno["id"]]
    assert archived_list[0]["archived"] is True
    assert [s["id"] for s in await list_students(client, user, archived="true", q="bru")] == [bruno["id"]]
    assert await list_students(client, user, archived="true", q="anna") == []

    # An archived student is still readable.
    assert (await get_student(client, user, bruno["id"]))["archived"] is True

    response = await client.post(f"{API}/students/{bruno['id']}/unarchive", headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json()["archived"] is False
    assert [s["id"] for s in await list_students(client, user)] == [anna["id"], bruno["id"]]
    assert await list_students(client, user, archived="true") == []

    for action in ("archive", "unarchive"):
        response = await client.post(f"{API}/students/{uuid.uuid4()}/{action}", headers=user.headers)
        assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)


# ---------------------------------------------------------------------------------------------
# DELETE (D-19)
# ---------------------------------------------------------------------------------------------


async def test_delete_student_without_movements(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca")
    await add_rate(client, user, student["id"], 2500, -10)
    response = await client.delete(f"{API}/students/{student['id']}", headers=user.headers)
    assert response.status_code == 204, response.text
    assert response.content == b""

    response = await client.get(f"{API}/students/{student['id']}", headers=user.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    assert await list_students(client, user) == []
    assert await list_students(client, user, archived="true") == []
    rates_left = await db.fetchval(
        "select count(*) from app.student_rates where student_id = $1", uuid.UUID(student["id"])
    )
    assert rates_left == 0

    response = await client.delete(f"{API}/students/{student['id']}", headers=user.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)


async def test_delete_student_with_lessons_is_a_conflict(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca")
    created = await lesson(client, user, student["id"], 30)  # even a scheduled lesson counts

    response = await client.delete(f"{API}/students/{student['id']}", headers=user.headers)
    body = assert_problem(response, 409, "conflict", STUDENT_IN_USE)
    assert "errors" not in body
    assert body["type"] == "https://ripetiflow.app/errors/conflict"
    assert (await get_student(client, user, student["id"]))["archived"] is False

    # Archive is the way out; once the lesson is gone, deletion works.
    response = await client.post(f"{API}/students/{student['id']}/archive", headers=user.headers)
    assert response.status_code == 200
    response = await client.delete(f"{API}/students/{student['id']}", headers=user.headers)
    assert_problem(response, 409, "conflict", STUDENT_IN_USE)

    response = await client.delete(f"{API}/lessons/{created['id']}", headers=user.headers)
    assert response.status_code == 204, response.text
    response = await client.delete(f"{API}/students/{student['id']}", headers=user.headers)
    assert response.status_code == 204, response.text


async def test_delete_student_with_payments_only_is_a_conflict(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca")
    await create_payment(client, user, student["id"], 5000, day(-3))
    response = await client.delete(f"{API}/students/{student['id']}", headers=user.headers)
    assert_problem(response, 409, "conflict", STUDENT_IN_USE)
    assert (await get_student(client, user, student["id"]))["balance"]["paid_cents"] == 5000


# ---------------------------------------------------------------------------------------------
# List: search and sort
# ---------------------------------------------------------------------------------------------


async def test_list_search_by_name_tokens(client, make_user) -> None:
    user = await make_user()
    luca = await new_student(client, user, "Luca", last_name="Rossi")
    lucia = await new_student(client, user, "Lucia", last_name="Bianchi")
    marco = await new_student(client, user, "Marco", last_name="Luchetti", school="Liceo Rossi")

    async def ids(q: str) -> list[str]:
        return [s["id"] for s in await list_students(client, user, q=q)]

    assert await ids("luc") == [luca["id"], lucia["id"], marco["id"]]  # first or last name
    assert await ids("LUCA") == [luca["id"]]
    assert await ids("rossi") == [luca["id"]]  # school is not searched
    assert await ids("luc bian") == [lucia["id"]]  # every token must match
    assert await ids("  marco   luch ") == [marco["id"]]
    assert await ids("luca bianchi") == []
    assert await ids("zzz") == []
    assert await ids("") == [luca["id"], lucia["id"], marco["id"]]

    response = await client.get(f"{API}/students", params={"q": "x" * 101}, headers=user.headers)
    assert_problem(response, 422, "validation_error", field="q")


async def test_list_search_escapes_like_wildcards(client, make_user) -> None:
    user = await make_user()
    plain = await new_student(client, user, "Luca", last_name="Rossi")
    underscore = await new_student(client, user, "Anna", last_name="Di_Marco")
    percent = await new_student(client, user, "Sara", last_name="Cento%")
    backslash = await new_student(client, user, "Back\\slash")

    async def ids(q: str) -> list[str]:
        return [s["id"] for s in await list_students(client, user, q=q)]

    # Unescaped, "%" and "_" would match every student.
    assert await ids("%") == [percent["id"]]
    assert await ids("_") == [underscore["id"]]
    assert await ids("\\") == [backslash["id"]]
    assert await ids("i_m") == [underscore["id"]]
    assert await ids("o%") == [percent["id"]]
    assert await ids("%%") == []
    assert await ids("r_ssi") == []
    assert await ids("rossi") == [plain["id"]]


async def test_list_sort_by_name_is_case_insensitive(client, make_user) -> None:
    user = await make_user()
    await new_student(client, user, "carla")
    await new_student(client, user, "Anna", last_name="Verdi")
    await new_student(client, user, "anna", last_name="Bianchi")
    await new_student(client, user, "Bruno")
    expected = ["anna Bianchi", "Anna Verdi", "Bruno", "carla"]
    assert [s["display_name"] for s in await list_students(client, user)] == expected
    assert [s["display_name"] for s in await list_students(client, user, sort="name")] == expected

    response = await client.get(f"{API}/students", params={"sort": "age"}, headers=user.headers)
    body = assert_problem(response, 422, "validation_error", field="sort")
    assert body["detail"].startswith("Valore non ammesso")


async def test_list_sort_by_balance_puts_biggest_debt_first(client, make_user) -> None:
    user = await make_user()
    credit = await new_student(client, user, "Anna", 2000)
    await create_payment(client, user, credit["id"], 3000, day(-5))
    settled = await new_student(client, user, "Bruno", 2000)
    small_debt = await new_student(client, user, "Carla", 2000)
    await lesson(client, user, small_debt["id"], -10, "15:00", "15:30")  # -1000
    big_debt = await new_student(client, user, "Dario", 2000)
    await lesson(client, user, big_debt["id"], -10, "15:00", "17:30")  # -5000
    await lesson(client, user, big_debt["id"], 10, "15:00", "20:00")  # scheduled: not in the balance

    items = await list_students(client, user, sort="balance")
    assert [s["id"] for s in items] == [big_debt["id"], small_debt["id"], settled["id"], credit["id"]]
    assert [s["balance"]["balance_cents"] for s in items] == [-5000, -1000, 0, 3000]
    assert [s["balance"]["status"] for s in items] == ["debt", "debt", "settled", "credit"]


async def test_list_sort_by_next_lesson_and_lesson_dates(client, make_user) -> None:
    user = await make_user()
    later = await new_student(client, user, "Anna")
    await lesson(client, user, later["id"], 10, "15:00", "16:00")
    await lesson(client, user, later["id"], 20, "08:00", "09:00")
    sooner = await new_student(client, user, "Bruno")
    await lesson(client, user, sooner["id"], 5, "18:00", "19:00")
    await lesson(client, user, sooner["id"], -40, "10:00", "11:00")
    await lesson(client, user, sooner["id"], -15, "10:00", "11:00")
    same_day_early = await new_student(client, user, "Carla")
    await lesson(client, user, same_day_early["id"], 10, "09:00", "10:00")
    only_past = await new_student(client, user, "Aldo")
    await lesson(client, user, only_past["id"], -3, "09:00", "10:00")
    nothing = await new_student(client, user, "Abele")

    items = await list_students(client, user, sort="next_lesson")
    by_id = {s["id"]: s for s in items}
    assert [s["id"] for s in items] == [
        sooner["id"],
        same_day_early["id"],
        later["id"],
        nothing["id"],  # no next lesson: last, by name
        only_past["id"],
    ]
    assert by_id[sooner["id"]]["next_lesson"] == {"date": iso(5), "start_time": "18:00"}
    assert by_id[sooner["id"]]["last_lesson_date"] == iso(-15)
    assert by_id[later["id"]]["next_lesson"] == {"date": iso(10), "start_time": "15:00"}
    assert by_id[later["id"]]["last_lesson_date"] is None
    assert by_id[same_day_early["id"]]["next_lesson"] == {"date": iso(10), "start_time": "09:00"}
    assert by_id[only_past["id"]]["next_lesson"] is None
    assert by_id[only_past["id"]]["last_lesson_date"] == iso(-3)
    assert by_id[nothing["id"]]["next_lesson"] is None
    assert by_id[nothing["id"]]["last_lesson_date"] is None


# ---------------------------------------------------------------------------------------------
# Balance (D-17)
# ---------------------------------------------------------------------------------------------


async def test_balance_debt_with_scheduled_lessons(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000)
    await lesson(client, user, student["id"], -30, "15:00", "16:30")  # 90 min -> 3000
    await lesson(client, user, student["id"], -20, "15:00", "16:00")  # 60 min -> 2000
    await lesson(client, user, student["id"], 30, "10:00", "10:45")  # scheduled 45 min -> 1500
    await create_payment(client, user, student["id"], 4000, day(-10))

    expected = balance(
        balance_cents=-1000,
        projected=-2500,
        charged=5000,
        paid=4000,
        scheduled=1500,
        done_minutes=150,
        scheduled_minutes=45,
        rate=2000,
        status="debt",
        credit_minutes=None,
    )
    detail = await get_student(client, user, student["id"])
    assert detail["balance"] == expected
    [summary] = await list_students(client, user)
    assert summary["balance"] == expected
    assert summary["next_lesson"] == {"date": iso(30), "start_time": "10:00"}
    assert summary["last_lesson_date"] == iso(-20)


async def test_balance_credit_minutes_are_rounded_down(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2700)
    await create_payment(client, user, student["id"], 10_000, day(-6))
    await lesson(client, user, student["id"], -5, "15:00", "16:00")  # 2700
    detail = await get_student(client, user, student["id"])
    # 7300 / 2700 * 60 = 162.2 -> 162
    assert detail["balance"] == balance(
        balance_cents=7300,
        projected=7300,
        charged=2700,
        paid=10_000,
        scheduled=0,
        done_minutes=60,
        scheduled_minutes=0,
        rate=2700,
        status="credit",
        credit_minutes=162,
    )


async def test_balance_credit_uses_current_rate_not_future_rate(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 3000)
    await add_rate(client, user, student["id"], 6000, 40)
    await create_payment(client, user, student["id"], 4500, day(-2))
    await lesson(client, user, student["id"], 50, "15:00", "16:00")  # scheduled at the future rate
    detail = await get_student(client, user, student["id"])
    assert detail["balance"] == balance(
        balance_cents=4500,
        projected=-1500,
        charged=0,
        paid=4500,
        scheduled=6000,
        done_minutes=0,
        scheduled_minutes=60,
        rate=3000,
        status="credit",  # from balance_cents, not from the projection
        credit_minutes=90,
    )


async def test_balance_settled_and_zero_rate_credit(client, make_user) -> None:
    user = await make_user()
    settled = await new_student(client, user, "Anna", 2000)
    await lesson(client, user, settled["id"], -3, "15:00", "16:00")
    await create_payment(client, user, settled["id"], 2000, day(-1))
    assert (await get_student(client, user, settled["id"]))["balance"] == balance(
        balance_cents=0,
        projected=0,
        charged=2000,
        paid=2000,
        scheduled=0,
        done_minutes=60,
        scheduled_minutes=0,
        rate=2000,
        status="settled",
        credit_minutes=None,
    )

    # Free lessons (rate 0): a credit cannot be expressed in minutes, and must not crash.
    free = await new_student(client, user, "Bruno", 0)
    await create_payment(client, user, free["id"], 1000, day(-1))
    assert (await get_student(client, user, free["id"]))["balance"] == balance(
        balance_cents=1000,
        projected=1000,
        charged=0,
        paid=1000,
        scheduled=0,
        done_minutes=0,
        scheduled_minutes=0,
        rate=0,
        status="credit",
        credit_minutes=None,
    )


# ---------------------------------------------------------------------------------------------
# Rates: list, create, duplicate, validation
# ---------------------------------------------------------------------------------------------


async def test_rates_are_listed_newest_first(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    created_future = await add_rate(client, user, student["id"], 3000, 30)
    created_past = await add_rate(client, user, student["id"], 2500, -40)
    created_older = await add_rate(client, user, student["id"], 2200, -70)

    rates = await list_rates(client, user, student["id"])
    assert all(set(r) == RATE_KEYS for r in rates)
    assert [(r["effective_from"], r["hourly_rate_cents"]) for r in rates] == [
        (iso(30), 3000),
        (iso(-40), 2500),
        (iso(-70), 2200),
        (iso(-100), 2000),
    ]
    assert [r["id"] for r in rates[:3]] == [
        created_future["rate"]["id"],
        created_past["rate"]["id"],
        created_older["rate"]["id"],
    ]
    detail = await get_student(client, user, student["id"])
    assert detail["rates"] == rates
    assert detail["balance"]["current_hourly_rate_cents"] == 2500

    response = await client.get(f"{API}/students/{uuid.uuid4()}/rates", headers=user.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)


async def test_create_rate_without_reprice_keeps_existing_lessons(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    past = await lesson(client, user, student["id"], -30)
    future = await lesson(client, user, student["id"], 30)

    created = await add_rate(client, user, student["id"], 2500, -40)
    assert set(created) == {"rate", "repriced_lessons"}
    assert set(created["rate"]) == RATE_KEYS
    assert created["rate"]["hourly_rate_cents"] == 2500
    assert created["rate"]["effective_from"] == iso(-40)
    assert created["repriced_lessons"] == 0
    assert await lesson_state(db, past["id"]) == (2000, 2000, False)
    assert await lesson_state(db, future["id"]) == (2000, 2000, False)

    # New lessons in the window take the new history rate.
    newer = await lesson(client, user, student["id"], -25)
    assert newer["hourly_rate_cents"] == 2500
    assert newer["amount_cents"] == 2500


async def test_create_rate_duplicate_effective_from_is_a_conflict(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    await add_rate(client, user, student["id"], 2500, -40)
    in_window = await lesson(client, user, student["id"], -30)  # 2500

    for reprice in (False, True):
        response = await client.post(
            f"{API}/students/{student['id']}/rates",
            json={"hourly_rate_cents": 9000, "effective_from": iso(-40), "reprice_existing": reprice},
            headers=user.headers,
        )
        assert_problem(response, 409, "conflict", DUPLICATE_RATE, "effective_from")

    # Same date as the first rate too.
    response = await client.post(
        f"{API}/students/{student['id']}/rates",
        json={"hourly_rate_cents": 9000, "effective_from": iso(-100), "reprice_existing": True},
        headers=user.headers,
    )
    assert_problem(response, 409, "conflict", DUPLICATE_RATE, "effective_from")

    # The failed requests changed nothing (no half-applied repricing).
    assert [r["hourly_rate_cents"] for r in await list_rates(client, user, student["id"])] == [2500, 2000]
    assert await lesson_state(db, in_window["id"]) == (2500, 2500, False)


async def test_rate_validation_errors(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca")
    for path in ("rates", "rates/preview"):
        url = f"{API}/students/{student['id']}/{path}"
        response = await client.post(url, json={"effective_from": iso(-1)}, headers=user.headers)
        assert_problem(response, 422, "validation_error", "Campo obbligatorio.", "hourly_rate_cents")
        response = await client.post(url, json={"hourly_rate_cents": 2000}, headers=user.headers)
        assert_problem(response, 422, "validation_error", "Campo obbligatorio.", "effective_from")
        response = await client.post(
            url, json={"hourly_rate_cents": 100_001, "effective_from": iso(-1)}, headers=user.headers
        )
        assert_problem(response, 422, "validation_error", "Il valore massimo è 100000.", "hourly_rate_cents")
        response = await client.post(
            url, json={"hourly_rate_cents": -5, "effective_from": iso(-1)}, headers=user.headers
        )
        assert_problem(response, 422, "validation_error", "Il valore minimo è 0.", "hourly_rate_cents")
        response = await client.post(
            url, json={"hourly_rate_cents": 2000, "effective_from": "12/10/2026"}, headers=user.headers
        )
        assert_problem(
            response, 422, "validation_error", "Data non valida (formato AAAA-MM-GG).", "effective_from"
        )
    assert len(await list_rates(client, user, student["id"])) == 1

    for path in ("rates", "rates/preview"):
        response = await client.post(
            f"{API}/students/{uuid.uuid4()}/{path}",
            json={"hourly_rate_cents": 2000, "effective_from": iso(-1)},
            headers=user.headers,
        )
        assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)


# ---------------------------------------------------------------------------------------------
# Repricing rule (D-16): preview == create, window, hand-typed rates, earliest-rate fallback
# ---------------------------------------------------------------------------------------------


async def test_preview_matches_create_and_respects_the_window(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    sid = student["id"]
    await add_rate(client, user, sid, 4000, 50)  # the next rate: closes the window

    before = await lesson(client, user, sid, -90)  # before the window
    start = await lesson(client, user, sid, -50)  # first day of the window (included)
    long = await lesson(client, user, sid, -40, "15:00", "16:30")  # 90 min
    hand = await lesson(client, user, sid, -35, "15:00", "15:45", rate=1500)  # typed by hand
    same = await lesson(client, user, sid, -30, "15:00", "15:50", rate=2000)  # typed = history
    scheduled = await lesson(client, user, sid, 30)  # future lessons are repriced too
    after = await lesson(client, user, sid, 50)  # governed by the next rate (excluded)

    assert (long["amount_cents"], hand["amount_cents"], same["amount_cents"]) == (3000, 1125, 1667)
    assert after["hourly_rate_cents"] == 4000
    assert await lesson_state(db, hand["id"]) == (1500, 1125, True)
    assert await lesson_state(db, same["id"]) == (2000, 1667, False)

    # Affected: start (2000->2501), long (3000->3751.5=3752), same (1667->2084.17=2084), scheduled.
    expected_preview = {
        "affected_lessons": 4,
        "current_total_cents": 2000 + 3000 + 1667 + 2000,
        "new_total_cents": 2501 + 3752 + 2084 + 2501,
        "delta_cents": 10_838 - 8_667,
    }
    assert await preview(client, user, sid, 2501, -50) == expected_preview
    assert expected_preview["delta_cents"] == 2171
    # The preview writes nothing.
    assert await lesson_state(db, start["id"]) == (2000, 2000, False)
    assert len(await list_rates(client, user, sid)) == 2

    created = await add_rate(client, user, sid, 2501, -50, reprice=True)
    assert created["repriced_lessons"] == expected_preview["affected_lessons"]
    assert created["rate"]["hourly_rate_cents"] == 2501
    assert created["rate"]["effective_from"] == iso(-50)

    assert await lesson_state(db, before["id"]) == (2000, 2000, False)
    assert await lesson_state(db, start["id"]) == (2501, 2501, False)
    assert await lesson_state(db, long["id"]) == (2501, 3752, False)
    assert await lesson_state(db, hand["id"]) == (1500, 1125, True)
    assert await lesson_state(db, same["id"]) == (2501, 2084, False)
    assert await lesson_state(db, scheduled["id"]) == (2501, 2501, False)
    assert await lesson_state(db, after["id"]) == (4000, 4000, False)
    repriced_total = sum([(await lesson_state(db, x["id"]))[1] for x in (start, long, same, scheduled)])
    assert repriced_total == expected_preview["new_total_cents"]

    # The API shows the same amounts.
    response = await client.get(f"{API}/lessons/{long['id']}", headers=user.headers)
    assert response.json()["hourly_rate_cents"] == 2501
    assert response.json()["amount_cents"] == 3752

    # Once applied, the same preview has nothing left to do.
    assert await preview(client, user, sid, 2501, -50) == {
        "affected_lessons": 0,
        "current_total_cents": 0,
        "new_total_cents": 0,
        "delta_cents": 0,
    }

    detail = await get_student(client, user, sid)
    assert [(r["effective_from"], r["hourly_rate_cents"]) for r in detail["rates"]] == [
        (iso(50), 4000),
        (iso(-50), 2501),
        (iso(-100), 2000),
    ]
    assert detail["balance"] == balance(
        balance_cents=-(2000 + 2501 + 3752 + 1125 + 2084),
        projected=-(2000 + 2501 + 3752 + 1125 + 2084) - (2501 + 4000),
        charged=2000 + 2501 + 3752 + 1125 + 2084,
        paid=0,
        scheduled=2501 + 4000,
        done_minutes=60 + 60 + 90 + 45 + 50,
        scheduled_minutes=120,
        rate=2501,
        status="debt",
        credit_minutes=None,
    )


async def test_preview_skips_lessons_already_at_the_new_rate(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    await lesson(client, user, student["id"], -30, rate=2600)  # typed by hand at the new value
    await lesson(client, user, student["id"], -20)  # follows the history
    assert await preview(client, user, student["id"], 2600, -40) == {
        "affected_lessons": 1,
        "current_total_cents": 2000,
        "new_total_cents": 2600,
        "delta_cents": 600,
    }
    # A cut is a negative delta.
    assert await preview(client, user, student["id"], 1500, -40) == {
        "affected_lessons": 1,
        "current_total_cents": 2000,
        "new_total_cents": 1500,
        "delta_cents": -500,
    }
    # Nothing in the window.
    assert await preview(client, user, student["id"], 3000, 10) == {
        "affected_lessons": 0,
        "current_total_cents": 0,
        "new_total_cents": 0,
        "delta_cents": 0,
    }


async def test_hand_typed_rate_is_never_repriced_even_when_equal_to_history(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    sid = student["id"]
    hand = await lesson(client, user, sid, -20, rate=3000)  # history is 2000: typed by hand
    assert await lesson_state(db, hand["id"]) == (3000, 3000, True)

    # The history now says 3000 for that day: the stored rate equals it, but it was typed by hand.
    await add_rate(client, user, sid, 3000, -30)
    following = await lesson(client, user, sid, -15)  # from the history: 3000
    typed_equal = await lesson(client, user, sid, -25, rate=3000)  # typed = history now: follows it
    assert await lesson_state(db, following["id"]) == (3000, 3000, False)
    assert await lesson_state(db, typed_equal["id"]) == (3000, 3000, False)

    expected = {
        "affected_lessons": 2,
        "current_total_cents": 6000,
        "new_total_cents": 7000,
        "delta_cents": 1000,
    }
    assert await preview(client, user, sid, 3500, -28) == expected
    created = await add_rate(client, user, sid, 3500, -28, reprice=True)
    assert created["repriced_lessons"] == 2
    assert await lesson_state(db, hand["id"]) == (3000, 3000, True)
    assert await lesson_state(db, following["id"]) == (3500, 3500, False)
    assert await lesson_state(db, typed_equal["id"]) == (3500, 3500, False)

    # A later reprice whose window covers it still leaves the hand-typed lesson alone.
    created = await add_rate(client, user, sid, 4000, -22, reprice=True)
    assert created["repriced_lessons"] == 1  # only `following` (day -15)
    assert await lesson_state(db, hand["id"]) == (3000, 3000, True)
    assert await lesson_state(db, following["id"]) == (4000, 4000, False)


async def test_lessons_before_the_first_rate_follow_the_earliest_rate(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-10)
    sid = student["id"]
    fallback = await lesson(client, user, sid, -30)  # before the first rate: earliest rate 2000
    hand = await lesson(client, user, sid, -40, rate=2500)  # typed by hand
    assert fallback["hourly_rate_cents"] == 2000
    assert await lesson_state(db, fallback["id"]) == (2000, 2000, False)
    assert await lesson_state(db, hand["id"]) == (2500, 2500, True)

    expected = {
        "affected_lessons": 1,
        "current_total_cents": 2000,
        "new_total_cents": 2600,
        "delta_cents": 600,
    }
    assert await preview(client, user, sid, 2600, -60) == expected
    created = await add_rate(client, user, sid, 2600, -60, reprice=True)
    assert created["repriced_lessons"] == 1
    assert await lesson_state(db, fallback["id"]) == (2600, 2600, False)
    assert await lesson_state(db, hand["id"]) == (2500, 2500, True)
    detail = await get_student(client, user, sid)
    assert detail["balance"]["current_hourly_rate_cents"] == 2000
    assert detail["balance"]["charged_cents"] == 2600 + 2500


# ---------------------------------------------------------------------------------------------
# DELETE rate
# ---------------------------------------------------------------------------------------------


async def test_delete_rate_unknown_or_only_rate(client, make_user) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000)
    other = await new_student(client, user, "Sara", 2000)
    [only] = await list_rates(client, user, student["id"])
    [other_rate] = await list_rates(client, user, other["id"])

    response = await client.delete(
        f"{API}/students/{student['id']}/rates/{uuid.uuid4()}", headers=user.headers
    )
    assert_problem(response, 404, "not_found", RATE_NOT_FOUND)
    # A rate of another student of the same tutor is not this student's rate.
    response = await client.delete(
        f"{API}/students/{student['id']}/rates/{other_rate['id']}", headers=user.headers
    )
    assert_problem(response, 404, "not_found", RATE_NOT_FOUND)
    response = await client.delete(f"{API}/students/{uuid.uuid4()}/rates/{only['id']}", headers=user.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)

    for query in ("", "?reprice_existing=true"):
        response = await client.delete(
            f"{API}/students/{student['id']}/rates/{only['id']}{query}", headers=user.headers
        )
        assert_problem(response, 422, "validation_error", ONLY_RATE, "rate_id")
    assert await list_rates(client, user, student["id"]) == [only]
    assert await list_rates(client, user, other["id"]) == [other_rate]


async def test_delete_rate_without_reprice_keeps_lessons(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    sid = student["id"]
    first = await add_rate(client, user, sid, 3000, -50)
    second = await add_rate(client, user, sid, 3500, -45)
    governed = await lesson(client, user, sid, -30)  # 3500
    governed_first = await lesson(client, user, sid, -48)  # 3000

    response = await client.delete(f"{API}/students/{sid}/rates/{second['rate']['id']}", headers=user.headers)
    assert response.status_code == 204, response.text
    assert response.content == b""
    response = await client.delete(
        f"{API}/students/{sid}/rates/{first['rate']['id']}?reprice_existing=false", headers=user.headers
    )
    assert response.status_code == 204, response.text

    assert [r["hourly_rate_cents"] for r in await list_rates(client, user, sid)] == [2000]
    assert await lesson_state(db, governed["id"]) == (3500, 3500, False)
    assert await lesson_state(db, governed_first["id"]) == (3000, 3000, False)
    assert (await get_student(client, user, sid))["balance"]["current_hourly_rate_cents"] == 2000


async def test_delete_rate_with_reprice_returns_governed_lessons_to_history(client, make_user, db) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    sid = student["id"]
    middle = await add_rate(client, user, sid, 3000, -50)
    last = await add_rate(client, user, sid, 4000, -10)

    before = await lesson(client, user, sid, -70)  # 2000
    on_start = await lesson(client, user, sid, -50, "15:00", "16:30")  # 3000, 90 min
    governed = await lesson(client, user, sid, -30)  # 3000
    hand = await lesson(client, user, sid, -20, rate=5000)  # typed by hand
    next_window = await lesson(client, user, sid, -5)  # 4000: governed by the next rate
    scheduled = await lesson(client, user, sid, 20)  # 4000

    response = await client.delete(
        f"{API}/students/{sid}/rates/{middle['rate']['id']}?reprice_existing=true", headers=user.headers
    )
    assert response.status_code == 204, response.text
    assert await lesson_state(db, before["id"]) == (2000, 2000, False)
    assert await lesson_state(db, on_start["id"]) == (2000, 3000, False)
    assert await lesson_state(db, governed["id"]) == (2000, 2000, False)
    assert await lesson_state(db, hand["id"]) == (5000, 5000, True)
    assert await lesson_state(db, next_window["id"]) == (4000, 4000, False)
    assert await lesson_state(db, scheduled["id"]) == (4000, 4000, False)

    # Deleting the last rate: its open-ended window goes back to the previous rate.
    response = await client.delete(
        f"{API}/students/{sid}/rates/{last['rate']['id']}?reprice_existing=true", headers=user.headers
    )
    assert response.status_code == 204, response.text
    assert await lesson_state(db, next_window["id"]) == (2000, 2000, False)
    assert await lesson_state(db, scheduled["id"]) == (2000, 2000, False)
    assert await lesson_state(db, hand["id"]) == (5000, 5000, True)

    detail = await get_student(client, user, sid)
    assert [(r["effective_from"], r["hourly_rate_cents"]) for r in detail["rates"]] == [(iso(-100), 2000)]
    assert detail["balance"]["current_hourly_rate_cents"] == 2000
    assert detail["balance"]["charged_cents"] == 2000 + 3000 + 2000 + 5000 + 2000
    assert detail["balance"]["scheduled_cents"] == 2000


async def test_delete_earliest_rate_with_reprice_uses_the_earliest_remaining_rate(
    client, make_user, db
) -> None:
    user = await make_user()
    student = await new_student(client, user, "Luca", 2000, since=-100)
    sid = student["id"]
    await add_rate(client, user, sid, 3000, -50)
    [_, earliest] = await list_rates(client, user, sid)
    governed = await lesson(client, user, sid, -70)  # 2000
    later = await lesson(client, user, sid, -40)  # 3000

    response = await client.delete(
        f"{API}/students/{sid}/rates/{earliest['id']}?reprice_existing=true", headers=user.headers
    )
    assert response.status_code == 204, response.text
    # No rate on day -70 any more: the history falls back to the earliest rate (3000).
    assert await lesson_state(db, governed["id"]) == (3000, 3000, False)
    assert await lesson_state(db, later["id"]) == (3000, 3000, False)


async def test_concurrent_deletes_of_the_two_rates_leave_exactly_one(client, make_user, db) -> None:
    user = await make_user()
    for _ in range(3):
        student = await new_student(client, user, "Luca", 2000, since=-100)
        sid = student["id"]
        await add_rate(client, user, sid, 3000, -10)
        rate_ids = [r["id"] for r in await list_rates(client, user, sid)]
        assert len(rate_ids) == 2

        responses = await asyncio.gather(
            *(client.delete(f"{API}/students/{sid}/rates/{rid}", headers=user.headers) for rid in rate_ids)
        )
        statuses = sorted(r.status_code for r in responses)
        assert statuses == [204, 422], [r.text for r in responses]
        [rejected] = [r for r in responses if r.status_code == 422]
        assert_problem(rejected, 422, "validation_error", ONLY_RATE, "rate_id")

        remaining = await list_rates(client, user, sid)
        assert len(remaining) == 1
        assert remaining[0]["id"] in rate_ids
        count = await db.fetchval(
            "select count(*) from app.student_rates where student_id = $1", uuid.UUID(sid)
        )
        assert count == 1


# ---------------------------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------------------------


async def test_other_tutor_cannot_touch_students(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, anna, "Luca", 2000, last_name="Rossi")
    sid = student["id"]
    url = f"{API}/students/{sid}"

    assert_problem(await client.get(url, headers=bruno.headers), 404, "not_found", STUDENT_NOT_FOUND)
    response = await client.patch(url, json={"first_name": "Hacker"}, headers=bruno.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    for action in ("archive", "unarchive"):
        response = await client.post(f"{url}/{action}", headers=bruno.headers)
        assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    assert_problem(await client.delete(url, headers=bruno.headers), 404, "not_found", STUDENT_NOT_FOUND)
    assert await list_students(client, bruno) == []
    assert await list_students(client, bruno, archived="true") == []
    assert await list_students(client, bruno, q="luca") == []

    after = await get_student(client, anna, sid)
    assert after == student
    assert [s["id"] for s in await list_students(client, anna)] == [sid]


async def test_other_tutor_cannot_touch_rates(client, make_user, db) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    student = await new_student(client, anna, "Luca", 2000, since=-100)
    sid = student["id"]
    await add_rate(client, anna, sid, 3000, -50)
    governed = await lesson(client, anna, sid, -30)  # 3000
    anna_rates = await list_rates(client, anna, sid)
    body = {"hourly_rate_cents": 9000, "effective_from": iso(-60), "reprice_existing": True}

    response = await client.get(f"{API}/students/{sid}/rates", headers=bruno.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    response = await client.post(f"{API}/students/{sid}/rates/preview", json=body, headers=bruno.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    response = await client.post(f"{API}/students/{sid}/rates", json=body, headers=bruno.headers)
    assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)
    for rate in anna_rates:
        response = await client.delete(
            f"{API}/students/{sid}/rates/{rate['id']}?reprice_existing=true", headers=bruno.headers
        )
        assert_problem(response, 404, "not_found", STUDENT_NOT_FOUND)

    # Bruno's own student with Anna's rate id: the rate is invisible.
    own = await new_student(client, bruno, "Sara", 2000)
    response = await client.delete(
        f"{API}/students/{own['id']}/rates/{anna_rates[0]['id']}", headers=bruno.headers
    )
    assert_problem(response, 404, "not_found", RATE_NOT_FOUND)

    assert await list_rates(client, anna, sid) == anna_rates
    assert await lesson_state(db, governed["id"]) == (3000, 3000, False)
