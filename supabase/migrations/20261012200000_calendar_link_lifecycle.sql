-- RipetiFlow · Google Calendar link lifecycle (D-31)
--
-- "Scollega" no longer deletes the link row: it becomes `disconnected`, the encrypted refresh token is
-- erased and the calendar id is kept, so a later "Collega" re-uses the same "RipetiFlow" calendar
-- (calendarList.list is not allowed by the calendar.app.created scope, so the id is the only way to
-- find it again). For the tutor a disconnected link does not exist: the RLS policy hides it, so the
-- API reports `connected=false` and lessons show the calendar state "off".
--
-- `sweep_requested_at` persists the orphan-removal request made by "Risincronizza" (and by a reconnect
-- that re-uses the calendar). The worker runs the sweep once the tutor's outbox has drained and the
-- time is reached; a failed sweep is postponed by moving the time forward, so a restart never loses
-- it and Google is not polled on every worker iteration.

alter table app.google_calendar_links
  alter column refresh_token_ciphertext drop not null,
  add column sweep_requested_at timestamptz;

alter table app.google_calendar_links drop constraint google_calendar_links_status_check;
alter table app.google_calendar_links add constraint google_calendar_links_status_check
  check (status in ('active', 'revoked', 'error', 'disconnected'));
-- A disconnected link never keeps a token; every other link has one.
alter table app.google_calendar_links add constraint google_calendar_links_token_check
  check ((status = 'disconnected') = (refresh_token_ciphertext is null));

-- Column privileges are unchanged: `authenticated` still cannot read refresh_token_ciphertext, and the
-- new sweep_requested_at column is backend bookkeeping (not granted).
drop policy google_calendar_links_select_own on app.google_calendar_links;
create policy google_calendar_links_select_own on app.google_calendar_links for select to authenticated
  using (tutor_id = (select auth.uid()) and status <> 'disconnected');

-- Due sweeps are looked up by the worker on every iteration.
create index google_calendar_links_sweep_idx on app.google_calendar_links (sweep_requested_at)
  where sweep_requested_at is not null;

-- Lesson changes are queued only while the link is `active` (not revoked, failed or disconnected);
-- "Collega" re-queues what changed in the meantime. Same body as before, restated for clarity.
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

revoke execute on function app.calendar_sync_enabled(uuid) from public, anon, authenticated;
