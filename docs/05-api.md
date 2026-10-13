# 05 · Contratto API (v1)

Contratto **vincolante** tra backend (FastAPI) e frontend (React). Lo schema OpenAPI generato da
FastAPI è disponibile in sviluppo su `/api/docs`; questo documento ne è la specifica di riferimento.
Il frontend genera i tipi TypeScript da `/api/openapi.json` (`npm run gen:api`).

## Convenzioni

- Base path: `/api/v1`. JSON UTF-8. Nomi dei campi in `snake_case`.
- Autenticazione: `Authorization: Bearer <access_token Supabase>` su tutte le rotte tranne
  `GET /api/health`, `GET /api/v1/public/config` e (solo in dev) `POST /api/v1/dev/login`.
- Header opzionale `X-RipetiFlow-Source: assistant` sulle scritture che confermano una bozza di
  Matita → il registro attività marca la modifica come `assistant`.
- ID: UUID v4 stringa (eccezione: `Activity.id` e i cursori sono stringhe opache). Date: `YYYY-MM-DD`. Orari: `HH:MM` (24h, minuti interi).
  Timestamp: ISO 8601 con offset. Importi: **interi in centesimi** (`*_cents`). Durate: minuti.
- Liste: `{"items": [...], "next_cursor": string|null}` quando paginabili, altrimenti `{"items": [...]}`.
- Errori: `application/problem+json` (RFC 9457):
  ```json
  {"type": "https://ripetiflow.app/errors/validation", "title": "Dati non validi", "status": 422,
   "detail": "L'orario di fine deve essere successivo a quello di inizio.",
   "code": "validation_error", "errors": [{"field": "end_time", "message": "..."}]}
  ```
  Codici (`code`): `unauthorized` 401, `forbidden` 403, `not_found` 404, `method_not_allowed` 405,
  `conflict` 409, `validation_error` 422, `rate_limited` 429, `internal_error` 500,
  `upstream_error` 502, `unavailable` 503 (funzione non configurata: assistente o calendario).
  Messaggi `title`/`detail` **in italiano**, pronti per la UI. Mai stack trace.
  Un riferimento inesistente o di un altro utente nel body (es. `student_id`, `subject_id`) è un
  errore del modulo: 422 sul campo, non 404/409. Qualunque percorso sconosciuto sotto `/api` → 404.

## Health e configurazione pubblica

| Metodo | Percorso | Risposta |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","version":"x.y.z","db":"ok"}` |
| GET | `/api/v1/public/config` | `{"supabase_url","supabase_publishable_key","google_login_enabled","magic_link_enabled","dev_auth_enabled","calendar_sync_available","assistant_available"}` |

## Profilo

`Profile`: `{id, email, full_name, timezone, default_lesson_minutes, default_hourly_rate_cents|null, created_at}`

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| GET | `/me` | — | `Profile` |
| PATCH | `/me` | `{full_name?, timezone?, default_lesson_minutes?, default_hourly_rate_cents?}` | `Profile` |

`timezone` validato contro i nomi IANA (`zoneinfo`).

## Materie

`Subject`: `{id, name, position, archived: bool}`

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| GET | `/subjects?include_archived=false` | — | `{items: Subject[]}` ordinate per `position, name` |
| POST | `/subjects` | `{name}` | `Subject` 201 (409 se nome duplicato, case-insensitive) |
| PATCH | `/subjects/{id}` | `{name?, position?, archived?}` | `Subject` |
| DELETE | `/subjects/{id}` | — | 204 (le lezioni collegate restano, materia → `null`) |

## Studenti

`StudentSummary` (lista):
```
{id, first_name, last_name, display_name, grade, school, archived: bool,
 balance: Balance, next_lesson: {date, start_time} | null, last_lesson_date | null}
```
`Balance`:
```
{balance_cents, projected_balance_cents, charged_cents, paid_cents, scheduled_cents,
 done_minutes, scheduled_minutes, current_hourly_rate_cents | null,
 status: "debt" | "credit" | "settled",            // dal segno di balance_cents
 credit_minutes | null}                             // credito in minuti alla tariffa corrente (solo se credit)
```
`Student` (dettaglio) = tutti i campi anagrafici
`{first_name, last_name, school, grade, email, phone, guardian_name, guardian_email, guardian_phone, notes, default_subject_id}`
+ `id, display_name, archived, created_at, balance: Balance, rates: Rate[]`.

`Rate`: `{id, hourly_rate_cents, effective_from, created_at}`

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| GET | `/students?q=&archived=false&sort=name\|balance\|next_lesson` | — | `{items: StudentSummary[]}` |
| POST | `/students` | campi anagrafici + `hourly_rate_cents` (obbl.) + `rate_effective_from?` (default oggi) | `Student` 201 |
| GET | `/students/{id}` | — | `Student` |
| PATCH | `/students/{id}` | campi anagrafici parziali | `Student` |
| POST | `/students/{id}/archive` · `/unarchive` | — | `Student` |
| DELETE | `/students/{id}` | — | 204, oppure 409 `conflict` se ha lezioni/pagamenti ("Archivia invece di eliminare") |

