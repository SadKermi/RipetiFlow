# RipetiFlow — Schermate

*v1.1 · 13 ottobre 2026 (v1.0: 6 ottobre) · Allineato al contratto API [`docs/05-api.md`](../05-api.md), a docs/06 (Matita) e docs/08 (Google). Riferimenti: [02-design-system.md](02-design-system.md) per token e componenti, [specimen.html](specimen.html) per l'aspetto reale.*

Regola d'oro (02, intestazione): **si disegna solo ciò che l'API sa fare.** Una lezione non ha uno stato da segnare: quando finisce entra da sola nel saldo (`settled: true`); prima è **programmata** e conta solo nel **saldo previsto** (`projected_balance_cents`). Una lezione che non c'è stata si **elimina** (lo storico modifiche ne tiene traccia).

Convenzioni dei wireframe: mobile a **390 px** (≈ 40 caratteri), desktop a **1440 px** (≈ 100 caratteri). `▒` = bozza a matita (tratteggio), `═` = doppia riga del totale, `│` tra data e voce = linea di margine rossa, `[ ]` = bottone, `[■ ]` = bottone inchiostro (primario), `‹ ›` = campo, `¦…¦` = evidenziatore. I simboli `✎ ⌘ ≈ → ▾ ▸ ↻ ☁` nei wireframe sono **notazione**: in interfaccia sono icone Phosphor (02 §3 «Glifi assenti», 02 §6).

## Dati d'esempio

Coerenti in tutto il documento e nello specimen. Oggi = **martedì 6 ottobre 2026, 14:20** (Europe/Rome).

| Studente | Classe · scuola | Materia abituale | Tariffa | Saldo | Contatto | Prossima lezione |
|---|---|---|---|---|---|---|
| Marco Rossi | 2ª liceo classico · Liceo Parini | Fisica | 20,00 €/h | deve 120,00 € | mamma Laura Rossi · 339 204 7781 | mer 7 ott 16:00–17:30 |
| Giulia Ferri | 3ª liceo scientifico · Liceo Galilei | Matematica | 22,00 €/h dal 1 ott 2026 (prima 20,00) | deve 67,00 € · previsto deve 89,00 € | mamma Anna Ferri · 347 512 0896 | gio 8 ott 15:00–16:00 |
| Elena Greco | 1ª ITE · Istituto Tosi | Inglese | 25,00 €/h | deve 25,00 € | Elena · 351 448 2290 | mer 7 ott 15:00–16:00 |
| Luca Bianchi | 4ª liceo classico · Liceo Parini | Latino | 20,00 €/h | credito 40,00 € (circa 2 h) | papà Paolo Bianchi | oggi 15:00–16:00 |
| Sara Conti | 5ª liceo scientifico · Liceo Galilei | Chimica | 25,00 €/h | in pari | — | nessuna (ultima lun 28 set) |

Registro di Giulia (dal più recente): gio 8 ott 15:00–16:00 Matematica, **programmata** (22,00) · lun 5 ott 17:00–19:00 Fisica, *moto rettilineo uniforme* (44,00 → deve 67,00) · ven 2 ott pagamento con bonifico 50,00 (→ deve 23,00) · gio 1 ott 16:00–17:30 Fisica, *vettori e componenti* (33,00 → deve 73,00) · gio 1 ott tariffa da 20,00 a 22,00 €/h · lun 28 set 15:00–17:00 Matematica, *disequazioni fratte* (40,00 → deve 40,00) · riporto al 31 agosto: in pari.
Mese di ottobre fino ad adesso: 6 lezioni svolte, 7 h 30 min, maturato 167,00 €, incassato 155,00 €. Tutor: Daniele Marchi (`d.marchi@esempio.it`).

## Mappa

```
Landing ──► Accesso (Google · link via email · demo) ──► /auth/callback ──► Oggi

Oggi ─┬─► Studenti ──► Scheda studente (registro) ─┬─► Lezione (sheet)
      │                                             ├─► Pagamento (sheet)
      ├─► Agenda (settimana) ──► Scheda studente    ├─► Cambio tariffa (sheet)
      ├─► Impostazioni («Altro» su mobile)          ├─► Studente (sheet)
      ├─► Matita (ovunque: riga + Cmd/Ctrl K)       ├─► Storico modifiche
      └─► Pagina non trovata                        ├─► Archivia / Elimina
                                                    └─► Esporta CSV
```

---

## 1. Landing (pubblica, `/`)

**Obiettivo**: far capire in 10 secondi cosa fa, a chi serve e cosa **non** fa; un solo invito: entrare.
**Gerarchia**: H1 → sottotitolo → CTA → registro reale annotato → Matita → cosa non fa → domande → footer.

### Copy (definitivo, italiano)

- **Occhiello**: Per chi dà ripetizioni
- **H1**: Segna la lezione appena finita. ¦Il conto lo tiene il registro.¦
- **Sottotitolo**: Un registro per ogni studente: lezioni, pagamenti (contanti, bonifico o altro) e un saldo che si aggiorna riga per riga. Sai sempre chi ti deve cosa e chi ha pagato in anticipo.
- **CTA**: [■ Entra nel registro] → `/accedi` · sotto, 14 px, secondo i metodi attivi in `/public/config`: «Entri con il tuo account Google o con un link via email, senza password.» (solo Google: «Entri con il tuo account Google.»; solo email: «Entri con un link via email, senza password.»)
- **Sezione 1 — «Una pagina per studente»** (figura: registro di Giulia Ferri con 3 note a margine numerate)
  1. **La lezione.** Giorno, orario, materia e argomento. L'importo lo calcola dalla tariffa di quel giorno. Una lezione futura resta «programmata» ed entra nel saldo quando finisce.
  2. **Il pagamento.** Contanti, bonifico o altro, anche in anticipo: il credito si legge anche in tempo («circa 2 h di lezione»).
  3. **Il saldo.** In rosso se ti deve, in blu se è in credito. Nessun segno meno da interpretare.
- **Sezione 2 — «Matita scrive a matita. Tu ripassi a penna.»** (solo se `assistant_available`)
  Scrivi come scriveresti su un foglietto: «ieri 15–16:30 matematica con Luca, equazioni di secondo grado». Matita prepara la riga e la lascia a matita: entra nel registro solo quando la confermi. Può anche risponderti («quanto mi deve Giulia?») e scrivere un promemoria che poi mandi tu, su WhatsApp o dove preferisci.
- **Sezione 3 — «Cosa non fa»**
  Non incassa pagamenti e non manda fatture: registri tu quello che hai ricevuto. Non legge il tuo Google Calendar: scrive le lezioni in un calendario a parte, «RipetiFlow», e se sposti un evento lì il registro non cambia. Non manda messaggi al posto tuo: prepara il testo, lo invii tu.
- **Domande**
  - *I miei dati chi li vede?* Solo tu: ogni riga è legata al tuo account. Puoi scaricare tutto in CSV da Impostazioni.
  - *Posso cambiare la tariffa di uno studente?* Sì, da una data in poi. Se la data è già passata scegli tu se ricalcolare le lezioni registrate da quel giorno; quelle con una tariffa scritta a mano non cambiano mai.
  - *E se sbaglio una riga?* La correggi o la elimini. Lo storico modifiche tiene traccia di tutto.
  - *Funziona dal telefono?* È pensato prima di tutto per il telefono: si registra una lezione in pochi tocchi.
  - *Quanto costa?* **[da definire con il cliente — non pubblicare finché non è deciso]**
- **Footer**: RipetiFlow · Privacy · Contatti · © 2026

### Mobile 390

