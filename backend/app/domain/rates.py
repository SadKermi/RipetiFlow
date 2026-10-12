"""Hourly rate history and repricing (D-16).

Repricing rule: a rate with date D governs the lessons dated in [D, next rate's date). When it is
added (or deleted) with `reprice_existing`, the lessons of that window that follow the history
(`rate_overridden = false`, decided by the DB when the rate was written) take the new history rate.
Lessons with a rate typed by hand (discounts, double lessons) are never touched.
"""

from __future__ import annotations

import datetime as dt
import uuid

from app.core.errors import invalid, not_found
from app.db.pool import Conn
from app.schemas import Rate, RateCreate, RateCreated, RateInput, RatePreview

# $1 student, $2 new rate (cents), $3 window start. The window ends at the next rate's date.
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
  and not l.rate_overridden
  and l.hourly_rate_cents <> $2
"""


async def _require_student(conn: Conn, student_id: uuid.UUID, *, lock: bool = False) -> None:
    # `for update` serialises concurrent rate changes of the same student (e.g. two deletions).
    query = "select 1 from app.students where id = $1" + (" for update" if lock else "")
    if await conn.fetchval(query, student_id) is None:
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
    await _require_student(conn, student_id, lock=True)
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
        # Equal to the history rate after the insert, so the trigger keeps rate_overridden false.
        await conn.execute(
            "update app.lessons set hourly_rate_cents = $1 where id = any($2::uuid[])",
            data.hourly_rate_cents,
            affected,
        )
    return RateCreated(rate=Rate.model_validate(dict(row)), repriced_lessons=len(affected))


async def delete_rate(
    conn: Conn, student_id: uuid.UUID, rate_id: uuid.UUID, *, reprice_existing: bool = False
) -> int:
    """Delete a rate; with `reprice_existing` the lessons it governed go back to the history rate.

    Returns the number of repriced lessons.
    """
    await _require_student(conn, student_id, lock=True)
    rate = await conn.fetchrow(
        "select effective_from from app.student_rates where id = $1 and student_id = $2",
        rate_id,
        student_id,
    )
    if rate is None:
        raise not_found("Tariffa non trovata.")
    count = await conn.fetchval("select count(*) from app.student_rates where student_id = $1", student_id)
    if count <= 1:
        raise invalid("Non puoi eliminare l'unica tariffa dello studente.", "rate_id")
    window_end = await conn.fetchval(
        """select min(effective_from) from app.student_rates
           where student_id = $1 and effective_from > $2""",
        student_id,
        rate["effective_from"],
    )
    await conn.execute("delete from app.student_rates where id = $1", rate_id)
    if not reprice_existing:
        return 0
    status = await conn.execute(
        """update app.lessons set hourly_rate_cents = app.rate_for(student_id, lesson_date)
           where student_id = $1 and not rate_overridden
             and lesson_date >= $2 and lesson_date < coalesce($3::date, 'infinity'::date)
             and hourly_rate_cents <> app.rate_for(student_id, lesson_date)""",
        student_id,
        rate["effective_from"],
        window_end,
    )
    return int(status.split()[-1])


async def rate_for(conn: Conn, student_id: uuid.UUID, day: dt.date) -> int | None:
    value = await conn.fetchval("select app.rate_for($1, $2)", student_id, day)
    return int(value) if value is not None else None
