# RipetiFlow · frontend (React)

SPA di RipetiFlow: React 19 + TypeScript (strict) + Vite, React Router 7 (data router), TanStack
Query, Tailwind CSS v4 con i token del Designer, React Aria Components, supabase-js (solo login).
Contratto API in [`docs/05-api.md`](../docs/05-api.md), decisioni in
[`docs/02`](../docs/02-requisiti-e-decisioni.md).

> **Stato:** infrastruttura completa (client API tipizzato, autenticazione, data layer, formati
> italiani, routing, test). Le pagine sono **segnaposto** in HTML semantico che dimostrano il
> collegamento con l'API: le schermate vere arriveranno con i componenti del design system
> ([`docs/design/`](../docs/design/)).

## Avvio rapido (modalità demo)

Servono Node ≥ 22.12, `uv` e un PostgreSQL locale (lo stesso dei test del backend). Dalla radice:

```bash
make install        # uv sync + npm install
make db-reset       # DB "ripetiflow": shim Supabase + migrazioni
make dev-backend    # API su :8000 in modalità demo
make seed           # (altro terminale) dati di esempio
make dev-frontend   # http://localhost:5173 → "Entra in modalità demo"
```

Vite inoltra `/api` a `http://localhost:8000` (cambia destinazione con `RF_API_TARGET`). In
produzione FastAPI serve sia l'API sia la build (`dist/`) sullo stesso dominio (D-02): niente CORS.

## Script

| Comando                           | Cosa fa                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | server di sviluppo Vite su :5173                                                                                  |
| `npm run build`                   | `tsc -b` + build di produzione in `dist/` (usata dal `Dockerfile`)                                                |
| `npm run preview`                 | serve `dist/` su :4173 (con lo stesso proxy `/api`)                                                               |
| `npm run typecheck`               | TypeScript strict (`noUncheckedIndexedAccess`) su app, test e config                                              |
| `npm run lint`                    | ESLint 9 (flat config): typescript-eslint con type checking, react-hooks, jsx-a11y, TanStack Query, react-refresh |
| `npm run format` / `format:check` | Prettier (esclusi i file del Designer)                                                                            |
| `npm test`                        | Vitest in watch; `npm test -- --run` per una sola esecuzione                                                      |
| `npm run e2e`                     | Playwright: avvia backend demo e Vite e lancia `e2e/`                                                             |
| `npm run gen:api`                 | rigenera `src/lib/api/schema.d.ts` dal backend                                                                    |

Dalla radice: `make test-frontend`, `make lint`, `make e2e` (su un DB `ripetiflow_e2e` ricreato da
zero), `make gen-api`.

## Configurazione

Nessuna variabile `VITE_*`: la SPA legge tutto **a runtime** da `GET /api/v1/public/config`
(URL e chiave pubblica di Supabase, metodi di accesso attivi, demo, calendario, assistente). La
stessa build funziona quindi in locale, in staging e in produzione.

| Variabile                        | Dove             | Uso                                                                                    |
| -------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `RF_API_TARGET`                  | `vite.config.ts` | destinazione del proxy `/api` in sviluppo (default `http://localhost:8000`)            |
| `E2E_DATABASE_URL`               | Playwright       | DB del backend per gli E2E (default `…/ripetiflow`; `make e2e` usa `…/ripetiflow_e2e`) |
| `E2E_API_PORT` / `E2E_WEB_PORT`  | Playwright       | porte dei server E2E (default 8010 / 5180, per non disturbare quelli di sviluppo)      |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | Playwright       | binario Chromium alternativo, se quello della versione fissata non c'è                 |

**Supabase (Authentication → URL Configuration):** aggiungi agli URL di redirect consentiti
`https://<dominio>/auth/callback**` (il `**` copre anche `?next=calendar`) e, in sviluppo,
`http://localhost:5173/auth/callback**`.

## Struttura

```
src/
  main.tsx               font (fonts.md) + CSS + <App/>
  app/
    App.tsx              provider: QueryClient → I18nProvider it-IT → Auth → Router (+ error boundary)
    router.tsx           rotte con lazy loading (un chunk per pagina) e guardie
    RootLayout.tsx       RouterProvider di React Aria (link client-side) + ScrollRestoration
    AppShell.tsx         guscio provvisorio delle pagine autenticate (nav, "Esci")
    ErrorBoundary.tsx    errore globale e errorElement delle rotte (anche chunk scaduti dopo un deploy)
    auth/                stato di autenticazione (store.ts), provider, useAuth(), guardie, demo
  routes/                una pagina per file: esporta `Component` (React Router lazy)
  components/            componenti condivisi (oggi solo Loadable; il design system arriverà qui)
  lib/
    api/                 schema.d.ts (generato), client.ts, problem.ts, download.ts (CSV), types.ts
    queries/             hook TanStack Query, chiavi (keys.ts), mappa di invalidazione
    format/              euro, durate, date/ore it-IT, telefoni per wa.me
  styles/                index.css (nostro) · tokens.css e fonts.md (del Designer: non modificarli)
  test/setup.ts          jest-dom, pulizia tra i test
e2e/                     test Playwright
scripts/gen-api.mjs      generazione dei tipi API
```

