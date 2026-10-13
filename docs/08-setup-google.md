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

- L'app crea in Google il calendario **"RipetiFlow"** e scrive solo lì (con `calendar.app.created` non
  vede gli altri calendari, nemmeno l'elenco: per ritrovare il suo calendario usa l'id salvato).
- Ogni lezione → un evento: titolo `Materia · Nome Studente`, orari nel fuso del profilo,
  descrizione con argomento e link alla scheda. **Le note private non vengono inviate.**
- Modifiche fatte direttamente su Google **non** tornano nel gestionale; "Risincronizza" in
  Impostazioni ripristina gli eventi com'erano nel gestionale, ricrea quelli mancanti ed elimina quelli
  estranei (senza una lezione corrispondente, o doppioni). Gli eventi delle lezioni passate restano.
- Se al consenso Google l'utente toglie la spunta al permesso Calendar, "Collega" risponde con un
  messaggio che chiede di riprovare lasciandola selezionata.
- Se il calendario "RipetiFlow" viene eliminato a mano da Google, l'app ne crea uno nuovo da sola e ci
  rimette gli eventi.
- Token scaduto o revocato (in *Testing* ogni 7 giorni, vedi §4, o accesso tolto all'app dall'account
  Google): il collegamento passa a `revoked` appena l'app prova a usarlo (alla prossima lezione da
  inviare, o subito con "Risincronizza", che chiede di ricollegare); al nuovo "Collega" lo stesso
  calendario viene riusato e le modifiche fatte
  nel frattempo vengono inviate. Lo storico precedente al primo collegamento resta fuori da Google
  anche se nel frattempo è stato ritoccato (tariffe, note): per inviarlo usa «Risincronizza tutte».
- "Scollega" revoca il token e lo cancella; il calendario resta su Google e un nuovo "Collega" lo
  riusa (nessun doppione). Con "elimina anche il calendario" il calendario viene cancellato da Google;
  se Google in quel momento non risponde, il collegamento resta attivo e si può riprovare. Se il token
  era già scaduto l'app non può più eliminarlo: va tolto a mano da Google Calendar.
