-- RipetiFlow · core schema
-- Decisions referenced (D-xx) are documented in docs/02-requisiti-e-decisioni.md.
--
-- All domain tables live in the `app` schema, which is NOT exposed through the Supabase Data API
-- (PostgREST only serves `public`/`graphql_public`). The only way in is the FastAPI backend, which
-- runs every user request as role `authenticated` with the verified JWT claims, so the RLS policies
-- below are enforced for backend queries too (D-03). Do not add `app` to the exposed schemas.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Profiles (one per tutor, 1:1 with auth.users)
-- ---------------------------------------------------------------------------------------------

create table app.profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  email                     text check (char_length(email) <= 254),
  full_name                 text check (char_length(full_name) <= 120),
  timezone                  text not null default 'Europe/Rome' check (char_length(timezone) <= 64),
  default_lesson_minutes    integer not null default 60 check (default_lesson_minutes between 15 and 480),
  default_hourly_rate_cents integer check (default_hourly_rate_cents between 0 and 100000),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on app.profiles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Subjects (per tutor, seeded at sign-up) · D-14
-- ---------------------------------------------------------------------------------------------

create table app.subjects (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null default auth.uid() references app.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  position    smallint not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint subjects_id_tutor_key unique (id, tutor_id)
);

create unique index subjects_tutor_name_key on app.subjects (tutor_id, lower(btrim(name)));

create trigger subjects_set_updated_at before update on app.subjects
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Students · D-19 (archive instead of delete when they have ledger entries)
-- ---------------------------------------------------------------------------------------------

create table app.students (
  id                 uuid primary key default gen_random_uuid(),
  tutor_id           uuid not null default auth.uid() references app.profiles (id) on delete cascade,
  first_name         text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name          text check (char_length(last_name) <= 80),
  school             text check (char_length(school) <= 120),
  grade              text check (char_length(grade) <= 60),
  email              text check (char_length(email) <= 254),
  phone              text check (char_length(phone) <= 40),
  guardian_name      text check (char_length(guardian_name) <= 120),
  guardian_email     text check (char_length(guardian_email) <= 254),
  guardian_phone     text check (char_length(guardian_phone) <= 40),
  notes              text check (char_length(notes) <= 4000),
  default_subject_id uuid,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Composite keys let child tables prove they belong to the same tutor (FK checks bypass RLS).
  constraint students_id_tutor_key unique (id, tutor_id),
  constraint students_default_subject_fkey foreign key (default_subject_id, tutor_id)
    references app.subjects (id, tutor_id) on delete set null (default_subject_id)
);

create index students_tutor_active_idx on app.students (tutor_id, lower(first_name), lower(last_name))
  where archived_at is null;
create index students_default_subject_idx on app.students (default_subject_id, tutor_id);

create trigger students_set_updated_at before update on app.students
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Hourly rate history · D-16
-- ---------------------------------------------------------------------------------------------

create table app.student_rates (
  id                uuid primary key default gen_random_uuid(),
  tutor_id          uuid not null default auth.uid() references app.profiles (id) on delete cascade,
  student_id        uuid not null,
  hourly_rate_cents integer not null check (hourly_rate_cents between 0 and 100000),
  effective_from    date not null,
  created_at        timestamptz not null default now(),
  constraint student_rates_student_fkey foreign key (student_id, tutor_id)
    references app.students (id, tutor_id) on delete cascade,
  constraint student_rates_student_day_key unique (student_id, effective_from)
);

create index student_rates_student_tutor_idx on app.student_rates (student_id, tutor_id);

-- Rate valid for a student on a given day. Lessons dated before the first rate use the earliest rate.
create or replace function app.rate_for(p_student_id uuid, p_on date)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select r.hourly_rate_cents from app.student_rates r
      where r.student_id = p_student_id and r.effective_from <= p_on
      order by r.effective_from desc limit 1),
    (select r.hourly_rate_cents from app.student_rates r
      where r.student_id = p_student_id
      order by r.effective_from asc limit 1)
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Lessons · D-11 (date + start/end time, same day), D-13 (topic + private notes), D-16 (rate snapshot)
-- ---------------------------------------------------------------------------------------------

