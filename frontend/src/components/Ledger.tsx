// The ledger, «il registro» (docs/design/02-design-system.md §9.6): the central component.
// Desktop: a real <table> (Data | Voce | Durata | Lezione | Pagato | Saldo) with a red margin line
// between date and entry; below 760 px an <ol> with Data | Voce | Importo and the running balance
// on a second line. Rows are written «a penna» (ink); Matita's drafts «a matita» (pencil-draft).
import {
  ArrowsClockwiseIcon,
  CaretRightIcon,
  CloudSlashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Link } from "react-router";
import { formatEuroAbs } from "@/lib/format";
import type { LedgerEntry } from "@/lib/api/types";
import { MATITA_ICON, PAYMENT_METHOD_ICON, PAYMENT_METHOD_LABEL } from "./icon-map";
import {
  LEDGER_GRID,
  LEDGER_LIST_GRID,
  type LedgerLayout,
  LedgerLayoutContext,
  useLedgerLayout,
} from "./ledger-context";
import {
  LEDGER_TABLE_QUERY,
  balanceSpeech,
  balanceStatus,
  cx,
  formatAmountColumn,
  formatMinutesColumn,
  splitLedgerDate,
  useMediaQuery,
} from "./utils";

// --- Container ----------------------------------------------------------------------------------

const MARGIN_LINE =
  "before:pointer-events-none before:absolute before:inset-y-0 before:w-px before:bg-margin before:opacity-70";

const HEAD_CELL =
  "bg-paper px-3 pt-2.5 pb-2 text-left align-bottom text-caption text-ink-3 uppercase";

export interface LedgerProps {
  /** «Registro di Giulia Ferri»: the table caption / list name for assistive tech. */
  caption: string;
  /** `auto` (default): table from 760 px of viewport, list below. */
  layout?: LedgerLayout | "auto";
  children: ReactNode;
  className?: string;
}

/**
 * The ledger container. Children are rows: <LedgerSlotRow> (Matita line, empty state),
 * <LedgerDraftRow>, <LedgerEntryRow>, <LedgerRateRow>, <LedgerCarryRow>, most recent first.
 */
export function Ledger({ caption, layout = "auto", children, className }: LedgerProps) {
  const wide = useMediaQuery(LEDGER_TABLE_QUERY, true);
  const resolved: LedgerLayout = layout === "auto" ? (wide ? "table" : "list") : layout;
  return (
    <LedgerLayoutContext value={resolved}>
      <div
        className={cx(
          "relative border-t border-rule-strong bg-paper-raised",
          MARGIN_LINE,
          resolved === "table" ? "before:left-[104px]" : "before:left-[72px]",
          className,
        )}
      >
        {resolved === "table" ? (
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">{caption}</caption>
            <colgroup>
              <col className="w-[104px]" />
              <col />
              <col className="w-[76px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
              <col className="w-[136px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cx(HEAD_CELL, "pl-3.5")}>
                  Data
                </th>
                <th scope="col" className={HEAD_CELL}>
                  Voce
                </th>
                <th scope="col" className={cx(HEAD_CELL, "text-right")}>
                  Durata
                </th>
                <th scope="col" className={cx(HEAD_CELL, "text-right")}>
                  Lezione
                </th>
                <th scope="col" className={cx(HEAD_CELL, "text-right")}>
                  Pagato
                </th>
                <th scope="col" className={cx(HEAD_CELL, "text-right")}>
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        ) : (
          <ol aria-label={caption} className="m-0 list-none p-0">
            {children}
          </ol>
        )}
      </div>
    </LedgerLayoutContext>
  );
}

// --- Cells ---------------------------------------------------------------------------------------

/**
 * Running balance «DEVE 67,00 €» (caption word + Plex), coloured by meaning, read as «deve 67
 * euro». `prefix` adds a word before it («sarà» for a draft).
 */
