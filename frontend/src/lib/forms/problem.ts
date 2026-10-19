// Server errors in forms (docs/design/03-schermate.md §10.4). A failed write never closes the
// form: every `errors[].field` of an RFC 9457 problem goes on the field it names (same look as the
// local validation), and whatever has no field in this form becomes one note above the action bar.
import { errorMessage, isApiProblem } from "@/lib/api/problem";

export interface FormErrors<F extends string> {
  /** Message per form field, in the same shape as local validation errors. */
  fields: Partial<Record<F, string>>;
  /** Note above the action bar: errors without a field, or for a field this form does not have. */
  form: string | null;
}

export interface ProblemMapping<F extends string> {
  /**
   * The form's fields, in screen order: an API field with the same name lands there, and the
   * order decides which field gets the focus first.
   */
  fields: readonly F[];
  /** API field → form field when the names differ (`paid_on` → `date`, `amount_cents` → `amount`). */
  map?: Readonly<Partial<Record<string, F>>>;
}

export const OFFLINE_WRITE_MESSAGE =
  "Sei offline: niente è stato salvato. Riprova quando torna la rete.";
const TRY_AGAIN = "Riprova tra poco.";

export const NO_FORM_ERRORS: FormErrors<never> = Object.freeze({ fields: {}, form: null });

function withTryAgain(text: string): string {
  return text.includes(TRY_AGAIN) ? text : `${text} ${TRY_AGAIN}`;
}

/**
 * Turns whatever a mutation threw into field errors and a form-level note:
 * - 422 with `errors[]`: each field on its own input; a field the form does not have → note;
 * - 409/422 without `errors`, 502, 503: the server's `detail` as the note;
 * - 500: `detail` + «Riprova tra poco.» (never technical details);
 * - no answer at all: «Sei offline: niente è stato salvato…».
 */
export function problemToFormErrors<F extends string>(
  error: unknown,
  mapping: ProblemMapping<F>,
): FormErrors<F> {
  if (!isApiProblem(error)) return { fields: {}, form: errorMessage(error) };
  if (error.code === "network_error") return { fields: {}, form: OFFLINE_WRITE_MESSAGE };

  const known = new Set<string>(mapping.fields);
  const fields: Partial<Record<F, string>> = {};
  const unplaced: string[] = [];
  for (const [apiField, message] of Object.entries(error.fieldErrors)) {
    const target = mapping.map?.[apiField] ?? (known.has(apiField) ? (apiField as F) : undefined);
    if (target !== undefined && known.has(target)) {
      fields[target] ??= message;
    } else if (!unplaced.includes(message)) {
      unplaced.push(message);
    }
  }

  let form: string | null = unplaced.length > 0 ? unplaced.join(" ") : null;
  if (Object.keys(error.fieldErrors).length === 0) {
    form = error.status >= 500 && error.code === "internal_error" ? withTryAgain(error.detail) : error.detail;
  }
  return { fields, form };
}

/** The first field (in screen order) that has an error, to move the focus there. */
export function firstErrorField<F extends string>(
  errors: Partial<Record<F, string>>,
  order: readonly F[],
): F | null {
  return order.find((field) => Boolean(errors[field])) ?? null;
}

/** Selector of every control marked invalid by our fields (inputs, and the day/select buttons). */
export const INVALID_CONTROL_SELECTOR = '[aria-invalid="true"], [data-rf-invalid="true"]';

/** Moves the focus to the first invalid control inside `root` (03 §10.4). Returns whether it did. */
export function focusFirstInvalid(root: ParentNode | null | undefined): boolean {
  const target = root?.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR);
  if (!target) return false;
  target.focus();
  return true;
}