create table app.lessons (
  id                uuid primary key default gen_random_uuid(),
  tutor_id          uuid not null default auth.uid() references app.profiles (id) on delete cascade,
  student_id        uuid not null,
  subject_id        uuid,
  lesson_date       date not null,
  start_time        time(0) not null,
  end_time          time(0) not null,
  duration_minutes  integer generated always as
                      ((extract(epoch from (end_time - start_time)) / 60)::integer) stored,
  hourly_rate_cents integer not null check (hourly_rate_cents between 0 and 100000),
  -- D-10: round half up, integer cents.
  amount_cents      integer generated always as
                      (round(hourly_rate_cents::numeric * extract(epoch from (end_time - start_time)) / 3600)::integer) stored,
  topic             text check (char_length(topic) <= 200),
  notes             text check (char_length(notes) <= 4000),
  gcal_event_id     text,
  gcal_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lessons_time_order check (end_time > start_time),
  constraint lessons_whole_minutes check (extract(second from start_time) = 0 and extract(second from end_time) = 0),
  constraint lessons_student_fkey foreign key (student_id, tutor_id)
    references app.students (id, tutor_id) on delete no action,
  constraint lessons_subject_fkey foreign key (subject_id, tutor_id)
    references app.subjects (id, tutor_id) on delete set null (subject_id)
);

create index lessons_tutor_date_idx on app.lessons (tutor_id, lesson_date, start_time);
create index lessons_student_tutor_idx on app.lessons (student_id, tutor_id, lesson_date);
create index lessons_subject_tutor_idx on app.lessons (subject_id, tutor_id);

create trigger lessons_set_updated_at before update on app.lessons
  for each row execute function app.set_updated_at();

-- Fill the rate snapshot from the rate history when the client does not send one.
create or replace function app.lessons_fill_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.hourly_rate_cents is null then
    new.hourly_rate_cents := app.rate_for(new.student_id, new.lesson_date);
    if new.hourly_rate_cents is null then
      raise exception 'student % has no hourly rate', new.student_id
        using errcode = 'P0001', hint = 'RF_NO_RATE';
    end if;
  end if;
  return new;
end;
$$;

create trigger lessons_fill_rate before insert on app.lessons
  for each row execute function app.lessons_fill_rate();

-- ---------------------------------------------------------------------------------------------
-- Payments · D-15 (manual record only)
-- ---------------------------------------------------------------------------------------------

create table app.payments (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null default auth.uid() references app.profiles (id) on delete cascade,
  student_id   uuid not null,
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  paid_on      date not null,
  method       text not null check (method in ('cash', 'bank_transfer', 'other')),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint payments_student_fkey foreign key (student_id, tutor_id)
    references app.students (id, tutor_id) on delete no action
);

create index payments_student_tutor_idx on app.payments (student_id, tutor_id, paid_on);
create index payments_tutor_date_idx on app.payments (tutor_id, paid_on);

create trigger payments_set_updated_at before update on app.payments
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- New user bootstrap: profile + default subjects (D-14)
-- ---------------------------------------------------------------------------------------------

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into app.subjects (tutor_id, name, position)
  select new.id, s.name, s.position
  from (values
    ('Matematica', 1), ('Fisica', 2), ('Chimica', 3), ('Scienze', 4), ('Italiano', 5),
    ('Latino', 6), ('Inglese', 7), ('Storia', 8), ('Filosofia', 9), ('Informatica', 10)
  ) as s (name, position)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_ripetiflow
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: every row belongs to exactly one tutor.
-- `(select auth.uid())` is evaluated once per statement (Supabase performance advisor).
-- ---------------------------------------------------------------------------------------------

alter table app.profiles      enable row level security;
alter table app.subjects      enable row level security;
alter table app.students      enable row level security;
alter table app.student_rates enable row level security;
alter table app.lessons       enable row level security;
alter table app.payments      enable row level security;

create policy profiles_select_own on app.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on app.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy subjects_all_own on app.subjects for all to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy students_all_own on app.students for all to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy student_rates_all_own on app.student_rates for all to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy lessons_all_own on app.lessons for all to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy payments_all_own on app.payments for all to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));

grant select, update on app.profiles to authenticated;
grant select, insert, update, delete on app.subjects, app.students, app.student_rates, app.lessons, app.payments
  to authenticated;
grant execute on function app.rate_for(uuid, date) to authenticated;
revoke execute on function app.handle_new_user() from public, anon, authenticated;