export function RunningBalance({
  cents,
  prefix,
  className,
}: {
  cents: number;
  prefix?: string;
  className?: string;
}) {
  const layout = useLedgerLayout();
  const status = balanceStatus(cents);
  const color =
    status === "debt" ? "text-debito" : status === "credit" ? "text-credito" : "text-ink-2";
  const word = status === "debt" ? "deve" : status === "credit" ? "credito" : "in pari";
  const speech = `${prefix ? `${prefix} ` : ""}${balanceSpeech(cents, null, { short: true })}`;
  const amount = <span className="font-money text-money tabular-nums">{formatEuroAbs(cents)}</span>;
  const wordNode = (
    <span className="text-[0.6875rem] font-semibold tracking-[0.05em] uppercase">{word}</span>
  );
  const prefixNode = prefix ? <span className="text-[0.8125rem] text-pencil">{prefix}</span> : null;
  if (layout === "table") {
    // The Saldo column is 136 px (02 §9.6): «DEVE 67,00 €» fits on one line, «CREDITO 66,00 €» or
    // «sarà DEVE 20,00 €» do not, and must never run past the column. Laid out from the right, so
    // what does not fit wraps flush right: in a row the amount keeps the row's first line (aligned
    // with the other amounts) and the word goes under it; in a draft «sarà» goes above
    // («sarà / DEVE 20,00 €»), so the cell still reads in order.
    return (
      <span className={className}>
        <span className="sr-only">{speech}</span>
        <span
          aria-hidden
          className={cx(
            "inline-flex flex-row-reverse items-baseline gap-x-2 whitespace-nowrap",
            prefix ? "flex-wrap-reverse" : "flex-wrap",
            color,
          )}
        >
          {amount}
          {wordNode}
          {prefixNode}
        </span>
      </span>
    );
  }
  return (
    <span className={cx("whitespace-nowrap", className)}>
      <span className="sr-only">{speech}</span>
      <span aria-hidden className={color}>
        {prefixNode && <span className="mr-1.5">{prefixNode}</span>}
        {wordNode}
        <span className="ml-2">{amount}</span>
      </span>
    </span>
  );
}

function DateParts({
  date,
  today,
  time,
  layout,
  pencil = false,
}: {
  date: string;
  today: string;
  time?: string | null;
  layout: LedgerLayout;
  /** Inside a draft: everything in graphite, inherited from the row. */
  pencil?: boolean;
}) {
  const { day, month } = splitLedgerDate(date, today);
  if (layout === "list") {
    return (
      <>
        <span className="block text-[0.875rem] leading-5 font-semibold">{day}</span>
        <span className={cx("block text-[0.8125rem] leading-[1.125rem]", !pencil && "text-ink-3")}>
          {month}
        </span>
      </>
    );
  }
  return (
    <>
      <span className={cx("block text-[0.875rem] leading-5", !pencil && "text-ink-2")}>
        <b className={cx("font-semibold whitespace-nowrap", !pencil && "text-ink")}>{day}</b>{" "}
        <span className="whitespace-nowrap">{month}</span>
      </span>
      {time && (
        <span
          className={cx(
            "mt-0.5 flex items-center gap-1 font-money text-[0.75rem] leading-4 whitespace-nowrap",
            !pencil && "text-ink-3",
          )}
        >
          {time}
        </span>
      )}
    </>
  );
}

const CELL = "px-3 py-[13px] align-baseline";
// 104 px − 14 − 8 leaves room for «16:30–18:00» in Plex 12 on one line.
const CELL_FIRST = "pr-2 pl-3.5 py-[13px] align-baseline";
const LIST_DATE = "row-span-2 pt-3 pr-1 pb-3 pl-2";
const LIST_CELL = "px-2.5 py-3";

/**
 * Title of a row: a button covering the whole row when the row opens something. `align-top`: a
 * button is an inline-block, whose baseline is its LAST line; a title on two lines would pull the
 * date and the amounts (baseline-aligned) down to its second line instead of its first.
 */
function RowTitle({ children, onOpen }: { children: ReactNode; onOpen?: () => void }) {
  if (!onOpen) return <>{children}</>;
  return (
    <AriaButton
      onPress={onOpen}
      data-ledger-open=""
      className="cursor-pointer text-left align-top after:absolute after:inset-0 after:content-['']"
    >
      {children}
    </AriaButton>
  );
}

function timeRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

// --- Entry rows (lesson, scheduled lesson, payment) -----------------------------------------------

export interface LedgerEntryRowProps {
  entry: LedgerEntry;
  /** Today in the tutor's timezone: the year is shown only when it differs. */
  today: string;
  /** «oggi · tra 40 min» / «in corso» on the highlighter for a scheduled lesson (lessonTiming). */
  timing?: string | null;
  /** Tap/click on the row: opens the edit sheet (GET /lessons/{id} or /payments/{id}). */
  onOpen?: () => void;
  /** Desktop actions shown on hover/focus («Modifica · ⋯»). */
  actions?: ReactNode;
  /** The row the user came for (from Oggi/Agenda): highlighted while true (1,2 s). */
  highlighted?: boolean;
  /** Where «Risincronizza in Impostazioni» points. */
  calendarSettingsHref?: string;
}

/** A lesson (in the balance or scheduled) or a payment, from `GET /students/{id}/ledger`. */
export function LedgerEntryRow({
  entry,
  today,
  timing,
  onOpen,
  actions,
  highlighted = false,
  calendarSettingsHref = "/impostazioni",
}: LedgerEntryRowProps) {
  const layout = useLedgerLayout();
  const isLesson = entry.kind === "lesson";
  const scheduled = isLesson && !entry.settled;
  const time = isLesson ? timeRange(entry.start_time, entry.end_time) : null;
  const calendarError = isLesson && entry.calendar?.status === "error";
  const MethodIcon = entry.method ? PAYMENT_METHOD_ICON[entry.method] : null;

  const title = isLesson ? (
    <>
      <b className={cx("font-semibold", highlighted && "marker")}>
        {entry.subject?.name ?? "Lezione"}
      </b>
      {entry.topic && (
        <>
          {" · "}
          <span className="font-display text-ink-2 italic">{entry.topic}</span>
        </>
      )}
    </>
  ) : (
    <>
      {MethodIcon && (
        <MethodIcon size={16} aria-hidden className="mr-1.5 inline-block align-[-3px] text-ink-3" />
      )}
      <b className={cx("font-semibold", highlighted && "marker")}>Pagamento</b>
      {entry.method && ` · ${PAYMENT_METHOD_LABEL[entry.method].toLowerCase()}`}
      {entry.note && <span className="text-ink-2"> · {entry.note}</span>}
    </>
  );

  const cloud = calendarError ? (
    <CloudSlashIcon size={16} aria-hidden className="shrink-0 text-danger" />
  ) : null;

  const notes = (
    <>
      {scheduled && (
        <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem] text-ink-2">
          {/* The time in Plex, as on the other rows (02 §9.6: «orario … (Plex)»). */}
          {layout === "list" && time && <span className="font-money">{time} · </span>}
          Programmata · non ancora nel saldo
          {timing && (
            <>
              {" "}
              <span className="marker">{timing}</span>
            </>
          )}
        </span>
      )}
      {!scheduled && layout === "list" && time && (
        <span className="mt-0.5 flex items-center gap-1 text-[0.8125rem] leading-[1.125rem] text-ink-3">
          <span className="font-money">{time}</span>
          {cloud}
        </span>
      )}
      {calendarError && (
        <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem] text-ink-2">
          {layout === "table" || scheduled ? (
            <CloudSlashIcon
              size={16}
              aria-hidden
              className="mr-1 inline-block align-[-3px] text-danger"
            />
          ) : null}
          {entry.calendar?.error ?? "Non è in Google Calendar."}{" "}
          <Link
            to={calendarSettingsHref}
            className="relative z-10 -my-3 inline-flex items-center py-3 whitespace-nowrap text-ink-2 underline underline-offset-[3px]"
          >
            Risincronizza in Impostazioni
            <CaretRightIcon size={14} aria-hidden />
          </Link>
        </span>
      )}
    </>
  );

  const amount = isLesson ? entry.debit_cents : entry.credit_cents;
  const amountClass = isLesson
    ? cx("font-money text-money tabular-nums", scheduled && "text-ink-3")
    : "font-money text-money tabular-nums text-credito";
  const saldo = scheduled ? null : <RunningBalance cents={entry.running_balance_cents} />;

  if (layout === "list") {
    return (
      <li className={cx("relative grid min-h-row border-b border-rule", LEDGER_LIST_GRID)}>
        <div className={LIST_DATE}>
          <DateParts date={entry.date} today={today} layout="list" />
        </div>
        <div className={cx(LIST_CELL, "text-[0.9375rem] leading-[1.375rem]")}>
          <RowTitle onOpen={onOpen}>{title}</RowTitle>
          {notes}
        </div>
        <div className={cx(LIST_CELL, "text-right")}>
          <span className={amountClass}>{formatAmountColumn(amount)}</span>
        </div>
        {saldo && <div className="col-span-2 col-start-2 px-2.5 pb-3">{saldo}</div>}
      </li>
    );
  }

  return (
    <tr className="group relative h-row-dense border-b border-rule">
      <td className={CELL_FIRST}>
        <DateParts date={entry.date} today={today} time={time} layout="table" />
      </td>
      <td className={cx(CELL, "text-[0.9375rem] leading-[1.375rem]")}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <RowTitle onOpen={onOpen}>{title}</RowTitle>
            {notes}
          </div>
          {actions && (
            <div className="relative z-10 -my-1.5 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {actions}
            </div>
          )}
        </div>
      </td>
      <td className={cx(CELL, "text-right text-[0.875rem] text-ink-2 tabular-nums")}>
        {isLesson && entry.duration_minutes !== null
          ? formatMinutesColumn(entry.duration_minutes)
          : null}
      </td>
      <td className={cx(CELL, "text-right")}>
        {isLesson && <span className={amountClass}>{formatAmountColumn(amount)}</span>}
      </td>
      <td className={cx(CELL, "text-right")}>
        {!isLesson && <span className={amountClass}>{formatAmountColumn(amount)}</span>}
      </td>
      <td className={cx(CELL, "text-right")}>{saldo}</td>
    </tr>
  );
}

