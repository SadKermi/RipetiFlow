# RipetiFlow — common commands. Run `make help` for the list.
# Local Postgres (tests and demo mode): any PostgreSQL >= 15 reachable at PG_URL, trust or password auth.

PG_URL      ?= postgresql://postgres@localhost:54329/postgres
DEV_DB      ?= ripetiflow
DEV_DB_URL  := $(patsubst %/postgres,%/$(DEV_DB),$(PG_URL))
PSQL        := psql "$(PG_URL)" -v ON_ERROR_STOP=1 -q
BACKEND     := cd backend &&
FRONTEND    := cd frontend &&

.PHONY: help
help: ## List the available commands
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-18s\033[0m %s\n", $$1, $$2}'

# --- Setup -------------------------------------------------------------------------------------------

.PHONY: install
install: ## Install backend (uv) and frontend (npm) dependencies
	$(BACKEND) uv sync
	@if [ -f frontend/package.json ]; then $(FRONTEND) npm install; fi

# --- Database ----------------------------------------------------------------------------------------

.PHONY: db-reset
db-reset: ## (Re)create the local dev database: Supabase shim + all migrations
	$(PSQL) -c 'drop database if exists "$(DEV_DB)" with (force)' -c 'create database "$(DEV_DB)"'
	psql "$(DEV_DB_URL)" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_shim.sql
	@for f in supabase/migrations/*.sql; do echo "  apply $$f"; psql "$(DEV_DB_URL)" -v ON_ERROR_STOP=1 -q -f "$$f" || exit 1; done

.PHONY: db-test
db-test: ## Run the SQL behaviour tests on a throwaway database
	$(PSQL) -c 'drop database if exists rf_sqltest with (force)' -c 'create database rf_sqltest'
	@psql "$(patsubst %/postgres,%/rf_sqltest,$(PG_URL))" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_shim.sql
	@for f in supabase/migrations/*.sql; do psql "$(patsubst %/postgres,%/rf_sqltest,$(PG_URL))" -v ON_ERROR_STOP=1 -q -f "$$f" || exit 1; done
	psql "$(patsubst %/postgres,%/rf_sqltest,$(PG_URL))" -v ON_ERROR_STOP=1 -q -f supabase/tests/domain_test.sql | grep -E "passed"
	@$(PSQL) -c 'drop database if exists rf_sqltest with (force)'

# --- Development ---------------------------------------------------------------------------------------

.PHONY: dev-backend
dev-backend: ## API on :8000 in demo mode against the local dev database (run db-reset first)
	$(BACKEND) APP_ENV=development DEV_AUTH=1 DATABASE_URL="$(DEV_DB_URL)" \
		uv run uvicorn app.main:create_app --factory --reload --port 8000

.PHONY: seed
seed: ## Recreate the demo tutor's data (backend must be running with DEV_AUTH=1)
	curl -fsS -X POST http://localhost:8000/api/v1/dev/seed && echo

.PHONY: dev-frontend
dev-frontend: ## Vite dev server on :5173 (proxies /api to :8000)
	$(FRONTEND) npm run dev

# --- Quality -------------------------------------------------------------------------------------------

.PHONY: test-backend
test-backend: ## Backend tests (pytest on a real Postgres, see TEST_DATABASE_URL)
	$(BACKEND) TEST_DATABASE_URL="$(PG_URL)" uv run pytest -q

.PHONY: test-frontend
test-frontend: ## Frontend unit tests (Vitest)
	$(FRONTEND) npm test -- --run

E2E_DB      ?= ripetiflow_e2e

.PHONY: e2e
e2e: ## Playwright E2E on a fresh "ripetiflow_e2e" DB (starts backend in demo mode + Vite)
	$(MAKE) --no-print-directory db-reset DEV_DB=$(E2E_DB)
	$(FRONTEND) E2E_DATABASE_URL="$(patsubst %/postgres,%/$(E2E_DB),$(PG_URL))" npm run e2e

.PHONY: gen-api
gen-api: ## Regenerate the frontend API types from the FastAPI app (no server needed)
	$(FRONTEND) npm run gen:api

.PHONY: test
test: db-test test-backend ## All tests that need no browser (SQL + backend + frontend unit)
	@if [ -f frontend/package.json ]; then $(MAKE) test-frontend; fi

.PHONY: lint
lint: ## Lint, format check and type check (backend + frontend)
	$(BACKEND) uv run ruff check . && uv run ruff format --check . && uv run mypy app
	@if [ -f frontend/package.json ]; then $(FRONTEND) npm run lint && npm run format:check && npm run typecheck; fi

.PHONY: format
format: ## Auto-format backend and frontend
	$(BACKEND) uv run ruff format . && uv run ruff check --fix .
	@if [ -f frontend/package.json ]; then $(FRONTEND) npm run format; fi

.PHONY: eval-assistant
eval-assistant: ## Matita behaviour eval against the REAL model (needs OPENAI_API_KEY or ANTHROPIC_API_KEY; costs < $0.05)
	$(BACKEND) uv run python -m tests.assistant_eval.run

# --- Build -----------------------------------------------------------------------------------------------

.PHONY: docker
docker: ## Build the production image
	docker build -t ripetiflow .
