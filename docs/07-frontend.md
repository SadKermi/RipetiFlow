# 07 · Frontend

Guida per chi sviluppa la SPA di RipetiFlow (`frontend/`). Descrive il codice com'è: dove sta cosa,
come le schermate corrispondono a [`design/03-schermate.md`](design/03-schermate.md), quali
componenti usare, come passano i dati, come si testa e come si aggiunge una schermata o un modulo.

Avvio rapido, script npm, variabili d'ambiente e dipendenze sono in
[`frontend/README.md`](../frontend/README.md); le procedure per gli agenti nella skill
`ripetiflow-dev` (`.claude/skills/ripetiflow-dev/`).

**Fonti di verità**, in quest'ordine: decisioni `D-xx` in [02](02-requisiti-e-decisioni.md) →
contratto API in [05](05-api.md) → design system [`design/02-design-system.md`](design/02-design-system.md)
(qui «02 §x») e schermate [`design/03-schermate.md`](design/03-schermate.md) («03 §x») →
`frontend/src/styles/tokens.css`. Il codice cita queste sezioni nei commenti: quando un testo o una
misura sembra strano, il commento in testa al file dice da dove viene.

---

## 1. In breve

| Cosa | Scelta |
|---|---|
| UI | React 19, TypeScript strict (`noUncheckedIndexedAccess`), Vite 8 |
| Rotte | React Router 7 (data router), **un chunk per pagina** (`lazy`) |
| Stato server | TanStack Query 5: chiavi gerarchiche + una mappa di invalidazione unica |
| API | `openapi-fetch` tipizzato su `src/lib/api/schema.d.ts`, generato dal backend (`make gen-api`) |
| Errori | RFC 9457 → `ApiProblem` (testi già in italiano) → errori sui campi |
| Componenti | React Aria Components (tastiera, focus, ARIA) con l'aspetto del design system «Registro» |
| Stile | Tailwind CSS v4 **solo** sui token di `tokens.css` (la palette di default è azzerata) |
| Icone / font | `@phosphor-icons/react` (peso regular), Literata · Schibsted Grotesk · IBM Plex Mono via `@fontsource` |
| Date | giorni `YYYY-MM-DD` nel fuso del **profilo** del tutor, mai in quello del browser (`@internationalized/date`) |
| Auth | supabase-js (Google, link via email) caricato su richiesta; modalità demo con `DEV_AUTH` |
| Test | Vitest + Testing Library (jsdom), Playwright (Chromium) a 390 e 1440 px |

Invarianti che valgono anche qui (vedi `CLAUDE.md`): importi sempre in **centesimi interi**; saldi
solo come li calcola il server (`balance_cents`, `credit_minutes`), mai ricalcolati; ogni testo
dell'interfaccia in italiano; Matita non scrive mai da sola.

---

## 2. Struttura di `frontend/src`

```
src/
  main.tsx                 font (styles/fonts.md) → index.css → <App/>
  app/                     cablaggio dell'applicazione (niente schermate)
    App.tsx                AppErrorBoundary → QueryClientProvider → I18nProvider it-IT → AuthProvider → RouterProvider
    router.tsx             tabella delle rotte (lazy), guardie, slot di Matita intorno all'AppShell
    RootLayout.tsx         RouterProvider di React Aria (link client-side) + ToastProvider + ScrollRestoration
    AppShell.tsx           guscio delle pagine autenticate (tab bar / barra in alto, banner demo, slot Matita)
    ErrorBoundary.tsx      AppErrorBoundary (fuori dal router) e RouteError (errorElement, chunk scaduti)
    auth/                  AuthStore (macchina a stati senza React), AuthProvider, useAuth(), guardie, useSeedDemo
  routes/                  un file per URL; esporta solo `Component` e delega a una feature
  features/                le schermate e la loro logica, per area
    landing/               landing «/», accesso «/accedi», «/auth/callback», MatitaDemo, ExampleLedger
    dashboard/             «Oggi» (TodayScreen)
    students/              «Studenti» (StudentsScreen) e la scheda studente (StudentPage)
    ledger/                il registro dello studente (StudentLedger), «Storico modifiche» (ActivitySheet)
    agenda/                settimana: WeekGrid (desktop), DayList (mobile), helper puri in week.ts
    settings/              Impostazioni: Profilo, Materie, Aspetto/Esporta/Demo/Esci, tema, gestione del focus
    calendar/              sezione «Google Calendar» di Impostazioni
    forms/                 i moduli di 03 §7 (lezione, pagamento, tariffa, studente, conferme) + modelli puri
    matita/                l'assistente: riga, barra mobile, ⌘K, bozze, note, sessione
  components/              UI kit del design system (02 §9), importato da "@/components"
    shell/                 TabBar, TopNav, AccountMenu, DemoBanner, SkipLink, Wordmark, slot di Matita
  lib/
    api/                   client.ts (openapi-fetch + middleware), problem.ts (ApiProblem), session.ts,
                           types.ts (alias dei tipi generati), download.ts (CSV), schema.d.ts (GENERATO)
    queries/               hook TanStack Query per area, keys.ts, invalidation.ts, client.ts (QueryClient)
    forms/                 problem → errori dei campi, useFormErrors, lettura degli orari digitati
    format/                euro, durate, date, orari, telefoni → wa.me (it-IT)
  styles/                  index.css (nostro) · tokens.css e fonts.md (del Designer: non riformattarli)
  test/setup.ts            jest-dom, pulizia e storage svuotati dopo ogni test
e2e/                       Playwright: fixtures.ts, ui.ts e i percorsi *.spec.ts
scripts/gen-api.mjs        rigenera schema.d.ts dal FastAPI (nessun server né DB)
```

