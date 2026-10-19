// Loading, error and missing-page states (docs/design/02-design-system.md §9.15, 03 §10).
import { CloudSlashIcon, type Icon, InfoIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Dots, InlineButton } from "./Button";
import { cx, loadErrorText, useDelayedFlag } from "./utils";

const SKELETON_WIDTHS = ["40%", "70%", "25%"] as const;

export interface SkeletonRowsProps {
  /** How many rows (max 4, 02 §9.15). */
  rows?: number;
  /** Bars per row and their widths: default 40 / 70 / 25 %. */
  widths?: readonly string[];
  /** Height of a row (the real list's: 64 px students, 56/48 ledger, 44 sign-in buttons…). */
  rowClassName?: string;
  /** Wait before showing anything, so fast answers never flash (default 300 ms). */
  delayMs?: number;
  /** Hidden text for screen readers. */
  label?: string;
  className?: string;
}

/**
 * Skeleton rows: static `--rf-paper-sunk` bars 12 px high (radius 0), never animated; they appear
 * only when loading takes more than 300 ms. The container is `aria-busy` with «Caricamento…».
 */
export function SkeletonRows({
  rows = 3,
  widths = SKELETON_WIDTHS,
  rowClassName = "min-h-row",
  delayMs = 300,
  label = "Caricamento…",
  className,
}: SkeletonRowsProps) {
  const visible = useDelayedFlag(delayMs);
  return (
    <div aria-busy="true" className={className} data-testid="skeleton">
      <span role="status" className="sr-only">
        {label}
      </span>
      {visible &&
        Array.from({ length: Math.min(rows, 4) }, (_, row) => (
          <div
            key={row}
            aria-hidden
            className={cx("flex items-center gap-4 border-b border-rule", rowClassName)}
          >
            {widths.map((width, bar) => (
              <span key={bar} className="block h-3 bg-paper-sunk" style={{ width }} />
            ))}
          </div>
        ))}
    </div>
  );
}

export interface LoadErrorBandProps {
  /** Retry the request. */
  onRetry: () => void;
  isRetrying?: boolean;
  /** When the cached data on screen was fetched (dataUpdatedAt); absent = nothing cached. */
  cachedAt?: Date | number | null;
  /** The request never reached the server. */
  offline?: boolean;
  /** Tutor's timezone for «delle 9:12». */
  timeZone?: string;
  className?: string;
}

/**
 * Load-error band under the page title: rule on top, CloudSlash, one sentence in ink and a
 * «Riprova» link-button with a 44 px area. With cached data the sentence says how old it is.
 */
export function LoadErrorBand({
  onRetry,
  isRetrying = false,
  cachedAt,
  offline,
  timeZone,
  className,
}: LoadErrorBandProps) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-2 border-t border-rule-strong pt-2.5 pb-1 text-[0.9375rem] leading-[1.375rem] text-ink",
        className,
      )}
    >
      <CloudSlashIcon size={20} aria-hidden className="mt-px shrink-0 text-danger" />
      <p className="m-0 min-w-0 flex-1">
        {loadErrorText({ cachedAt, offline, timeZone })}{" "}
        <InlineButton onPress={onRetry} isPending={isRetrying} className="text-ink">
          {isRetrying ? <Dots /> : "Riprova"}
        </InlineButton>
      </p>
    </div>
  );
}

export interface NoteProps {
  icon?: Icon;
  /** Colour of the icon: `danger` for warnings and errors, `muted` for information. */
  tone?: "danger" | "muted" | "pencil";
  children: ReactNode;
  /** `alert` for something that went wrong now; `status` for information; none for static text. */
  role?: "alert" | "status";
  className?: string;
}

/** A note with an icon and ink text (session expired, «Matita non è attiva…», Calendar). */
export function Note({
  icon: IconComponent = InfoIcon,
  tone = "muted",
  children,
  role,
  className,
}: NoteProps) {
  const color =
    tone === "danger" ? "text-danger" : tone === "pencil" ? "text-pencil" : "text-ink-3";
  return (
    <div
      role={role}
      className={cx(
        "flex items-start gap-2 text-[0.9375rem] leading-[1.375rem] text-ink",
        className,
      )}
    >
      <IconComponent size={20} aria-hidden className={cx("mt-px shrink-0", color)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 401 later in any page → /accedi with this note (03 §2, §10.3). */
export function SessionExpiredNote({ className }: { className?: string }) {
  return (
    <Note role="status" className={className}>
      La sessione è scaduta. Entra di nuovo: torni dove eri.
    </Note>
  );
}

export interface PageMessageProps {
  /** Literata display-m: «Pagina non trovata», «Studente non trovato». */
  title: string;
  /** One sentence. */
  children: ReactNode;
  /** One ink link back («Vai a Oggi», «Torna agli studenti»). */
  action?: ReactNode;
  className?: string;
}

/** Missing page / missing student: title, one sentence, one way back. No codes, no pictures. */
export function PageMessage({ title, children, action, className }: PageMessageProps) {
  return (
    <section aria-labelledby="rf-page-message" className={cx("max-w-[36rem] py-10", className)}>
      <h1
        id="rf-page-message"
        className="m-0 font-display text-display-m font-normal text-balance text-ink"
      >
        {title}
      </h1>
      <p className="mt-3 mb-0 text-body text-ink-2">{children}</p>
      {action && <div className="mt-6 flex flex-wrap gap-2">{action}</div>}
    </section>
  );
}