## Come funziona

### Client API (`src/lib/api`)

- `api` è un client [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) tipizzato sullo schema
  generato. I percorsi si scrivono **senza** `/api/v1`: `api.GET("/students/{student_id}", …)`.
- Ogni richiesta porta `Authorization: Bearer <token>` (dal layer di autenticazione, tramite
  `session.ts`, così client e auth non si importano a vicenda).
- Ogni risposta non 2xx diventa un `ApiProblem` (RFC 9457): `status`, `code`, `title`, `detail`
  (già in italiano), `fieldErrors` (`{campo: messaggio}` da `errors[]`). Senza rete:
  `code: "network_error"`. Un **401** fa uscire l'utente e lo porta ad `/accedi` ("La sessione è
  scaduta"). `errorMessage(e)` dà sempre un testo italiano mostrabile.
- `unwrap(await api.GET(…))` restituisce i dati già tipizzati.
- Le scritture che confermano una bozza di Matita passano `source: "assistant"` agli hook
  (→ header `X-RipetiFlow-Source: assistant`).
- CSV (D-24): `downloadStudentLedgerCsv(id)` e `downloadFullLedgerCsv()` scaricano con il token e
  salvano il file con il nome indicato dal server.

### Autenticazione (`src/app/auth`)

`useAuth()` → `{status: "loading" | "signedOut" | "signedIn", user, config, notice, error,
getAccessToken(), signInWithGoogle(), sendMagicLink(email), signInDemo(), seedDemo(), signOut(),
connectGoogleCalendar(), …}`.

- **Supabase** (se `/public/config` ha URL e chiave pubblica): Google OAuth o magic link, flusso
  PKCE, ritorno su `/auth/callback`. Sessione e rinnovo del token li gestisce supabase-js
  (caricato solo quando serve: la landing e la demo non lo scaricano).
- **Demo** (se `dev_auth_enabled`): `POST /dev/login`, token in `sessionStorage` (solo questa
  scheda); "Esci" lo cancella; "Ricarica i dati demo" chiama `POST /dev/seed`.
