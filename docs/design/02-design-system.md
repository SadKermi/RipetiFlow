# RipetiFlow — Design system «Registro» v1.0

*6 ottobre 2026 · Implementazione: `frontend/src/styles/tokens.css` (+ `fonts.md`) · Prova visiva: [specimen.html](specimen.html) / `specimen.jpg`*

Questo documento è per chi sviluppa. Ogni valore qui ha un token in `tokens.css`; se manca un token, il valore non va inventato: va chiesto.

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
| Gutter laterale | 16 px | 24 px | 40 px (`--rf-gutter`) |
| Larghezza contenuto | 100 % | 100 % | max 1200 px (`--rf-content-max`), centrato |
| Navigazione | tab bar in basso 64 px + safe-area | tab bar | barra superiore 64 px |
| Scheda studente | una colonna | una colonna | frontespizio 336 px (`--rf-aside-w`) + registro fluido (max 880 px) con 48 px di gap |

### Misure fisse

| Token | Valore | Regola |
|---|---|---|
| `--rf-touch` | 44 px | ogni elemento cliccabile ha un'area ≥ 44×44 px (anche icone: padding attorno) |
| `--rf-control-h` | 44 px | input, select, bottoni standard |
| `--rf-control-h-sm` | 36 px | **solo desktop** (azioni dentro le righe del registro). Mai su mobile |
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
| **Importi e orari in colonna** | **IBM Plex Mono** (400, 500) | `--rf-font-money` | Monospaziato con genealogia da macchina per scrivere: richiama il nastro della calcolatrice. Zero senza barra; virgola e punto larghi come le cifre → **allineamento decimale perfetto**. |

Installazione e pacchetti npm verificati: `frontend/src/styles/fonts.md`.

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
- Sull'evidenziatore si scrive **solo** con `--rf-ink` (in scuro `--rf-ink-2` scende a 4,30: vietato).
- `--rf-rule` e `--rf-margin` non devono mai essere l'unico modo di capire qualcosa.
- **Nessun altro colore.** Niente verde «successo» (un saldo a zero è «in pari», in `--rf-ink-2`), niente arancio «warning» (gli avvisi usano icona + testo inchiostro). Gli errori usano `--rf-danger` (= debito) **sempre con icona e testo**.

### Semantica

| Significato | Colore | Forma obbligatoria oltre al colore |
|---|---|---|
| **Ti deve** (debito dello studente) | `--rf-debito` | parola «deve» / «ti deve» |
| **In credito** (anticipo) | `--rf-credito` | parola «credito» + ore equivalenti («≈ 2 h») |
| **In pari** | `--rf-ink-2` | parola «in pari» |
| **Bozza di Matita** | `--rf-pencil` + tratteggio + campitura | etichetta «Bozza» o «Matita propone» |
| **Inchiostro** (confermato) | `--rf-ink` | — è lo stato normale |
| **Oggi / adesso / token riconosciuto** | `--rf-highlight` (fondo, metà bassa della riga) | testo esplicito («tra 40 min», «oggi») |
| **Focus** | contorno 2 px `--rf-ink` + alone 3 px `--rf-highlight` | — |
| **Errore** | `--rf-danger` | icona `warning` + messaggio |

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
| Tratteggio bozza | disegnato con 4 `linear-gradient` (utility `pencil-dash`): trattino 6 px, vuoto 5 px, spessore 1,5 px — **non** `border-style: dashed` (passo diverso per browser, non animabile) |

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
| Pagamento | `Coins` · contanti `Money` · bonifico `Bank` |
| Lezione / orario | `Clock` |
| Cambio tariffa | `ArrowsClockwise` |
| Promemoria | `ChatText` · invio `WhatsappLogo` · `Copy` |
| Annulla ultima azione | `ArrowUUpLeft` |
| Elimina | `Eraser` (cancellare a matita) — `Trash` solo per «Elimina studente» |
| Sincronizzato con Calendar | `CloudCheck` · errore `CloudSlash` |
| Fuori ambito | `Prohibit` · limite `HourglassMedium` · errore `Warning` |

---

## 7. Formattazione dei dati (it-IT)

Implementare **una sola** libreria di formattazione (`src/lib/format.ts`) e usarla ovunque.

