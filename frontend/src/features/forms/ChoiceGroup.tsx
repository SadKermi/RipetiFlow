// An explicit choice between options with a sentence each (D-16: «Solo per le nuove lezioni» /
// «Ricalcola…»). A radiogroup with nothing preselected, 44 px rows, arrows between the options.
import type { ReactNode } from "react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import { LABEL } from "@/components/field-styles";
import { cx } from "@/components/utils";

export interface Choice<V extends string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
}

export function ChoiceGroup<V extends string>({
  label,
  options,
  value,
  onChange,
  isDisabled,
  className,
}: {
  label: string;
  options: readonly Choice<V>[];
  value: V | null;
  onChange: (value: V) => void;
  isDisabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroup
      value={value}
      onChange={(next) => onChange(next as V)}
      isDisabled={isDisabled}
      className={cx("block", className)}
    >
      <Label className={LABEL}>{label}</Label>
      <div className="flex flex-col">
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            className={cx(
              "group flex min-h-11 cursor-pointer items-start gap-3 rounded-xs py-2 outline-none",
              "data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-ink data-focus-visible:shadow-[0_0_0_5px_var(--rf-focus-halo)]",
              "data-disabled:cursor-not-allowed data-disabled:opacity-40",
            )}
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-control bg-paper-raised group-data-selected:border-ink"
            >
              <span className="size-2.5 rounded-full bg-ink opacity-0 group-data-selected:opacity-100" />
            </span>
            <span className="min-w-0">
              <span className="block text-body text-ink">{option.label}</span>
              {option.description && (
                <span className="block text-[0.875rem] leading-5 text-ink-2">
                  {option.description}
                </span>
              )}
            </span>
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
