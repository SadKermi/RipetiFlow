# RipetiFlow — Schermate

*v1.0 · 6 ottobre 2026 · Riferimenti: [02-design-system.md](02-design-system.md) per token e componenti, [specimen.html](specimen.html) per l'aspetto reale.*

Convenzioni dei wireframe: mobile a **390 px** (≈ 40 caratteri), desktop a **1440 px** (≈ 100 caratteri). `▒` = bozza a matita (tratteggio), `═` = doppia riga del totale, `│` rosso = linea di margine, `[ ]` = bottone, `[■ ]` = bottone inchiostro (primario), `‹ ›` = campo, `¦` = evidenziatore. Dati d'esempio coerenti in tutto il documento (oggi = **martedì 6 ottobre 2026, 14:20**).

Mappa:

```
Landing ──► Login (Google) ──► Oggi ─┬─► Studenti ──► Scheda studente (registro) ─┬─► Lezione (sheet)
                                     │                                          ├─► Pagamento (sheet)
                                     ├─► Agenda (settimana) ──► Scheda studente  ├─► Tariffa (sheet)
                                     ├─► Altro / Impostazioni                    └─► Studente (sheet)
                                     └─► Matita (ovunque: riga + ⌘K)
```

---

## 1. Landing (pubblica)

**Obiettivo**: far capire in 10 secondi cosa fa, a chi serve e cosa **non** fa; un solo invito: entrare con Google.
**Gerarchia**: H1 → sottotitolo → CTA → registro reale annotato → Matita → cosa non fa → domande → footer.

### Copy (definitivo, italiano)

- **Occhiello**: Per chi dà ripetizioni
- **H1**: Segna la lezione appena finita. ¦Il conto lo tiene il registro.¦
- **Sottotitolo**: Un registro per ogni studente: lezioni, pagamenti in contanti o con bonifico, e un saldo che si aggiorna riga per riga. Sai sempre chi ti deve cosa e chi ha pagato in anticipo.
- **CTA**: [■ Entra con Google]  · sotto, 14 px: Usi il tuo account Google. Le lezioni compaiono anche nel tuo Google Calendar.
- **Sezione 1 — «Una pagina per studente»** (figura: registro di Giulia Ferri con 3 note a margine numerate)
  1. **La lezione.** Giorno, orario, materia e argomento. L'importo lo calcola dalla tariffa di quel giorno.
  2. **Il pagamento.** Contanti o bonifico, anche in anticipo: il credito si legge in ore.
  3. **Il saldo.** In rosso se ti deve, in blu se è in credito. Nessun segno meno da interpretare.
- **Sezione 2 — «Matita scrive a matita. Tu ripassi a penna.»**
  Scrivi come scriveresti su un foglietto: «ieri 15–16:30 matematica con Luca, equazioni di secondo grado». Matita prepara la riga e la lascia a matita. Entra nel registro solo quando la confermi. Può anche risponderti («quanto mi deve Giulia?») e scrivere un promemoria da mandare ai genitori su WhatsApp.
- **Sezione 3 — «Cosa non fa»**
  Non incassa pagamenti e non manda fatture: registri tu quello che hai ricevuto. Non legge il tuo Calendar: ci scrive soltanto le lezioni, e se sposti un evento lì il registro non cambia. Non manda messaggi al posto tuo: prepara il testo, lo invii tu.
- **Domande**
  - *I miei dati chi li vede?* Solo tu, con il tuo account Google. Puoi esportare tutto in CSV da Impostazioni.
  - *Posso cambiare la tariffa di uno studente?* Sì, da una certa data in poi. Le lezioni già segnate restano alla tariffa di allora.
  - *Funziona dal telefono?* È pensato prima di tutto per il telefono: si registra una lezione in pochi tocchi.
  - *Quanto costa?* **[da definire con il cliente — non pubblicare finché non è deciso]**
- **Footer**: RipetiFlow · Privacy · Contatti · © 2026

### Mobile 390

