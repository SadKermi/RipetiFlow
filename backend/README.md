# RipetiFlow · backend (FastAPI)

API REST di RipetiFlow: libro mastro per insegnanti di ripetizioni. Contratto in
[`docs/05-api.md`](../docs/05-api.md), decisioni in [`docs/02`](../docs/02-requisiti-e-decisioni.md).

## Avvio rapido (modalità demo, senza Google né chiavi AI)

Serve un PostgreSQL ≥ 15 locale (lo stesso dei test). Dalla radice del repository:

```bash
make install          # uv sync (+ npm install se esiste il frontend)
make db-reset         # crea il DB "ripetiflow": shim Supabase + tutte le migrazioni
make dev-backend      # http://localhost:8000  ·  docs interattive: /api/docs
make seed             # (in un altro terminale) dati di esempio per l'utente demo
```

Il login demo: `POST /api/v1/dev/login` restituisce un token per l'utente demo
(`demo@ripetiflow.local`). Funziona **solo** con `APP_ENV=development`, `DEV_AUTH=1` e un database
locale: con un `DATABASE_URL` remoto l'avvio fallisce apposta.

Variabili d'ambiente: copia [`.env.example`](.env.example) in `.env`. I segreti facoltativi
(Google, OpenAI/Anthropic, `TOKEN_ENCRYPTION_KEY`) si lasciano commentati: un valore vuoto vale
"non configurato" e la funzione corrispondente risulta non disponibile in `/api/v1/public/config`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `make test-backend` | pytest su un Postgres reale (crea e poi elimina un DB temporaneo) |
| `make db-test` | test SQL del modello dati (`supabase/tests/domain_test.sql`) |
| `make lint` | `ruff check`, `ruff format --check`, `mypy app` (strict) |
| `make eval-assistant` | valutazione di Matita contro il modello reale (richiede la chiave, costo < 0,05 $) |
| `uv run uvicorn app.main:create_app --factory` | avvio manuale (factory: le impostazioni si leggono all'avvio) |

`TEST_DATABASE_URL` (default `postgresql://postgres@localhost:54329/postgres`) indica il server su
cui i test creano il loro database.

## Struttura

```
app/
  main.py            factory, lifespan (pool, JWKS, calendario, Matita), OpenAPI, SPA statica
  core/              settings (pydantic-settings), auth (JWT ES256 via JWKS + token demo), errori RFC 9457
  db/pool.py         pool asyncpg; user_tx (ruolo authenticated + claims → RLS) e privileged_tx
  api/deps.py        dipendenze: utente corrente, transazione per richiesta, Problem
  api/v1/            router sottili: core (profilo, materie, dashboard), students, lessons, calendar,
                     assistant, dev (solo demo)
  domain/            regole e query SQL: students, rates, lessons, payments, ledger (+CSV),
                     dashboard, activity, profile, subjects, common
  calendar/          client Google (httpx), cifratura token (Fernet), worker outbox
  assistant/         Matita: providers (OpenAI, Anthropic, Fake), tools in sola lettura, guardrail,
                     prompt di sistema in italiano (prompt_it.md)
  dev/seed.py        dati demo deterministici
tests/               pytest su Postgres reale; assistant_eval/ = valutazione col modello reale
```

## Modello di sicurezza (D-03)

- Ogni richiesta autenticata gira in **una transazione** con `role = authenticated` e
  `request.jwt.claims` impostati dal token verificato: le policy RLS di Supabase si applicano anche
  alle query del backend. I filtri `tutor_id` nel SQL aiutano il planner, ma la garanzia è l'RLS.
- Solo due percorsi usano il ruolo proprietario (`privileged_tx`): token Google e job del calendario,
  e gli strumenti di sviluppo.
- Lo schema `app` **non** è esposto dalla Data API di Supabase: si entra solo dal backend.
- Errori sempre in `application/problem+json`, messaggi in italiano, mai stack trace al client.

## Aggiungere un endpoint

1. Leggi/aggiorna il contratto in `docs/05-api.md` (è vincolante per il frontend).
2. Modello Pydantic in `app/schemas.py` (campi `snake_case`, importi in centesimi).
3. Logica e SQL in `app/domain/<area>.py`: funzioni `async def f(conn: Conn, ...)`, SQL esplicito e
   parametrizzato, errori con `invalid()/not_found()/conflict()` di `app.core.errors`.
4. Router sottile in `app/api/v1/<area>.py` con `conn: UserConn` (transazione utente).
5. Test in `tests/test_<area>.py` con le fixture di `tests/conftest.py`
   (`make_user`, `client`, `create_student`…): verifica valori esatti e isolamento tra utenti.
6. `make lint test-backend`.

Se serve una modifica al database segui la skill `.claude/skills/ripetiflow-migration`.

## Matita in breve

Il modello **non ha strumenti di scrittura**: legge i dati dell'utente con strumenti in sola lettura
(transazione `readonly`, RLS) e restituisce una risposta strutturata; il backend ricalcola importi e
tariffe delle bozze dal database, scarta bozze non valide o di altri utenti e verifica che le cifre
mostrate provengano dai dati. Le bozze diventano dati solo quando l'utente le conferma dal frontend
(`POST /lessons`, `POST /payments` con `X-RipetiFlow-Source: assistant`). Dettagli e guardrail:
[`docs/06-assistente-matita.md`](../docs/06-assistente-matita.md).
