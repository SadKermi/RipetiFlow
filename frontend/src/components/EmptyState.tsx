// Empty states (docs/design/02-design-system.md §9.10): one sentence that says what happens + one
// action. No illustrations: at most the «pagina bianca», six empty dashed lines of the ledger.
import type { ReactNode } from "react";
import { cx } from "./utils";

/** Six empty ruled lines (--rf-rule, dashed), no text: the blank page of the ledger. */
export function BlankPage({ lines = 6, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cx("flex flex-col", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="block h-10 bg-[linear-gradient(90deg,var(--rf-rule)_6px,transparent_0)] bg-[length:11px_1px] bg-bottom bg-repeat-x"
        />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  /** The sentence, e.g. «Nessuno studente. Inizia dal primo: nome e tariffa bastano.» */
  children: ReactNode;
  /** One action (a Button / LinkButton / InlineButton). */
  action?: ReactNode;
  /** «pagina bianca» above the sentence (empty ledger). */
  blankPage?: boolean;
  /** `quiet` = ink-2 sentence, no fuss («Tutti in pari.»). */
  tone?: "default" | "quiet";
  className?: string;
}

export function EmptyState({
  children,
  action,
  blankPage = false,
  tone = "default",
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("py-6", className)}>
      {blankPage && <BlankPage className="mb-4" />}
      <p
        className={cx(
          "m-0 max-w-[36rem] text-body text-pretty",
          tone === "quiet" ? "text-ink-2" : "text-ink",
        )}
      >
        {children}
      </p>
      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
