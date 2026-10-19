# Schermate per la review di design

Catture **generate dai test end-to-end** (`frontend/e2e/`), non disegnate a mano: mostrano l'app
vera, in modalità demo, con i dati di esempio di `POST /dev/seed` e il backend con
`ASSISTANT_PROVIDER=none`. Si rigenerano (e si sovrascrivono) con `make screens`; `make e2e` non le tocca.

- `<schermata>-390.png`: telefono 390 × 844 (progetto Playwright `mobile`, touch).
- `<schermata>-1440.png`: desktop 1440 × 900 (progetto `desktop`).
- Le pagine sono catturate intere (la finestra viene allungata fino al fondo della pagina, così
  barra di Matita e tab bar restano in basso); i dialoghi e gli sheet sono catturati come si vedono
  nella finestra.
- Le date e gli orari dipendono dal giorno in cui gira il test: i dati demo sono relativi a «oggi».
  Gli importi delle schede create dai test (Irene Valli, Bruno Neri) invece sono sempre gli stessi.

Riferimenti: [03-schermate.md](../03-schermate.md) (sezione tra parentesi), [02-design-system.md](../02-design-system.md).

| Schermata | Cosa mostra | Test |
|---|---|---|
| `landing` | Landing pubblica, senza la sezione Matita (non attiva sul server) — §1 | `smoke.spec.ts` |
| `accedi` | Accesso con la sola modalità demo attiva — §2 | `smoke.spec.ts` |
| `oggi` | Oggi: prossime lezioni, conti aperti, il mese — §3 | `smoke.spec.ts` |
| `oggi-scuro` | Oggi con il tema scuro — §11 | `impostazioni.spec.ts` |
| `studenti` | Elenco studenti ordinato per saldo (tabella su desktop, lista su telefono) — §4 | `registro.spec.ts` |
| `studente` | Scheda studente con il registro (Giulia Ferri, in credito) — §5 | `registro.spec.ts` |
| `studente-nuovo` | Modulo «Nuovo studente» vuoto — §7.4 | `registro.spec.ts` |
| `studente-nuovo-errori` | Lo stesso modulo inviato vuoto: errori sui campi Nome e Tariffa — §7.4, §10.4 | `registro.spec.ts` |
| `studente-nuovo-vuoto` | Scheda appena creata: «Pagina bianca…», in pari, tariffa visibile — §5 | `registro.spec.ts` |
| `lezione-nuova` | Modulo «Nuova lezione» di ieri, con calcolo dell'importo — §7.1 | `registro.spec.ts` |
| `lezione-modifica` | Modulo «Modifica lezione» con [Elimina] e [Duplica] — §7.1 | `registro.spec.ts` |
| `studente-registro` | Registro con una lezione nel saldo e una programmata («Previsto») — §5 | `registro.spec.ts` |
| `lezione-elimina` | Conferma di eliminazione con l'effetto sul saldo — §7.5 | `registro.spec.ts` |
| `storico-modifiche` | Storico modifiche: registrata, modificata, eliminata, ricreata — §5.1 | `registro.spec.ts` |
| `pagamento` | Modulo «Pagamento ricevuto» con l'anteprima «Dopo: credito…» — §7.2 | `registro.spec.ts` |
| `tariffa` | Cambio tariffa: anteprima delle lezioni e scelta esplicita, «Salva» disattivato — §7.3 | `registro.spec.ts` |
| `studente-archivia` | Conferma «Archiviare…?» con saldo aperto — §7.5 | `registro.spec.ts` |
| `studente-archiviato` | Scheda di uno studente archiviato, con [Ripristina] — §5 | `registro.spec.ts` |
| `agenda` | Agenda della settimana: colonne su desktop, lista per giorno su telefono — §6 | `agenda.spec.ts` |
| `agenda-nuova-lezione` | Solo 1440: «+» di un giorno libero → modulo Lezione su quel giorno — §6 | `agenda.spec.ts` |
| `impostazioni` | Impostazioni: profilo, materie, Calendar non disponibile, aspetto, esporta, demo — §8 | `impostazioni.spec.ts` |
| `impostazioni-scuro` | Impostazioni con il tema scuro — §8, §11 | `impostazioni.spec.ts` |
| `materia-elimina` | Conferma «Eliminare «…»?» di una materia — §7.5 | `impostazioni.spec.ts` |
| `matita-non-attiva` | Scheda studente quando Matita non è attiva: riga di avviso, niente Promemoria — §9.4 | `matita.spec.ts` |
| `matita-bozza` | Bozza di lezione a matita nel registro (risposta del modello simulata) — §9, §11 | `matita.spec.ts` |
| `pagina-non-trovata` | Indirizzo sconosciuto, da autenticati — §10.3 | `accessibilita.spec.ts` |
| `studente-non-trovato` | `/studenti/:id` inesistente — §10.3 | `accessibilita.spec.ts` |

Come rigenerarle: `make e2e` dalla radice del repository (database `ripetiflow_e2e` nuovo, backend
in modalità demo e Vite avviati da Playwright). Per un solo test:
`cd frontend && npx playwright test e2e/registro.spec.ts -g "pagamento"`, che usa il database
locale `ripetiflow` (creato con `make db-reset`; i dati demo vengono ricreati da ogni test).
