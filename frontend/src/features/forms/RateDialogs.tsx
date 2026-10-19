// «Nuova tariffa per Giulia» and «Elimina tariffa» (docs/design/03-schermate.md §7.3, D-16).
// The preview (POST …/rates/preview) is asked 300 ms after the last change; with lessons affected
// the tutor must choose explicitly what happens to them: nothing is preselected.
import { EraserIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, Dots } from "@/components/Button";
import { DayField } from "@/components/DateTime";
import { Sheet, SheetActions } from "@/components/Dialog";
import { FormNote, MoneyField } from "@/components/Field";
import type { Rate, RateInput, Student } from "@/lib/api/types";
import { formatEuro, parseIsoDate } from "@/lib/format";
import { problemToFormErrors, useFormErrors } from "@/lib/forms";
import { useCreateRate, useDeleteRate, useRatePreview } from "@/lib/queries";
import { ChoiceGroup } from "./ChoiceGroup";
import { useTutorClock } from "./clock";
import { RATE_MAX_CENTS } from "./lesson-model";
import { rateSavedMessage } from "./messages";
import { dayMonth, formatRate, lessonsCount, previousRate, rateOn } from "./money-words";
import { useUndoToast } from "./useUndoToast";

type RateField = "rate" | "from";
const RATE_MAPPING = {
  fields: ["rate", "from"] as const,
  map: { hourly_rate_cents: "rate", effective_from: "from" } as const,
};

/** The value, `delayMs` after it stopped changing. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

function signedEuro(cents: number): string {
  if (cents > 0) return `+${formatEuro(cents)}`;
  if (cents < 0) return `−${formatEuro(-cents)}`;
  return formatEuro(0);
}

/** «1 ott 2026». */
function dayMonthYear(date: string): string {
  const day = parseIsoDate(date);
  return day ? `${dayMonth(date)} ${String(day.year)}` : date;
}

export function RateChangeDialog(props: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  student: Pick<Student, "id" | "first_name" | "rates">;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.isOpen);
  if (props.isOpen !== wasOpen) {
    setWasOpen(props.isOpen);
    if (props.isOpen) setSession((n) => n + 1);
  }
  return <RateChangeSheet key={session} {...props} />;
}