### Tariffe (D-16)

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| GET | `/students/{id}/rates` | — | `{items: Rate[]}` (desc per data) |
| POST | `/students/{id}/rates/preview` | `{hourly_rate_cents, effective_from}` | `{affected_lessons, current_total_cents, new_total_cents, delta_cents}` — vedi "Regola di ricalcolo" |
| POST | `/students/{id}/rates` | `{hourly_rate_cents, effective_from, reprice_existing: bool}` | `{rate: Rate, repriced_lessons: int}` 201 (409 se esiste già una tariffa con la stessa data) |
| DELETE | `/students/{id}/rates/{rate_id}?reprice_existing=false` | — | 204 (422 se è l'unica tariffa). Con `reprice_existing=true` le lezioni governate dalla tariffa eliminata tornano alla tariffa dello storico |

**Regola di ricalcolo (D-16).** Una tariffa con decorrenza D governa le lezioni con data in
[D, decorrenza della tariffa successiva). Il ricalcolo (`reprice_existing`) tocca solo le lezioni di
quella finestra che **seguono lo storico**: una lezione con tariffa **scritta a mano** diversa da
quella dello storico (sconto, lezione doppia) non viene mai modificata. Il database decide il flag
(`rate_overridden`) quando la tariffa viene scritta; l'anteprima usa esattamente la stessa regola.

### Libro mastro e storico

`LedgerEntry`:
```
{kind: "lesson"|"payment", id, date, start_time|null, end_time|null, duration_minutes|null,
 hourly_rate_cents|null, subject: {id,name}|null, topic|null, method|null, note|null,
 debit_cents, credit_cents, settled: bool, running_balance_cents,
 calendar: {status: "off"|"pending"|"synced"|"error", error|null} | null}   // solo lezioni
```

| Metodo | Percorso | Risposta |
|---|---|---|
| GET | `/students/{id}/ledger?from=&to=&order=desc` | `{items: LedgerEntry[], balance: Balance}` (default: tutto, ordine decrescente per la UI) |
| GET | `/students/{id}/ledger.csv` | `text/csv; charset=utf-8` (separatore `;`, decimali con virgola, BOM per Excel) |
| GET | `/students/{id}/activity?limit=50&before=` | `{items: Activity[], next_cursor}` — `Activity: {id, entity, entity_id, action, source, occurred_at, summary, changes: [{field, before, after}]}` con `summary` in italiano ("Lezione del 12/09 modificata: fine 16:30 → 17:00") |
| GET | `/export/ledger.csv` | CSV completo di tutti gli studenti |

## Lezioni

`Lesson`:
```
{id, student: {id, display_name}, subject: {id,name}|null, date, start_time, end_time,
 duration_minutes, hourly_rate_cents, amount_cents, topic|null, notes|null, settled: bool,
 calendar: {status, error|null}, created_at, updated_at}
```
`LessonInput`: `{student_id, subject_id?, date, start_time, end_time, hourly_rate_cents?, topic?, notes?}`
- `hourly_rate_cents` omesso → tariffa valida alla data (dallo storico). Una tariffa inviata uguale
  a quella dello storico conta come "segue lo storico"; diversa, come "scritta a mano".
- In PATCH la tariffa **non** si ricalcola cambiando data: si cambia solo se inviata esplicitamente.
  Eccezione: spostando la lezione su **un altro studente** senza inviare la tariffa, una lezione che
  seguiva lo storico prende la tariffa dello storico del nuovo studente (una tariffa scritta a mano
  resta invariata).
- Validazioni: fine > inizio, minuti interi, durata ≤ 12h, data entro ±2 anni da oggi.

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| GET | `/lessons?from=YYYY-MM-DD&to=YYYY-MM-DD&student_id=` | — | `{items: Lesson[]}` — **solo per Agenda/Dashboard**, intervallo massimo 62 giorni (422 oltre) |
| POST | `/lessons` | `LessonInput` | `Lesson` 201 |
| GET | `/lessons/{id}` | — | `Lesson` |
| PATCH | `/lessons/{id}` | `LessonInput` parziale | `Lesson` |
| DELETE | `/lessons/{id}` | — | 204 |
| POST | `/lessons/{id}/duplicate` | `{student_id?, date?}` (body facoltativo) | `Lesson` 201 (lezioni di gruppo / ripetizione settimanale). Stesso studente: una tariffa scritta a mano viene copiata, altrimenti si riprende dallo storico alla nuova data; altro studente: sempre dal suo storico |

## Pagamenti

`Payment`: `{id, student: {id, display_name}, amount_cents, paid_on, method: "cash"|"bank_transfer"|"other", note|null, created_at, updated_at}`

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| POST | `/payments` | `{student_id, amount_cents, paid_on, method, note?}` | `Payment` 201 |
| GET | `/payments/{id}` | — | `Payment` |
| PATCH | `/payments/{id}` | parziale | `Payment` |
| DELETE | `/payments/{id}` | — | 204 |

(Nessun `GET /payments` globale: i pagamenti si consultano nel libro mastro dello studente — D-20.)

## Dashboard "Oggi"

`GET /dashboard?days=7` →
```
{today: "YYYY-MM-DD",
 upcoming: Lesson[],                                  // da adesso a oggi+days, ordinate
 owing: StudentSummary[],                             // status=debt, ordinati per debito decrescente
 in_credit: StudentSummary[],                         // status=credit
 totals: {owed_to_you_cents, credit_held_cents},
 month: {label: "ottobre 2026", lessons, minutes, earned_cents, collected_cents},
 calendar: {connected: bool, pending: int, errors: int}}
```

## Google Calendar (D-31)

`CalendarStatus`: `{available: bool, connected: bool, google_email|null, calendar_id|null, status: "active"|"revoked"|"error"|null, last_synced_at|null, last_error|null, pending: int, errors: int}`

| Metodo | Percorso | Body | Risposta |
|---|---|---|---|
| GET | `/integrations/google-calendar` | — | `CalendarStatus` |
| POST | `/integrations/google-calendar/connect` | `{provider_refresh_token, provider_token?}` | `CalendarStatus` — salva il token cifrato, riusa il calendario "RipetiFlow" già collegato in precedenza (o lo crea), accoda la sync delle lezioni da oggi in poi e di quelle cambiate mentre il link non era attivo. 422 `validation_error` su `provider_refresh_token` se Google rifiuta il token o se manca il permesso Calendar |
| POST | `/integrations/google-calendar/resync` | `{scope: "upcoming"\|"all"}` | `{queued: int}` 202 — riallinea tutto (ricrea mancanti, sovrascrive modifiche manuali, rimuove orfani; ricrea il calendario se è stato eliminato). 409 se non collegato o revocato |
| DELETE | `/integrations/google-calendar?remove_calendar=false` | — | 204 — revoca il token (poi `GET` risponde `connected=false`, `status=null`); se `remove_calendar=true` elimina anche il calendario "RipetiFlow" (se Google non risponde: 502 `upstream_error` e il collegamento resta attivo) |

## Assistente Matita (D-40…D-42)

`POST /assistant/messages`
```
Request:  {messages: [{role: "user"|"assistant", content: string}],   // max 20 turni, ultimo = user, ≤ 2000 caratteri
           context: {student_id?: uuid, today?: "YYYY-MM-DD"}}          // pagina corrente, opzionale
Response: {reply: string,                                               // testo per l'utente (markdown limitato: grassetto, elenchi)
           drafts: Draft[],                                             // 0..5 bozze "a matita"
           refused: bool,                                               // true = richiesta fuori ambito
           usage: {requests_today, daily_limit}}
```
`Draft` (unione discriminata da `type`):
```
{type: "lesson",  id, student: {id, display_name}, subject: {id,name}|null, date, start_time, end_time,
                  hourly_rate_cents, amount_cents, topic|null, notes|null, warnings: string[]}
{type: "payment", id, student: {id, display_name}, amount_cents, paid_on, method, note|null, warnings: string[]}
{type: "message", id, recipient_hint: string, channel: "whatsapp"|"email"|"sms", text: string}
```
- Le bozze **non** sono salvate: il frontend le conferma chiamando `POST /lessons` o
  `POST /payments` con `X-RipetiFlow-Source: assistant`.
- `warnings`: es. "Esiste già una lezione con Luca il 06/10 alle 15:00" (controllo duplicati),
  "Data nel futuro: la lezione sarà programmata".
- 429 `rate_limited` oltre il limite giornaliero (default 60 richieste/utente/giorno; il giorno è
  quello di Europe/Rome, indipendente dal fuso del profilo).
- 502 `upstream_error` se il provider fallisce o la richiesta supera il tempo massimo
  (`ASSISTANT_TOTAL_TIMEOUT_SECONDS`, default 60 s).
- 503 se nessun provider è configurato (`assistant_available=false` in `/public/config`).
- Output del modello non valido → `reply` fisso "Non sono riuscito a preparare una risposta
  affidabile…" con `refused: false` (dettagli in docs/06 §4). I turni `assistant` iniziali vengono
  ignorati.

## Solo sviluppo (`APP_ENV=development` **e** `DEV_AUTH=1`)

| Metodo | Percorso | Risposta |
|---|---|---|
| POST | `/dev/login` | `{access_token, user: {id, email}}` — token firmato con chiave locale per l'utente demo (creato al primo uso) |
| POST | `/dev/seed` | `{students, lessons, payments}` — cancella e ricrea i dati di esempio dell'utente demo |

Queste rotte **non vengono montate** in produzione. L'avvio fallisce se `DEV_AUTH=1` con
`APP_ENV=production` **oppure** con un `DATABASE_URL` non locale. I token demo valgono solo per
l'utente demo (id fisso), mai per un utente reale.
