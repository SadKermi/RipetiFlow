import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/lib/api/problem";

// Placeholder sign-in page: Google, magic link, demo (D-30). Redirect after sign-in is handled by
// RedirectIfSignedIn in the router.
export function Component() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const google = useMutation({ mutationFn: auth.signInWithGoogle });
  const magicLink = useMutation({ mutationFn: auth.sendMagicLink });
  const demo = useMutation({ mutationFn: auth.signInDemo });

  const config = auth.config;
  const supabaseReady = Boolean(config?.supabase_url && config.supabase_publishable_key);
  const showGoogle = supabaseReady && config?.google_login_enabled;
  const showMagicLink = supabaseReady && config?.magic_link_enabled;
  const showDemo = config?.dev_auth_enabled ?? false;
  const failed = google.error ?? magicLink.error ?? demo.error;

  function onMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    magicLink.mutate(email);
  }

  return (
    <main id="main">
      <h1>Accedi a RipetiFlow</h1>

      {auth.notice === "session-expired" && (
        <p role="status">La sessione è scaduta: accedi di nuovo.</p>
      )}

      {auth.error && (
        <div role="alert">
          <p>{auth.error.detail}</p>
          <button type="button" onClick={() => void auth.retry()}>
            Riprova
          </button>
        </div>
      )}

      {failed && <p role="alert">{errorMessage(failed)}</p>}

      {showGoogle && (
        <p>
          <button type="button" onClick={() => google.mutate()} disabled={google.isPending}>
            Accedi con Google
          </button>
        </p>
      )}

      {showMagicLink && (
        <form onSubmit={onMagicLink}>
          <label htmlFor="email">Oppure ricevi un link via email</label>{" "}
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />{" "}
          <button type="submit" disabled={magicLink.isPending}>
            Inviami il link
          </button>
          {magicLink.isSuccess && (
            <p role="status">Controlla la posta: ti abbiamo inviato il link per entrare.</p>
          )}
        </form>
      )}

      {showDemo && (
        <p>
          <button type="button" onClick={() => demo.mutate()} disabled={demo.isPending}>
            Entra in modalità demo
          </button>
        </p>
      )}

      {config && !showGoogle && !showMagicLink && !showDemo && (
        <p>Nessun metodo di accesso è configurato su questo server.</p>
      )}
    </main>
  );
}
