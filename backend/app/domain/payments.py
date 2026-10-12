"""Payments (D-15): manual records only, consulted through the student ledger (D-20)."""

from __future__ import annotations

import uuid

import asyncpg

from app.core.errors import invalid, not_found
from app.db.pool import Conn
from app.domain.common import display_name
from app.domain.students import require_student
from app.schemas import Payment, PaymentCreate, PaymentPatch, StudentRef

_SELECT = """
select py.id, py.student_id, s.first_name, s.last_name, py.amount_cents, py.paid_on, py.method, py.note,
       py.created_at, py.updated_at
from app.payments py
join app.students s on s.id = py.student_id
"""


def _from_row(row: asyncpg.Record) -> Payment:
    return Payment(
        id=row["id"],
        student=StudentRef(
            id=row["student_id"], display_name=display_name(row["first_name"], row["last_name"])
        ),
        amount_cents=row["amount_cents"],
        paid_on=row["paid_on"],
        method=row["method"],
        note=row["note"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def get_payment(conn: Conn, payment_id: uuid.UUID) -> Payment:
    row = await conn.fetchrow(f"{_SELECT} where py.id = $1", payment_id)
    if row is None:
        raise not_found("Pagamento non trovato.")
    return _from_row(row)


async def create_payment(conn: Conn, data: PaymentCreate) -> Payment:
    await require_student(conn, data.student_id, "student_id")
    payment_id = await conn.fetchval(
        """insert into app.payments (student_id, amount_cents, paid_on, method, note)
           values ($1, $2, $3, $4, $5) returning id""",
        data.student_id,
        data.amount_cents,
        data.paid_on,
        data.method,
        data.note,
    )
    return await get_payment(conn, payment_id)


async def update_payment(conn: Conn, payment_id: uuid.UUID, patch: PaymentPatch) -> Payment:
    await get_payment(conn, payment_id)
    fields = patch.model_fields_set
    columns = [c for c in ("student_id", "amount_cents", "paid_on", "method", "note") if c in fields]
    for required in ("student_id", "amount_cents", "paid_on", "method"):
        if required in columns and getattr(patch, required) is None:
            raise invalid("Campo obbligatorio.", required)
    if patch.student_id is not None:
        await require_student(conn, patch.student_id, "student_id")
    if columns:
        assignments = ", ".join(f"{col} = ${i}" for i, col in enumerate(columns, start=2))
        await conn.execute(
            f"update app.payments set {assignments} where id = $1",
            payment_id,
            *(getattr(patch, c) for c in columns),
        )
    return await get_payment(conn, payment_id)


async def delete_payment(conn: Conn, payment_id: uuid.UUID) -> None:
    deleted = await conn.fetchval("delete from app.payments where id = $1 returning id", payment_id)
    if deleted is None:
        raise not_found("Pagamento non trovato.")
