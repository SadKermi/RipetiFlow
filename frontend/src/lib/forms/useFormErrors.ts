import { useCallback, useEffect, useRef, useState } from "react";
import { type FormErrors, type ProblemMapping, focusFirstInvalid, problemToFormErrors } from "./problem";

/**
 * Field errors + form-level note for one form (03 §10.4), local and from the server.
 *
 * ```tsx
 * const errors = useFormErrors({ fields: ["student", "date", "start", "end"], map: { start_time: "start" } });
 * mutation.mutate(body, { onError: errors.fromProblem });
 * <form ref={errors.formRef}> <TextField error={errors.fields.start} … /> <FormNote>{errors.form}</FormNote>
 * ```
 * After `fromProblem` (or `show`) the focus moves to the first invalid control inside `formRef`.
 */
export function useFormErrors<F extends string>(mapping: ProblemMapping<F>) {
  const [state, setState] = useState<FormErrors<F>>({ fields: {}, form: null });
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement | HTMLDivElement | null>(null);
  const mappingRef = useRef(mapping);
  useEffect(() => {
    mappingRef.current = mapping;
  });

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  /** Shows the errors of a failed request and focuses the first field in error. */
  const fromProblem = useCallback((error: unknown) => {
    setState(problemToFormErrors(error, mappingRef.current));
    setFocusRequest((n) => n + 1);
  }, []);

  /** Shows local validation errors (e.g. before submitting) and focuses the first one. */
  const show = useCallback((errors: Partial<Record<F, string>>, form: string | null = null) => {
    setState({ fields: errors, form });
    setFocusRequest((n) => n + 1);
  }, []);

  /** Clears one field's message (call it when the user edits that field). */
  const clearField = useCallback((field: F) => {
    setState((current) => {
      if (!current.fields[field]) return current;
      const fields = { ...current.fields };
      delete fields[field];
      return { ...current, fields };
    });
  }, []);

  const reset = useCallback(() => setState({ fields: {}, form: null }), []);

  const hasErrors = state.form !== null || Object.values(state.fields).some(Boolean);

  return {
    fields: state.fields,
    form: state.form,
    hasErrors,
    formRef,
    fromProblem,
    show,
    clearField,
    reset,
  };
}
