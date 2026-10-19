// The real ledger, in static HTML, with the example data of 03 «Dati d'esempio» (Giulia Ferri,
// «today» = mar 6 ott 2026). Built from the same components as the student page, so the landing
// shows exactly what the tutor will use.
import { BankIcon, PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  DraftBadge,
  Ledger,
  LedgerDraftRow,
  LedgerEntryRow,
  LedgerRateRow,
  LedgerSlotRow,
  MATITA_ICON,
  RunningBalance,
  balanceSpeech,
  cx,
  formatAmountColumn,
} from "@/components";
import type { LedgerEntry } from "@/lib/api/types";
import { formatEuroAbs } from "@/lib/format";

const EXAMPLE_TODAY = "2026-10-06";
const GIULIA_BALANCE = -6700;

function lesson(
  entry: Pick<LedgerEntry, "id" | "date" | "start_time" | "end_time" | "duration_minutes"> &
    Partial<LedgerEntry>,
): LedgerEntry {
  return {
    kind: "lesson",
    hourly_rate_cents: 2200,
    subject: null,
    topic: null,
    method: null,
    note: null,
    debit_cents: 0,
    credit_cents: 0,
    settled: true,
    running_balance_cents: 0,
    calendar: null,
    ...entry,
  };
}

const SCHEDULED = lesson({
  id: "esempio-gio-8",
  date: "2026-10-08",
  start_time: "15:00",
  end_time: "16:00",
  duration_minutes: 60,
  subject: { id: "matematica", name: "Matematica" },
  debit_cents: 2200,
  settled: false,
  running_balance_cents: GIULIA_BALANCE,
});

const PHYSICS = lesson({
  id: "esempio-lun-5",
  date: "2026-10-05",
  start_time: "17:00",
  end_time: "19:00",
  duration_minutes: 120,
  subject: { id: "fisica", name: "Fisica" },
  topic: "moto rettilineo uniforme",
  debit_cents: 4400,
  running_balance_cents: GIULIA_BALANCE,
});

const PAYMENT: LedgerEntry = {
  kind: "payment",
  id: "esempio-ven-2",
  date: "2026-10-02",
  start_time: null,
  end_time: null,
  duration_minutes: null,
  hourly_rate_cents: null,
  subject: null,
  topic: null,
  method: "bank_transfer",
  note: null,
  debit_cents: 0,
  credit_cents: 5000,
  settled: true,
  running_balance_cents: -2300,
  calendar: null,
};

/** «Giulia Ferri ……… 67,00 € TI DEVE» above the rows. */
function LedgerHead({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 px-3 pt-3 pb-2.5", className)}>
      <span className="font-display text-[1.375rem] leading-7 text-ink">Giulia Ferri</span>
      <span className="whitespace-nowrap text-debito">
        <span className="sr-only">{balanceSpeech(GIULIA_BALANCE)}</span>
        <span aria-hidden>
          <span className="font-display text-[1.375rem] leading-7 font-medium tabular-nums">
            {formatEuroAbs(GIULIA_BALANCE)}
          </span>{" "}
          <span className="text-[0.75rem] font-semibold tracking-[0.06em] uppercase">ti deve</span>
        </span>
      </span>
    </div>
  );
}

