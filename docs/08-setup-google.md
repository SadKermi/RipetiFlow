# 08 · Setup Google (login + Calendar)

Servono **un solo** client OAuth Google, usato sia da Supabase Auth (login) sia dal backend
(rinnovo dei token per Google Calendar).

## 1. Google Cloud Console

1. Crea (o scegli) un progetto su <https://console.cloud.google.com/>.
2. **API e servizi → Libreria**: abilita **Google Calendar API**.
3. **Google Auth Platform → Branding**: nome app "RipetiFlow", email di supporto, logo (facoltativo),
   dominio dell'app (es. `ripetiflow.onrender.com`), link a privacy policy e termini (richiesti per la
   verifica).
4. **Pubblico (Audience)**: tipo **Esterno**. Finché l'app è in stato *Testing* aggiungi come
   **utenti di test** gli account Google degli insegnanti (max 100). Gli altri non potranno accedere.
5. **Accesso ai dati (Data access) → Aggiungi scope**:
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (login, non sensibili)
   - `https://www.googleapis.com/auth/calendar.app.created` (Calendar: solo calendari creati dall'app)
6. **Client → Crea client → Applicazione web**:
   - *Origini JavaScript autorizzate*: `http://localhost:5173`, `https://<tuo-dominio>`
   - *URI di reindirizzamento autorizzati*: `https://afaowzrghvqnqcovxtqu.supabase.co/auth/v1/callback`
   - Annota **Client ID** e **Client secret**.

## 2. Supabase (progetto `ripetiflow`)

1. **Authentication → Sign In / Providers → Google**: abilita, incolla Client ID e Client secret.
2. **Authentication → URL Configuration**:
   - *Site URL*: `https://<tuo-dominio>`
   - *Redirect URLs*: `http://localhost:5173/auth/callback`, `https://<tuo-dominio>/auth/callback`
3. (Facoltativo) **Email** provider: lascia attivo il magic link come alternativa al login Google.
4. **Project Settings → Data API**: verifica che lo schema `app` **non** sia tra quelli esposti.

## 3. Backend

Nel `.env` (o nelle variabili di Render):
```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=<python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
PUBLIC_APP_URL=https://<tuo-dominio>
```

## 4. Come funziona il consenso

- Il **login** chiede solo email e profilo: nessuna verifica Google necessaria per questi scope.
- Lo scope **Calendar** viene chiesto solo quando l'insegnante attiva la sincronizzazione in
  Impostazioni (consenso incrementale con `access_type=offline` e `prompt=consent`, così Google
  rilascia il refresh token). Il refresh token viene cifrato e salvato dal backend.
- `calendar.app.created` è uno scope **sensibile**: in *Testing* funziona per gli utenti di test, con
  un avviso "app non verificata" al consenso. Per aprire l'app a tutti serve la **verifica** (Google
  Auth Platform → Verification Center): video dimostrativo dell'uso dello scope, privacy policy
  pubblicata sul dominio verificato. Tempi tipici: da alcuni giorni a qualche settimana.
- I token di refresh delle app in *Testing* con scope sensibili **scadono dopo 7 giorni**: in quella
  fase l'utente dovrà ricollegare il calendario ogni settimana (la UI lo segnala quando il link passa
  a `revoked`). Il problema sparisce dopo la verifica / pubblicazione.

## 5. Sincronizzazione monodirezionale

- L'app crea in Google il calendario **"RipetiFlow"** e scrive solo lì.
- Ogni lezione → un evento: titolo `Materia · Nome Studente`, orari nel fuso del profilo,
  descrizione con argomento e link alla scheda. **Le note private non vengono inviate.**
- Modifiche fatte direttamente su Google **non** tornano nel gestionale; "Risincronizza" in
  Impostazioni ripristina gli eventi com'erano nel gestionale.
- "Scollega" revoca il token; opzionalmente elimina il calendario "RipetiFlow" da Google.
