// Day and time fields (docs/design/02-design-system.md §9.3). Dates are "YYYY-MM-DD" calendar days
// in the tutor's timezone: the caller passes `today` (todayIn(profile.timezone)), never the
// browser's date.
import {
  ArrowRightIcon,
  CalendarDotsIcon,
  CaretLeftIcon,
  CaretRightIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { CalendarDate } from "@internationalized/date";
import { type ReactNode, useId, useRef, useState } from "react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Dialog,
  DialogTrigger,
  Heading,
  Input,
  Popover,
  TextField as AriaTextField,
} from "react-aria-components";
import {
  addDays,
  addMinutesToTime,
  daysBetween,
  formatMinutes,
  minutesBetween,
  parseIsoDate,
} from "@/lib/format";
import { parseTimeInput } from "@/lib/forms";
import { CONTROL, CONTROL_BOX, ERROR, HINT, LABEL } from "./field-styles";
import { cx, formatDayFieldValue, useIsMobile } from "./utils";

/** Text-chip buttons under a field («Oggi · Ieri · Altro…», «+1 h · +1 h 30 · +2 h»). */
const CHIP =
  "relative -my-3 inline-block cursor-pointer px-1 py-3 text-[0.875rem] leading-5 font-medium text-ink-2 underline-offset-4 data-hovered:text-ink data-hovered:underline data-disabled:cursor-not-allowed data-disabled:opacity-40";

function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="mt-1 flex flex-wrap items-center gap-x-1">
      {children}
    </div>
  );
}

function ChipDot() {
  return (
    <span aria-hidden className="text-ink-3">
      ·
    </span>
  );
}

export interface DayFieldProps {
  label?: string;
  /** "YYYY-MM-DD". */
  value: string;
  onChange: (date: string) => void;
  /** Today in the tutor's timezone ("YYYY-MM-DD"). */
  today: string;
  /** Tutor's timezone for «oggi» / «ieri» next to the value. */
  timeZone?: string;
  error?: string | null;
  hint?: ReactNode;
  minValue?: string;
  maxValue?: string;
  isDisabled?: boolean;
  /** «Oggi · Ieri · Altro…» under the field (default true). */
  shortcuts?: boolean;
  className?: string;
}

/**
 * «Giorno» (02 §9.3): a field showing «mar 6 ott 2026» + «oggi», with «Oggi · Ieri · Altro…»
 * under it. «Altro…» (and the field itself) opens the native date picker on mobile and a
 * 7-column calendar (Monday first, today highlighted, chosen day in ink) on desktop.
 */
