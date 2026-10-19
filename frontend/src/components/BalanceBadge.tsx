// Balance badge (docs/design/02-design-system.md §9.7). A balance always has a WORD (deve /
// credito / in pari), never a sign; the colour only repeats it. Amounts are `balance_cents` of the
// API (negative = the student owes); the time equivalent is `credit_minutes`, never recomputed.
import { formatEuroAbs } from "@/lib/format";
import { ApproxDuration } from "./icons";
import { balanceSpeech, balanceStatus, cx } from "./utils";

export interface BalanceProps {
  /** `balance.balance_cents` (negative = ti deve, positive = credito). */
  cents: number;
  /** `balance.credit_minutes`: shown as «≈ 2 h» next to a credit; null = only the amount. */
  creditMinutes?: number | null;
  className?: string;
}

const BADGE =
  "inline-flex h-6 items-center gap-1.5 rounded-xs px-2 text-[0.75rem] leading-none font-semibold tracking-[0.02em] whitespace-nowrap";
const BADGE_AMOUNT = "font-money text-[0.8125rem] font-medium tracking-normal tabular-nums";

/**
 * Filled badge: «Ti deve 120,00 €» (debit wash), «Credito 40,00 € · ≈ 2 h» (credit wash),
 * «In pari» (inner rule, ink-2).
 */
export function BalanceBadge({ cents, creditMinutes = null, className }: BalanceProps) {
  const status = balanceStatus(cents);
  const speech = balanceSpeech(cents, creditMinutes);
  if (status === "settled") {
    return (
      <span className={cx(BADGE, "border border-rule-strong text-ink-2", className)}>In pari</span>
    );
  }
  return (
    <span
      className={cx(
        BADGE,
        status === "debt" ? "bg-debito-wash text-debito" : "bg-credito-wash text-credito",
        className,
      )}
    >
      <span className="sr-only">{speech}</span>
      <span aria-hidden className="inline-flex items-center gap-1.5">
        {status === "debt" ? "Ti deve" : "Credito"}
        <span className={BADGE_AMOUNT}>{formatEuroAbs(cents)}</span>
        {status === "credit" && creditMinutes !== null && (
          <>
            <span>·</span>
            <ApproxDuration minutes={creditMinutes} className={BADGE_AMOUNT} />
          </>
        )}
      </span>
    </span>
  );
}

/** «Bozza» badge: dashed outline, graphite text (a Matita proposal, not in the balance). */
export function DraftBadge({ label = "Bozza", className }: { label?: string; className?: string }) {
  return <span className={cx(BADGE, "pencil-dash text-pencil", className)}>{label}</span>;
}

/**
 * Balance without background, for long lists (Conti aperti, Studenti): «DEVE 120,00 €» in
 * debit red, «CREDITO 40,00 €» in credit blue with «≈ 2 h» under it, «IN PARI» in ink-2.
 */
export function BalanceInline({
  cents,
  creditMinutes = null,
  className,
  amountClassName,
}: BalanceProps & { amountClassName?: string }) {
  const status = balanceStatus(cents);
  const speech = balanceSpeech(cents, creditMinutes);
  const color =
    status === "debt" ? "text-debito" : status === "credit" ? "text-credito" : "text-ink-2";
  const word = status === "debt" ? "Deve" : status === "credit" ? "Credito" : "In pari";
  return (
    <span className={cx("inline-flex flex-col items-end", className)}>
      <span className="sr-only">{speech}</span>
      <span aria-hidden className={cx("inline-flex items-baseline gap-2 whitespace-nowrap", color)}>
        <span className="text-[0.75rem] leading-4 font-semibold tracking-[0.04em] uppercase">
          {word}
        </span>
        {status !== "settled" && (
          <span
            className={cx(
              "font-money text-[1rem] leading-5 font-medium tabular-nums",
              amountClassName,
            )}
          >
            {formatEuroAbs(cents)}
          </span>
        )}
      </span>
      {status === "credit" && creditMinutes !== null && (
        <span aria-hidden className="mt-0.5 text-[0.8125rem] leading-4 text-ink-3">
          <ApproxDuration minutes={creditMinutes} />
        </span>
      )}
    </span>
  );
}