// --- Draft row (Matita) -------------------------------------------------------------------------

export interface LedgerDraftRowProps {
  kind: "lesson" | "payment";
  /** "YYYY-MM-DD" of the proposed lesson or payment. */
  date: string;
  today: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  /** «Matematica», «Lezione», «Pagamento». */
  title: string;
  /** Topic of the lesson (Literata italic) or «contanti» / «bonifico» / note of the payment. */
  detail?: string | null;
  /** Amount computed by the server (lesson) or written by the tutor (payment), in cents. */
  amountCents: number;
  /**
   * Student's balance after confirming («sarà deve 100,00 €»). `null` for a future lesson: the
   * cell stays empty and the note says it will not enter the balance yet.
   */
  balanceAfterCents: number | null;
  /** The sentence Matita read: «Matita ha letto: «…»». */
  sourceText?: string | null;
  /** `warnings[]` of the draft, one per line, in ink. */
  warnings?: readonly string[];
  /** Ripassa a penna · Modifica · Scarta. */
  actions: ReactNode;
  /** Ink animation (02 §8): dashes fade, an ink line draws under the row, text turns to ink. */
  inking?: boolean;
  /**
   * Name of the row as a proposal («Matita propone: lezione di …»). With it the whole row is the
   * focus target when Matita proposes it (02 §9.13), not its «Ripassa a penna» button: a stray
   * Space or Enter typed after the reply must never write.
   */
  proposalLabel?: string;
  /** Keyboard of the focused proposal (Cmd/Ctrl + Enter, Esc), for the row and its buttons. */
  onKeyDownCapture?: (event: KeyboardEvent) => void;
}

