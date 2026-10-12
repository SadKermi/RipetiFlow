-- RipetiFlow · explicit "rate typed by hand" flag on lessons (D-16) + grant hardening.
--
-- Repricing used to guess which lessons follow the rate history by comparing the stored rate with
-- app.rate_for(). That guess breaks as soon as the history changes around a lesson (earliest-rate
-- fallback, deleted rates) and it cannot tell "typed by hand" from "equal to the history".
-- The flag is decided once, when the rate is written, and repricing only touches lessons with
-- rate_overridden = false.

alter table app.lessons add column rate_overridden boolean not null default false;

-- Existing rows: a rate different from the history at write time was typed by hand.
update app.lessons
   set rate_overridden = hourly_rate_cents is distinct from app.rate_for(student_id, lesson_date);

-- INSERT: a missing rate is taken from the history (not overridden); an explicit rate is an
-- override only when it differs from the history (a client that always sends the prefilled rate
-- does not freeze lessons by accident).
-- UPDATE: when the rate changes, the same rule decides the flag again; repricing writes exactly
-- the history rate, so repriced lessons stay "following the history".
create or replace function app.lessons_fill_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_history integer;
begin
  if tg_op = 'UPDATE' and new.hourly_rate_cents is not distinct from old.hourly_rate_cents then
    return new;
  end if;

  v_history := app.rate_for(new.student_id, new.lesson_date);

  if new.hourly_rate_cents is null then
    if v_history is null then
      raise exception 'student % has no hourly rate', new.student_id
        using errcode = 'P0001', hint = 'RF_NO_RATE';
    end if;
    new.hourly_rate_cents := v_history;
    new.rate_overridden := false;
  else
    new.rate_overridden := new.hourly_rate_cents is distinct from v_history;
  end if;
  return new;
end;
$$;

create trigger lessons_fill_rate_on_update before update of hourly_rate_cents on app.lessons
  for each row execute function app.lessons_fill_rate();

-- The flag is bookkeeping, not a user edit: keep it out of the activity diff.
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
  v_ignored text[] := array['updated_at', 'gcal_event_id', 'gcal_synced_at', 'rate_overridden'];
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

-- Audit finding sec-07: the triggers that call this security definer function run as its owner,
-- so `authenticated` never needs it, and granting it let a tutor probe another tutor's link.
revoke execute on function app.calendar_sync_enabled(uuid) from authenticated;