```
┌────────────────────────────────────────┐
│ ▮R RipetiFlow                 [Entra]  │
├────────────────────────────────────────┤
│ PER CHI DÀ RIPETIZIONI                 │
│ Segna la lezione                       │
│ appena finita.                         │  display-xl 40/44
│ ¦Il conto lo tiene¦                    │
│ ¦il registro.¦                         │
│ Un registro per ogni studente:         │
│ lezioni, pagamenti in contanti o con   │
│ bonifico, e un saldo che si aggiorna…  │
│ [■ G  Entra con Google               ] │  44 px, piena larghezza
│ Usi il tuo account Google. Le lezioni  │
│ compaiono anche nel tuo Calendar.      │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Una pagina per studente                │
│ ┌──────────────────────────────────┐   │  registro reale (HTML, non
│ │Giulia Ferri      67,00 € TI DEVE │   │  immagine), 4 righe
│ │lun 5│ Fisica · moto…    44,00 ①  │   │
│ │ven 2│ Pagamento        50,00  ②  │   │
│ │     │ DEVE 23,00 €            ③  │   │
│ └──────────────────────────────────┘   │
│ ① La lezione. …                        │
│ ② Il pagamento. …                      │
│ ③ Il saldo. …                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Matita scrive a matita.                │
│ Tu ripassi a penna.                    │
│ ▒ ieri ¦15–16:30¦ ¦matematica¦ con ▒   │  card a matita animata 1 volta
│ ▒ ¦Luca¦ …          [■ Ripassa]    ▒   │  quando entra nel viewport
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Cosa non fa                            │
│ — Non incassa pagamenti…               │
│ — Non legge il tuo Calendar…           │
│ — Non manda messaggi al posto tuo…     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Domande  (righe espandibili, 56 px)    │
│ [■ Entra con Google                  ] │
│ RipetiFlow · Privacy · Contatti        │
└────────────────────────────────────────┘
```

### Desktop 1440

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▮R RipetiFlow                                     Come funziona   Matita   Domande     [Entra]   │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ PER CHI DÀ RIPETIZIONI                          ┌──────────────────────────────────────────────┐ │
│ Segna la lezione                                │ Giulia Ferri                  67,00 € TI DEVE│ │
│ appena finita.                                  │──────────────────────────────────────────────│ │
│ ¦Il conto lo tiene il registro.¦                │ ✎ Scrivi una riga…                      ⌘K + │ │
│                                                 │▒mar 6│ Matematica · equazioni   33,00 sarà 100▒│ │
│ Un registro per ogni studente: lezioni,         │ lun 5│ Fisica · moto rettilineo 44,00 deve 67  │ │
│ pagamenti in contanti o con bonifico, e un      │ ven 2│ Pagamento · bonifico     50,00 deve 23  │ │
│ saldo che si aggiorna riga per riga.            │ gio 1│ ↻ Tariffa da 20,00 a 22,00 €/h          │ │
│                                                 │══════════════════════════════════════════════│ │
│ [■ G  Entra con Google]                         └──────────────────────────────────────────────┘ │
│ Usi il tuo account Google…                        col. 7–12: il registro vero, HTML statico     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ § 1  Una pagina per studente           figura annotata: note ①②③ nel margine destro          │
│ § 2  Matita scrive a matita…           a sinistra testo, a destra card che si ripassa a penna │
│ § 3  Cosa non fa                       tre righe, 2 colonne                                    │
│ § 4  Domande                           accordion a righe                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Interazioni**: «Entra» e CTA → login Google. La card di Matita si ripassa a penna **una volta** quando è visibile al 60 % (niente se `reduced-motion`). Nessun carosello, nessun video automatico.
**Stati**: se l'utente è già autenticato, «Entra» diventa «Apri il registro» e porta a Oggi.
**Prestazioni**: nessuna immagine sopra la piega; font precaricati (solo Schibsted latin); obiettivo LCP < 1,8 s su 4G.

---

## 2. Login

Una sola schermata, nessun form password.

```
Mobile 390                                 Desktop 1440 (colonna centrale 440 px)
┌────────────────────────────────────┐     ┌──────────────────────────────────────────────┐
│ ▮R RipetiFlow                      │     │                ▮R RipetiFlow                  │
│                                    │     │                                              │
│ Entra nel tuo registro             │     │          Entra nel tuo registro              │  display-m
│ Usiamo il tuo account Google per   │     │   Usiamo il tuo account Google per l'accesso │
│ l'accesso e per scrivere le        │     │   e per scrivere le lezioni nel tuo Calendar.│
│ lezioni nel tuo Calendar.          │     │                                              │
│ [■ G  Continua con Google        ] │     │        [■ G  Continua con Google ]            │
│ Calendar si collega dopo, da       │     │   Calendar si collega dopo, da Impostazioni. │
│ Impostazioni. Puoi farne a meno.   │     │                                              │
│ ────────────────────────────────── │     │                                              │
│ Privacy · Termini                  │     │               Privacy · Termini               │
└────────────────────────────────────┘     └──────────────────────────────────────────────┘
```

- Il permesso Calendar **non** si chiede al login (meno attrito, meno spavento): si chiede in Impostazioni o alla prima lezione salvata («Vuoi vedere le lezioni anche nel tuo Google Calendar? [Collega] [Non ora]»).
- **Stati**: in attesa → bottone con 3 puntini statici, «Ti stiamo facendo entrare…»; errore/annullato → nota sotto il bottone con `Warning`: «Accesso non completato. Riprova.»; app non verificata da Google (fase attuale) → nota grafite: «Google potrebbe mostrarti un avviso “app non verificata”: è normale finché la verifica non è conclusa.»

---

## 3. Oggi (dashboard)

