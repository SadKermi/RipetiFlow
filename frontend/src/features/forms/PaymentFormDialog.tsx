// «Pagamento ricevuto» / «Modifica pagamento» (docs/design/03-schermate.md §7.2): POST /payments and
// PATCH /payments/{id}. The most important line is «Dopo: …», the balance once it is saved.
// Exported for Matita: «Modifica» on a payment draft opens this form prefilled.
import { CloudSlashIcon, EraserIcon, StudentIcon, WarningIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { BalanceBadge } from "@/components/BalanceBadge";
import { DayField } from "@/components/DateTime";
import { Sheet, SheetActions } from "@/components/Dialog";
import { FormNote, MoneyField, TextField } from "@/components/Field";
import { PAYMENT_METHOD_ICON, PAYMENT_METHOD_LABEL } from "@/components/icon-map";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SearchSelect, type SelectOption } from "@/components/Select";
import { LoadErrorBand, Note, SkeletonRows } from "@/components/States";
import type { WriteSource } from "@/lib/api/client";
import { isApiProblem } from "@/lib/api/problem";
import type { Payment, PaymentMethod } from "@/lib/api/types";
import { centsToInput } from "@/lib/format";
import { useFormErrors } from "@/lib/forms";
import {
  paymentQuery,
  queryKeys,
  studentQuery,
  studentsQuery,
  useCreatePayment,
  useUpdatePayment,
} from "@/lib/queries";
import { useTutorClock } from "./clock";
import { DeletePaymentDialog } from "./confirmations";
import type { PaymentToDelete } from "./effects";
import { paymentSavedMessage } from "./messages";
import { balanceWords } from "./money-words";
import {
  NOTE_MAX,
  PAYMENT_PROBLEM_MAPPING,
  type PaymentField,
  type PaymentInitial,
  type PaymentValues,
  balanceAfterPayment,
  checkPayment,
  highAmountWarning,
  newPaymentValues,
  paymentCreateBody,
  paymentPatchBody,
  paymentToValues,
  paymentUndoPatch,
  paymentValuesDiffer,
} from "./payment-model";
import { deletePaymentNow, patchPaymentNow } from "./undo";
import { useUndoToast } from "./useUndoToast";

export interface PaymentFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Edit this payment (GET /payments/{id}). */
  paymentId?: string | null;
  /** Prefill of a new payment (the student page passes the student, Matita its draft). */
  initial?: PaymentInitial;
  source?: WriteSource;
  /** Errors of a failed write to show at opening (the 422 of «Ripassa a penna»). */
  initialError?: unknown;
  onSaved?: (payment: Payment) => void;
}

export function PaymentFormDialog(props: PaymentFormDialogProps) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.isOpen);
  if (props.isOpen !== wasOpen) {
    setWasOpen(props.isOpen);
    if (props.isOpen) setSession((n) => n + 1);
  }
  return <PaymentFormSheet key={session} {...props} />;
}

const METHOD_OPTIONS = (["cash", "bank_transfer", "other"] as const).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABEL[value],
  icon: PAYMENT_METHOD_ICON[value],
}));

/** Amount chips under «Importo»: a 44 px target, at least 44 px wide on the phone (02 §2). */
const CHIP =
  "relative -my-3 inline-block cursor-pointer px-1 py-3 text-center max-md:min-w-11 font-money text-[0.875rem] leading-5 font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline";

