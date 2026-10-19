// Landing §2 «Matita scrive a matita. Tu ripassi a penna.» (03 §1): a draft card in pencil that
// is gone over in ink once, when 60 % of it is on screen (never with reduced motion: then only
// the button does it, instantly). Static example: nothing is sent anywhere.
import { useEffect, useRef, useState } from "react";
import { Button, INK_ICON, MATITA_ICON, cx, useMediaQuery } from "@/components";
import { formatEuro, formatMinutes } from "@/lib/format";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** A moment in pencil before the ink, so the change is seen. */
const INK_DELAY_MS = 700;

const FIELDS: readonly [string, string][] = [
  ["Studente", "Luca Bianchi"],
  ["Giorno", "lun 5 ott 2026 (ieri)"],
  ["Orario", `15:00–16:30 · ${formatMinutes(90)}`],
  ["Materia", "Matematica"],
  ["Argomento", "equazioni di secondo grado"],
  ["Importo", `${formatEuro(3000)} a ${formatEuro(2000)}/h`],
];

export function MatitaDemo() {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery(REDUCED_MOTION, false);
  const [inked, setInked] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusStatus = useRef(false);

  // The button disappears when pressed: the focus moves to what replaced it.
  useEffect(() => {
    if (inked && focusStatus.current) {
      focusStatus.current = false;
      statusRef.current?.focus();
    }
  }, [inked]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || inked || reducedMotion || typeof IntersectionObserver !== "function") return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio >= 0.6)) {
          observer.disconnect();
          timer = window.setTimeout(() => setInked(true), INK_DELAY_MS);
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [inked, reducedMotion]);

  const HeadIcon = inked ? INK_ICON : MATITA_ICON;

  return (
    <div
      ref={cardRef}
      className={cx(
        "relative isolate rounded-sm p-5 transition-colors duration-(--rf-dur-ink) ease-ink",
        "before:absolute before:inset-0 before:-z-10 before:rounded-sm before:pencil-draft before:transition-opacity before:duration-(--rf-dur-ink) before:ease-ink before:content-['']",
        inked ? "bg-paper-raised text-ink before:opacity-0" : "text-pencil",
      )}
    >
      <p className="m-0 flex items-center gap-2 text-caption uppercase">
        <HeadIcon size={16} aria-hidden />
        {inked ? "Nel registro" : "Matita propone"}
      </p>
      <p className="mt-3 mb-0 text-[0.875rem] leading-5">
        Matita ha letto:{" "}
        <q className="font-display text-[0.9375rem] italic">
          ieri 15–16:30 matematica con Luca, equazioni di secondo grado
        </q>
      </p>
      <dl className="mt-4 mb-0 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[0.9375rem] leading-[1.375rem]">
        {FIELDS.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className={inked ? "text-ink-3" : undefined}>{label}</dt>
            <dd className="m-0">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 min-h-control">
        {inked ? (
          <p
            ref={statusRef}
            role="status"
            tabIndex={-1}
            className="m-0 flex min-h-control items-center text-[0.9375rem] text-ink focus:outline-none focus-visible:shadow-none"
          >
            Lezione registrata · nel saldo
          </p>
        ) : (
          <Button
            variant="ink"
            icon={INK_ICON}
            onPress={() => {
              focusStatus.current = true;
              setInked(true);
            }}
          >
            Ripassa a penna
          </Button>
        )}
      </div>
      <span
        aria-hidden
        className={cx(
          "absolute right-0 bottom-0 left-0 h-0.5 origin-left bg-ink transition-transform duration-(--rf-dur-ink) ease-ink",
          inked ? "scale-x-100" : "scale-x-0",
        )}
      />
    </div>
  );
}
