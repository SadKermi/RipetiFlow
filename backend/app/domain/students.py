"""Students: list with balances, detail, CRUD, archive (D-17, D-19)."""

from __future__ import annotations

import uuid
from typing import Any, Literal

import asyncpg

from app.core.errors import conflict, invalid, not_found
from app.db.pool import Conn
from app.domain.common import TutorClock, balance_from_row, display_name
from app.domain.rates import list_rates
from app.domain.subjects import subject_exists
from app.schemas import NextLesson, Student, StudentCreate, StudentPatch, StudentSummary

StudentSort = Literal["name", "balance", "next_lesson"]

PROFILE_FIELDS = (
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
)

STUDENT_SELECT = """
select s.id, s.first_name, s.last_name, s.school, s.grade, s.email, s.phone, s.guardian_name,
       s.guardian_email, s.guardian_phone, s.notes, s.default_subject_id, s.archived_at, s.created_at,
       b.balance_cents, b.projected_balance_cents, b.charged_cents, b.paid_cents, b.scheduled_cents,
       b.done_minutes, b.scheduled_minutes, b.current_hourly_rate_cents,
       b.next_lesson_date, b.next_lesson_start, b.last_lesson_date
from app.students s
join app.student_balances b on b.student_id = s.id
"""

_ORDER = {
    "name": "lower(s.first_name), lower(coalesce(s.last_name, '')), s.id",
    "balance": "b.balance_cents, lower(s.first_name), s.id",
    "next_lesson": "b.next_lesson_date nulls last, b.next_lesson_start, lower(s.first_name), s.id",
}


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def summary_from_row(row: asyncpg.Record) -> StudentSummary:
    next_lesson = None
    if row["next_lesson_date"] is not None:
        next_lesson = NextLesson(date=row["next_lesson_date"], start_time=row["next_lesson_start"])
    return StudentSummary(
        id=row["id"],
        first_name=row["first_name"],
        last_name=row["last_name"],
        display_name=display_name(row["first_name"], row["last_name"]),
        grade=row["grade"],
        school=row["school"],
        archived=row["archived_at"] is not None,
        balance=balance_from_row(row),
        next_lesson=next_lesson,
        last_lesson_date=row["last_lesson_date"],
    )


async def list_students(
    conn: Conn,
    q: str | None = None,
    archived: bool | None = False,
    sort: StudentSort = "name",
) -> list[StudentSummary]:
    where = ["s.tutor_id = (select auth.uid())"]
    params: list[Any] = []
    if archived is not None:
        where.append("s.archived_at is not null" if archived else "s.archived_at is null")
    for token in (q or "").split()[:5]:
        params.append(f"%{_like_escape(token)}%")
        n = len(params)
        where.append(f"(s.first_name ilike ${n} or coalesce(s.last_name, '') ilike ${n})")
    sql = f"{STUDENT_SELECT} where {' and '.join(where)} order by {_ORDER[sort]}"
    rows = await conn.fetch(sql, *params)
    return [summary_from_row(r) for r in rows]


async def get_student(conn: Conn, student_id: uuid.UUID) -> Student:
    row = await conn.fetchrow(f"{STUDENT_SELECT} where s.id = $1", student_id)
    if row is None:
        raise not_found("Studente non trovato.")
    rates = await list_rates(conn, student_id)
    return Student(
        id=row["id"],
        display_name=display_name(row["first_name"], row["last_name"]),
        archived=row["archived_at"] is not None,
        created_at=row["created_at"],
        balance=balance_from_row(row),
        rates=rates,
        **{f: row[f] for f in PROFILE_FIELDS},
    )


async def student_ref_row(conn: Conn, student_id: uuid.UUID) -> asyncpg.Record | None:
    """Minimal student row visible to the current user (RLS), or None."""
    return await conn.fetchrow(
        "select id, first_name, last_name, archived_at, default_subject_id from app.students where id = $1",
        student_id,
    )


async def require_student(conn: Conn, student_id: uuid.UUID, field_name: str | None = None) -> asyncpg.Record:
    row = await student_ref_row(conn, student_id)
    if row is None:
        if field_name:
            raise invalid("Studente non trovato.", field_name)
        raise not_found("Studente non trovato.")
    return row


async def _check_subject(conn: Conn, subject_id: uuid.UUID | None) -> None:
    if subject_id is not None and not await subject_exists(conn, subject_id):
        raise invalid("Materia non trovata.", "default_subject_id")


async def create_student(conn: Conn, data: StudentCreate, clock: TutorClock) -> Student:
    await _check_subject(conn, data.default_subject_id)
    values = [getattr(data, f) for f in PROFILE_FIELDS]
    placeholders = ", ".join(f"${i}" for i in range(1, len(PROFILE_FIELDS) + 1))
    student_id = await conn.fetchval(
        f"insert into app.students ({', '.join(PROFILE_FIELDS)}) values ({placeholders}) returning id",
        *values,
    )
    await conn.execute(
        "insert into app.student_rates (student_id, hourly_rate_cents, effective_from) values ($1, $2, $3)",
        student_id,
        data.hourly_rate_cents,
        data.rate_effective_from or clock.today,
    )
    return await get_student(conn, student_id)


async def update_student(conn: Conn, student_id: uuid.UUID, patch: StudentPatch) -> Student:
    await require_student(conn, student_id)
    columns = [f for f in PROFILE_FIELDS if f in patch.model_fields_set]
    if "first_name" in columns and patch.first_name is None:
        raise invalid("Campo obbligatorio.", "first_name")
    if "default_subject_id" in columns:
        await _check_subject(conn, patch.default_subject_id)
    if columns:
        assignments = ", ".join(f"{col} = ${i}" for i, col in enumerate(columns, start=2))
        await conn.execute(
            f"update app.students set {assignments} where id = $1",
            student_id,
            *(getattr(patch, c) for c in columns),
        )
    return await get_student(conn, student_id)


async def set_archived(conn: Conn, student_id: uuid.UUID, archived: bool) -> Student:
    updated = await conn.fetchval(
        """update app.students
           set archived_at = case when $2 then coalesce(archived_at, now()) else null end
           where id = $1 returning id""",
        student_id,
        archived,
    )
    if updated is None:
        raise not_found("Studente non trovato.")
    return await get_student(conn, student_id)


async def delete_student(conn: Conn, student_id: uuid.UUID) -> None:
    await require_student(conn, student_id)
    in_use = await conn.fetchval(
        """select exists(select 1 from app.lessons where student_id = $1)
               or exists(select 1 from app.payments where student_id = $1)""",
        student_id,
    )
    if in_use:  # D-19
        raise conflict("Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.")
    await conn.execute("delete from app.students where id = $1", student_id)
