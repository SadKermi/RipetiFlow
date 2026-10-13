# RipetiFlow — Design system «Registro» v1.1

*v1.0 6 ottobre 2026 · v1.1 13 ottobre 2026 (allineato al contratto API `docs/05-api.md`) · Implementazione: `frontend/src/styles/tokens.css` (+ `fonts.md`) · Prova visiva: [specimen.html](specimen.html) / `specimen.jpg`*

Questo documento è per chi sviluppa. Ogni valore qui ha un token in `tokens.css`; se manca un token, il valore non va inventato: va chiesto.
**Regola d'oro**: si disegna solo ciò che l'API sa fare. Una lezione non ha uno «stato»: è **nel saldo** quando è finita (`settled: true`), altrimenti è **programmata**; per toglierla la si **elimina** (lo storico modifiche ne conserva traccia).

---

## 1. Concetto in tre righe

**RipetiFlow è il registro del tutor.** I fatti (lezioni fatte, soldi ricevuti) sono scritti **a penna**: inchiostro su carta, righe sottili, numeri in colonna. Ciò che propone Matita è scritto **a matita**: grafite, tratteggio, provvisorio, finché il tutor non lo **ripassa a penna** con un clic. Il colore serve solo a dire qualcosa: **rosso ti deve, blu in credito, grafite bozza, giallo oggi/adesso**.

Tre principi derivati:
1. **Righe, non card.** La struttura è fatta di filetti da 1 px. Le ombre esistono solo per ciò che sta sopra la pagina (sheet, popover, dialog, toast).
2. **Parole prima dei segni.** «Ti deve 67,00 €», mai «−67,00». Il colore ripete l'informazione, non la sostituisce.
3. **Calmo ogni giorno.** Nessuna animazione decorativa; movimento solo per cambi di stato. L'app si apre 5 volte al giorno.

---

## 2. Griglia, spaziatura, misure

### Spaziatura (base 4 px)

| Token | px | Uso tipico |
|---|---|---|
| `--rf-space-1` | 4 | icona ↔ testo stretto, padding badge verticale |
| `--rf-space-2` | 8 | gap tra bottoni, icona ↔ etichetta |
| `--rf-space-3` | 12 | padding orizzontale input/celle |
| `--rf-space-4` | 16 | **gutter mobile**, padding sheet |
| `--rf-space-6` | 24 | tra gruppi in un form |
| `--rf-space-8` | 32 | tra sezioni su mobile |
| `--rf-space-12` | 48 | tra colonne desktop |
| `--rf-space-16` · `--rf-space-20` | 64 · 80 | tra sezioni desktop, landing |

In Tailwind la scala standard `p-1…p-20` coincide già (`--spacing: 0.25rem`).

### Layout

| | Mobile (≤ 767 px, progettato a **390**) | Tablet (768–1023) | Desktop (≥ 1024, progettato a **1440**) |
|---|---|---|---|
| Colonne | 4 | 8 | 12 |
| Gutter laterale (`--rf-gutter`, utility `px-gutter`) | 16 px | 24 px | 40 px |
| Larghezza contenuto | 100 % | 100 % | max 1200 px (`--rf-content-max`), centrato |
| Navigazione | tab bar in basso 64 px + safe-area | tab bar | barra superiore 64 px |
| Scheda studente | una colonna | una colonna | frontespizio 336 px (`--rf-aside-w`) + registro fluido (max 880 px) con 48 px di gap |

### Misure fisse

| Token | Valore | Regola |
|---|---|---|
| `--rf-touch` | 44 px | ogni elemento cliccabile ha un'area ≥ 44×44 px (anche icone: padding attorno) |
| `--rf-control-h` | 44 px | input, select, bottoni standard |
| `--rf-control-h-sm` | 36 px | **solo desktop** (azioni dentro le righe del registro). Sotto 768 px ogni bottone, anche in riga o in una card di Matita, è alto 44; i link in linea («Riprova», «Agenda ›») hanno un'area di tocco di 44 px (padding o `::after`) |
| `--rf-row-h` | 56 px | altezza minima riga registro/lista su mobile |
| `--rf-row-h-dense` | 48 px | altezza minima riga registro su desktop |
| `--rf-tabbar-h` | 64 px | + `env(safe-area-inset-bottom)` |

---

## 3. Tipografia

### Famiglie

| Ruolo | Famiglia | Token | Perché |
|---|---|---|---|
| **Display e voce** — titoli di pagina, nome studente, saldo grande, totali, testo scritto a/da Matita, argomento della lezione | **Literata** (variabile, `opsz` 7–72, `wght` 200–900, con corsivo) | `--rf-font-display` | Serif nata per i libri digitali: è il «libro» del libro mastro. L'asse ottico la rende robusta a 16 px in corsivo e raffinata a 64 px. x-height 0,507 em. |
| **Interfaccia** — etichette, bottoni, nomi nelle liste, testo corrente | **Schibsted Grotesk** (variabile, `wght` 400–900) | `--rf-font-ui` | Grottesco editoriale (nato per un gruppo di quotidiani); x-height alta (0,527 em) → leggibile sul telefono; personalità senza decorazione. Non è Inter. |
| **Importi e orari in colonna** | **IBM Plex Mono** (400, 500) | `--rf-font-money` | Monospaziato con genealogia da macchina per scrivere: richiama il nastro della calcolatrice. Zero con **punto centrale** (più discreto della barra di Red Hat Mono e Atkinson; distingue 0 da O nei campi); virgola e punto larghi come le cifre → **allineamento decimale perfetto**. |

Installazione e pacchetti npm verificati: `frontend/src/styles/fonts.md`.

**Glifi assenti.** Nessuno dei tre font ha `≈ → ← ⌘ ↵ ↻ ✓ ▾ ▸`. In interfaccia: frecce → icona `ArrowRight` (o le parole «da … a …»); scorciatoie → `<kbd>` con icona `Command` + «K» su Apple, «Ctrl K» altrove, «Invio» a parole; «circa» → icona `ApproximateEquals` nelle forme compatte, parola **circa** nelle frasi; tendine/espandi/fatto → `CaretDown`/`CaretRight`/`Check`. Dettagli in `fonts.md`. (Nei wireframe ASCII di 03 i simboli restano come notazione.)

### Regole d'uso delle cifre (importante)

