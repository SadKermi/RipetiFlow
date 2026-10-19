// Accesso «/accedi» (03 §2, D-30): one screen, no password. Every method appears only when its
// flag in GET /public/config is true: Google (primary), link via email, demo (development only).
// The Calendar permission is NOT asked here (D-31, incremental consent): Impostazioni does it.
// After signing in, RedirectIfSignedIn (router) takes the tutor where they were going.
import {
  CloudSlashIcon,
  EnvelopeSimpleIcon,
  UserCircleDashedIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAuth } from "@/app/auth";
import {
  Button,
  InlineButton,
  Note,
  SessionExpiredNote,
  TextField,
  Wordmark,
  useDelayedFlag,
} from "@/components";
import { UnverifiedAppNote } from "@/features/calendar/UnverifiedAppNote";
import { UserFacingError, errorMessage } from "@/lib/api/problem";
import { useFormErrors } from "@/lib/forms";
import { GoogleLogo } from "./GoogleLogo";
import { readSignInPageState, rememberSignIn, signInMethods } from "./signin";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** «mandalo di nuovo» is active after this many seconds (03 §2). */
const RESEND_AFTER_S = 60;

function Warning({ children }: { children: ReactNode }) {
  return (
    <Note role="alert" tone="danger" icon={WarningIcon} className="mt-3">
      {children}
    </Note>
  );
}

/** The store's magic-link errors in the screen's words (03 §2 «Stati»). */
function magicLinkError(error: unknown): string {
  if (error instanceof UserFacingError && /troppi/i.test(error.message)) {
    return "Troppi tentativi: riprova tra qualche minuto.";
  }
  return "Invio non riuscito. Riprova tra poco.";
}

function Divider({ label }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-[0.875rem] text-ink-3">
      <span aria-hidden className="h-px flex-1 bg-rule-strong" />
      {label}
      {label && <span aria-hidden className="h-px flex-1 bg-rule-strong" />}
    </div>
  );
}

function Skeleton() {
  const visible = useDelayedFlag(300);
  return (
    <div aria-busy="true" className="mt-8 flex flex-col gap-3">
      <span role="status" className="sr-only">
        Caricamento…
      </span>
      {visible && (
        <>
          <span aria-hidden className="block h-control bg-paper-sunk" />
          <span aria-hidden className="block h-control bg-paper-sunk" />
        </>
      )}
    </div>
  );
}

function GoogleBlock({ returnFailed }: { returnFailed: boolean }) {
  const { signInWithGoogle } = useAuth();
  const google = useMutation({
    mutationFn: async () => {
      rememberSignIn({ method: "google" });
      await signInWithGoogle();
    },
  });
  // Pending until the browser leaves for Google.
  return (
    <div>
      <Button variant="ink" fullWidth onPress={() => google.mutate()} isPending={google.isPending}>
        {!google.isPending && <GoogleLogo />}
        Continua con Google
      </Button>
      {google.isPending && (
        <p role="status" className="mt-2 mb-0 text-[0.875rem] text-ink-2">
          Ti stiamo portando su Google…
        </p>
      )}
      {google.isError ? (
        <Warning>{errorMessage(google.error)}</Warning>
      ) : (
        returnFailed && <Warning>Accesso con Google non completato. Riprova.</Warning>
      )}
      <UnverifiedAppNote className="mt-3" />
    </div>
  );
}

function useCountdown(seconds: number, startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (startedAt === null) return 0;
  // `now` may still be from before the start (it ticks only while counting).
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return Math.max(0, seconds - elapsed);
}

