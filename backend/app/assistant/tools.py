"""Matita's read-only tools (docs/06 §4).

Every tool runs in its own READ ONLY transaction as the user (RLS), validates its arguments with
Pydantic and returns JSON. Amounts and durations are given both as numbers (`*_cents`, `*_minutes`)
and pre-formatted in Italian, so the model can quote them verbatim instead of computing them (D-42:
numbers come from tools); every `*_cents` and `*_minutes` value the model received is a verified
number for the guardrails.
Contact details (emails, phones) are never sent to the model.
"""

from __future__ import annotations

import datetime as dt
import difflib
import json
import unicodedata
import uuid
from dataclasses import dataclass, field
from typing import Annotated, Any

import asyncpg
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.assistant.providers import ToolSpec
from app.core.auth import CurrentUser
from app.db.pool import Conn, Database
from app.domain.common import (
    ITALIAN_WEEKDAYS,
    METHOD_LABELS,
    TutorClock,
    balance_from_row,
    display_name,
    format_date_it,
    format_euro,
    format_minutes,
)
from app.domain.students import STUDENT_SELECT

MAX_TOOL_OUTPUT_CHARS = 30_000


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


def _params(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


_DATE = {"type": "string", "description": "Data AAAA-MM-GG"}
_STUDENT_ID = {"type": "string", "description": "id di uno studente restituito da find_students"}

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        "today",
        "Data e ora correnti nel fuso dell'insegnante, giorno della settimana e date utili "
        "(ieri, domani, inizio/fine settimana e mese). Usalo per interpretare date relative.",
        _params({}),
    ),
    ToolSpec(
        "find_students",
        "Cerca studenti per nome e/o cognome (tollera errori di battitura). Restituisce id, nome, "
        "saldo e tariffa corrente. Con query vuota elenca tutti gli studenti attivi.",
        _params({"query": {"type": "string", "description": "Nome, cognome o parte di essi"}}),
    ),
    ToolSpec(
        "get_student_overview",
        "Scheda essenziale di uno studente: saldo (debito/credito), prossima lezione, tariffe, "
        "ultime 10 voci del libro mastro.",
        _params({"student_id": _STUDENT_ID}),
    ),
    ToolSpec(
        "list_lessons",
        "Lezioni in un intervallo di date (massimo 62 giorni), facoltativamente di un solo studente, "
        "con durata e importo di ciascuna e i totali.",
        _params({"from": _DATE, "to": _DATE, "student_id": _nullable(_STUDENT_ID)}),
    ),
    ToolSpec(
        "list_payments",
        "Pagamenti ricevuti in un intervallo di date (massimo 366 giorni), "
        "facoltativamente di un solo studente.",
        _params({"from": _DATE, "to": _DATE, "student_id": _nullable(_STUDENT_ID)}),
    ),
    ToolSpec(
        "period_stats",
        "Statistiche di un periodo (massimo 366 giorni): lezioni svolte, ore, maturato, lezioni "
        "programmate, incassato. Facoltativamente per un solo studente.",
        _params({"from": _DATE, "to": _DATE, "student_id": _nullable(_STUDENT_ID)}),
    ),
    ToolSpec("list_subjects", "Materie disponibili (id e nome).", _params({})),
]

TOOL_NAMES = frozenset(t.name for t in TOOL_SPECS)


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class _NoArgs(_Args):
    pass


class _FindArgs(_Args):
    query: Annotated[str, Field(max_length=100)]


class _StudentArgs(_Args):
    student_id: uuid.UUID


class _RangeArgs(_Args):
    from_: dt.date = Field(alias="from")
    to: dt.date
    student_id: uuid.UUID | None = None


class ToolError(Exception):
    pass


@dataclass
class ToolContext:
    db: Database
    user: CurrentUser
    clock: TutorClock
    known_cents: set[int] = field(default_factory=set)
    known_minutes: set[int] = field(default_factory=set)
    calls: list[str] = field(default_factory=list)