| Contesto | Font | `font-variant-numeric` | Esempio |
|---|---|---|---|
| Colonne del registro, liste «Conti aperti», campi importo, orari in colonna | Plex Mono 400 (500 per l'importo principale della riga) | `tabular-nums lining-nums` | `44,00` · `15:00` |
| Saldo grande, totali con doppia riga | Literata 500 | `tabular-nums lining-nums` | **67,00 €** |
| Importi dentro una frase | Schibsted, **senza** `tnum` | `lining-nums proportional-nums` | «Ultimo pagamento 50,00 € il 2 ott» |
| Durate in colonna | Schibsted con `tnum` (non contengono virgole) | `tabular-nums` | `1 h 30` |

> Schibsted Grotesk con `tnum` rende tabellari anche `,` e `.` («50 , 00»): **mai** `tnum` di Schibsted su numeri con decimali.

Nelle **colonne** il simbolo € compare solo nella colonna Saldo e nei totali; Lezione/Pagato mostrano solo il numero (l'intestazione basta). Nelle frasi e nei badge l'importo ha sempre «€».

### Scala

Mobile → desktop (≥ 1024 px). Tutti i valori sono token `--rf-text-*` / `--rf-leading-*`; in Tailwind `text-display-l`, `text-body`, ecc.

| Token | Mobile | Desktop | Famiglia / peso | Uso |
|---|---|---|---|---|
| `display-xl` | 40/44 | 64/68 | Literata 400, tracking −0,012 em | solo landing (H1) |
| `display-l` | 34/38 | 44/48 | Literata 400 (500 per importi) | «Oggi», saldo grande, titoli pagina desktop |
| `display-m` | 28/32 | 32/38 | Literata 400 | nome studente, titoli di sheet |
| `display-s` | 22/28 | 24/30 | Literata 400 | titoli di sezione |
| `voice` | 17/26 | 17/26 | Literata **italic** 400 | riga di Matita, risposte, argomento lezione (15–16 px in riga) |
| `title` | 18/24 | 18/24 | Schibsted 600 | titoli di riga, intestazioni lista |
| `body` | 16/24 | 16/24 | Schibsted 400 | testo di base; **minimo 16 px negli input** (evita lo zoom di iOS) |
| `body-s` | 14/20 | 14/20 | Schibsted 400 | meta, note sotto la riga |
| `caption` | 12/16 | 12/16 | Schibsted 600, MAIUSCOLO, +0,06 em | **solo** intestazioni di colonna ed etichette di sezione minori |
| `money` | 15/20 | 15/20 | Plex Mono 400/500 | importi in colonna |
| `money-s` | 13/16 | 13/16 | Plex Mono 400 | orari sotto la data |
| `money-l` | 24/28 | 24/28 | **Literata 500** tabellare | totali («Da incassare 212,00 €») |

Pesi ammessi: Literata 400/500 (+ italic 400); Schibsted 400/500/600; Plex Mono 400/500. Niente 700+.
Lunghezza riga: 45–72 caratteri per i testi lunghi (landing, aiuto). Titoli: `text-wrap: balance`.

---

## 4. Colore

### Token (chiaro / scuro «Notte»)

Rapporti di contrasto WCAG 2.2 calcolati sui valori esatti (script in scratchpad, formula WCAG). **AA testo normale ≥ 4,5:1; componenti UI/grafica ≥ 3:1.**

| Token | Nome | Chiaro | Scuro | Coppia verificata | Chiaro | Scuro |
|---|---|---|---|---|---|---|
| `--rf-paper` | Carta (fondo) | `#F4F1E8` | `#16171B` | — | | |
| `--rf-paper-raised` | Foglio (registro, sheet) | `#FBFAF6` | `#1E1F24` | — | | |
| `--rf-paper-sunk` | Incavo | `#EAE5D8` | `#101114` | — | | |
| `--rf-rule` | Riga (decorativa) | `#D9D2C2` | `#303138` | su carta | 1,33 | 1,38 — *non porta informazione* |
| `--rf-rule-strong` | Filetto | `#B9B09D` | `#4A4B52` | decorativo | | |
| `--rf-control` | Bordo controlli | `#8A8170` | `#74757D` | bordo input su carta / foglio | **3,41 / 3,69** | **3,91 / 3,59** |
| `--rf-margin` | Margine rosso | `#C9776F` | `#7A4540` | decorativo | 2,93 | 2,35 |
| `--rf-ink` | Inchiostro | `#1A1C23` | `#ECE7DC` | testo su carta / foglio / incavo | **15,06 / 16,29 / 13,53** | **14,52 / 13,34 / 15,31** |
| `--rf-ink-2` | Inchiostro 2 | `#454952` | `#C2BDB1` | testo su carta / foglio | **7,99 / 8,64** | **9,56 / 8,78** |
| `--rf-ink-3` | Inchiostro 3 (meta) | `#62666F` | `#9D998F` | testo su carta / foglio / incavo | **5,10 / 5,51 / 4,58** | **6,30 / 5,79 / 6,64** |
| `--rf-on-ink` | Su inchiostro | `#F4F1E8` | `#16171B` | testo su bottone `--rf-ink` | **15,06** | **14,52** |
| `--rf-debito` | Rosso «ti deve» | `#A3302A` | `#F28B7F` | su carta / foglio / wash | **6,17 / 6,67 / 5,40** | **7,48 / 6,87 / 6,06** |
| `--rf-debito-wash` | Fondo badge debito | `#F4DED8` | `#3B2320` | inchiostro sopra | 13,20 | 11,77 |
| `--rf-credito` | Blu «credito» | `#1D4C9E` | `#93B3F3` | su carta / foglio / wash | **7,21 / 7,79 / 6,49** | **8,51 / 7,82 / 7,00** |
| `--rf-credito-wash` | Fondo badge credito | `#DFE6F3` | `#1C2840` | inchiostro sopra | 13,57 | 11,94 |
| `--rf-pencil` | Grafite (testo bozza) | `#5A606A` | `#A4A9B1` | su carta / foglio | **5,61 / 6,06** | **7,58 / 6,96** |
| `--rf-pencil-line` | Tratteggio bozza | `#7E848E` | `#7C828B` | bordo su carta / foglio | **3,33 / 3,60** | **4,63 / 4,25** |
| `--rf-pencil-hatch` | Campitura 45° | `rgb(90 96 106 / .075)` | `rgb(164 169 177 / .08)` | sotto testo grafite: ≥ 5,3 | | |
| `--rf-highlight` | Evidenziatore | `#F5E27A` | `#5B5018` | **solo `--rf-ink` sopra** | **13,00** | **6,54** |

Regole:
- Sull'evidenziatore si scrive **solo** con `--rf-ink` (in scuro `--rf-ink-2` scende a 4,30, `--rf-ink-3` a 2,84: vietati). La utility `marker` **forza** `color: var(--rf-ink)`, anche dentro un testo secondario.
- `--rf-rule` e `--rf-margin` non devono mai essere l'unico modo di capire qualcosa.
- **Nessun altro colore.** Niente verde «successo» (un saldo a zero è «in pari», in `--rf-ink-2`), niente arancio «warning» (gli avvisi usano icona + testo inchiostro). Gli errori usano `--rf-danger` (= debito) **sempre con icona e testo**; sui campi l'errore è un **bordo** di 2 px (utility `field-error`), mai un'ombra, così il focus non lo copre.
- Velo dei dialog: `--rf-scrim` (utility `bg-scrim`).

### Semantica

| Significato | Colore | Forma obbligatoria oltre al colore |
|---|---|---|
| **Ti deve** (debito dello studente) | `--rf-debito` | parola «deve» / «ti deve» |
| **In credito** (anticipo) | `--rf-credito` | parola «credito» + tempo equivalente da `credit_minutes` («≈ 1 h 49 min», §7) |
| **In pari** | `--rf-ink-2` | parola «in pari» |
| **Programmata** (lezione non ancora finita, `settled: false`) | testo `--rf-ink`, importo `--rf-ink-3` | etichetta «Programmata · non ancora nel saldo»; non cambia il saldo progressivo |
| **Bozza di Matita** | `--rf-pencil` + tratteggio + campitura | etichetta «Bozza» o «Matita propone» |
| **Inchiostro** (confermato, nel saldo) | `--rf-ink` | — è lo stato normale |
| **Oggi / adesso / appena cambiato** | `--rf-highlight` (fondo, metà bassa della riga) | testo esplicito («tra 40 min», «oggi», «in corso», «Matita sta scrivendo…»); il saldo appena aggiornato lo ha per 1,2 s (§8) |
| **Focus** | contorno 2 px `--rf-ink` + alone `--rf-highlight` (fuori dal bordo) | — |
| **Errore** | `--rf-danger` | icona `Warning` + messaggio; sui campi bordo 2 px |

### Modalità scura «Notte»
Stessi nomi di token, valori in `tokens.css`. Attivazione: automatica con `prefers-color-scheme: dark` **a meno che** `<html data-theme="light">`; forzata con `data-theme="dark"`. Il selettore in Impostazioni ha tre voci: Sistema / Chiaro / Scuro (salvare la scelta in `localStorage` e applicarla con uno script inline in `<head>` prima del paint, come in `specimen.html`).

In scuro le ombre quasi non si vedono: la separazione la fanno `--rf-paper-raised` + filetto `--rf-rule`.

---

## 5. Raggi, righe, elevazione

### Raggi
| Token | Valore | Dove |
|---|---|---|
| `--rf-radius-0` | 0 | righe del registro, liste, tabelle, tab bar |
| `--rf-radius-1` | 3 px | bottoni, input, select, badge, segmented |
| `--rf-radius-2` | 6 px | popover, dialog desktop, card di Matita, toast |
| `--rf-radius-sheet` | 14 px | **solo** angoli superiori dei bottom sheet su mobile |

Cerchi solo per l'avatar (iniziali) e per i punti di stato. **Mai pillole**, mai `rounded-2xl`.

### Righe e filetti (il «registro»)
| Elemento | Specifica |
|---|---|
| Riga tra voci | `border-bottom: 1px solid var(--rf-rule)` |
| Filetto sopra una sezione | `border-top: 2px solid var(--rf-ink)` + titolo 8–12 px sotto |
| Intestazione colonne | fondo `--rf-paper`, filetto superiore 1 px `--rf-rule-strong`, caption maiuscola |
| **Linea di margine** (solo scheda studente) | 1 px `--rf-margin`, opacità 0,7, verticale tra colonna Data e colonna Voce (x = 104 px desktop, 72 px mobile) |
| **Doppia riga del totale** | `border-bottom: 3px double var(--rf-ink)` (utility `rule-total`) sotto saldo e totali |
| Riga di Matita (prossima riga da scrivere) | `border-bottom: 1px solid var(--rf-ink-3)` (più scura delle altre: «qui si scrive») |
| Bozza a matita | utility **`pencil-draft`**: in un solo `background` i 4 lati tratteggiati (trattino 6 px `--rf-dash`, vuoto 5 px `--rf-dash-gap`, spessore 1,5 px `--rf-dash-w`) sopra la campitura a 45° — **non** `border-style: dashed` (passo diverso per browser, non animabile). Per staccarla di 2 px dai filetti e tenerla sotto il testo: `relative isolate before:absolute before:inset-0.5 before:-z-10 before:pencil-draft`. Solo tratteggio (badge «Bozza»): `pencil-dash`. Le due utility non si combinano (scrivono entrambe `background-image`) |

### Elevazione
| Livello | Cosa | Come |
|---|---|---|
| 0 | Pagina | `--rf-paper` |
| 1 | Registro, liste, campi | `--rf-paper-raised` + righe. **Nessuna ombra** |
| 2 | Popover, menu, autocomplete, toast | `--rf-paper-raised` + bordo 1 px `--rf-control` + `--rf-shadow-popover` (`0 10px 28px -14px rgb(26 28 35/.30)`) |
| 3 | Dialog, bottom sheet | `--rf-paper-raised` + `--rf-shadow-sheet` (`0 28px 64px -28px rgb(26 28 35/.42)`) + velo `--rf-scrim` |

---

## 6. Iconografia

- **Set**: [Phosphor Icons](https://phosphoricons.com), pacchetto `@phosphor-icons/react` **2.1.10** (MIT). Peso **`regular`** sempre; `bold` vietato, `fill` solo per lo stato attivo della tab bar (opzionale), `duotone` vietato.
- **Misure**: 20 px default, 16 px dentro righe e badge, 22 px nella tab bar. Colore `currentColor`.
- Icona + etichetta sempre, tranne: «+» (con `aria-label`), chiudi (`x`), frecce di navigazione. Mai icona da sola per azioni distruttive.
- Perché Phosphor e non Lucide: Lucide è il default di shadcn/ui e quindi della maggior parte delle interfacce generate; Phosphor ha il tratto sottile coerente con le nostre righe e ha le metafore che ci servono (penna, matita, pennino).

| Concetto | Icona Phosphor |
|---|---|
| Matita (assistente, bozza) | `PencilSimpleLine` |
| Ripassa a penna (conferma) | `PenNib` |
| Oggi | `House` |
| Studenti | `Student` |
| Agenda | `CalendarDots` |
| Impostazioni / Altro | `GearSix` |
| Pagamento | `Coins` · contanti `Money` · bonifico `Bank` · altro `Wallet` |
| Lezione / orario | `Clock` · programmata `CalendarDots` |
| Cambio tariffa | `ArrowsClockwise` |
| Promemoria | `ChatText` · invio `WhatsappLogo` · `Copy` · email `EnvelopeSimple` |
| Annulla ultima azione | `ArrowUUpLeft` |
| Duplica (settimana dopo, altro studente) | `CopySimple` |
| Elimina | `Eraser` (cancellare a matita) — `Trash` solo per «Elimina studente» |
| Archivia / ripristina studente | `Archive` |
| Storico modifiche | `ClockCounterClockwise` |
| Sincronizzato con Calendar | `CloudCheck` · errore o rete assente `CloudSlash` · risincronizza `ArrowsClockwise` |
| Accesso | Google: logo «G» ufficiale (linee guida Google Sign-In) · link via email `EnvelopeSimple` · demo `UserCircleDashed` |
| Matita | fuori ambito `Prohibit` · limite `HourglassMedium` · non disponibile `PencilSimpleSlash` · avviso `Warning` |
| Glifi sostituiti | `ArrowRight` (→), `ApproximateEquals` (≈), `Command` (⌘), `CaretDown` (▾), `CaretRight` (▸), `Check` (✓) |

---

## 7. Formattazione dei dati (it-IT)

**Una sola** libreria di formattazione, `frontend/src/lib/format/` (`money`, `duration`, `date`, `time`, `phone`), usata ovunque. Il credito in tempo: `formatCreditMinutes` (forma compatta, da mostrare come icona `ApproximateEquals` + durata) e `formatCreditMinutesText` («circa 1 h 49 min», per frasi e `aria-label`).

```ts
import { formatEuro, formatEuroAbs, formatMinutes, formatCreditMinutesText } from "@/lib/format";
formatEuroAbs(-6700);           // "67,00 €"  (U+00A0 prima di €; il segno lo dice la parola «deve»)
formatEuro(123450);             // "1.234,50 €" — raggruppamento sempre attivo: l'it-IT di default darebbe "1234,50 €"
formatMinutes(90);              // "1 h 30 min"
formatCreditMinutesText(109);   // "circa 1 h 49 min"
// Mai cents / 100 in virgola mobile: la libreria passa da una stringa decimale esatta.
```
Nelle colonne l'importo è senza «€» (stesso formattatore, simbolo tolto dal componente di colonna).

| Dato | Formato | Esempio | Note |
|---|---|---|---|
| Denaro | sempre 2 decimali, punto migliaia, virgola decimali, «€» dopo con U+00A0 | `1.234,50 €` | Gestire **centesimi interi** lato dati; mai float. |
| Saldo | parola + importo **senza segno**, da `balance.balance_cents` | «ti deve 67,00 €» · «credito 40,00 € · ≈ 1 h 49 min» · «in pari» | Il tempo equivalente è **`balance.credit_minutes`** dell'API (credito × 60 ÷ tariffa corrente, **per difetto** al minuto: docs/04): non si ricalcola dai centesimi. Formato «≈ H h MM min» con il formattatore delle durate; «≈» è l'icona `ApproximateEquals` (`aria-label` «circa»), nelle frasi si scrive «circa 1 h 49 min». Senza tariffa corrente (`credit_minutes: null`) si mostra solo l'importo. |
| Saldo previsto | «Previsto con le lezioni programmate: » + parola + importo, da `balance.projected_balance_cents` | «Previsto con le lezioni programmate: deve 100,00 €» | Solo se `scheduled_cents > 0`. Mai al posto del saldo. |
| Tariffa | importo + «/h» | `22,00 €/h` | |
| Durata | `H h MM` in colonna, `H h MM min` in frase | `1 h 30` · `1 h 30 min` · `45 min` · `2 h` | Mai «1,5 h» in UI. Stesso formattatore per lezioni, totali del mese e credito. |
| Orario | 24 h, due cifre | `15:00` · intervallo `15:00–16:30` | Trattino lungo `–` (U+2013) senza spazi. |
| Data in riga | giorno abbreviato + numero + mese abbreviato | `mar 6 ott` | Anno solo se ≠ anno corrente: `lun 28 set 2025`. |
| Data in titolo | esteso | `martedì 6 ottobre` | Minuscolo. |
| Relativo | entro ±2 giorni | `ieri` · `oggi` · `domani` · `dopodomani` | `Intl.RelativeTimeFormat("it",{numeric:"auto"})`. |
| Tempo che manca | < 3 h | `tra 40 min` · `tra 2 h 10 min` · `adesso` | Aggiornare ogni minuto. |
| Settimana | da lunedì | `5–11 ott 2026` | |
| Telefono | come l'ha scritto il tutor (testo libero ≤ 40) | `347 512 0896` | Link `tel:`. Per WhatsApp vedi la normalizzazione sotto. |
| Classe | ordinale femminile/maschile | `3ª liceo scientifico` | Campo `grade` (≤ 60), testo libero; la scuola è un campo a parte (`school`). |
| Elenchi | `Intl.ListFormat` | `Luca, Giulia e Marco` | |
| Metodo di pagamento | `cash` → Contanti · `bank_transfer` → Bonifico · `other` → Altro | «Pagamento · altro» + nota «Satispay» | Etichette identiche al CSV e allo storico del backend. |

**Numero per WhatsApp** (`https://wa.me/<cifre>?text=…`, implementato in `src/lib/format/phone.ts`). Il numero si usa **solo** nella scheda di uno studente (`context.student_id`): `guardian_phone` se c'è, altrimenti `phone`, e il bottone mostra a chi va («WhatsApp · 347 512 0896»). Normalizzazione: togli spazi, punti, trattini, barre e parentesi; `+` o `00` iniziale = già internazionale; cellulare italiano (`3…`, 9–10 cifre) o fisso (`0…`, lo 0 resta) → si antepone `39`; si scrivono solo cifre, senza `+`. Se il numero è dubbio, o non c'è uno studente nel contesto (Oggi, ⌘K), il link è `https://wa.me/?text=…` e WhatsApp chiede a chi mandarlo. Mai indovinare: un «331…» letto come +33 aprirebbe la chat di uno sconosciuto con un debito scritto dentro.

---

## 8. Movimento

| Token | Durata | Easing | Uso |
|---|---|---|---|
| `--rf-dur-1` | 120 ms | `--rf-ease-out` `cubic-bezier(.2,.8,.2,1)` | hover, pressione, cambi di colore |
| `--rf-dur-2` | 180 ms | ease-out | popover, segmented, comparsa toast |
| `--rf-dur-3` | 240 ms | ease-out in entrata / `--rf-ease-in` `cubic-bezier(.4,0,1,1)` in uscita (×0,75) | bottom sheet (translateY 100% → 0), dialog (opacity + translateY 8 px) |
| `--rf-dur-ink` | 420 ms | `--rf-ease-ink` `cubic-bezier(.65,0,.35,1)` | **Ripassa a penna**: tratteggio e campitura → opacità 0; riga d'inchiostro 2 px `scaleX(0→1)` da sinistra; testo grafite → inchiostro |
| `--rf-dur-think` | 1400 ms ciclo | ease-ink | «Matita sta scrivendo»: tratto ondulato grafite disegnato sotto la riga (`stroke-dashoffset`), max 3 cicli poi resta fermo |

Regole:
- **Nessuna** animazione d'ingresso di pagine/sezioni, nessun contatore che «conta» i numeri, nessun parallax, nessuno skeleton lampeggiante (lo skeleton è statico, vedi componenti).
- Il saldo che cambia dopo una conferma: il numero si sostituisce e l'evidenziatore compare dietro per 1,2 s poi sfuma in 240 ms. Vale anche per «Previsto» quando si programma una lezione futura (il saldo, in quel caso, non cambia).
- `transition` senza durata esplicita usa `--rf-dur-1` / `--rf-ease-out` (mappati in `@theme`), quindi va a 0 con movimento ridotto.
- `prefers-reduced-motion: reduce`: tutti i token di durata a 0 (già in `tokens.css`); il «sta scrivendo» diventa testo statico con puntini fissi; lo sheet appare senza traslazione.

---

## 9. Componenti

Per ogni componente: anatomia, misure, stati. Stati standard sempre: **default · hover (solo puntatore fine) · pressed · focus-visible · disabled · loading** dove ha senso.

### 9.1 Bottoni

| Variante | Aspetto | Uso |
|---|---|---|
| **Inchiostro** (primario) | fondo `--rf-ink`, testo `--rf-on-ink`, Schibsted 600 15 px, h 44, padding 0 16, raggio 3 | **una sola volta per vista**: Salva lezione, Registra pagamento, Ripassa a penna |
| **Filo** (secondario) | trasparente, bordo 1 px `--rf-control`, testo `--rf-ink` | Annulla, Modifica, Promemoria |
| **Quieto** | solo testo `--rf-ink-2`, sottolineato all'hover (offset 4 px) | azioni terziarie in riga |
| **Pericolo** | bordo e testo `--rf-debito` | Elimina, Scollega Calendar; sempre seguito da conferma |
| **Quadrato** | 44×44, solo icona + `aria-label` | «+» nuova lezione, chiudi |
| **Piccolo** (`--rf-control-h-sm`, 36) | come le altre varianti | solo desktop ≥ 768 px, dentro le righe del registro e nelle card di Matita. Su mobile diventa 44 |

Stati: hover inchiostro = `color-mix(in oklab, var(--rf-ink) 86%, var(--rf-paper))`; filo/quieto hover = fondo `--rf-paper-sunk`; pressed = `translateY(1px)`; disabled = opacità 0,4 e `cursor:not-allowed` (mai solo grigio senza spiegazione: affiancare il motivo); loading = etichetta resta, icona sostituita da 3 puntini statici, `aria-busy="true"`; focus = contorno + alone (§4).

### 9.2 Campi

- **Etichetta sopra**, Schibsted 500 14 px `--rf-ink-2`, 6 px dal campo. Mai placeholder come etichetta.
- Campo: h 44, padding 0 12, fondo `--rf-paper-raised`, bordo 1 px `--rf-control`, raggio 3, testo 16 px.
- Aiuto sotto: 13/18 `--rf-ink-3`. Errore: **bordo** 2 px `--rf-danger` (utility `field-error`, padding orizzontale 11 px per non far saltare il testo — mai `box-shadow`), messaggio con icona `Warning` in `--rf-danger`, `aria-invalid="true"` + `aria-describedby`. Il focus (contorno + alone esterni) si somma al bordo rosso: l'errore resta visibile mentre lo si corregge.
- Stati: default, hover (bordo `--rf-ink-3`), focus (contorno + alone), compilato, errore, disabilitato (fondo `--rf-paper-sunk`, testo `--rf-ink-3`), sola lettura (nessun bordo, fondo sunk).
- Campi di testo con limite del server: contatore «37/200» in `--rf-ink-3` sotto il campo quando mancano ≤ 40 caratteri (Argomento 200, Nota pagamento 500, Note 4000, nomi 80/120).
- **Errori dal server** (`application/problem+json`): ogni `errors[].field` va sul campo omonimo come errore (stesso aspetto della validazione locale) e il focus si sposta sul primo campo in errore; ciò che non ha un campo (`detail` di un 409, 422 senza `errors`, 502) è una nota con `Warning` sopra la barra azioni. Lo sheet resta aperto, nessun toast. Dettagli e testi in 03 §10.
- **Importo**: Plex Mono 18 px 500, «€» fisso a destra in `--rf-ink-3`, `inputmode="decimal"`, accetta virgola o punto, formatta al blur.

### 9.3 Data e ora

- **Giorno**: campo che mostra `mar 6 ott 2026` + scorciatoie sotto come chip-testo: `Oggi · Ieri · Altro…`. Su mobile «Altro…» apre il date picker nativo (`<input type="date">`); su desktop un calendario 7 colonne lun→dom, oggi con evidenziatore, giorno scelto con fondo `--rf-ink`.
- **Orario**: due campi Inizio e Fine affiancati, separati dall'icona `ArrowRight` 16 px `--rf-ink-3`; Plex Mono, `inputmode="numeric"`, accettano `15`, `1500`, `15:00`, `15.00`. Sotto: durata calcolata e importo («1 h 30 min · 33,00 € a 22,00 €/h»). Errore se fine ≤ inizio («L'orario di fine deve essere successivo a quello di inizio.», lo stesso testo del server); oltre 8 h avviso non bloccante («Sono 9 h di lezione: è giusto?»); oltre 12 h errore bloccante («Una lezione non può durare più di 12 ore.», come il server).
- Durate rapide sotto «Fine»: `+1 h · +1 h 30 · +2 h`; la durata proposta all'apertura è `profile.default_lesson_minutes`.

### 9.4 Select / combobox studente e materia

- Combobox con ricerca: si digita, la lista filtra; Invio sceglie il primo. Su mobile apre un **sheet** a tutta altezza con campo di ricerca in alto e righe da 56 px.
- **Materia**: menu dalle materie attive dell'utente (Impostazioni, ordine `position`); preselezionata la **materia abituale** dello studente (`default_subject_id`), altrimenti l'ultima usata con lui. Facoltativa: «Nessuna materia» è una scelta valida.
- Opzione finale «+ Nuova materia» / «+ Nuovo studente» in grafite.

### 9.5 Segmented control

- Contenitore: bordo 1 px `--rf-control`, raggio 3, padding 2, fondo `--rf-paper-raised`. Segmento attivo: fondo `--rf-ink`, testo `--rf-on-ink`. h 44 su mobile (38 nel blocco componenti desktop).
- Usi: **Contanti | Bonifico | Altro** (icone `Money`, `Bank`, `Wallet`; con «Altro» la Nota diventa consigliata, segnaposto «es. Satispay, PayPal»), **Sistema | Chiaro | Scuro**, filtro studenti **Tutti | Ti devono | In credito**.
- Ruolo ARIA: `radiogroup` con frecce sinistra/destra.

### 9.6 Righe del registro (componente centrale)

Dati: `GET /students/{id}/ledger` (`LedgerEntry[]`, ordine decrescente) + `student.rates` per le righe di cambio tariffa.
Griglia desktop: `Data 104 px | Voce 1fr | Durata 76 | Lezione 100 | Pagato 100 | Saldo 136` (allineamento a destra per le ultime 4). Mobile: `Data 72 | Voce 1fr | Importo auto`, saldo progressivo su seconda riga sotto la voce. **Data su mobile a due righe**: «lun 5» (600) sopra, «ott» sotto (13 px `--rf-ink-3`; «set 2025» se l'anno è diverso); padding della cella 8 px a sinistra e 4 a destra, così «mer 30» e «set 2025» restano dentro i 72 px senza toccare la linea di margine. L'orario, su mobile, va nella colonna Voce.

| Variante | Contenuto | Stile |
|---|---|---|
| **Lezione** (`kind: lesson`, `settled: true`) | Data `lun 5 ott` + orario `17:00–19:00` (Plex 12) · **Materia** (600; «Lezione» se senza materia) · *argomento* (Literata italic) · durata · importo in **Lezione** · saldo progressivo. Le note private non sono nel registro: si leggono aprendo la lezione | inchiostro |
| **Programmata** (`settled: false`: la lezione non è ancora finita) | come Lezione; sotto, 13 px: «Programmata · non ancora nel saldo» (con evidenziatore «oggi · tra 40 min» o «in corso» quando serve); importo in `--rf-ink-3`; **cella Saldo vuota**: il saldo progressivo non cambia finché la lezione non finisce, poi la riga diventa Lezione da sola | inchiostro, nessun tratteggio (è scritta a penna, solo non ancora dovuta) |
| **Pagamento** | icona `Money`/`Bank`/`Wallet` · **Pagamento** · contanti / bonifico / altro · nota (per «altro» è il «come»: «Satispay») · importo in **Pagato** in `--rf-credito` | inchiostro |
| **Bozza (matita)** | lezione o pagamento proposto da Matita + riga «Matita ha letto: «…»» + **riga avvisi** (`warnings[]`: icona `Warning` 16 + testo `--rf-ink`, uno per riga) + azioni *Ripassa a penna* / *Modifica* / *Scarta*. Saldo: bozza di pagamento o di lezione già finita → «**sarà** deve 100,00 €» (saldo dello studente dopo la conferma); bozza di lezione futura → cella vuota e nota «Bozza · programmata: non entra subito nel saldo» | testo `--rf-pencil`, `pencil-draft` su uno pseudo-elemento a 2 px dal bordo. **Non** entra nei totali |
| **Cambio tariffa** (da `student.rates`) | icona `ArrowsClockwise` · «Tariffa da 20,00 a 22,00 €/h per le lezioni da questa data» | riga bassa 40 px, fondo `--rf-paper`, 14 px |
| **Riporto** (solo se il registro è mostrato da una data in poi) | «Riporto al 27 set» + saldo prima della riga più vecchia mostrata | Literata italic, doppia riga sotto |

Non esistono righe «annullata» o «da segnare»: una lezione che non c'è stata si **elimina**.
Saldo progressivo: `DEVE 67,00 €` (caption 11 px maiuscola + Plex), colore del significato. Righe più recenti in alto; la **prima riga è sempre la riga di Matita** (§9.13), poi le bozze, poi le programmate, poi il resto.
Interazioni: clic/tap su una riga → sheet/dialog di modifica (lezione: `GET /lessons/{id}`, con le note; pagamento: `GET /payments/{id}`); su desktop hover mostra a destra «Modifica · ⋯» (menu lezione: Duplica la settimana dopo, Duplica per un altro studente, Elimina; menu pagamento: Elimina). Elimina chiede conferma dicendo l'effetto: «Eliminare la lezione di lun 5 ott? Il saldo passa da deve 67,00 € a deve 23,00 €. Resta traccia nello storico modifiche.» / per una programmata «…Il saldo non cambia.» Swipe su mobile: **no** (gesto nascosto, conflitti con lo scroll).
Calendar sulla riga (`calendar.status`): `error` → icona `CloudSlash` 16 accanto all'orario + `calendar.error` in nota e link «Risincronizza in Impostazioni»; `synced` → nessun segno in riga (`CloudCheck` solo nel dettaglio della lezione); `pending`/`off` → niente.

### 9.7 Badge saldo

h 24, padding 3/8, raggio 3, etichetta Schibsted 600 12 px + importo Plex 500 13 px.
`Ti deve 120,00 €` (fondo `--rf-debito-wash`, testo `--rf-debito`) · `Credito 40,00 € · ≈ 2 h` (wash/credito; «≈» = icona `ApproximateEquals` 14 px, tempo da `credit_minutes`) · `In pari` (filetto interno `--rf-rule-strong`, testo `--rf-ink-2`) · `Bozza` (`pencil-dash`, testo grafite).
Nei listati lunghi (Conti aperti) si usa la forma **senza fondo**: parola maiuscola 12 px + importo Plex 16/500 colorati.

### 9.8 Elemento lista studente

Dati: `StudentSummary`. h ≥ 64 px. Sinistra: `display_name` Schibsted 500 16 px; sotto 14 px `--rf-ink-3`: classe (`grade`, o `school` se manca) · «prossima gio 8 ott, 15:00» (`next_lesson`) oppure «ultima lun 5 ott» (`last_lesson_date`). Destra: saldo (forma senza fondo; credito con «≈ H h MM min»). Freccia `CaretRight` 20 px `--rf-ink-3`. Tutta la riga è un link alla scheda. Le materie non compaiono: lo studente ha solo una materia abituale e la lista non la riceve.

### 9.9 Voce agenda del giorno

Dati: `Lesson`. Griglia `58 px | 1fr | auto`. Ora inizio Plex 16/500, fine sotto Plex 12 `--rf-ink-3`. Nome 600 16 px, sotto «Materia · tra 40 min» con «tra 40 min» su evidenziatore se < 3 h; tra inizio e fine «in corso» su evidenziatore. In Agenda le lezioni già finite (nel saldo) hanno il testo in `--rf-ink-2`, le programmate in `--rf-ink`: nessun altro segno, perché una lezione finita entra nel saldo da sola. Separatore di giorno: caption `MER 7 OTT`.

### 9.10 Stati vuoti

Tono: una frase che dice cosa succede + una azione. Nessuna illustrazione 3D. Grafica ammessa: **la riga di Matita vuota** o un frammento di 6 righe tratteggiate («pagina bianca»).
- Studenti: «Nessuno studente. Inizia dal primo: nome e tariffa bastano.» [Aggiungi studente]
- Registro: «Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo.»
- Oggi senza lezioni nei prossimi 7 giorni: «Nessuna lezione in programma nei prossimi 7 giorni.» + «Aggiungi una lezione».
- Conti tutti in pari: «Tutti in pari.» (in `--rf-ink-2`, nessuna festa).
- Mese senza lezioni finite: «ottobre 2026 · nessuna lezione svolta finora.»
- Storico modifiche vuoto: «Nessuna modifica registrata.»

### 9.11 Toast

Fondo `--rf-ink`, testo `--rf-on-ink` 15 px, raggio 6, h ≥ 48, max 420 px; in basso al centro sopra la tab bar (mobile) / in basso a sinistra (desktop). Durata 5 s, 8 s se contiene «Annulla»; pausa all'hover/focus. `role="status"`. Esempi: «Lezione registrata · nel saldo [Annulla]», «Lezione programmata per gio 8 ott [Annulla]», «Pagamento di 100,00 € registrato [Annulla]», «12 lezioni in coda per Google Calendar». «Annulla» su una creazione = `DELETE` di ciò che si è appena creato (lo storico lo registra); su una modifica = `PATCH` con i valori di prima. Errori **non** sono toast: restano accanto al campo o nella riga.

### 9.12 Dialog e bottom sheet

- **Mobile**: bottom sheet, angoli superiori 14 px, maniglia 36×4 px `--rf-rule-strong`, titolo Literata `display-m`, contenuto scrollabile, **barra azioni fissa in basso** (primario a destra, piena larghezza se unico) sopra la safe-area. Altezza: automatica fino al 92 % dello schermo. Chiusura: Annulla, tap sul velo, swipe giù sulla maniglia; se ci sono modifiche → conferma «Scartare le modifiche?».
- **Desktop**: dialog 560 px centrato a 12 vh dall'alto, raggio 6, `--rf-shadow-sheet`; Esc chiude. I form lezione/pagamento possono aprirsi anche **in linea** nel registro (desktop) come riga espansa.
- Focus intrappolato, ritorno del focus all'elemento che ha aperto.
- **Conferma distruttiva** (Elimina lezione/pagamento/studente/tariffa/materia, Scollega Calendar): dialog piccolo (mobile: sheet basso) con titolo-domanda, **una frase sull'effetto** con i numeri veri («Il saldo passa da deve 67,00 € a deve 23,00 €.»), [Annulla] filo a sinistra e il bottone **Pericolo** a destra con il verbo («Elimina lezione»). Mai «Sei sicuro?» da solo. L'errore del server resta nel dialog (nota con `Warning` sopra i bottoni).

### 9.13 Matita — riga di comando e card

**Posizione**: (a) prima riga del registro nella scheda studente (il contesto «studente» è implicito); (b) sotto il titolo in «Oggi» su desktop; (c) su mobile, barra fissa sopra la tab bar in tutte le schermate principali, con a destra il bottone quadrato «+» (modulo manuale). **Cmd K / Ctrl K** mette a fuoco la riga della pagina; dove non c'è (Impostazioni) apre la riga in un dialog in alto. Non esiste una bolla flottante.

**Anatomia**: icona `PencilSimpleLine` 20 px grafite · campo Literata italic 17 px (16 px su mobile) · scorciatoia in `<kbd>` Plex 12 `--rf-ink-3` (icona `Command` 12 px + «K» su Apple, «Ctrl K» altrove; solo desktop, nascosta quando c'è testo) · bottone «+». Bordo inferiore 1 px `--rf-ink-3`; h 56.

**Dati** (`POST /assistant/messages`, docs/05 e docs/06): `messages` = la conversazione di questa riga (max 20 turni, l'ultimo è del tutor, ≤ 2000 caratteri: contatore «1.840/2000» quando ne mancano ≤ 200); `context` = `{student_id}` nella scheda studente + `today` locale. Risposta `{reply, drafts[], refused, usage}`. La conversazione si azzera con Esc a riga vuota o cambiando pagina; nessuna cronologia salvata sul server. La riga esiste solo se `/public/config` dice `assistant_available: true`.

| Stato | Quando | Cosa si vede | Testi |
|---|---|---|---|
| **Inattiva** | — | placeholder grafite | registro: «Scrivi una riga… «oggi 16:30–18 matematica, equazioni»» · Oggi: «Scrivi una riga… «ieri 15–16:30 matematica con Luca»» · mobile: «Scrivi a Matita…» |
| **Scrittura** | — | testo inchiostro; sotto, 13 px: «Invio per proporre · Esc per annullare»; su mobile il bottone «+» diventa «Invia» (inchiostro) | — |
| **Sta pensando** | richiesta in corso (il server chiude entro 60 s) | testo bloccato in grafite; tratto ondulato sotto la riga (§8); `aria-live="polite"` | «Matita sta scrivendo…» su evidenziatore |
| **Proposta lezione / pagamento** | `drafts[]` di tipo `lesson` / `payment` | nella scheda studente: **riga bozza** al suo posto nel registro (§9.6); altrove: **card a matita** sotto la riga. Sopra i campi la frase scritta, così com'è («Matita ha letto: «…»», Literata italic `--rf-ink-2`; l'API non dice quali parole ha usato, quindi niente evidenziatore sulle singole parole). Campi della bozza: lezione → Studente, Giorno, Orario + durata, Materia, Argomento, Note, Importo («30,00 € a 20,00 €/h», calcolati dal server); pagamento → Studente, Importo, Giorno, Come, Nota. **Riga avvisi**: ogni `warnings[]` su una riga, icona `Warning` 16 + testo `--rf-ink` 14 px (es. «Data nel futuro: la lezione sarà programmata.», «Esiste già una lezione con Luca il 06/10 alle 15:00.», «Importo non indicato nel messaggio: verificalo.»). Azioni *Ripassa a penna* · *Modifica* · *Scarta* | intestazione «Matita propone» |
| **Più proposte** | 2–5 bozze | elenco di card + «Ripassa tutte a penna (3)» (solo lezioni e pagamenti; si confermano una alla volta e ci si ferma al primo errore, le altre restano a matita) | — |
| **Proposta messaggio** | bozza `message` | card a matita: intestazione da `recipient_hint`, testo modificabile in linea; azioni secondo `channel`: sempre *Copia*; `whatsapp` → *WhatsApp* (numero e regole in §7: solo nella scheda dello studente, sennò `https://wa.me/?text=…`; l'etichetta dice a chi va: «WhatsApp · 347 512 0896»); `email` → *Email* (`mailto:` a `guardian_email` o `email` dello studente nel contesto, altrimenti senza destinatario); `sms` → solo *Copia*. Niente parte da sola | «Promemoria per la mamma di Marco» |
| **Risposta** | `refused: false` senza bozze | **nota a margine**: filetto sinistro 2 px inchiostro, domanda in caption sopra, `reply` in Literata italic 16/26; markdown limitato (grassetto → Schibsted 600, elenchi). Nessun link calcolato: la risposta è solo testo. Le domande di chiarimento («Ci sono due Luca: Bianchi e Moretti. Quale intendi?») sono risposte come le altre: si risponde nella stessa riga e la conversazione continua; sotto, link quieto «oppure usa il modulo» | «Giulia ti deve 67,00 €: 23,00 € rimasti dopo il bonifico del 2 ottobre e la lezione di lunedì 5 (44,00 €).» |
| **Non capito** | `refused: false`, nessuna bozza, testo fisso del server | è una **Risposta** (stessa nota, nessuno stato a parte): l'interfaccia mostra `reply` così com'è e il link «oppure usa il modulo» | «Non sono riuscito a preparare una risposta affidabile. Riprova con una richiesta più semplice, per esempio: «quanto mi deve Giulia?»» |
| **Fuori ambito** | `refused: true` | nota con icona `Prohibit`; il testo è **sempre** `reply` del server (fisso, docs/06 §3), mai scritto nel frontend | «Posso aiutarti solo con il tuo registro: lezioni, pagamenti, saldi e messaggi per studenti e famiglie. Prova per esempio: «quanto mi deve Giulia?»» |
| **Quasi al limite** | `usage.requests_today ≥ usage.daily_limit − 10` | caption 13 px `--rf-ink-3` sotto la riga | «Ancora 8 richieste a Matita oggi.» |
| **Limite raggiunto** | 429 `rate_limited` | nota con `HourglassMedium`; riga disabilitata fino a mezzanotte **ora italiana** (il contatore è su Europe/Rome); il testo resta nel campo | `detail` del server («Hai raggiunto il limite di 60 richieste a Matita per oggi. Riprova domani.») + «I moduli funzionano come sempre.» |
| **Matita non risponde** | 502 `upstream_error` (provider in errore o oltre 60 s) | nota con `CloudSlash`; il testo resta nel campo | «Matita non risponde in questo momento. La riga è ancora nel campo. [Riprova]» |
| **Offline** | richiesta non partita / rete assente | nota con `CloudSlash` | «Sei offline o il server non risponde. La riga è ancora nel campo. [Riprova]» |
| **Non disponibile** | `assistant_available: false` o 503 | nessuna riga di Matita; al suo posto (Oggi, scheda) una riga quieta 14 px `--rf-ink-3` con `PencilSimpleSlash`; nessuna scorciatoia Cmd/Ctrl K; su mobile la barra mostra solo il «+» | «Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.» |

**Ripassa a penna** = `POST /lessons` o `POST /payments` con l'header `X-RipetiFlow-Source: assistant` (lo storico modifiche la segna «da Matita»). Animazione §8, poi toast: lezione già finita → «Lezione registrata · nel saldo [Annulla]»; lezione futura → «Lezione programmata per gio 8 ott alle 15:00 [Annulla]» e la riga diventa **Programmata** (il saldo resta com'è, cambia «Previsto»); pagamento → «Pagamento di 50,00 € registrato [Annulla]». Se il server risponde 422 su un campo, la bozza resta a matita e si apre il modulo precompilato con l'errore sul campo (§9.2). Tastiera: Cmd/Ctrl + Invio conferma la proposta a fuoco; Esc la scarta.

**Perimetro** (docs/06 §3): Matita prepara solo bozze di **lezioni**, **pagamenti** e **messaggi**, e risponde sui dati del tutor. Non modifica né elimina righe già scritte (per correggere si apre la riga), non crea studenti o materie, non salva da sola, non vede dati di altri utenti. Gli esempi nei placeholder e negli stati vuoti restano dentro questo perimetro; al primo accesso, senza studenti, nessun esempio di Matita.

**Voce**: Matita parla in prima persona **al maschile**, come i testi fissi del server («Non sono riuscito…»); l'interfaccia ne parla in terza persona senza aggettivi («Matita sta scrivendo», «Matita propone»). Asciutta, cordiale, senza emoji.

### 9.14 Navigazione

- **Mobile**: tab bar 4 voci (Oggi · Studenti · Agenda · Altro), icona 22 + etichetta 12/500; attiva = inchiostro + barretta 3 px in alto; inattive `--rf-ink-3`. Sopra: barra di Matita.
- **Desktop**: barra 64 px: wordmark a sinistra · Oggi / Studenti / Agenda (link testuali 15/500, attivo sottolineato 2 px inchiostro, offset 6 px; area cliccabile alta 44) · a destra «Matita» + `<kbd>` (icona `Command` + K, o «Ctrl K») come bottone filo (assente se Matita non è disponibile) e avatar con menu (Impostazioni, Esci).
- Rotte: `/` landing · `/accedi` · `/auth/callback` · `/oggi` · `/studenti` · `/studenti/:id` · `/agenda` · `/impostazioni` · qualunque altra → pagina non trovata (§9.15).

### 9.15 Caricamento, errori, pagine mancanti

Componenti comuni; dove e con quali testi: 03 §10.
- **Righe-scheletro**: barre statiche `--rf-paper-sunk` alte 12 px (raggio 0) nella griglia vera della lista o del registro, larghezze 40 / 70 / 25 %, max 4 righe; compaiono solo se il caricamento dura più di 300 ms; contenitore con `aria-busy="true"` e testo nascosto «Caricamento…». Mai animate.
- **Banda di errore di caricamento**: sotto il titolo della pagina, filetto superiore 1 px `--rf-rule-strong`, icona `CloudSlash` 20 + una frase in `--rf-ink` + link-bottone «Riprova» (area 44 px). Se ci sono dati in cache restano visibili in `--rf-ink-2` e la frase dice di quando sono («Le informazioni sono delle 9:12.»). Mai una pagina vuota con solo l'errore se esiste una cache.
- **Nota d'errore in un modulo**: icona `Warning` in `--rf-danger` + testo `--rf-ink` 14 px sopra la barra azioni; il modulo resta aperto e compilato.
- **Pagina non trovata**: titolo Literata `display-m`, una frase, un link d'inchiostro per tornare. Niente illustrazioni né codici d'errore in vista.

---

## 10. Accessibilità (regole non negoziabili)

1. **Contrasto**: testo ≥ 4,5:1, controlli ≥ 3:1 (tabella §4). Nessun testo su `--rf-rule` o `--rf-margin`.
2. **Mai solo colore**: debito/credito/bozza hanno parola o forma (WCAG 1.4.1).
3. **Target** ≥ 44×44 px; 8 px minimi tra target adiacenti su mobile.
4. **Focus visibile** ovunque con `:focus-visible` (in `tokens.css`, layer `base`): contorno inchiostro 2 px staccato 2 px dal bordo + alone evidenziatore (`box-shadow` 5 px) che riempie lo stacco e sporge 1 px oltre il contorno. È tutto **fuori** dal bordo: il bordo rosso di un campo in errore resta visibile. Mai `outline: none` senza sostituto.
5. **Tastiera**: tutto raggiungibile; Cmd K / Ctrl K riga Matita; `N` nuova lezione, `P` nuovo pagamento nella scheda studente (solo se il focus non è in un campo); Esc chiude sheet/dialog; frecce nei segmented.
6. **Semantica**: registro come `<table>` vera su desktop (`<caption>` «Registro di Giulia Ferri»), lista `<ol>` su mobile; intestazioni con `scope="col"`. Importi letti con parola: `aria-label="ti deve 67 euro"` sul saldo.
7. **Live region**: `aria-live="polite"` per «Matita sta scrivendo», per il saldo aggiornato e per i toast.
8. **Lingua**: `<html lang="it">`; testi d'esempio inglesi vietati.
9. **Zoom 200 %** e testo ingrandito di sistema: nessun testo tagliato; le colonne del registro passano al layout mobile sotto 760 px di viewport effettiva.
10. **Movimento ridotto** rispettato (§8). Nessun contenuto lampeggia > 3 volte al secondo.
11. **Form**: errori collegati con `aria-describedby`, `aria-invalid="true"`, messaggio che dice come correggere.
12. Input 16 px minimo (iOS non zooma).
