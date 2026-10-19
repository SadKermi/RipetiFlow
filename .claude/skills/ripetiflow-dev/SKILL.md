---
name: ripetiflow-dev
description: "Use when running, testing or changing RipetiFlow code: starting the backend/frontend locally in demo mode, logging in as the demo tutor, seeding data, running the quality gates, adding an API endpoint or a screen/form, regenerating the API types, running Playwright E2E or taking screenshots, or recovering the local Postgres in a cloud container."
---

# RipetiFlow · development

Read `CLAUDE.md` first (sources of truth and invariants). Schema changes: use `ripetiflow-migration`.

## Run the app locally (demo mode)
```bash
make db-reset        # DB "ripetiflow" on localhost:54329: Supabase shim + all migrations
make dev-backend     # :8000, APP_ENV=development DEV_AUTH=1 (demo login allowed on a local DB only)
make seed            # POST /api/v1/dev/seed: deterministic students, lessons, payments, a rate change, debts and credits
make dev-frontend    # :5173, proxies /api to :8000 → "Prova la demo"
```
Demo token without the UI: `curl -s -X POST localhost:8000/api/v1/dev/login` → `{access_token}`;
then `-H "Authorization: Bearer <token>"`. Interactive API docs: http://localhost:8000/api/docs.
Assistant in dev: `ASSISTANT_PROVIDER=none` (disabled) unless a real key is set; tests use the
`FakeProvider` injected through `create_app(..., assistant_provider=...)`.

## Gates (run what you touched; report results as they are)
| Area | Command |
|---|---|
| backend | `make lint` · `make test-backend` (`cd backend && uv run pytest -q -k <expr>` for a subset) |
| SQL | `make db-test` |
| frontend | `cd frontend && npm run typecheck && npm run lint && npm run format:check && npx vitest run && npm run build` |
| E2E | `make e2e` (fresh DB `ripetiflow_e2e`, backend on :8010 and Vite on :5180 started by Playwright) |

## Add an API endpoint
1. Update `docs/05-api.md` (binding contract).
2. Pydantic models in `backend/app/schemas.py` (snake_case, cents), SQL and rules in
   `backend/app/domain/<area>.py`, thin router in `backend/app/api/v1/<area>.py` with `conn: UserConn`.
3. Errors via `invalid()/not_found()/conflict()` from `app.core.errors` (Italian text, field name).
4. Tests in `backend/tests/test_<area>.py` using `conftest.py` fixtures (`make_user`, `client`,
   `create_student`, …): assert exact values and cross-tenant isolation.
5. `make gen-api` so `frontend/src/lib/api/schema.d.ts` matches, then fix the TypeScript errors.

## Add a screen or form (frontend)
- Route file `frontend/src/routes/<name>.tsx` exporting `Component` (lazy), registered in
  `src/app/router.tsx`; feature code in `src/features/<area>/`; reuse `src/components/` (design
  system «Registro») and only the tokens in `src/styles/tokens.css` (no raw colours).
- Data: hooks in `src/lib/queries/` (keys in `keys.ts`, every mutation invalidates through
  `invalidation.ts`); formatting only via `src/lib/format` (it-IT, cents → euro).
- Server errors: map problem+json to fields with the helper in `src/lib/forms/`.
- Copy and layout come from `docs/design/03-schermate.md` (mobile 390 and desktop 1440).
- Tests next to the code (`*.test.tsx`, Vitest + Testing Library); journeys in `frontend/e2e/`.
  `make screens` reruns the E2E and saves screenshots to `docs/design/screens/` for design review
  (`make e2e` alone does not write them: the demo data depends on today's date).

## Cloud container quirks
- Local Postgres may stop when the container restarts. If `pg_isready -h localhost -p 54329` fails:
  ```bash
  rm -f /var/tmp/rf-pgdata/postmaster.pid
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/rf-pgdata -o '-p 54329 -k /tmp' -l /var/tmp/rf-pgdata/log.txt start"
  ```
- Chromium is at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`); never run `playwright install`.
- The remote Supabase project is shared production data: no writes outside `ripetiflow-migration`.
