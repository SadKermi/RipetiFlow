# RipetiFlow — Ricerca di design

*Versione 1.0 · 6 ottobre 2026 · autore: lead product design*
*Documenti collegati: [02-design-system.md](02-design-system.md) · [03-schermate.md](03-schermate.md) · [specimen.html](specimen.html)*

Questo documento spiega **da dove viene** il sistema visivo «Registro». Le fonti sono quelle indicate dal cliente (Awwwards, Siteinspire, Dribbble), più i prodotti concorrenti e le convenzioni italiane. Ogni riferimento indica **cosa prendiamo, con quali valori**, e cosa invece lasciamo lì.

---

## 1. Metodo

| Fonte | Come l'ho letta | Esito |
|---|---|---|
| [awwwards.com/websites](https://www.awwwards.com/websites/) | Playwright + Chromium: **connessione resettata** (blocco anti-bot). Letta via fetch testuale: elenco SOTD, categorie [Business & Corporate](https://www.awwwards.com/websites/business-corporate/), [Mobile & Apps](https://www.awwwards.com/websites/mobile-apps/), [Typography](https://www.awwwards.com/websites/typography/), pagine di dettaglio dei siti. Poi ho **visitato e fotografato i siti veri** (1440 px, due altezze di scroll). | 6 siti analizzati a schermo |
| [siteinspire.com](https://www.siteinspire.com/) | Playwright: **429 Vercel Security Checkpoint**. Letta via fetch: stili [Typographic](https://www.siteinspire.com/websites/category/typographic), [Minimal](https://www.siteinspire.com/websites/category/minimal), soggetto [Education](https://www.siteinspire.com/websites/category/education). Siti poi visitati direttamente. | 4 siti analizzati a schermo |
| [dribbble.com/tags/web-design-inspiration](https://dribbble.com/tags/web-design-inspiration) | Playwright funziona. Fotografati i tag [ledger](https://dribbble.com/tags/ledger), [finance-dashboard](https://dribbble.com/tags/finance-dashboard), [tutor-app](https://dribbble.com/tags/tutor-app), [booking](https://dribbble.com/tags/booking), [calendar-app](https://dribbble.com/tags/calendar-app), [fintech-app](https://dribbble.com/tags/fintech-app), [bookkeeping](https://dribbble.com/tags/bookkeeping) e 9 shot singoli. | 4 shot utili, il resto è un catalogo di cosa evitare |
| Concorrenti | Pagine prodotto e help center di TutorBird, Teachworks, My Music Staff, TutorCruncher, Koalendar, Anolla; recensioni Capterra. | §4 |
| Convenzioni it-IT | Verificate eseguendo `Intl` in Node 22 (ICU/CLDR), non a memoria. | §5 |
| Font | Tre fogli di prova renderizzati (10 serif, 11 sans, 12 mono) su carta, con cifre, "€", "0/O", "Il1". Assi e feature OpenType letti con fontTools dai file serviti da Google Fonts. | §7 |

Screenshot conservati nel repo (compressi, ≤ 70 KB, solo uso interno di riferimento): `refs/town-ai-assistant.jpg`, `refs/surfers-journal-archives.jpg`, `refs/dribbble-tabato-bookings.jpg`, `refs/dribbble-oode-ai-confirm.jpg`. Gli altri restano fuori dal repo.

### Cosa dicono le gallerie, in generale

- **Awwwards, ottobre 2026**: i Site of the Day sono quasi tutti siti promozionali in WebGL/GSAP (Lidar Drone Scanning, Santioni Spirits, EDOLUS…). Insegnano poco a un gestionale da usare ogni giorno; utili solo le categorie *Business & Corporate* e *Typography*, dove compaiono siti finanziari sobri.
- **Siteinspire** è il più utile per noi: forte taglio editoriale/tipografico, pochissimi effetti. «Typographic» (2.105 siti) e «Minimal» (842) sono gli stili più popolati.
- **Dribbble** su finanza e tutoring è **saturo di cliché**: mockup di iPhone inclinati, grafici a gradiente arancio/viola, «Welcome back, Emma!», card con ombre, robot 3D come mascotte dell'AI. È il miglior catalogo di **cosa non fare** (§6). Le eccezioni utili sono gli shot che mostrano un'interfaccia vera e densa.

---

## 2. Riferimenti annotati (13)

### R1 · Town — l'assistente AI come riga di scrittura
[town.com](https://town.com) · Siteinspire *Minimal*, 1 ott 2026 · `refs/town-ai-assistant.jpg`
- **Cosa c'è**: carta quasi bianca `#FDFDFC`, testo `#1A1A16`; titoli in una slab larga; parole chiave evidenziate con **pennarello giallo** («unusually helpful»); l'input «Ask Sunny anything» è una **riga fissa in basso**, non una bolla di chat; il font di sistema include una famiglia *handwriting*.
- **Prendiamo**: (1) Matita come **riga di scrittura persistente** (sopra la tab bar su mobile, prima riga del registro su desktop); (2) l'**evidenziatore** come unico accento caldo, usato per «oggi/adesso» e per mostrare cosa Matita ha capito.
- **Lasciamo**: gli orsi illustrati e la calligrafia (troppo «carini» per uno strumento contabile).

### R2 · The Surfer's Journal Archives — numeri come tipografia
[archives.surfersjournal.com](https://archives.surfersjournal.com) · Siteinspire *Minimal / Typographic*, 29 set 2026 · `refs/surfers-journal-archives.jpg`
- **Cosa c'è**: serif classico (famiglia «Practice») a 44 px per «2026» e «35·4» negli **angoli** della pagina; navigazione a 3 voci; fondo carta colorata; nessun bottone pieno.
- **Prendiamo**: i **numeri grandi in serif** come elemento di gerarchia (il saldo di uno studente a 44 px in Literata); i **metadati agli angoli** (data/versione in caption).

### R3 · Reckoner Capital Management — finanza senza effetti
[reckoner.com](https://reckoner.com) · Awwwards, *Business & Corporate* + *Typography*, nominee 3 ott 2026 ([scheda](https://www.awwwards.com/sites/reckoner-capital-management))
- **Cosa c'è**: fondo `#F9F7F4`, testo `#202020`, Mona Sans + Geist; **riquadri a filo da 1 px** senza ombra; bottoni **rettangolari** pieni color sabbia; illustrazioni a tratto sottile tipo incisione da banconota.
- **Prendiamo**: superfici separate da **righe**, non da ombre; bottoni ad angolo quasi vivo (3 px). Conferma che un fondo caldo non‑bianco comunica «denaro serio» meglio del bianco ottico.

### R4 · Bitnomial — la griglia lasciata a vista
[bitnomial.com](https://bitnomial.com) · Awwwards, Honorable Mention 12 set 2026
- **Cosa c'è**: le **colonne della griglia sono disegnate** come linee verticali da 1 px; etichette in mono maiuscolo tra parentesi quadre; bottoni piatti rettangolari arancio; IBM Plex Sans + PP Neue Montreal Mono.
- **Prendiamo**: le **linee strutturali visibili** — nel registro diventano la riga di margine rossa e le righe orizzontali; il **mono per i dati** (importi, orari).
- **Lasciamo**: il maiuscolo spaziato ovunque (lo teniamo solo per le intestazioni di colonna).

### R5 · Wispr Flow — una voce serif per l'AI
[wisprflow.ai](https://wisprflow.ai) · Awwwards *Mobile & Apps* ([scheda](https://www.awwwards.com/sites/wispr-flow))
- **Cosa c'è**: fondo crema `#FFFFEB`, titolo EB Garamond con la seconda riga **in corsivo** («just speak.»), UI in Figtree.
- **Prendiamo**: l'**italico serif come voce della persona/AI**. In RipetiFlow ciò che scrive il tutor a Matita e le risposte di Matita sono in Literata corsivo 17/26: si distinguono dai dati senza bisogno di bolle o avatar.

### R6 · Jack & Jill — l'agente mostrato con interfaccia vera
[jackandjill.ai](https://jackandjill.ai) · Siteinspire *Minimal*, 15 set 2026
- **Cosa c'è**: titolo serif + grottesco (Diatype); l'agente ha un **segno a mano in inchiostro blu**, non un robot 3D; ogni messaggio ha una **riga di metadati** sopra («Scanned 15m jobs overnight»).
- **Prendiamo**: per Matita una riga di contesto sopra ogni risposta («Matita ha letto: …», «Quanto mi deve Giulia?»); niente mascotte.

### R7 · Moto Finance — controesempio utile
[moto-card.com](https://www.moto-card.com) · Awwwards **Site of the Day** 24 set 2026 ([scheda](https://www.awwwards.com/sites/moto-finance)) · punteggio 7,3
- **Cosa c'è**: carta di pagamento in 3D, parallax, Three.js, due soli colori `#0B0C07` / `#E1E5E5`.
- **Prendiamo**: solo la **disciplina cromatica** (due neutri + significato).
- **Lasciamo**: 3D, parallax, sfondi enormi — un tutor apre l'app 5 volte al giorno dal telefono; ogni effetto è un costo.

### R8 · «Oode Chat AI — Income Statement & Invoice» (Shinas P)
[dribbble.com/shots/25553765](https://dribbble.com/shots/25553765-Oode-Chat-AI-Income-Statement-Invoice) · tag *bookkeeping* · `refs/dribbble-oode-ai-confirm.jpg`
- **Cosa c'è**: l'AI non modifica i conti: propone un **diff** («Operating Expenses: $30,000 → $34,000») e chiede «**review and confirm, edit, or cancel**».
- **Prendiamo**: il contratto di Matita — **propone, non scrive**. Ogni proposta ha tre azioni fisse: *Ripassa a penna* (conferma), *Modifica*, *Scarta*; per i saldi mostra «sarà 100,00 €».

### R9 · «Tabato Calendar app · Bookings» (Juliette Lagache)
[dribbble.com/shots/21382361](https://dribbble.com/shots/21382361-Tabato-Calendar-app-Bookings) · tag *calendar-app* · `refs/dribbble-tabato-bookings.jpg`
- **Cosa c'è**: colonna data con giorno abbreviato + **numero grande** («Wed / 28»), oggi in colore d'accento; una prenotazione *pending* ha lo sfondo a **tratteggio diagonale**.
- **Prendiamo**: (1) il tratteggio a 45° come segno di «provvisorio» → **le bozze di Matita sono tratteggiate a matita**; (2) colonna data a sinistra in agenda e registro.

### R10 · «Calendar App» (Sajon)
[dribbble.com/shots/24015349](https://dribbble.com/shots/24015349-Calendar-App) · tag *calendar-app*
- **Cosa c'è**: data enorme «13.12 / DEC» in ordine europeo, tinte smorzate (ocra, salvia, rosa antico) per i giorni.
- **Prendiamo**: il titolo della dashboard è la **data di oggi in grande** («Oggi» + «martedì 6 ottobre»), non un saluto.
- **Lasciamo**: i blocchi pieni colorati per giorno (il colore da noi significa soldi).

### R11 · «Barbershop POS app for booking and payments» (Robin Holesinsky)
[dribbble.com/shots/25596116](https://dribbble.com/shots/25596116-Barbershop-POS-app-for-booking-and-payments) · tag *booking*
- **Cosa c'è**: agenda e incassi nella stessa vista; **linea «adesso»** alle 10:40; pause tratteggiate.
- **Prendiamo**: la linea «adesso» nell'agenda settimanale (inchiostro 2 px + etichetta su evidenziatore).

### R12 · Tag «finance-dashboard» e «tutor-app» — antiriferimento
[dribbble.com/tags/finance-dashboard](https://dribbble.com/tags/finance-dashboard) (2.658 shot) · [dribbble.com/tags/tutor-app](https://dribbble.com/tags/tutor-app)
- **Cosa c'è**, ripetuto decine di volte: «Welcome Back, Nixtio!», saldo `$12,680.42` su gradiente arancio, grafici a barre decorativi senza assi, mockup di telefono tenuto in mano, robot 3D verde per l'«AI tutor», card bianche con `rounded-2xl` e ombra morbida.
- **Prendiamo**: la lista di divieti al §6.

### R13 · Fantastical — far vedere cosa si è capito
[Recensione Macworld](https://www.macworld.com/article/226426/fantastical-21-for-os-x-review-an-even-better-calendar-replacement.html) · fuori dalle gallerie, ma è il riferimento storico del parsing in linguaggio naturale (supporta l'italiano dalla 1.2).
- **Cosa c'è**: mentre scrivi l'evento, i campi si riempiono e la frase mostra come viene interpretata.
- **Prendiamo**: nella proposta di Matita, la **frase del tutor resta visibile** con le parti riconosciute **evidenziate** (ieri · 15–16:30 · matematica · Luca · argomento) e accanto i campi compilati. Se un pezzo non è evidenziato, non è stato usato: errore visibile prima della conferma.

---

## 3. Sintesi visiva della ricerca

| Tema | Decisione | Riferimenti |
|---|---|---|
| Superfici | Carta calda `#F4F1E8`, righe 1 px, ombre solo su ciò che galleggia (sheet, popover) | R2, R3 |
| Struttura | Righe orizzontali + **margine rosso** verticale nel registro; doppia riga sotto i totali | R4, convenzione contabile |
| Colore | Neutri + 4 significati (debito, credito, matita, evidenziatore). Niente colore «di brand» decorativo | R1, R7 |
| Tipo | Serif da libro per nomi/saldi/voce di Matita, grottesco per l'interfaccia, mono per gli importi | R2, R5, R4 |
| AI | Riga di scrittura, proposta tratteggiata, conferma esplicita, parsing evidenziato | R1, R8, R9, R13 |
| Tempo | Data grande, colonna data a sinistra, linea «adesso» | R9, R10, R11 |

---

## 4. Il caso d'uso: cosa fanno gli altri e dove sbagliano

### 4.1 Gestionali per tutor

| Prodotto | Come mostra saldi e incassi | Problema per il nostro utente |
|---|---|---|
| **TutorCruncher** | Due saldi diversi: *Invoice balance* (pagamenti − fatture emesse) e *Available balance* (pagamenti − lezioni completate). Solo le lezioni segnate «complete» contano ([help](https://help.tutorcruncher.com/en/articles/14183187-invoice-vs-available-balance), [client balances](https://help.tutorcruncher.com/en/articles/8229539-client-balances)). | Due numeri per la stessa domanda («quanto mi deve?»). Lo stesso help center ammette che possono «sembrare disallineati». **Noi: un solo saldo.** |
| **Teachworks** | Tabella *Customer Balances*; «Account Balance = Net Invoices − Net Payments», **positivo = il cliente deve, negativo = devi tu** ([help](https://intercom.help/teachworks-e2d272c6e669/en/articles/11472206-customer-balances-transactions)); pacchetti di ore con *Package Balances* ([help](https://intercom.help/teachworks-e2d272c6e669/en/articles/15074742-tracking-package-balances)). | Il segno va interpretato. **Noi: parole («ti deve», «credito») + colore, mai il segno.** |
| **TutorBird / My Music Staff** (stessa azienda) | Saldo famiglia come «Balance Owing» o «Balance Remaining»; un saldo negativo **non viene mostrato in alto**; pulsanti «Add Charge» e «Add Payment or Discount» fusi in un unico «Add Transaction» ([post](https://tutorbird.com/?p=19649)); in agenda «Balance Owing» linka alla scheda famiglia ([MMS](https://www.mymusicstaff.com/?p=24495)). | Il credito sparisce dalla vista principale. Recensioni: le funzioni non usate «sembrano disordine» per chi lavora da solo ([Capterra](https://www.capterra.com/p/181623/TutorBird/reviews/)). **Noi: credito sempre visibile, anche in ore.** Il link saldo→scheda lo teniamo. |
| **Koalendar (IT)** | Prenotazioni self‑service, promemoria SMS, pagamenti online ([pagina ripetizioni](https://koalendar.com/it/software-prenotazioni-per/ripetizioni)). | Nomina il dolore vero: «infiniti e disordinati scambi di messaggi» su WhatsApp con i genitori. Tono da marketing («Addio messaggi incrociati»). **Noi: Matita scrive il promemoria, il tutor lo invia lui da WhatsApp.** |
| **Anolla (IT)** | Pacchetti/carnet, «conteggio automatico delle sessioni utilizzate», assistente AI «24 ore su 24» che risponde ai clienti ([pagina](https://anolla.com/it/software-per-tutoraggio)). | AI rivolta allo studente e in autonomia. **Noi: AI solo per il tutor, solo proposte.** |
| **Marketplace** (Superprof, GoStudent, Apprende…) | Trovano studenti e incassano con commissione ([Aranzulla](https://www.aranzulla.it/app-per-dare-ripetizioni-1383655.html)). | Nessuno tiene il **registro delle ore e dei contanti**: è lo spazio libero di RipetiFlow. |

### 4.2 Cosa serve davvero (dai vocali dello sviluppatore + mercato)

1. **Aprire l'app e sapere due cose**: le prossime lezioni e chi deve/chi è in credito. Nessun grafico serve a questo.
2. **Registrare una lezione in < 15 secondi dal telefono** appena finita: studente (di solito quello della lezione appena prevista), orario già proposto, materia ricordata, argomento facoltativo.
3. **Contanti e bonifico**, nessun gateway. Pagamenti anche **in anticipo** → credito che si pensa **in ore** («mi ha pagato 4 lezioni»).
4. **Tariffe che cambiano nel tempo** (inflazione, cambio di scuola): ogni lezione deve congelare la tariffa del giorno in cui è stata fatta; il registro mostra il cambio come una riga.
5. **Promemoria ai genitori** via WhatsApp: testo pronto, cortese, con il conto.
6. **Calendar solo in uscita**: la lezione diventa un evento Google; spostarla in Calendar non cambia il registro (va detto chiaramente in UI).

### 4.3 Errori UX da evitare (concreti)

| Errore | Dove l'ho visto | Regola RipetiFlow |
|---|---|---|
| Saldo con segno da decifrare (−80 / +80) | Teachworks | Parola + colore + importo senza segno |
| Più saldi per la stessa domanda | TutorCruncher | Un saldo per studente, ricalcolabile dalle righe |
| Credito nascosto | TutorBird | Credito sempre visibile, con equivalente in ore |
| Due pulsanti per addebito/accredito poi fusi a posteriori | TutorBird | Due azioni con nomi del mestiere: «Lezione» e «Pagamento» |
| Funzioni da scuola (staff, aule, payroll) che ingombrano il libero professionista | Recensioni TutorBird | Solo studenti, lezioni, pagamenti, tariffe |
| AI che agisce da sola | Anolla (verso clienti) | Matita propone in grafite; il tutor conferma |
| Cancellare una lezione = sparisce | vari | Riga annullata barrata «non addebitata», resta nello storico |
| Orari in AM/PM, settimana che inizia di domenica | template USA | 24 h, lunedì primo giorno (CLDR it: `firstDay: 1`) |

---

## 5. Convenzioni italiane verificate (Node 22, ICU)

| Cosa | Output reale di `Intl` | Nota per lo sviluppo |
|---|---|---|
| Euro 1234,5 | `"1234,50 €"` | **Attenzione**: CLDR italiano ha `minimumGroupingDigits = 2`, quindi le migliaia **non** vengono separate sotto 10.000. Per ottenere `1.234,50 €` serve `useGrouping: "always"` → `"1.234,50 €"`. |
| Spazio prima di € | U+00A0 (spazio non separabile) | Non sostituirlo con uno spazio normale: l'importo non deve andare a capo. |
| Data breve | `mar 6 ott` (6 ottobre 2026 è **martedì**) | `{weekday:"short", day:"numeric", month:"short"}` |
| Data lunga | `martedì 6 ottobre 2026` | Minuscole: in italiano giorni e mesi non hanno maiuscola. |
| Ora | `15:00` | 24 h sempre, `hour:"2-digit", minute:"2-digit"`. |
| Data numerica | `06/10/26` (short), `6 ott 2026` (medium) | Nei campi usare la forma `medium`. |
| Relativi | `ieri`, `domani`, `dopodomani` | `RelativeTimeFormat("it", {numeric:"auto"})`. |
| Settimana | `{ firstDay: 1, weekend: [6,7] }` | Agenda da lunedì a domenica. |
| Elenchi | `Luca, Giulia e Marco` | `ListFormat("it")`. |
| Durate | `1,5 ore` con `unit:"hour"` | Per le lezioni preferiamo **«1 h 30 min»** (calcolato a mano): è come parlano i tutor. `Intl.DurationFormat` **non c'è** in Node 22 → non usarlo lato server. |
| Ordinali classe | «3ª liceo», «2º anno» | Carattere `ª`/`º`, non «3a». |

---

## 6. «AI slop»: definizione operativa per questo progetto

Per *AI slop* intendo l'interfaccia «media» che un generatore produce senza vincoli: riconoscibile, intercambiabile, senza rapporto con il mestiere dell'utente. Il fenomeno è documentato: il fondatore di Tailwind si è scusato pubblicamente (agosto 2025) per aver reso `bg-indigo-500` il default dei bottoni di Tailwind UI, finito poi in «ogni interfaccia generata dall'AI» ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website), [YouWare](https://www.youware.com/blog/how-we-escaped-the-purple-prison-of-ai-frontends)). Gli stessi articoli elencano: Inter/Roboto, accenti viola, tre box con icona, angoli arrotondati ovunque, ombre «a 0.1».

### Segnali vietati in RipetiFlow (verificabili in code review)

| # | Segnale | Come lo impediamo |
|---|---|---|
| 1 | Viola/indigo, gradienti «aurora», blob sfocati | La palette Tailwind di default è **rimossa** (`--color-*: initial` in `tokens.css`): `bg-indigo-500` non compila. Nessun `linear-gradient` decorativo; gli unici gradienti ammessi disegnano tratteggi ed evidenziatore. |
| 2 | Glassmorphism (`backdrop-filter: blur`) | Vietato. Gli overlay sono carta opaca + velo `--rf-scrim`. |
| 3 | Card grigie shadcn con `rounded-xl/2xl` e `shadow-sm` | Liste a **righe**; raggi 0/3/6 px; ombre solo su sheet/popover. |
| 4 | Inter ovunque (o Roboto, Poppins, Montserrat, Geist, Space Grotesk) | Tre famiglie fisse: Literata, Schibsted Grotesk, IBM Plex Mono. |
| 5 | Emoji come icone, icone miste | Solo Phosphor *regular*. Nessuna emoji in UI né nei testi di sistema. |
| 6 | Hero centrato con gradiente e «Unlock your potential» | Landing allineata a sinistra con il **registro vero** come immagine; copy che dice cosa fa e cosa **non** fa. |
| 7 | «Welcome back, Daniele! 👋» | La dashboard si chiama **Oggi** e mostra la data. |
| 8 | Tre feature in tre box con icona | Le funzioni si spiegano **annotando** una schermata reale, come note a margine. |
| 9 | Grafici decorativi (sparkline senza assi, ciambelle) | Nessun grafico in v1. Un numero con una parola vale di più. |
| 10 | Illustrazioni 3D / robot per l'AI | Matita è una **riga e una matita** (icona `pencil-simple-line`). Nessun avatar. |
| 11 | Chat a bolle flottante in basso a destra | Matita è la prima riga del registro / la riga sopra la tab bar; ⌘K la mette a fuoco. |
| 12 | Animazioni gratuite (fade-up a ogni scroll, numeri che contano) | Movimento solo per **stato** (§8 del design system); nessuna animazione d'ingresso delle sezioni. |
| 13 | Copy gonfio («potenzia», «rivoluziona», «senza sforzo», «in un click») | Lessico del registro: segnare, ripassare, saldo, ti deve, in credito. Verbi concreti, numeri veri. |
| 14 | Placeholder generici («John Doe», «$12,680.42», «Lorem ipsum») | Dati di esempio italiani e plausibili: Giulia Ferri, 22,00 €/h, «disequazioni fratte». |
| 15 | Modalità scura = blu notte con neon | Scuro «Notte»: neutri caldi `#16171B` / `#ECE7DC`, stessi significati. |

---

## 7. Il concetto: «Registro — inchiostro e matita»

**Ipotesi di partenza** (dal brief): il libro mastro di carta, colonne Dare/Avere, inchiostro contro matita. La ricerca la conferma, con tre correzioni per evitare lo scheumorfismo kitsch:

1. **Niente texture di carta, niente font a mano, niente timbri.** La «carta» è solo un colore caldo (`#F4F1E8`) e un secondo foglio (`#FBFAF6`). Il registro è fatto di **righe da 1 px**, di una **linea di margine rossa** (come sui quaderni di scuola italiani) e della **doppia riga sotto i totali** (convenzione contabile). Sono segni grafici, non imitazioni di materiali.
2. **Niente «Dare/Avere» in interfaccia.** I termini contabili confondono chi non è ragioniere. Le colonne si chiamano **Lezione** e **Pagato**, il saldo dice **«ti deve»** o **«credito»**. Il registro tiene la logica contabile, non il gergo.
3. **Matita non è un personaggio.** È lo **stato** di una riga: grafite `#5A606A`, bordo tratteggiato, campitura a 45°. «Ripassare a penna» è il gesto di conferma: il tratteggio sparisce, una riga d'inchiostro si disegna in 420 ms, il testo passa da grafite a inchiostro. Il nome è femminile («la matita»): Matita parla al femminile («Non sono riuscita a leggere la riga»).

**Perché funziona per questo utente**
- Il tutor italiano conosce il **registro** (di classe, elettronico) e la **matita rossa e blu** dei professori: rosso per l'errore, blu per l'osservazione. Noi usiamo **rosso = ti deve** (in italiano «essere in rosso»), **blu = in credito**: è una convenzione già nella testa dell'utente, non da imparare.
- Separare **inchiostro (confermato)** e **matita (proposto)** risolve il problema di fiducia dell'AI: nulla di ciò che Matita produce entra nel saldo finché il tutor non lo ripassa. È visibile, non scritto in un disclaimer.
- Le righe dense con numeri tabellari reggono la revisione da desktop; righe da 56 px con testo a 16 px reggono la registrazione al volo da telefono.

**Alternativa valutata e scartata**: «Quaderno a quadretti» (griglia 5 mm come sfondo). Molto italiano, ma una griglia piena dietro i dati abbassa il contrasto e diventa decorazione. Resta solo come idea per lo stato vuoto (vedi 03-schermate, «pagina bianca»), non come superficie.

---

## 8. Scelta dei font (riassunto; specifiche in 02 §3)

Tutti provati a schermo sulla carta `#F4F1E8` con testi reali.

| Ruolo | Scelto | Scartati e perché |
|---|---|---|
| Display + voce | **Literata** (opsz 7–72) | Bodoni Moda: legame italiano forte ma filetti che spariscono < 40 px su schermi a bassa densità; Newsreader: elegante ma x-height 0,426 → corsivo a 16 px fragile; Besley: troppo pesante a 400; Fraunces/Instrument Serif: ormai segnali di template. |
| Interfaccia | **Schibsted Grotesk** | Atkinson Hyperlegible Next: leggibilissimo ma **zero barrato** in ogni «,00»; Public Sans: associato ai siti governativi USA; Hanken Grotesk/Figtree: neutri ma anonimi; Inter/Geist: vietati. |
| Importi | **IBM Plex Mono** | Red Hat Mono e Atkinson Mono: zero barrato; Space Mono/JetBrains Mono: da editor di codice; Courier Prime: macchina da scrivere caricaturale. |

**Scoperta da tenere a mente**: con `font-variant-numeric: tabular-nums`, Schibsted Grotesk rende **tabellari anche virgola e punto** («50 , 00»). Regola: gli importi allineati in colonna usano **Plex Mono**; negli importi dentro le frasi si usa Schibsted **senza** `tnum`.

---

## 9. Fonti

Gallerie: [Awwwards websites](https://www.awwwards.com/websites/) · [Awwwards Business & Corporate](https://www.awwwards.com/websites/business-corporate/) · [Awwwards Mobile & Apps](https://www.awwwards.com/websites/mobile-apps/) · [Awwwards Typography](https://www.awwwards.com/websites/typography/) · [Siteinspire](https://www.siteinspire.com/) · [Siteinspire Typographic](https://www.siteinspire.com/websites/category/typographic) · [Siteinspire Minimal](https://www.siteinspire.com/websites/category/minimal) · [Siteinspire Education](https://www.siteinspire.com/websites/category/education) · [Dribbble web-design-inspiration](https://dribbble.com/tags/web-design-inspiration) e tag citati al §1.

Siti e shot: R1–R13 (link nelle rispettive schede).

Concorrenti: [TutorCruncher – invoice vs available balance](https://help.tutorcruncher.com/en/articles/14183187-invoice-vs-available-balance) · [TutorCruncher – client balances](https://help.tutorcruncher.com/en/articles/8229539-client-balances) · [Teachworks – customer balances](https://intercom.help/teachworks-e2d272c6e669/en/articles/11472206-customer-balances-transactions) · [Teachworks – package balances](https://intercom.help/teachworks-e2d272c6e669/en/articles/15074742-tracking-package-balances) · [TutorBird – family account improvements](https://tutorbird.com/?p=19649) · [TutorBird features](https://www.tutorbird.com/features/) · [My Music Staff – family account](https://www.mymusicstaff.com/?p=24495) · [Capterra – TutorBird](https://www.capterra.com/p/181623/TutorBird/reviews/) · [Koalendar ripetizioni](https://koalendar.com/it/software-prenotazioni-per/ripetizioni) · [Anolla tutoraggio](https://anolla.com/it/software-per-tutoraggio) · [Aranzulla – app per dare ripetizioni](https://www.aranzulla.it/app-per-dare-ripetizioni-1383655.html).

AI slop: [prg.sh – Why your AI keeps building the same purple gradient website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) · [YouWare – The purple prison of AI frontends](https://www.youware.com/blog/how-we-escaped-the-purple-prison-of-ai-frontends).

Sorgente prodotto: `docs/source/raw-transcript.md` (vocali WhatsApp del 2 ottobre 2026).
