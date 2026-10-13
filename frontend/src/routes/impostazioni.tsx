import { useMutation } from "@tanstack/react-query";
import { useAuth, useSeedDemo } from "@/app/auth";
import { Loadable } from "@/components/Loadable";
import { downloadFullLedgerCsv } from "@/lib/api/download";
import { errorMessage } from "@/lib/api/problem";
import { useCalendarStatus, useProfile, useSubjects } from "@/lib/queries";

// Placeholder for settings: profile, subjects, Google Calendar, export, demo tools, sign-out.
export function Component() {
  const auth = useAuth();
  const profile = useProfile();
  const subjects = useSubjects();
  const calendar = useCalendarStatus();
  const connect = useMutation({ mutationFn: auth.connectGoogleCalendar });
  const exportCsv = useMutation({ mutationFn: downloadFullLedgerCsv });
  const seed = useSeedDemo();
  const isDemo = auth.user?.mode === "demo";

  return (
    <>
      <h1>Impostazioni</h1>

      <h2>Profilo</h2>
      <Loadable query={profile}>
        {(data) => (
          <dl>
            <dt>Email</dt>
            <dd>{data.email}</dd>
            <dt>Fuso orario</dt>
            <dd>{data.timezone}</dd>
            <dt>Durata predefinita</dt>
            <dd>{data.default_lesson_minutes} min</dd>
          </dl>
        )}
      </Loadable>

      <h2>Materie</h2>
      <Loadable query={subjects}>{(items) => <p>{items.length} materie</p>}</Loadable>

      <h2>Google Calendar</h2>
      <Loadable query={calendar}>
        {(data) =>
          !data.available ? (
            <p>La sincronizzazione non è attiva su questo server.</p>
          ) : data.connected ? (
            <p>Collegato{data.google_email ? ` a ${data.google_email}` : ""}.</p>
          ) : (
            <p>
              <button
                type="button"
                onClick={() => connect.mutate()}
                disabled={connect.isPending || isDemo}
              >
                Collega Google Calendar
              </button>
              {isDemo && " (non disponibile in modalità demo)"}
            </p>
          )
        }
      </Loadable>
      {connect.isError && <p role="alert">{errorMessage(connect.error)}</p>}

      <h2>Esportazione</h2>
      <p>
        <button type="button" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
          Scarica il libro mastro completo (CSV)
        </button>
      </p>
      {exportCsv.isError && <p role="alert">{errorMessage(exportCsv.error)}</p>}

      {auth.config?.dev_auth_enabled && isDemo && (
        <>
          <h2>Modalità demo</h2>
          <p>
            <button type="button" onClick={() => seed.mutate()} disabled={seed.isPending}>
              Ricarica i dati demo
            </button>
          </p>
          {seed.isSuccess && (
            <p role="status">
              Dati demo ricreati: {seed.data.students} studenti, {seed.data.lessons} lezioni,{" "}
              {seed.data.payments} pagamenti.
            </p>
          )}
          {seed.isError && <p role="alert">{errorMessage(seed.error)}</p>}
        </>
      )}

      <h2>Account</h2>
      <p>
        <button type="button" onClick={() => void auth.signOut()}>
          Esci
        </button>
      </p>
    </>
  );
}