/** A draft proposed by Matita: graphite, dashed, NOT in the totals until «Ripassa a penna». */
export function LedgerDraftRow({
  kind,
  date,
  today,
  startTime,
  endTime,
  durationMinutes,
  title,
  detail,
  amountCents,
  balanceAfterCents,
  sourceText,
  warnings = [],
  actions,
  inking = false,
  proposalLabel,
  onKeyDownCapture,
}: LedgerDraftRowProps) {
  const layout = useLedgerLayout();
  // The row as one focusable proposal (tabIndex -1: reached by Matita's focus, not by Tab).
  const proposal = proposalLabel
    ? {
        "aria-label": proposalLabel,
        tabIndex: -1,
        "data-matita-proposal": "",
        onKeyDownCapture,
      }
    : { onKeyDownCapture };
  const time = kind === "lesson" ? timeRange(startTime ?? null, endTime ?? null) : null;
  const futureLesson = kind === "lesson" && balanceAfterCents === null;
  const note = futureLesson ? "Bozza · programmata: non entra subito nel saldo" : "Bozza";

  const titleNode = (
    <>
      <span className="sr-only">Matita propone: </span>
      <b className="font-semibold">{title}</b>
      {detail && (
        <>
          {" · "}
          <span className={kind === "lesson" ? "font-display italic" : undefined}>{detail}</span>
        </>
      )}
    </>
  );

  const source = (
    <>
      {warnings.map((warning) => (
        <span
          key={warning}
          className="flex basis-full items-start gap-1.5 text-[0.875rem] leading-5 text-ink"
        >
          <WarningIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
          {warning}
        </span>
      ))}
      {sourceText && (
        <span className="flex min-w-0 flex-[1_1_16rem] items-start gap-1.5 text-[0.8125rem] leading-5 text-pencil">
          <MATITA_ICON size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Matita ha letto:{" "}
            <q className="font-display text-[0.9375rem] text-ink-2 italic">{sourceText}</q>
          </span>
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 max-md:basis-full max-md:[&>*:first-child]:basis-full">
        {actions}
      </span>
    </>
  );

  const shell = cx(
    "relative isolate text-pencil transition-colors duration-(--rf-dur-ink) ease-ink",
    "before:absolute before:inset-0.5 before:-z-10 before:pencil-draft before:transition-opacity before:duration-(--rf-dur-ink) before:ease-ink before:content-['']",
    inking && "text-ink before:opacity-0",
  );
  const inkLine = (
    <span
      aria-hidden
      className={cx(
        "absolute right-0.5 -bottom-px left-0.5 h-0.5 origin-left bg-ink transition-transform duration-(--rf-dur-ink) ease-ink",
        inking ? "scale-x-100" : "scale-x-0",
      )}
    />
  );
  const amount = (
    <span className="font-money text-money tabular-nums">{formatAmountColumn(amountCents)}</span>
  );
  const saldo =
    balanceAfterCents === null ? null : <RunningBalance cents={balanceAfterCents} prefix="sarà" />;

  if (layout === "list") {
    return (
      <li
        {...proposal}
        className={cx("grid min-h-row border-b border-rule", LEDGER_LIST_GRID, shell)}
      >
        <div className={LIST_DATE}>
          <DateParts date={date} today={today} layout="list" pencil />
        </div>
        <div className={cx(LIST_CELL, "text-[0.9375rem] leading-[1.375rem]")}>
          {titleNode}
          <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem]">
            {time && <span className="font-money">{time} · </span>}
            {note}
          </span>
        </div>
        <div className={cx(LIST_CELL, "text-right")}>{amount}</div>
        {saldo && <div className="col-span-2 col-start-2 px-2.5">{saldo}</div>}
        <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 pt-1 pb-3.5">
          {source}
        </div>
        {inkLine}
      </li>
    );
  }

  return (
    <tr className="border-b border-rule">
      <td colSpan={6} className="p-0">
        <div
          {...proposal}
          role={proposalLabel ? "group" : undefined}
          className={cx("grid", LEDGER_GRID, shell)}
        >
          <div className={CELL_FIRST}>
            <DateParts date={date} today={today} time={time} layout="table" pencil />
          </div>
          <div className={cx(CELL, "text-[0.9375rem] leading-[1.375rem]")}>
            {titleNode}
            <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem]">{note}</span>
          </div>
          <div className={cx(CELL, "text-right text-[0.875rem] tabular-nums")}>
            {durationMinutes ? formatMinutesColumn(durationMinutes) : null}
          </div>
          <div className={cx(CELL, "text-right")}>{kind === "lesson" && amount}</div>
          <div className={cx(CELL, "text-right")}>{kind === "payment" && amount}</div>
          <div className={cx(CELL, "text-right")}>{saldo}</div>
          <div className="col-span-5 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-3.5">
            {source}
          </div>
          {inkLine}
        </div>
      </td>
    </tr>
  );
}

