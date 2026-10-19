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
  return (
    <Link
      to={href ?? `/studenti/${student.id}`}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-meta ${id}-balance`}
      className={cx(
        "flex min-h-16 items-center gap-3 border-b border-rule py-3 text-ink no-underline transition-colors hover:bg-paper-sunk",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-name`} className="block truncate text-[1rem] leading-[1.375rem] font-medium">
          {student.display_name}
        </span>
        <span
          id={`${id}-meta`}
          className="block truncate text-[0.875rem] leading-5 text-ink-3"
        >
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
    </Link>
  );
}
