"""Demo data for development (D-30): six students, ~3 months of lessons, payments, a rate change.

Deterministic (no randomness): the same "today" always yields the same ledger, which keeps
screenshots and E2E tests stable. Everything is written as the demo user, through RLS, exactly like
the real API does.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass

from app.core.auth import CurrentUser
from app.core.settings import DEV_DEMO_EMAIL, DEV_DEMO_USER_ID
from app.db.pool import Conn, Database
from app.schemas import DevSeedResult


@dataclass(frozen=True)
class _Student:
    first_name: str
    last_name: str
    grade: str
    school: str
    subject: str
    rate_cents: int
    weekday: int  # 0 = Monday
    start: dt.time
    minutes: int
    target_balance_cents: int  # final balance: < 0 owes the tutor, > 0 prepaid credit
    topics: tuple[str, ...]
    guardian: str | None = None
    phone: str | None = None
    raise_to_cents: int | None = None  # rate increase ~6 weeks ago (D-16)


_STUDENTS: tuple[_Student, ...] = (
    _Student(
        "Luca",
        "Bianchi",
        "3ª liceo scientifico",
        "Liceo Scientifico Galilei",
        "Matematica",
        2000,
        0,
        dt.time(15, 0),
        90,
        -4400,
        ("Equazioni di secondo grado", "Disequazioni", "Parabola", "Sistemi lineari", "Verifica: ripasso"),
        guardian="Paola Bianchi",
        phone="+39 347 512 0896",
        raise_to_cents=2200,
    ),
    _Student(
        "Giulia",
        "Ferri",
        "2ª liceo classico",
        "Liceo Classico Parini",
        "Latino",
        2200,
        1,
        dt.time(17, 0),
        60,
        6600,
        ("Terza declinazione", "Versione di Cesare", "Participio", "Ablativo assoluto"),
        guardian="Marco Ferri",
        phone="+39 333 908 1122",
    ),
    _Student(
        "Marco",
        "Rossi",
        "3ª media",
        "Scuola Media Manzoni",
        "Matematica",
        1800,
        2,
        dt.time(16, 0),
        60,
        0,
        ("Frazioni", "Proporzioni", "Equazioni", "Geometria solida"),
        guardian="Anna Rossi",
    ),
    _Student(
        "Sofia",
        "Conti",
        "5ª ITIS informatico",
        "ITIS Feltrinelli",
        "Informatica",
        2500,
        3,
        dt.time(18, 0),
        60,
        -2500,
        ("Basi di dati", "SQL: join", "Progetto esame", "Reti: TCP/IP"),
    ),
    _Student(
        "Alessandro",
        "Greco",
        "1º anno Ingegneria",
        "Politecnico",
        "Matematica",
        3000,
        4,
        dt.time(14, 30),
        90,
        6000,
        ("Limiti", "Derivate", "Integrali", "Serie numeriche", "Esame: esercizi"),
    ),
    _Student(
        "Chiara",
        "Romano",
        "4ª liceo linguistico",
        "Liceo Linguistico Agnesi",
        "Inglese",
        2000,
        1,
        dt.time(15, 0),
        60,
        -2000,
        ("Past perfect", "Essay writing", "Listening B2", "Phrasal verbs"),
        guardian="Elena Romano",
    ),
)

_METHODS = ("cash", "bank_transfer", "cash", "other")
_INSERT_RATE = (
    "insert into app.student_rates (student_id, hourly_rate_cents, effective_from) values ($1, $2, $3)"
)


def demo_user() -> CurrentUser:
    claims = {"sub": str(DEV_DEMO_USER_ID), "email": DEV_DEMO_EMAIL, "role": "authenticated"}
    return CurrentUser(id=DEV_DEMO_USER_ID, email=DEV_DEMO_EMAIL, claims=claims)


async def ensure_demo_user(db: Database, *, reset: bool = False) -> None:
    """Create the demo row in auth.users (local DB only). `reset` wipes all of its data first."""
    async with db.privileged_tx() as conn:
        if reset:
            # Cascades to the profile and every app.* row of the demo tutor.
            await conn.execute("delete from auth.users where id = $1", DEV_DEMO_USER_ID)
        await conn.execute(
            """insert into auth.users (id, email, raw_user_meta_data)
               values ($1, $2, '{"full_name": "Tutor Demo"}'::jsonb)
               on conflict (id) do nothing""",
            DEV_DEMO_USER_ID,
            DEV_DEMO_EMAIL,
        )


def _lesson_dates(weekday: int, first: dt.date, last: dt.date) -> list[dt.date]:
    day = first + dt.timedelta(days=(weekday - first.weekday()) % 7)
    out = []
    while day <= last:
        out.append(day)
        day += dt.timedelta(days=7)
    return out


def _end(start: dt.time, minutes: int) -> dt.time:
    moment = dt.datetime.combine(dt.date(2000, 1, 1), start) + dt.timedelta(minutes=minutes)
    return moment.time()


async def _seed_student(
    conn: Conn, spec: _Student, subjects: dict[str, uuid.UUID], today: dt.date
) -> tuple[int, int]:
    start_date = today - dt.timedelta(days=91)
    student_id = await conn.fetchval(
        """insert into app.students (first_name, last_name, grade, school, guardian_name, guardian_phone,
                                     default_subject_id)
           values ($1, $2, $3, $4, $5, $6, $7) returning id""",
        spec.first_name,
        spec.last_name,
        spec.grade,
        spec.school,
        spec.guardian,
        spec.phone,
        subjects[spec.subject],
    )
    await conn.execute(
        _INSERT_RATE,
        student_id,
        spec.rate_cents,
        start_date,
    )
    if spec.raise_to_cents is not None:
        raise_from = (today - dt.timedelta(days=42)).replace(day=1)
        await conn.execute(
            _INSERT_RATE,
            student_id,
            spec.raise_to_cents,
            raise_from,
        )

    dates = _lesson_dates(spec.weekday, start_date, today + dt.timedelta(days=14))
    for i, day in enumerate(dates):
        await conn.execute(
            """insert into app.lessons (student_id, subject_id, lesson_date, start_time, end_time, topic)
               values ($1, $2, $3, $4, $5, $6)""",
            student_id,
            subjects[spec.subject],
            day,
            spec.start,
            _end(spec.start, spec.minutes),
            spec.topics[i % len(spec.topics)],
        )

    # Payments that bring the settled balance exactly to the target, in 2-3 instalments.
    charged = int(
        await conn.fetchval(
            "select charged_cents from app.student_balances where student_id = $1", student_id
        )
    )
    total = charged + spec.target_balance_cents
    payments = 0
    if total > 0:
        parts = 3 if total > 15000 else 2
        base = (total // parts // 100) * 100
        amounts = [base] * (parts - 1) + [total - base * (parts - 1)]
        for j, amount in enumerate(amounts):
            paid_on = min(today, start_date + dt.timedelta(days=30 * (j + 1)))
            method = _METHODS[(j + len(spec.first_name)) % len(_METHODS)]
            await conn.execute(
                """insert into app.payments (student_id, amount_cents, paid_on, method, note)
                   values ($1, $2, $3, $4, $5)""",
                student_id,
                amount,
                paid_on,
                method,
                "Satispay" if method == "other" else None,
            )
            payments += 1
    return len(dates), payments


async def seed_demo(db: Database, today: dt.date | None = None) -> DevSeedResult:
    await ensure_demo_user(db, reset=True)
    async with db.user_tx(demo_user(), "import") as conn:
        if today is None:
            today = await conn.fetchval(
                "select (now() at time zone timezone)::date from app.profiles where id = (select auth.uid())"
            )
        assert today is not None
        subjects = {r["name"]: r["id"] for r in await conn.fetch("select id, name from app.subjects")}
        lessons = payments = 0
        for spec in _STUDENTS:
            n_lessons, n_payments = await _seed_student(conn, spec, subjects, today)
            lessons += n_lessons
            payments += n_payments
    return DevSeedResult(students=len(_STUDENTS), lessons=lessons, payments=payments)
