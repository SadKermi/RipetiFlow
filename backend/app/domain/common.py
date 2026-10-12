"""Helpers shared by the domain modules: tutor clock, Italian formatting, row -> model mapping."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import asyncpg

from app.core.errors import FieldError, invalid_many
from app.db.pool import Conn
from app.schemas import Balance, CalendarState, SubjectRef

ITALIAN_MONTHS = (
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
)
ITALIAN_WEEKDAYS = ("lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica")

METHOD_LABELS = {"cash": "Contanti", "bank_transfer": "Bonifico", "other": "Altro"}

MAX_LESSON_MINUTES = 12 * 60
MAX_RANGE_DAYS = 62


@dataclass(frozen=True)
class TutorClock:
    """ "Now" in the tutor's timezone (profile, default Europe/Rome)."""

    timezone: str
    now: dt.datetime  # aware

    @property
    def today(self) -> dt.date:
        return self.now.date()

    @property
    def local_naive(self) -> dt.datetime:
        return self.now.replace(tzinfo=None)


def zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("Europe/Rome")


async def tutor_clock(conn: Conn) -> TutorClock:
    tz_name = await conn.fetchval("select timezone from app.profiles where id = (select auth.uid())")
    tz_name = tz_name or "Europe/Rome"
    return TutorClock(timezone=tz_name, now=dt.datetime.now(zone(tz_name)))


def add_years(day: dt.date, years: int) -> dt.date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # 29 February
        return day.replace(year=day.year + years, day=28)


# ---------------------------------------------------------------------------------------------
# Italian formatting (used by summaries, CSV and Matita tools)
# ---------------------------------------------------------------------------------------------


def format_euro(cents: int) -> str:
    """1234,50 € with Italian thousands separator: 1.234,50 €."""
    sign = "-" if cents < 0 else ""
    euros, rest = divmod(abs(cents), 100)
    grouped = f"{euros:,}".replace(",", ".")
    return f"{sign}{grouped},{rest:02d} €"


def format_decimal_it(cents: int) -> str:
    """Plain number for spreadsheets: -1234,50 (no thousands separator, comma decimals)."""
    sign = "-" if cents < 0 else ""
    euros, rest = divmod(abs(cents), 100)
    return f"{sign}{euros},{rest:02d}"


def format_date_it(day: dt.date, with_year: bool = True) -> str:
    return day.strftime("%d/%m/%Y" if with_year else "%d/%m")


def format_minutes(minutes: int) -> str:
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours} h {mins} min"
    if hours:
        return f"{hours} h"
    return f"{mins} min"


def month_label(day: dt.date) -> str:
    return f"{ITALIAN_MONTHS[day.month - 1]} {day.year}"


def lesson_amount_cents(hourly_rate_cents: int, minutes: int) -> int:
    """D-10: round(rate × minutes / 60), half up — identical to the generated column."""
    return (hourly_rate_cents * minutes * 2 + 60) // 120


def display_name(first_name: str, last_name: str | None) -> str:
    return f"{first_name} {last_name}".strip() if last_name else first_name


# ---------------------------------------------------------------------------------------------
# Row mapping
# ---------------------------------------------------------------------------------------------


def balance_from_row(row: asyncpg.Record | dict[str, Any]) -> Balance:
    balance = int(row["balance_cents"])
    rate = row["current_hourly_rate_cents"]
    status = "debt" if balance < 0 else "credit" if balance > 0 else "settled"
    credit_minutes = None
    if status == "credit" and rate:
        credit_minutes = balance * 60 // int(rate)  # rounded down (docs/04)
    return Balance(
        balance_cents=balance,
        projected_balance_cents=int(row["projected_balance_cents"]),
        charged_cents=int(row["charged_cents"]),
        paid_cents=int(row["paid_cents"]),
        scheduled_cents=int(row["scheduled_cents"]),
        done_minutes=int(row["done_minutes"]),
        scheduled_minutes=int(row["scheduled_minutes"]),
        current_hourly_rate_cents=rate,
        status=status,
        credit_minutes=credit_minutes,
    )


def subject_ref(subject_id: Any, name: Any) -> SubjectRef | None:
    return SubjectRef(id=subject_id, name=name) if subject_id is not None and name is not None else None


def calendar_state(
    linked: bool, pending_id: int | None, pending_error: str | None, gcal_event_id: str | None
) -> CalendarState:
    if not linked:
        return CalendarState(status="off", error=None)
    if pending_id is not None:
        if pending_error:
            return CalendarState(status="error", error=pending_error)
        return CalendarState(status="pending", error=None)
    if gcal_event_id:
        return CalendarState(status="synced", error=None)
    return CalendarState(status="off", error=None)


# Calendar columns joined on lesson queries (see lessons.LESSON_SELECT).
CALENDAR_JOIN = """
left join app.google_calendar_links g on g.tutor_id = l.tutor_id
left join lateral (
  select o.id, o.last_error from app.calendar_outbox o
  where o.lesson_id = l.id and o.processed_at is null
  order by o.created_at desc, o.id desc limit 1
) ob on true
"""


def check_lesson_times(start: dt.time, end: dt.time) -> list[FieldError]:
    if end <= start:
        return [FieldError("end_time", "L'orario di fine deve essere successivo a quello di inizio.")]
    minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
    if minutes > MAX_LESSON_MINUTES:
        return [FieldError("end_time", "Una lezione non può durare più di 12 ore.")]
    return []


def check_date_window(day: dt.date, today: dt.date, field_name: str = "date") -> list[FieldError]:
    if not add_years(today, -2) <= day <= add_years(today, 2):
        return [FieldError(field_name, "La data deve essere entro due anni da oggi.")]
    return []


def raise_if(errors: list[FieldError]) -> None:
    if errors:
        raise invalid_many(errors)


def parse_range(start: dt.date, end: dt.date, max_days: int = MAX_RANGE_DAYS) -> None:
    if end < start:
        raise invalid_many([FieldError("to", "La data finale deve essere successiva a quella iniziale.")])
    if (end - start).days > max_days:
        raise invalid_many([FieldError("to", f"L'intervallo massimo è di {max_days} giorni.")])