function PaymentFormSheet({
  isOpen,
  onOpenChange,
  paymentId,
  initial,
  source,
  initialError,
  onSaved,
}: PaymentFormDialogProps) {
  const editing = Boolean(paymentId);
  const { today, timeZone } = useTutorClock();
  const queryClient = useQueryClient();
  const showToast = useUndoToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const errors = useFormErrors(PAYMENT_PROBLEM_MAPPING, bodyRef);

  const paymentResult = useQuery({ ...paymentQuery(paymentId ?? ""), enabled: isOpen && editing });
  const original = paymentResult.data ?? null;
  const [startValues] = useState<PaymentValues | null>(() =>
    editing ? null : newPaymentValues(initial ?? {}, today),
  );
  const [values, setValues] = useState<PaymentValues | null>(startValues);
  const [baseline, setBaseline] = useState<PaymentValues | null>(startValues);
  if (editing && original && values === null) {
    const loaded = paymentToValues(original);
    setValues(loaded);
    setBaseline(loaded);
  }

  const students = useQuery({
    ...studentsQuery({ archived: false, sort: "name" }),
    enabled: isOpen,
  }).data;
  const studentId = values?.studentId ?? null;
  const student = useQuery({
    ...studentQuery(studentId ?? ""),
    enabled: isOpen && !!studentId,
  }).data;
  const create = useCreatePayment();
  const update = useUpdatePayment();
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<PaymentToDelete | null>(null);

  const { fromProblem } = errors;
  useEffect(() => {
    if (initialError) fromProblem(initialError);
  }, [initialError, fromProblem]);

  const notFound = isApiProblem(paymentResult.error) && paymentResult.error.status === 404;
  useEffect(() => {
    if (notFound) void queryClient.invalidateQueries({ queryKey: queryKeys.student.all() });
  }, [notFound, queryClient]);

  const options: SelectOption[] = (students ?? []).map((s) => ({
    id: s.id,
    label: s.display_name,
    detail: s.grade ?? s.school ?? undefined,
  }));
  const extra =
    original && original.student.id === studentId
      ? { id: original.student.id, label: original.student.display_name }
      : student && student.id === studentId
        ? { id: student.id, label: student.display_name }
        : null;
  if (extra && !options.some((o) => o.id === extra.id)) options.push(extra);

  const balance = student && student.id === studentId ? student.balance : null;
  // The payment being edited is already in the balance: take it out first (same student only).
  const previousAmount = original && original.student.id === studentId ? original.amount_cents : 0;
  const balanceBefore = balance ? balance.balance_cents - previousAmount : null;
  // What settles the balance («il saldo»), and the balance with the scheduled lessons.
  const debt = balanceBefore !== null && balanceBefore < 0 ? -balanceBefore : 0;
  const projectedBefore = balance ? balance.projected_balance_cents - previousAmount : null;
  const projectedDebt = projectedBefore !== null && projectedBefore < 0 ? -projectedBefore : 0;
  const amount = values
    ? values.amountSet
      ? values.amountCents
      : !editing && debt > 0
        ? debt
        : values.amountCents
    : null;
  const after =
    balance && amount !== null
      ? balanceAfterPayment(balance.balance_cents, amount, previousAmount)
      : null;
  const warning =
    balanceBefore !== null && amount !== null && student
      ? highAmountWarning({
          amountCents: amount,
          balanceCents: balanceBefore,
          rateCents: balance?.current_hourly_rate_cents ?? null,
          firstName: student.first_name,
        })
      : null;
  const pending = create.isPending || update.isPending;
  const dirty = values !== null && baseline !== null && paymentValuesDiffer(values, baseline);

  function set(patch: Partial<PaymentValues>, field?: PaymentField) {
    setValues((current) => (current ? { ...current, ...patch } : current));
    if (field) errors.clearField(field);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || pending) return;
    const final = { ...values, amountCents: amount };
    const local = checkPayment(final);
    if (Object.keys(local).length > 0) {
      errors.show(local);
      return;
    }
    try {
      if (editing && original) {
        const patch = paymentPatchBody(final, original);
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
        const saved = await update.mutateAsync({
          id: original.id,
          patch,
          previousStudentId: original.student.id,
          source,
        });
        onOpenChange(false);
        const undo = paymentUndoPatch(patch, original);
        showToast("Pagamento modificato", (qc) =>
          patchPaymentNow(qc, saved.id, undo, [saved.student.id, original.student.id]),
        );
        onSaved?.(saved);
      } else {
        const saved = await create.mutateAsync({ body: paymentCreateBody(final), source });
        onOpenChange(false);
        showToast(paymentSavedMessage(saved.amount_cents), (qc) =>
          deletePaymentNow(qc, { id: saved.id, studentId: saved.student.id }),
        );
        onSaved?.(saved);
      }
    } catch (error) {
      errors.fromProblem(error);
    }
  }

  let body: ReactNode;
  if (editing && !original) {
    body = notFound ? (
      <Note icon={CloudSlashIcon} tone="danger" role="alert">
        Questa riga non c&apos;è più: forse è stata eliminata da un&apos;altra finestra.
      </Note>
    ) : paymentResult.isError ? (
      <LoadErrorBand
        onRetry={() => void paymentResult.refetch()}
        isRetrying={paymentResult.isFetching}
        timeZone={timeZone}
      />
    ) : (
      <SkeletonRows rows={4} rowClassName="min-h-16" />
    );
  } else if (values) {
    const chips: { cents: number; label: string }[] = [];
    if (debt > 0) chips.push({ cents: debt, label: "il saldo" });
    if (projectedDebt > debt) chips.push({ cents: projectedDebt, label: "con le programmate" });
    body = (
      <div ref={bodyRef} className="flex flex-col gap-5 pt-1">
        <div>
          <SearchSelect
            label="Da"
            icon={StudentIcon}
            required
            options={options}
            value={values.studentId}
            onChange={(id) => set({ studentId: id }, "student")}
            query={query}
            onQueryChange={setQuery}
            placeholder="Scegli lo studente"
            emptyText={(text) => `Nessuno studente con «${text}» nel nome.`}
            error={errors.fields.student}
          />
          {balance && (
            <div className="mt-2">
              <BalanceBadge cents={balance.balance_cents} creditMinutes={balance.credit_minutes} />
            </div>
          )}
        </div>
        <div>
          <MoneyField
            label="Importo"
            required
            value={amount}
            onChange={(cents) => set({ amountCents: cents, amountSet: true }, "amount")}
            error={errors.fields.amount}
          />
          {chips.length > 0 && (
            <div
              role="group"
              aria-label="Importi suggeriti"
              className="mt-1 flex flex-wrap items-center gap-x-1"
            >
              {chips.map((chip, index) => (
                <span key={chip.label} className="inline-flex items-center gap-x-1">
                  {index > 0 && (
                    <span aria-hidden className="text-ink-3">
                      ·
                    </span>
                  )}
                  <button
                    type="button"
                    className={CHIP}
                    aria-label={`${centsToInput(chip.cents)} €, ${chip.label}`}
                    onClick={() => set({ amountCents: chip.cents, amountSet: true }, "amount")}
                  >
                    {centsToInput(chip.cents)}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <SegmentedControl
          label="Come"
          options={METHOD_OPTIONS}
          value={values.method}
          onChange={(method: PaymentMethod) => set({ method }, "method")}
          fullWidth
        />
        {errors.fields.method && <FormNote>{errors.fields.method}</FormNote>}
        <DayField
          value={values.date}
          today={today}
          timeZone={timeZone}
          onChange={(date) => set({ date }, "date")}
          error={errors.fields.date}
        />
        <TextField
          label="Nota"
          optional={values.method !== "other"}
          value={values.note}
          onChange={(note) => set({ note }, "note")}
          maxLength={NOTE_MAX}
          placeholder={
            values.method === "other" ? "es. Satispay, PayPal" : "es. pagamento di settembre"
          }
          hint={
            values.method === "other"
              ? "Scrivi come ti ha pagato: comparirà nel registro e nel CSV."
              : undefined
          }
          error={errors.fields.note}
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {after !== null && (
            <p className="m-0 text-body text-ink">
              <span className="text-ink-2">Dopo: </span>
              <b
                className={
                  after < 0
                    ? "font-semibold text-debito"
                    : after > 0
                      ? "font-semibold text-credito"
                      : "font-semibold text-ink-2"
                }
              >
                {balanceWords(after)}
              </b>
            </p>
          )}
          {warning && (
            <p className="m-0 flex items-start gap-1.5 text-[0.875rem] leading-5 text-ink">
              <WarningIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        title={editing ? "Modifica pagamento" : "Pagamento ricevuto"}
        isDirty={dirty}
        onSubmit={(event) => void submit(event)}
        hideCloseButton
        note={errors.form ? <FormNote>{errors.form}</FormNote> : null}
        actions={({ close }) =>
          editing && !original ? (
            <SheetActions>
              <Button variant="line" onPress={close}>
                Chiudi
              </Button>
            </SheetActions>
          ) : (
            <SheetActions
              start={
                original ? (
                  <Button
                    variant="danger"
                    icon={EraserIcon}
                    isDisabled={pending}
                    onPress={() =>
                      setToDelete({
                        id: original.id,
                        studentId: original.student.id,
                        date: original.paid_on,
                        amountCents: original.amount_cents,
                        method: original.method,
                        note: original.note,
                      })
                    }
                  >
                    Elimina
                  </Button>
                ) : undefined
              }
            >
              <Button variant="line" onPress={close} isDisabled={pending}>
                Annulla
              </Button>
              <Button variant="ink" type="submit" isPending={pending}>
                {editing ? "Salva pagamento" : "Registra pagamento"}
              </Button>
            </SheetActions>
          )
        }
      >
        {body}
      </Sheet>
      <DeletePaymentDialog
        payment={toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        onDeleted={() => onOpenChange(false)}
      />
    </>
  );
}
