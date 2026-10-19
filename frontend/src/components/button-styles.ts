// Class recipes of the buttons (docs/design/02-design-system.md §9.1), shared by <Button>,
// <LinkButton> and any React Aria trigger that must look like a button.
import type { Icon } from "@phosphor-icons/react";
import { cx } from "./utils";

export type ButtonVariant = "ink" | "line" | "quiet" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonLookProps {
  /** ink = Inchiostro (primary) · line = Filo · quiet = Quieto · danger = Pericolo. */
  variant?: ButtonVariant;
  /** `sm` is 36 px on ≥ 768 px only (actions inside ledger rows, Matita cards); 44 px on mobile. */
  size?: ButtonSize;
  /** Leading icon (20 px; 16 px when small). */
  icon?: Icon;
  /** 44×44 icon-only button: needs an `aria-label` (02 §6: «+», chiudi). */
  square?: boolean;
  fullWidth?: boolean;
  className?: string;
}

const BASE =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xs font-ui font-semibold leading-none whitespace-nowrap select-none no-underline transition-[background-color,color,border-color,translate] data-pressed:translate-y-px active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

const VARIANT: Record<ButtonVariant, string> = {
  ink: "bg-ink text-on-ink data-hovered:bg-[color-mix(in_oklab,var(--rf-ink)_86%,var(--rf-paper))] hover:bg-[color-mix(in_oklab,var(--rf-ink)_86%,var(--rf-paper))]",
  line: "border border-control bg-transparent text-ink data-hovered:bg-paper-sunk hover:bg-paper-sunk",
  quiet:
    "bg-transparent text-ink-2 underline-offset-4 data-hovered:text-ink data-hovered:underline hover:text-ink hover:underline",
  danger:
    "border border-debito bg-transparent text-debito data-hovered:bg-debito-wash hover:bg-debito-wash",
};

function sizeClasses(size: ButtonSize, square: boolean, variant: ButtonVariant): string {
  const md = square
    ? "h-control w-control px-0"
    : cx("h-control text-[0.9375rem]", variant === "quiet" ? "px-2.5" : "px-4");
  if (size === "md") return md;
  return cx(
    md,
    square ? "md:h-control-sm md:w-control-sm" : "md:h-control-sm md:px-3 md:text-[0.875rem]",
  );
}

export function buttonClasses({
  variant = "line",
  size = "md",
  square = false,
  fullWidth = false,
  className,
}: Omit<ButtonLookProps, "icon">): string {
  return cx(
    BASE,
    VARIANT[variant],
    sizeClasses(size, square, variant),
    fullWidth && "w-full",
    className,
  );
}

