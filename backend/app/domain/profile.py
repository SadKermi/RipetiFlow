"""Tutor profile (one row per user, created by the auth trigger)."""

from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.errors import FieldError, invalid_many, not_found
from app.db.pool import Conn
from app.schemas import Profile, ProfilePatch

_SELECT = """
select id, email, full_name, timezone, default_lesson_minutes, default_hourly_rate_cents, created_at
from app.profiles where id = (select auth.uid())
"""


def _valid_timezone(name: str) -> bool:
    if "/" not in name and name != "UTC":
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


async def get_profile(conn: Conn) -> Profile:
    row = await conn.fetchrow(_SELECT)
    if row is None:
        raise not_found("Profilo non trovato.")
    return Profile.model_validate(dict(row))


async def update_profile(conn: Conn, patch: ProfilePatch) -> Profile:
    fields = patch.model_fields_set
    errors: list[FieldError] = []
    for required in ("timezone", "default_lesson_minutes"):
        if required in fields and getattr(patch, required) is None:
            errors.append(FieldError(required, "Campo obbligatorio."))
    if patch.timezone is not None and not _valid_timezone(patch.timezone):
        errors.append(FieldError("timezone", "Fuso orario non valido (es. Europe/Rome)."))
    if errors:
        raise invalid_many(errors)

    columns = [
        c
        for c in ("full_name", "timezone", "default_lesson_minutes", "default_hourly_rate_cents")
        if c in fields
    ]
    if columns:
        assignments = ", ".join(f"{col} = ${i}" for i, col in enumerate(columns, start=1))
        # Column names come from the fixed whitelist above, values are bound parameters.
        await conn.execute(
            f"update app.profiles set {assignments} where id = (select auth.uid())",
            *(getattr(patch, c) for c in columns),
        )
    return await get_profile(conn)
