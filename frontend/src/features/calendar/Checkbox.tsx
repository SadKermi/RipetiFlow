import { CheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { cx } from "@/components";

/**
 * A checkbox with the look of the controls (02 §9.2: 1 px control border, radius 3, ink when
 * checked) and a 44 px touch row. Used for «Elimina anche il calendario «RipetiFlow» da Google».
 */
export function Checkbox({
  isSelected,
  onChange,
  isDisabled,
  children,
  className,
}: {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  isDisabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AriaCheckbox
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
      className={cx(
        "group flex min-h-touch cursor-pointer items-start gap-3 py-2.5 text-body text-ink data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs border border-control bg-paper-raised text-on-ink transition-colors",
          "group-data-selected:border-ink group-data-selected:bg-ink",
          "group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-ink group-data-focus-visible:shadow-[0_0_0_5px_var(--rf-focus-halo)]",
        )}
      >
        {isSelected && <CheckIcon size={14} />}
      </span>
      <span className="min-w-0">{children}</span>
    </AriaCheckbox>
  );
}