function RateChangeSheet({
  isOpen,
  onOpenChange,
  student,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  student: Pick<Student, "id" | "first_name" | "rates">;
}) {
  const { today, timeZone } = useTutorClock();
  const showToast = useUndoToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const errors = useFormErrors<RateField>(RATE_MAPPING, bodyRef);
  const [rateCents, setRateCents] = useState<number | null>(null);
  const [from, setFrom] = useState(today);
  const [choice, setChoice] = useState<{ key: string; reprice: boolean } | null>(null);
  const create = useCreateRate();

  const current = rateOn(student.rates, today);
  const ruling = rateOn(student.rates, from);
  const valid = rateCents !== null && rateCents <= RATE_MAX_CENTS && parseIsoDate(from) !== null;
  const input: RateInput | null = valid
    ? { hourly_rate_cents: rateCents, effective_from: from }
    : null;
  const key = input ? `${String(input.hourly_rate_cents)}@${input.effective_from}` : "";
  const debouncedKey = useDebounced(key, 300);
  const debouncedInput = debouncedKey === key ? input : null;
  const preview = useRatePreview(student.id, isOpen ? debouncedInput : null);
  const ready =
    input !== null &&
    debouncedInput !== null &&
    preview.isSuccess &&
    !preview.isPlaceholderData &&
    !preview.isFetching;
  const affected = ready ? preview.data.affected_lessons : null;
  const reprice = choice && choice.key === key ? choice.reprice : null;
  const previewErrors = preview.error ? problemToFormErrors(preview.error, RATE_MAPPING) : null;
  const fieldError = (field: RateField) => errors.fields[field] ?? previewErrors?.fields[field];
  const checking = input !== null && !ready && !preview.isError;
  const blockedReason =
    affected !== null && affected > 0 && reprice === null
      ? "Scegli cosa fare con le lezioni già registrate"
      : null;
  const dirty = rateCents !== null || from !== today;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    if (rateCents === null) {
      errors.show({ rate: "Scrivi la nuova tariffa, per esempio 24,00." });
      return;
    }
    if (rateCents > RATE_MAX_CENTS) {
      errors.show({ rate: "La tariffa può essere al massimo di 1.000,00 €/h." });
      return;
    }
    if (!parseIsoDate(from)) {
      errors.show({ from: "Scegli il giorno." });
      return;
    }
    if (affected === null || blockedReason) return;
    try {
      const result = await create.mutateAsync({
        studentId: student.id,
        body: {
          hourly_rate_cents: rateCents,
          effective_from: from,
          reprice_existing: reprice === true,
        },
      });
      onOpenChange(false);
      showToast(
        rateSavedMessage(
          result.rate.hourly_rate_cents,
          result.rate.effective_from,
          result.repriced_lessons,
        ),
      );
    } catch (error) {
      errors.fromProblem(error);
    }
  }

  const count = affected ?? 0;
  const these = count === 1 ? "la lezione" : `le ${lessonsCount(count)}`;
  const data = ready ? preview.data : null;

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Nuova tariffa per ${student.first_name}`}
      subtitle={
        current
          ? `Tariffa attuale ${formatRate(current.hourly_rate_cents)} dal ${dayMonth(current.effective_from)}`
          : undefined
      }
      isDirty={dirty}
      hideCloseButton
      onSubmit={(event) => void submit(event)}
      note={errors.form ? <FormNote>{errors.form}</FormNote> : null}
      actions={({ close }) => (
        <div className="flex flex-col gap-2">
          {blockedReason && (
            <p className="m-0 text-[0.875rem] leading-5 text-ink-2 md:text-right">
              {blockedReason}
            </p>
          )}
          <SheetActions>
            <Button variant="line" onPress={close} isDisabled={create.isPending}>
              Annulla
            </Button>
            <Button
              variant="ink"
              type="submit"
              isPending={create.isPending}
              isDisabled={affected === null || blockedReason !== null}
            >
              Salva tariffa
            </Button>
          </SheetActions>
        </div>
      )}
    >
      <div ref={bodyRef} className="flex flex-col gap-5 pt-1">
        <MoneyField
          label="Nuova tariffa"
          unit="€/h"
          required
          value={rateCents}
          onChange={(cents) => {
            setRateCents(cents);
            errors.clearField("rate");
          }}
          error={fieldError("rate")}
        />
        <DayField
          label="Valida dal"
          value={from}
          today={today}
          timeZone={timeZone}
          onChange={(date) => {
            setFrom(date);
            errors.clearField("from");
          }}
          error={fieldError("from")}
        />
        <div aria-live="polite">
          {checking && (
            <p className="m-0 flex items-center gap-2 bg-paper-sunk px-3 py-3 text-body text-ink">
              Controllo le lezioni… <Dots className="text-ink-3" />
            </p>
          )}
          {previewErrors?.form && !checking && <FormNote>{previewErrors.form}</FormNote>}
          {data && count > 0 && (
            <p className="m-0 bg-paper-sunk px-3 py-3 text-body text-ink">
              Dal {dayMonth(from)}{" "}
              {count === 1
                ? "c'è 1 lezione che segue"
                : `ci sono ${lessonsCount(count)} che seguono`}{" "}
              la tariffa dello storico: {formatEuro(data.current_total_cents)}.
            </p>
          )}
          {data && count === 0 && (
            <p className="m-0 bg-paper-sunk px-3 py-3 text-body text-ink">
              Nessuna lezione registrata dal {dayMonth(from)}: la nuova tariffa vale per le
              prossime.
            </p>
          )}
        </div>
        {data && count > 0 && (
          <div>
            <ChoiceGroup
              label={`Cosa fare con ${count === 1 ? "questa lezione" : `queste ${lessonsCount(count)}`}?`}
              value={reprice === null ? null : reprice ? "reprice" : "keep"}
              onChange={(next) => setChoice({ key, reprice: next === "reprice" })}
              options={[
                {
                  value: "keep",
                  label: "Solo per le nuove lezioni",
                  description: ruling
                    ? `${count === 1 ? "La lezione resta" : `Le ${lessonsCount(count)} restano`} a ${formatRate(ruling.hourly_rate_cents)}.`
                    : `${count === 1 ? "La lezione resta" : `Le ${lessonsCount(count)} restano`} come sono.`,
                },
                {
                  value: "reprice",
                  label: `Ricalcola ${these} (${signedEuro(data.delta_cents)})`,
                  description: `Da ${formatEuro(data.current_total_cents)} a ${formatEuro(data.new_total_cents)}.`,
                },
              ]}
            />
            <p className="mt-2 mb-0 text-[0.8125rem] leading-[1.125rem] text-ink-3">
              Le lezioni con una tariffa scritta a mano non cambiano mai.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/**
 * «Eliminare la tariffa di 22,00 €/h dal 1 ott 2026?» with an explicit choice for the lessons it
 * governs (03 §7.3). Only offered when the student has more than one rate.
 */
export function DeleteRateDialog({
  rate,
  rates,
  studentId,
  onOpenChange,
}: {
  /** null = closed. */
  rate: Rate | null;
  rates: readonly Rate[];
  studentId: string;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [shown, setShown] = useState(rate);
  if (rate !== null && rate !== shown) setShown(rate);
  const [reprice, setReprice] = useState<boolean | null>(null);
  const [wasOpen, setWasOpen] = useState(rate !== null);
  if ((rate !== null) !== wasOpen) {
    setWasOpen(rate !== null);
    if (rate !== null) setReprice(null);
  }
  const remove = useDeleteRate();
  const showToast = useUndoToast();
  const [error, setError] = useState<unknown>(null);
  const target = rate ?? shown;
  const previous = target ? previousRate(rates, target) : null;

  async function confirm() {
    if (!rate || reprice === null) return;
    setError(null);
    try {
      await remove.mutateAsync({ studentId, rateId: rate.id, repriceExisting: reprice });
      onOpenChange(false);
      showToast(`Tariffa di ${formatRate(rate.hourly_rate_cents)} eliminata`);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <Sheet
      isOpen={rate !== null}
      onOpenChange={(open) => {
        if (!remove.isPending) onOpenChange(open);
      }}
      title={
        target
          ? `Eliminare la tariffa di ${formatRate(target.hourly_rate_cents)} dal ${dayMonthYear(target.effective_from)}?`
          : ""
      }
      size="small"
      role="alertdialog"
      hideCloseButton
      note={error ? <FormNote>{problemToFormErrors(error, { fields: [] }).form}</FormNote> : null}
      actions={({ close }) => (
        <div className="flex flex-col gap-2">
          {reprice === null && (
            <p className="m-0 text-[0.875rem] leading-5 text-ink-2 md:text-right">
              Scegli cosa fare con le lezioni
            </p>
          )}
          <div className="flex gap-2 *:flex-1 md:justify-end md:*:flex-none">
            <Button variant="line" onPress={close} isDisabled={remove.isPending}>
              Annulla
            </Button>
            <Button
              variant="danger"
              icon={EraserIcon}
              isPending={remove.isPending}
              isDisabled={reprice === null}
              onPress={() => void confirm()}
            >
              Elimina tariffa
            </Button>
          </div>
        </div>
      )}
    >
      {target && (
        <ChoiceGroup
          label="Le lezioni che seguono questa tariffa"
          value={reprice === null ? null : reprice ? "reprice" : "keep"}
          onChange={(next) => setReprice(next === "reprice")}
          options={[
            { value: "keep", label: "Lascia le lezioni come sono" },
            {
              value: "reprice",
              label: previous
                ? `Riporta alla tariffa precedente (${formatRate(previous.hourly_rate_cents)}) le lezioni dal ${dayMonth(target.effective_from)} che seguono lo storico`
                : `Riporta alla tariffa dello storico le lezioni dal ${dayMonth(target.effective_from)} che la seguono`,
            },
          ]}
        />
      )}
    </Sheet>
  );
}
