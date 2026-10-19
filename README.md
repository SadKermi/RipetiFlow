# RipetiFlow

Gestionale per insegnanti di ripetizioni: studenti, lezioni, pagamenti e un **libro mastro per
studente** che dice al centesimo chi deve cosa. Agenda settimanale, sincronizzazione monodirezionale
con Google Calendar ed esportazione CSV. **Matita** è l'assistente integrato: risponde sui tuoi dati
e prepara bozze "a matita" che diventano registrazioni solo dopo la tua conferma ("a penna").

Ricostruzione del vecchio RipetiFlow (Laravel), basata su reverse engineering del sito pubblico,
vecchio repository e note vocali dello sviluppatore originale ([`docs/01`](docs/01-reverse-engineering.md),
[`docs/source/`](docs/source/)).

| Parte | Tecnologia |
|---|---|
| Backend | Python 3.13, FastAPI, Pydantic v2, asyncpg, uv |
| Frontend | React 19, TypeScript strict, Vite, React Router 7, TanStack Query, React Aria, Tailwind v4 |
| Database e login | Supabase: Postgres 17 (schema `app` con RLS), Auth (Google + magic link) |
| Assistente | OpenAI Responses API (`gpt-6-luna`) o Anthropic, strumenti in sola lettura e guardrail nel codice |
| Deploy | un'unica immagine Docker su Render (FastAPI serve anche la SPA) |

## Avvio in locale (modalità demo: niente Google, niente chiavi AI)

Requisiti: PostgreSQL ≥ 15 su `localhost:54329` (o imposta `PG_URL`), Python con `uv`, Node ≥ 22.12.

```bash
make install        # dipendenze backend (uv) e frontend (npm)
make db-reset       # DB locale "ripetiflow": shim Supabase + tutte le migrazioni
make dev-backend    # API su http://localhost:8000 (docs: /api/docs), login demo abilitato
make seed           # in un altro terminale: dati d'esempio per l'utente demo
make dev-frontend   # SPA su http://localhost:5173 → «Prova la demo»
```

`make help` elenca tutti i comandi. I più usati:

| Comando | Cosa fa |
|---|---|
| `make test` | test SQL + backend (pytest su Postgres reale) + frontend (Vitest) |
| `make e2e` | Playwright su un DB nuovo: avvia backend demo e Vite da solo |
| `make screens` | come `make e2e`, e rigenera gli screenshot in `docs/design/screens/` (390 e 1440 px) |
| `make lint` / `make format` | ruff + mypy strict, ESLint + Prettier + tsc |
| `make gen-api` | rigenera i tipi TypeScript dell'API dal backend (dopo ogni modifica al contratto) |
| `make eval-assistant` | valuta Matita contro il modello reale (serve la chiave, costo < 0,05 $) |
| `make docker` | build dell'immagine di produzione |

## Struttura

```
backend/     API FastAPI, worker Google Calendar, Matita        → backend/README.md
frontend/    SPA React                                          → docs/07-frontend.md
supabase/    migrations/ (allineate al progetto remoto), tests/ (shim + test SQL)
docs/        documentazione di progetto (italiano)
.claude/     skill per gli agenti AI (sviluppo, migrazioni, Supabase)
Dockerfile, render.yaml, Makefile
```

## Documentazione

| Documento | Contenuto |
|---|---|
| [00 · Prompt master](docs/00-prompt-master.md) | come è stato orchestrato il lavoro tra più agenti, ruoli, definizione di "fatto", stato |
| [01 · Reverse engineering](docs/01-reverse-engineering.md) | analisi del sito e del repository originali |
| [02 · Requisiti e decisioni](docs/02-requisiti-e-decisioni.md) | requisiti e decisioni `D-xx`: **la fonte di verità** |
| [03 · Architettura](docs/03-architettura.md) | flussi (login, richieste come utente, sync calendario), variabili d'ambiente |
| [04 · Modello dati](docs/04-modello-dati.md) | tabelle, viste del saldo, RLS, trigger |
| [05 · API](docs/05-api.md) | contratto REST vincolante tra backend e frontend, errori RFC 9457 |
| [06 · Assistente Matita](docs/06-assistente-matita.md) | concetto, regole, strumenti, guardrail, scelta del modello |
| [07 · Frontend](docs/07-frontend.md) | struttura della SPA, componenti, dati, test |
| [08 · Setup Google](docs/08-setup-google.md) | client OAuth, scope Calendar, verifica dell'app |
| [09 · Deploy](docs/09-deploy.md) | Render + Supabase, variabili, migrazione dal vecchio servizio |
| [design/](docs/design/) | ricerca, design system «Registro», schermate, specimen, screenshot |

## Cose da sapere prima di andare in produzione

- **Migrazione da applicare**: `supabase/migrations/20261012200000_calendar_link_lifecycle.sql` non è
  ancora sul progetto Supabase (la conferma per le istruzioni `DROP` richiesta dal connettore non
  arriva in tempo). Va incollata nel SQL Editor del progetto prima di avviare questo backend
  contro il database di produzione; poi si registra nello storico (skill `ripetiflow-migration`).
- **Vecchio sito**: risponde con `APP_DEBUG=true` (stack trace e configurazione visibili a chiunque
  provochi un errore). Va spento subito, indipendentemente da questa ricostruzione ([docs/01](docs/01-reverse-engineering.md)).
- **`DATABASE_URL`**: serve la password del database Supabase (Project Settings → Database), usata
  solo dal backend; lo schema `app` non è esposto dalla Data API.
- **Google Calendar**: lo scope `calendar.app.created` è sensibile; finché l'app non è verificata
  funziona solo per gli utenti di test e i token scadono ogni 7 giorni ([docs/08](docs/08-setup-google.md)).
- **Matita**: senza `OPENAI_API_KEY` (o `ANTHROPIC_API_KEY` con `ASSISTANT_PROVIDER=anthropic`) l'app
  funziona e l'assistente risulta semplicemente non disponibile.
