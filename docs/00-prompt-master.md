# 00 · Prompt master — ricostruzione di RipetiFlow con più subagent

> Questo è il prompt operativo usato per orchestrare la costruzione. È scritto per essere letto sia
> da te (sviluppatore) sia dagli agenti. Ogni subagent riceve: questo file + la sezione del proprio
> ruolo + i documenti indicati come "fonti di verità". Puoi riusarlo per future iterazioni:
> aggiorna lo stato in fondo e rilancia solo i ruoli necessari.

## Obiettivo

Ricostruire e migliorare RipetiFlow — gestionale per insegnanti di ripetizioni (oggi Laravel, non
funzionante per gli utenti non autenticati) — con **FastAPI + React/TypeScript + Supabase**, una UI
originale (niente "AI slop") e un assistente AI con regole rigide ("Matita").
Criteri guida, in ordine: **precisione** (i soldi devono tornare al centesimo) → **risultato finale
per l'utente** (registrare una lezione dal telefono in pochi secondi) → **efficienza** (poco codice,
poche dipendenze, query in SQL) → **documentazione** per lo sviluppatore.

## Fonti di verità (in ordine di precedenza)

1. `docs/02-requisiti-e-decisioni.md` — decisioni `D-xx` (non contraddirle; se serve, proponi una modifica motivata)
2. `docs/05-api.md` — contratto API vincolante tra backend e frontend
3. `supabase/migrations/*.sql` — schema già applicato al progetto Supabase (non modificare file esistenti: aggiungi nuove migrazioni)
4. `docs/04-modello-dati.md`, `docs/03-architettura.md`, `docs/06-assistente-matita.md`
5. `docs/design/*` + `frontend/src/styles/tokens.css` — design system (prodotto dal ruolo Designer)
6. `docs/source/trascrizione-vocali.md` — requisiti originali dello sviluppatore precedente

## Ruoli (subagent) e confini

Ogni ruolo possiede delle cartelle. **Nessun ruolo modifica file posseduti da un altro**: se serve un
cambiamento altrove, lo segnala nel report finale. Nessun subagent fa `git commit`/`push`:
l'orchestratore integra, verifica e committa.

| Ruolo | Possiede | Input | Output | Dipende da |
|---|---|---|---|---|
| **Orchestratore** (agente principale) | `docs/0*.md`, `supabase/`, root (`Makefile`, `Dockerfile`, `render.yaml`, `README.md`, `CLAUDE.md`, `.claude/`) | richiesta del committente | piano, migrazioni, integrazione, verifiche finali, commit | — |
| **Designer** | `docs/design/`, `frontend/src/styles/tokens.css`, `frontend/src/styles/fonts.md` | brief prodotto, 3 fonti di ispirazione | ricerca, design system, specifiche schermate, specimen HTML | — |
| **Backend** | `backend/` | 02, 03, 04, 05, 06, migrazioni | API completa + worker calendario + Matita + test | migrazioni |
| **Frontend** | `frontend/` (tranne i file del Designer) | 05, design system, schermate | SPA completa + test | Designer, contratto API |
| **Revisore** | nessuno (solo lettura) | diff completo | report di bug/sicurezza/accessibilità con file:riga | Backend, Frontend |

Parallelismo: Designer ∥ Backend → Frontend (quando design e API sono pronti) → Revisori in parallelo
(correttezza backend, correttezza frontend, sicurezza) → correzioni → verifica E2E dell'orchestratore.

## Standard comuni (tutti i ruoli)

- Lingua: **codice e commenti in inglese**, **testi UI e documentazione in italiano**.
- Commenti solo dove spiegano il *perché*; citare le decisioni come `# D-16`.
- Importi sempre interi in centesimi; mai `float` per i soldi (Python: `int`/`Decimal`; TS: `number` intero + formattazione `Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR'})`).
- Date/ore: `YYYY-MM-DD`, `HH:MM`; fuso del profilo (default `Europe/Rome`). Settimana da lunedì.
- Nessun segreto nel codice o nei log. Variabili in `.env.example` documentate.
- Ogni ruolo esegue **prima di consegnare**: lint + format + typecheck + test del proprio pacchetto, e riporta i comandi e l'esito reale (anche se fallisce).
- Niente dipendenze superflue: ogni dipendenza nuova va giustificata in una riga nel report.

## Ruolo: Backend (FastAPI)