**Direzione delle dipendenze** (oggi rispettata, tenetela così):
`routes → features → components / lib`, `app → tutto`. `components/` e `lib/` non importano mai da
`features/` o da `app/`; l'unico punto in cui il guscio «vede» Matita è il contesto
`MatitaSlotContext` (§8). Tra feature si importa poco e in modo esplicito: `forms` è usato da tutte
le schermate, `settings/focus.ts` dalle pagine che eliminano righe, `ledger` dalla scheda studente,
`calendar` da Impostazioni e dal callback.

Alias `@/` = `src/`. ESLint vieta `console.log` (solo `warn`/`error`), impone `import type` e
controlla accessibilità (`jsx-a11y`), hook e chiavi delle query.

---

## 3. Dalle schermate di 03 al codice

### 3.1 Pagine

| URL | Rotta | Componente (feature) | 03 | Screenshot (`docs/design/screens/`) |
|---|---|---|---|---|
| `/` | `routes/landing.tsx` | `landing/LandingPage` (+ `ExampleLedger`, `MatitaDemo`) | §1 | `landing` |
| `/accedi` | `routes/accedi.tsx` | `landing/SignInPage` (dentro `RedirectIfSignedIn`) | §2 | `accedi` |
| `/auth/callback` | `routes/auth-callback.tsx` | `landing/AuthCallbackPage` | §2, §8 | — |
| `/oggi` | `routes/oggi.tsx` | `dashboard/TodayScreen` | §3 | `oggi`, `oggi-scuro` |
| `/studenti` | `routes/studenti.tsx` | `students/StudentsScreen` | §4 | `studenti` |
| `/studenti/:id` | `routes/studente.tsx` | `students/StudentPage` → `ledger/StudentLedger`, `ledger/ActivitySheet` | §5, §5.1 | `studente*`, `storico-modifiche` |
| `/agenda` | `routes/agenda.tsx` | `agenda/AgendaPage` → `WeekGrid` (≥ 1024 px) / `DayList` | §6 | `agenda`, `agenda-nuova-lezione` |
| `/impostazioni` | `routes/impostazioni.tsx` | `settings/SettingsPage` → `ProfileSection`, `SubjectsSection`, `calendar/CalendarSection`, `OtherSections` | §8 | `impostazioni*`, `materia-elimina` |
| qualsiasi altro | `routes/not-found.tsx` | `PageMessage` «Pagina non trovata» | §10.3 | `pagina-non-trovata` |

Le pagine da `/oggi` in giù stanno dentro `RequireAuth` + `AppShell`; nessuna pagina globale di
lezioni o pagamenti (D-20). `routes/studente.tsx` monta `StudentPage` con `key={id}`: passare a un
altro studente riparte da zero (dialoghi chiusi, finestra dei mesi azzerata).

Parametri d'indirizzo usati dalle schermate:

| Parametro | Dove | Effetto |
|---|---|---|
| `?riga=<id>` | `/studenti/:id` (link da Oggi e Agenda) | evidenzia quella riga del registro per 1,2 s |
| `?promemoria=1` | `/studenti/:id` (pulsante «Promemoria» di Oggi) | chiede a Matita il promemoria una volta, poi il parametro viene tolto (`replace`) così ricarica e Indietro non lo ripetono |
| `?settimana=<lunedì>` | `/agenda` | settimana mostrata; assente = settimana corrente |
| `?next=calendar` | `/auth/callback` | ritorno dal consenso Google Calendar (§7) |

### 3.2 Moduli e conferme (03 §7)

Tutti in `features/forms/`, esportati da `@/features/forms`. Ogni modulo ha un **modello puro**
(`*-model.ts`: valori iniziali, validazione locale con gli stessi testi del server, corpo di
POST/PATCH, mappa campo API → campo del modulo) testato a parte in `models.test.ts`.

| 03 | Componente | Modello / testi |
|---|---|---|
| §7.1 Lezione | `LessonFormDialog` (nuova e modifica; `initial`, `source`) | `lesson-model.ts`, `lib/forms/time.ts` |
| §7.2 Pagamento | `PaymentFormDialog` (con la riga «Dopo: …») | `payment-model.ts`, `money-words.ts` |
| §7.3 Cambio tariffa | `RateChangeDialog`, `DeleteRateDialog` (anteprima dopo 300 ms, scelta esplicita D-16) | `RateDialogs.tsx`, `ChoiceGroup` |
| §7.4 Studente | `StudentFormDialog` (tariffa chiesta solo alla creazione) | `student-model.ts` |
| §7.5 Conferme | `DeleteLessonDialog`, `DeletePaymentDialog`, `ArchiveStudentDialog`, `DeleteStudentDialog` | `effects.ts` (frasi con i numeri veri) |
| §5 lezioni di gruppo | `DuplicateToStudentDialog` | — |
| menu «⋯» | `ActionMenu` | — |

Dopo un salvataggio: toast con «Annulla» (`useUndoToast` + funzioni di `undo.ts`, che lavorano
sul `QueryClient` perché il toast sopravvive al modulo); testi dei toast in `messages.ts`.

### 3.3 Stati comuni (03 §10)

