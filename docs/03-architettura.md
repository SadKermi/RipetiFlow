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
Il backend lo cifra (Fernet, chiave `TOKEN_ENCRYPTION_KEY`), riusa il calendario "RipetiFlow" già
collegato o lo crea (`calendars.insert`) e accoda la sync delle lezioni future.

**Sync calendario (outbox).** Finché il link è `active`, i trigger su `app.lessons` inseriscono righe
in `app.calendar_outbox` nella stessa transazione della modifica. Il worker (loop asyncio ogni 10 s +
"kick" immediato dopo ogni scrittura) prende le righe con `for update skip locked`, accorpa più
operazioni sulla stessa lezione (vince l'ultima), ottiene un access token dal refresh token
(`oauth2.googleapis.com/token`), chiama `events.insert/update/delete`, aggiorna
`gcal_event_id`/`gcal_synced_at`. Ogni evento porta `extendedProperties.private.ripetiflow_lesson_id`:
un evento che esiste già per la lezione viene adottato, mai duplicato. Ogni evento è inviato con
`status: confirmed`, così un evento eliminato a mano (Google lo conserva come `cancelled`) torna
visibile al primo aggiornamento.
- **Errori**: 8 tentativi con attese di 1, 5, 15, 60, 120, 240, 360 min (1 min → 6 h); dopo l'ottavo
  la riga resta in errore finché "Risincronizza" o un nuovo "Collega" la riarmano. Il messaggio salvato
  (mostrato sulla lezione) è in italiano; il testo originale di Google finisce solo nei log.
  `invalid_grant` → link `revoked`, righe in errore con l'invito a ricollegare. Il link passa a
  `revoked` solo se contiene ancora il token rifiutato: un "Collega" arrivato nel frattempo non viene
  annullato.
- **Stati del link**: `active` → `revoked` (token rifiutato da Google) o `disconnected` ("Scollega":
  token revocato e cancellato, `calendar_id` conservato; per l'utente la riga non esiste, la RLS la
  nasconde). "Collega", "Risincronizza", "Scollega" e il ripristino del calendario sono serializzati
  per insegnante: prima un lock in-process (più richieste dello stesso insegnante aspettano senza
  occupare connessioni del pool), poi un advisory lock Postgres (`pg_advisory_xact_lock`), valido
  anche fra più processi. La transazione del lock resta aperta durante le chiamate a Google.
- **Collega**: senza lo scope Calendar concesso risponde 422 prima di qualsiasi chiamata al calendario.
  Riusa il calendario salvato se esiste ancora (`calendars.get`; `calendarList.list` non è consentito
  da `calendar.app.created`), altrimenti ne crea uno nuovo e azzera i `gcal_event_id`. Accoda le
  lezioni da oggi in poi **più quelle che la sync ha perso mentre il link non era attivo** (già
  inviate e modificate dopo l'ultimo invio, oppure mai inviate e create dopo il collegamento
  precedente: lo storico anteriore al primo collegamento non parte nemmeno se nel frattempo è stato
  ritoccato, es. ricalcolo tariffe o note) e riarma le righe in sospeso; se riusa il calendario dopo
  una pausa chiede anche la pulizia degli orfani.
- **Risincronizza** (`upcoming`/`all`): verifica il permesso con un refresh nuovo (accesso rimosso
  dall'account Google → 409 e link `revoked`), riaccoda le lezioni del perimetro sostituendo solo i loro
  upsert in sospeso; tutte le altre righe (cancellazioni, modifiche fuori perimetro, righe ferme) vengono
  riarmate, non scartate. La richiesta di pulizia è salvata in `google_calendar_links.sweep_requested_at`
  (sopravvive ai riavvii) e il worker la esegue quando la coda dell'insegnante è vuota. La pulizia decide
  solo da `ripetiflow_lesson_id`: elimina gli eventi senza proprietà, di lezioni che non esistono (o non
  sono dell'insegnante) e i doppioni; gli eventi di lezioni esistenti senza `gcal_event_id` vengono
  adottati (l'id viene riscritto). Gli eventi delle lezioni passate non vengono mai cancellati. Se
  fallisce, la pulizia viene rimandata di 15 min (niente richieste a Google a ogni giro).
- **Calendario eliminato a mano su Google**: al primo 404 (worker, pulizia, Risincronizza o nuovo
  Collega) il backend crea un nuovo calendario, aggiorna il link, azzera i `gcal_event_id` e riaccoda
  le lezioni future e tutte quelle che avevano un evento. Se la creazione fallisce vale il backoff
  normale.

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
