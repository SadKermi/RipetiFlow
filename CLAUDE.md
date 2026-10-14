# RipetiFlow — notes for AI agents

Ledger app for private tutors (Italian UI). FastAPI backend + React SPA + Supabase Postgres/Auth.
Start from `README.md`; procedures live in `.claude/skills/` (`ripetiflow-dev`, `ripetiflow-migration`).

## Sources of truth (in order)
1. `docs/02-requisiti-e-decisioni.md` — decisions `D-xx`. Do not contradict one silently; cite it in
   comments where it explains *why* (`# D-16`).
2. `docs/05-api.md` — binding API contract. Change it together with the code, then `make gen-api`.
3. `supabase/migrations/` — applied to the Supabase project `afaowzrghvqnqcovxtqu`. Never edit an
   applied migration; add one (skill `ripetiflow-migration`).
4. `docs/design/02-design-system.md`, `docs/design/03-schermate.md`, `frontend/src/styles/tokens.css`.

## Invariants
- Money is integer cents everywhere (never floats). Lessons are `date + start_time + end_time` in the
  tutor's profile timezone (default `Europe/Rome`). Balances are computed by views, never stored.
- Every backend request runs as the user: one transaction with `role=authenticated` and JWT claims,
  so RLS applies. `privileged_tx` only for Google tokens, calendar jobs and dev tools.
- Errors are RFC 9457 `application/problem+json` with Italian messages and per-field `errors`.
- Matita is read-only: it proposes drafts; only the tutor's explicit confirmation writes data. Numbers
  shown by Matita must come from tool results or the user's own words (guardrails in code, D-42).
- Language: code and comments in English; UI copy and docs in Italian.

## Commands
`make help` lists everything. Before handing work back run the gates of what you touched:
- backend: `make lint` (ruff, format, mypy strict) and `make test-backend` (pytest on real Postgres)
- database: `make db-test`
- frontend: `cd frontend && npm run typecheck && npm run lint && npm run format:check && npx vitest run && npm run build`
- end to end: `make e2e` (Chromium is preinstalled in cloud sessions; never run `playwright install`)

Report gate results as they are, including failures.
