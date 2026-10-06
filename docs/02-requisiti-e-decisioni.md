# 02 · Requisiti e decisioni (ADR)

Ogni decisione ha un ID (`D-xx`) citato nel codice e negli altri documenti. I requisiti `R-xx` sono
quelli ricostruiti in [`01-reverse-engineering.md`](01-reverse-engineering.md).

## Stack

**D-01 · Stack.** Backend **Python 3.13 + FastAPI** (Pydantic v2, asyncpg, PyJWT), gestito con `uv`.
Frontend **React 19 + TypeScript + Vite**, TanStack Query (stato server), React Router 7,
Tailwind CSS v4 con token custom, React Aria Components per input accessibili (date/ore in it-IT).
Database e autenticazione: **Supabase** (Postgres 17 + Auth). Test: pytest (Postgres reale), Vitest,
Playwright.

**D-02 · Un solo servizio da deployare.** FastAPI serve sia `/api` sia la build statica della SPA.
Un solo Dockerfile multi-stage, un solo servizio su Render, nessun problema di CORS in produzione.

**D-03 · Accesso al DB dal backend con RLS attiva.** Il backend si collega a Postgres (pooler
Supavisor) con asyncpg. Ogni richiesta autenticata gira in una transazione che esegue
`set local role authenticated` e imposta `request.jwt.claims` con l'utente verificato: le policy
RLS di Supabase valgono **anche** per le query del backend (difesa in profondità: un bug in una query
non può mai esporre dati di un altro insegnante). Solo due operazioni usano il ruolo privilegiato:
la lettura/scrittura dei token Google (tabella senza accesso client) e i job di sincronizzazione.

**D-04 · JWT verificati con JWKS.** Il progetto Supabase firma i token con **ES256**; il backend li
verifica con la chiave pubblica da `/auth/v1/.well-known/jwks.json` (cache in memoria), controllando
`iss`, `aud=authenticated`, `exp`. Nessun segreto condiviso nel backend.

## Dominio

**D-10 · Importi in centesimi interi.** Tutti gli importi (`*_cents`) sono `integer`. Mai float.
Importo lezione = `round(tariffa_oraria_cents × minuti / 60)` (arrotondamento commerciale, metà per
eccesso). Formattazione `it-IT`: `1.234,50 €`.

**D-11 · Lezione = data + ora inizio + ora fine** (R4). Colonne `lesson_date date`,
`start_time time`, `end_time time`, con `check (end_time > start_time)` che garantisce lo stesso
giorno. Il fuso orario è quello del profilo dell'insegnante (default `Europe/Rome`). Più fedele al
dominio di due timestamp e senza ambiguità con l'ora legale.

**D-12 · Un solo studente per lezione** (R3). Le lezioni di gruppo si registrano come una lezione per
studente (il form offre "duplica per un altro studente").

**D-13 · Argomento + Note** (R6). Due campi distinti: **Argomento** (`topic`, una riga, max 200
caratteri, visibile nel libro mastro e nel titolo dell'evento Google) e **Note** (`notes`, testo
libero privato, **non** inviato a Google Calendar). Risolve il dubbio del vocale 6 tenendo separato
ciò che si mostra da ciò che resta privato.

**D-14 · Materie per insegnante.** Tabella `subjects` per utente, precompilata alla registrazione
(Matematica, Fisica, Chimica, Scienze, Italiano, Latino, Inglese, Storia, Filosofia, Informatica);
l'insegnante può aggiungerne, rinominarle o archiviarle. Nel form: menu a tendina (R5).

**D-15 · Metodi di pagamento** (R7): `cash` (Contanti), `bank_transfer` (Bonifico), `other` (Altro,
con nota — es. Satispay/PayPal ricevuti fuori app). Solo registrazione, nessun gateway.

**D-16 · Tariffe con storico + snapshot sulla lezione** (R16 — il punto chiave del vocale 10).
- `student_rates(student_id, hourly_rate_cents, effective_from)`: storico delle tariffe.
- Ogni lezione salva **la tariffa applicata** (`hourly_rate_cents`) al momento della registrazione,
  presa dalla tariffa valida alla data della lezione. Il saldo non si ricalcola mai con la tariffa
  "di oggi": un aumento da settembre non cambia le lezioni di giugno.
- La tariffa della singola lezione è modificabile nel form (lezione scontata, doppia, ecc.).
- Quando si aggiunge una tariffa con decorrenza **nel passato**, l'insegnante sceglie esplicitamente
  se **ri-prezzare** le lezioni già registrate da quella data (`reprice_existing`), con anteprima del
  numero di lezioni e della differenza di importo.

**D-17 · Saldo** (R10, R16). `saldo = Σ pagamenti − Σ importi delle lezioni già concluse`.
- `saldo > 0` → **credito** dello studente (ha anticipato): mostrato anche in ore equivalenti alla
  tariffa corrente ("≈ 3 h 30 min prepagate").
- `saldo < 0` → **debito** dello studente ("Ti deve 45,00 €").
- Le lezioni future non entrano nel saldo, ma la UI mostra anche il **saldo previsto** includendo
  le lezioni programmate.
- Calcolato in SQL tramite viste (`student_balances`, `ledger_entries`) con `security_invoker`,
  così rispetta l'RLS. Nessun valore di saldo duplicato/memorizzato che possa divergere.