| Stato | Come si fa |
|---|---|
| Caricamento | `SkeletonRows` (barre statiche, compaiono dopo 300 ms, `aria-busy`), o `Loadable` che lo fa da sé |
| Errore di caricamento | `LoadErrorBand` con «Riprova»; con dati in cache restano visibili in ink-2 e la banda dice di quando sono (`Loadable`) |
| Vuoto | `EmptyState` (una frase + un'azione) o `BlankPage` (sei righe vuote del registro) |
| Pagina / studente mancante | `PageMessage` (titolo, una frase, un link in inchiostro) |
| Sessione scaduta | un 401 qualsiasi → uscita → `/accedi` con `SessionExpiredNote` |
| Errori di invio | §6.4 di questo documento: i campi in errore restano nel modulo, mai un toast |
| Errore imprevisto | `RouteError` (anche chunk non più esistenti dopo un deploy) e `AppErrorBoundary` |

---

## 4. Guscio, misure, tema

**`app/AppShell.tsx`** (02 §9.14) incornicia le pagine autenticate:

- **sotto 1024 px**: niente barra in alto (ogni pagina ha il suo titolo); in basso, fissi, la barra
  di Matita (slot `MobileBar`, non sulla scheda studente dove la riga è nel registro) e la tab bar
  «Oggi · Studenti · Agenda · Altro» (`Altro` = `/impostazioni`). `useShellBottomInset` misura
  quella pila e pubblica `--rf-shell-bottom`: la pagina lascia quello spazio e i toast ci stanno
  sopra;
- **da 1024 px**: barra di 64 px con wordmark, «Oggi / Studenti / Agenda», «Matita ⌘K» (slot
  `TopBarButton`) e il menu dell'avatar (Impostazioni, Esci); contenuto largo al massimo 1200 px
  (`max-w-page`, definita in `index.css`);
- sempre: `SkipLink` «Salta al contenuto» verso `<main id="main">`, e `DemoBanner` in modalità demo.

Soglie usate nel codice (Tailwind di default, nessun breakpoint personalizzato):

| Soglia | Cosa cambia | Dove |
|---|---|---|
| < 768 px (`md`) | dialog → **bottom sheet**, bottoni da 44 px, menu di selezione a tutta altezza | `useIsMobile()` / `MOBILE_QUERY` in `components/utils.ts` |
| ≥ 760 px di viewport | il registro diventa una vera `<table>` (sotto: `<ol>` a tre colonne) | `LEDGER_TABLE_QUERY`, `Ledger` |
| ≥ 1024 px (`lg`) | barra in alto, aside della scheda studente, colonne dell'agenda, tabella studenti | `DESKTOP_QUERY = "(min-width: 64rem)"` nelle feature |

**Token e stile.** `tokens.css` (del Designer) definisce le variabili `--rf-*` e la mappa `@theme`
di Tailwind; azzera la palette (`--color-*: initial`), quindi `bg-indigo-500` & co. **non
compilano**: si usano solo `bg-paper`, `text-ink-2`, `border-rule-strong`, `text-debito`,
`bg-credito-wash`, `text-pencil`… Utility di progetto: `tabular` (cifre in Plex Mono),
`pencil-draft` / `pencil-dash` (bozze di Matita), `marker` (evidenziatore), `field-error`,
`rule-total`. Aggiunte che non sono token vanno in `index.css`, mai in `tokens.css`.

**Tema.** «Aspetto» (Sistema / Chiaro / Scuro, `features/settings/theme.ts`) salva la scelta in
`localStorage` (`ripetiflow.theme`) e la applica come `<html data-theme>`; uno script inline in
`index.html` la riapplica prima del primo disegno. Senza scelta vale `prefers-color-scheme`.
I token cambiano da soli: la variante `dark:` serve solo per eccezioni.

**Movimento.** Le durate sono token (`--rf-dur-1…3`, `--rf-dur-ink`, `--rf-dur-think`) e valgono 0
con `prefers-reduced-motion`; il codice che aspetta un'animazione le legge dal CSS (es.
`inkDurationMs()` in `matita/session.ts`) invece di scrivere millisecondi a mano.

---

## 5. Catalogo dei componenti (`@/components`)

Tutti esportati da `src/components/index.ts` e coperti da test accanto al file (`Loadable` in
`States.test.tsx`, la navigazione del guscio in `app/AppShell.test.tsx`). Regola generale: se
un concetto ha già un componente o un'icona (`icon-map.ts`), si usa quello; niente HTML grezzo con
classi copiate.

### Azioni

| Componente | Quando usarlo |
|---|---|
| `Button` | ogni azione. Varianti `ink` (primaria, **una per vista**), `line`, `quiet`, `danger`; `size="sm"` (36 px) solo da 768 px. `isPending` mostra `Dots` e tiene l'etichetta |
| `LinkButton` | navigazione con l'aspetto di un bottone («Vai a Oggi», «Torna agli studenti») |
| `InlineButton`, `InlineLink` | azioni e link dentro una frase o una nota («Riprova», «Aggiungi … come studente», i link «Agenda ›» e «Studenti ›» accanto ai titoli di Oggi) |
| `buttonClasses()` | per dare l'aspetto di bottone a un trigger di React Aria o a un `<a>` fuori dal router |
| `ActionMenu` (`features/forms`) | menu «⋯» di una riga: trigger quadrato da 44 px con nome accessibile, voci con icona e testo |

### Campi e moduli

| Componente | Quando usarlo |
|---|---|
| `TextField`, `TextAreaField` | testo libero; etichetta sopra (mai placeholder come etichetta), `hint`, `error` |
| `MoneyField` | ogni importo in euro: valore in **centesimi**, accetta virgola o punto, formatta all'uscita; testo illeggibile → `null` + errore locale (`INVALID_AMOUNT_MESSAGE`) |
| `NumberField` | interi in it-IT senza frecce (pronto nel kit, oggi non usato dalle schermate) |
| `DayField` | un giorno: «mar 6 ott 2026» + «Oggi · Ieri · Altro…»; picker nativo su mobile, calendario da lunedì su desktop. Passategli `today` del fuso del tutor |
| `TimeRangeField` | «Inizio → Fine» di una lezione: accetta `15`, `1500`, `15:00`, `15.00`, durate rapide, riepilogo dal vivo |
| `Select` | scelta da un elenco corto: Materia (con «Nessuna materia» = `null`), Durata predefinita, Ordina |
| `SearchSelect` | scelta con ricerca in un elenco lungo (Studente, Fuso orario): popover su desktop, sheet a tutta altezza su mobile |
| `SegmentedControl` | 2–4 opzioni esclusive sempre visibili (Contanti / Bonifico / Altro, Sistema / Chiaro / Scuro, filtro studenti) |
| `ChoiceGroup` (`features/forms`) | scelta esplicita tra opzioni con una frase ciascuna, **nessuna preselezionata** (D-16) |
| `FormNote` | l'errore del server senza un campo, sopra la barra delle azioni |
| `FieldLabel`, `FieldErrorMessage` | per costruire un campo nuovo con lo stesso aspetto (`field-styles.ts`) |