```ts
const eur = new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR",
  useGrouping: "always",          // OBBLIGATORIO: senza, 1234,50 € esce senza punto
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const money = (cents: number) => eur.format(Math.abs(cents) / 100); // "1.234,50 €" (U+00A0 prima di €)
export const amount = (cents: number) =>                                     // colonne: senza simbolo
  new Intl.NumberFormat("it-IT", { useGrouping: "always", minimumFractionDigits: 2 }).format(Math.abs(cents) / 100);
```

| Dato | Formato | Esempio | Note |
|---|---|---|---|
| Denaro | sempre 2 decimali, punto migliaia, virgola decimali, «€» dopo con U+00A0 | `1.234,50 €` | Gestire **centesimi interi** lato dati; mai float. |
| Saldo | parola + importo **senza segno** | «ti deve 67,00 €» · «credito 40,00 € ≈ 2 h» · «in pari» | Ore equivalenti = credito ÷ tariffa attuale, arrotondate alla mezz'ora, prefisso «≈». |
| Tariffa | importo + «/h» | `22,00 €/h` | |
| Durata | `H h MM` in colonna, `H h MM min` in frase | `1 h 30` · `1 h 30 min` · `45 min` · `2 h` | Mai «1,5 h» in UI. |
| Orario | 24 h, due cifre | `15:00` · intervallo `15:00–16:30` | Trattino lungo `–` (U+2013) senza spazi. |
| Data in riga | giorno abbreviato + numero + mese abbreviato | `mar 6 ott` | Anno solo se ≠ anno corrente: `lun 28 set 2025`. |
| Data in titolo | esteso | `martedì 6 ottobre` | Minuscolo. |
| Relativo | entro ±2 giorni | `ieri` · `oggi` · `domani` · `dopodomani` | `Intl.RelativeTimeFormat("it",{numeric:"auto"})`. |
| Tempo che manca | < 3 h | `tra 40 min` · `tra 2 h 10 min` · `adesso` | Aggiornare ogni minuto. |
| Settimana | da lunedì | `6–12 ott 2026` | |
| Telefono | gruppi 3-3-4 | `347 512 0896` | Link `tel:` |
| Classe | ordinale femminile/maschile | `3ª liceo scientifico` | Testo libero, nessun menu. |
| Elenchi | `Intl.ListFormat` | `Luca, Giulia e Marco` | |

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
- Il saldo che cambia dopo una conferma: il numero si sostituisce e l'evidenziatore compare dietro per 1,2 s poi sfuma in 240 ms.
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

Stati: hover inchiostro = `color-mix(in oklab, var(--rf-ink) 86%, var(--rf-paper))`; filo/quieto hover = fondo `--rf-paper-sunk`; pressed = `translateY(1px)`; disabled = opacità 0,4 e `cursor:not-allowed` (mai solo grigio senza spiegazione: affiancare il motivo); loading = etichetta resta, icona sostituita da 3 puntini statici, `aria-busy="true"`; focus = contorno + alone (§4).

### 9.2 Campi

- **Etichetta sopra**, Schibsted 500 14 px `--rf-ink-2`, 6 px dal campo. Mai placeholder come etichetta.
- Campo: h 44, padding 0 12, fondo `--rf-paper-raised`, bordo 1 px `--rf-control`, raggio 3, testo 16 px.
- Aiuto sotto: 13/18 `--rf-ink-3`. Errore: bordo 2 px `--rf-debito` (inset), messaggio con icona `Warning` in `--rf-debito`, `aria-describedby`.
- Stati: default, hover (bordo `--rf-ink-3`), focus (contorno + alone), compilato, errore, disabilitato (fondo `--rf-paper-sunk`, testo `--rf-ink-3`), sola lettura (nessun bordo, fondo sunk).
- **Importo**: Plex Mono 18 px 500, «€» fisso a destra in `--rf-ink-3`, `inputmode="decimal"`, accetta virgola o punto, formatta al blur.

### 9.3 Data e ora