export function DayField({
  label = "Giorno",
  value,
  onChange,
  today,
  error,
  hint,
  minValue,
  maxValue,
  isDisabled,
  shortcuts = true,
  className,
}: DayFieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const nativeRef = useRef<HTMLInputElement>(null);

  const selected = parseIsoDate(value);
  const todayDate = parseIsoDate(today);
  const relative = selected && todayDate ? relativeWord(value, today) : null;
  const describedBy = cx(error ? errorId : null, hint ? hintId : null) || undefined;

  function openPicker() {
    if (!mobile) {
      setOpen(true);
      return;
    }
    const input = nativeRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  function choose(date: string) {
    if (minValue && date < minValue) return;
    if (maxValue && date > maxValue) return;
    onChange(date);
  }

  return (
    <div role="group" aria-labelledby={labelId} className={cx("block", className)}>
      <span id={labelId} className={LABEL}>
        {label}
      </span>
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <AriaButton
          isDisabled={isDisabled}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-describedby={describedBy}
          aria-haspopup="dialog"
          data-rf-invalid={error ? "true" : undefined}
          onPress={openPicker}
          className={CONTROL_BOX}
        >
          <CalendarDotsIcon size={18} aria-hidden className="shrink-0 text-ink-3" />
          <span id={valueId} className="min-w-0 flex-1 truncate">
            {selected ? formatDayFieldValue(value) : "Scegli il giorno"}
            {relative && <span className="sr-only">, {relative}</span>}
          </span>
          {relative && (
            <span aria-hidden className="text-[0.875rem] text-ink-3">
              {relative}
            </span>
          )}
        </AriaButton>
        <Popover
          placement="bottom start"
          offset={6}
          className="rounded-sm border border-control bg-paper-raised p-3 shadow-popover outline-none"
        >
          <Dialog aria-label={`${label}: scegli dal calendario`} className="outline-none">
            {({ close }) => (
              <DayCalendar
                value={selected}
                today={todayDate}
                minValue={minValue}
                maxValue={maxValue}
                onChange={(date) => {
                  choose(date.toString());
                  close();
                }}
              />
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>
      {/* Mobile «Altro…»: the native picker of the phone, kept out of the a11y tree. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        value={value}
        min={minValue}
        max={maxValue}
        onChange={(event) => {
          const next = event.target.value;
          if (parseIsoDate(next)) choose(next);
        }}
      />
      {shortcuts && (
        <ChipRow label={`${label}: scorciatoie`}>
          <AriaButton className={CHIP} isDisabled={isDisabled} onPress={() => choose(today)}>
            Oggi
          </AriaButton>
          <ChipDot />
          <AriaButton
            className={CHIP}
            isDisabled={isDisabled}
            onPress={() => choose(addDays(today, -1))}
          >
            Ieri
          </AriaButton>
          <ChipDot />
          <AriaButton className={CHIP} isDisabled={isDisabled} onPress={openPicker}>
            Altro…
          </AriaButton>
        </ChipRow>
      )}
      {error && (
        <p id={errorId} className={ERROR}>
          <WarningIcon size={16} aria-hidden className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p id={hintId} className={HINT}>
          {hint}
        </p>
      )}
    </div>
  );
}

const RELATIVE_WORD: Readonly<Record<number, string>> = { [-1]: "ieri", 0: "oggi", 1: "domani" };

function relativeWord(date: string, today: string): string | null {
  return RELATIVE_WORD[daysBetween(today, date)] ?? null;
}

const NAV_BUTTON =
  "grid size-touch cursor-pointer place-items-center rounded-xs text-ink-2 data-disabled:opacity-40 data-hovered:bg-paper-sunk";

function DayCalendar({
  value,
  today,
  minValue,
  maxValue,
  onChange,
}: {
  value: CalendarDate | null;
  today: CalendarDate | null;
  minValue?: string;
  maxValue?: string;
  onChange: (date: CalendarDate) => void;
}) {
  return (
    <Calendar
      aria-label="Calendario"
      value={value}
      onChange={onChange}
      firstDayOfWeek="mon"
      minValue={minValue ? parseIsoDate(minValue) : undefined}
      maxValue={maxValue ? parseIsoDate(maxValue) : undefined}
      defaultFocusedValue={value ?? today ?? undefined}
      className="w-[19rem]"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <AriaButton slot="previous" aria-label="Mese precedente" className={NAV_BUTTON}>
          <CaretLeftIcon size={20} aria-hidden />
        </AriaButton>
        <Heading className="font-display text-[1.0625rem] font-normal first-letter:uppercase" />
        <AriaButton slot="next" aria-label="Mese successivo" className={NAV_BUTTON}>
          <CaretRightIcon size={20} aria-hidden />
        </AriaButton>
      </header>
      <CalendarGrid weekdayStyle="short" className="w-full border-collapse">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="pb-1 text-caption text-ink-3 uppercase">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => {
            const isToday = today !== null && date.compare(today) === 0;
            return (
              <CalendarCell
                date={date}
                data-rf-today={isToday || undefined}
                className={cx(
                  "mx-auto grid size-10 cursor-pointer place-items-center rounded-xs font-money text-[0.9375rem] text-ink tabular-nums outline-none",
                  "data-hovered:bg-paper-sunk data-outside-month:invisible data-disabled:cursor-not-allowed data-disabled:text-ink-3 data-disabled:opacity-40",
                  "data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-ink data-focus-visible:shadow-[0_0_0_5px_var(--rf-focus-halo)]",
                  isToday && "marker",
                  "data-selected:bg-ink data-selected:bg-none data-selected:text-on-ink",
                )}
              />
            );
          }}
        </CalendarGridBody>
      </CalendarGrid>
    </Calendar>
  );
}

export interface TimeRangeFieldProps {
  label?: string;
  /** What the user typed (or "HH:MM"): the field normalizes on blur ("1500" → "15:00"). */
  start: string;
  end: string;
  onStartChange: (text: string) => void;
  onEndChange: (text: string) => void;
  startError?: string | null;
  endError?: string | null;
  /** Non-blocking warning («Sono 9 h di lezione: è giusto?»), shown with a Warning icon in ink. */
  warning?: string | null;
  /** Quick lengths under «Fine», in minutes (default +1 h · +1 h 30 · +2 h). */
  quickDurations?: readonly number[];
  /** Live line under the fields («1 h 30 min · 33,00 € a 22,00 €/h»); default: the duration. */
  summary?: ReactNode;
  /** Extra line («Programmata: entra nel saldo alle 18:00 di oggi.»). */
  note?: ReactNode;
  isDisabled?: boolean;
  className?: string;
}

function quickLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `+${String(m)} min`;
  return m === 0 ? `+${String(h)} h` : `+${String(h)} h ${String(m)}`;
}

/**
 * «Orario» (02 §9.3): Inizio → Fine side by side (Plex Mono, numeric keypad), accepting «15»,
 * «1500», «15:00», «15.00»; quick lengths under «Fine»; a live summary line. Validation texts come
 * from the caller (see checkTimeRange in @/lib/forms) so the server's errors land here too.
 */
export function TimeRangeField({
  label = "Orario",
  start,
  end,
  onStartChange,
  onEndChange,
  startError,
  endError,
  warning,
  quickDurations = [60, 90, 120],
  summary,
  note,
  isDisabled,
  className,
}: TimeRangeFieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const summaryId = `${id}-summary`;
  const startTime = parseTimeInput(start);
  const endTime = parseTimeInput(end);
  const minutes = startTime && endTime ? minutesBetween(startTime, endTime) : null;
  const errors = [startError, endError].filter((e): e is string => Boolean(e));
  const uniqueErrors = [...new Set(errors)];
  const defaultSummary = minutes !== null && minutes > 0 ? formatMinutes(minutes) : null;
  const summaryContent = summary ?? defaultSummary;

  const timeInput = (which: "start" | "end") => {
    const text = which === "start" ? start : end;
    const setText = which === "start" ? onStartChange : onEndChange;
    const invalid = Boolean(which === "start" ? startError : endError);
    return (
      <AriaTextField
        aria-label={which === "start" ? "Inizio" : "Fine"}
        value={text}
        onChange={setText}
        onBlur={() => {
          const normalized = parseTimeInput(text);
          if (normalized && normalized !== text) setText(normalized);
        }}
        inputMode="numeric"
        isDisabled={isDisabled}
        isInvalid={invalid}
        validationBehavior="aria"
        aria-describedby={cx(invalid && errorId, summaryContent ? summaryId : undefined) || undefined}
        className="min-w-0"
      >
        <Input
          autoComplete="off"
          placeholder="00:00"
          className={cx(CONTROL, "text-center font-money tabular-nums placeholder:text-ink-3")}
        />
      </AriaTextField>
    );
  };

  return (
    <div role="group" aria-labelledby={labelId} className={cx("block", className)}>
      <span id={labelId} className={LABEL}>
        {label}
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {timeInput("start")}
        <ArrowRightIcon size={16} aria-hidden className="text-ink-3" />
        {timeInput("end")}
      </div>
      {quickDurations.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2">
          <span />
          <span className="w-4" />
          <ChipRow label="Durata rapida">
            {quickDurations.map((duration, index) => (
              <span key={duration} className="inline-flex items-center gap-x-1">
                {index > 0 && <ChipDot />}
                <AriaButton
                  className={CHIP}
                  isDisabled={isDisabled || startTime === null}
                  aria-label={`Durata ${formatMinutes(duration)}`}
                  onPress={() => {
                    if (!startTime) return;
                    const next = addMinutesToTime(startTime, duration);
                    if (next) onEndChange(next);
                  }}
                >
                  {quickLabel(duration)}
                </AriaButton>
              </span>
            ))}
          </ChipRow>
        </div>
      )}
      {uniqueErrors.length > 0 && (
        <p id={errorId} className={ERROR}>
          <WarningIcon size={16} aria-hidden className="mt-px shrink-0" />
          <span>{uniqueErrors.join(" ")}</span>
        </p>
      )}
      {warning && uniqueErrors.length === 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[0.875rem] leading-5 text-ink">
          <WarningIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
      <div id={summaryId} aria-live="polite" className="mt-1.5 text-[0.875rem] leading-5 text-ink-2">
        {summaryContent && <p>{summaryContent}</p>}
        {note && <p className="text-ink-3">{note}</p>}
      </div>
    </div>
  );
}
