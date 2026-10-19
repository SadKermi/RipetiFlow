// «Google Calendar» in Impostazioni (03 §8, D-31, docs/08 §4–5): one-way sync into a calendar of
// its own, «RipetiFlow». Shown only when the server can sync (`calendar_sync_available` in
// /public/config and `available` in the status); every state of the table in 03 §8 is here.
import {
  ArrowsClockwiseIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  InfoIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/app/auth";
import {
  Button,
  ConfirmDialog,
  InlineButton,
  Loadable,
  Note,
  SkeletonRows,
  cx,
  useToast,
} from "@/components";
import { errorMessage, isApiProblem } from "@/lib/api/problem";
import type { CalendarStatus } from "@/lib/api/types";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import {
  calendarStatusQuery,
  queryKeys,
  useDisconnectCalendar,
  useProfile,
  useResyncCalendar,
} from "@/lib/queries";
import { focusWhenLost } from "@/features/settings/focus";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { Checkbox } from "./Checkbox";
import { UnverifiedAppNote } from "./UnverifiedAppNote";
import {
  CALENDAR_SECTION_ID,
  formatLastSync,
  queuedToast,
  readCalendarReturnState,
} from "./messages";

const TEXT = "m-0 text-body text-ink";
const META = "m-0 text-[0.9375rem] leading-[1.375rem] text-ink-2";

function Unavailable() {
  return (
    <p className={TEXT}>La sincronizzazione con Google Calendar non è attiva su questo server.</p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-2 max-sm:*:w-full">{children}</div>;
}

/** «In coda N · Non riuscite N» (`pending`, `errors`); failures in danger with CloudSlash. */
function Counters({ pending, errors }: { pending: number; errors: number }) {
  return (
    <>
      <p className={META}>
        In coda {pending} ·{" "}
        <span className={cx("inline-flex items-center gap-1", errors > 0 && "text-danger")}>
          {errors > 0 && <CloudSlashIcon size={16} aria-hidden />}
          Non riuscite {errors}
        </span>
      </p>
      {errors > 0 && <p className={META}>Il motivo è accanto a ogni lezione nel registro.</p>}
    </>
  );
}

export function CalendarSection() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const profile = useProfile();
  const timeZone = profile.data?.timezone ?? DEFAULT_TIMEZONE;

  const serverAvailable = auth.config?.calendar_sync_available === true;
  const status = useQuery({ ...calendarStatusQuery(), enabled: serverAvailable });
  const connect = useMutation({ mutationFn: auth.connectGoogleCalendar });
  const resync = useResyncCalendar();
  const disconnect = useDisconnectCalendar();

  const [note, setNote] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [removeCalendar, setRemoveCalendar] = useState(false);

  // Error handed over by /auth/callback after the Google consent (e.g. 422 permesso negato).
  const returnError = readCalendarReturnState(location.state);
  const isDemo = auth.user?.mode === "demo";

  const refreshStatus = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.status() });

  function startConnect() {
    setNote(null);
    if (returnError)
      void navigate(location.pathname + location.hash, { replace: true, state: null });
    connect.mutate();
  }

  function resyncUpcoming() {
    setNote(null);
    resync.mutate(
      { scope: "upcoming" },
      {
        onSuccess: ({ queued }) => toast.show(queuedToast(queued)),
        onError: (error) => {
          setNote(errorMessage(error));
          if (isApiProblem(error) && error.status === 409) void refreshStatus();
        },
      },
    );
  }

  async function resyncAll() {
    setNote(null);
    try {
      const { queued } = await resync.mutateAsync({ scope: "all" });
      toast.show(queuedToast(queued));
    } catch (error) {
      if (isApiProblem(error) && error.status === 409) void refreshStatus();
      throw error; // the dialog keeps the server's text above its buttons
    }
  }

  async function doDisconnect() {
    setNote(null);
    await disconnect.mutateAsync({ removeCalendar });
    toast.show("Google Calendar scollegato");
    // The buttons that opened the dialog are gone: put the focus back on the section.
    focusWhenLost(() => headingRef.current);
  }

  const connectError = connect.isError ? errorMessage(connect.error) : null;
  const shownError = connectError ?? returnError;

  const connectButton = (label: string) => (
    <Button
      variant="ink"
      onPress={startConnect}
      isPending={connect.isPending}
      isDisabled={isDemo}
      aria-describedby={isDemo ? "rf-calendar-demo" : undefined}
    >
      {label}
    </Button>
  );

  const demoReason = isDemo ? (
    <p id="rf-calendar-demo" className="mt-2 mb-0 text-[0.875rem] leading-5 text-ink-3">
      In modalità demo non si può collegare Google Calendar: entra con il tuo account.
    </p>
  ) : null;

  const failure = shownError ? (
    <Note role="alert" tone="danger" icon={WarningIcon} className="mt-4">
      {shownError}{" "}
      <InlineButton onPress={startConnect} isDisabled={isDemo}>
        Riprova
      </InlineButton>
    </Note>
  ) : null;

  const unverified = <UnverifiedAppNote className="mt-3" />;

  function body(data: CalendarStatus) {
    if (!data.available) return <Unavailable />;

    if (!data.connected) {
      return (
        <>
          <p className={TEXT}>Non collegato. Le lezioni restano solo qui.</p>
          <p className={cx(META, "mt-2")}>
            RipetiFlow crea nel tuo Google un calendario a parte, «RipetiFlow», e scrive solo lì:
            non vede gli altri calendari. Le note private non vengono inviate.
          </p>
          {failure}
          <Actions>{connectButton("Collega Google Calendar")}</Actions>
          {demoReason}
          {unverified}
        </>
      );
    }

    if (data.status === "revoked") {
      return (
        <>
          <Note icon={CloudSlashIcon} tone="danger">
            Google ha chiuso l&apos;accesso al calendario. Finché l&apos;app è in prova, succede
            ogni 7 giorni: ricollega e le lezioni cambiate nel frattempo vengono inviate.
          </Note>
          {data.pending > 0 && <p className={cx(META, "mt-2")}>In coda {data.pending}</p>}
          {failure}
          <Actions>
            {connectButton("Ricollega")}
            <Button variant="danger" onPress={() => setConfirmDisconnect(true)}>
              Scollega
            </Button>
          </Actions>
          {demoReason}
        </>
      );
    }

    const lastSync = data.last_synced_at ? formatLastSync(data.last_synced_at, timeZone) : null;

    if (data.status === "error") {
      return (
        <>
          <Note icon={CloudSlashIcon} tone="danger">
            {data.last_error ?? "La sincronizzazione con Google Calendar non è riuscita."}
          </Note>
          <div className="mt-2 flex flex-col gap-1">
            {data.google_email && <p className={META}>{data.google_email}</p>}
            <Counters pending={data.pending} errors={data.errors} />
          </div>
          {failure}
          <Actions>
            <Button icon={ArrowsClockwiseIcon} onPress={() => setConfirmAll(true)}>
              Risincronizza tutte
            </Button>
            {connectButton("Ricollega")}
          </Actions>
          {demoReason}
        </>
      );
    }

    return (
      <>
        <p className={cx(TEXT, "flex items-start gap-2")}>
          <CloudCheckIcon size={20} aria-hidden className="mt-0.5 shrink-0 text-ink-2" />
          <span>
            <span className="font-semibold">Collegato</span> · calendario «RipetiFlow»
          </span>
        </p>
        <div className="mt-1 flex flex-col gap-1 pl-7">
          {data.google_email && <p className={META}>{data.google_email}</p>}
          {lastSync && <p className={META}>Ultima sincronizzazione {lastSync}</p>}
          <Counters pending={data.pending} errors={data.errors} />
          {data.last_error && (
            <Note icon={InfoIcon} className="mt-1 text-[0.9375rem]">
              {data.last_error}
            </Note>
          )}
        </div>
        <Actions>
          <Button icon={ArrowsClockwiseIcon} onPress={resyncUpcoming} isPending={resync.isPending}>
            Risincronizza prossime
          </Button>
          <Button
            icon={ArrowsClockwiseIcon}
            onPress={() => setConfirmAll(true)}
            isDisabled={resync.isPending}
          >
            Risincronizza tutte
          </Button>
          <Button variant="danger" onPress={() => setConfirmDisconnect(true)}>
            Scollega
          </Button>
        </Actions>
        <p className={cx(META, "mt-4 text-[0.875rem] leading-5 text-ink-3")}>
          Le lezioni vanno solo da RipetiFlow a Google. Se modifichi un evento lì, qui non cambia
          nulla; «Risincronizza» lo rimette com&apos;è nel registro.
        </p>
      </>
    );
  }

  const revoked = status.data?.status === "revoked";

  return (
    <SettingsSection title="Google Calendar" id={CALENDAR_SECTION_ID} headingRef={headingRef}>
      {auth.config === null ? (
        <SkeletonRows rows={2} />
      ) : serverAvailable ? (
        <Loadable query={status} skeleton={<SkeletonRows rows={2} />} timeZone={timeZone}>
          {(data) => body(data)}
        </Loadable>
      ) : (
        <Unavailable />
      )}

      {note && (
        <Note role="alert" tone="danger" icon={WarningIcon} className="mt-4">
          {note}
        </Note>
      )}

      <ConfirmDialog
        isOpen={confirmAll}
        onOpenChange={setConfirmAll}
        title="Risincronizzare tutte le lezioni?"
        effect="Gli eventi del calendario «RipetiFlow» tornano come nel registro: le modifiche fatte su Google si perdono e gli eventi estranei vengono eliminati. Gli eventi delle lezioni passate restano."
        confirmLabel="Risincronizza tutte"
        tone="ink"
        onConfirm={resyncAll}
      />

      <ConfirmDialog
        isOpen={confirmDisconnect}
        onOpenChange={(open) => {
          setConfirmDisconnect(open);
          if (open) setRemoveCalendar(false);
        }}
        title="Scollegare Google Calendar?"
        effect="Le lezioni restano qui. Il calendario «RipetiFlow» resta su Google ma non viene più aggiornato; se ricolleghi, verrà riusato."
        confirmLabel="Scollega"
        onConfirm={doDisconnect}
      >
        {revoked ? (
          <Note>Il calendario va tolto a mano da Google Calendar.</Note>
        ) : (
          <Checkbox isSelected={removeCalendar} onChange={setRemoveCalendar}>
            Elimina anche il calendario «RipetiFlow» da Google
          </Checkbox>
        )}
      </ConfirmDialog>
    </SettingsSection>
  );
}