/** Desktop hero (03 §1, columns 7–12): Matita line, a draft, a scheduled lesson, the rest in ink. */
export function HeroLedger() {
  return (
    <figure className="m-0 border border-rule bg-paper-raised">
      <LedgerHead />
      <Ledger caption="Registro di Giulia Ferri (esempio)" layout="list">
        <LedgerSlotRow className="border-b border-ink-3">
          <div
            aria-hidden
            className="flex h-14 items-center gap-2.5 px-3 font-display text-[1rem] text-pencil italic"
          >
            <MATITA_ICON size={20} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Scrivi una riga… «oggi 16:30–18 matematica, equazioni»
            </span>
            <span className="grid size-9 place-items-center rounded-xs border border-control text-ink not-italic">
              <PlusIcon size={18} />
            </span>
          </div>
        </LedgerSlotRow>
        <LedgerDraftRow
          kind="lesson"
          date={EXAMPLE_TODAY}
          today={EXAMPLE_TODAY}
          startTime="16:30"
          endTime="18:00"
          durationMinutes={90}
          title="Matematica"
          detail="equazioni di secondo grado"
          amountCents={3300}
          balanceAfterCents={null}
          actions={<DraftBadge />}
        />
        <LedgerEntryRow entry={SCHEDULED} today={EXAMPLE_TODAY} />
        <LedgerEntryRow entry={PHYSICS} today={EXAMPLE_TODAY} />
        <LedgerEntryRow entry={PAYMENT} today={EXAMPLE_TODAY} />
        <LedgerRateRow date="2026-10-01" today={EXAMPLE_TODAY} fromCents={2000} toCents={2200} />
      </Ledger>
      <div aria-hidden className="h-1 rule-total" />
      <figcaption className="sr-only">
        Esempio: il registro di Giulia Ferri, che ti deve 67,00 €.
      </figcaption>
    </figure>
  );
}

/** Numbered note marker: plain digits in a small box (the fonts have no ①②③, fonts.md). */
export function NoteMarker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-grid size-5 shrink-0 place-items-center rounded-xs border border-ink font-money text-[0.75rem] leading-none font-medium text-ink",
        className,
      )}
    >
      {n}
    </span>
  );
}

const ROW = "grid grid-cols-[72px_minmax(0,1fr)_auto_1.75rem] items-start border-b border-rule";

function DateCell({ day, month }: { day: string; month: string }) {
  return (
    <div className="py-3 pr-1 pl-2">
      <span className="block text-[0.875rem] leading-5 font-semibold">{day}</span>
      <span className="block text-[0.8125rem] leading-[1.125rem] text-ink-3">{month}</span>
    </div>
  );
}

function Marked({ n, children }: { n: number; children: ReactNode }) {
  return (
    <>
      {children}
      <span className="flex justify-center pt-3.5">
        <span className="sr-only">(nota {n})</span>
        <NoteMarker n={n} />
      </span>
    </>
  );
}

/** Section «Una pagina per studente»: two rows of Giulia's ledger with the notes 1–3. */
export function AnnotatedLedger() {
  return (
    <figure className="m-0 self-start border border-rule bg-paper-raised">
      <LedgerHead />
      <Ledger caption="Registro di Giulia Ferri (esempio con note)" layout="list">
        <LedgerSlotRow className={ROW}>
          <DateCell day="lun 5" month="ott" />
          <div className="px-2.5 py-3 text-[0.9375rem] leading-[1.375rem]">
            <b className="font-semibold">Fisica</b> ·{" "}
            <span className="font-display text-ink-2 italic">moto rettilineo uniforme</span>
            <span className="mt-0.5 block font-money text-[0.8125rem] text-ink-3">17:00–19:00</span>
            <span className="mt-1.5 flex items-center gap-2">
              <RunningBalance cents={GIULIA_BALANCE} />
              <span className="sr-only">(nota 3)</span>
              <NoteMarker n={3} />
            </span>
          </div>
          <Marked n={1}>
            <span className="px-2.5 py-3 font-money text-money tabular-nums">
              {formatAmountColumn(4400)}
            </span>
          </Marked>
        </LedgerSlotRow>
        <LedgerSlotRow className={ROW}>
          <DateCell day="ven 2" month="ott" />
          <div className="px-2.5 py-3 text-[0.9375rem] leading-[1.375rem]">
            <BankIcon
              size={16}
              aria-hidden
              className="mr-1.5 inline-block align-[-3px] text-ink-3"
            />
            <b className="font-semibold">Pagamento</b> · bonifico
            <span className="mt-1.5 block">
              <RunningBalance cents={-2300} />
            </span>
          </div>
          <Marked n={2}>
            <span className="px-2.5 py-3 font-money text-money text-credito tabular-nums">
              {formatAmountColumn(5000)}
            </span>
          </Marked>
        </LedgerSlotRow>
      </Ledger>
      <figcaption className="sr-only">
        Esempio con note: una lezione, un pagamento e il saldo che si aggiorna riga per riga.
      </figcaption>
    </figure>
  );
}
