-- Database behaviour tests for the RipetiFlow schema. Runs inside a transaction and rolls back.
-- Usage (local):  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/domain_test.sql
-- Each block raises an exception on failure, so ON_ERROR_STOP makes the run fail.

begin;

-- Two tutors (the auth trigger creates profiles + default subjects).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.it', '{"full_name": "Anna Tutor"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@example.it', '{"name": "Bruno Tutor"}');

do $$
begin
  assert (select count(*) from app.profiles) = 2, 'profiles created by trigger';
  assert (select count(*) from app.subjects where tutor_id = '00000000-0000-0000-0000-00000000000a') = 10,
    'default subjects seeded';
  assert (select full_name from app.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Bruno Tutor',
    'full_name falls back to name';
end $$;

-- Act as tutor A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into app.students (id, first_name, last_name) values
  ('10000000-0000-0000-0000-000000000001', 'Luca', 'Bianchi');
insert into app.student_rates (student_id, hourly_rate_cents, effective_from) values
  ('10000000-0000-0000-0000-000000000001', 2000, '2025-09-01'),
  ('10000000-0000-0000-0000-000000000001', 2500, '2026-09-01');

-- Rate snapshot comes from the history (D-16); 90 minutes at 20 €/h = 30 €.
insert into app.lessons (id, student_id, subject_id, lesson_date, start_time, end_time, topic) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   (select id from app.subjects where name = 'Matematica'), '2026-06-10', '15:00', '16:30', 'Equazioni');
-- After the rate increase: 60 minutes at 25 €/h.
insert into app.lessons (id, student_id, lesson_date, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2026-09-15', '17:00', '18:00');
-- Explicit override wins over the history; 45 minutes at 30 €/h = 22,50 €.
insert into app.lessons (id, student_id, lesson_date, start_time, end_time, hourly_rate_cents) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '2026-09-20', '09:00', '09:45', 3000);
-- A lesson far in the future is "scheduled" and does not move the balance.
insert into app.lessons (id, student_id, lesson_date, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '2099-01-10', '10:00', '11:00');
insert into app.payments (student_id, amount_cents, paid_on, method) values
  ('10000000-0000-0000-0000-000000000001', 5000, '2026-09-16', 'cash');

do $$
declare b record;
begin
  assert (select hourly_rate_cents from app.lessons where id = '20000000-0000-0000-0000-000000000001') = 2000, 'old rate snapshot';
  assert (select amount_cents from app.lessons where id = '20000000-0000-0000-0000-000000000001') = 3000, '90 min × 20 €/h';
  assert (select amount_cents from app.lessons where id = '20000000-0000-0000-0000-000000000002') = 2500, 'new rate snapshot';
  assert (select amount_cents from app.lessons where id = '20000000-0000-0000-0000-000000000003') = 2250, 'override rate';
  assert (select duration_minutes from app.lessons where id = '20000000-0000-0000-0000-000000000003') = 45, 'duration';

  select * into b from app.student_balances where student_id = '10000000-0000-0000-0000-000000000001';
  assert b.charged_cents = 7750, format('charged %s', b.charged_cents);
  assert b.paid_cents = 5000, 'paid';
  assert b.balance_cents = -2750, format('balance (debt) %s', b.balance_cents);
  assert b.scheduled_cents = 2500 and b.projected_balance_cents = -5250, 'scheduled/projected';
  assert b.current_hourly_rate_cents = 2500, 'current rate';
  assert b.next_lesson_date = '2099-01-10', 'next lesson';

  -- Running balance on the ledger: last settled entry equals the balance.
  assert (select running_balance_cents from app.ledger_entries
          where student_id = '10000000-0000-0000-0000-000000000001' and settled
          order by entry_date desc, created_at desc limit 1) = -2750, 'running balance';
  assert (select count(*) from app.ledger_entries where student_id = '10000000-0000-0000-0000-000000000001') = 5,
    'ledger has 4 lessons + 1 payment';
end $$;

-- Raising the rate later does NOT alter past lessons (the vocale 10 requirement).
insert into app.student_rates (student_id, hourly_rate_cents, effective_from)
  values ('10000000-0000-0000-0000-000000000001', 4000, '2026-10-01');
do $$
begin
  assert (select balance_cents from app.student_balances where student_id = '10000000-0000-0000-0000-000000000001') = -2750,
    'rate change keeps history intact';
end $$;

-- Same-day / whole-minute constraints.
do $$
begin
  begin
    insert into app.lessons (student_id, lesson_date, start_time, end_time)
      values ('10000000-0000-0000-0000-000000000001', '2026-09-21', '18:00', '17:00');
    raise exception 'end before start must fail';
  exception when check_violation then null;
  end;
end $$;

-- Activity log captured inserts (snapshot history, D-18).
do $$
begin
  assert (select count(*) from app.activity_log where entity = 'lesson' and action = 'insert') = 4, 'lesson inserts logged';
  assert (select count(*) from app.activity_log where student_id = '10000000-0000-0000-0000-000000000001') >= 8,
    'per-student history';
end $$;

update app.lessons set notes = 'Portare esercizi' where id = '20000000-0000-0000-0000-000000000002';
update app.lessons set updated_at = now() where id = '20000000-0000-0000-0000-000000000002';
do $$
begin
  assert (select count(*) from app.activity_log where entity = 'lesson' and action = 'update') = 1,
    'real edit logged once, bookkeeping-only update ignored';
end $$;

-- Users cannot write the activity log or Google tokens directly.
do $$
begin
  begin
    insert into app.activity_log (tutor_id, entity, entity_id, action)
      values ('00000000-0000-0000-0000-00000000000a', 'lesson', gen_random_uuid(), 'insert');
    raise exception 'activity_log must be read-only for users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform refresh_token_ciphertext from app.google_calendar_links;
    raise exception 'refresh token column must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Act as tutor B: cannot see or reference A's data.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from app.students) = 0, 'RLS hides other tutors students';
  assert (select count(*) from app.ledger_entries) = 0, 'RLS applies through views';
  assert (select count(*) from app.activity_log) = 0, 'RLS on activity log';
  begin
    -- B forging a lesson against A's student fails the composite FK.
    insert into app.lessons (student_id, lesson_date, start_time, end_time, hourly_rate_cents)
      values ('10000000-0000-0000-0000-000000000001', '2026-09-21', '10:00', '11:00', 1000);
    raise exception 'cross-tutor reference must fail';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Back to A: a student with lessons cannot be deleted (archive instead, D-19).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    delete from app.students where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'student with ledger entries must not be deletable';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Calendar outbox: enabling sync queues lesson changes (privileged insert of the link).
reset role;
insert into app.google_calendar_links (tutor_id, refresh_token_ciphertext, calendar_id)
  values ('00000000-0000-0000-0000-00000000000a', 'ciphertext', 'cal@group.calendar.google.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update app.lessons set topic = 'Disequazioni' where id = '20000000-0000-0000-0000-000000000004';
update app.lessons set notes = 'note private' where id = '20000000-0000-0000-0000-000000000004';
update app.students set first_name = 'Luca M.' where id = '10000000-0000-0000-0000-000000000001';
do $$
begin
  assert (select count(*) from app.calendar_outbox where op = 'upsert') = 2,
    format('topic change + rename of future lesson queue upserts, notes do not (got %s)',
           (select count(*) from app.calendar_outbox));
end $$;

-- Account deletion cascades everything without tripping FKs or logging.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  assert (select count(*) from app.students) = 0 and (select count(*) from app.lessons) = 0, 'cascade';
  assert (select count(*) from app.activity_log) = 0, 'history removed with the account';
  assert (select count(*) from app.calendar_outbox) = 0, 'outbox removed with the account';
end $$;

select 'domain_test: all assertions passed' as result;
rollback;
