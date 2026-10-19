// Form fields (docs/design/02-design-system.md §9.2): label above, help and error below, errors as a
// 2 px border + Warning icon, wired with aria-invalid / aria-describedby by React Aria.
import { WarningIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import {
  FieldError,
  Input,
  Label,
  NumberField as AriaNumberField,
  type NumberFieldProps as AriaNumberFieldProps,
  Text,
  TextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { centsToInput, parseEuroInput } from "@/lib/format";
import { CONTROL, ERROR, HINT, LABEL, LABEL_OPTIONAL, TEXTAREA } from "./field-styles";
import { cx } from "./utils";

export interface FieldChromeProps {
  label: string;
  /** Help under the field (13/18 ink-3). */
  hint?: ReactNode;
  /** Error message (local validation or `errors[].message` from the server). */
  error?: string | null;
  /** Adds «(facoltativo)» to the label. */
  optional?: boolean;
  /** Adds «*» to the label and marks the field required for assistive tech. */
  required?: boolean;
  className?: string;
}

/** Label text with the optional/required markers. */
export function FieldLabel({
  label,
  optional,
  required,
  className,
}: {
  label: string;
  optional?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <Label className={cx(LABEL, className)}>
      {label}
      {required && <span aria-hidden> *</span>}
      {optional && <span className={LABEL_OPTIONAL}> (facoltativo)</span>}
    </Label>
  );
}

/** Error under a field: Warning icon + message. Rendered by React Aria only while invalid. */
export function FieldErrorMessage({ children }: { children?: ReactNode }) {
  return (
    <FieldError className={ERROR}>
      <WarningIcon size={16} aria-hidden className="mt-px shrink-0" />
      <span>{children}</span>
    </FieldError>
  );
}

/** «37/200» when ≤ `threshold` characters are left (server limits, 02 §9.2). */
function counterText(length: number, max: number): string {
  return `${length.toLocaleString("it-IT", { useGrouping: "always" })}/${String(max)}`;
}

function Description({
  hint,
  length,
  maxLength,
  threshold,
}: {
  hint?: ReactNode;
  length: number;
  maxLength?: number;
  threshold: number;
}) {
  const showCounter = maxLength !== undefined && maxLength - length <= threshold;
  if (!hint && !showCounter) return null;
  return (
    <Text slot="description" className={cx(HINT, "flex items-start justify-between gap-3")}>
      {hint ? <span>{hint}</span> : <span />}
      {showCounter && (
        <span className="shrink-0 tabular-nums">{counterText(length, maxLength)}</span>
      )}
    </Text>
  );
}

export interface TextFieldProps
  extends
    FieldChromeProps,
    Omit<AriaTextFieldProps, "className" | "isInvalid" | "isRequired" | "children" | "style"> {
  placeholder?: string;
  /** Extra classes for the <input>, e.g. Literata italic for «Argomento». */
  inputClassName?: string;
  /** The counter appears when this many characters (or fewer) are left. Default 40. */
  counterThreshold?: number;
}

export function TextField({
  label,
  hint,
  error,
  optional,
  required,
  className,
  placeholder,
  inputClassName,
  counterThreshold = 40,
  maxLength,
  value,
  defaultValue,
  onChange,
  ...rest
}: TextFieldProps) {
  const [ownLength, setOwnLength] = useState((value ?? defaultValue ?? "").length);
  const length = value?.length ?? ownLength;
  return (
    <AriaTextField
      {...rest}
      value={value}
      defaultValue={defaultValue}
      onChange={(next) => {
        setOwnLength(next.length);
        onChange?.(next);
      }}
      maxLength={maxLength}
      isRequired={required}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={cx("block", className)}
    >
      <FieldLabel label={label} optional={optional} required={required} />
      <Input placeholder={placeholder} className={cx(CONTROL, inputClassName)} />
      <FieldErrorMessage>{error}</FieldErrorMessage>
      <Description hint={hint} length={length} maxLength={maxLength} threshold={counterThreshold} />
    </AriaTextField>
  );
}

export interface TextAreaFieldProps extends TextFieldProps {
  rows?: number;
}

/** Multi-line text (Note: ≤ 4000, «Note (solo per te)»). */
export function TextAreaField({
  label,
  hint,
  error,
  optional,
  required,
  className,
  placeholder,
  inputClassName,
  counterThreshold = 40,
  maxLength,
  value,
  defaultValue,
  onChange,
  rows = 3,
  ...rest
}: TextAreaFieldProps) {
  const [ownLength, setOwnLength] = useState((value ?? defaultValue ?? "").length);
  const length = value?.length ?? ownLength;
  return (
    <AriaTextField
      {...rest}
      value={value}
      defaultValue={defaultValue}
      onChange={(next) => {
        setOwnLength(next.length);
        onChange?.(next);
      }}
      maxLength={maxLength}
      isRequired={required}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={cx("block", className)}
    >
      <FieldLabel label={label} optional={optional} required={required} />
      <TextArea rows={rows} placeholder={placeholder} className={cx(TEXTAREA, inputClassName)} />
      <FieldErrorMessage>{error}</FieldErrorMessage>
      <Description hint={hint} length={length} maxLength={maxLength} threshold={counterThreshold} />
    </AriaTextField>
  );
}

export interface NumberFieldProps
  extends
    FieldChromeProps,
    Omit<
      AriaNumberFieldProps,
      | "className"
      | "isInvalid"
      | "isRequired"
      | "children"
      | "style"
      | "value"
      | "defaultValue"
      | "onChange"
    > {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  /** Text after the number inside the field (e.g. «min»), in ink-3. */
  suffix?: string;
}

/** Whole numbers with it-IT parsing (React Aria NumberField, no stepper buttons). */
export function NumberField({
  label,
  hint,
  error,
  optional,
  required,
  className,
  placeholder,
  suffix,
  value,
  onChange,
  formatOptions = { maximumFractionDigits: 0 },
  ...rest
}: NumberFieldProps) {
  return (
    <AriaNumberField
      {...rest}
      value={value ?? Number.NaN}
      onChange={(next) => onChange(Number.isNaN(next) ? null : next)}
      formatOptions={formatOptions}
      isRequired={required}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={cx("block", className)}
    >
      <FieldLabel label={label} optional={optional} required={required} />
      <div className="relative">
        <Input
          placeholder={placeholder}
          className={cx(
            CONTROL,
            "font-money tabular-nums",
            suffix && "pr-14 data-invalid:pr-[3.4375rem]",
          )}
        />
        {suffix && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-money text-ink-3"
          >
            {suffix}
          </span>
        )}
      </div>
      <FieldErrorMessage>{error}</FieldErrorMessage>
      {hint && (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      )}
    </AriaNumberField>
  );
}

export const INVALID_AMOUNT_MESSAGE = "Scrivi un importo in euro, per esempio 25,50.";

export interface MoneyFieldProps
  extends
    FieldChromeProps,
    Omit<
      AriaTextFieldProps,
      | "className"
      | "isInvalid"
      | "isRequired"
      | "children"
      | "style"
      | "value"
      | "defaultValue"
      | "onChange"
      | "type"
      | "inputMode"
    > {
  /** Integer cents, or null when empty / unreadable. */
  value: number | null;
  onChange: (cents: number | null) => void;
  /** «€» (amounts) or «€/h» (rates), fixed on the right in ink-3. */
  unit?: "€" | "€/h";
  placeholder?: string;
}

/**
 * Amount in euros (02 §9.2): Plex Mono 18/500, «€» fixed on the right, decimal keypad, accepts a
 * comma or a dot, formats on blur ("12,5" → "12,50"). The value is always integer cents
 * (parseEuroInput): no float ever touches it. Unreadable text → null + a local error on blur.
 */
export function MoneyField({
  label,
  hint,
  error,
  optional,
  required,
  className,
  placeholder,
  unit = "€",
  value,
  onChange,
  onBlur,
  onFocus,
  ...rest
}: MoneyFieldProps) {
  const [text, setText] = useState(() => (value === null ? "" : centsToInput(value)));
  const [seen, setSeen] = useState(value);
  const [focused, setFocused] = useState(false);
  const [unreadable, setUnreadable] = useState(false);

  // A new value from outside (chip «67,00», reset of the form) replaces the text, unless it is
  // just the echo of what is being typed.
  if (value !== seen) {
    setSeen(value);
    if (value !== parseEuroInput(text)) {
      setText(value === null ? "" : centsToInput(value));
      setUnreadable(false);
    }
  }

  const shownError = error ?? (unreadable && !focused ? INVALID_AMOUNT_MESSAGE : null);
  const padRight =
    unit === "€" ? "pr-9 data-invalid:pr-[2.1875rem]" : "pr-14 data-invalid:pr-[3.4375rem]";

  return (
    <AriaTextField
      {...rest}
      value={text}
      onChange={(next) => {
        setText(next);
        const cents = parseEuroInput(next);
        setUnreadable(next.trim() !== "" && cents === null);
        setSeen(cents);
        onChange(cents);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        const cents = parseEuroInput(text);
        if (cents !== null) setText(centsToInput(cents));
        onBlur?.(event);
      }}
      inputMode="decimal"
      isRequired={required}
      isInvalid={Boolean(shownError)}
      validationBehavior="aria"
      className={cx("block", className)}
    >
      <FieldLabel label={label} optional={optional} required={required} />
      <div className="relative">
        <Input
          placeholder={placeholder}
          autoComplete="off"
          className={cx(
            CONTROL,
            "font-money text-[1.125rem] font-medium tabular-nums placeholder:font-normal",
            padRight,
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-money text-[1.125rem] text-ink-3"
        >
          {unit}
        </span>
      </div>
      <FieldErrorMessage>{shownError}</FieldErrorMessage>
      {hint && (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      )}
    </AriaTextField>
  );
}

/**
 * Note above the action bar for what has no field (03 §10.4): Warning in --rf-danger + 14 px ink
 * text. The form stays open and filled. Renders nothing without children.
 */
export function FormNote({ children, className }: { children?: ReactNode; className?: string }) {
  if (children === null || children === undefined || children === false || children === "") {
    return null;
  }
  return (
    <div
      role="alert"
      className={cx("flex items-start gap-2 text-[0.875rem] leading-5 text-ink", className)}
    >
      <WarningIcon size={20} aria-hidden className="shrink-0 text-danger" />
      <div className="min-w-0 pt-px">{children}</div>
    </div>
  );
}
