// Buttons (docs/design/02-design-system.md §9.1): Inchiostro (primary, once per view), Filo,
// Quieto, Pericolo; square 44×44 icon-only; small 36 px only from 768 px up (44 below).
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { Link, type LinkProps } from "react-router";
import { type ButtonLookProps, type ButtonSize, buttonClasses } from "./button-styles";
import { cx } from "./utils";

/** Three static dots: the loading sign of buttons and states (02 §9.1: never animated). */
export function Dots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("inline-flex items-center gap-[3px]", className)}>
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  );
}

function Content({
  icon: IconComponent,
  size,
  isPending,
  children,
}: {
  icon?: Icon;
  size: ButtonSize;
  isPending: boolean;
  children?: ReactNode;
}) {
  const iconSize = size === "sm" ? 16 : 20;
  return (
    <>
      {isPending ? (
        <Dots className="w-5 justify-center" />
      ) : (
        IconComponent && <IconComponent size={iconSize} aria-hidden className="shrink-0" />
      )}
      {children}
    </>
  );
}

export interface ButtonProps
  extends ButtonLookProps,
    Omit<AriaButtonProps, "className" | "children" | "style"> {
  children?: ReactNode;
}

/**
 * React Aria button with our look. `isPending` keeps the label, swaps the icon for three static
 * dots, blocks presses (no double submit) and sets `aria-busy`.
 */
export function Button({
  variant = "line",
  size = "md",
  icon,
  square = false,
  fullWidth = false,
  className,
  isPending = false,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <AriaButton
      {...rest}
      type={type}
      isPending={isPending}
      aria-busy={isPending || undefined}
      className={buttonClasses({ variant, size, square, fullWidth, className })}
    >
      <Content icon={icon} size={size} isPending={isPending}>
        {children}
      </Content>
    </AriaButton>
  );
}

export interface LinkButtonProps extends ButtonLookProps, Omit<LinkProps, "className"> {
  children?: ReactNode;
}

/** A router link that looks like a button (e.g. «Vai a Oggi», «Torna agli studenti»). */
export function LinkButton({
  variant = "line",
  size = "md",
  icon,
  square = false,
  fullWidth = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link {...rest} className={buttonClasses({ variant, size, square, fullWidth, className })}>
      <Content icon={icon} size={size} isPending={false}>
        {children}
      </Content>
    </Link>
  );
}

/** Inline links and link-buttons keep a 44 px touch area without changing the line (02 §2). */
const INLINE =
  "relative inline-block cursor-pointer px-1 py-3 -mx-1 -my-3 text-inherit underline decoration-1 underline-offset-[3px] data-hovered:text-ink hover:text-ink";

/** Text button inside a sentence or a band: «Riprova», «mandalo di nuovo». */
export function InlineButton({
  className,
  children,
  ...rest
}: Omit<AriaButtonProps, "className" | "children" | "style"> & {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <AriaButton {...rest} className={cx(INLINE, "font-semibold", className)}>
      {children}
    </AriaButton>
  );
}

/** Router link inside a sentence: «Agenda», «Impostazioni», with a 44 px touch area. */
export function InlineLink({ className, children, ...rest }: LinkProps & { className?: string }) {
  return (
    <Link {...rest} className={cx(INLINE, className)}>
      {children}
    </Link>
  );
}