- Le rotte protette mandano ad `/accedi` chi non è autenticato (e lo riportano dov'era dopo
  l'accesso); chi è già dentro e apre `/accedi` va a `/oggi`. Cambiando utente o uscendo la cache
  delle query viene svuotata.
- **Google Calendar (D-31), consenso incrementale:** `connectGoogleCalendar()` rilancia l'OAuth
  Google con lo scope `calendar.app.created`, `access_type=offline`, `prompt=consent` (e
  `login_hint` = email attuale) verso `/auth/callback?next=calendar`. Lì il refresh token viene
  letto **una volta**, inviato a `POST /integrations/google-calendar/connect`, poi la sessione viene
  rinnovata perché i token Google non restino nello storage; infine si torna a `/impostazioni`.
  I token del provider non vengono mai registrati nei log né salvati dalla SPA.

### Dati (`src/lib/queries`)

Un hook per ogni endpoint di `docs/05` (profilo, materie, studenti, tariffe + anteprima, libro
mastro, storico a pagine, lezioni per intervallo, lezioni/pagamenti CRUD, dashboard, calendario,
Matita). I tipi vengono **solo** da `schema.d.ts` (alias in `lib/api/types.ts`).

Le chiavi sono gerarchiche (`keys.ts`): `["student", id]` copre dettaglio, libro mastro, storico e
tariffe di quello studente. Dopo ogni scrittura `invalidateAfter()` applica la mappa di
`invalidation.ts` (testata): per esempio una lezione aggiorna lo studente (o i due studenti, se è
stata spostata), tutti gli elenchi studenti, la dashboard, l'agenda e lo stato di sincronizzazione.
I 4xx non vengono ritentati; rete e 5xx sì (2 volte).

### Formati (`src/lib/format`)

- **Euro** dai centesimi senza passare dai float: `formatEuro(123450)` → `"1.234,50 €"` (spazio
  indivisibile prima di €, raggruppamento anche a 4 cifre, `-0` → `0,00 €`).
- **Importi digitati** → centesimi con `parseEuroInput`, `null` se ambiguo. Regola del punto: con
  la virgola, il punto separa solo le migliaia a gruppi di 3 (`"1.234,50"`); senza virgola, un solo
  punto seguito da 1–2 cifre è il decimale (`"12.50"` → 1250, tastiere senza virgola), seguito da
  gruppi di 3 cifre sono migliaia (`"1.234"` → 123400). `"1,234.50"`, `"12,345"` → `null`.
- **Durate**: `90` → `"1 h 30 min"`, credito `"≈ 2 h 16 min"` (`formatCreditMinutes`) o
  `"circa 2 h 16 min"` (`formatCreditMinutesText`, per frasi e `aria-label`: il glifo `≈` non
  esiste nei font dell'interfaccia, vedi `fonts.md`).
- **Date** `YYYY-MM-DD` trattate come giorni di calendario (mai convertite col fuso del browser):
  `"lun 5 ott"`, `"6 ottobre 2026"`, `"oggi"/"domani"/"ieri"` calcolati nel fuso del profilo;
  settimana da lunedì; orario predefinito = adesso arrotondato al quarto d'ora precedente.
- **Telefoni → wa.me**: tolti spazi, punti, trattini, barre e parentesi; `+` o `00` = già
  internazionale; cellulare italiano (3…, 9–10 cifre) o fisso (0…) → prefisso `39`; altrimenti
  `null` (il link WhatsApp parte senza destinatario).

## Aggiungere una pagina

1. Crea `src/routes/<nome>.tsx` che esporta `export function Component() { … }` (testi in
   italiano, landmark e titoli corretti).
2. Registrala in `src/app/router.tsx` con `lazy: () => import("@/routes/<nome>")`, dentro il
   blocco protetto se richiede l'accesso (D-20: niente pagine globali di lezioni o pagamenti).
3. Usa gli hook di `@/lib/queries`; per stati di caricamento/errore provvisori c'è `<Loadable>`.

## Aggiungere una query o una mutation

1. Se l'endpoint è nuovo o cambiato nel backend: `npm run gen:api` (vedi sotto).
2. Nel file dell'area in `src/lib/queries/` aggiungi una factory `xxxQuery = (…) => queryOptions({
queryKey: queryKeys.…, queryFn: async ({ signal }) => unwrap(await api.GET("…", { signal })) })`
   e l'hook `useXxx`. La chiave va in `keys.ts`, sotto il prefisso giusto.
3. Per una mutation chiama `invalidateAfter(queryClient, evento)` in `onSuccess`; se serve un nuovo
   tipo di evento, aggiungilo a `invalidation.ts` **e** al test `invalidation.test.ts`.

## Rigenerare i tipi dell'API

```bash
npm run gen:api     # oppure: make gen-api
```

`backend/scripts/dump_openapi.py` costruisce l'app FastAPI con impostazioni fisse (senza `.env`,
senza avviare il lifespan: nessun DB né rete) e scrive lo schema OpenAPI; `openapi-typescript` lo
trasforma in `src/lib/api/schema.d.ts`, che **va committato**. Rigeneralo a ogni modifica
dell'API: `npm run typecheck` segnala subito dove il frontend non torna più. Le rotte demo
(`/dev/*`) sono escluse di proposito; le loro due forme sono descritte in `app/auth/store.ts`.

## Test

- **Unit (Vitest + Testing Library, jsdom):** formati, `ApiProblem` e client (header, 401, rete,
  abort), store di autenticazione (Supabase e demo finti, consenso calendario), mappa di
  invalidazione, hook di query/mutation, rotte e guardie. Girano nel fuso `Pacific/Kiritimati`
  (UTC+14) per garantire che le date non dipendano dal fuso della macchina.
- **E2E (Playwright, Chromium headless):** `e2e/smoke.spec.ts` avvia backend demo (porta 8010) e
  Vite (5180), entra in modalità demo, ricrea i dati di esempio, verifica gli studenti e il libro
  mastro. Il DB deve esistere: `make e2e` ne crea uno nuovo (`ripetiflow_e2e`); con `npm run e2e`
  basta aver eseguito `make db-reset`. `@playwright/test` è fissato alla versione del Chromium
  installato in `PLAYWRIGHT_BROWSERS_PATH`; altrove: `npx playwright install chromium`.

## Dipendenze (perché ciascuna)

| Pacchetto                                                                                                                                                                             | Perché                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| react, react-dom                                                                                                                                                                      | UI (D-01)                                                                                       |
| react-router                                                                                                                                                                          | rotte con data router e lazy loading per rotta                                                  |
| @tanstack/react-query                                                                                                                                                                 | stato server: cache, invalidazione, retry                                                       |
| openapi-fetch                                                                                                                                                                         | client fetch tipizzato sullo schema (≈ 6 kB)                                                    |
| @supabase/supabase-js                                                                                                                                                                 | solo autenticazione (Google, magic link), caricato su richiesta                                 |
| react-aria-components, @internationalized/date                                                                                                                                        | input accessibili e date in it-IT (usati dai componenti); aritmetica di date nel fuso del tutor |
| tailwindcss, @tailwindcss/vite                                                                                                                                                        | utility CSS sui token del Designer                                                              |
| @fontsource-variable/literata, @fontsource-variable/schibsted-grotesk, @fontsource/ibm-plex-mono                                                                                      | font self-hosted indicati in `fonts.md`                                                         |
| @phosphor-icons/react                                                                                                                                                                 | icone (peso regular) previste dal design system                                                 |
| typescript, vite, @vitejs/plugin-react                                                                                                                                                | build                                                                                           |
| vitest, jsdom, @testing-library/*                                                                                                                                                     | test unitari e di componenti                                                                    |
| @playwright/test                                                                                                                                                                      | E2E                                                                                             |
| openapi-typescript                                                                                                                                                                    | generazione dei tipi API                                                                        |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y, eslint-plugin-react-refresh, @tanstack/eslint-plugin-query, eslint-config-prettier, globals | lint (correttezza, hook, accessibilità, chiavi delle query)                                     |
| prettier                                                                                                                                                                              | formattazione                                                                                   |
