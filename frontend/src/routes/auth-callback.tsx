import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/lib/api/problem";
import { useConnectCalendar } from "@/lib/queries";

// Landing point of every Supabase redirect (Google OAuth, magic link, calendar consent).
// supabase-js exchanges the ?code= on start-up; here we only decide where to go next.
// With ?next=calendar the Google refresh token is sent ONCE to the backend (D-31), then the
// session is refreshed so the provider tokens do not stay in storage.
export function Component() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const oauthError = params.get("error_description") ?? params.get("error");
  const connect = useConnectCalendar();
  const started = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const { status, takeCalendarGrant, forgetProviderTokens } = auth;
  const connectCalendar = connect.mutateAsync;

  useEffect(() => {
    if (status !== "signedIn" || started.current || oauthError) return;
    started.current = true;
    if (next !== "calendar") {
      void navigate("/oggi", { replace: true });
      return;
    }
    void (async () => {
      try {
        const grant = await takeCalendarGrant();
        if (grant) await connectCalendar(grant);
        void navigate("/impostazioni", { replace: true });
      } catch (error) {
        setFailure(errorMessage(error));
      } finally {
        await forgetProviderTokens();
      }
    })();
  }, [
    status,
    next,
    oauthError,
    navigate,
    takeCalendarGrant,
    forgetProviderTokens,
    connectCalendar,
  ]);

  if (oauthError || failure || status === "signedOut") {
    return (
      <main id="main">
        <h1>Accesso non riuscito</h1>
        <p role="alert">
          {failure ??
            (next === "calendar"
              ? "Il collegamento con Google Calendar non è stato completato."
              : "Non è stato possibile completare l'accesso. Il link potrebbe essere scaduto.")}
        </p>
        <p>
          {next === "calendar" && status === "signedIn" ? (
            <Link to="/impostazioni">Torna alle impostazioni</Link>
          ) : (
            <Link to="/accedi">Torna all'accesso</Link>
          )}
        </p>
      </main>
    );
  }

  return (
    <main id="main">
      <p role="status" aria-live="polite">
        {next === "calendar" ? "Collegamento di Google Calendar in corso…" : "Accesso in corso…"}
      </p>
    </main>
  );
}
