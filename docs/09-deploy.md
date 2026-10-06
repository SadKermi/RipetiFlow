# 09 · Deploy (Render + Supabase)

Un solo servizio Docker (D-02): FastAPI serve `/api` e la SPA. Database e Auth restano su Supabase.

## Prerequisiti

1. Progetto Supabase `ripetiflow` con le migrazioni applicate (già fatto; per nuove migrazioni vedi la
   skill `.claude/skills/ripetiflow-migration`).
2. Client OAuth Google e provider Google in Supabase: [`08-setup-google.md`](08-setup-google.md).
3. Una chiave API del provider dell'assistente (default OpenAI, modello `gpt-6-luna`).

## Valori da raccogliere

| Variabile | Dove trovarla |
|---|---|
| `DATABASE_URL` | Supabase → **Connect** → *Session pooler* (porta **5432**, host `aws-…-eu-central-1.pooler.supabase.com`, utente `postgres.afaowzrghvqnqcovxtqu`). Usa il pooler: la connessione diretta è solo IPv6. Formato `postgresql://postgres.afaowzrghvqnqcovxtqu:<password>@<host>:5432/postgres` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → *Publishable key* (`sb_publishable_…`) |
| `PUBLIC_APP_URL` | URL del servizio (es. `https://ripetiflow.onrender.com`) |
| `TOKEN_ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` — **conservala**: se la perdi, gli utenti devono ricollegare Google Calendar |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Client OAuth |
| `OPENAI_API_KEY` | platform.openai.com → API keys (oppure `ANTHROPIC_API_KEY` con `ASSISTANT_PROVIDER=anthropic`) |

## Render

1. Render → **New → Blueprint** → collega il repository: `render.yaml` crea il servizio `ripetiflow`
   (Docker, regione Frankfurt, health check `/api/health`).
2. Inserisci le variabili marcate `sync: false` nel pannello *Environment*.
3. Deploy. Verifica `https://<servizio>/api/health` → `{"status":"ok", "db":"ok"}`.
4. In Supabase → Authentication → URL Configuration aggiungi `https://<servizio>/auth/callback`.

**Importante:** non impostare mai `DEV_AUTH=1` in produzione (il backend si rifiuta di avviarsi).

## Migrare dal vecchio servizio Laravel

1. Subito: sul vecchio servizio imposta `APP_DEBUG=false` (vedi `01-reverse-engineering.md`).
2. Se avete dati reali nel vecchio DB, esportali (CSV di studenti, lezioni, pagamenti) e importali
   con uno script (chiedi a un agente di scriverlo: le tabelle di destinazione sono in
   `04-modello-dati.md`; usare `set_config('app.source','import',true)` così lo storico li marca come
   importati).
3. Punta il dominio al nuovo servizio, poi sospendi quello vecchio.
