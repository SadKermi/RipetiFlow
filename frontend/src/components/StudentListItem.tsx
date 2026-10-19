// Student row of the lists (docs/design/02-design-system.md §9.8): name, class · next/last lesson,
// balance without background, CaretRight. The whole row is a link to the student's page.
import { CaretRightIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { Link } from "react-router";
import type { StudentSummary } from "@/lib/api/types";
import { BalanceInline } from "./BalanceBadge";
import { cx, studentMeta } from "./utils";

export interface StudentListItemProps {
  student: StudentSummary;
  /** Today in the tutor's timezone. */
  today: string;
  /** Defaults to /studenti/{id}. */
  href?: string;
  /** «archiviato» caption (archived students with an open balance in «Conti aperti»). */
  showArchived?: boolean;
  className?: string;
}

export function StudentListItem({
  student,
  today,
  href,
  showArchived = false,
  className,
}: StudentListItemProps) {
  const id = useId();
  const meta = studentMeta(student, today);
  // The link is the student's name (its whole visible text, WCAG 2.5.3) and is stretched over the
  // row with ::after, so the row stays one tap target; class, next lesson and balance are its
  // description. Wrapping them in the link would name it with text that is not on screen
  // («ti deve 120 euro» for «DEVE 120,00 €»).
  return (
    <div
      className={cx(
        "relative flex min-h-16 items-center gap-3 border-b border-rule py-3 text-ink transition-colors hover:bg-paper-sunk",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <Link
          to={href ?? `/studenti/${student.id}`}
          aria-describedby={`${id}-meta ${id}-balance`}
          className={cx(
            "block truncate text-[1rem] leading-[1.375rem] font-medium no-underline",
            "after:absolute after:inset-0 after:content-['']",
            "focus-visible:shadow-none focus-visible:outline-none",
            "focus-visible:after:shadow-[0_0_0_5px_var(--rf-focus-halo)] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ink",
          )}
        >
          {student.display_name}
        </Link>
        <span id={`${id}-meta`} className="block truncate text-[0.875rem] leading-5 text-ink-3">
          {meta}
          {showArchived && student.archived && (meta ? " · archiviato" : "archiviato")}
        </span>
      </span>
      <span id={`${id}-balance`}>
        <BalanceInline
          cents={student.balance.balance_cents}
          creditMinutes={student.balance.credit_minutes}
        />
      </span>
      <CaretRightIcon size={20} aria-hidden className="shrink-0 text-ink-3" />
    </div>
  );
}