### Contenitori e messaggi

| Componente | Quando usarlo |
|---|---|
| `Sheet` + `SheetActions` | ogni modulo: bottom sheet sotto 768 px, dialog di 560 px sopra. Gestisce focus, Esc, «Scartare le modifiche?» (`isDirty`), `<form>` (`onSubmit`), nota d'errore (`note`). Taglie `form`, `full`, `small` |
| `ConfirmDialog` | ogni azione distruttiva: titolo-domanda, **effetto con i numeri veri**, [Annulla] e il verbo. Se `onConfirm` fallisce, l'errore del server resta nel dialogo (con `recovery` opzionale) |
| `useToast()` / `ToastProvider` | conferma dopo una scrittura, al massimo con «Annulla». **Mai per gli errori di un modulo** (stanno sul campo o nella nota); l'unica eccezione è un «Annulla» fallito, che non ha un campo (`useUndoToast`) |
| `Note` | nota con icona (informazione, avviso, Matita non attiva, Calendar) |
| `Loadable` | una query con i suoi tre stati progettati; il figlio riceve `(data, { stale })` |
| `SkeletonRows`, `LoadErrorBand`, `PageMessage`, `SessionExpiredNote` | stati di 03 §10 quando `Loadable` non basta (pagine con più query) |
| `EmptyState`, `BlankPage` | elenchi e registri vuoti |

### Dominio

| Componente | Quando usarlo |
|---|---|
| `Ledger` | il registro (02 §9.6). Figli: `LedgerSlotRow` (riga di Matita o «+»), `LedgerEntryRow` (lezione/pagamento), `LedgerDraftRow` (bozza a matita), `LedgerRateRow` (cambio tariffa), `LedgerCarryRow` («Riporto al …»). Sceglie da solo tabella o lista (`useLedgerLayout()` per le celle) |
| `RunningBalance` | saldo progressivo di una riga, letto come «deve 67 euro» |
| `BalanceBadge` | saldo in evidenza (scheda, Oggi): sempre una **parola** (Ti deve / Credito / In pari), mai un segno; il credito mostra `credit_minutes` |
| `BalanceInline` | saldo senza fondo negli elenchi lunghi (Conti aperti, Studenti) |
| `DraftBadge` | «Bozza» tratteggiata |
| `StudentListItem` | riga di uno studente: tutta la riga è un link alla scheda |
| `AgendaItem`, `DayHeading` | lezione in un elenco per giorno (Oggi, agenda mobile) e intestazione del giorno |
| `ApproxDuration`, `ShortcutKbd` | «≈ 1 h 49 min» e «⌘K / Ctrl K» come icone (i font non hanno quei glifi, 02 §3) |
| `PAYMENT_METHOD_ICON/LABEL`, `MATITA_ICON`, `INK_ICON` | icone e nomi condivisi (`icon-map.ts`) |

Helper (`components/utils.ts`): `cx`, `useMediaQuery`, `useIsMobile`, `useNow` (si aggiorna ogni
minuto), `useDelayedFlag`, `balanceStatus`/`balanceSpeech`/`speakEuro` (parole e lettura per i
lettori di schermo), `formatShortDate`, `lessonTiming`, `studentMeta`, `loadErrorText`.

---

## 6. Dati

### 6.1 Client API (`src/lib/api`)

- `api.GET("/students/{student_id}", { params, signal })`: percorsi **senza** `/api/v1`, tipi da
  `schema.d.ts`. `unwrap(await api.…)` restituisce i dati; gli alias leggibili (`Student`,
  `LessonCreate`, `AssistantDraft`…) sono in `types.ts`. Mai scrivere a mano la forma di una
  risposta: si rigenera con `make gen-api` e si corregge ciò che `typecheck` segnala.
- Middleware: `authMiddleware` aggiunge `Authorization: Bearer` (il token arriva dall'auth tramite
  `session.ts`, così i due moduli non si importano a vicenda); `problemMiddleware` trasforma ogni
  risposta non 2xx in `ApiProblem` e, su 401, avvisa l'auth che esce.
