"""Subjects per tutor (D-14)."""

from __future__ import annotations

import uuid

from app.core.errors import not_found
from app.db.pool import Conn
from app.schemas import Subject, SubjectCreate, SubjectPatch

_COLUMNS = "id, name, position, archived_at is not null as archived"


async def list_subjects(conn: Conn, include_archived: bool = False) -> list[Subject]:
    rows = await conn.fetch(
        f"""select {_COLUMNS} from app.subjects
            where tutor_id = (select auth.uid()) and ($1 or archived_at is null)
            order by position, lower(name)""",
        include_archived,
    )
    return [Subject.model_validate(dict(r)) for r in rows]


async def get_subject(conn: Conn, subject_id: uuid.UUID) -> Subject:
    row = await conn.fetchrow(f"select {_COLUMNS} from app.subjects where id = $1", subject_id)
    if row is None:
        raise not_found("Materia non trovata.")
    return Subject.model_validate(dict(row))


async def create_subject(conn: Conn, data: SubjectCreate) -> Subject:
    row = await conn.fetchrow(
        f"""insert into app.subjects (name, position)
            values ($1, (select coalesce(max(position), 0) + 1 from app.subjects
                         where tutor_id = (select auth.uid())))
            returning {_COLUMNS}""",
        data.name,
    )
    assert row is not None
    return Subject.model_validate(dict(row))


async def update_subject(conn: Conn, subject_id: uuid.UUID, patch: SubjectPatch) -> Subject:
    await get_subject(conn, subject_id)
    fields = patch.model_fields_set
    # Explicit null for a field is "leave as is": every column here is non-nullable or a toggle.
    assignments: list[str] = []
    values: list[object] = []
    if "name" in fields and patch.name is not None:
        values.append(patch.name)
        assignments.append(f"name = ${len(values) + 1}::text")
    if "position" in fields and patch.position is not None:
        values.append(patch.position)
        assignments.append(f"position = ${len(values) + 1}::smallint")
    if "archived" in fields and patch.archived is not None:
        assignments.append(
            "archived_at = coalesce(archived_at, now())" if patch.archived else "archived_at = null"
        )
    if assignments:
        # Fragments are constants from this function; values are bound parameters.
        await conn.execute(
            f"update app.subjects set {', '.join(assignments)} where id = $1", subject_id, *values
        )
    return await get_subject(conn, subject_id)


async def delete_subject(conn: Conn, subject_id: uuid.UUID) -> None:
    # Lessons and students keep existing: the FKs set their subject to null.
    deleted = await conn.fetchval("delete from app.subjects where id = $1 returning id", subject_id)
    if deleted is None:
        raise not_found("Materia non trovata.")


async def subject_exists(conn: Conn, subject_id: uuid.UUID) -> bool:
    return bool(await conn.fetchval("select exists(select 1 from app.subjects where id = $1)", subject_id))