function EmailBlock({
  primary,
  initialEmail,
  showHint,
}: {
  primary: boolean;
  initialEmail: string;
  showHint: boolean;
}) {
  const { sendMagicLink } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const errors = useFormErrors({ fields: ["email"] as const }, formRef);
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const wait = useCountdown(RESEND_AFTER_S, sentAt);
  const noteRef = useRef<HTMLDivElement>(null);
  const backToForm = useRef(false);
  // The block that had the focus is replaced: the focus follows (to the note, back to the field).
  useEffect(() => {
    if (sentTo) {
      noteRef.current?.focus();
    } else if (backToForm.current) {
      backToForm.current = false;
      formRef.current?.querySelector("input")?.focus();
    }
  }, [sentTo]);
  const send = useMutation({
    mutationFn: async (address: string) => {
      rememberSignIn({ method: "email", email: address });
      await sendMagicLink(address);
      return address;
    },
    onSuccess: (address) => {
      setSentTo(address);
      setSentAt(Date.now());
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A pending button is only aria-disabled: Invio in the field would send a second link.
    if (send.isPending) return;
    const address = email.trim();
    if (!EMAIL.test(address)) {
      errors.show({ email: "Scrivi un indirizzo email valido." });
      return;
    }
    send.mutate(address);
  }

  if (sentTo) {
    return (
      <div ref={noteRef} tabIndex={-1} className="focus:outline-none focus-visible:shadow-none">
        <Note icon={EnvelopeSimpleIcon}>
          Ti abbiamo mandato un link a <b className="font-semibold break-all">{sentTo}</b>. Aprilo
          da questo telefono o computer per entrare.
        </Note>
        <p className="mt-3 mb-0 pl-7 text-[0.875rem] leading-5 text-ink-2">
          Non arriva? Controlla lo spam o{" "}
          {wait > 0 ? (
            <span className="text-ink-3">mandalo di nuovo tra {wait} s</span>
          ) : (
            <InlineButton onPress={() => send.mutate(sentTo)} isPending={send.isPending}>
              mandalo di nuovo
            </InlineButton>
          )}
        </p>
        {send.isError && <Warning>{magicLinkError(send.error)}</Warning>}
        <div className="mt-4 pl-7">
          <Button
            onPress={() => {
              backToForm.current = true;
              setSentTo(null);
              setSentAt(null);
              send.reset();
            }}
          >
            Usa un&apos;altra email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit}>
      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="nome@esempio.it"
        value={email}
        onChange={(value) => {
          setEmail(value);
          errors.clearField("email");
        }}
        error={errors.fields.email}
      />
      <Button
        type="submit"
        variant={primary ? "ink" : "line"}
        icon={EnvelopeSimpleIcon}
        isPending={send.isPending}
        fullWidth={primary}
        className="mt-3"
      >
        {send.isPending ? "Invio…" : "Mandami il link"}
      </Button>
      {send.isError && <Warning>{magicLinkError(send.error)}</Warning>}
      {showHint && (
        <p className="mt-3 mb-0 text-[0.875rem] leading-5 text-ink-3">
          Ti mandiamo un link per entrare: nessuna password da ricordare.
        </p>
      )}
    </form>
  );
}

function DemoBlock() {
  const { signInDemo } = useAuth();
  const demo = useMutation({ mutationFn: signInDemo });
  return (
    <div>
      <Button icon={UserCircleDashedIcon} onPress={() => demo.mutate()} isPending={demo.isPending}>
        Entra in modalità demo
      </Button>
      <p className="mt-2 mb-0 text-[0.875rem] leading-5 text-ink-3">
        Solo in sviluppo: dati di esempio, nessun account vero.
      </p>
      {demo.isError && <Warning>{errorMessage(demo.error)}</Warning>}
    </div>
  );
}

export function SignInPage() {
  const auth = useAuth();
  const location = useLocation();
  const pageState = readSignInPageState(location.state);
  const methods = signInMethods(auth.config);
  const onlyEmail = methods.email && !methods.google;
  const configured = methods.google || methods.email || methods.demo;

  let body: ReactNode;
  if (auth.error) {
    body = (
      <div
        role="alert"
        className="mt-8 flex items-start gap-2 border-t border-rule-strong pt-2.5 text-[0.9375rem] leading-[1.375rem] text-ink"
      >
        <CloudSlashIcon size={20} aria-hidden className="mt-px shrink-0 text-danger" />
        <p className="m-0">
          Non riesco a contattare il server.{" "}
          <InlineButton onPress={() => void auth.retry()}>Riprova</InlineButton>
        </p>
      </div>
    );
  } else if (!auth.config) {
    body = <Skeleton />;
  } else if (!configured) {
    body = (
      <p className="mt-8 mb-0 text-body text-ink">
        L&apos;accesso non è configurato su questo server.
      </p>
    );
  } else {
    body = (
      <div className="mt-8">
        {methods.google && <GoogleBlock returnFailed={pageState.signInError === "google"} />}
        {methods.google && methods.email && <Divider label="oppure" />}
        {methods.email && (
          <EmailBlock
            primary={onlyEmail}
            initialEmail={pageState.email ?? ""}
            showHint={!onlyEmail}
          />
        )}
        {methods.demo && (
          <>
            {(methods.google || methods.email) && <Divider />}
            <DemoBlock />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <main
        id="main"
        className="mx-auto w-full max-w-[calc(27.5rem_+_2_*_var(--rf-gutter))] flex-1 px-gutter pt-4 pb-10 lg:pt-16"
      >
        <div className="lg:text-center">
          <Wordmark to="/" />
        </div>
        <h1 className="mt-8 mb-0 font-display text-display-m font-normal text-balance text-ink lg:mt-12 lg:text-center">
          Entra nel tuo registro
        </h1>
        {(methods.google || methods.email) && (
          <p className="mt-3 mb-0 text-body text-ink-2 lg:text-center">
            {onlyEmail
              ? "Ti mandiamo un link per entrare: nessuna password."
              : "Usiamo il tuo account Google solo per l'accesso. Calendar si collega dopo, se vuoi, da Impostazioni."}
          </p>
        )}
        {auth.notice === "session-expired" && <SessionExpiredNote className="mt-6" />}
        {body}
      </main>
    </div>
  );
}