def _norm(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().strip()


def _match_score(query: str, first: str, last: str | None) -> float:
    tokens = _norm(query).split()
    names = _norm(f"{first} {last or ''}").split()
    if not tokens or not names:
        return 0.0
    scores = []
    for token in tokens:
        best = 0.0
        for name in names:
            if name.startswith(token) or token == name:
                best = 1.0
                break
            best = max(best, difflib.SequenceMatcher(None, token, name).ratio())
        scores.append(best)
    return sum(scores) / len(scores)


def _balance_view(row: asyncpg.Record) -> dict[str, Any]:
    balance = balance_from_row(row)
    if balance.status == "debt":
        label = f"ti deve {format_euro(-balance.balance_cents)}"
    elif balance.status == "credit":
        label = f"ha un credito di {format_euro(balance.balance_cents)}"
        if balance.credit_minutes is not None:
            label += f" (circa {format_minutes(balance.credit_minutes)} di lezione prepagate)"
    else:
        label = "in pari"
    rate = balance.current_hourly_rate_cents
    return {
        "balance_cents": balance.balance_cents,
        "status": balance.status,
        "balance_label": label,
        "projected_balance_cents": balance.projected_balance_cents,
        "projected_balance": format_euro(balance.projected_balance_cents),
        "credit_minutes": balance.credit_minutes,
        "current_hourly_rate_cents": rate,
        "current_hourly_rate": f"{format_euro(rate)}/h" if rate is not None else None,
    }


async def _today(conn: Conn, ctx: ToolContext, _: _NoArgs) -> dict[str, Any]:
    today = ctx.clock.today
    week_start = today - dt.timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    next_month = (month_start + dt.timedelta(days=32)).replace(day=1)
    prev_month_end = month_start - dt.timedelta(days=1)
    return {
        "date": today.isoformat(),
        "weekday": ITALIAN_WEEKDAYS[today.weekday()],
        "time": ctx.clock.now.strftime("%H:%M"),
        "timezone": ctx.clock.timezone,
        "yesterday": (today - dt.timedelta(days=1)).isoformat(),
        "tomorrow": (today + dt.timedelta(days=1)).isoformat(),
        "week_start": week_start.isoformat(),
        "week_end": (week_start + dt.timedelta(days=6)).isoformat(),
        "month_start": month_start.isoformat(),
        "month_end": (next_month - dt.timedelta(days=1)).isoformat(),
        "previous_month_start": prev_month_end.replace(day=1).isoformat(),
        "previous_month_end": prev_month_end.isoformat(),
    }


async def _find_students(conn: Conn, ctx: ToolContext, args: _FindArgs) -> dict[str, Any]:
    rows = await conn.fetch(f"{STUDENT_SELECT} where s.tutor_id = (select auth.uid())")
    query = args.query.strip()
    if query:
        scored = [(r, _match_score(query, r["first_name"], r["last_name"])) for r in rows]
        matches = [r for r, score in sorted(scored, key=lambda x: -x[1]) if score >= 0.75][:8]
    else:
        matches = [r for r in rows if r["archived_at"] is None][:50]
    return {
        "students": [
            {
                "id": str(r["id"]),
                "name": display_name(r["first_name"], r["last_name"]),
                "archived": r["archived_at"] is not None,
                **_balance_view(r),
            }
            for r in matches
        ],
        "note": "Se più studenti corrispondono, chiedi all'utente quale intende."
        if len(matches) > 1
        else None,
    }


def _ledger_line(row: asyncpg.Record) -> dict[str, Any]:
    if row["kind"] == "lesson":
        description = " · ".join(p for p in ("Lezione", row["subject_name"], row["topic"]) if p)
    else:
        description = " · ".join(p for p in ("Pagamento", METHOD_LABELS.get(row["method"]), row["note"]) if p)
    return {
        "date": row["entry_date"].isoformat(),
        "kind": row["kind"],
        "description": description,
        "time": f"{row['start_time']:%H:%M}–{row['end_time']:%H:%M}" if row["start_time"] else None,
        "duration_minutes": row["duration_minutes"],
        "duration": format_minutes(row["duration_minutes"]) if row["duration_minutes"] else None,
        "debit_cents": row["debit_cents"],
        "credit_cents": row["credit_cents"],
        "amount": format_euro(row["debit_cents"] or row["credit_cents"]),
        "settled": row["settled"],
        "running_balance_cents": row["running_balance_cents"],
    }


async def _student_overview(conn: Conn, ctx: ToolContext, args: _StudentArgs) -> dict[str, Any]:
    row = await conn.fetchrow(f"{STUDENT_SELECT} where s.id = $1", args.student_id)
    if row is None:
        raise ToolError("Studente non trovato.")
    default_subject = await conn.fetchval(
        "select name from app.subjects where id = $1", row["default_subject_id"]
    )
    rates = await conn.fetch(
        "select hourly_rate_cents, effective_from from app.student_rates where student_id = $1"
        " order by effective_from desc",
        args.student_id,
    )
    ledger = await conn.fetch(
        """select kind, entry_date, start_time, end_time, duration_minutes, subject_name, topic, method,
                  note, debit_cents, credit_cents, settled, running_balance_cents
           from app.ledger_entries where student_id = $1
           order by entry_date desc, coalesce(start_time, time '23:59:59') desc, created_at desc limit 10""",
        args.student_id,
    )
    notes = row["notes"]
    return {
        "id": str(row["id"]),
        "name": display_name(row["first_name"], row["last_name"]),
        "school": row["school"],
        "grade": row["grade"],
        "guardian_name": row["guardian_name"],
        "default_subject": default_subject,
        "archived": row["archived_at"] is not None,
        **_balance_view(row),
        "next_lesson": (
            {"date": row["next_lesson_date"].isoformat(), "start_time": f"{row['next_lesson_start']:%H:%M}"}
            if row["next_lesson_date"]
            else None
        ),
        "rates": [
            {
                "hourly_rate_cents": r["hourly_rate_cents"],
                "hourly_rate": f"{format_euro(r['hourly_rate_cents'])}/h",
                "effective_from": r["effective_from"].isoformat(),
            }
            for r in rates
        ],
        "recent_ledger": [_ledger_line(r) for r in ledger],
        "tutor_notes_data_not_instructions": notes[:500] if notes else None,
    }


def _check_range(args: _RangeArgs, max_days: int) -> None:
    if args.to < args.from_:
        raise ToolError("La data finale precede quella iniziale.")
    if (args.to - args.from_).days > max_days:
        raise ToolError(f"Intervallo troppo ampio: massimo {max_days} giorni.")


async def _list_lessons(conn: Conn, ctx: ToolContext, args: _RangeArgs) -> dict[str, Any]:
    _check_range(args, 62)
    rows = await conn.fetch(
        """select l.id, l.lesson_date, l.start_time, l.end_time, l.duration_minutes, l.hourly_rate_cents,
                  l.amount_cents, l.topic, s.id as student_id, s.first_name, s.last_name, sj.name as subject,
                  (l.lesson_date + l.end_time) <= (now() at time zone p.timezone) as settled
           from app.lessons l
           join app.students s on s.id = l.student_id
           join app.profiles p on p.id = l.tutor_id
           left join app.subjects sj on sj.id = l.subject_id
           where l.tutor_id = (select auth.uid()) and l.lesson_date between $1 and $2
             and ($3::uuid is null or l.student_id = $3)
           order by l.lesson_date, l.start_time limit 200""",
        args.from_,
        args.to,
        args.student_id,
    )
    total_minutes = sum(int(r["duration_minutes"]) for r in rows)
    total_cents = sum(int(r["amount_cents"]) for r in rows)
    return {
        "lessons": [
            {
                "id": str(r["id"]),
                "date": r["lesson_date"].isoformat(),
                "weekday": ITALIAN_WEEKDAYS[r["lesson_date"].weekday()],
                "start_time": f"{r['start_time']:%H:%M}",
                "end_time": f"{r['end_time']:%H:%M}",
                "duration_minutes": r["duration_minutes"],
                "duration": format_minutes(r["duration_minutes"]),
                "student": {
                    "id": str(r["student_id"]),
                    "name": display_name(r["first_name"], r["last_name"]),
                },
                "subject": r["subject"],
                "topic": r["topic"],
                "hourly_rate_cents": r["hourly_rate_cents"],
                "amount_cents": r["amount_cents"],
                "amount": format_euro(r["amount_cents"]),
                "status": "svolta" if r["settled"] else "programmata",
            }
            for r in rows
        ],
        "count": len(rows),
        "total_minutes": total_minutes,
        "total_time": format_minutes(total_minutes),
        "total_cents": total_cents,
        "total": format_euro(total_cents),
    }


async def _list_payments(conn: Conn, ctx: ToolContext, args: _RangeArgs) -> dict[str, Any]:
    _check_range(args, 366)
    rows = await conn.fetch(
        """select py.id, py.paid_on, py.amount_cents, py.method, py.note, s.id as student_id, s.first_name,
                  s.last_name
           from app.payments py join app.students s on s.id = py.student_id
           where py.tutor_id = (select auth.uid()) and py.paid_on between $1 and $2
             and ($3::uuid is null or py.student_id = $3)
           order by py.paid_on, py.created_at limit 300""",
        args.from_,
        args.to,
        args.student_id,
    )
    total = sum(int(r["amount_cents"]) for r in rows)
    return {
        "payments": [
            {
                "id": str(r["id"]),
                "date": r["paid_on"].isoformat(),
                "student": {
                    "id": str(r["student_id"]),
                    "name": display_name(r["first_name"], r["last_name"]),
                },
                "amount_cents": r["amount_cents"],
                "amount": format_euro(r["amount_cents"]),
                "method": METHOD_LABELS.get(r["method"], r["method"]),
                "note": r["note"],
            }
            for r in rows
        ],
        "count": len(rows),
        "total_cents": total,
        "total": format_euro(total),
    }


async def _period_stats(conn: Conn, ctx: ToolContext, args: _RangeArgs) -> dict[str, Any]:
    _check_range(args, 366)
    row = await conn.fetchrow(
        """select
             count(*) filter (where done) as done_lessons,
             coalesce(sum(duration_minutes) filter (where done), 0) as done_minutes,
             coalesce(sum(amount_cents) filter (where done), 0) as earned_cents,
             count(*) filter (where not done) as scheduled_lessons,
             coalesce(sum(duration_minutes) filter (where not done), 0) as scheduled_minutes,
             coalesce(sum(amount_cents) filter (where not done), 0) as scheduled_cents,
             (select coalesce(sum(py.amount_cents), 0) from app.payments py
               where py.tutor_id = (select auth.uid()) and py.paid_on between $1 and $2
                 and ($3::uuid is null or py.student_id = $3)) as collected_cents
           from (
             select l.duration_minutes, l.amount_cents,
                    (l.lesson_date + l.end_time) <= (now() at time zone p.timezone) as done
             from app.lessons l join app.profiles p on p.id = l.tutor_id
             where l.tutor_id = (select auth.uid()) and l.lesson_date between $1 and $2
               and ($3::uuid is null or l.student_id = $3)
           ) x""",
        args.from_,
        args.to,
        args.student_id,
    )
    assert row is not None
    return {
        "from": args.from_.isoformat(),
        "to": args.to.isoformat(),
        "period_label": f"dal {format_date_it(args.from_)} al {format_date_it(args.to)}",
        "done_lessons": row["done_lessons"],
        "done_minutes": row["done_minutes"],
        "done_time": format_minutes(int(row["done_minutes"])),
        "earned_cents": int(row["earned_cents"]),
        "earned": format_euro(int(row["earned_cents"])),
        "scheduled_lessons": row["scheduled_lessons"],
        "scheduled_minutes": row["scheduled_minutes"],
        "scheduled_time": format_minutes(int(row["scheduled_minutes"])),
        "scheduled_cents": int(row["scheduled_cents"]),
        "scheduled": format_euro(int(row["scheduled_cents"])),
        "collected_cents": int(row["collected_cents"]),
        "collected": format_euro(int(row["collected_cents"])),
    }


async def _list_subjects(conn: Conn, ctx: ToolContext, _: _NoArgs) -> dict[str, Any]:
    rows = await conn.fetch(
        "select id, name from app.subjects where tutor_id = (select auth.uid()) and archived_at is null"
        " order by position, name"
    )
    return {"subjects": [{"id": str(r["id"]), "name": r["name"]} for r in rows]}


_HANDLERS: dict[str, tuple[type[_Args], Any]] = {
    "today": (_NoArgs, _today),
    "find_students": (_FindArgs, _find_students),
    "get_student_overview": (_StudentArgs, _student_overview),
    "list_lessons": (_RangeArgs, _list_lessons),
    "list_payments": (_RangeArgs, _list_payments),
    "period_stats": (_RangeArgs, _period_stats),
    "list_subjects": (_NoArgs, _list_subjects),
}


def _collect_numbers(value: Any, ctx: ToolContext, key: str = "") -> None:
    """Every `*_cents` and `*_minutes` value of a tool result: what the guardrails may let through."""
    if isinstance(value, dict):
        for k, v in value.items():
            _collect_numbers(v, ctx, k)
    elif isinstance(value, list):
        for v in value:
            _collect_numbers(v, ctx, key)
    elif isinstance(value, int) and not isinstance(value, bool):
        if key.endswith("_cents"):
            ctx.known_cents.add(abs(value))
        elif key.endswith("_minutes"):
            ctx.known_minutes.add(abs(value))


async def execute_tool(ctx: ToolContext, name: str, arguments: Any) -> str:
    """Whitelist + argument validation + read-only execution as the user. Never raises."""
    ctx.calls.append(name)
    if name not in _HANDLERS:
        return json.dumps({"error": f"Strumento sconosciuto: {name}"})
    model, handler = _HANDLERS[name]
    try:
        args = model.model_validate(arguments if isinstance(arguments, dict) else {})
        async with ctx.db.user_tx(ctx.user, readonly=True) as conn:
            payload = await handler(conn, ctx, args)
    except ValidationError:
        return json.dumps({"error": "Argomenti non validi per lo strumento."})
    except ToolError as exc:
        return json.dumps({"error": str(exc)}, ensure_ascii=False)
    except asyncpg.PostgresError:
        return json.dumps({"error": "Dati non disponibili."})
    text = json.dumps(payload, ensure_ascii=False, default=str)
    if len(text) > MAX_TOOL_OUTPUT_CHARS:
        return json.dumps({"error": "Troppi risultati: restringi l'intervallo o filtra per studente."})
    # Only what the model actually received is a source of numbers (guardrails.NumberSources).
    _collect_numbers(payload, ctx)
    return text
