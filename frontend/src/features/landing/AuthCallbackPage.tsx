// «/auth/callback» (03 §2, §8, D-30, D-31): where every Supabase redirect lands. supabase-js
// exchanges the ?code= while the auth store starts; this page only decides what comes next.
// - Sign-in: to /oggi; an expired or used email link gets its own page; a cancelled or failed
//   Google sign-in goes back to /accedi with a note under the button.
// - Calendar consent (?next=calendar): the Google refresh token is read ONCE and sent to
//   POST /integrations/google-calendar/connect (docs/03 «Collegamento Google Calendar»), then the
//   session is refreshed so the provider tokens do not stay in storage; back to Impostazioni with
//   a toast, or with the server's reason when it failed (e.g. 422 «permesso negato»).
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/app/auth";
import { Dots, LinkButton, PageMessage, Wordmark, useToast } from "@/components";
import {
  CALENDAR_SECTION_ID,
  type CalendarReturnState,
  connectedToast,
} from "@/features/calendar/messages";
import { errorMessage } from "@/lib/api/problem";
import { useConnectCalendar } from "@/lib/queries";
import {
  type CallbackFailure,
  type SignInPageState,
  callbackError,
  classifyFailure,
  forgetSignIn,
  recallSignIn,
} from "./signin";

const CALENDAR_NOT_COMPLETED = "Il collegamento con Google Calendar non è stato completato.";

function Waiting({ children }: { children: string }) {
  return (
    <p role="status" className="m-0 flex items-center gap-3 text-body text-ink-2">
      <Dots />
      {children}
    </p>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <main
        id="main"
        className="mx-auto w-full max-w-[calc(27.5rem_+_2_*_var(--rf-gutter))] flex-1 px-gutter pt-4 pb-10 lg:pt-16"
      >
        <div className="mb-10 lg:text-center">
          <Wordmark to="/" />
        </div>
        {children}
      </main>
    </div>
  );
}

export function AuthCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const connect = useConnectCalendar();
  const started = useRef(false);
  // Read once: the attempt is forgotten as soon as the outcome is known.
  const [attempt] = useState(recallSignIn);

  const calendar = new URLSearchParams(location.search).get("next") === "calendar";
  const oauthError = useMemo(
    () => callbackError(location.search, location.hash),
    [location.search, location.hash],
  );

  const { status, takeCalendarGrant, forgetProviderTokens } = auth;
  const connectCalendar = connect.mutateAsync;
  const showToast = toast.show;

  // Outcome without a session, derived from the URL and what /accedi started.
  let failure: CallbackFailure | null = null;
  if (status === "signedOut") {
    failure = calendar ? "failed" : classifyFailure(oauthError, attempt);
  }

  useEffect(() => {
    if (status === "loading" || started.current) return;
    started.current = true;

    if (!calendar) {
      forgetSignIn();
      if (status === "signedIn") {
        void navigate("/oggi", { replace: true });
      } else if (classifyFailure(oauthError, attempt) === "google-failed") {
        const state: SignInPageState = { signInError: "google" };
        void navigate("/accedi", { replace: true, state });
      }
      return;
    }

    // Calendar consent: only for someone signed in (the consent keeps the same Supabase user).
    if (status !== "signedIn") return;
    const back = (calendarError?: string) => {
      const state: CalendarReturnState | null = calendarError ? { calendarError } : null;
      void navigate(`/impostazioni#${CALENDAR_SECTION_ID}`, { replace: true, state });
    };
    if (oauthError) {
      back(CALENDAR_NOT_COMPLETED);
      return;
    }
    void (async () => {
      try {
        const grant = await takeCalendarGrant();
        if (grant) {
          const linked = await connectCalendar(grant);
          showToast(connectedToast(linked.pending));
        }
        back();
      } catch (error) {
        back(errorMessage(error));
      } finally {
        await forgetProviderTokens();
      }
    })();
  }, [
    status,
    calendar,
    oauthError,
    attempt,
    navigate,
    takeCalendarGrant,
    forgetProviderTokens,
    connectCalendar,
    showToast,
  ]);

  if (failure === "link-expired") {
    const state: SignInPageState = attempt?.email ? { email: attempt.email } : {};
    return (
      <Frame>
        <PageMessage
          title="Il link non è più valido"
          className="py-0"
          action={
            <LinkButton to="/accedi" state={state} variant="ink">
              Mandane un altro
            </LinkButton>
          }
        >
          I link di accesso valgono una volta sola e per poco tempo.
        </PageMessage>
      </Frame>
    );
  }

  if (failure === "failed") {
    return (
      <Frame>
        <PageMessage
          title="Accesso non completato"
          className="py-0"
          action={<LinkButton to="/accedi">Torna all&apos;accesso</LinkButton>}
        >
          {calendar
            ? CALENDAR_NOT_COMPLETED
            : "Non è stato possibile completare l'accesso. Riprova dalla pagina di accesso."}
        </PageMessage>
      </Frame>
    );
  }

  return (
    <Frame>
      <Waiting>{calendar ? "Sto collegando il calendario…" : "Ti stiamo facendo entrare…"}</Waiting>
    </Frame>
  );
}
