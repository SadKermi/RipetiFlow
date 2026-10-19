// Segmented control (docs/design/02-design-system.md §9.5): a radiogroup with arrow keys.
// «Contanti | Bonifico | Altro», «Sistema | Chiaro | Scuro», «Tutti | Ti devono | In credito».
import type { Icon } from "@phosphor-icons/react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import { LABEL } from "./field-styles";
import { cx } from "./utils";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: Icon;
}

export interface SegmentedControlProps<V extends string> {
  /** Visible label above (e.g. «Come»), or `aria-label` only when the context names it. */
  label?: string;
  "aria-label"?: string;
  options: readonly SegmentOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  /** Segments share the full width (forms on mobile). */
  fullWidth?: boolean;
  isDisabled?: boolean;
  className?: string;
}

export function SegmentedControl<V extends string>({
  label,
  "aria-label": ariaLabel,
  options,
  value,
  onChange,
  fullWidth = false,
  isDisabled,
  className,
}: SegmentedControlProps<V>) {
  return (
    <RadioGroup
      aria-label={label ? undefined : ariaLabel}
      value={value}
      onChange={(next) => onChange(next as V)}
      orientation="horizontal"
      isDisabled={isDisabled}
      className={cx("block", className)}
    >
      {label && <Label className={LABEL}>{label}</Label>}
      <div
        className={cx(
          "gap-0.5 rounded-xs border border-control bg-paper-raised p-0.5",
          fullWidth ? "grid auto-cols-fr grid-flow-col" : "inline-flex",
        )}
      >
        {options.map(({ value: optionValue, label: optionLabel, icon: IconComponent }) => (
          <Radio
            key={optionValue}
            value={optionValue}
            className={cx(
              "inline-flex h-control cursor-pointer items-center justify-center gap-1.5 rounded-[2px] px-3.5 text-[0.9375rem] font-medium whitespace-nowrap text-ink-2 transition-[background-color,color] select-none md:h-[2.375rem]",
              "data-hovered:text-ink data-selected:bg-ink data-selected:text-on-ink",
              "data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-ink data-focus-visible:shadow-[0_0_0_5px_var(--rf-focus-halo)]",
              "data-disabled:cursor-not-allowed data-disabled:opacity-40",
            )}
          >
            {IconComponent && <IconComponent size={16} aria-hidden className="shrink-0" />}
            {optionLabel}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
