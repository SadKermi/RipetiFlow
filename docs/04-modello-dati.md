# 04 · Modello dati

Fonte di verità: [`supabase/migrations/`](../supabase/migrations/). Applicate al progetto Supabase
`ripetiflow` (ref `afaowzrghvqnqcovxtqu`, eu-central-1). Test di comportamento:
[`supabase/tests/domain_test.sql`](../supabase/tests/domain_test.sql).

```
auth.users 1─1 app.profiles 1─┬─* app.subjects
                              ├─* app.students 1─┬─* app.student_rates   (storico tariffe)
                              │                  ├─* app.lessons ─*─1 app.subjects
                              │                  └─* app.payments
                              ├─* app.activity_log      (append-only, scritto dai trigger)
                              ├─1 app.google_calendar_links (refresh token cifrato, colonna non leggibile dal client)
                              ├─* app.calendar_outbox   (coda di sync verso Google)
                              └─* app.assistant_usage   (contatori giornalieri Matita)

Viste (security_invoker): app.student_balances, app.ledger_entries
Funzioni: app.rate_for(student, date)
```

## Regole chiave

| Regola | Dove è garantita |
|---|---|
| Ogni riga appartiene a un solo tutor | RLS `tutor_id = auth.uid()` su tutte le tabelle + FK composte `(student_id, tutor_id)` che impediscono riferimenti incrociati (i controlli FK ignorano l'RLS) |
| Lezione nello stesso giorno, minuti interi | `check (end_time > start_time)`, `check (seconds = 0)` |
| Importo lezione = tariffa × durata, arrotondato al centesimo | colonna generata `amount_cents` |
| Tariffa congelata sulla lezione | `hourly_rate_cents` sulla lezione, riempita da `lessons_fill_rate` con `rate_for()` se non inviata |
| Saldo mai memorizzato (quindi mai incoerente) | vista `student_balances` |
| Saldo progressivo nel libro mastro | vista `ledger_entries` (window function) |
| Storico immutabile delle modifiche | trigger `log_activity` → `activity_log` (nessun permesso di scrittura per gli utenti) |
| Studente con movimenti non cancellabile | FK `no action` da lezioni/pagamenti |
| Cancellazione account pulita | cascade da `auth.users`; trigger che non registrano/accodano durante la cascata |
| Sync calendario transazionale | trigger → `calendar_outbox` nella stessa transazione |

## Convenzione del segno

`balance_cents = Σ pagamenti − Σ importi delle lezioni concluse`

| Valore | Stato | Testo UI |
|---|---|---|
| `< 0` | `debt` | "Ti deve 45,00 €" |
| `= 0` | `settled` | "In pari" |
| `> 0` | `credit` | "Credito 40,00 € · ≈ 1 h 36 min prepagate" (minuti = credito ÷ tariffa corrente × 60, arrotondati per difetto) |

Una lezione è **conclusa** quando `data + ora_fine ≤ adesso` nel fuso del tutor.