**Stack:** Python 3.13, `uv`, FastAPI, Pydantic v2 + pydantic-settings, asyncpg, PyJWT[crypto]
(+ `PyJWKClient`), httpx (Google API e token), cryptography (Fernet), `openai` e `anthropic` SDK
(ufficiali), pytest + pytest-asyncio + httpx `ASGITransport`, ruff, mypy (strict sul package `app`).

**Struttura:** `app/main.py` (factory, montaggio SPA statica da `STATIC_DIR` con fallback
`index.html`, gestori errori RFC 9457), `app/core/` (settings, auth/JWKS, errori), `app/db/`
(pool asyncpg, transazione "as user", transazione privilegiata), `app/domain/` (query e regole:
students, rates, lessons, payments, ledger, dashboard, activity, export CSV), `app/api/v1/` (router
sottili che chiamano il dominio), `app/calendar/` (client Google, cifratura token, worker outbox),
`app/assistant/` (providers, tools, prompt, orchestratore, guardrail), `app/dev/` (login demo + seed).

**Requisiti precisi:**
1. Implementa **esattamente** `docs/05-api.md` (nomi campi, codici, messaggi in italiano).
2. Accesso DB: ogni richiesta autenticata in una transazione con `set_config('role','authenticated',true)`
   e `set_config('request.jwt.claims', json, true)`; mai filtrare solo in Python: l'RLS è la garanzia,
   i filtri `tutor_id` espliciti sono solo un aiuto al planner. Il pool usa `statement_cache_size=0`
   (compatibilità pooler). Le query vivono in SQL esplicito, parametrizzato.
3. JWT: ES256/RS256 via JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cache 10 min, refetch
   su `kid` sconosciuto), `aud=authenticated`, `iss={SUPABASE_URL}/auth/v1`. In dev (`DEV_AUTH=1` e
   `APP_ENV=development`) accetta anche token HS256 firmati con `DEV_JWT_SECRET`; l'avvio **fallisce**
   se `DEV_AUTH=1` con `APP_ENV=production`.
4. Errori Postgres → errori API: `23503` (FK) → 409 con messaggio chiaro, `23505` → 409, `23514`
   (check) → 422 con campo, `P0001` con hint `RF_NO_RATE` → 422 "Lo studente non ha una tariffa".
5. Calendario: implementa connect/resync/disconnect e il worker outbox come in `03-architettura.md`;
   client Google con httpx (niente SDK Google pesanti); cifratura Fernet; scope
   `calendar.app.created`; descrizione evento senza note private; `extendedProperties.private.ripetiflow_lesson_id`.
   Test con un fake del client Google (nessuna chiamata di rete nei test).
6. Matita: segui `06-assistente-matita.md`. Provider `openai` (Responses API: tool `{"type":"function",
   "name","description","parameters","strict":true}`, risultati come input item
   `{"type":"function_call_output","call_id","output"}`, output finale con
   `text={"format":{"type":"json_schema","name","schema","strict":true}}`, `store=False`,
   `reasoning={"effort":"low"}`; verifica i tipi nel pacchetto `openai` installato prima di scrivere).
   Provider `anthropic`: segui la skill `claude-api` (Python), modello configurabile. Interfaccia
   comune `AssistantProvider` + `FakeProvider` per i test. Limite giri tool = 6. Limite giornaliero.
   Stima costi con tabella prezzi in config.
7. Dev: `POST /dev/login` crea/ritrova l'utente demo in `auth.users` (solo DB locale con shim) e
   `POST /dev/seed` crea 6 studenti realistici (nomi italiani), ~60 lezioni negli ultimi 3 mesi +
   prossime 2 settimane, pagamenti coerenti con debiti e crediti misti, un cambio di tariffa.
8. **Test** (obbligatori, su Postgres reale): crea il DB di test applicando
   `supabase/tests/supabase_shim.sql` + tutte le migrazioni in ordine (fixture di sessione;
   `TEST_DATABASE_URL`, default `postgresql://postgres@localhost:54329/postgres` con creazione di un
   DB temporaneo). Copri: isolamento tra due utenti via API, calcolo saldo/credito in minuti, cambio
   tariffa con e senza `reprice_existing` + preview, libro mastro e saldo progressivo, CSV
   (formato italiano), errori mappati, dashboard, outbox calendario (fake Google), Matita con
   `FakeProvider` (bozze valide/non valide, rifiuto, limite giornaliero, studente di un altro utente
   scartato), dev guard in produzione.