// --- Rate change, carry-over, free rows -----------------------------------------------------------

/** «Tariffa da 20,00 a 22,00 €/h per le lezioni da questa data» (from `student.rates`). */
export function LedgerRateRow({
  date,
  today,
  fromCents,
  toCents,
}: {
  date: string;
  today: string;
  /** Previous rate; null for the first rate of the student. */
  fromCents: number | null;
  toCents: number;
}) {
  const layout = useLedgerLayout();
  const to = formatAmountColumn(toCents);
  const text =
    fromCents === null
      ? `Tariffa di ${to} €/h per le lezioni da questa data`
      : `Tariffa da ${formatAmountColumn(fromCents)} a ${to} €/h per le lezioni da questa data`;
  const content = (
    <span className="flex items-start gap-1.5 text-[0.875rem] leading-5 text-ink-2">
      <ArrowsClockwiseIcon size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
      {text}
    </span>
  );
  if (layout === "list") {
    return (
      <li className={cx("grid min-h-10 border-b border-rule bg-paper", LEDGER_LIST_GRID)}>
        <div className="py-2.5 pr-1 pl-2">
          <DateParts date={date} today={today} layout="list" />
        </div>
        <div className="col-span-2 px-2.5 py-2.5">{content}</div>
      </li>
    );
  }
  return (
    <tr className="h-10 border-b border-rule bg-paper">
      <td className="py-[9px] pr-3 pl-3.5 align-baseline">
        <DateParts date={date} today={today} layout="table" />
      </td>
      <td colSpan={5} className="px-3 py-[9px] align-baseline">
        {content}
      </td>
    </tr>
  );
}

/**
 * «Riporto al 27 set» + the running balance before the oldest row shown, with the double rule
 * under it (only when the ledger is shown from a date on).
 */
export function LedgerCarryRow({
  date,
  today,
  balanceCents,
}: {
  /** Date of the carry-over (day before the oldest row shown). */
  date: string;
  today: string;
  balanceCents: number;
}) {
  const layout = useLedgerLayout();
  const { day, month } = splitLedgerDate(date, today);
  const dayNumber = day.slice(day.indexOf(" ") + 1);
  const label = `Riporto al ${dayNumber} ${month}`;
  const text = <span className="font-display text-ink-2 italic">{label}</span>;
  if (layout === "list") {
    return (
      <li className={cx("grid min-h-row rule-total", LEDGER_LIST_GRID)}>
        <div className={LIST_DATE}>
          <DateParts date={date} today={today} layout="list" />
        </div>
        <div className={cx(LIST_CELL, "col-span-2")}>
          {text}
          <div className="mt-1">
            <RunningBalance cents={balanceCents} />
          </div>
        </div>
      </li>
    );
  }
  return (
    <tr className="h-row-dense rule-total">
      <td className={CELL_FIRST}>
        <DateParts date={date} today={today} layout="table" />
      </td>
      <td colSpan={4} className={CELL}>
        {text}
      </td>
      <td className={cx(CELL, "text-right")}>
        <RunningBalance cents={balanceCents} />
      </td>
    </tr>
  );
}

/** A full-width row: the Matita line at the top of the ledger, the empty «Pagina bianca». */
export function LedgerSlotRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const layout = useLedgerLayout();
  if (layout === "list") return <li className={className}>{children}</li>;
  return (
    <tr className={className}>
      <td colSpan={6} className="p-0">
        {children}
      </td>
    </tr>
  );
}