- **Giorno**: campo che mostra `mar 6 ott 2026` + scorciatoie sotto come chip-testo: `Oggi · Ieri · Altro…`. Su mobile «Altro…» apre il date picker nativo (`<input type="date">`); su desktop un calendario 7 colonne lun→dom, oggi con evidenziatore, giorno scelto con fondo `--rf-ink`.
- **Orario**: due campi `Inizio → Fine` affiancati, Plex Mono, `inputmode="numeric"`, accettano `15`, `1500`, `15:00`, `15.00`. Sotto: durata calcolata e importo («1 h 30 min · 33,00 € a 22,00 €/h»). Errore se fine ≤ inizio («La fine deve essere dopo l'inizio»).
- Durate rapide sotto «Fine»: `+1 h · +1 h 30 · +2 h`.

### 9.4 Select / combobox studente e materia

- Combobox con ricerca: si digita, la lista filtra; Invio sceglie il primo. Su mobile apre un **sheet** a tutta altezza con campo di ricerca in alto e righe da 56 px.
- **Materia**: menu dalle materie dell'utente (Impostazioni), ordinate per uso con lo studente scelto; prima voce = ultima materia fatta con quello studente.
- Opzione finale «+ Nuova materia» / «+ Nuovo studente» in grafite.

### 9.5 Segmented control

- Contenitore: bordo 1 px `--rf-control`, raggio 3, padding 2, fondo `--rf-paper-raised`. Segmento attivo: fondo `--rf-ink`, testo `--rf-on-ink`. h 44 su mobile (38 nel blocco componenti desktop).
- Usi: **Contanti | Bonifico**, **Sistema | Chiaro | Scuro**, filtro studenti **Tutti | Ti devono | In credito**.
- Ruolo ARIA: `radiogroup` con frecce sinistra/destra.

### 9.6 Righe del registro (componente centrale)

Griglia desktop: `Data 104 px | Voce 1fr | Durata 76 | Lezione 100 | Pagato 100 | Saldo 136` (allineamento a destra per le ultime 4). Mobile: `Data 72 | Voce 1fr | Importo auto`, saldo progressivo su seconda riga sotto la voce.

| Variante | Contenuto | Stile |
|---|---|---|
| **Lezione** | Data `lun 5 ott` + orario `17:00–19:00` (Plex 12) · **Materia** (600) · *argomento* (Literata italic) · nota 13 px · durata · importo in **Lezione** · saldo progressivo | inchiostro |
| **Pagamento** | icona `Bank`/`Money` · **Pagamento** · metodo · nota · importo in **Pagato** in `--rf-credito` | inchiostro |
| **Bozza (matita)** | come lezione o pagamento + riga «Matita ha letto: «…»» + azioni *Ripassa a penna* / *Modifica* / *Scarta*; saldo come «**sarà** 100,00 €» | testo `--rf-pencil`, tratteggio `pencil-dash` a 2 px dal bordo, campitura `pencil-hatch`. **Non** entra nei totali |
| **Annullata** | materia barrata (1 px), nota «Annullata · non addebitata», importo «—» | `--rf-ink-3` |
| **Cambio tariffa** | icona `ArrowsClockwise` · «Tariffa da 20,00 a 22,00 €/h per le lezioni da questa data» | riga bassa 40 px, fondo `--rf-paper`, 14 px |
| **Riporto / apertura** | «Riporto al 27 set» o «Inizio registro» + saldo iniziale | Literata italic, doppia riga sotto |

Saldo progressivo: `DEVE 67,00 €` (caption 11 px maiuscola + Plex), colore del significato. Righe più recenti in alto; la **prima riga è sempre la riga di Matita** (§9.13).
Interazioni: clic/tap su una riga → sheet/dialog di modifica; su desktop hover mostra a destra «Modifica · …» (menu: Duplica, Annulla lezione, Elimina). Swipe su mobile: **no** (gesto nascosto, conflitti con lo scroll).

### 9.7 Badge saldo

h 24, padding 3/8, raggio 3, etichetta Schibsted 600 12 px + importo Plex 500 13 px.
`Ti deve 120,00 €` (fondo `--rf-debito-wash`, testo `--rf-debito`) · `Credito 40,00 € · 2 h` (wash/credito) · `In pari` (filetto interno `--rf-rule-strong`, testo `--rf-ink-2`) · `Bozza` (tratteggio grafite).
Nei listati lunghi (Conti aperti) si usa la forma **senza fondo**: parola maiuscola 12 px + importo Plex 16/500 colorati.

### 9.8 Elemento lista studente

h ≥ 64 px. Sinistra: nome Schibsted 500 16 px; sotto 14 px `--rf-ink-3`: «Matematica, Fisica · ultima lezione lun 5 ott». Destra: saldo (forma senza fondo). Freccia `CaretRight` 20 px `--rf-ink-3`. Tutta la riga è un link alla scheda.

### 9.9 Voce agenda del giorno

Griglia `58 px | 1fr | auto`. Ora inizio Plex 16/500, fine sotto Plex 12 `--rf-ink-3`. Nome 600 16 px, sotto «Materia · tra 40 min» con «tra 40 min» su evidenziatore se < 3 h. Lezione passata e non registrata: nota grafite «Da segnare» + bottone filo 36 px «Segna» (desktop) / tap riga (mobile). Separatore di giorno: caption `MER 7 OTT`.

### 9.10 Stati vuoti

Tono: una frase che dice cosa succede + una azione. Nessuna illustrazione 3D. Grafica ammessa: **la riga di Matita vuota** o un frammento di 6 righe tratteggiate («pagina bianca»).
- Studenti: «Nessuno studente. Inizia dal primo: nome e tariffa bastano.» [Aggiungi studente]
- Registro: «Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo.»
- Oggi senza lezioni: «Oggi niente lezioni. La prossima è gio 8 ott alle 16:00 con Marco.» / «Nessuna lezione in programma.»
- Conti tutti in pari: «Tutti in pari.» (in `--rf-ink-2`, nessuna festa).

### 9.11 Toast

Fondo `--rf-ink`, testo `--rf-on-ink` 15 px, raggio 6, h ≥ 48, max 420 px; in basso al centro sopra la tab bar (mobile) / in basso a sinistra (desktop). Durata 5 s, 8 s se contiene «Annulla»; pausa all'hover/focus. `role="status"`. Esempi: «Lezione registrata · in Calendar [Annulla]», «Pagamento di 100,00 € registrato [Annulla]». Errori **non** sono toast: restano accanto al campo o nella riga.

### 9.12 Dialog e bottom sheet

- **Mobile**: bottom sheet, angoli superiori 14 px, maniglia 36×4 px `--rf-rule-strong`, titolo Literata `display-m`, contenuto scrollabile, **barra azioni fissa in basso** (primario a destra, piena larghezza se unico) sopra la safe-area. Altezza: automatica fino al 92 % dello schermo. Chiusura: Annulla, tap sul velo, swipe giù sulla maniglia; se ci sono modifiche → conferma «Scartare le modifiche?».
- **Desktop**: dialog 560 px centrato a 12 vh dall'alto, raggio 6, `--rf-shadow-sheet`; Esc chiude. I form lezione/pagamento possono aprirsi anche **in linea** nel registro (desktop) come riga espansa.
- Focus intrappolato, ritorno del focus all'elemento che ha aperto.

### 9.13 Matita — riga di comando e card

**Posizione**: (a) prima riga del registro nella scheda studente (il contesto «studente» è implicito); (b) sotto il titolo in «Oggi» su desktop; (c) su mobile, barra fissa sopra la tab bar in tutte le schermate principali, con a destra il bottone quadrato «+» (modulo manuale). **⌘K / Ctrl+K** mette a fuoco la riga della pagina; dove non c'è (Impostazioni) apre la riga in un dialog in alto. Non esiste una bolla flottante.

**Anatomia**: icona `PencilSimpleLine` 20 px grafite · campo Literata italic 17 px (16 px su mobile) · hint `⌘K` Plex 12 `--rf-ink-3` (solo desktop, nascosto quando c'è testo) · bottone «+». Bordo inferiore 1 px `--rf-ink-3`; h 56.

| Stato | Cosa si vede | Testi |
|---|---|---|
| **Inattiva** | placeholder grafite | registro: «Scrivi una riga… «oggi 15–16:30 matematica, equazioni»» · mobile: «Scrivi a Matita…» |
| **Scrittura** | testo inchiostro; sotto, 13 px: «Invio per proporre · Esc per annullare»; su mobile il bottone «+» diventa «Invia» (inchiostro) | — |
| **Sta pensando** | testo bloccato in grafite; tratto ondulato disegnato sotto la riga (§8); `aria-live="polite"` | «Matita sta scrivendo…» su evidenziatore |
| **Proposta lezione / pagamento** | riga **bozza** inserita nel registro al posto giusto (scheda studente) oppure **card a matita** sotto la riga (Oggi/mobile): frase originale con i pezzi riconosciuti **evidenziati**, campi riconosciuti (Studente, Data, Orario, Materia, Argomento, Importo), azioni *Ripassa a penna* · *Modifica* · *Scarta* | intestazione «Matita propone» |
| **Più proposte** | elenco di card (max 5) + «Ripassa tutte a penna (3)» | — |
| **Proposta messaggio** | card a matita con testo modificabile in linea, azioni *Copia* · *WhatsApp* (link `https://wa.me/<numero>?text=…` se il contatto ha un telefono) · *Modifica* | «Promemoria per la mamma di Marco» |
| **Risposta** | **nota a margine**: filetto sinistro 2 px inchiostro, domanda in caption sopra, risposta in Literata italic 16/26 con importi in Schibsted 600, link «Apri il registro →» | «Giulia ti deve 67,00 €: due lezioni dopo il bonifico di 50,00 € del 2 ottobre.» |
| **Fuori ambito** | nota con icona `Prohibit` | «Questo non lo so fare. Posso segnare lezioni e pagamenti, dirti i saldi e scrivere promemoria. Prova: «chi mi deve più di 50 €?»» |
| **Non capito / ambiguo** | nota con `Warning` + scelte | «Manca lo studente: c'è un Luca Bianchi e un Luca Moretti. [Scegli] oppure [usa il modulo].» |
| **Errore** | nota con `CloudSlash`; il testo resta nel campo | «Errore di rete. La riga non è stata salvata e resta nel campo. [Riprova]» |
| **Limite raggiunto** | nota con `HourglassMedium`; riga disabilitata fino all'orario | «Pausa fino alle 16:40. Hai usato le 30 richieste di quest'ora. I moduli funzionano come sempre.» |

**Ripassa a penna**: animazione §8, poi toast «Lezione registrata · in Calendar [Annulla]». Il saldo si aggiorna. Con tastiera: `⌘↵` conferma la prima proposta a fuoco; `Esc` scarta il focus.
Matita **non** salva mai da sola, non modifica righe d'inchiostro (può proporre una *correzione*: bozza con diff «33,00 → 22,00»), non vede dati di altri utenti.

### 9.14 Navigazione

- **Mobile**: tab bar 4 voci (Oggi · Studenti · Agenda · Altro), icona 22 + etichetta 12/500; attiva = inchiostro + barretta 3 px in alto; inattive `--rf-ink-3`. Sopra: barra di Matita.
- **Desktop**: barra 64 px: wordmark a sinistra · Oggi / Studenti / Agenda (link testuali 15/500, attivo sottolineato 2 px inchiostro, offset 6 px) · a destra «Matita ⌘K» (bottone filo) e avatar con menu (Impostazioni, Esci).

---

## 10. Accessibilità (regole non negoziabili)

1. **Contrasto**: testo ≥ 4,5:1, controlli ≥ 3:1 (tabella §4). Nessun testo su `--rf-rule` o `--rf-margin`.
2. **Mai solo colore**: debito/credito/bozza hanno parola o forma (WCAG 1.4.1).
3. **Target** ≥ 44×44 px; 8 px minimi tra target adiacenti su mobile.
4. **Focus visibile** ovunque con `:focus-visible` (contorno inchiostro 2 px + alone evidenziatore 3 px); mai `outline: none` senza sostituto.
5. **Tastiera**: tutto raggiungibile; ⌘K/Ctrl+K riga Matita; `N` nuova lezione, `P` nuovo pagamento nella scheda studente (solo se il focus non è in un campo); Esc chiude sheet/dialog; frecce nei segmented.
6. **Semantica**: registro come `<table>` vera su desktop (`<caption>` «Registro di Giulia Ferri»), lista `<ol>` su mobile; intestazioni con `scope="col"`. Importi letti con parola: `aria-label="ti deve 67 euro"` sul saldo.
7. **Live region**: `aria-live="polite"` per «Matita sta scrivendo», per il saldo aggiornato e per i toast.
8. **Lingua**: `<html lang="it">`; testi d'esempio inglesi vietati.
9. **Zoom 200 %** e testo ingrandito di sistema: nessun testo tagliato; le colonne del registro passano al layout mobile sotto 760 px di viewport effettiva.
10. **Movimento ridotto** rispettato (§8). Nessun contenuto lampeggia > 3 volte al secondo.
11. **Form**: errori collegati con `aria-describedby`, `aria-invalid="true"`, messaggio che dice come correggere.
12. Input 16 px minimo (iOS non zooma).
