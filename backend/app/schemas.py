"""Pydantic models of the public API (docs/05-api.md). Field names are part of the contract."""

from __future__ import annotations

import datetime as dt
import re
import uuid
from datetime import datetime, time
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    WithJsonSchema,
)

# ---------------------------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------------------------

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _parse_hhmm(value: Any) -> Any:
    if isinstance(value, time):
        if value.second or value.microsecond:
            raise ValueError("L'orario deve essere nel formato HH:MM (minuti interi).")
        return value
    if isinstance(value, str):
        match = _HHMM_RE.match(value.strip())
        if not match:
            raise ValueError("L'orario deve essere nel formato HH:MM (es. 15:30).")
        return time(int(match.group(1)), int(match.group(2)))
    raise ValueError("L'orario deve essere nel formato HH:MM (es. 15:30).")


def format_hhmm(value: time) -> str:
    return value.strftime("%H:%M")


HHMM = Annotated[
    time,
    BeforeValidator(_parse_hhmm),
    PlainSerializer(format_hhmm, return_type=str),
    WithJsonSchema({"type": "string", "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$", "examples": ["15:30"]}),
]


def _clean_optional_text(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _clean_required_text(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value


# Optional free text: trimmed, "" becomes null, length-limited like the DB checks.
OptText40 = Annotated[Annotated[str, Field(max_length=40)] | None, BeforeValidator(_clean_optional_text)]
OptText60 = Annotated[Annotated[str, Field(max_length=60)] | None, BeforeValidator(_clean_optional_text)]
OptText80 = Annotated[Annotated[str, Field(max_length=80)] | None, BeforeValidator(_clean_optional_text)]
OptText120 = Annotated[Annotated[str, Field(max_length=120)] | None, BeforeValidator(_clean_optional_text)]
OptText200 = Annotated[Annotated[str, Field(max_length=200)] | None, BeforeValidator(_clean_optional_text)]
OptText254 = Annotated[Annotated[str, Field(max_length=254)] | None, BeforeValidator(_clean_optional_text)]
OptText500 = Annotated[Annotated[str, Field(max_length=500)] | None, BeforeValidator(_clean_optional_text)]
OptText4000 = Annotated[Annotated[str, Field(max_length=4000)] | None, BeforeValidator(_clean_optional_text)]
# Required text: trimmed, non-empty.
ReqText60 = Annotated[str, BeforeValidator(_clean_required_text), Field(min_length=1, max_length=60)]
ReqText80 = Annotated[str, BeforeValidator(_clean_required_text), Field(min_length=1, max_length=80)]
TimezoneName = Annotated[str, Field(min_length=1, max_length=64)]

Cents = Annotated[int, Field(ge=0, le=100_000, description="Tariffa oraria in centesimi")]
PaymentMethod = Literal["cash", "bank_transfer", "other"]
BalanceStatus = Literal["debt", "credit", "settled"]
CalendarSyncStatus = Literal["off", "pending", "synced", "error"]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ItemsPage[T](ApiModel):
    items: list[T]


# ---------------------------------------------------------------------------------------------
# Health / public config
# ---------------------------------------------------------------------------------------------


class Health(ApiModel):
    status: Literal["ok", "error"]
    version: str
    db: Literal["ok", "error"]


class PublicConfig(ApiModel):
    supabase_url: str
    supabase_publishable_key: str
    google_login_enabled: bool
    magic_link_enabled: bool
    dev_auth_enabled: bool
    calendar_sync_available: bool
    assistant_available: bool


# ---------------------------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------------------------


class Profile(ApiModel):
    id: uuid.UUID
    email: str | None
    full_name: str | None
    timezone: str
    default_lesson_minutes: int
    default_hourly_rate_cents: int | None
    created_at: datetime


class ProfilePatch(ApiModel):
    full_name: OptText120 = None
    timezone: TimezoneName | None = None
    default_lesson_minutes: Annotated[int, Field(ge=15, le=480)] | None = None
    default_hourly_rate_cents: Annotated[int, Field(ge=0, le=100_000)] | None = None


# ---------------------------------------------------------------------------------------------
# Subjects
# ---------------------------------------------------------------------------------------------


class Subject(ApiModel):
    id: uuid.UUID
    name: str
    position: int
    archived: bool


class SubjectRef(ApiModel):
    id: uuid.UUID
    name: str


class SubjectCreate(ApiModel):
    name: ReqText60


class SubjectPatch(ApiModel):
    name: ReqText60 | None = None
    position: Annotated[int, Field(ge=0, le=32767)] | None = None
    archived: bool | None = None


# ---------------------------------------------------------------------------------------------
# Students, balances, rates
# ---------------------------------------------------------------------------------------------


class Balance(ApiModel):
    balance_cents: int
    projected_balance_cents: int
    charged_cents: int
    paid_cents: int
    scheduled_cents: int
    done_minutes: int
    scheduled_minutes: int
    current_hourly_rate_cents: int | None
    status: BalanceStatus
    credit_minutes: int | None


class NextLesson(ApiModel):
    date: dt.date
    start_time: HHMM


class StudentSummary(ApiModel):
    id: uuid.UUID
    first_name: str
    last_name: str | None
    display_name: str
    grade: str | None
    school: str | None
    archived: bool
    balance: Balance
    next_lesson: NextLesson | None
    last_lesson_date: dt.date | None


class Rate(ApiModel):
    id: uuid.UUID
    hourly_rate_cents: int
    effective_from: dt.date
    created_at: datetime


class StudentFields(ApiModel):
    first_name: ReqText80
    last_name: OptText80 = None
    school: OptText120 = None
    grade: OptText60 = None
    email: OptText254 = None
    phone: OptText40 = None
    guardian_name: OptText120 = None
    guardian_email: OptText254 = None
    guardian_phone: OptText40 = None
    notes: OptText4000 = None
    default_subject_id: uuid.UUID | None = None


class Student(StudentFields):
    id: uuid.UUID
    display_name: str
    archived: bool
    created_at: datetime
    balance: Balance
    rates: list[Rate]


class StudentCreate(StudentFields):
    hourly_rate_cents: Cents
    rate_effective_from: dt.date | None = None


class StudentPatch(ApiModel):
    first_name: ReqText80 | None = None
    last_name: OptText80 = None
    school: OptText120 = None
    grade: OptText60 = None
    email: OptText254 = None
    phone: OptText40 = None
    guardian_name: OptText120 = None
    guardian_email: OptText254 = None
    guardian_phone: OptText40 = None
    notes: OptText4000 = None
    default_subject_id: uuid.UUID | None = None


class RateInput(ApiModel):
    hourly_rate_cents: Cents
    effective_from: dt.date


class RateCreate(RateInput):
    reprice_existing: bool = False


class RatePreview(ApiModel):
    affected_lessons: int
    current_total_cents: int
    new_total_cents: int
    delta_cents: int


class RateCreated(ApiModel):
    rate: Rate
    repriced_lessons: int


# ---------------------------------------------------------------------------------------------
# Ledger & activity
# ---------------------------------------------------------------------------------------------


class CalendarState(ApiModel):
    status: CalendarSyncStatus
    error: str | None


class LedgerEntry(ApiModel):
    kind: Literal["lesson", "payment"]
    id: uuid.UUID
    date: dt.date
    start_time: HHMM | None
    end_time: HHMM | None
    duration_minutes: int | None
    hourly_rate_cents: int | None
    subject: SubjectRef | None
    topic: str | None
    method: PaymentMethod | None
    note: str | None
    debit_cents: int
    credit_cents: int
    settled: bool
    running_balance_cents: int
    calendar: CalendarState | None


class Ledger(ApiModel):
    items: list[LedgerEntry]
    balance: Balance


class ActivityChange(ApiModel):
    field: str
    before: str | None
    after: str | None


class Activity(ApiModel):
    id: str
    entity: Literal["student", "student_rate", "lesson", "payment"]
    entity_id: uuid.UUID
    action: Literal["insert", "update", "delete"]
    source: Literal["app", "assistant", "import", "system"]
    occurred_at: datetime
    summary: str
    changes: list[ActivityChange]


class ActivityPage(ApiModel):
    items: list[Activity]
    next_cursor: str | None


# ---------------------------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------------------------


class StudentRef(ApiModel):
    id: uuid.UUID
    display_name: str


class Lesson(ApiModel):
    id: uuid.UUID
    student: StudentRef
    subject: SubjectRef | None
    date: dt.date
    start_time: HHMM
    end_time: HHMM
    duration_minutes: int
    hourly_rate_cents: int
    amount_cents: int
    topic: str | None
    notes: str | None
    settled: bool
    calendar: CalendarState
    created_at: datetime
    updated_at: datetime


class LessonCreate(ApiModel):
    student_id: uuid.UUID
    subject_id: uuid.UUID | None = None
    date: dt.date
    start_time: HHMM
    end_time: HHMM
    hourly_rate_cents: Cents | None = None
    topic: OptText200 = None
    notes: OptText4000 = None


class LessonPatch(ApiModel):
    student_id: uuid.UUID | None = None
    subject_id: uuid.UUID | None = None
    date: dt.date | None = None
    start_time: HHMM | None = None
    end_time: HHMM | None = None
    hourly_rate_cents: Cents | None = None
    topic: OptText200 = None
    notes: OptText4000 = None


class LessonDuplicate(ApiModel):
    student_id: uuid.UUID | None = None
    date: dt.date | None = None


# ---------------------------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------------------------


class Payment(ApiModel):
    id: uuid.UUID
    student: StudentRef
    amount_cents: int
    paid_on: dt.date
    method: PaymentMethod
    note: str | None
    created_at: datetime
    updated_at: datetime


class PaymentCreate(ApiModel):
    student_id: uuid.UUID
    amount_cents: Annotated[int, Field(ge=1, le=10_000_000)]
    paid_on: dt.date
    method: PaymentMethod
    note: OptText500 = None


class PaymentPatch(ApiModel):
    student_id: uuid.UUID | None = None
    amount_cents: Annotated[int, Field(ge=1, le=10_000_000)] | None = None
    paid_on: dt.date | None = None
    method: PaymentMethod | None = None
    note: OptText500 = None


# ---------------------------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------------------------


class DashboardTotals(ApiModel):
    owed_to_you_cents: int
    credit_held_cents: int


class DashboardMonth(ApiModel):
    label: str
    lessons: int
    minutes: int
    earned_cents: int
    collected_cents: int


class DashboardCalendar(ApiModel):
    connected: bool
    pending: int
    errors: int


class Dashboard(ApiModel):
    today: dt.date
    upcoming: list[Lesson]
    owing: list[StudentSummary]
    in_credit: list[StudentSummary]
    totals: DashboardTotals
    month: DashboardMonth
    calendar: DashboardCalendar


# ---------------------------------------------------------------------------------------------
# Google Calendar
# ---------------------------------------------------------------------------------------------


class CalendarStatus(ApiModel):
    available: bool
    connected: bool
    google_email: str | None
    calendar_id: str | None
    status: Literal["active", "revoked", "error"] | None
    last_synced_at: datetime | None
    last_error: str | None
    pending: int
    errors: int


class CalendarConnect(ApiModel):
    provider_refresh_token: Annotated[str, Field(min_length=10, max_length=2048)]
    provider_token: Annotated[str, Field(max_length=4096)] | None = None


class CalendarResync(ApiModel):
    scope: Literal["upcoming", "all"] = "upcoming"


class CalendarQueued(ApiModel):
    queued: int


# ---------------------------------------------------------------------------------------------
# Dev
# ---------------------------------------------------------------------------------------------


class DevUser(ApiModel):
    id: uuid.UUID
    email: str


class DevLogin(ApiModel):
    access_token: str
    user: DevUser


class DevSeedResult(ApiModel):
    students: int
    lessons: int
    payments: int
