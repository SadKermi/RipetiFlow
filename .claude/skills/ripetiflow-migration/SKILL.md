---
name: ripetiflow-migration
description: "Use for ANY change to the RipetiFlow database schema (tables, columns, RLS policies, views, triggers, functions, indexes) or when the schema and the Supabase project may be out of sync. Covers writing the migration, testing it on local Postgres with the Supabase shim, applying it to the Supabase project via MCP, aligning the migration version filename, and running the advisors."
---

# RipetiFlow · database migrations

The schema lives in `supabase/migrations/` and is already applied to Supabase project
`ripetiflow` (ref `afaowzrghvqnqcovxtqu`). Never edit an applied migration: add a new one.
Also load the vendored `supabase-postgres-best-practices` skill for SQL style and RLS rules.

## Invariants (do not break)
- Domain tables live in schema `app`, which must NOT be exposed via the Data API.
- Every table has `tutor_id uuid not null default auth.uid()` (or is keyed by it), RLS enabled, and
  policies `using/with check (tutor_id = (select auth.uid()))` for `authenticated` only.
- Child tables reference students/subjects with composite FKs `(x_id, tutor_id)` (FK checks bypass RLS).
- Money is integer cents; lessons are `lesson_date + start_time + end_time`; balances are computed in
  views with `security_invoker = true`, never stored.
- `security definer` functions: `set search_path = ''`, fully-qualified names, and
  `revoke execute ... from public, anon, authenticated` unless callers need it.
- Triggers that write during deletes must tolerate the account-deletion cascade (see `log_activity`).

## Workflow
1. Write `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql` (temporary timestamp).
2. Test locally (Postgres ≥ 15; `make db-test` does this):
   ```bash
   createdb -h localhost -p 54329 -U postgres rf_mig
   psql ... -d rf_mig -v ON_ERROR_STOP=1 -f supabase/tests/supabase_shim.sql
   for f in supabase/migrations/*.sql; do psql ... -d rf_mig -v ON_ERROR_STOP=1 -f "$f"; done
   psql ... -d rf_mig -v ON_ERROR_STOP=1 -f supabase/tests/domain_test.sql
   ```
   Extend `supabase/tests/domain_test.sql` with assertions for the new behaviour, then run the backend
   tests (`make test-backend`), which rebuild a test DB from the same files.
3. Apply to Supabase with the MCP tool `apply_migration` (project_id `afaowzrghvqnqcovxtqu`, name =
   the snake_name). Then `list_migrations` and **rename the local file to the remote version number**
   so `supabase db push` stays consistent.
4. Run `get_advisors` (security and performance). Fix any security finding before finishing; the
   "unused index" INFO on fresh tables is expected.
5. Update `docs/04-modello-dati.md` if the model changed, and the API contract `docs/05-api.md` if the
   API surface changed.

## Verifying RLS on the real project without leaving data behind
Wrap the check in a `do $$ ... $$` block that ends with `raise exception 'RESULT %', ...;` — the
exception rolls back everything and the message carries the result.
