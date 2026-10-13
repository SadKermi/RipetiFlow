"""Activity history (D-18): append-only snapshots rendered as Italian summaries."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Mapping
from typing import Any

from app.core.errors import invalid
from app.db.pool import Conn
from app.domain.common import METHOD_LABELS, display_name, format_euro
from app.domain.students import require_student
from app.schemas import Activity, ActivityChange, ActivityPage

# Columns that are bookkeeping or derived from other columns: never shown as a change.
_IGNORED = {
    "id",
    "tutor_id",
    "created_at",
    "updated_at",
    "gcal_event_id",
    "gcal_synced_at",
    "duration_minutes",
}

_LABELS: dict[str, dict[str, str]] = {
    "lesson": {
        "student_id": "studente",
        "subject_id": "materia",
        "lesson_date": "data",
        "start_time": "inizio",
        "end_time": "fine",
        "hourly_rate_cents": "tariffa",
        "amount_cents": "importo",
        "topic": "argomento",
        "notes": "note",
    },
    "payment": {
        "student_id": "studente",
        "amount_cents": "importo",
        "paid_on": "data",
        "method": "metodo",
        "note": "nota",
    },
    "student": {
        "first_name": "nome",
        "last_name": "cognome",
        "school": "scuola",
        "grade": "classe",
        "email": "email",
        "phone": "telefono",
        "guardian_name": "genitore",
        "guardian_email": "email del genitore",
        "guardian_phone": "telefono del genitore",
        "notes": "note",
        "default_subject_id": "materia predefinita",
        "archived_at": "archiviato",
    },
    "student_rate": {"hourly_rate_cents": "tariffa", "effective_from": "decorrenza"},
}

_QUOTED = {"topic", "note", "first_name", "last_name", "school", "grade", "guardian_name"}
_HIDDEN_VALUES = {"notes"}  # long private text: only say that it changed


class _Lookup:
    def __init__(self, subjects: Mapping[str, str], students: Mapping[str, str]) -> None:
        self.subjects = subjects
        self.students = students


def _day(value: Any, ref_year: int) -> str:
    day = dt.date.fromisoformat(str(value))
    return day.strftime("%d/%m") if day.year == ref_year else day.strftime("%d/%m/%Y")


def _hhmm(value: Any) -> str:
    return str(value)[:5]


def _format(field: str, value: Any, lookup: _Lookup, ref_year: int) -> str | None:
    if value is None:
        return None
    if field == "hourly_rate_cents":
        return f"{format_euro(int(value))}/h"
    if field.endswith("_cents"):
        return format_euro(int(value))
    if field in ("lesson_date", "paid_on", "effective_from"):
        return _day(value, ref_year)
    if field in ("start_time", "end_time"):
        return _hhmm(value)
    if field == "method":
        return METHOD_LABELS.get(str(value), str(value))
    if field in ("subject_id", "default_subject_id"):
        return lookup.subjects.get(str(value), "materia eliminata")
    if field == "student_id":
        return lookup.students.get(str(value), "studente eliminato")
    if field == "archived_at":
        return "sì"
    text = str(value)
    return text if len(text) <= 120 else text[:119] + "…"


def _changes(
    entity: str, before: Mapping[str, Any], after: Mapping[str, Any], lookup: _Lookup, ref_year: int
) -> list[ActivityChange]:
    labels = _LABELS[entity]
    changes = []
    for field in labels:
        if field in _IGNORED or before.get(field) == after.get(field):
            continue
        changes.append(
            ActivityChange(
                field=field,
                before=_format(field, before.get(field), lookup, ref_year),
                after=_format(field, after.get(field), lookup, ref_year),
            )
        )
    return changes


def _change_text(entity: str, change: ActivityChange) -> str:
    label = _LABELS[entity][change.field]
    if change.field in _HIDDEN_VALUES:
        return f"{label} modificate"

    def show(value: str | None) -> str:
        if value is None:
            return "—"
        return f"«{value}»" if change.field in _QUOTED else value

    return f"{label} {show(change.before)} → {show(change.after)}"


def _lesson_summary(action: str, row: Mapping[str, Any], changes: list[ActivityChange], ref_year: int) -> str:
    when = _day(row["lesson_date"], ref_year)
    slot = f"{_hhmm(row['start_time'])}–{_hhmm(row['end_time'])}"
    if action == "insert":
        return f"Lezione del {when} registrata ({slot}, {format_euro(int(row['amount_cents']))})"
    if action == "delete":
        return f"Lezione del {when} eliminata ({slot}, {format_euro(int(row['amount_cents']))})"
    return f"Lezione del {when} modificata: " + ", ".join(_change_text("lesson", c) for c in changes)


def _payment_summary(
    action: str, row: Mapping[str, Any], changes: list[ActivityChange], ref_year: int
) -> str:
    when = _day(row["paid_on"], ref_year)
    amount = format_euro(int(row["amount_cents"]))
    method = METHOD_LABELS.get(str(row["method"]), str(row["method"]))
    if action == "insert":
        return f"Pagamento di {amount} del {when} registrato ({method})"
    if action == "delete":
        return f"Pagamento di {amount} del {when} eliminato"
    return f"Pagamento del {when} modificato: " + ", ".join(_change_text("payment", c) for c in changes)


def _student_summary(action: str, row: Mapping[str, Any], changes: list[ActivityChange], _: int) -> str:
    name = display_name(str(row["first_name"]), row.get("last_name"))
    if action == "insert":
        return f"Studente aggiunto: {name}"
    if action == "delete":
        return f"Studente eliminato: {name}"
    archive = next((c for c in changes if c.field == "archived_at"), None)
    others = [c for c in changes if c.field != "archived_at"]
    parts = []
    if archive is not None:
        parts.append("Studente archiviato" if archive.after else "Studente ripristinato")
    if others:
        parts.append(f"Scheda di {name} modificata: " + ", ".join(_change_text("student", c) for c in others))
    return " · ".join(parts) or f"Scheda di {name} modificata"


def _rate_summary(action: str, row: Mapping[str, Any], changes: list[ActivityChange], _: int) -> str:
    rate = f"{format_euro(int(row['hourly_rate_cents']))}/h"
    since = dt.date.fromisoformat(str(row["effective_from"])).strftime("%d/%m/%Y")
    if action == "insert":
        return f"Nuova tariffa: {rate} dal {since}"
    if action == "delete":
        return f"Tariffa di {rate} dal {since} eliminata"
    return "Tariffa modificata: " + ", ".join(_change_text("student_rate", c) for c in changes)


_SUMMARIES: dict[str, Callable[[str, Mapping[str, Any], list[ActivityChange], int], str]] = {
    "lesson": _lesson_summary,
    "payment": _payment_summary,
    "student": _student_summary,
    "student_rate": _rate_summary,
}


def build_activity(row: Mapping[str, Any], lookup: _Lookup, ref_year: int) -> Activity:
    entity, action = row["entity"], row["action"]
    before = row["before"] or {}
    after = row["after"] or {}
    changes = _changes(entity, before, after, lookup, ref_year) if action == "update" else []
    # For deletes the "before" snapshot describes the row; for the rest the "after" one does.
    subject_row = before if action == "delete" else after
    try:
        summary = _SUMMARIES[entity](action, subject_row, changes, ref_year)
    except (KeyError, ValueError, TypeError):
        summary = "Modifica registrata"
    return Activity(
        id=str(row["id"]),
        entity=entity,
        entity_id=row["entity_id"],
        action=action,
        source=row["source"],
        occurred_at=row["occurred_at"],
        summary=summary,
        changes=changes,
    )


async def student_activity(
    conn: Conn, student_id: uuid.UUID, limit: int = 50, before: str | None = None
) -> ActivityPage:
    await require_student(conn, student_id)
    cursor: int | None = None
    if before:
        try:
            cursor = int(before)
        except ValueError as exc:
            raise invalid("Cursore non valido.", "before") from exc
        # The cursor is an activity_log id (bigint): anything outside the range is not a real cursor.
        if not -(2**63) <= cursor < 2**63:
            raise invalid("Cursore non valido.", "before")
    # The log stores the student of the NEW row; a lesson or payment moved to another student must
    # still show in the history of the student it left (D-18: nothing disappears from the record).
    rows = await conn.fetch(
        """select id, entity, entity_id, action, before, after, source, occurred_at
           from app.activity_log
           where tutor_id = (select auth.uid())
             and (student_id = $1
                  or (entity in ('lesson', 'payment') and before ->> 'student_id' = $1::text))
             and ($2::bigint is null or id < $2)
           order by id desc limit $3""",
        student_id,
        cursor,
        limit + 1,
    )
    subjects = {
        str(r["id"]): r["name"]
        for r in await conn.fetch("select id, name from app.subjects where tutor_id = (select auth.uid())")
    }
    students = {
        str(r["id"]): display_name(r["first_name"], r["last_name"])
        for r in await conn.fetch(
            "select id, first_name, last_name from app.students where tutor_id = (select auth.uid())"
        )
    }
    lookup = _Lookup(subjects, students)
    ref_year = dt.date.today().year
    page = rows[:limit]
    items = [build_activity(dict(r), lookup, ref_year) for r in page]
    next_cursor = str(page[-1]["id"]) if len(rows) > limit and page else None
    return ActivityPage(items=items, next_cursor=next_cursor)