- `ApiProblem`: `status`, `code`, `title`, `detail` (italiano, pronto da mostrare),
  `fieldErrors` (`{campo: messaggio}`, il primo per campo). Senza risposta: `code:
  "network_error"`. `errorMessage(e)` dà sempre un testo italiano mostrabile (anche per errori non
  dell'API); `UserFacingError` per errori nostri già scritti per l'utente.
- Scritture che confermano una bozza di Matita: gli hook accettano `source: "assistant"` →
  header `X-RipetiFlow-Source: assistant` (registro attività).
- CSV (D-24): `downloadStudentLedgerCsv(id)`, `downloadFullLedgerCsv()` scaricano con il token e
  salvano col nome di `Content-Disposition`.

### 6.2 Query e mutation (`src/lib/queries`)

Un file per area (`profile.ts`, `students.ts`, `lessons.ts`, `dashboard.ts` con il calendario,
`settings.ts` con il riordino delle materie, `assistant.ts`), tutto riesportato da
`@/lib/queries`. Schema di ogni lettura:

```ts
export const studentQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.student.detail(id),
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/students/{student_id}", { params: { path: { student_id: id } }, signal })),
  });
export function useStudent(id: string) {
  return useQuery(studentQuery(id));
}
```

Le factory `xxxQuery` servono anche per leggere la cache senza nuove richieste (l'AppShell prende
il nome del profilo con `enabled: false`; la scheda studente mostra nome e saldo dall'elenco già
in cache mentre carica). `QueryClient` (`client.ts`): `staleTime` 30 s, nessun nuovo tentativo sui
4xx, due sui 5xx e sulla rete, mutation mai ritentate.

**Chiavi** (`keys.ts`) gerarchiche: invalidare un prefisso aggiorna tutto ciò che sta sotto.
`["student", id]` copre dettaglio, registro, storico, tariffe e anteprima di quello studente;
`["students"]` ogni elenco; `["lessons"]` ogni intervallo dell'agenda e ogni lezione;
`["dashboard"]`, `["calendar"]`, `["profile"]`, `["subjects"]`, `["payments"]`.

**Invalidazione** (`invalidation.ts`, testata in `invalidation.test.ts`): ogni mutation chiama, in
`onSuccess`, `invalidateAfter(queryClient, evento)`. Gli eventi sono `lesson` e `payment` (con
**tutti** gli studenti toccati: vecchio e nuovo se la lezione cambia studente), `student`
(`created` / `updated` / `archived` / `deleted`), `rate`, `subject`, `profile` (con
`timezoneChanged`: il fuso decide quali lezioni sono nel saldo, quindi si aggiornano saldi, registri
e lezioni), `calendar`, `everything` (dati demo ricreati). Uno studente eliminato viene tolto dalla
cache invece di essere richiesto (darebbe 404). Regola: **nessun importo mostrato può restare
vecchio dopo una scrittura**; se aggiungete un tipo di scrittura, aggiungete l'evento e il suo test.

Matita usa `useSendAssistantMessage()` (`assistant.ts`, accetta un `AbortSignal`) e
`assistantTurns()` che taglia la conversazione a 20 turni da 2000 caratteri.

### 6.3 Ora del tutor e formati

- `useTutorClock()` (`features/forms/clock.ts`) → `{ timeZone, today, nowMinutes, now, profile }`
  nel fuso del profilo (default `Europe/Rome`), aggiornato ogni minuto. È l'unico modo corretto di
  sapere «oggi» e «adesso»: decide quando una lezione finisce ed entra nel saldo. Mai `new Date()`
  per un giorno di calendario.
- `@/lib/format`: `formatEuro(cents)` → `1.234,50 €`, `formatEuroAbs`, `parseEuroInput` (testo →
  centesimi o `null`), `formatMinutes`, `formatCreditMinutes` / `formatCreditMinutesText`
  («circa 2 h 16 min» per frasi e `aria-label`), `todayIn`, `addDays`, `startOfWeek` (lunedì),
  `formatDateShort/Long`, `formatRelativeDate`, `normalizeTime`, `minutesBetween`,
  `whatsAppLink`. Nessun importo o data si formatta altrove.
- Le parole del saldo nelle frasi («deve 67,00 €», «credito 40,00 €», «in pari») vengono da
  `balanceWords` (`features/forms/money-words.ts`).

### 6.4 Errori del server nei moduli (03 §10.4)

Un invio fallito **non chiude mai** il modulo. `src/lib/forms/` fa tutto il lavoro:

```tsx
const bodyRef = useRef<HTMLDivElement>(null);
const errors = useFormErrors(PAYMENT_PROBLEM_MAPPING, bodyRef);

async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const local = checkPayment(values);                    // modello puro, testi del server
  if (Object.keys(local).length > 0) return errors.show(local); // focus sul primo campo in errore
  try {
    const saved = await create.mutateAsync({ body: paymentCreateBody(values), source });
    onOpenChange(false);
    showToast(paymentSavedMessage(saved.amount_cents), (qc) =>
      deletePaymentNow(qc, { id: saved.id, studentId: saved.student.id }));
  } catch (error) {
    errors.fromProblem(error);                           // 422 → campi, il resto → nota
  }
}
// nel JSX: <MoneyField error={errors.fields.amount} …/>  (errors.clearField("amount") quando cambia)
//          <Sheet note={errors.form ? <FormNote>{errors.form}</FormNote> : null} …>
```

(Forma semplificata di `PaymentFormDialog.tsx`.)

- La **mappa** (`ProblemMapping`) elenca i campi del modulo in ordine di schermo e traduce i nomi
  dell'API (`amount_cents → amount`, `paid_on → date`, `student_id → student`).
- `problemToFormErrors`: 422 con `errors[]` → ogni messaggio sul suo campo; un campo che il modulo
  non ha → nota del modulo; 409/422 senza campi, 502, 503 → `detail` del server come nota; 500 →
  `detail` + «Riprova tra poco.»; nessuna risposta → «Sei offline: niente è stato salvato. Riprova
  quando torna la rete.»
- Dopo `fromProblem` o `show` il focus va al **primo controllo non valido** (`aria-invalid` o
  `data-rf-invalid` per i bottoni-campo come Giorno e Materia).
- Gli stessi testi della validazione locale sono quelli del server (es. `TIME_MESSAGES`), così
  l'utente vede una sola voce.

### 6.5 Focus quando un controllo sparisce

Eliminare una riga o chiudere un dialogo il cui pulsante non esiste più non deve lasciare il focus
su `<body>` (WCAG 2.4.3): `focusWhenLost(() => bersaglio)` di `features/settings/focus.ts` aspetta
che il dialogo sia uscito e, **solo se il focus si è perso**, lo sposta sul bersaglio (riga vicina,
titolo della sezione); un focus che l'utente ha spostato nel frattempo resta dov'è. Usatelo in ogni
nuova azione che rimuove l'elemento che l'ha scatenata.

### 6.6 Titolo della pagina e cambio pagina

Ogni rotta chiama `usePageTitle("Studenti")` (`src/app/page.ts`): la scheda del browser e i lettori di
schermo leggono «Studenti · RipetiFlow» (la scheda studente usa il nome, «Giulia Ferri · RipetiFlow»).
Nel guscio, `useFocusMainOnNavigation()` porta il focus su `<main>` quando cambia il **percorso**
(non al primo caricamento, non se cambia solo `?riga=` o `#…`, non se il focus è in un dialogo
ancora aperto): dopo un clic nella navigazione o su un link si riparte dal contenuto nuovo invece
che da `<body>` (WCAG 2.4.2, 2.4.3).

---

## 7. Autenticazione e modalità demo

`AuthStore` (`app/auth/store.ts`) è una macchina a stati senza React, testata con dipendenze
finte; `AuthProvider` la espone con `useAuth()`:
`{ status: "loading" | "signedOut" | "signedIn", user, config, notice, error, signInWithGoogle,
sendMagicLink, signInDemo, seedDemo, signOut, connectGoogleCalendar, takeCalendarGrant, … }`.

- **Configurazione a runtime**: nessuna variabile `VITE_*`. All'avvio si legge
  `GET /public/config` (URL e chiave pubblica di Supabase, `google_login_enabled`,
  `magic_link_enabled`, `dev_auth_enabled`, `calendar_sync_available`, `assistant_available`).
  **Ogni metodo di accesso e ogni funzione opzionale compare solo se il suo flag è vero** (03 §11).
- **Supabase** (Google, link via email; D-30): flusso PKCE, ritorno su `/auth/callback`;
  supabase-js è importato solo quando serve (la landing e la demo non lo scaricano) e gestisce
  sessione e rinnovo.
- **Demo** (`dev_auth_enabled`, solo backend con `DEV_AUTH=1` su un DB locale): «Entra in modalità
  demo» chiama `POST /dev/login`; il token sta in `sessionStorage` (`ripetiflow.demo-session`, solo
  questa scheda). «Ricarica i dati demo» in Impostazioni usa `useSeedDemo()` (`POST /dev/seed` +
  invalidazione `everything`). Il guscio mostra `DemoBanner`. Le rotte `/dev/*` non sono nello
  schema generato: le due forme sono descritte in `store.ts`.
- **Guardie** (`guards.tsx`): `RequireAuth` manda ad `/accedi` ricordando dove si andava
  (`state.from`), `RedirectIfSignedIn` riporta lì (solo percorsi interni) o a `/oggi`.
- **401**: qualsiasi risposta 401 fa uscire con `notice: "session-expired"` → `/accedi` con «La
  sessione è scaduta. Entra di nuovo: torni dove eri.». Cambiando utente o uscendo, la cache delle
  query viene svuotata.
- **Google Calendar (D-31, consenso incrementale)**: il permesso non si chiede all'accesso ma da
  Impostazioni (`connectGoogleCalendar`), con ritorno su `/auth/callback?next=calendar`. Lì il
  refresh token viene letto **una volta** (`takeCalendarGrant`), inviato a
  `POST /integrations/google-calendar/connect` (mutation con `gcTime: 0`, così non resta in
  memoria), poi la sessione viene rinnovata perché i token Google non restino nello storage. Mai
  nei log.

Per sviluppare: `make db-reset && make dev-backend`, `make seed`, `make dev-frontend` →
http://localhost:5173 → «Entra in modalità demo».

---

## 8. Matita nell'interfaccia

Concetto e regole in [06](06-assistente-matita.md); aspetto in 02 §9.13; flussi e testi in 03 §9.
Principio che il codice rispetta ovunque: **Matita propone, il tutor ripassa a penna**. Nessuna
scrittura parte senza «Ripassa a penna» o un modulo salvato dal tutor (D-42).

**Dove si monta.** Il guscio non conosce Matita: offre quattro slot (`components/shell/matita-slot.ts`)
che `router.tsx` riempie con `MATITA_SLOTS` (`features/matita/index.ts`), caricati in modo pigro
(`LazySlots.tsx`, un solo chunk `hosts.ts` dopo il primo disegno):

| Slot | Dove | Componente |
|---|---|---|
| `LedgerLine` | prima riga del registro, tutte le misure; lo studente è il contesto | `LedgerLine.tsx` |
| `TodayLine` | sotto il titolo di Oggi, da 1024 px | `TodayLine.tsx` |
| `MobileBar` | barra fissa sopra la tab bar, sotto 1024 px (non sulla scheda studente) | `MobileBar.tsx` |
| `TopBarButton` | «Matita ⌘K» nella barra in alto; registra la scorciatoia Cmd/Ctrl K | `TopBarButton.tsx` |

Senza `assistant_available` in `/public/config`, o dopo un 503 durante la visita
(`useMatitaAvailable()`), Matita si fa da parte: niente «Matita ⌘K» né scorciatoia, la barra mobile
tiene solo il «+» del modulo manuale, e nel registro e in Oggi al posto della riga c'è la nota
«Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.».

**Il flusso** (`session.ts`, un'istanza di `useMatitaSession` per ogni riga):

1. Il tutor scrive nella riga (`MatitaLine`) e preme Invio. Si invia `POST /assistant/messages`
   con gli ultimi turni (`assistantTurns`) e `context: { student_id, today }`. Esc annulla la
   richiesta in corso; ↑/↓ nella riga vuota scorrono le ultime 5 note.
2. Mentre aspetta: «Matita sta scrivendo…» annunciato in una regione `aria-live` e il tratto
   ondulato (`Scribble`, fermo con movimento ridotto).
3. La risposta porta `reply` (mostrato esattamente com'è, con il markdown limitato di `ReplyText`:
   grassetto ed elenchi, niente link né HTML) e `drafts[]`. Le bozze di lezione e pagamento per lo
   studente della pagina diventano **righe a matita** del registro (`LedgerDraftRow`, con «sarà
   deve …» o «Bozza · programmata»); le altre, e i messaggi, diventano **card a matita**
   (`DraftCard`). Il focus va alla **prima proposta**, mai direttamente su «Ripassa a penna» (uno
   Spazio o un Invio digitato dopo scriverebbe).
4. Su una proposta: **Ripassa a penna** (o Cmd/Ctrl + Invio) → `POST /lessons` o `/payments` con
   `source: "assistant"`, animazione inchiostro (`--rf-dur-ink`), toast con «Annulla»;
   **Modifica** → apre `LessonFormDialog` / `PaymentFormDialog` precompilato (salvataggio con
   `source: "assistant"`); **Scarta** (o Esc) la toglie. Con più bozze: «Ripassa tutte a penna (n)»,
   una alla volta, ci si ferma al primo errore. Un 422 alla conferma apre il modulo con l'errore
   sul campo; gli altri errori restano sulla card.
5. Le bozze di **messaggio** (promemoria di pagamento, riepiloghi) si modificano, si copiano o si
   aprono in WhatsApp / email: niente viene inviato da solo.

**Limiti ed errori** (`model.ts` → `failureFromError`, `MatitaNotes.tsx`): 429 → la riga si blocca
fino a mezzanotte di Roma con la frase del server (`store.ts` tiene la quota condivisa tra le
righe, legata al tutor che l'ha ricevuta: un altro account nella stessa scheda riparte libero; con 10 richieste rimaste o meno compare «Ancora n richieste a Matita oggi.»); 502 → «Matita non
risponde in questo momento…» con «Riprova»; rete → «Sei offline…»; 503 → Matita sparisce per il
resto della visita. In ogni caso la riga scritta resta nel campo e i moduli funzionano.

**⌘K** (`TopBarButton` + `store.ts → focusPageLine`): porta il focus alla riga della pagina (registro
o Oggi) o alla barra mobile; dove non ce n'è (Studenti, Agenda, Impostazioni) apre
`CommandDialog` con la riga e le ultime 3 frasi usate (salvate solo in questo browser).

**Promemoria**: il pulsante della scheda studente (e quello di Oggi, via `?promemoria=1`) passa a
`LedgerLine` un `prompt` che invia subito «scrivi un promemoria di pagamento».

Testi fissi di Matita: `features/matita/messages.ts` (03 §9.4). I testi che arrivano dal server
(`reply`, `warnings[]`, `detail` del 429) non si riscrivono mai.

---

## 9. Test

### 9.1 Unit e componenti (Vitest + Testing Library)

- `cd frontend && npx vitest run` (o `make test-frontend`). Oggi: **55 file, 588 test**.
- Ambiente jsdom con `TZ=Pacific/Kiritimati` (UTC+14): un test che dipende dal fuso della macchina
  fallisce subito. `src/test/setup.ts` svuota `sessionStorage`/`localStorage` dopo ogni test.
- I test stanno accanto al codice (`X.tsx` → `X.test.tsx`) e verificano il comportamento che
  conta: stati (caricamento, errore, vuoto), errori del server mappati sui campi e focus sul primo,
  ruoli e nomi accessibili, testi italiani esatti, invalidazione dopo le scritture.
- Si interroga per ruolo ed etichetta (`getByRole("button", { name: "Ripassa a penna" })`), non
  per classi o test id.
- Le API si simulano **sotto** il client vero (si sostituisce `fetch`), così si provano anche
  middleware ed errori. Aiutanti pronti:
  - `features/forms/test-utils.tsx`: API finta, provider (query, auth, toast, router, it-IT), dati
    d'esempio di 03 con «oggi» = mar 6 ott 2026, 14:20 a Roma (`NOW`, `TODAY`);
  - `features/landing/testing.tsx`: `AuthStore` vero con dipendenze finte, per pagine pubbliche,
    Agenda e Impostazioni;
  - `features/matita/test-helpers.ts`: bozze e risposte come le manda l'API.
- I modelli puri (`*-model.ts`, `week.ts`, `ledger-model.ts`, `model.ts` di Matita, `lib/format`,
  `lib/forms`) hanno test senza DOM: mettete lì la logica, non nei componenti.

### 9.2 End-to-end (Playwright)

- `make e2e` dalla radice: ricrea il DB `ripetiflow_e2e`, Playwright avvia il backend in modalità
  demo su :8010 (`ASSISTANT_PROVIDER=none`, worker del calendario spento) e Vite su :5180. Chromium è
  già installato in `PLAYWRIGHT_BROWSERS_PATH`: **non eseguire `playwright install`**.
- Ogni test gira due volte: progetto `mobile` (390 × 844, touch) e `desktop` (1440 × 900). Oggi 17
  test × 2 = 34 esecuzioni; una è saltata di proposito (il «+» di un giorno libero esiste solo su
  desktop).
- Percorsi: `smoke` (landing → demo → Oggi → uscita), `registro` (studenti, nuovo studente,
  lezioni, pagamento, cambio tariffa, archiviazione), `agenda`, `impostazioni`, `matita`,
  `accessibilita` (solo tastiera, pagine mancanti).
- Fixture (`e2e/fixtures.ts`): `demo` (login + seed via API e sessione messa in `sessionStorage`,
  più un piccolo client per preparare i dati), `problems` (**qualsiasi errore in console fa
  fallire il test**, salvo quelli dichiarati con `allow`), `screens`, `expectAccessible(page)`
  (axe-core, regole WCAG 2.0–2.2 A/AA). `e2e/ui.ts` agisce come il tutor: etichette e ruoli,
  `pickDay` usa il picker del dispositivo.
- Matita con modello simulato: `matita.spec.ts` intercetta `/public/config` e
  `/assistant/messages` nel browser; tutto il resto (la conferma `POST /lessons` con
  `X-RipetiFlow-Source: assistant`) è vero.
- Un solo file: `cd frontend && npx playwright test e2e/registro.spec.ts -g "pagamento"` (usa il DB
  `ripetiflow` di `make db-reset`).

### 9.3 Screenshot per la review di design

Gli E2E salvano `docs/design/screens/<schermata>-390.png` e `-1440.png` (`screens.page(name)` per
la pagina intera, `screens.dialog(name, locator)` per dialoghi e sheet). Si scrivono solo con
`make screens` (gli stessi E2E con `E2E_SCREENSHOTS=1`; `make e2e` non li tocca, perché i dati demo
dipendono dalla data); l'elenco con la sezione di 03 corrispondente è in
[`design/screens/README.md`](design/screens/README.md). Una schermata nuova si aggiunge chiamando
`screens.page("nome")` nel suo percorso e una riga in quella tabella. Per la review si usa la
checklist di 03 §11.

### 9.4 Cancelli prima di consegnare

```bash
cd frontend && npm run typecheck && npm run lint && npm run format:check && npx vitest run && npm run build
make e2e
```

`npx prettier --write <file>` per formattare solo i propri file. `tokens.css` e `fonts.md` sono
esclusi da Prettier (appartengono al Designer).

---

## 10. Come aggiungere…

### 10.1 …una schermata

1. **Copy e layout** da 03 (mobile 390 e desktop 1440), stati da 03 §10. Se 03 non la descrive,
   va descritta lì prima.
2. **Dati**: se serve un endpoint nuovo, prima `docs/05-api.md` e backend (skill
   `ripetiflow-dev`), poi `make gen-api`. Nel file d'area di `src/lib/queries/` aggiungete la
   chiave in `keys.ts` (sotto il prefisso giusto), la factory `xxxQuery` e l'hook `useXxx`.
3. **Feature**: `src/features/<area>/<Nome>Page.tsx` con un commento in testa che cita 03 e le
   decisioni. Titolo `<h1>` visibile, landmark e sezioni con intestazioni; `Loadable` o gli stati
   di `components/States`; «oggi» da `useTutorClock()`; importi e date solo da `@/lib/format`.
4. **Rotta**: `src/routes/<nome>.tsx` che esporta solo `export function Component()`, chiama
   `usePageTitle("<Titolo>")` (§6.6) e delega alla feature; registratela in `src/app/router.tsx` con `lazy: () => import("@/routes/<nome>")`,
   dentro il blocco `RequireAuth` se è privata. Se va nella navigazione: `TAB_SECTIONS` in
   `components/shell/Navigation.tsx` (ma D-20: niente pagine globali di lezioni o pagamenti).
5. **Test**: `<Nome>Page.test.tsx` con gli aiutanti di §9.1 (stati, ruoli, testi); un percorso in
   `frontend/e2e/` con `screens.page("<nome>")` e `expectAccessible(page)`; riga in
   `docs/design/screens/README.md`.
6. Aggiornate la tabella §3.1 di questo documento.

### 10.2 …un modulo

1. **Modello puro** `features/forms/<cosa>-model.ts`, sul modello di `payment-model.ts`: tipo dei
   campi in ordine di schermo, `ProblemMapping` (campi + nomi dell'API), `new<Cosa>Values(initial,
   today)` / `<cosa>ToValues(esistente)`, `check<Cosa>` (validazione locale con gli **stessi testi
   del server**), `<cosa>CreateBody` / `<cosa>PatchBody` (importi in centesimi, PATCH solo dei campi
   cambiati), `<cosa>UndoPatch` per «Annulla». Test in `models.test.ts`.
2. **Mutation** in `src/lib/queries/` con `invalidateAfter(...)` in `onSuccess` (nuovo evento? va in
   `invalidation.ts` e in `invalidation.test.ts`); accetta `source` se Matita potrà confermarlo.
3. **Componente** `<Cosa>FormDialog.tsx`: `Sheet` con `onSubmit`, `isDirty` e `SheetActions`
   ([Annulla] a sinistra, una sola azione `ink`), campi del kit (`MoneyField`, `DayField`,
   `TimeRangeField`, `SearchSelect`…), `useFormErrors(MAPPING, ref)`: `errors.show(...)` per la
   validazione locale, `errors.fromProblem` per il server, `errors.clearField` quando l'utente
   corregge, `errors.form` in `FormNote` tramite `note`. Il modulo resta aperto se l'invio fallisce.
4. **Dopo il salvataggio**: chiudete e mostrate il toast con `useUndoToast()` (testo in
   `forms/messages.ts`, «Annulla» con una funzione di `undo.ts`).
5. **Azioni distruttive**: `ConfirmDialog` con titolo-domanda e la frase dell'effetto con i numeri
   veri (`effects.ts`); dopo l'eliminazione il focus va spostato con `settings/focus.ts`.
6. **Test** del componente: invio vuoto → errori sui campi e focus sul primo; 422 dell'API →
   messaggi sui campi giusti; 409/500/rete → nota; successo → toast e invalidazione.

---

## 11. Regole che è facile dimenticare

- Nessun colore, ombra o raggio fuori dai token; niente gradienti, `backdrop-filter`,
  `rounded-xl` o emoji.
- Un saldo ha sempre una parola (deve / credito / in pari), mai un segno meno; il tempo del
  credito è `credit_minutes` del server.
- Le bozze di Matita non cambiano i totali finché non sono ripassate a penna.
- I glifi `≈ ⌘ → ↵ ✓ ▾` non si scrivono come testo: icone Phosphor o parole (02 §3).
- Target da 44 px su mobile (anche link «Riprova» e bottoni in riga), input a 16 px, focus
  visibile su tutto, `aria-live` per i risultati asincroni, nessuna animazione con movimento
  ridotto.
- Gli errori di un invio stanno sul campo o nella nota del modulo, mai in un toast.
- Giorni e mesi in minuscolo, 24 h, settimana da lunedì; «oggi» sempre nel fuso del profilo.