```
┌────────────────────────────────────────┐
│ ▮R RipetiFlow                  [Entra] │
├────────────────────────────────────────┤
│ PER CHI DÀ RIPETIZIONI                 │
│ Segna la lezione                       │
│ appena finita.                         │  display-xl 40/44
│ ¦Il conto lo tiene¦                    │
│ ¦il registro.¦                         │
│ Un registro per ogni studente:         │
│ lezioni, pagamenti (contanti, bonifico │
│ o altro) e un saldo che si aggiorna…   │
│ [■ Entra nel registro                ] │  44 px, piena larghezza
│ Entri con il tuo account Google o con  │
│ un link via email, senza password.     │
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
│ ▒ ieri 15–16:30 matematica con     ▒   │  card a matita, si ripassa
│ ▒ Luca …            [■ Ripassa]    ▒   │  a penna 1 volta nel viewport
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Cosa non fa                            │
│ — Non incassa pagamenti…               │
│ — Non legge il tuo Google Calendar…    │
│ — Non manda messaggi al posto tuo…     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Domande  (righe espandibili, 56 px)    │
│ [■ Entra nel registro                ] │
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
│ ¦Il conto lo tiene il registro.¦                │ ✎ Scrivi una riga…                     ⌘K  + │ │
│                                                 │▒mar 6│ Matematica · equazioni  33,00  bozza ▒│ │
│ Un registro per ogni studente: lezioni,         │ gio 8│ Matematica · programmata 22,00        │ │
│ pagamenti (contanti, bonifico o altro) e un     │ lun 5│ Fisica · moto rettilineo 44,00 deve 67│ │
│ saldo che si aggiorna riga per riga.            │ ven 2│ Pagamento · bonifico     50,00 deve 23│ │
│                                                 │ gio 1│ ↻ Tariffa da 20,00 a 22,00 €/h        │ │
│ [■ Entra nel registro]                          │══════════════════════════════════════════════│ │
│ Entri con il tuo account Google o con un link…  └──────────────────────────────────────────────┘ │
│                                                    col. 7–12: il registro vero, HTML statico     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ § 1  Una pagina per studente           figura annotata: note ①②③ nel margine destro              │
│ § 2  Matita scrive a matita…             a sinistra testo, a destra card che si ripassa a penna  │
│ § 3  Cosa non fa                       tre righe, 2 colonne                                      │
│ § 4  Domande                           accordion a righe                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Interazioni**: «Entra» e CTA → `/accedi`. La card di Matita si ripassa a penna **una volta** quando è visibile al 60 % (niente se `reduced-motion`). Nessun carosello, nessun video automatico.
**Stati**: utente già autenticato → «Entra» diventa «Apri il registro» e porta a `/oggi`. `/public/config` non raggiungibile → la pagina resta statica, la riga sotto la CTA dice solo «Entri senza password.» e `/accedi` mostrerà l'errore.
**Prestazioni**: nessuna immagine sopra la piega; font precaricati (solo Schibsted latin); obiettivo LCP < 1,8 s su 4G.

---

## 2. Accesso (`/accedi`, `/auth/callback`)

Una sola schermata, nessuna password. **Ogni metodo compare solo se il suo flag in `GET /public/config` è `true`**: `google_login_enabled` (Google, primario), `magic_link_enabled` (link via email), `dev_auth_enabled` (modalità demo, solo in sviluppo).

```
Mobile 390 (tutti e tre i metodi attivi)   Desktop 1440 (colonna centrale 440 px)
┌────────────────────────────────────┐     ┌──────────────────────────────────────────────┐
│ ▮R RipetiFlow                      │     │                ▮R RipetiFlow                 │
│                                    │     │                                              │
│ Entra nel tuo registro             │     │          Entra nel tuo registro              │  display-m
│ Usiamo il tuo account Google solo  │     │  Usiamo il tuo account Google solo per       │
│ per l'accesso. Calendar si collega │     │  l'accesso. Calendar si collega dopo, se     │
│ dopo, se vuoi, da Impostazioni.    │     │  vuoi, da Impostazioni.                      │
│ [■ G  Continua con Google        ] │     │        [■ G  Continua con Google ]           │
│ ──────────── oppure ────────────── │     │  ──────────────── oppure ──────────────────  │
│ Email                              │     │  Email                                       │
│ ‹ nome@esempio.it                › │     │  ‹ nome@esempio.it                         › │
│ [ ✉ Mandami il link              ] │     │  [ ✉ Mandami il link ]                       │
│ Ti mandiamo un link per entrare:   │     │  Ti mandiamo un link per entrare: nessuna    │
│ nessuna password da ricordare.     │     │  password da ricordare.                      │
│ ────────────────────────────────── │     │                                              │
│ ◌ Entra in modalità demo           │     │  ◌ Entra in modalità demo                    │  solo dev_auth_enabled
│   Solo in sviluppo: dati di        │     │    Solo in sviluppo: dati di esempio.        │
│   esempio, nessun account vero.    │     │                                              │
│ Privacy · Termini                  │     │               Privacy · Termini              │
└────────────────────────────────────┘     └──────────────────────────────────────────────┘
```

- Il bottone Google usa il logo «G» ufficiale e le linee guida Google Sign-In; il resto dello stile è nostro (bottone inchiostro, 44 px). Solo email attivo: niente bottone Google, il campo Email sale sotto il titolo e il sottotitolo diventa «Ti mandiamo un link per entrare: nessuna password.»
- Il permesso Calendar **non** si chiede qui (D-31, consenso incrementale): si chiede in Impostazioni, oppure dopo la prima lezione salvata con un toast-invito «Vuoi le lezioni anche in Google Calendar? [Collega]» (solo se `calendar_sync_available`).

**Stati**

| Situazione | Cosa si vede |
|---|---|
| Configurazione in caricamento | titolo subito; al posto dei metodi due barre-scheletro alte 44 px |
| `/public/config` non risponde | banda `CloudSlash`: «Non riesco a contattare il server. [Riprova]» |
| Nessun metodo attivo | «L'accesso non è configurato su questo server.» (testo per chi installa: nessun bottone) |
| Google: in corso | bottone con 3 puntini statici, «Ti stiamo portando su Google…» |
| Google: annullato o errore (ritorno su `/auth/callback` con errore) | di nuovo `/accedi` con nota `Warning` sotto il bottone: «Accesso con Google non completato. Riprova.» |
| App non ancora verificata da Google (fase attuale) | nota grafite sotto il bottone: «Google potrebbe mostrarti un avviso “app non verificata”: è normale finché la verifica non è conclusa.» |
| Email non valida | errore sul campo: «Scrivi un indirizzo email valido.» |
| Link: invio in corso | bottone in caricamento «Invio…» |
| Link: inviato | il blocco email è sostituito da una nota con `EnvelopeSimple`: «Ti abbiamo mandato un link a d.marchi@esempio.it. Aprilo da questo telefono o computer per entrare.» + «Non arriva? Controlla lo spam o [mandalo di nuovo]» (attivo dopo 60 s, con il conto alla rovescia) + [Usa un'altra email] |
| Link: troppi invii | nota `Warning`: «Troppi tentativi: riprova tra qualche minuto.» |
| Link: invio non riuscito | nota `Warning`: «Invio non riuscito. Riprova tra poco.» |
| `/auth/callback` in corso | «Ti stiamo facendo entrare…» (3 puntini statici), nessun'altra UI |
| Link scaduto o già usato | pagina: titolo «Il link non è più valido» + «I link di accesso valgono una volta sola e per poco tempo.» [■ Mandane un altro] → `/accedi` con l'email già scritta |
| Altro errore di callback | «Accesso non completato.» [Torna all'accesso] |
| Demo: in corso / errore | bottone in caricamento; errore → nota `Warning` con il `detail` del server |
| Sessione scaduta (401 più tardi, in qualunque pagina) | ritorno a `/accedi` con nota: «La sessione è scaduta. Entra di nuovo: torni dove eri.» |

---

## 3. Oggi (`/oggi`)

**Domanda a cui risponde**: «Cosa ho adesso e chi mi deve soldi?» In quest'ordine.
**Dati**: `GET /dashboard?days=7` → `upcoming` (lezioni da adesso a oggi + 7, comprese quelle in corso), `owing`, `in_credit`, `totals`, `month`, `calendar`.
**Gerarchia**: data e titolo → riga di Matita → (avviso Calendar) → prossime lezioni → conti aperti con totali → il mese.

### Mobile 390

```
┌────────────────────────────────────────┐
│ ▮R RipetiFlow                    (DM)  │
│ martedì 6 ottobre                      │  body-s ink-3
│ Oggi                                   │  display-l
│ ☁ 2 lezioni non sono in Google         │  solo se calendar.connected
│   Calendar.           Impostazioni ›   │  e calendar.errors > 0
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Prossime lezioni               Agenda  │
│ 15:00  Luca Bianchi                  › │  60 px
│ 16:00  Latino · ¦tra 40 min¦           │
│ MER 7 OTT                              │
│ 15:00  Elena Greco                   › │
│ 16:00  Inglese                         │
│ ────────────────────────────────────── │
│ 16:00  Marco Rossi                   › │
│ 17:30  Fisica                          │
│ GIO 8 OTT                              │
│ 15:00  Giulia Ferri                  › │
│ 16:00  Matematica                      │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Conti aperti                  Studenti │
│ Marco Rossi           DEVE  120,00 €   │  owing: chi deve di più in alto
│ Giulia Ferri          DEVE   67,00 €   │
│ Elena Greco           DEVE   25,00 €   │
│ Luca Bianchi       CREDITO   40,00 €   │  in_credit
│                                ≈ 2 h   │  credit_minutes
│ Da incassare                212,00 €   │  totals.owed_to_you_cents
│ ══════════════════════════════════════ │
│ Anticipi ricevuti            40,00 €   │  totals.credit_held_cents
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ottobre 2026                           │  month.label
│ 6 lezioni svolte · 7 h 30 min          │
│ Maturato 167,00 € · Incassato 155,00 € │
├────────────────────────────────────────┤
│ ✎ Scrivi a Matita…               [■ +] │  barra fissa 56 px
├────────────────────────────────────────┤
│  ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro│  tab bar 64 px (icone Phosphor)
└────────────────────────────────────────┘
```

### Desktop 1440

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▮R RipetiFlow     Oggi   Studenti   Agenda                                  [✎ Matita ⌘K]  (DM)  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ martedì 6 ottobre                                                                                │
│ Oggi                                                                                             │
│ ✎ Scrivi una riga… «ieri 15–16:30 matematica con Luca»                                    ⌘K  +  │
│ ☁ 2 lezioni non sono in Google Calendar: la sincronizzazione non è riuscita.   Impostazioni ›    │
│──────────────────────────────────────────────────────────────────────────────────────────────────│
│ col 1–7                                              │ col 8–12                                  │
│ Prossime lezioni                            Agenda › │ Conti aperti                   Studenti › │
│ 15:00–16:00  Luca Bianchi   Latino      ¦tra 40 min¦ │ Marco Rossi            DEVE   120,00 €    │
│ MER 7 OTT                                            │ Giulia Ferri           DEVE    67,00 €    │
│ 15:00–16:00  Elena Greco    Inglese                  │ Elena Greco            DEVE    25,00 €    │
│ 16:00–17:30  Marco Rossi    Fisica                   │ Luca Bianchi        CREDITO    40,00 €    │
│ GIO 8 OTT                                            │                              ≈ 2 h        │
│ 15:00–16:00  Giulia Ferri   Matematica               │ Da incassare                  212,00 €    │
│ VEN 9 OTT                                            │ ═════════════════════════════════════     │
│ 17:00–18:00  Luca Bianchi   Latino                   │ Anticipi ricevuti              40,00 €    │
│                                                      │                                           │
│                                                      │ ottobre 2026                              │
│                                                      │ 6 lezioni svolte · 7 h 30 min             │
│                                                      │ Maturato 167,00 € · Incassato 155,00 €    │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Interazioni**
- Tap su una lezione → scheda dello studente con quella riga evidenziata (1,2 s). Su desktop menu «⋯» della lezione: Modifica · **Ripeti la settimana dopo** (`POST /lessons/{id}/duplicate` con la data + 7 giorni → toast «Lezione programmata per mar 13 ott alle 15:00 [Annulla]») · Elimina (conferma, §7.5).
- Una lezione finita **esce da sola** da «Prossime lezioni» ed entra nel saldo: non c'è niente da segnare. Una lezione non prevista si registra con Matita o con «+».
- Tap su una riga di «Conti aperti» → scheda studente; su desktop menu: Registra pagamento (sheet Pagamento con lo studente) · Promemoria (apre la scheda con la riga di Matita già scritta «scrivi un promemoria di pagamento», così Matita ha il contesto e WhatsApp il numero).
- Gli studenti archiviati con un saldo aperto restano in «Conti aperti» (l'API li include), con la caption «archiviato».
- **Il mese** (`month`): solo numeri, nessun grafico; sotto, caption 12 px `--rf-ink-3`: «Maturato: lezioni svolte nel mese. Incassato: pagamenti ricevuti nel mese.»
- **Avviso Calendar**: solo se `calendar.connected` e `calendar.errors > 0`: icona `CloudSlash`, «2 lezioni non sono in Google Calendar.» (singolare: «1 lezione non è…»), link «Impostazioni ›» alla sezione Calendar. Le lezioni in coda (`pending`) non si segnalano qui: è il funzionamento normale.

**Stati**
- *Primo accesso, nessuno studente*: al posto delle sezioni: «Benvenuto nel registro. Inizia dal primo studente: nome e tariffa bastano.» [■ Aggiungi studente]. Nessun esempio di Matita finché non c'è uno studente (Matita non crea studenti). Dopo il primo studente il placeholder usa il suo nome: «ieri 15–16:30 matematica con Giulia».
- *Nessuna lezione nei prossimi 7 giorni*: «Nessuna lezione in programma nei prossimi 7 giorni.» + link «Aggiungi una lezione».
- *Tutti in pari* (`owing` e `in_credit` vuoti): «Tutti in pari.» in `--rf-ink-2`.
- *Mese senza lezioni svolte*: «ottobre 2026 · nessuna lezione svolta finora.» (l'incassato si mostra se > 0).
- *Matita non disponibile*: niente riga; vedi 02 §9.13.
- *Caricamento / errore*: §10 (titolo e data subito: sono locali).

---

## 4. Studenti (`/studenti`)

**Dati**: `GET /students?q=&archived=false&sort=balance` (`StudentSummary[]`). Filtro Tutti | Ti devono | In credito sul `balance.status` (lato client). Ricerca: parametro `q` (nome e cognome), 250 ms dopo l'ultima lettera. Archiviati: `GET /students?archived=true`, in una sezione chiusa.
**Gerarchia**: titolo + conteggio → ricerca → filtro → elenco ordinato.

```
Mobile 390                                  Desktop 1440 (tabella, contenuto max 1200)
┌────────────────────────────────────────┐  ┌──────────────────────────────────────────────────────────────────────────────┐
│ Studenti                      [+ Nuovo]│  │ Studenti · 5 attivi                                     [■ + Nuovo studente] │
│ 5 attivi                               │  │ ‹⌕ Cerca per nome›   [Tutti|Ti devono|In credito]          Ordina: Saldo ▾   │
│ ‹⌕ Cerca per nome                    › │  │──────────────────────────────────────────────────────────────────────────────│
│ [Tutti | Ti devono | In credito]       │  │ NOME          CLASSE                PROSSIMA          TARIFFA  SALDO         │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  │ Marco Rossi   2ª liceo classico     mer 7 ott 16:00     20,00  DEVE 120,00 € │
│ Marco Rossi            DEVE 120,00 € › │  │ Giulia Ferri  3ª liceo scientifico  gio 8 ott 15:00     22,00  DEVE  67,00 € │
│ 2ª liceo classico · prossima mer 7 ott │  │ Elena Greco   1ª ITE                mer 7 ott 15:00     25,00  DEVE  25,00 € │
│ ────────────────────────────────────── │  │ Sara Conti    5ª liceo scientifico  ultima lun 28 set   25,00  IN PARI       │
│ Giulia Ferri            DEVE 67,00 € › │  │ Luca Bianchi  4ª liceo classico     oggi 15:00          20,00  CRED. 40,00 € │
│ 3ª liceo scientifico · prossima gio 8  │  │                                                                       ≈ 2 h  │
│ ────────────────────────────────────── │  │ ARCHIVIATI (2) ▸                                                             │
│ Elena Greco             DEVE 25,00 € › │  └──────────────────────────────────────────────────────────────────────────────┘
│ 1ª ITE · prossima mer 7 ott            │
│ …                                      │
│ Luca Bianchi        CREDITO 40,00 €  › │
│ 4ª liceo classico · oggi 15:00   ≈ 2 h │
│ Archiviati (2) ▸                       │
│ ✎ Scrivi a Matita…               [■ +] │
│ ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro │
└────────────────────────────────────────┘
```

- Riga (02 §9.8): `display_name`; sotto, classe (`grade`, o `school` se manca) · «prossima …» (`next_lesson`) oppure «ultima …» (`last_lesson_date`). Le materie non compaiono (lo studente ha una sola materia abituale e la lista non la riceve). La colonna TARIFFA è `balance.current_hourly_rate_cents`.
- Ordine predefinito `sort=balance`: chi deve di più in alto, poi chi è in pari, poi chi è in credito. Su desktop sono ordinabili solo Nome (`sort=name`), Prossima (`sort=next_lesson`) e Saldo.
- «Archivia» (dalla scheda, §5) nasconde lo studente dalle liste ma conserva il registro.
- **Stati**: vuoto → «Nessuno studente. Inizia dal primo: nome e tariffa bastano.» [■ Aggiungi studente]; ricerca senza risultati → «Nessuno studente con “Giovanni” nel nome. [Aggiungi Giovanni come studente]» (apre il modulo con il nome scritto); filtro vuoto → «Nessuno ti deve soldi.» / «Nessuno è in credito.»; nessun archiviato → la sezione non c'è; caricamento ed errore → §10.

---

## 5. Scheda studente — il libro mastro (`/studenti/:id`, cuore dell'app)

**Dati**: `GET /students/{id}` (anagrafica, `balance`, `rates`) + `GET /students/{id}/ledger` (`items` in ordine decrescente + `balance`). «Ultimo pagamento… Da allora…» si calcola dal registro (ultima riga `payment`, lezioni nel saldo dopo di essa). «Previsto…» = `projected_balance_cents`, solo se `scheduled_cents > 0`.
**Gerarchia**: nome → saldo (numero grande + parola) → previsto → azioni Pagamento/Promemoria → riga di Matita → registro (prima bozze e programmate, poi le righe nel saldo) → tariffa e contatti.

### Desktop 1440 (vedi `specimen.html` §1)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▮R RipetiFlow     Oggi   Studenti   Agenda                                  [✎ Matita ⌘K]  (DM)  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ‹ Studenti                                                                                       │
│ STUDENTESSA                  │ DATA  │ VOCE                        DURATA  LEZIONE  PAGATO  SALDO│
│ Giulia Ferri                 │───────┼───────────────────────────────────────────────────────────│
│ 3ª liceo scientifico ·       │ ✎ Scrivi una riga… «oggi 16:30–18 matematica, equazioni»  ⌘K     +│
│ Liceo Galilei                │▒mar 6 │ Matematica · equazioni di…  1 h 30   33,00               ▒│
│ Materia abituale: Matematica │▒16:30 │ Bozza · programmata: non entra subito nel saldo          ▒│
│ Mamma: Anna Ferri · 347…     │▒      │ ⚠ Data nel futuro: la lezione sarà programmata.          ▒│
│                              │▒      │ ✎ Matita ha letto: «oggi 16:30–18 mate, equazioni…»      ▒│
│                              │▒      │ [■ Ripassa a penna]  Modifica  Scarta                    ▒│
│ SALDO AL 6 OTTOBRE           │ gio 8 │ Matematica                    1 h      22,00              │
│ 67,00 €  TI DEVE             │ 15:00 │ Programmata · non ancora nel saldo                        │
│ Ultimo pagamento 50,00 € il  │ lun 5 │ Fisica · moto rettilineo…    2 h      44,00   DEVE 67,00 €│
│ 2 ott, con bonifico. Da      │ ven 2 │ ⌂ Pagamento · bonifico                  50,00 DEVE 23,00 €│
│ allora 1 lezione, 2 h (più   │ gio 1 │ Fisica · vettori e componenti 1 h 30 33,00    DEVE 73,00 €│
│ 23,00 € rimasti).            │ gio 1 │ ↻ Tariffa da 20,00 a 22,00 €/h per le lezioni da questa…  │
│ Previsto con le lezioni      │ lun 28│ Matematica · disequazioni…   2 h      40,00   DEVE 40,00 €│
│ programmate: deve 89,00 €    │ 31 ago│ Riporto al 31 agosto                        IN PARI 0,00 €│
│ ════════════════════════════ │═══════╧═══════════════════════════════════════════════════════════│
│ [■ Pagamento] [ Promemoria ] │ [Mostra agosto ▾]                            [Esporta CSV]        │
│                              │                                                                   │
│ TARIFFA ORARIA               │                                                                   │
│ dal 1 ott 2026    22,00 €/h ⋯│                                                                   │
│ dal 15 set 2025   20,00 €/h ⋯│                                                                   │
│ Cambia tariffa…              │                                                                   │
│ [ Modifica dati ] [ ⋯ ]      │  ⋯ = Storico modifiche · Archivia · Elimina studente              │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
  aside 336 px sticky (top 88)        registro max 880 px, linea di margine rossa a x=104
```