**Domanda a cui risponde**: «Cosa ho adesso e chi mi deve soldi?» In quest'ordine.
**Gerarchia**: data e titolo → riga di Matita → prossime lezioni (con «Da segnare» per quelle passate non registrate) → conti aperti con totali → (desktop) settimana in breve.

### Mobile 390

```
┌────────────────────────────────────────┐
│ ▮R RipetiFlow                    (DM)  │
│ martedì 6 ottobre                      │  body-s ink-3
│ Oggi                                   │  display-l
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Prossime lezioni               Agenda  │
│ 15:00  Giulia Ferri                  › │  60 px
│ 16:30  Matematica · ¦tra 40 min¦       │
│ ────────────────────────────────────── │
│ 17:00  Luca Bianchi                  › │
│ 18:00  Latino                          │
│ MER 7 OTT                              │
│ 16:00  Marco Rossi                   › │
│ 17:30  Fisica                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Da segnare                             │  solo se esistono
│ ▒ lun 5 · 18:00 Sara Conti   [Segna] ▒ │  lezione prevista e passata
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Conti aperti                  Studenti │
│ Marco Rossi           DEVE  120,00 €   │  ordinati per importo
│ Giulia Ferri          DEVE   67,00 €   │
│ Elena Greco           DEVE   25,00 €   │
│ Luca Bianchi       CREDITO  40,00 € ≈2h│
│ Da incassare                212,00 €   │  Literata 500
│ ══════════════════════════════════════ │
│ Anticipi ricevuti            40,00 €   │
├────────────────────────────────────────┤
│ ✎ Scrivi a Matita…               [■ +] │  barra fissa 56 px
├────────────────────────────────────────┤
│  ⌂ Oggi   🎓 Studenti  ▦ Agenda  ⚙ Altro│  tab bar 64 px (icone Phosphor)
└────────────────────────────────────────┘
```

### Desktop 1440

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▮R RipetiFlow     Oggi   Studenti   Agenda                                 [✎ Matita ⌘K]  (DM)  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ martedì 6 ottobre                                                                                │
│ Oggi                                                                                             │
│ ✎ Scrivi una riga… «ieri 15–16:30 matematica con Luca»                                    ⌘K  +  │
│──────────────────────────────────────────────────────────────────────────────────────────────────│
│ col 1–7                                              │ col 8–12                                  │
│ Prossime lezioni                            Agenda › │ Conti aperti                   Studenti › │
│ 15:00–16:30  Giulia Ferri   Matematica  ¦tra 40 min¦ │ Marco Rossi            DEVE   120,00 €    │
│ 17:00–18:00  Luca Bianchi   Latino                   │ Giulia Ferri           DEVE    67,00 €    │
│ MER 7 OTT                                            │ Elena Greco            DEVE    25,00 €    │
│ 16:00–17:30  Marco Rossi    Fisica                   │ Luca Bianchi        CREDITO    40,00 € ≈2h│
│ GIO 8 OTT                                            │ Da incassare                  212,00 €    │
│ 15:00–16:00  Giulia Ferri   Matematica               │ ═════════════════════════════════════     │
│                                                      │ Anticipi ricevuti              40,00 €    │
│ Da segnare                                           │                                           │
│ ▒ lun 5 · 17:00–18:00 Sara Conti · Chimica  [Segna] ▒│ Questa settimana                          │
│                                                      │ 7 lezioni · 10 h 30 · 231,00 €            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Interazioni**
- Tap su lezione → scheda studente con la riga in evidenza; tap lungo/menu «…» (desktop) → Segna come fatta / Sposta / Annulla.
- **Segna** su una lezione passata: apre il form lezione **precompilato** (studente, orario, materia previsti); un tocco su «Salva lezione». È il percorso più veloce dal telefono.
- Tap su riga «Conti aperti» → scheda studente; su desktop menu: Registra pagamento, Promemoria.
- «Questa settimana» (desktop): solo numeri, nessun grafico.

