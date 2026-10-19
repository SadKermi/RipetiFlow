import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { useFormErrors } from "./useFormErrors";

type Api = ReturnType<typeof useFormErrors<"amount" | "note">>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const errors = useFormErrors(
    { fields: ["amount", "note"] as const, map: { amount_cents: "amount" } },
    formRef,
  );
  onReady(errors);
  return (
    <form ref={formRef}>
      <label>
        Importo
        <input aria-invalid={errors.fields.amount ? true : undefined} />
      </label>
      <label>
        Nota
        <input aria-invalid={errors.fields.note ? true : undefined} />
      </label>
      {errors.form && <p role="alert">{errors.form}</p>}
    </form>
  );
}

describe("useFormErrors", () => {
  it("maps a problem, focuses the first invalid field and clears a field on edit", () => {
    let api: Api | undefined;
    render(<Harness onReady={(value) => (api = value)} />);

    act(() =>
      api!.fromProblem(
        ApiProblem.fromBody(422, {
          code: "validation_error",
          detail: "Controlla i dati inseriti.",
          errors: [
            { field: "note", message: "Al massimo 500 caratteri." },
            { field: "amount_cents", message: "L'importo deve essere almeno 0,01 €." },
          ],
        }),
      ),
    );

    expect(api!.fields).toEqual({
      amount: "L'importo deve essere almeno 0,01 €.",
      note: "Al massimo 500 caratteri.",
    });
    expect(screen.getByLabelText("Importo")).toHaveFocus();

    act(() => api!.clearField("amount"));
    expect(api!.fields).toEqual({ note: "Al massimo 500 caratteri." });
    expect(api!.hasErrors).toBe(true);

    act(() => api!.reset());
    expect(api!.hasErrors).toBe(false);
  });

  it("shows a form-level note for errors without a field", () => {
    let api: Api | undefined;
    render(<Harness onReady={(value) => (api = value)} />);
    act(() => api!.fromProblem(ApiProblem.network()));
    expect(screen.getByRole("alert")).toHaveTextContent("Sei offline: niente è stato salvato.");
  });
});
