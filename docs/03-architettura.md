# 03 · Architettura

```
                       ┌──────────────────────────── Render (1 servizio Docker) ───────────────────────────┐
  Browser              │  FastAPI (uvicorn)                                                                  │
  ┌───────────────┐    │  ├─ /            → SPA React (build statica, fallback a index.html)                 │
  │ React SPA     │───▶│  ├─ /api/v1/*    → router REST (Pydantic v2)                                        │
  │ supabase-js   │    │  │     └─ auth: verifica JWT ES256 via JWKS Supabase                                │
  │ (solo login)  │    │  │     └─ db: asyncpg → transazione "as user" (role authenticated + claims → RLS)   │
  └──────┬────────┘    │  ├─ worker calendario (task asyncio in-process) ─▶ Google Calendar API              │
         │             │  └─ assistente Matita ─▶ OpenAI Responses API (o Anthropic)                         │
         │ OAuth       └───────────────────────────────┬───────────────────────────────────────────────────────┘
         ▼                                             │ Supavisor pooler (5432, session)
  Supabase Auth (Google, magic link) ◀──── JWKS ───────┤
                                                       ▼
                                          Supabase Postgres 17 · schema `app` (non esposto via Data API)
```

## Flussi principali

**Login.** La SPA chiama `supabase.auth.signInWithOAuth({provider: 'google'})` (o magic link).
Supabase restituisce una sessione; la SPA invia `access_token` come Bearer a FastAPI. FastAPI lo
verifica (firma ES256 con la JWKS del progetto, `iss`, `aud`, `exp`) e ricava `sub` = id utente.
Il profilo e le materie predefinite sono creati dal trigger `on_auth_user_created_ripetiflow`.

**Richiesta autenticata.** `Depends(user_db)` apre una transazione e imposta
`set_config('role','authenticated',true)` + `set_config('request.jwt.claims', <claims>, true)`
(+ `app.source` se l'header `X-RipetiFlow-Source` è `assistant`). Tutte le query girano con RLS.
Commit a fine richiesta, rollback su errore.

**Collegamento Google Calendar.** Impostazioni → "Collega Google Calendar" → la SPA rilancia
`signInWithOAuth` con `scopes: 'https://www.googleapis.com/auth/calendar.app.created'` e
`queryParams: {access_type: 'offline', prompt: 'consent'}`. Al ritorno legge
`session.provider_refresh_token` e lo invia **una volta** a `POST /integrations/google-calendar/connect`.
Il backend lo cifra (Fernet, chiave `TOKEN_ENCRYPTION_KEY`), crea il calendario "RipetiFlow"
(`calendars.insert`) e accoda la sync delle lezioni future.

**Sync calendario (outbox).** I trigger su `app.lessons` inseriscono righe in `app.calendar_outbox`
nella stessa transazione della modifica. Il worker (loop asyncio ogni 10 s + "kick" immediato dopo
ogni scrittura) prende le righe con `for update skip locked`, accorpa più operazioni sulla stessa
lezione, ottiene un access token dal refresh token (`oauth2.googleapis.com/token`), chiama
`events.insert/patch/delete`, aggiorna `gcal_event_id`/`gcal_synced_at`. Errori: backoff
esponenziale (1 min → 6 h, max 8 tentativi); `invalid_grant` → link `revoked` e avviso in UI.

**Matita.** Vedi [`06-assistente-matita.md`](06-assistente-matita.md).

## Struttura del repository

```
backend/            FastAPI (uv): app/{api,core,db,domain,calendar,assistant,dev}, tests/
frontend/           React + Vite: src/{app,routes,features,components,lib,styles}
supabase/           migrations/ (versioni allineate al progetto remoto), tests/ (shim + test SQL)
docs/               questa documentazione (IT)
.claude/skills/     skill di progetto per gli agenti AI (sviluppo, UI, migrazioni)
Dockerfile          build multi-stage (node → python), un solo servizio
render.yaml         blueprint Render
Makefile            comandi comuni (dev, test, lint, db)
```

## Configurazione (variabili d'ambiente)

| Variabile | Dove | Descrizione |
|---|---|---|
| `APP_ENV` | backend | `development` \| `production` |
| `DATABASE_URL` | backend | Postgres (pooler Supabase, sessione, porta 5432) — utente `postgres` |
| `SUPABASE_URL` | backend, frontend | `https://afaowzrghvqnqcovxtqu.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | frontend (via `/public/config`) | chiave pubblica `sb_publishable_...` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | backend | stesso client OAuth configurato in Supabase (serve per rinnovare i token Calendar) |
| `TOKEN_ENCRYPTION_KEY` | backend | chiave Fernet (base64, 32 byte) per i refresh token Google |
| `ASSISTANT_PROVIDER` | backend | `openai` (default) \| `anthropic` \| `none` |
| `ASSISTANT_MODEL` | backend | default `gpt-6-luna` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | backend | chiave del provider scelto |
| `ASSISTANT_DAILY_LIMIT` | backend | default `60` |
| `PUBLIC_APP_URL` | backend | URL pubblico (link nelle descrizioni degli eventi, redirect OAuth) |
| `DEV_AUTH` | backend | `1` abilita login demo **solo** con `APP_ENV=development` |
