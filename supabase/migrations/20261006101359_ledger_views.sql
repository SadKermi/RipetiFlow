-- RipetiFlow · ledger views (D-17 balance, D-18 libro mastro)
--
-- Sign convention: balance_cents = payments − charges of lessons already ended.
--   > 0  → the student has CREDIT (prepaid)       → UI: "Credito 40,00 € (≈ 2 h prepagate)"
--   < 0  → the student has DEBT (owes the tutor)  → UI: "Ti deve 45,00 €"
-- Lessons whose end is still in the future (tutor's timezone) are "scheduled": they do not move the
-- balance but are included in projected_balance_cents.
-- Views use security_invoker so the caller's RLS applies.

create or replace view app.student_balances
with (security_invoker = true)
as
select
  s.id                                                               as student_id,
  s.tutor_id,
  coalesce(l.done_count, 0)::integer                                 as done_lessons,
  coalesce(l.done_minutes, 0)::integer                               as done_minutes,
  coalesce(l.done_cents, 0)::bigint                                  as charged_cents,
  coalesce(l.scheduled_count, 0)::integer                            as scheduled_lessons,
  coalesce(l.scheduled_minutes, 0)::integer                          as scheduled_minutes,
  coalesce(l.scheduled_cents, 0)::bigint                             as scheduled_cents,
  coalesce(p.paid_cents, 0)::bigint                                  as paid_cents,
  (coalesce(p.paid_cents, 0) - coalesce(l.done_cents, 0))::bigint    as balance_cents,
  (coalesce(p.paid_cents, 0) - coalesce(l.done_cents, 0)
     - coalesce(l.scheduled_cents, 0))::bigint                       as projected_balance_cents,
  app.rate_for(s.id, (now() at time zone pr.timezone)::date)         as current_hourly_rate_cents,
  l.last_lesson_date,
  l.next_lesson_date,
  l.next_lesson_start,
  p.last_payment_on
from app.students s
join app.profiles pr on pr.id = s.tutor_id
left join lateral (
  select
    count(*)              filter (where x.done)     as done_count,
    sum(x.duration_minutes) filter (where x.done)   as done_minutes,
    sum(x.amount_cents)   filter (where x.done)     as done_cents,
    count(*)              filter (where not x.done) as scheduled_count,
    sum(x.duration_minutes) filter (where not x.done) as scheduled_minutes,
    sum(x.amount_cents)   filter (where not x.done) as scheduled_cents,
    max(x.lesson_date)    filter (where x.done)     as last_lesson_date,
    (array_agg(x.lesson_date order by x.lesson_date, x.start_time) filter (where not x.done))[1] as next_lesson_date,
    (array_agg(x.start_time  order by x.lesson_date, x.start_time) filter (where not x.done))[1] as next_lesson_start
  from (
    select ls.lesson_date, ls.start_time, ls.duration_minutes, ls.amount_cents,
           (ls.lesson_date + ls.end_time) <= (now() at time zone pr.timezone) as done
    from app.lessons ls
    where ls.student_id = s.id
  ) x
) l on true
left join lateral (
  select sum(py.amount_cents) as paid_cents, max(py.paid_on) as last_payment_on
  from app.payments py
  where py.student_id = s.id
) p on true;

-- Libro mastro: lessons are "Dare" (debit), payments are "Avere" (credit), with a running balance
-- that only counts settled entries (ended lessons and all payments).
create or replace view app.ledger_entries
with (security_invoker = true)
as
with entries as (
  select
    ls.tutor_id,
    ls.student_id,
    'lesson'::text                                                   as kind,
    ls.id                                                            as entry_id,
    ls.lesson_date                                                   as entry_date,
    ls.start_time,
    ls.end_time,
    ls.duration_minutes,
    ls.hourly_rate_cents,
    ls.subject_id,
    sj.name                                                          as subject_name,
    ls.topic,
    null::text                                                       as method,
    null::text                                                       as note,
    ls.amount_cents                                                  as debit_cents,
    0                                                                as credit_cents,
    (ls.lesson_date + ls.end_time) <= (now() at time zone pr.timezone) as settled,
    ls.created_at
  from app.lessons ls
  join app.profiles pr on pr.id = ls.tutor_id
  left join app.subjects sj on sj.id = ls.subject_id
  union all
  select
    py.tutor_id,
    py.student_id,
    'payment'::text,
    py.id,
    py.paid_on,
    null::time,
    null::time,
    null::integer,
    null::integer,
    null::uuid,
    null::text,
    null::text,
    py.method,
    py.note,
    0,
    py.amount_cents,
    true,
    py.created_at
  from app.payments py
)
select
  e.*,
  sum(case when e.settled then e.credit_cents - e.debit_cents else 0 end) over (
    partition by e.student_id
    order by e.entry_date, coalesce(e.start_time, time '23:59:59'), e.created_at, e.entry_id
    rows between unbounded preceding and current row
  )::bigint as running_balance_cents
from entries e;

grant select on app.student_balances, app.ledger_entries to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Activity log: append-only snapshot history (D-18). Written only by triggers.
-- ---------------------------------------------------------------------------------------------

create table app.activity_log (
  id          bigint generated always as identity primary key,
  tutor_id    uuid not null references app.profiles (id) on delete cascade,
  student_id  uuid,
  entity      text not null check (entity in ('student', 'student_rate', 'lesson', 'payment')),
  entity_id   uuid not null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  before      jsonb,
  after       jsonb,
  source      text not null default 'app' check (source in ('app', 'assistant', 'import', 'system')),
  occurred_at timestamptz not null default now()
);

create index activity_log_tutor_student_idx on app.activity_log (tutor_id, student_id, occurred_at desc);

alter table app.activity_log enable row level security;
create policy activity_log_select_own on app.activity_log for select to authenticated
  using (tutor_id = (select auth.uid()));
grant select on app.activity_log to authenticated;

-- Columns that change without being a user edit (bookkeeping) are ignored when diffing.
create or replace function app.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity  text := tg_argv[0];
  v_before  jsonb;
  v_after   jsonb;
  v_row     jsonb;
  v_source  text := coalesce(nullif(current_setting('app.source', true), ''), 'app');
  v_ignored text[] := array['updated_at', 'gcal_event_id', 'gcal_synced_at'];
begin
  if v_source not in ('app', 'assistant', 'import', 'system') then
    v_source := 'app';
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_before := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_after  := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and (v_before - v_ignored) = (v_after - v_ignored) then
    return null;
  end if;

  v_row := coalesce(v_after, v_before);

  -- Rows removed by an account deletion cascade are not logged (the profile is already gone).
  if not exists (select 1 from app.profiles where id = (v_row ->> 'tutor_id')::uuid) then
    return null;
  end if;

  insert into app.activity_log (tutor_id, student_id, entity, entity_id, action, before, after, source)
  values (
    (v_row ->> 'tutor_id')::uuid,
    case when v_entity = 'student' then (v_row ->> 'id')::uuid else (v_row ->> 'student_id')::uuid end,
    v_entity,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    v_before,
    v_after,
    v_source
  );
  return null;
end;
$$;

revoke execute on function app.log_activity() from public, anon, authenticated;

create trigger students_activity after insert or update or delete on app.students
  for each row execute function app.log_activity('student');
create trigger student_rates_activity after insert or update or delete on app.student_rates
  for each row execute function app.log_activity('student_rate');
create trigger lessons_activity after insert or update or delete on app.lessons
  for each row execute function app.log_activity('lesson');
create trigger payments_activity after insert or update or delete on app.payments
  for each row execute function app.log_activity('payment');
