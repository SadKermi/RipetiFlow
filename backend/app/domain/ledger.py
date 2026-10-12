"""Libro mastro (D-18) and CSV export (D-24)."""

from __future__ import annotations

import csv
import datetime as dt
import io
import uuid
from collections.abc import Sequence
from typing import Literal

import asyncpg

from app.db.pool import Conn
from app.domain.common import (
    CALENDAR_JOIN,
    METHOD_LABELS,
    balance_from_row,
    calendar_state,
    display_name,
    format_date_it,
    format_decimal_it,
    subject_ref,
)
from app.domain.students import STUDENT_SELECT, require_student
from app.schemas import Ledger, LedgerEntry

LEDGER_SELECT = f"""
select e.kind, e.entry_id, e.student_id, e.entry_date, e.start_time, e.end_time, e.duration_minutes,
       e.hourly_rate_cents, e.subject_id, e.subject_name, e.topic, e.method, e.note,
       e.debit_cents, e.credit_cents, e.settled, e.running_balance_cents, e.created_at,
       l.gcal_event_id, g.tutor_id is not null as cal_linked,
       ob.id as cal_pending_id, ob.last_error as cal_error
from app.ledger_entries e
left join app.lessons l on e.kind = 'lesson' and l.id = e.entry_id
{CALENDAR_JOIN}
"""

_ORDER_ASC = "e.entry_date, coalesce(e.start_time, time '23:59:59'), e.created_at, e.entry_id"
_ORDER_DESC = (
    "e.entry_date desc, coalesce(e.start_time, time '23:59:59') desc, e.created_at desc, e.entry_id desc"
)


def _entry_from_row(row: asyncpg.Record) -> LedgerEntry:
    is_lesson = row["kind"] == "lesson"
    return LedgerEntry(
        kind=row["kind"],
        id=row["entry_id"],
        date=row["entry_date"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        duration_minutes=row["duration_minutes"],
        hourly_rate_cents=row["hourly_rate_cents"],
        subject=subject_ref(row["subject_id"], row["subject_name"]),
        topic=row["topic"],
        method=row["method"],
        note=row["note"],
        debit_cents=row["debit_cents"],
        credit_cents=row["credit_cents"],
        settled=row["settled"],
        running_balance_cents=row["running_balance_cents"],
        calendar=(
            calendar_state(row["cal_linked"], row["cal_pending_id"], row["cal_error"], row["gcal_event_id"])
            if is_lesson
            else None
        ),
    )


async def _ledger_rows(
    conn: Conn,
    student_id: uuid.UUID | None,
    start: dt.date | None,
    end: dt.date | None,
    order: Literal["asc", "desc"],
) -> list[asyncpg.Record]:
    # Date filters run on top of the view: the window (running balance) is computed over the whole
    # history first, because Postgres only pushes partition-key (student_id) predicates below it.
    return await conn.fetch(
        f"""{LEDGER_SELECT}
            where e.tutor_id = (select auth.uid())
              and ($1::uuid is null or e.student_id = $1)
              and ($2::date is null or e.entry_date >= $2)
              and ($3::date is null or e.entry_date <= $3)
            order by {_ORDER_ASC if order == "asc" else _ORDER_DESC}""",
        student_id,
        start,
        end,
    )


async def student_ledger(
    conn: Conn,
    student_id: uuid.UUID,
    start: dt.date | None = None,
    end: dt.date | None = None,
    order: Literal["asc", "desc"] = "desc",
) -> Ledger:
    await require_student(conn, student_id)
    rows = await _ledger_rows(conn, student_id, start, end, order)
    balance_row = await conn.fetchrow(f"{STUDENT_SELECT} where s.id = $1", student_id)
    assert balance_row is not None
    return Ledger(items=[_entry_from_row(r) for r in rows], balance=balance_from_row(balance_row))


# ---------------------------------------------------------------------------------------------
# CSV (Italian Excel: ';' separator, comma decimals, UTF-8 BOM)
# ---------------------------------------------------------------------------------------------

_HEADER = [
    "Data",
    "Tipo",
    "Descrizione",
    "Inizio",
    "Fine",
    "Durata (min)",
    "Tariffa oraria (€)",
    "Dare (€)",
    "Avere (€)",
    "Saldo (€)",
    "Stato",
]


def _safe_text(value: str | None) -> str:
    """Neutralise spreadsheet formulas in user-typed text (CSV injection)."""
    if not value:
        return ""
    return f"'{value}" if value[0] in "=+-@\t\r" else value


def _description(row: asyncpg.Record) -> str:
    if row["kind"] == "lesson":
        parts = ["Lezione", row["subject_name"], row["topic"]]
    else:
        parts = ["Pagamento", METHOD_LABELS.get(row["method"], row["method"]), row["note"]]
    return " · ".join(p for p in parts if p)


def _csv_row(row: asyncpg.Record) -> list[str]:
    is_lesson = row["kind"] == "lesson"
    state = ("Svolta" if row["settled"] else "Programmata") if is_lesson else "Ricevuto"
    return [
        format_date_it(row["entry_date"]),
        "Lezione" if is_lesson else "Pagamento",
        _safe_text(_description(row)),
        row["start_time"].strftime("%H:%M") if row["start_time"] else "",
        row["end_time"].strftime("%H:%M") if row["end_time"] else "",
        str(row["duration_minutes"]) if row["duration_minutes"] is not None else "",
        format_decimal_it(row["hourly_rate_cents"]) if row["hourly_rate_cents"] is not None else "",
        format_decimal_it(row["debit_cents"]) if row["debit_cents"] else "",
        format_decimal_it(row["credit_cents"]) if row["credit_cents"] else "",
        format_decimal_it(row["running_balance_cents"]),
        state,
    ]


def render_csv(header: Sequence[str], rows: Sequence[Sequence[str]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    return ("﻿" + buffer.getvalue()).encode("utf-8")


async def student_ledger_csv(conn: Conn, student_id: uuid.UUID) -> tuple[str, bytes]:
    student = await require_student(conn, student_id)
    rows = await _ledger_rows(conn, student_id, None, None, "asc")
    name = display_name(student["first_name"], student["last_name"])
    return name, render_csv(_HEADER, [_csv_row(r) for r in rows])


async def full_ledger_csv(conn: Conn) -> bytes:
    names = {
        r["id"]: display_name(r["first_name"], r["last_name"])
        for r in await conn.fetch(
            "select id, first_name, last_name from app.students where tutor_id = (select auth.uid())"
        )
    }
    rows = await _ledger_rows(conn, None, None, None, "asc")
    ordered = sorted(rows, key=lambda r: (names.get(r["student_id"], "").lower(), str(r["student_id"])))
    return render_csv(
        ["Studente", *_HEADER],
        [[_safe_text(names.get(r["student_id"], "")), *_csv_row(r)] for r in ordered],
    )