### Mobile 390

```
┌────────────────────────────────────────┐
│ ‹ Studenti                      [ ⋯ ]  │
│ STUDENTESSA                            │
│ Giulia Ferri                           │  display-m
│ 3ª liceo scientifico · Liceo Galilei   │
│ SALDO AL 6 OTTOBRE                     │
│ 67,00 €  TI DEVE                       │  display-l 34, debito
│ Ultimo pagamento 50,00 € il 2 ott…     │
│ Previsto: deve 89,00 €                 │  projected_balance_cents
│ ══════════════════════════════════════ │
│ [■ Pagamento    ] [  Promemoria     ]  │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ✎ Scrivi una riga…                 [+] │  «+» 44×44
│ mar 6 │▒ Matematica · equaz…   33,00 ▒ │
│ ott   │▒ 16:30–18:00 · Bozza         ▒ │
│       │▒ ⚠ Data nel futuro: la       ▒ │
│       │▒   lezione sarà programmata. ▒ │
│       │▒ [■ Ripassa a penna        ] ▒ │  44 px su mobile
│       │▒ [ Modifica ]  [ Scarta    ] ▒ │
│ gio 8 │ Matematica             22,00   │  importo ink-3
│ ott   │ 15:00–16:00 · Programmata      │  nessun saldo
│ lun 5 │ Fisica · moto rettilineo 44,00 │  56+ px
│ ott   │ 17:00–19:00                    │
│       │ DEVE 67,00 €                   │
│ ven 2 │ ⌂ Pagamento · bonifico   50,00 │
│ ott   │ DEVE 23,00 €                   │
│ gio 1 │ ↻ Tariffa da 20,00 a 22,00 €/h │
│ ott   │                                │
│ …     │                                │
│ ══════════════════════════════════════ │
│ Tariffa · Contatti · Note      ▸       │  sezione richiudibile in fondo
│ ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro │  (barra di Matita nascosta: qui la
└────────────────────────────────────────┘   riga è dentro il registro)
```
Colonna data su mobile **a due righe** dentro 72 px: «lun 5» sopra, «ott» sotto (o «set 2025» se l'anno è diverso), così «mer 30» non tocca la linea di margine (02 §9.6).

**Interazioni**
- **Riga di Matita** con il contesto dello studente: «oggi 16:30–18 mate, equazioni» basta. Le bozze compaiono in cima al registro (02 §9.6). Una bozza di lezione futura, ripassata a penna, diventa una riga **Programmata**: il saldo resta 67,00 €, il previsto passa da 89,00 € a 122,00 € (evidenziatore 1,2 s).
- **+** → sheet Lezione precompilato: studente fisso, materia = materia abituale (`default_subject_id`) o l'ultima usata, giorno oggi, inizio = adesso arrotondato al quarto d'ora precedente, durata = `profile.default_lesson_minutes`.
- **Pagamento** → sheet Pagamento con importo suggerito = debito attuale (67,00) e chip rapidi «67,00 (il saldo) · 89,00 (con le programmate)».
- **Promemoria** → la riga di Matita si riempie con «scrivi un promemoria di pagamento per la mamma» e parte: card messaggio con *Copia* e *WhatsApp · 347 512 0896* (`guardian_phone`, normalizzato: 02 §7).
- Tap su una riga → sheet di modifica (`GET /lessons/{id}` con le note private, o `GET /payments/{id}`). Menu della riga: lezione → Duplica la settimana dopo · Duplica per un altro studente · Elimina; pagamento → Elimina. Conferme in §7.5.
- Tastiera desktop: `N` nuova lezione, `P` pagamento, Cmd/Ctrl K Matita, `↑/↓` tra le righe, `Invio` apre la riga.
- Il registro arriva tutto (default dell'API). A schermo: il mese corrente e il precedente; «Mostra agosto ▾» scopre il mese prima, senza nuove richieste. La riga **Riporto** prende il saldo progressivo della riga subito precedente a quelle mostrate.
- «Esporta CSV» → `GET /students/{id}/ledger.csv`: colonne `Data;Tipo;Descrizione;Inizio;Fine;Durata (min);Tariffa oraria (€);Dare (€);Avere (€);Saldo (€);Stato` (separatore `;`, decimali con virgola, «Stato» = Svolta / Programmata / Ricevuto). Il nome del file lo dà il server.
- Menu «⋯» dello studente: **Storico modifiche** (§5.1) · **Archivia** (o **Ripristina** se archiviato) · **Elimina studente**. Elimina con lezioni o pagamenti → 409: il dialog mostra il testo del server («Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.») e offre [Archivia].
- Tariffe nell'aside: «⋯» su ogni riga → Elimina tariffa (§7.3); assente se è l'unica tariffa.

**Stati**
- *Registro vuoto*: sotto la riga di Matita, 6 righe tratteggiate vuote (`--rf-rule`, nessun testo) e «Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo.»
- *Saldo in credito*: «40,00 € CREDITO» in blu + «Circa 2 h di lezione a 20,00 €/h.» (`credit_minutes`, `current_hourly_rate_cents`; senza tariffa corrente solo l'importo).
- *Saldo zero*: «0,00 € IN PARI» in `--rf-ink-2`.
- *Nessuna programmata*: la riga «Previsto» non c'è.
- *Studente archiviato*: sotto il nome, banda `--rf-ink-2`: «Archiviato: non compare nelle liste. [Ripristina]». Tutto il resto funziona.
- *Lezione non in Calendar* (`calendar.status: error`): icona `CloudSlash` 16 accanto all'orario, nota con `calendar.error` (es. «Google Calendar non risponde. Nuovo tentativo automatico più tardi.») e link «Risincronizza in Impostazioni ›». Non esiste un «riprova» per singola lezione.
- *Caricamento, errore, studente inesistente*: §10.

### 5.1 Storico modifiche

**Dati**: `GET /students/{id}/activity?limit=50&before=` → `{items: Activity[], next_cursor}`. Sola lettura, dal più recente. Sheet a tutta altezza su mobile, dialog 560 px su desktop.

```
┌────────────────────────────────────────┐
│ Storico modifiche                      │  display-m
│ Giulia Ferri                           │
│ OGGI                                   │  caption, giorni nel fuso del profilo
│ 14:31  Lezione del 06/10 registrata    │  summary del server
│        (16:30–18:00, 33,00 €)          │
│        ✎ da Matita                     │  source = assistant
│ IERI                                   │
│ 19:12  Lezione del 05/10 modificata:   │
│        fine 18:30 → 19:00              │  → = icona ArrowRight
│        ▸ Dettagli                      │  changes[]: campo · prima → dopo
│ VEN 2 OTT                              │
│ 18:40  Pagamento di 50,00 € del 02/10  │
│        registrato (Bonifico)           │
│ [ Mostra altre ]                       │  finché c'è next_cursor
└────────────────────────────────────────┘
```

- Riga: ora (Plex 13) + `summary` (Schibsted 15, `--rf-ink`); `source`: `assistant` → «da Matita» con `PencilSimpleLine` 16 grafite, `import` → «importata», `system` → «automatica», `app` → niente.
- «Dettagli» apre `changes[]`: etichetta del campo · `before` → `after` (testi già formattati dal server; `null` → «—»). Le frecce nei testi del server si disegnano con l'icona `ArrowRight` (fonts.md).
- Le righe eliminate restano qui («Lezione del 03/10 eliminata (10:00–11:00, 22,00 €)»): è così che si ritrova una lezione cancellata per errore.
- **Stati**: vuoto → «Nessuna modifica registrata.»; caricamento → 3 righe-scheletro; errore → banda §10 dentro lo sheet; «Mostra altre» in caricamento → bottone con 3 puntini.

---

## 6. Agenda (`/agenda`)

**Dati**: `GET /lessons?from=<lunedì>&to=<domenica>` (una settimana; l'API accetta fino a 62 giorni). Il riepilogo della settimana si calcola da queste lezioni (numero, durata, importi: le programmate comprese). Solo pianificazione (D-20): nessun pagamento qui.
**Gerarchia**: settimana corrente (lun→dom) → lezioni per giorno → linea «adesso».

### Desktop 1440 — vista colonne 07:00–21:00

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Agenda        ‹  5–11 ottobre 2026  ›   [Oggi]                  7 lezioni · 8 h 30 min · 186,00 €│
├──────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬───────────┬─────────┤
│      │ LUN 5       │ ¦MAR 6¦     │ MER 7       │ GIO 8       │ VEN 9       │ SAB 10    │ DOM 11  │
│ 14:00│             │─14:20 ━━━━━━│             │             │             │           │         │  linea adesso: ink 2 px
│ 15:00│             │┃Luca B.     │┃Elena G.    │┃Giulia F.   │             │           │         │  blocco: filetto sx 3 px,
│      │             │┃Latino      │┃Inglese     │┃Matematica  │             │           │         │  fondo raised
│ 16:00│             │             │┃Marco R.    │             │             │           │         │
│ 17:00│┃Giulia F.   │             │┃Fisica      │             │┃Luca B.     │           │         │
│ 18:00│┃Fisica      │             │             │             │┃Latino      │           │         │
└──────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴───────────┴─────────┘
  lunedì: lezioni già finite (nel saldo) in --rf-ink-2 con filetto --rf-ink-3; da adesso in poi --rf-ink.
  Sabato 10:00–11:00 Elena G. è fuori dalla porzione di griglia disegnata qui.
```

### Mobile 390 — lista per giorno (nessuna griglia oraria)

```
┌────────────────────────────────────────┐
│ Agenda                        [Oggi]   │
│ ‹  5–11 ottobre  ›                     │
│ [L5][¦M6¦][M7][G8][V9][S10][D11]       │  striscia giorni 44 px, punto se ci sono lezioni
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ MARTEDÌ 6 OTT · OGGI                   │
│ ─ ─ ─ ─ ─ ─ adesso 14:20 ─ ─ ─ ─ ─ ─ ─ │
│ 15:00  Luca Bianchi                  › │
│ 16:00  Latino · ¦tra 40 min¦           │
│ MERCOLEDÌ 7 OTT                        │
│ 15:00  Elena Greco                   › │
│ 16:00  Inglese                         │
│ 16:00  Marco Rossi                   › │
│ 17:30  Fisica                          │
│ …                                      │
│ 7 lezioni · 8 h 30 min · 186,00 €      │  riepilogo in fondo
│ ✎ Scrivi a Matita…               [■ +] │
│ ⌂ Oggi  🎓 Studenti  ▦ Agenda  ⚙ Altro │
└────────────────────────────────────────┘
```

- Lezioni finite (nel saldo) in `--rf-ink-2`, programmate in `--rf-ink`, in corso con «in corso» su evidenziatore. Nessun altro segno: non c'è niente da «segnare».
- Lezione con `calendar.status: error` → icona `CloudSlash` 16 nell'angolo del blocco (e la nota nella scheda).
- Tap su un blocco → scheda studente con la riga evidenziata. Tap su uno spazio vuoto (desktop) → sheet Lezione con giorno e ora; trascinamento **non** in v1 (evita spostamenti accidentali).
- Nota in fondo (solo se Calendar è collegato): «Le lezioni sono anche nel calendario «RipetiFlow» di Google. Se le sposti lì, qui non cambiano.»
- **Stati**: settimana vuota → «Nessuna lezione questa settimana.» [+ Lezione]; caricamento ed errore → §10. Calendar scollegato non cambia nulla: l'agenda è nostra.

---

## 7. Moduli (sheet su mobile, dialog 560 px su desktop)

Regole comuni: titolo Literata `display-m`; campi a piena larghezza; barra azioni fissa in basso: **[Annulla]** a sinistra, **[■ Salva …]** a destra; Invio salva su desktop; durante l'invio il primario è in caricamento e non si può premere due volte; dopo il salvataggio lo sheet si chiude e compare il toast con **Annulla**. Errori del server: §10.4.

### 7.1 Lezione (`POST /lessons`, `PATCH /lessons/{id}`)

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
│ ‹ 16:30 › → ‹ 18:00 ›                  │  Plex Mono, numeric; → = icona
│   +1 h · +1 h 30 · +2 h                │
│   1 h 30 min · 33,00 € a 22,00 €/h     │  calcolo live
│   Programmata: entra nel saldo alle    │  solo se la fine è dopo adesso
│   18:00 di oggi.                       │
│ Materia                                │
│ ‹ Matematica                       ▾ › │  materia abituale preselezionata
│ Argomento (facoltativo)                │
│ ‹ equazioni di secondo grado         › │  Literata italic, max 200, contatore
│ Note (solo per te)                     │
│ ‹ esercizi 4–9 pag. 112…             › │  textarea 3 righe, max 4000
│ ▸ Tariffa per questa lezione: 22,00 €/h│  richiudibile
│ Andrà in Google Calendar, calendario   │  solo se collegato; sola lettura
│ «RipetiFlow»: «Matematica · Giulia     │
│ Ferri». Le note restano qui.           │
├────────────────────────────────────────┤
│ [ Annulla ]          [■ Salva lezione ]│
└────────────────────────────────────────┘
```

- Due campi testo distinti (D-13): **Argomento** (facoltativo, ≤ 200 caratteri; compare nel registro e nella descrizione dell'evento) e **Note** (private, ≤ 4000; non vanno in Calendar né nel registro).
- **Tariffa per questa lezione** (D-16), chiusa di default: aperta mostra il campo importo «22,00 €/h» precompilato con la tariffa dello storico per quel giorno e l'aiuto «È la tariffa di Giulia per il 6 ott. Cambiala solo per questa lezione (sconto, lezione doppia): resterà scritta a mano e un cambio di tariffa non la toccherà.» `hourly_rate_cents` si invia **solo** se il tutor l'ha cambiata.
- **Modifica** («Modifica lezione»): stessi campi + nella barra [Elimina] (pericolo, a sinistra di Annulla) e menu Duplica. Cambiando il **giorno** la tariffa **non** cambia (contratto API): se la tariffa dello storico nel nuovo giorno è diversa, aiuto sotto il giorno: «La tariffa resta 20,00 €/h. Dal 1 ott Giulia ha 22,00 €/h. [Usa 22,00 €/h]». Cambiando lo **studente**: «Passa alla tariffa di Marco (20,00 €/h), salvo che fosse scritta a mano.»
- In modifica, stato Calendar in sola lettura: `synced` → `CloudCheck` «In Google Calendar»; `pending` → «In coda per Google Calendar»; `error` → `CloudSlash` + `calendar.error` + link «Risincronizza in Impostazioni ›»; `off` → niente. **Nessuna casella «aggiungi a Calendar»**: con Calendar collegato ogni lezione ci va.
- Validazione: studente obbligatorio; fine dopo l'inizio («L'orario di fine deve essere successivo a quello di inizio.», lo stesso testo del server); oltre 8 h avviso non bloccante («Sono 9 h di lezione: è giusto?»); oltre 12 h errore («Una lezione non può durare più di 12 ore.»); data entro due anni da oggi («La data è troppo lontana: al massimo due anni da oggi.»). Una data o un orario futuri sono validi: la lezione è **programmata**.
- Evento Calendar: titolo «Materia · Nome Studente» («Matematica · Giulia Ferri»; senza materia «Lezione · Giulia Ferri»), descrizione = argomento + link alla scheda; nessun dato economico, nessuna nota.
- Toast: «Lezione registrata · nel saldo [Annulla]» (già finita) / «Lezione programmata per mar 6 ott alle 16:30 [Annulla]».

### 7.2 Pagamento (`POST /payments`, `PATCH /payments/{id}`)

```
┌────────────────────────────────────────┐
│ Pagamento ricevuto                     │
│ Da                                     │
│ ‹🎓 Giulia Ferri                    ▾› │
│   Ti deve 67,00 €                      │  badge debito
│ Importo                                │
│ ‹ 67,00                            € › │  Plex Mono 18/500, decimal
│   67,00 · 89,00                        │  chip: saldo · con le programmate
│ Come                                   │
│ [ Contanti | Bonifico | Altro ]        │  segmented, 44 px
│ Giorno                                 │
│ ‹▦ mar 6 ott 2026              oggi  › │
│ Nota                                   │
│ ‹ es. pagamento di settembre         › │  con «Altro»: «es. Satispay, PayPal»
│   Dopo: in pari                        │  anteprima del saldo
├────────────────────────────────────────┤
│ [ Annulla ]    [■ Registra pagamento ] │
└────────────────────────────────────────┘
```

- **Come**: Contanti (`cash`) · Bonifico (`bank_transfer`) · Altro (`other`). Con «Altro» la Nota diventa consigliata: segnaposto «es. Satispay, PayPal» e aiuto «Scrivi come ti ha pagato: comparirà nel registro e nel CSV.» (non bloccante). Nel registro: icona `Wallet`, «Pagamento · altro», la nota accanto.
- «Dopo: …» è la riga più importante: `balance_cents + importo` (interi, lato client) in parole: «in pari» / «deve 17,00 €» / «credito 33,00 €».
- Importo molto alto (> 3 volte il debito, o > 10 ore di lezione se è in pari): avviso non bloccante «Sono 300,00 €: dopo, Giulia avrà 233,00 € di credito (circa 10 h 35 min a 22,00 €/h).» L'anteprima del tempo usa la regola del server (credito × 60 ÷ tariffa corrente, per difetto al minuto: docs/04); dopo il salvataggio si mostra `credit_minutes`.
- Limiti del server: da 0,01 € a 100.000,00 €; Nota ≤ 500 caratteri.
- Modifica: «Modifica pagamento» + [Elimina]. Toast: «Pagamento di 67,00 € registrato [Annulla]».

### 7.3 Cambio tariffa (`POST /students/{id}/rates/preview`, `POST /students/{id}/rates`)

```
┌────────────────────────────────────────┐
│ Nuova tariffa per Giulia               │
│ Tariffa attuale 22,00 €/h dal 1 ott    │
│ Nuova tariffa                          │
│ ‹ 24,00                         €/h  › │
│ Valida dal                             │
│ ‹▦ lun 5 ott 2026                    › │
│ ┌────────────────────────────────────┐ │
│ │ Dal 5 ott ci sono 2 lezioni che    │ │  nota inchiostro su sunk,
│ │ seguono la tariffa dello storico:  │ │  dall'anteprima (aggregata)
│ │ 66,00 €.                           │ │
│ └────────────────────────────────────┘ │
│ Cosa fare con queste 2 lezioni?        │  radiogroup, nessuna preselezione
│ ( ) Solo per le nuove lezioni          │  reprice_existing = false
│     Le 2 lezioni restano a 22,00 €/h.  │
│ ( ) Ricalcola le 2 lezioni (+6,00 €)   │  reprice_existing = true
│     Da 66,00 € a 72,00 €.              │
│ Le lezioni con una tariffa scritta a   │
│ mano non cambiano mai.                 │
├────────────────────────────────────────┤
│ [ Annulla ]        [■ Salva tariffa ]  │  attivo solo dopo la scelta
└────────────────────────────────────────┘
```

- L'anteprima (`{affected_lessons, current_total_cents, new_total_cents, delta_cents}`) si richiede 300 ms dopo l'ultima modifica di importo o data; nel frattempo la nota dice «Controllo le lezioni…» (puntini statici). L'API non elenca le singole lezioni: il modulo mostra **solo** numero e totali.
- **La scelta è esplicita** (D-16): con `affected_lessons > 0` nessuna opzione è preselezionata e «Salva tariffa» resta disattivato con il motivo accanto («Scegli cosa fare con le lezioni già registrate»). Vale anche per una data futura, se ci sono già lezioni programmate dopo quella data.
- `affected_lessons = 0` → niente scelta; nota: «Nessuna lezione registrata dal 5 ott: la nuova tariffa vale per le prossime.» (si invia `reprice_existing: false`).
- Stessa data di una tariffa esistente → 409 sul campo «Valida dal»: «Esiste già una tariffa con questa data di decorrenza.»
- Dopo il salvataggio: toast «Tariffa di 24,00 €/h dal 5 ott salvata · 2 lezioni ricalcolate» (`repriced_lessons`; «· nessuna lezione ricalcolata» se 0).
- **Elimina tariffa** (dall'aside, solo se ce n'è più d'una): dialog «Eliminare la tariffa di 22,00 €/h dal 1 ott 2026?» con scelta esplicita: «Lascia le lezioni come sono» (`reprice_existing=false`) / «Riporta alla tariffa precedente (20,00 €/h) le lezioni dal 1 ott che seguono lo storico» (`true`). Se è l'unica tariffa l'azione non c'è (il server risponderebbe «Non puoi eliminare l'unica tariffa dello studente.»).

### 7.4 Studente (`POST /students`, `PATCH /students/{id}`)

Campi 1:1 con l'API (limiti del server tra parentesi):

```
┌────────────────────────────────────────┐   Desktop: due colonne dove indicato
│ Nuovo studente                         │
│ Nome *                                 │  first_name (80)
│ ‹ Giulia                             › │
│ Cognome                                │  last_name (80)
│ ‹ Ferri                              › │
│ Classe                Scuola           │  grade (60) · school (120)
│ ‹ 3ª liceo scient.›   ‹ Liceo Galilei› │
│ Materia abituale                       │  default_subject_id, una sola
│ ‹ Matematica                       ▾ › │
│ Tariffa oraria *      Valida dal       │  hourly_rate_cents · rate_effective_from
│ ‹ 22,00      €/h ›    ‹ oggi         › │  solo alla creazione
│ STUDENTE                               │
│ Telefono              Email            │  phone (40) · email (254)
│ ‹                ›    ‹              › │
│ GENITORE O REFERENTE                   │
│ Nome                                   │  guardian_name (120)
│ ‹ Anna Ferri                         › │
│ Telefono              Email            │  guardian_phone (40) · guardian_email (254)
│ ‹ 347 512 0896   ›    ‹              › │
│ Note (solo per te)                     │  notes (4000)
│ ‹                                    › │
├────────────────────────────────────────┤
│ [ Annulla ]         [■ Salva studente ]│
└────────────────────────────────────────┘
```

- La tariffa è precompilata con `profile.default_hourly_rate_cents` se c'è. «Valida dal» di default è oggi; una data passata serve per chi segue già da prima.
- Aiuto sotto i telefoni: «Per WhatsApp: se non è un numero italiano scrivi il prefisso (es. +41 …).» Il promemoria usa il telefono del genitore se c'è, altrimenti quello dello studente (02 §7).
- In **modifica** («Modifica dati»): stessi campi senza tariffa (si cambia con «Cambia tariffa…»). Archivia ed Elimina stanno nel menu «⋯» della scheda.
- Non esistono «saldo iniziale», più materie per studente o campi oltre questi. Un credito già versato prima di usare l'app si registra come **pagamento** con nota («anticipo prima di RipetiFlow»); un debito pregresso come lezione nella sua data.
- Toast: «Giulia Ferri aggiunta» → apre la scheda.

### 7.5 Conferme (02 §9.12)

| Azione | Titolo | Effetto scritto nel dialog | Bottone |
|---|---|---|---|
| Elimina lezione nel saldo | «Eliminare la lezione di lun 5 ott?» | «Il saldo passa da deve 67,00 € a deve 23,00 €. Resta traccia nello storico modifiche.» (+ «L'evento sparisce da Google Calendar.» se collegato) | Elimina lezione |
| Elimina lezione programmata | «Eliminare la lezione di gio 8 ott?» | «Il saldo non cambia; il previsto passa da deve 89,00 € a deve 67,00 €.» | Elimina lezione |
| Elimina pagamento | «Eliminare il pagamento di 50,00 € del 2 ott?» | «Il saldo passa da deve 67,00 € a deve 117,00 €.» | Elimina pagamento |
| Archivia con saldo aperto | «Archiviare Marco Rossi?» | «Marco ti deve ancora 120,00 €. Resterà in «Conti aperti» finché il saldo non torna in pari.» | Archivia |
| Elimina studente | «Eliminare Sara Conti?» | «Si può solo se non ha lezioni né pagamenti; altrimenti archiviala.» → 409: testo del server + [Archivia] | Elimina studente |
| Elimina materia | «Eliminare «Chimica»?» | «Le lezioni con questa materia restano, senza materia. Per toglierla solo dal menu, archiviala.» | Elimina materia |
| Scollega Calendar | §8 | §8 | Scollega |

Annullare un'eliminazione: il toast «Lezione eliminata [Annulla]» ricrea la riga con gli stessi dati (`POST`, nuova riga; lo storico registra entrambe le operazioni).

---

## 8. Impostazioni (`/impostazioni`, «Altro» su mobile)

```
Mobile 390                                   Desktop 1440: colonna 640 px, stesse sezioni
┌────────────────────────────────────────┐
│ Impostazioni                           │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ PROFILO                                │
│ (DM) d.marchi@esempio.it               │  email: sola lettura
│ Nome e cognome                         │  full_name (120): firma dei promemoria
│ ‹ Daniele Marchi                     › │
│ Fuso orario                            │  timezone IANA
│ ‹ Europe/Rome · Italia             ▾ › │
│ Durata predefinita    Tariffa predef.  │  default_lesson_minutes (15–480)
│ ‹ 1 h 30        ▾›    ‹ 20,00   €/h ›  │  default_hourly_rate_cents
│ [■ Salva profilo]                      │  compare solo con modifiche
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ MATERIE                                │  ordine = menu dei moduli
│ ⋮⋮ Matematica                    [ ⋯ ] │  ⋯ = Rinomina · Sposta su/giù
│ ⋮⋮ Fisica                        [ ⋯ ] │      · Archivia · Elimina
│ ⋮⋮ Latino                        [ ⋯ ] │
│ ‹ Nuova materia          › [+ Aggiungi]│
│ Archiviate (1) ▸                       │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ GOOGLE CALENDAR                        │
│ ☁✓ Collegato · calendario «RipetiFlow» │
│    d.marchi@esempio.it                 │  google_email
│    Ultima sincronizzazione oggi 14:02  │  last_synced_at
│    In coda 0 · Non riuscite 2          │  pending · errors
│ [ ↻ Risincronizza prossime ]           │  scope: upcoming
│ [ ↻ Risincronizza tutte    ]           │  scope: all (con conferma)
│ [ Scollega ]                           │  pericolo
│ Le lezioni vanno solo da RipetiFlow a  │
│ Google. Se modifichi un evento lì, qui │
│ non cambia nulla; «Risincronizza» lo   │
│ rimette com'è nel registro.            │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ASPETTO                                │
│ [ Sistema | Chiaro | Scuro ]           │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ESPORTA                                │
│ [ Scarica tutto il registro (CSV) ]    │  GET /export/ledger.csv
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ [ Esci ]                               │
└────────────────────────────────────────┘
```

**Profilo** (`GET/PATCH /me`): email in sola lettura; Nome e cognome (usato come firma nei promemoria di Matita); Fuso orario (select con ricerca dei nomi IANA, default Europe/Rome: decide quando una lezione «finisce» e quindi entra nel saldo); Durata predefinita (da 15 min a 8 h, passi di 15 min: è la durata proposta dal modulo Lezione); Tariffa predefinita (proposta per i nuovi studenti, facoltativa). «Salva profilo» compare solo se qualcosa è cambiato; dopo: «Salvato» in `--rf-ink-3` per 2 s accanto al bottone.

**Materie** (`GET /subjects?include_archived=true`, `POST`, `PATCH`, `DELETE /subjects/{id}`):
- Elenco nell'ordine `position` (è l'ordine del menu Materia). Riordino: maniglia ⋮⋮ (trascinamento) **e** «Sposta su / Sposta giù» nel menu, o Alt + ↑/↓ con il focus sulla riga.
- Rinomina in linea (Invio salva, Esc annulla); 409 → errore sul campo: «Esiste già una materia con questo nome.» (anche se differisce solo per maiuscole).
- Archivia → sparisce dai menu dei moduli, le lezioni la mantengono; tra le «Archiviate» c'è [Ripristina].
- Elimina → conferma §7.5; le lezioni collegate restano senza materia.
- Aggiungi: campo + bottone (max 60 caratteri). Materie iniziali: quelle create alla registrazione (D-14).

**Google Calendar** (`GET /integrations/google-calendar` → `CalendarStatus`; docs/08 §4–5):

| Stato | Quando | Cosa si vede |
|---|---|---|
| **Non disponibile** | `available: false` (o `calendar_sync_available: false`) | «La sincronizzazione con Google Calendar non è attiva su questo server.» Nessun bottone. |
| **Non collegato** | `connected: false`, `status: null` | «Non collegato. Le lezioni restano solo qui.» + «RipetiFlow crea nel tuo Google un calendario a parte, «RipetiFlow», e scrive solo lì: non vede gli altri calendari. Le note private non vengono inviate.» [■ Collega Google Calendar] + nota grafite sull'avviso «app non verificata». |
| **Collegamento** | ritorno dal consenso Google, `POST …/connect` in corso | «Sto collegando il calendario…» (puntini statici); poi stato Collegato e toast «Calendario collegato · 12 lezioni in coda». |
| **Permesso negato** | 422 su `provider_refresh_token` | nota `Warning` con il testo del server («Per sincronizzare devi concedere l'accesso a Google Calendar: riprova e lascia selezionata l'autorizzazione al calendario.») + [Riprova] |
| **Collegato** | `connected: true`, `status: active` | come nel wireframe: account, ultima sincronizzazione, contatori «In coda N · Non riuscite N» (`pending`, `errors`; «Non riuscite» in `--rf-danger` con `CloudSlash` se > 0, con la frase «Il motivo è accanto a ogni lezione nel registro.»), `last_error` se presente. |
| **Risincronizza** | bottoni | «prossime» = `scope: upcoming`, subito; «tutte» = `scope: all`, prima un dialog: «Risincronizzare tutte le lezioni? Gli eventi del calendario «RipetiFlow» tornano come nel registro: le modifiche fatte su Google si perdono e gli eventi estranei vengono eliminati. Gli eventi delle lezioni passate restano.» Risposta 202 → toast «12 lezioni in coda per Google Calendar» (`queued`); 409 → nota con il testo del server e lo stato si ricarica (se Google ha tolto l'accesso diventa **Accesso revocato**). |
| **Scollega** | bottone pericolo | dialog: «Scollegare Google Calendar?» «Le lezioni restano qui. Il calendario «RipetiFlow» resta su Google ma non viene più aggiornato; se ricolleghi, verrà riusato.» + casella **«Elimina anche il calendario «RipetiFlow» da Google»** (non spuntata; `remove_calendar=true`). Se Google non risponde (502): nota nel dialog con il testo del server («Non è stato possibile eliminare il calendario da Google: il collegamento è ancora attivo, riprova tra poco.»), il collegamento resta. |
| **Accesso revocato** | `status: revoked` (in fase di prova Google lo fa ogni 7 giorni) | `CloudSlash` «Google ha chiuso l'accesso al calendario. Finché l'app è in prova, succede ogni 7 giorni: ricollega e le lezioni cambiate nel frattempo vengono inviate.» [■ Ricollega] (stesso calendario, nessun doppione) · [Scollega]. Con «In coda N» se ci sono modifiche in attesa. Con il token già scaduto «Elimina anche il calendario» non è possibile: nota «Il calendario va tolto a mano da Google Calendar.» |
| **Errore** | `status: error` | `CloudSlash` + `last_error` (testo del server) + [Risincronizza tutte] · [Ricollega]. |

Non esistono: scelta di un altro calendario (lo scope `calendar.app.created` vede solo il calendario creato dall'app), casella per singola lezione, sincronizzazione da Google verso il registro.

**Aspetto**: Sistema / Chiaro / Scuro (02 §4, salvato in `localStorage`). **Esporta**: CSV di tutti gli studenti (`GET /export/ledger.csv`); in caricamento il bottone mostra i puntini; errore → nota sotto. **Esci**: chiude la sessione e torna alla landing.
**Modalità demo** (solo con `dev_auth_enabled` e utente demo): sezione in fondo con [Ricrea i dati di esempio] (`POST /dev/seed`, conferma «Cancella e ricrea studenti, lezioni e pagamenti di esempio.»).
**Stati**: ogni sezione carica da sola (righe-scheletro) e mostra il proprio errore (banda §10) senza bloccare le altre.

Non esiste «Elimina account»: l'API non lo prevede.

---

## 9. Matita (flussi completi)

Componente, dati e stati: 02 §9.13. Qui i flussi.

### 9.1 Mobile — registrare una lezione appena finita (percorso principale)

```
1) Oggi, barra in basso           2) Sta pensando                  3) Proposta (sheet a metà)
┌──────────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────────┐
│ …                        │      │ …                        │     │ ▒ MATITA PROPONE        ▒│
│ ✎ ‹oggi 13-14 chimica    │      │ ✎ oggi 13–14 chimica con │     │ ▒ Matita ha letto: «oggi▒│
│   con sara, stechiom…›   │      │ ~~~~~~~~~~~~~~ (tratto)  │     │ ▒ 13-14 chimica con…»   ▒│
│               [■ Invia]  │      │ ¦Matita sta scrivendo…¦  │     │ ▒ Studente  Sara Conti  ▒│
│ tastiera                 │      │                          │     │ ▒ Giorno    mar 6 ott   ▒│
└──────────────────────────┘      └──────────────────────────┘     │ ▒ Orario 13:00–14:00 1 h▒│
                                                                   │ ▒ Materia   Chimica     ▒│
4) Ripassa a penna → toast                                         │ ▒ Argomento stechiometr.▒│
┌──────────────────────────┐                                       │ ▒ Importo   25,00 €     ▒│
│ ✓ Lezione registrata ·   │                                       │ [■ Ripassa a penna     ] │
│   nel saldo    [Annulla] │                                       │ [ Modifica ]  [ Scarta ] │
└──────────────────────────┘                                       └──────────────────────────┘
```

- In 3) la proposta si apre in un **sheet a metà altezza**, sopra la barra; «Modifica» apre il modulo Lezione precompilato. Bottoni da 44 px.
- Obiettivo: dalla fine della lezione al salvataggio **≤ 4 tocchi + la frase**.
- Se la lezione deve ancora finire («oggi 16:30–18 …» alle 14:20) la card ha l'avviso «Data nel futuro: la lezione sarà programmata.» e il toast dice «Lezione programmata per mar 6 ott alle 16:30».

### 9.2 Desktop — Cmd/Ctrl K da qualsiasi pagina

- Nella scheda studente e in Oggi: Cmd/Ctrl K porta il cursore sulla riga di Matita della pagina (scroll morbido se serve, istantaneo con reduced-motion).
- In Agenda, Studenti, Impostazioni: Cmd/Ctrl K apre un **dialog in alto** (larghezza 720, a 12 vh) con la sola riga e, sotto, le ultime 3 frasi usate in grafite (salvate solo in questo browser; Tab per sceglierle). Le proposte appaiono come card nel dialog; *Ripassa a penna* salva e chiude.

### 9.3 Domande e messaggi

- «quanto mi deve Giulia?» → **nota a margine** sotto la riga (non un messaggio in una chat): «Giulia ti deve 67,00 €: 23,00 € rimasti dopo il bonifico del 2 ottobre e la lezione di lunedì 5 (44,00 €).» La nota sparisce alla domanda successiva o con Esc; le ultime 5 note restano raggiungibili con ↑ nella riga.
- «chi mi deve più di 50 €?» → nota con un elenco (markdown) di nomi e importi. I nomi non sono link: la risposta è solo testo.
- Una domanda ambigua («quanto mi deve Luca?» con due Luca) riceve una domanda di chiarimento; si risponde nella stessa riga («Bianchi») e la conversazione continua.
- «scrivi un promemoria di pagamento per la mamma di Marco» → card messaggio a matita: testo modificabile, firma dal profilo, importi dal registro; azioni *Copia* · *WhatsApp* · *Modifica*. Nella scheda di Marco il bottone dice «WhatsApp · 339 204 7781» e apre la chat di Laura Rossi; da Oggi (nessuno studente nel contesto) è «WhatsApp» e il link è `https://wa.me/?text=…`: WhatsApp chiede a chi mandarlo. Nella scheda, senza un numero utilizzabile: «Nella scheda di Marco non c'è un numero di telefono valido: WhatsApp ti chiederà a chi mandarlo. [Aggiungi il numero]».

### 9.4 Testi di sistema (definitivi)

| Situazione | Testo | Fonte |
|---|---|---|
| Placeholder registro | Scrivi una riga… «oggi 16:30–18 matematica, equazioni» | UI |
| Placeholder Oggi | Scrivi una riga… «ieri 15–16:30 matematica con Luca» | UI |
| Placeholder mobile | Scrivi a Matita… | UI |
| Sta pensando | Matita sta scrivendo… | UI |
| Intestazione proposta | Matita propone | UI |
| Riga sorgente in bozza | Matita ha letto: «…» | UI |
| Avvisi della bozza | (es.) Data nel futuro: la lezione sarà programmata. | `warnings[]` |
| Conferma | Ripassa a penna | UI |
| Più proposte | Ripassa tutte a penna (3) | UI |
| Fuori ambito | Posso aiutarti solo con il tuo registro: lezioni, pagamenti, saldi e messaggi per studenti e famiglie. Prova per esempio: «quanto mi deve Giulia?» | `reply` (`refused: true`) |
| Non capito | Non sono riuscito a preparare una risposta affidabile. Riprova con una richiesta più semplice, per esempio: «quanto mi deve Giulia?» | `reply` (`refused: false`) |
| Sotto una risposta | oppure usa il modulo | UI |
| Quasi al limite | Ancora 8 richieste a Matita oggi. | UI da `usage` |
| Limite | Hai raggiunto il limite di 60 richieste a Matita per oggi. Riprova domani. — I moduli funzionano come sempre. | `detail` del 429 + UI |
| Matita non risponde | Matita non risponde in questo momento. La riga è ancora nel campo. Riprova. | UI (502) |
| Offline | Sei offline o il server non risponde. La riga è ancora nel campo. Riprova. | UI |
| Non disponibile | Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre. | UI (`assistant_available: false` / 503) |
| Dopo conferma | Lezione registrata · nel saldo — Annulla / Lezione programmata per gio 8 ott alle 15:00 — Annulla / Pagamento di 50,00 € registrato — Annulla | UI |

---

## 10. Stati comuni (tutte le schermate)

Componenti in 02 §9.15. Qui dove si usano e con quali testi.

### 10.1 Caricamento

| Schermata | Subito (senza aspettare) | Righe-scheletro |
|---|---|---|
| Oggi | data, titolo, riga di Matita | 3 in Prossime lezioni, 3 in Conti aperti, 1 nel mese |
| Studenti | titolo, ricerca, filtro | 4 righe da 64 px |
| Scheda studente | «‹ Studenti», nome e saldo se sono già in cache dalla lista | aside: barra alta 34 px al posto del saldo; registro: 4 righe |
| Agenda | intestazione della settimana, giorni | desktop: griglia vuota con «Caricamento…» nascosto; mobile: 2 righe per giorno |
| Impostazioni | titoli delle sezioni | 2 righe per sezione |
| Storico modifiche | titolo | 3 righe |

### 10.2 Errore di caricamento

- Banda sotto il titolo con `CloudSlash` e [Riprova]: senza dati in cache «Non riesco a caricare i dati.»; con dati in cache «Non riesco ad aggiornare i dati: quelli che vedi sono delle 9:12.» e i dati restano visibili in `--rf-ink-2`. Offline: «Sei offline: quelli che vedi sono i dati delle 9:12.»
- Le scritture fallite non spariscono: il modulo resta aperto e compilato (§10.4).

### 10.3 Pagine mancanti e sessione

- Indirizzo sconosciuto → «Pagina non trovata» + «Questo indirizzo non corrisponde a nessuna pagina del registro.» [Vai a Oggi] (da non autenticati: [Torna alla home]).
- `/studenti/:id` con 404 → «Studente non trovato» + «Forse è stato eliminato, o il link è di un altro account.» [Torna agli studenti].
- Una riga aperta che nel frattempo non esiste più (404 su `GET /lessons/{id}` o `/payments/{id}`) → nello sheet: «Questa riga non c'è più: forse è stata eliminata da un'altra finestra.» [Chiudi]; il registro si ricarica.
- 401 → `/accedi` con «La sessione è scaduta. Entra di nuovo: torni dove eri.»

### 10.4 Errori di invio nei moduli (`application/problem+json`)

- **Errori sui campi**: ogni `errors[].field` va sul campo omonimo, con lo stesso aspetto della validazione locale (bordo 2 px `field-error`, icona `Warning`, `errors[].message`, `aria-invalid="true"` + `aria-describedby`); il focus va al primo campo in errore. Corrispondenze: `student_id` → Studente · `subject_id` → Materia · `date` / `paid_on` → Giorno · `start_time` → Inizio · `end_time` → Fine · `hourly_rate_cents` → Tariffa · `topic` → Argomento · `notes` → Note · `amount_cents` → Importo · `method` → Come · `note` → Nota · `effective_from` → Valida dal · `name` → nome della materia · `first_name`, `last_name`, `grade`, `school`, `phone`, `email`, `guardian_*`, `default_subject_id` → i campi omonimi del modulo Studente · `timezone`, `full_name`, `default_*` → Profilo. Un `field` che il modulo non ha → nota sopra la barra azioni con il suo messaggio.
- **Errori senza campo** (409 senza `errors`, 422 senza `errors`, 502, 503): nota con `Warning` sopra la barra azioni con il `detail` del server; lo sheet resta aperto e compilato, **nessun toast**.
- 409 noti (testi del server): materia duplicata → campo nome «Esiste già una materia con questo nome.»; tariffa con la stessa data → campo «Valida dal» «Esiste già una tariffa con questa data di decorrenza.»; studente con movimenti → dialog di eliminazione con [Archivia] (§7.5); Risincronizza senza collegamento o con accesso revocato → nota in Impostazioni («Collega prima Google Calendar dalle Impostazioni.» / «Accesso a Google Calendar revocato: ricollega il calendario in Impostazioni.»).
- 500 → nota: il `title`/`detail` del server («Errore interno…») + «Riprova tra poco.»; nessun dettaglio tecnico in vista.
- Rete assente durante un invio → nota: «Sei offline: niente è stato salvato. Riprova quando torna la rete.»

---

## 11. Checklist di accettazione visiva (per la review delle PR)

- [ ] Nessun colore fuori dai token; `bg-indigo-*` & co. non compilano.
- [ ] Ogni importo: formato `1.234,50 €`, colonne in Plex Mono, nessun segno meno nei saldi.
- [ ] Ogni saldo ha una parola (deve / credito / in pari); il credito ha il tempo da `credit_minutes` («circa …» o icona `ApproximateEquals`).
- [ ] Le lezioni non finite sono «Programmate»: non cambiano il saldo, solo «Previsto». Nessuna riga «da segnare» o «annullata».
- [ ] Le bozze di Matita sono tratteggiate (`pencil-draft`), in grafite, con gli avvisi del server, e **non** cambiano i totali.
- [ ] Metodi di pagamento: Contanti, Bonifico, Altro (+ nota).
- [ ] Target ≥ 44 px su mobile (anche bottoni in riga e link «Riprova»), input 16 px.
- [ ] Focus visibile (contorno inchiostro + alone giallo) su ogni controllo; un campo in errore mantiene il bordo rosso anche con il focus.
- [ ] Nessun glifo `≈ → ⌘ ↵ ✓ ▾` scritto come testo in interfaccia: icone Phosphor o parole (02 §3).
- [ ] Ogni metodo di accesso e ogni funzione opzionale (Matita, Calendar, demo) compare solo se `/public/config` la dichiara attiva.
- [ ] Ogni schermata ha caricamento, errore e vuoto (§10).
- [ ] Dark mode verificata con `data-theme="dark"` e con preferenza di sistema.
- [ ] Nessuna ombra su righe/liste, nessun `rounded-xl` o superiore, nessun `backdrop-filter`.
- [ ] `prefers-reduced-motion`: nessuna traslazione, nessun loop.
- [ ] Testi in italiano, minuscole per giorni/mesi, 24 h, settimana da lunedì.