**Stati**
- *Vuoto, primo accesso*: al posto delle sezioni: «Benvenuto nel registro. Inizia dal primo studente: nome e tariffa bastano.» [■ Aggiungi studente] + riga Matita attiva («oppure scrivi: “nuovo studente Giulia Ferri, 22 € l'ora”»).
- *Nessuna lezione in programma*: «Nessuna lezione in programma.» + link «Aggiungi una lezione».
- *Tutti in pari*: «Tutti in pari.» in `--rf-ink-2`.
- *Caricamento*: titolo e data subito (sono locali); sezioni con righe‑scheletro **statiche** (barre `--rf-paper-sunk` 12 px, nessuna animazione), max 3 righe.
- *Errore di rete*: banda sotto il titolo: `CloudSlash` «Non riesco a caricare i dati. Le ultime informazioni sono di stamattina alle 9:12. [Riprova]» (dati in cache mostrati in `--rf-ink-2`).

---

## 4. Studenti (indice)

**Gerarchia**: titolo + conteggio → ricerca → filtro → elenco ordinato.

```
Mobile 390                                  Desktop 1440 (tabella, contenuto max 1200)
┌────────────────────────────────────────┐  ┌──────────────────────────────────────────────────────────────┐
│ Studenti                       [+ Nuovo]│  │ Studenti · 9 attivi                          [■ + Nuovo studente]│
│ 9 attivi                                │  │ ‹⌕ Cerca per nome›     [Tutti|Ti devono|In credito]  Ordina: Saldo ▾│
│ ‹⌕ Cerca per nome                    ›  │  │──────────────────────────────────────────────────────────────│
│ [Tutti | Ti devono | In credito]        │  │ NOME            MATERIE           ULTIMA LEZIONE  TARIFFA  SALDO   │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  │ Marco Rossi     Fisica            mer 30 set      20,00   DEVE 120,00 €│
│ Marco Rossi             DEVE 120,00 € › │  │ Giulia Ferri    Matematica, Fisica lun 5 ott      22,00   DEVE  67,00 €│
│ Fisica · ultima mer 30 set              │  │ Elena Greco     Inglese           ven 2 ott       18,00   DEVE  25,00 €│
│ ─────────────────────────────────────── │  │ Luca Bianchi    Latino, Matematica lun 5 ott      20,00   CRED. 40,00 €│
│ Giulia Ferri             DEVE 67,00 € › │  │ Sara Conti      Chimica           lun 28 set      25,00   In pari     │
│ Matematica, Fisica · ultima lun 5 ott   │  │ …                                                                   │
│ ─────────────────────────────────────── │  │ ARCHIVIATI (2) ▸                                                    │
│ Luca Bianchi   CREDITO 40,00 € · 2 h  › │  └──────────────────────────────────────────────────────────────┘
│ …                                       │
│ Archiviati (2) ▸                        │
│ ✎ Scrivi a Matita…               [■ +] │
│ ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro  │
└────────────────────────────────────────┘
```

- Ordine predefinito: **chi deve di più in alto**, poi credito, poi in pari (alfabetico). Su desktop colonne ordinabili.
- Ricerca istantanea (client), anche per cognome e nome del genitore.
- «Archivia» (dalla scheda) nasconde lo studente dalle liste ma conserva il registro; non si può archiviare uno studente con saldo ≠ 0 senza conferma esplicita («Marco ti deve ancora 120,00 €. Archiviare comunque?»).
- **Stati**: vuoto → «Nessuno studente. Inizia dal primo: nome e tariffa bastano.» [■ Aggiungi studente]; ricerca senza risultati → «Nessuno si chiama “Giovanni”. [Aggiungi Giovanni come studente]»; filtro vuoto → «Nessuno ti deve soldi.» / «Nessuno è in credito.»

---

## 5. Scheda studente — il libro mastro (cuore dell'app)

**Gerarchia**: nome → saldo (numero grande + parola) → azioni Pagamento/Promemoria → riga di Matita → registro (recenti in alto) → tariffa e contatti.

### Desktop 1440 (vedi `specimen.html` §1)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▮R RipetiFlow     Oggi   Studenti   Agenda                                 [✎ Matita ⌘K]  (DM)  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ‹ Studenti                                                                                       │
│ STUDENTESSA                  │ DATA  │ VOCE                         DURATA  LEZIONE  PAGATO  SALDO│
│ Giulia Ferri                 │───────┼──────────────────────────────────────────────────────────│
│ 3ª liceo scientifico         │ ✎ Scrivi una riga… «oggi 15–16:30 matematica, equazioni»   ⌘K  +│
│ Mamma: Anna Ferri · 347…     │▒mar 6 │ Matematica · equazioni di… 1 h 30   33,00   sarà 100,00▒│
│                              │▒15:00 │ ✎ Matita ha letto: «…»   [■ Ripassa a penna] Modifica Scarta▒│
│ SALDO AL 6 OTTOBRE           │ lun 5 │ Fisica · moto rettilineo…  2 h      44,00   DEVE 67,00 €│
│ 67,00 €  TI DEVE             │ sab 3 │ M̶a̶t̶e̶m̶a̶t̶i̶c̶a̶  Annullata · non addeb.  —        DEVE 23,00 €│
│ Ultimo pagamento 50,00 € il  │ ven 2 │ ⌂ Pagamento · bonifico                    50,00 DEVE 23,00 €│
│ 2 ott, con bonifico…         │ gio 1 │ Fisica · vettori e componenti 1 h 30 33,00   DEVE 73,00 €│
│ ════════════════════════════ │ gio 1 │ ↻ Tariffa da 20,00 a 22,00 €/h per le lezioni da questa data│
│ [■ Pagamento] [ Promemoria ] │ lun 28│ Matematica · disequazioni…  2 h      40,00   DEVE 40,00 €│
│                              │ 27 set│ Riporto dal registro di settembre               IN PARI 0,00│
│ TARIFFA ORARIA               │═══════╧══════════════════════════════════════════════════════════│
│ dal 1 ott 2026    22,00 €/h  │ [Mostra settembre ▾]                         [Esporta CSV]       │
│ dal 15 set 2025   20,00 €/h  │                                                                  │
│ Cambia tariffa…              │                                                                  │
│ MATERIE  Matematica, Fisica  │                                                                  │
│ [ Modifica dati ] [ ⋯ ]      │                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
  aside 336 px sticky (top 88)        registro max 880 px, linea di margine rossa a x=104
```

### Mobile 390

```
┌────────────────────────────────────────┐
│ ‹ Studenti                      [ ⋯ ]  │
│ STUDENTESSA                            │
│ Giulia Ferri                           │  display-m
│ 3ª liceo scientifico · Mat., Fisica    │
│ SALDO AL 6 OTTOBRE                     │
│ 67,00 €  TI DEVE                       │  display-l 34, debito
│ Ultimo pagamento 50,00 € il 2 ott…     │
│ ══════════════════════════════════════ │
│ [■ Pagamento    ] [  Promemoria     ]  │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ✎ Scrivi una riga…                 [+] │
│ mar 6 │▒ Matematica · equaz…   33,00 ▒ │
│  ott  │▒ 15:00–16:30 · Bozza         ▒ │
│       │▒ SARÀ 100,00 €               ▒ │
│       │▒ [■ Ripassa a penna] Modifica▒ │
│ lun 5 │ Fisica · moto rettilineo 44,00 │  56+ px
│  ott  │ 17:00–19:00 · Esercizi 4–9…    │
│       │ DEVE 67,00 €                   │
│ ven 2 │ ⌂ Pagamento · bonifico   50,00 │
│  ott  │ DEVE 23,00 €                   │
│ gio 1 │ ↻ Tariffa 20,00 → 22,00 €/h    │
│ …     │                                │
│ ══════════════════════════════════════ │
│ Tariffa · Contatti · Materie   ▸       │  sezione richiudibile in fondo
│ ✎ Scrivi a Matita…               [■ +] │  (barra globale nascosta: qui la
│ ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro  │   riga è dentro il registro)
└────────────────────────────────────────┘
```

**Interazioni**
- **Riga di Matita** con contesto studente implicito: «oggi 15–16:30 mate, equazioni» basta. Le proposte compaiono come **righe bozza** nella posizione cronologica giusta e il saldo mostra «sarà …».
- **+** → sheet Lezione precompilato (studente fisso, materia = ultima, orario = prossima lezione prevista o adesso arrotondato ai 15 min precedenti).
- **Pagamento** → sheet Pagamento con importo suggerito = debito attuale (`67,00`) e chip rapidi «67,00 · 50,00 · 100,00».
- **Promemoria** → Matita prepara il messaggio per il contatto (card a matita, Copia / WhatsApp).
- Tap riga → sheet di modifica della voce; dal menu: Annulla lezione (diventa riga barrata, non addebitata), Elimina (con conferma: «Eliminare la lezione di lun 5 ott? Il saldo passerà da 67,00 € a 23,00 €.»).
- Tastiera desktop: `N` nuova lezione, `P` pagamento, `⌘K` Matita, `↑/↓` tra le righe, `Invio` apre la riga.
- Il registro carica 2 mesi; «Mostra settembre ▾» carica il mese precedente (paginazione per mese, il riporto si sposta).
- «Esporta CSV» → righe del registro con colonne `data;inizio;fine;materia;argomento;durata_min;tariffa;addebito;pagamento;metodo;saldo` (separatore `;`, decimali con virgola: Excel italiano).

**Stati**
- *Registro vuoto*: sotto la riga di Matita, 6 righe tratteggiate vuote (`--rf-rule`, nessun testo) e la frase «Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo.»
- *Saldo in credito*: «40,00 € CREDITO» in blu + «Pari a circa 2 h di lezione a 20,00 €/h.»
- *Saldo zero*: «0,00 € IN PARI» in `--rf-ink-2`.
- *Caricamento*: aside subito (dati in cache), registro con 4 righe‑scheletro statiche.
- *Errore salvataggio riga*: la riga resta con bordo `--rf-danger` 2 px a sinistra e nota «Non salvata. [Riprova] [Scarta]»; il saldo **non** cambia.
- *Calendar non sincronizzato* (per una lezione): icona `CloudSlash` 16 px accanto all'orario, tooltip/nota «Non è nel tuo Calendar. [Riprova]».

---

## 6. Agenda (settimana)

**Gerarchia**: settimana corrente (lun→dom) → lezioni per giorno → linea «adesso».

### Desktop 1440 — vista colonne 07:00–21:00

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Agenda        ‹  6–12 ottobre 2026  ›   [Oggi]                       7 lezioni · 10 h 30 · 231,00 €│
├──────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬───────────┬─────────┤
│      │ LUN 5       │ ¦MAR 6¦     │ MER 7       │ GIO 8       │ VEN 9       │ SAB 10    │ DOM 11  │
│ 14:00│             │─14:20 ━━━━━━│             │             │             │           │         │  linea adesso: ink 2 px
│ 15:00│             │┃Giulia F.   │             │┃Giulia F.   │             │           │         │  blocco: filetto sx 3 px
│      │             │┃Matematica  │             │┃Matematica  │             │           │         │  inchiostro, fondo raised
│ 16:00│             │             │┃Marco R.    │             │┃Elena G.    │           │         │
│ 17:00│┃Giulia F. ✓ │┃Luca B.     │┃Fisica      │             │┃Inglese     │           │         │  ✓ = registrata nel registro
│ 18:00│┃Sara C. ▒Da │             │             │             │             │           │         │  passata non registrata:
│      │┃ segnare▒   │             │             │             │             │           │         │  tratteggio + «Da segnare»
└──────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴───────────┴─────────┘
```

### Mobile 390 — lista per giorno (nessuna griglia oraria)

```
┌────────────────────────────────────────┐
│ Agenda                        [Oggi]   │
│ ‹  6–12 ottobre  ›                     │
│ [L5][¦M6¦][M7][G8][V9][S10][D11]       │  striscia giorni 44 px, punto se ci sono lezioni
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ MARTEDÌ 6 OTT · OGGI                   │
│ ─ ─ ─ ─ ─ ─ adesso 14:20 ─ ─ ─ ─ ─ ─ ─ │
│ 15:00  Giulia Ferri                  › │
│ 16:30  Matematica · ¦tra 40 min¦       │
│ 17:00  Luca Bianchi                  › │
│ 18:00  Latino                          │
│ MERCOLEDÌ 7 OTT                        │
│ 16:00  Marco Rossi                   › │
│ …                                      │
│ ✎ Scrivi a Matita…               [■ +] │
│ ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro  │
└────────────────────────────────────────┘
```

- Mostra **lezioni previste e registrate**; quelle passate non registrate hanno «Da segnare» a matita.
- Tap su uno spazio vuoto (desktop) → sheet Lezione con giorno/ora; trascinamento **non** in v1 (evita spostamenti accidentali).
- Nota in fondo: «Le lezioni compaiono nel tuo Google Calendar. Se le sposti lì, qui non cambiano.»
- **Stati**: settimana vuota → «Nessuna lezione questa settimana.» [+ Lezione]; Calendar scollegato → nessun blocco (l'agenda è nostra), solo la nota in Impostazioni.

---

## 7. Moduli (sheet su mobile, dialog 560 px su desktop)

Regole comuni: titolo Literata `display-m`; campi a piena larghezza; barra azioni fissa in basso: **[Annulla]** a sinistra, **[■ Salva …]** a destra; Invio salva su desktop; dopo il salvataggio il sheet si chiude e compare il toast con **Annulla**.

### 7.1 Lezione

```
┌────────────────────────────────────────┐
│              ────                      │  maniglia
│ Nuova lezione                          │
│ Studente                               │
│ ‹🎓 Giulia Ferri                    ▾› │
│ Giorno                                 │
│ ‹▦ mar 6 ott 2026              oggi  › │
│   Oggi · Ieri · Altro…                 │
│ Orario                                 │
│ ‹ 15:00 › → ‹ 16:30 ›                  │  Plex Mono, numeric
│   +1 h · +1 h 30 · +2 h                │
│   1 h 30 min · 33,00 € a 22,00 €/h     │  calcolo live
│ Materia                                │
│ ‹ Matematica                       ▾ › │
│ Argomento                              │
│ ‹ equazioni di secondo grado         › │  Literata italic, 120 car.
│ Note (solo per te)                     │
│ ‹ esercizi 4–9 pag. 112…             › │  textarea 3 righe
│ ☐ Aggiungi al mio Google Calendar      │  spuntato se collegato
├────────────────────────────────────────┤
│ [ Annulla ]          [■ Salva lezione ]│
└────────────────────────────────────────┘
```

- Due campi testo distinti come chiesto nei vocali: **Argomento** (breve, compare nel registro e nel titolo dell'evento Calendar) e **Note** (private, non vanno in Calendar).
- Validazione: studente obbligatorio; fine > inizio; durata ≤ 8 h («Sei sicuro? 9 h di lezione»); data futura ammessa (lezione **prevista**: non addebitata finché non è passata o segnata).
- Evento Calendar: titolo «Giulia Ferri · Matematica», descrizione = argomento; nessun dato economico in Calendar.

### 7.2 Pagamento

```
┌────────────────────────────────────────┐
│ Pagamento ricevuto                     │
│ Da                                     │
│ ‹🎓 Giulia Ferri                    ▾› │
│   Ti deve 67,00 €                      │  badge debito
│ Importo                                │
│ ‹ 67,00                            € › │  Plex Mono 18/500, decimal
│   67,00 · 50,00 · 100,00               │  chip rapidi
│ Come                                   │
│ [ Contanti ✓ | Bonifico ]              │  segmented
│ Giorno                                 │
│ ‹▦ mar 6 ott 2026              oggi  › │
│ Nota                                   │
│ ‹ es. pagamento di settembre         › │
│   Dopo: in pari                        │  anteprima saldo (o «credito 33,00 € ≈ 1 h 30»)
├────────────────────────────────────────┤
│ [ Annulla ]    [■ Registra pagamento ] │
└────────────────────────────────────────┘
```

- L'anteprima «Dopo: …» è la riga più importante: conferma l'effetto prima di salvare.
- Importo > 3× debito: avviso non bloccante «Sono 300,00 €: lo studente avrà 233,00 € di credito (≈ 10 h 30).»

### 7.3 Cambio tariffa

```
┌────────────────────────────────────────┐
│ Nuova tariffa per Giulia               │
│ Tariffa attuale 22,00 €/h dal 1 ott    │
│ Nuova tariffa                          │
│ ‹ 24,00                         €/h  › │
│ Valida dal                             │
│ ‹▦ lun 2 nov 2026                    › │
│ ┌────────────────────────────────────┐ │
│ │ Le lezioni prima del 2 nov restano │ │  nota inchiostro su sunk
│ │ a 22,00 €/h. 0 lezioni già segnate │ │
│ │ dopo il 2 nov verranno ricalcolate.│ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ [ Annulla ]        [■ Salva tariffa ]  │
└────────────────────────────────────────┘
```

- Se la data è nel passato e ci sono lezioni già segnate dopo quella data: elenco delle lezioni interessate con vecchio → nuovo importo e conferma esplicita «Ricalcola 3 lezioni (+6,00 €)».

### 7.4 Studente (nuovo / modifica)

Campi: **Nome e cognome** (obbligatorio) · **Tariffa oraria** (obbligatoria, €/h) · Classe/scuola (testo libero, es. «3ª liceo scientifico») · Materie (multi‑selezione dalle materie dell'utente) · Contatto: nome genitore/referente, telefono (link WhatsApp), email · Note. In fondo, in modifica: «Saldo iniziale» (solo alla creazione: «Ti deve già / È già in credito / In pari» + importo → crea la riga «Inizio registro») · [Archivia studente] (pericolo, con conferma).

---

## 8. Impostazioni («Altro» su mobile)

```
Mobile 390                                   Desktop 1440: colonna 640 px, stesse sezioni
┌────────────────────────────────────────┐
│ Altro                                  │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ PROFILO                                │
│ (DM) Daniele Marchi                    │
│      daniele…@gmail.com                │
│ Nome nei messaggi  ‹ Daniele         › │  firma dei promemoria di Matita
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ MATERIE                                │
│ Matematica · Fisica · Latino · Inglese │  righe riordinabili
│ Chimica · Italiano      [+ Materia]    │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ GOOGLE CALENDAR                        │
│ ☁✓ Collegato a «Lezioni» (calendario   │
│    dedicato) · ultima sincr. 14:02     │
│ [ Cambia calendario ] [ Scollega ]     │
│ Le lezioni vanno solo da RipetiFlow a  │
│ Calendar. Le modifiche fatte in        │
│ Calendar non tornano qui.              │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ASPETTO                                │
│ [ Sistema | Chiaro | Scuro ]           │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ESPORTA                                │
│ [ Scarica CSV di tutto il registro ]   │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ [ Esci ]                               │
│ Elimina account e dati…                │  pericolo, conferma digitando ELIMINA
└────────────────────────────────────────┘
```

- Consiglio di default: creare un **calendario dedicato «Lezioni»** (così l'utente può nasconderlo/colorarlo in Google) invece di scrivere nel principale; scelta in fase di collegamento.
- **Stati Calendar**: non collegato → «Non collegato. Le lezioni restano solo qui. [Collega Google Calendar]»; errore permessi → `CloudSlash` «Google ha revocato l'accesso. 3 lezioni non sono in Calendar. [Ricollega]»; sincronizzazione in corso → «Sto scrivendo 4 lezioni in Calendar…».
- Eliminare una materia usata: «Matematica è usata in 42 lezioni: verrà nascosta dal menu ma resterà nello storico.»

---

## 9. Matita (flussi completi)

Componente e stati: 02 §9.13. Qui i flussi.

### 9.1 Mobile — registrare una lezione appena finita (percorso principale)

```
1) Oggi, barra in basso           2) Sta pensando                  3) Proposta (sheet a metà)
┌──────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
│ …                        │      │ …                        │     │ ▒ MATITA PROPONE        ▒│
│ ✎ ‹oggi 15-16:30 mate co…│      │ ✎ oggi 15–16:30 mate co… │     │ ▒ ¦oggi¦ ¦15–16:30¦ ¦mate¦▒│
│   n giulia, equazioni›   │      │ ~~~~~~~~~~~~~~ (tratto)  │     │ ▒ con ¦giulia¦, ¦equaz…¦ ▒│
│               [■ Invia]  │      │ ¦Matita sta scrivendo…¦  │     │ ▒ Studente  Giulia Ferri ▒│
│ tastiera                 │      │                          │     │ ▒ Data      mar 6 ott    ▒│
└──────────────────────────┘      └──────────────────────────┘     │ ▒ Orario 15:00–16:30 1h30▒│
                                                                    │ ▒ Materia   Matematica   ▒│
4) Ripassa a penna → toast                                          │ ▒ Argomento equazioni di…▒│
┌──────────────────────────┐                                        │ ▒ Importo   33,00 €      ▒│
│ ✓ Lezione registrata ·   │                                        │ [■ Ripassa a penna]       │
│   in Calendar  [Annulla] │                                        │ [ Modifica ]   Scarta     │
└──────────────────────────┘                                        └──────────────────────────┘
```

- In 3) la proposta si apre in un **sheet a metà altezza**, sopra la barra; «Modifica» apre il form Lezione precompilato.
- Obiettivo: dalla fine della lezione al salvataggio **≤ 4 tocchi + la frase**.

### 9.2 Desktop — ⌘K da qualsiasi pagina

- Nella scheda studente e in Oggi: ⌘K porta il cursore sulla riga di Matita della pagina (scroll morbido se serve, istantaneo con reduced-motion).
- In Agenda, Studenti, Impostazioni: ⌘K apre un **dialog in alto** (larghezza 720, a 12 vh) con la sola riga e, sotto, le ultime 3 frasi usate in grafite (Tab per sceglierle). Le proposte appaiono come card nel dialog; *Ripassa a penna* salva e chiude.

### 9.3 Domande e messaggi

- «quanto mi deve Giulia?» → **nota a margine** sotto la riga (non un messaggio in una chat), con link al registro. La nota sparisce alla domanda successiva o con Esc; le ultime 5 note restano raggiungibili con ↑ nella riga.
- «chi mi deve più di 50 €?» → nota con elenco di 2–5 nomi + importi (Plex), ogni nome è un link.
- «scrivi un promemoria di pagamento per la mamma di Marco» → card messaggio a matita: testo modificabile, firma dal profilo, importi dal registro; azioni Copia · WhatsApp · Modifica. Se manca il telefono: «Non ho il numero della mamma di Marco. [Aggiungilo] oppure [Copia il testo].»

### 9.4 Testi di sistema (definitivi)

| Situazione | Testo |
|---|---|
| Placeholder registro | Scrivi una riga… «oggi 15–16:30 matematica, equazioni» |
| Placeholder mobile | Scrivi a Matita… |
| Sta pensando | Matita sta scrivendo… |
| Intestazione proposta | Matita propone |
| Riga sorgente in bozza | Matita ha letto: «…» |
| Conferma | Ripassa a penna |
| Più proposte | Ripassa tutte a penna (3) |
| Fuori ambito | Questo non lo so fare. Posso segnare lezioni e pagamenti, dirti i saldi e scrivere promemoria. Prova: «chi mi deve più di 50 €?» |
| Ambiguo | Manca lo studente: c'è un Luca Bianchi e un Luca Moretti. Scegli oppure usa il modulo. |
| Non capito | Non sono riuscita a leggere la riga. Prova a scrivere giorno, orario e studente, oppure usa il modulo. |
| Errore rete | Errore di rete. La riga non è stata salvata e resta nel campo. Riprova. |
| Limite | Pausa fino alle 16:40. Hai usato le 30 richieste di quest'ora. I moduli funzionano come sempre. |
| Dopo conferma | Lezione registrata · in Calendar — Annulla |

---

## 10. Checklist di accettazione visiva (per la review delle PR)

- [ ] Nessun colore fuori dai token; `bg-indigo-*` & co. non compilano.
- [ ] Ogni importo: formato `1.234,50 €` (`useGrouping:"always"`), colonne in Plex Mono, nessun segno meno nei saldi.
- [ ] Ogni saldo ha una parola (deve / credito / in pari).
- [ ] Le bozze di Matita sono tratteggiate, in grafite, e **non** cambiano i totali.
- [ ] Target ≥ 44 px su mobile, input 16 px.
- [ ] Focus visibile (contorno inchiostro + alone giallo) su ogni controllo.
- [ ] Dark mode verificata con `data-theme="dark"` e con preferenza di sistema.
- [ ] Nessuna ombra su righe/liste, nessun `rounded-xl` o superiore, nessun `backdrop-filter`.
- [ ] `prefers-reduced-motion`: nessuna traslazione, nessun loop.
- [ ] Testi in italiano, minuscole per giorni/mesi, 24 h, settimana da lunedì.