9. Documenta in `backend/README.md`: setup, comandi, struttura, come aggiungere un endpoint.

## Ruolo: Frontend (React)

**Stack:** React 19, TypeScript strict, Vite, React Router 7 (data router), TanStack Query,
Tailwind CSS v4 (con i token del Designer), React Aria Components (date/time/select/dialog
accessibili, `I18nProvider locale="it-IT"`), `@supabase/supabase-js` (solo auth), tipi generati
da OpenAPI con `openapi-typescript` + `openapi-fetch`, Vitest + Testing Library, Playwright (E2E
contro backend in modalità demo). ESLint + Prettier.

**Requisiti precisi:**
1. Implementa le schermate di `docs/design/03-schermate.md` con il design system di
   `docs/design/02-design-system.md`. Rispetta le regole anti-slop del Designer.
2. Rotte: `/` landing pubblica, `/accedi`, `/auth/callback`, `/oggi`, `/studenti`,
   `/studenti/:id` (libro mastro), `/agenda`, `/impostazioni`. Navigazione student-first (D-20):
   nessuna pagina globale lezioni/pagamenti.
3. Form lezione/pagamento/studente/tariffa come dialog (desktop) e bottom sheet (mobile);
   lo studente è il primo campo quando non è implicito; default intelligenti (oggi, orario
   arrotondato al quarto d'ora precedente, durata predefinita del profilo, materia predefinita
   dello studente); anteprima dell'importo in tempo reale; tastiera ottimizzata su mobile.
4. Libro mastro: colonne Data · Descrizione · Dare · Avere · Saldo, righe lezione/pagamento/
   programmata/bozza a matita; saldo grande in testa con stato (debito/credito/in pari) e credito
   in ore; storico modifiche (activity) consultabile.
5. Matita: barra integrata + `⌘K/Ctrl+K`; mostra bozze "a matita" con Conferma/Modifica/Scarta;
   conferma = chiamata API con `X-RipetiFlow-Source: assistant`; stati: idle, attesa, risposta,
   rifiuto, errore, limite raggiunto; bozze messaggio con "Copia" e link WhatsApp (`https://wa.me/?text=`).
6. Auth: Supabase (Google + magic link); in dev pulsante "Entra in modalità demo" se
   `dev_auth_enabled`. Collegamento Google Calendar in Impostazioni (consenso incrementale,
   invio una tantum di `provider_refresh_token`).
7. Accessibilità AA: focus visibile, landmark, label, contrasto, `prefers-reduced-motion`,
   target ≥ 44px. Performance: code splitting per rotta, niente librerie UI pesanti.
8. Test: unit su formattazioni (euro, durate, date it-IT) e componenti chiave; Playwright: login
   demo → crea studente → registra lezione → registra pagamento → verifica saldo; screenshot
   390px e 1440px delle schermate principali in `frontend/e2e/__screenshots__/` (non committati).
9. Documenta in `frontend/README.md`.

## Ruolo: Revisore

Leggi l'intero diff. Cerca: bug di correttezza (soprattutto calcoli di soldi/tempo e fusi orari),
falle di autorizzazione (accesso a dati di altri utenti, bypass RLS, endpoint dev esposti), gestione
segreti, injection (SQL, prompt), errori non gestiti, incoerenze con `05-api.md`, problemi di
accessibilità. Riporta solo problemi verificati, con file:riga, scenario concreto e correzione proposta.

## Definition of Done (verificata dall'orchestratore)

- [ ] `make test` verde: test SQL + backend + frontend unit
- [ ] `make lint` verde: ruff, mypy, eslint, tsc
- [ ] E2E Playwright verde in modalità demo; screenshot mobile/desktop rivisti a occhio
- [ ] Migrazioni applicate al progetto Supabase; advisor di sicurezza senza errori
- [ ] Documentazione: README (avvio in 5 minuti), docs 00–09, README di backend e frontend, `CLAUDE.md`
- [ ] Nessun segreto nel repo; `.env.example` completi
- [ ] Commit atomici e descrittivi sul branch `claude/wonderful-curie-ocb1cj`, push effettuato

## Stato

| Fase | Stato |
|---|---|
| Reverse engineering + trascrizione | ✅ |
| Decisioni, modello dati, contratto API, design Matita | ✅ |
| Migrazioni applicate a Supabase + test SQL | ✅ |
| Design system | in corso |
| Backend | in corso |
| Frontend | da iniziare |
| Revisione + E2E | da iniziare |