**D-18 · Libro mastro + storico immutabile** (R8). Due livelli:
1. **Libro mastro** per studente: lezioni (Dare) e pagamenti (Avere) in ordine cronologico con saldo
   progressivo (vista `ledger_entries`, funzione finestra).
2. **Registro attività** (`activity_log`): ogni insert/update/delete su studenti, tariffe, lezioni e
   pagamenti viene registrato da trigger con lo snapshot JSON prima/dopo. Append-only (nessuna policy
   di update/delete). È la "cronologia degli snapshot" del vocale 3: anche ciò che viene corretto o
   cancellato resta tracciato.

**D-19 · Studenti: archiviazione invece di cancellazione.** Uno studente con lezioni o pagamenti non
si cancella (FK `restrict`): si **archivia**. Cancellazione fisica solo se non ha movimenti.

## Navigazione e UX

**D-20 · Navigazione student-first** (R11). Nessuna pagina globale "tutte le lezioni" o "tutti i
pagamenti". Sezioni: **Oggi** (dashboard), **Studenti** (indice → scheda/libro mastro),
**Agenda** (settimana: solo pianificazione, dal nostro DB), **Impostazioni**. Le azioni
"+ Lezione"/"+ Pagamento" sono sempre raggiungibili e chiedono lo studente come primo campo.

**D-21 · Dashboard "Oggi"** (R9): prossime lezioni (oggi + 7 giorni), chi ti deve soldi (ordinati per
debito), chi ha credito, riepilogo del mese (ore svolte, maturato, incassato).

**D-22 · Homepage pubblica** (R13): landing in italiano che spiega il prodotto con onestà, CTA
"Accedi con Google".

**D-23 · Lingua e formati:** UI solo in italiano (stringhe centralizzate per un futuro i18n),
`it-IT`, settimana da lunedì, 24h, EUR.

**D-24 · Esportazione CSV** del libro mastro (per studente e completo): utile per la contabilità
personale (es. prestazioni occasionali).

## Integrazioni

**D-30 · Autenticazione** (R12): Supabase Auth con **Google** come metodo principale e **magic link
via email** come alternativa (utile finché l'app Google non è verificata e per chi non usa Google).
Per lo sviluppo locale esiste una **modalità demo** (`DEV_AUTH=1`, impossibile da attivare con
`APP_ENV=production`) con token firmati localmente e dati di esempio.

**D-31 · Google Calendar monodirezionale** (R14).
- Scope minimo **`https://www.googleapis.com/auth/calendar.app.created`**: l'app crea un calendario
  secondario "RipetiFlow" nell'account dell'utente e gestisce **solo** gli eventi di quel calendario.
  Non legge né tocca il resto del calendario personale.
- Consenso **incrementale**: il login chiede solo email/profilo; lo scope Calendar si richiede quando
  l'utente attiva la sincronizzazione in Impostazioni. Il refresh token Google viene inviato una volta
  al backend e salvato **cifrato** (Fernet) in una tabella non accessibile dal client.
- L'app è la fonte di verità: create/modifica/cancellazione di una lezione → evento
  creato/aggiornato/cancellato (in background, con stato di sync sulla lezione e retry).
- "Renderlo non modificabile" (vocale 8): Google non permette di bloccare un evento nel calendario del
  proprietario. Soluzione: calendario dedicato + ogni evento marcato con
  `extendedProperties.private.ripetiflow_lesson_id`; il comando **"Risincronizza"** riallinea tutto
  (ricrea eventi mancanti, sovrascrive quelli modificati a mano, elimina quelli orfani). Le modifiche
  fatte su Google non influenzano mai il gestionale.
- Nell'evento: titolo `Materia · Nome Studente`, descrizione con l'argomento e link alla scheda.
  Le **note private non vengono inviate**.
- Verifica Google: con scope "sensibili" l'app in modalità *Testing* è limitata a 100 utenti di test
  (sufficiente per partire); per l'apertura pubblica serve la verifica. Procedura in
  [`08-setup-google.md`](08-setup-google.md).

## Assistente AI

**D-40 · "Matita", assistente con regole rigide.** Dettagli e alternative valutate in
[`06-assistente-matita.md`](06-assistente-matita.md). In sintesi: scrive "a matita" (bozze di lezioni
e pagamenti, risposte su dati dell'utente, bozze di messaggi per studenti/genitori); l'utente
"ripassa a penna" confermando. **Il modello non ha strumenti di scrittura**: legge tramite strumenti
in sola lettura soggetti a RLS e restituisce bozze strutturate validate dal backend.

**D-41 · Modello.** Livello provider-agnostico. Default: **OpenAI `gpt-6-luna`** (Responses API,
$0,10 / $0,50 per milione di token in/out — scelta del committente per costo). Alternativa già
implementata: **Anthropic Claude** (es. `claude-haiku-4-5` o `claude-sonnet-5-5`) cambiando due
variabili d'ambiente. Le regole non dipendono solo dal prompt: sono applicate nel codice (D-42).

**D-42 · Guardrail applicati in codice:** whitelist di strumenti in sola lettura; output finale con
schema JSON obbligatorio (validato con Pydantic, altrimenti risposta di rifiuto standard); limiti di
lunghezza input/output; limite giornaliero di messaggi per utente; nessun accesso a web/URL; i numeri
mostrati nelle bozze vengono dagli strumenti, non dal testo libero del modello; log di utilizzo
(token, costo stimato) per utente.
