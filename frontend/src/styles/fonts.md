# Font di RipetiFlow — cosa caricare e come

Tre famiglie, tutte su Google Fonts con licenza **SIL Open Font License 1.1**, self-hosted via Fontsource.
Versioni verificate con `npm view <pkg> version` il 6 ottobre 2026; glifi verificati il 13 ottobre 2026.

| Ruolo | Famiglia | Pacchetto npm (verificato) | Assi / pesi da caricare | `font-family` CSS |
|---|---|---|---|---|
| Display + voce di Matita | **Literata** (TypeTogether per Google) | `@fontsource-variable/literata` **5.3.0** | variabile `opsz` 7–72, `wght` 200–900, roman + italic → file `opsz.css` e `opsz-italic.css` | `"Literata Variable"` |
| Interfaccia | **Schibsted Grotesk** (Bakken & Bæck per Schibsted) | `@fontsource-variable/schibsted-grotesk` **5.3.0** | variabile `wght` 400–900, solo roman → `index.css` (= `wght.css`) | `"Schibsted Grotesk Variable"` |
| Importi, ore, scorciatoie | **IBM Plex Mono** (Mike Abbink / Bold Monday per IBM) | `@fontsource/ibm-plex-mono` **5.3.0** (statico: Plex Mono non è variabile) | pesi **400** e **500**, solo roman, solo subset latin → `latin-400.css`, `latin-500.css` | `"IBM Plex Mono"` |

Icone (non font, ma stesso capitolo di installazione): `@phosphor-icons/react` **2.1.10**, peso `regular`.

## Installazione

```bash
npm i @fontsource-variable/literata @fontsource-variable/schibsted-grotesk @fontsource/ibm-plex-mono
```

In `src/main.tsx` (o nell'entry CSS), **prima** di `tokens.css`:

```ts
import "@fontsource-variable/literata/opsz.css";         // roman, opsz + wght
import "@fontsource-variable/literata/opsz-italic.css";  // italic: voce di Matita, argomenti
import "@fontsource-variable/schibsted-grotesk";         // wght 400–900
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
```

> Non importare `@fontsource/ibm-plex-mono` senza percorso: caricherebbe tutti i pesi (100–700) e il cirillico.
> Non serve il peso 600+ di Plex Mono: i totali usano 500.

## Impostazioni obbligatorie

```css
.font-display { font-optical-sizing: auto; }          /* Literata sceglie da sola l'occhio ottico */
.tabular, .font-money { font-variant-numeric: tabular-nums lining-nums; }
.font-display.num { font-variant-numeric: tabular-nums lining-nums; } /* saldo grande: le cifre non "ballano" quando cambiano */
```

- Pesi usati davvero: Literata 400 (titoli), 500 (saldo grande), 400 italic (Matita/argomenti); Schibsted 400 / 500 / 600; Plex Mono 400 / 500. Non usare grassetti > 600 nell'interfaccia.
- `font-display: swap` è già nei CSS di Fontsource. Precaricare solo il file latin di Schibsted (è il testo del primo paint):
  `<link rel="preload" as="font" type="font/woff2" crossorigin href="…/schibsted-grotesk-latin-wght-normal.woff2">` (percorso generato dal bundler; con Vite usare `?url`).
- Fallback metrici: i token includono `Georgia` / `system-ui` / `ui-monospace`. Facoltativo: generare `size-adjust` con `fontaine` per ridurre il layout shift.

## Glifi che i tre font NON hanno (verificato con fontTools sui file latin)

Literata, Schibsted Grotesk e IBM Plex Mono (subset latin di Fontsource / Google Fonts) non contengono
`≈` `→` `←` `⌘` `↵` `↻` `✎` `▾` `▸` `✓`. Se finiscono in un testo dell'interfaccia vengono disegnati
da un font di sistema, con peso e metriche diversi accanto agli importi. Regola:

| Serve | In UI si usa |
|---|---|
| freccia (`Inizio → Fine`, «Apri il registro →», `20,00 → 22,00`) | icona Phosphor `ArrowRight` 16 px, oppure le parole («da 20,00 a 22,00 €/h») |
| scorciatoie (`⌘K`, `⌘↵`) | `<kbd>` con icona `Command` + «K» su Apple, testo «Ctrl K» altrove; Invio si scrive «Invio» |
| circa (`≈ 1 h 49 min`) | forma compatta: icona `ApproximateEquals` 14 px + durata, con `aria-label="circa 1 h 49 min"`; nelle frasi la parola **circa** |
| menu a tendina, espandi, fatto | icone `CaretDown`, `CaretRight`, `Check` |

Presenti e usabili come testo: `–` (U+2013) `—` `«` `»` `€` `ª` `º` `…` `·` `×` `÷` `°` `’`.
Le frecce dentro testi che arrivano dal server (es. `summary` dello storico: «fine 16:30 → 17:00»)
si mostrano sostituendo ` → ` con l'icona `ArrowRight` al momento del rendering.

## Perché questi tre (sintesi — dettagli in `docs/design/02-design-system.md` §3)

- **Literata**: serif da lettura nata per gli e-book (Google Play Libri) → è letteralmente un carattere da *libro*; asse ottico 7–72 quindi regge sia 64 px (titoli, saldo) sia 16 px in corsivo (voce di Matita). Occhio medio alto (x-height 0,507 em) → più robusto di Newsreader (0,426) a corpo piccolo.
- **Schibsted Grotesk**: grottesco editoriale nato per un gruppo editoriale di quotidiani; x-height 0,527 em (alta → leggibile sul telefono a fine lezione), cifre tabellari disponibili, carattere riconoscibile senza essere decorativo. Non è Inter, Roboto, Poppins né Montserrat. Zero senza segni.
- **IBM Plex Mono**: monospaziato con genealogia da macchina per scrivere (IBM Selectric) → richiama il nastro della calcolatrice da ufficio; virgola e punto larghi come le cifre → allineamento decimale perfetto in colonna. Lo **zero ha un punto centrale** (il glifo ha 3 contorni; il subset non ha alternative senza punto): in ogni «,00» si vedono due puntini, più discreti della barra e utili a non confondere 0 e O nei campi importo.

Scartati (provati a schermo): Atkinson Hyperlegible Next/Mono e Red Hat Mono (zero **barrato**: la barra pesa più del punto di Plex in ogni «,00»), Bodoni Moda (filetti troppo sottili sotto 40 px su schermi a bassa densità), Newsreader (x-height bassa per il corsivo a 16 px), Inter / Geist / Space Grotesk / Instrument Serif / Fraunces (troppo associati a interfacce generate).
