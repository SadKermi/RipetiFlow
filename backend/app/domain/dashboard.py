"""Dashboard "Oggi" (D-21)."""

from __future__ import annotations

import datetime as dt

from app.db.pool import Conn
from app.domain.common import TutorClock, month_label
from app.domain.lessons import LESSON_SELECT, lesson_from_row
from app.domain.students import STUDENT_SELECT, summary_from_row
from app.schemas import Dashboard, DashboardCalendar, DashboardMonth, DashboardTotals


async def calendar_counts(conn: Conn) -> tuple[bool, int, int]:
    """(connected, lessons waiting to sync, lessons whose sync failed)."""
    row = await conn.fetchrow(
        """select
             exists(select 1 from app.google_calendar_links g
                    where g.tutor_id = (select auth.uid()) and g.status = 'active') as connected,
             count(distinct o.lesson_id) filter (where o.last_error is null) as pending,
             count(distinct o.lesson_id) filter (where o.last_error is not null) as errors
           from app.calendar_outbox o
           where o.tutor_id = (select auth.uid()) and o.processed_at is null"""
    )
    assert row is not None
    return bool(row["connected"]), int(row["pending"]), int(row["errors"])


async def build_dashboard(conn: Conn, clock: TutorClock, days: int = 7) -> Dashboard:
    today = clock.today
    upcoming_rows = await conn.fetch(
        f"""{LESSON_SELECT}
            where l.tutor_id = (select auth.uid())
              and (l.lesson_date + l.end_time) > (now() at time zone p.timezone)
              and l.lesson_date <= $1
            order by l.lesson_date, l.start_time, s.first_name""",
        today + dt.timedelta(days=days),
    )
    # Archived students still appear here if money is outstanding.
    students = [
        summary_from_row(r)
        for r in await conn.fetch(f"{STUDENT_SELECT} where s.tutor_id = (select auth.uid())")
    ]
    owing = sorted(
        (s for s in students if s.balance.status == "debt"),
        key=lambda s: (s.balance.balance_cents, s.display_name),
    )
    in_credit = sorted(
        (s for s in students if s.balance.status == "credit"),
        key=lambda s: (-s.balance.balance_cents, s.display_name),
    )

    month_start = today.replace(day=1)
    next_month = (month_start + dt.timedelta(days=32)).replace(day=1)
    month = await conn.fetchrow(
        """select
             count(*) filter (where done) as lessons,
             coalesce(sum(duration_minutes) filter (where done), 0) as minutes,
             coalesce(sum(amount_cents) filter (where done), 0) as earned,
             (select coalesce(sum(py.amount_cents), 0) from app.payments py
               where py.tutor_id = (select auth.uid()) and py.paid_on >= $1 and py.paid_on < $2) as collected
           from (
             select l.duration_minutes, l.amount_cents,
                    (l.lesson_date + l.end_time) <= (now() at time zone p.timezone) as done
             from app.lessons l join app.profiles p on p.id = l.tutor_id
             where l.tutor_id = (select auth.uid()) and l.lesson_date >= $1 and l.lesson_date < $2
           ) x""",
        month_start,
        next_month,
    )
    assert month is not None
    connected, pending, errors = await calendar_counts(conn)
    return Dashboard(
        today=today,
        upcoming=[lesson_from_row(r) for r in upcoming_rows],
        owing=owing,
        in_credit=in_credit,
        totals=DashboardTotals(
            owed_to_you_cents=-sum(s.balance.balance_cents for s in owing),
            credit_held_cents=sum(s.balance.balance_cents for s in in_credit),
        ),
        month=DashboardMonth(
            label=month_label(today),
            lessons=int(month["lessons"]),
            minutes=int(month["minutes"]),
            earned_cents=int(month["earned"]),
            collected_cents=int(month["collected"]),
        ),
        calendar=DashboardCalendar(connected=connected, pending=pending, errors=errors),
    )
