"""Lessons (D-11, D-13, D-16): CRUD, agenda range, duplicate."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import asyncpg

from app.core.errors import FieldError, invalid, not_found
from app.db.pool import Conn
from app.domain.common import (
    CALENDAR_JOIN,
    TutorClock,
    calendar_state,
    check_date_window,
    check_lesson_times,
    display_name,
    parse_range,
    raise_if,
    subject_ref,
)
from app.domain.students import require_student
from app.domain.subjects import subject_exists
from app.schemas import Lesson, LessonCreate, LessonDuplicate, LessonPatch, StudentRef

LESSON_SELECT = f"""
select l.id, l.student_id, s.first_name, s.last_name, l.subject_id, sj.name as subject_name,
       l.lesson_date, l.start_time, l.end_time, l.duration_minutes, l.hourly_rate_cents, l.amount_cents,
       l.topic, l.notes, l.gcal_event_id, l.created_at, l.updated_at,
       (l.lesson_date + l.end_time) <= (now() at time zone p.timezone) as settled,
       g.tutor_id is not null as cal_linked, ob.id as cal_pending_id, ob.last_error as cal_error
from app.lessons l
join app.students s on s.id = l.student_id
join app.profiles p on p.id = l.tutor_id
left join app.subjects sj on sj.id = l.subject_id
{CALENDAR_JOIN}
"""


def lesson_from_row(row: asyncpg.Record) -> Lesson:
    return Lesson(
        id=row["id"],
        student=StudentRef(
            id=row["student_id"], display_name=display_name(row["first_name"], row["last_name"])
        ),
        subject=subject_ref(row["subject_id"], row["subject_name"]),
        date=row["lesson_date"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        duration_minutes=row["duration_minutes"],
        hourly_rate_cents=row["hourly_rate_cents"],
        amount_cents=row["amount_cents"],
        topic=row["topic"],
        notes=row["notes"],
        settled=row["settled"],
        calendar=calendar_state(
            row["cal_linked"], row["cal_pending_id"], row["cal_error"], row["gcal_event_id"]
        ),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def get_lesson(conn: Conn, lesson_id: uuid.UUID) -> Lesson:
    row = await conn.fetchrow(f"{LESSON_SELECT} where l.id = $1", lesson_id)
    if row is None:
        raise not_found("Lezione non trovata.")
    return lesson_from_row(row)


async def list_lessons(
    conn: Conn, start: dt.date, end: dt.date, student_id: uuid.UUID | None = None
) -> list[Lesson]:
    parse_range(start, end)
    rows = await conn.fetch(
        f"""{LESSON_SELECT}
            where l.tutor_id = (select auth.uid()) and l.lesson_date between $1 and $2
              and ($3::uuid is null or l.student_id = $3)
            order by l.lesson_date, l.start_time, s.first_name""",
        start,
        end,
        student_id,
    )
    return [lesson_from_row(r) for r in rows]


async def _check_subject(conn: Conn, subject_id: uuid.UUID | None) -> None:
    if subject_id is not None and not await subject_exists(conn, subject_id):
        raise invalid("Materia non trovata.", "subject_id")


def _validate(day: dt.date, start: dt.time, end: dt.time, clock: TutorClock) -> None:
    errors: list[FieldError] = [*check_lesson_times(start, end), *check_date_window(day, clock.today)]
    raise_if(errors)


async def _insert(conn: Conn, values: dict[str, Any]) -> uuid.UUID:
    # A null hourly_rate_cents is filled from the rate history by the lessons_fill_rate trigger.
    lesson_id = await conn.fetchval(
        """insert into app.lessons
             (student_id, subject_id, lesson_date, start_time, end_time, hourly_rate_cents, topic, notes)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id""",
        values["student_id"],
        values["subject_id"],
        values["lesson_date"],
        values["start_time"],
        values["end_time"],
        values["hourly_rate_cents"],
        values["topic"],
        values["notes"],
    )
    assert isinstance(lesson_id, uuid.UUID)
    return lesson_id


async def create_lesson(conn: Conn, data: LessonCreate, clock: TutorClock) -> Lesson:
    student = await require_student(conn, data.student_id, "student_id")
    _validate(data.date, data.start_time, data.end_time, clock)
    # Omitted subject -> the student's default subject; an explicit null keeps it empty.
    subject_id = data.subject_id if "subject_id" in data.model_fields_set else student["default_subject_id"]
    await _check_subject(conn, subject_id)
    lesson_id = await _insert(
        conn,
        {
            "student_id": data.student_id,
            "subject_id": subject_id,
            "lesson_date": data.date,
            "start_time": data.start_time,
            "end_time": data.end_time,
            "hourly_rate_cents": data.hourly_rate_cents,
            "topic": data.topic,
            "notes": data.notes,
        },
    )
    return await get_lesson(conn, lesson_id)


_PATCH_COLUMNS = {
    "student_id": "student_id",
    "subject_id": "subject_id",
    "date": "lesson_date",
    "start_time": "start_time",
    "end_time": "end_time",
    "hourly_rate_cents": "hourly_rate_cents",
    "topic": "topic",
    "notes": "notes",
}


async def update_lesson(conn: Conn, lesson_id: uuid.UUID, patch: LessonPatch, clock: TutorClock) -> Lesson:
    current = await conn.fetchrow(
        "select lesson_date, start_time, end_time from app.lessons where id = $1 for update", lesson_id
    )
    if current is None:
        raise not_found("Lezione non trovata.")
    fields = patch.model_fields_set
    for required in ("student_id", "date", "start_time", "end_time", "hourly_rate_cents"):
        if required in fields and getattr(patch, required) is None:
            raise invalid("Campo obbligatorio.", required)
    if patch.student_id is not None:
        await require_student(conn, patch.student_id, "student_id")
    if "subject_id" in fields:
        await _check_subject(conn, patch.subject_id)

    day = patch.date or current["lesson_date"]
    start = patch.start_time or current["start_time"]
    end = patch.end_time or current["end_time"]
    errors = check_lesson_times(start, end)
    if "date" in fields:
        errors += check_date_window(day, clock.today)
    raise_if(errors)

    # D-16: changing the date never re-derives the rate; only an explicit hourly_rate_cents does.
    columns = [(col, getattr(patch, attr)) for attr, col in _PATCH_COLUMNS.items() if attr in fields]
    if columns:
        assignments = ", ".join(f"{col} = ${i}" for i, (col, _) in enumerate(columns, start=2))
        await conn.execute(
            f"update app.lessons set {assignments} where id = $1",
            lesson_id,
            *(value for _, value in columns),
        )
    return await get_lesson(conn, lesson_id)


async def delete_lesson(conn: Conn, lesson_id: uuid.UUID) -> None:
    deleted = await conn.fetchval("delete from app.lessons where id = $1 returning id", lesson_id)
    if deleted is None:
        raise not_found("Lezione non trovata.")


async def duplicate_lesson(
    conn: Conn, lesson_id: uuid.UUID, data: LessonDuplicate, clock: TutorClock
) -> Lesson:
    source = await conn.fetchrow(
        """select student_id, subject_id, lesson_date, start_time, end_time, hourly_rate_cents, topic, notes
           from app.lessons where id = $1""",
        lesson_id,
    )
    if source is None:
        raise not_found("Lezione non trovata.")
    student_id = data.student_id or source["student_id"]
    day = data.date or source["lesson_date"]
    if data.student_id is not None:
        await require_student(conn, student_id, "student_id")
    raise_if(check_date_window(day, clock.today))
    same_slot = student_id == source["student_id"] and day == source["lesson_date"]
    new_id = await _insert(
        conn,
        {
            "student_id": student_id,
            "subject_id": source["subject_id"],
            "lesson_date": day,
            "start_time": source["start_time"],
            "end_time": source["end_time"],
            # Another student or another day -> rate from that student's history at that date.
            "hourly_rate_cents": source["hourly_rate_cents"] if same_slot else None,
            "topic": source["topic"],
            "notes": source["notes"],
        },
    )
    return await get_lesson(conn, new_id)
