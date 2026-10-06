-- RipetiFlow · Google Calendar one-way sync (D-31) and assistant usage (D-42)

-- ---------------------------------------------------------------------------------------------
-- Google Calendar link: one per tutor. The refresh token is Fernet-encrypted by the backend and
-- its column is never granted to `authenticated` (column-level privileges below).
-- ---------------------------------------------------------------------------------------------

create table app.google_calendar_links (
  tutor_id                 uuid primary key references app.profiles (id) on delete cascade,
  google_email             text check (char_length(google_email) <= 254),
  calendar_id              text check (char_length(calendar_id) <= 300),
  refresh_token_ciphertext text not null,
  scopes                   text[] not null default '{}',
  status                   text not null default 'active' check (status in ('active', 'revoked', 'error')),
  connected_at             timestamptz not null default now(),
  last_synced_at           timestamptz,
  last_error               text check (char_length(last_error) <= 1000),
  updated_at               timestamptz not null default now()
);

create trigger google_calendar_links_set_updated_at before update on app.google_calendar_links
  for each row execute function app.set_updated_at();

alter table app.google_calendar_links enable row level security;
create policy google_calendar_links_select_own on app.google_calendar_links for select to authenticated
  using (tutor_id = (select auth.uid()));
grant select (tutor_id, google_email, calendar_id, scopes, status, connected_at, last_synced_at, last_error, updated_at)
  on app.google_calendar_links to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Transactional outbox: lesson changes are queued in the same transaction and pushed to Google by
-- the backend worker. Changes made directly in Google never flow back (one-way by design).
-- ---------------------------------------------------------------------------------------------

create table app.calendar_outbox (
  id              bigint generated always as identity primary key,
  tutor_id        uuid not null references app.profiles (id) on delete cascade,
  lesson_id       uuid not null,             -- no FK: the lesson may already be deleted
  op              text not null check (op in ('upsert', 'delete')),
  gcal_event_id   text,
  attempts        integer not null default 0,
  last_error      text check (char_length(last_error) <= 1000),
  created_at      timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  processed_at    timestamptz
);

create index calendar_outbox_pending_idx on app.calendar_outbox (next_attempt_at)
  where processed_at is null;
create index calendar_outbox_lesson_idx on app.calendar_outbox (lesson_id, created_at desc);
create index calendar_outbox_tutor_idx on app.calendar_outbox (tutor_id);

alter table app.calendar_outbox enable row level security;
create policy calendar_outbox_select_own on app.calendar_outbox for select to authenticated
  using (tutor_id = (select auth.uid()));
grant select on app.calendar_outbox to authenticated;

create or replace function app.calendar_sync_enabled(p_tutor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.google_calendar_links g
    where g.tutor_id = p_tutor_id and g.status = 'active'
  );
$$;

create or replace function app.enqueue_lesson_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Account deletion cascade: the profile (and its Google link) is already gone.
    if not exists (select 1 from app.profiles where id = old.tutor_id) then
      return null;
    end if;
    if old.gcal_event_id is not null or app.calendar_sync_enabled(old.tutor_id) then
      insert into app.calendar_outbox (tutor_id, lesson_id, op, gcal_event_id)
      values (old.tutor_id, old.id, 'delete', old.gcal_event_id);
    end if;
    return null;
  end if;

  if app.calendar_sync_enabled(new.tutor_id) then
    insert into app.calendar_outbox (tutor_id, lesson_id, op, gcal_event_id)
    values (new.tutor_id, new.id, 'upsert', new.gcal_event_id);
  end if;
  return null;
end;
$$;

revoke execute on function app.enqueue_lesson_sync() from public, anon, authenticated;
revoke execute on function app.calendar_sync_enabled(uuid) from public, anon;
grant execute on function app.calendar_sync_enabled(uuid) to authenticated;

create trigger lessons_calendar_insert after insert on app.lessons
  for each row execute function app.enqueue_lesson_sync();
-- Only fields that appear in the Google event re-trigger a sync (not notes, not bookkeeping).
create trigger lessons_calendar_update
  after update of student_id, subject_id, lesson_date, start_time, end_time, topic on app.lessons
  for each row execute function app.enqueue_lesson_sync();
create trigger lessons_calendar_delete after delete on app.lessons
  for each row execute function app.enqueue_lesson_sync();

-- Renaming a student or a subject refreshes the titles of their upcoming events.
create or replace function app.enqueue_related_lessons_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.calendar_sync_enabled(new.tutor_id) then
    return null;
  end if;

  insert into app.calendar_outbox (tutor_id, lesson_id, op, gcal_event_id)
  select l.tutor_id, l.id, 'upsert', l.gcal_event_id
  from app.lessons l
  where l.tutor_id = new.tutor_id
    and l.lesson_date >= current_date
    and (case when tg_table_name = 'students' then l.student_id else l.subject_id end) = new.id;
  return null;
end;
$$;

revoke execute on function app.enqueue_related_lessons_sync() from public, anon, authenticated;

create trigger students_calendar_rename after update of first_name, last_name on app.students
  for each row when (old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name)
  execute function app.enqueue_related_lessons_sync();
create trigger subjects_calendar_rename after update of name on app.subjects
  for each row when (old.name is distinct from new.name)
  execute function app.enqueue_related_lessons_sync();

-- ---------------------------------------------------------------------------------------------
-- Assistant usage counters (rate limiting + cost visibility) · D-42
-- ---------------------------------------------------------------------------------------------

create table app.assistant_usage (
  tutor_id      uuid not null references app.profiles (id) on delete cascade,
  day           date not null,
  requests      integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_microusd bigint not null default 0,
  primary key (tutor_id, day)
);

alter table app.assistant_usage enable row level security;
create policy assistant_usage_select_own on app.assistant_usage for select to authenticated
  using (tutor_id = (select auth.uid()));
create policy assistant_usage_insert_own on app.assistant_usage for insert to authenticated
  with check (tutor_id = (select auth.uid()));
create policy assistant_usage_update_own on app.assistant_usage for update to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
grant select, insert, update on app.assistant_usage to authenticated;
