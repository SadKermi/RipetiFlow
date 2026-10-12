"""Hourly rate history and repricing (D-16).

Repricing rule: when a rate with date D is added, the lessons it may reprice are those dated in
[D, next rate's date) whose stored rate equals the rate the history gave them so far. Lessons with
a rate typed by hand (discounts, double lessons) are never touched, and lessons governed by a later
rate keep it.
"""

from __future__ import annotations

import datetime as dt
import uuid

from app.core.errors import invalid, not_found
from app.db.pool import Conn
from app.schemas import Rate, RateCreate, RateCreated, RateInput, RatePreview

_AFFECTED = """
select l.id, l.amount_cents,
       round($2::numeric * l.duration_minutes / 60)::integer as new_amount_cents
from app.lessons l
where l.student_id = $1
  and l.lesson_date >= $3
  and l.lesson_date < coalesce(
        (select min(r.effective_from) from app.student_rates r
          where r.student_id = $1 and r.effective_from > $3),
        'infinity'::date)
  and l.hourly_rate_cents = app.rate_for(l.student_id, l.lesson_date)
  and l.hourly_rate_cents <> $2
"""


async def _require_student(conn: Conn, student_id: uuid.UUID) -> None:
    if not await conn.fetchval("select exists(select 1 from app.students where id = $1)", student_id):
        raise not_found("Studente non trovato.")


async def list_rates(conn: Conn, student_id: uuid.UUID) -> list[Rate]:
    rows = await conn.fetch(
        """select id, hourly_rate_cents, effective_from, created_at from app.student_rates
           where student_id = $1 order by effective_from desc""",
        student_id,
    )
    return [Rate.model_validate(dict(r)) for r in rows]


async def list_student_rates(conn: Conn, student_id: uuid.UUID) -> list[Rate]:
    await _require_student(conn, student_id)
    return await list_rates(conn, student_id)


async def preview_rate(conn: Conn, student_id: uuid.UUID, data: RateInput) -> RatePreview:
    await _require_student(conn, student_id)
    rows = await conn.fetch(_AFFECTED, student_id, data.hourly_rate_cents, data.effective_from)
    current = sum(int(r["amount_cents"]) for r in rows)
    new = sum(int(r["new_amount_cents"]) for r in rows)
    return RatePreview(
        affected_lessons=len(rows),
        current_total_cents=current,
        new_total_cents=new,
        delta_cents=new - current,
    )


async def create_rate(conn: Conn, student_id: uuid.UUID, data: RateCreate) -> RateCreated:
    await _require_student(conn, student_id)
    # Select the lessons to reprice BEFORE inserting: rate_for() must still return the old rate.
    affected: list[uuid.UUID] = []
    if data.reprice_existing:
        rows = await conn.fetch(_AFFECTED, student_id, data.hourly_rate_cents, data.effective_from)
        affected = [r["id"] for r in rows]
    row = await conn.fetchrow(
        """insert into app.student_rates (student_id, hourly_rate_cents, effective_from)
           values ($1, $2, $3) returning id, hourly_rate_cents, effective_from, created_at""",
        student_id,
        data.hourly_rate_cents,
        data.effective_from,
    )
    assert row is not None
    if affected:
        await conn.execute(
            "update app.lessons set hourly_rate_cents = $1 where id = any($2::uuid[])",
            data.hourly_rate_cents,
            affected,
        )
    return RateCreated(rate=Rate.model_validate(dict(row)), repriced_lessons=len(affected))


async def delete_rate(conn: Conn, student_id: uuid.UUID, rate_id: uuid.UUID) -> None:
    await _require_student(conn, student_id)
    count = await conn.fetchval("select count(*) from app.student_rates where student_id = $1", student_id)
    exists = await conn.fetchval(
        "select exists(select 1 from app.student_rates where id = $1 and student_id = $2)",
        rate_id,
        student_id,
    )
    if not exists:
        raise not_found("Tariffa non trovata.")
    if count <= 1:
        raise invalid("Non puoi eliminare l'unica tariffa dello studente.", "rate_id")
    await conn.execute("delete from app.student_rates where id = $1", rate_id)


async def rate_for(conn: Conn, student_id: uuid.UUID, day: dt.date) -> int | None:
    value = await conn.fetchval("select app.rate_for($1, $2)", student_id, day)
    return int(value) if value is not None else None
