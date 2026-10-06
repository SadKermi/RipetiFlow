# 01 · Reverse engineering di RipetiFlow (versione Laravel)

Data analisi: 2026-10-06. Fonti: sito pubblico `https://ripetiflow.onrender.com/`, repository
`github.com/matteoples/ripetiflow`, note vocali del vecchio sviluppatore
([trascrizione](source/trascrizione-vocali.md)).

## 1. Sito in produzione

| Aspetto | Evidenza | Conclusione |
|---|---|---|
| Stack | Header `x-powered-by: PHP/8.2.30`, cookie `ripetiflow-session` + `XSRF-TOKEN`, pagina di errore Laravel | **Laravel 12.56** su PHP 8.2, dietro nginx su **Render** + Cloudflare |
| Frontend | `/build/manifest.json` con solo `resources/css/app.css` e `resources/js/app.js` | Blade + Vite + Tailwind 4 (template di default), nessuna SPA |
| Homepage `/` | È la pagina *welcome* di default di Laravel ("Let's get started") | **Nessuna homepage reale** (confermato nel vocale 8) |
| Health | `/up` → 200 "Application up" | Health-check standard Laravel 11+ |
| Rotte protette | `/dashboard`, `/students`, `/lessons`, `/calendar`, `/settings` rispondono 500 | Esistono, protette dal middleware `auth` |
| Controller | Pagina di debug: `App\Http\Controllers\DashboardController@index`, route name `dashboard`, middleware `web, auth, set.sourceURL` | Controller per sezione + middleware custom `set.sourceURL` (probabilmente memorizza l'URL di provenienza per i redirect dopo i form) |
| Logout | `/logout` → 405 su GET | Rotta `POST /logout` presente |
| Login | `/login`, `/register` → 404; errore `Route [login] not defined` | Il login avveniva **solo via Google OAuth** (vocale 7) su un percorso diverso; il middleware `auth` cerca la rotta `login` che non esiste → **gli utenti non autenticati ricevono un errore 500 invece di un redirect** |

### ⚠️ Problemi di sicurezza rilevati sul sito attuale
1. **`APP_DEBUG=true` in produzione.** Ogni errore mostra la pagina di debug completa: stack trace,
   versioni, header della richiesta (inclusi IP dei visitatori), corpo della richiesta e query SQL.
   **Azione consigliata subito:** su Render impostare `APP_DEBUG=false` e `APP_ENV=production`.
2. Le rotte protette restituiscono 500 anziché 302 verso il login (manca la rotta `login`).

La nuova versione elimina entrambi i problemi: niente pagine di debug in produzione (FastAPI
restituisce errori JSON RFC 7807 senza stack trace) e redirect espliciti lato SPA.

Per correttezza: l'analisi del sito si è limitata alle pagine pubbliche e alle pagine di errore
esposte senza autenticazione; non è stato tentato alcun accesso alle aree protette.

## 2. Repository `matteoples/ripetiflow`

3 commit: `Blank Laravel Project`, `Delete cartella intermedia "laravel"`, `Aggiunti DockerFile`.
Contiene solo lo scheletro Laravel 12 (modello `User`, migrazioni standard `users`/`cache`/`jobs`,
vista `welcome`) e un `DockerFile` (PHP 8.2-FPM, `php artisan serve` sulla porta 8000).
**Nessuna logica di dominio**: lo sviluppo vero è avvenuto altrove e non è pubblico.
Utilità per noi: conferma lo stack e il deploy (Docker su Render), nient'altro.

## 3. Ricostruzione funzionale (dalle note vocali)

| # | Requisito originale | Fonte |
|---|---|---|
| R1 | Utenti target: insegnanti di ripetizioni (lo sviluppatore, Simone) | vocale 2 |
| R2 | Anagrafica studenti | vocale 2 |
| R3 | Lezioni: quando, con chi, quanto dura; un solo studente per lezione, molte lezioni per studente | vocali 2, 6 |
| R4 | Lezione nello **stesso giorno**, orario di inizio e fine | vocale 6 |
| R5 | Materia da menu a tendina (italiano, inglese, storia, informatica, …) | vocale 6 |
| R6 | Campo note usato come "argomento" — decidere se note, argomento o entrambi | vocale 6 |
| R7 | Pagamenti registrati a mano: importo, data, metodo (bonifico/contanti); **nessun gateway** | vocale 2 |
| R8 | "Libro mastro": storico cronologico di lezioni e pagamenti | vocale 3 |
| R9 | All'apertura: prossime lezioni + situazione contabile (debiti/crediti) | vocale 4 |
| R10 | Debito = lo studente deve ore pagate; credito = ha anticipato soldi → credito di ore | vocale 4 |
| R11 | **Niente** pagine globali "tutte le lezioni"/"tutti i pagamenti": navigazione per studente | vocale 5 |
| R12 | Login con Google (richiede verifica dell'app da parte di Google) | vocale 7 |
| R13 | Homepage pubblica mancante | vocale 8 |
| R14 | Sync **monodirezionale** lezioni → Google Calendar dell'account di login | vocale 8 |
| R15 | Form CRUD per studenti, lezioni, pagamenti | vocale 9 |
| R16 | Saldo oggi calcolato al volo (ore × tariffa − pagamenti): **riprogettare** per gestire cambi di tariffa nel tempo | vocale 10 |

Le decisioni prese su ognuno di questi punti sono in [`02-requisiti-e-decisioni.md`](02-requisiti-e-decisioni.md).
