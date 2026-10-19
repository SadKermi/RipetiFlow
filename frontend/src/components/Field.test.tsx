import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { describe, expect, it, vi } from "vitest";
import {
  FormNote,
  INVALID_AMOUNT_MESSAGE,
  MoneyField,
  NumberField,
  TextAreaField,
  TextField,
} from "./Field";

describe("TextField", () => {
  it("labels the input and marks optional fields", () => {
    render(<TextField label="Argomento" optional defaultValue="" />);
    expect(screen.getByText("(facoltativo)")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Argomento/ })).not.toHaveAttribute("aria-invalid");
  });

  it("shows an error with aria-invalid and aria-describedby", () => {
    render(
      <TextField
        label="Nome"
        required
        defaultValue=""
        hint="Come lo chiami a lezione."
        error="Scrivi il nome dello studente."
      />,
    );
    const input = screen.getByRole("textbox", { name: /Nome/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription(/Scrivi il nome dello studente\./);
    expect(input).toHaveAccessibleDescription(/Come lo chiami a lezione\./);
    expect(input.className).toContain("data-invalid:field-error");
  });

  it("shows the counter only when ≤ 40 characters are left (server limits)", async () => {
    render(<TextField label="Argomento" maxLength={50} defaultValue="" />);
    const input = screen.getByRole("textbox", { name: "Argomento" });
    await userEvent.type(input, "equazioni");
    expect(screen.queryByText("9/50")).not.toBeInTheDocument();
    await userEvent.type(input, " di secondo grado");
    expect(screen.getByText("26/50")).toBeInTheDocument();
    expect(input).toHaveAttribute("maxLength", "50");
  });

  it("textarea has the same chrome", () => {
    render(<TextAreaField label="Note (solo per te)" defaultValue="" maxLength={4000} />);
    const area = screen.getByRole("textbox", { name: "Note (solo per te)" });
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveAttribute("rows", "3");
  });
});

function ControlledMoney({
  initial = null,
  onValue,
  error,
}: {
  initial?: number | null;
  onValue?: (cents: number | null) => void;
  error?: string;
}) {
  const [cents, setCents] = useState<number | null>(initial);
  return (
    <>
      <MoneyField
        label="Importo"
        value={cents}
        error={error}
        onChange={(next) => {
          setCents(next);
          onValue?.(next);
        }}
      />
      <button type="button" onClick={() => setCents(8900)}>
        89,00
      </button>
      <output>{cents === null ? "vuoto" : String(cents)}</output>
    </>
  );
}

describe("MoneyField", () => {
  it("parses Italian amounts into integer cents and formats on blur", async () => {
    const onValue = vi.fn();
    render(<ControlledMoney onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Importo" });
    expect(input).toHaveAttribute("inputmode", "decimal");
    await userEvent.type(input, "1.234,5");
    expect(screen.getByRole("status")).toHaveTextContent("123450");
    await userEvent.tab();
    expect(input).toHaveValue("1234,50");
    expect(onValue).toHaveBeenLastCalledWith(123450);
  });

  it("accepts a dot as decimal separator (phone keypads)", async () => {
    render(<ControlledMoney />);
    await userEvent.type(screen.getByRole("textbox", { name: "Importo" }), "12.5");
    expect(screen.getByRole("status")).toHaveTextContent("1250");
  });

  it("flags unreadable text after blur and gives null", async () => {
    render(<ControlledMoney />);
    const input = screen.getByRole("textbox", { name: "Importo" });
    await userEvent.type(input, "12,345");
    expect(input).not.toHaveAttribute("aria-invalid"); // not while typing
    await userEvent.tab();
    expect(screen.getByRole("status")).toHaveTextContent("vuoto");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(INVALID_AMOUNT_MESSAGE);
  });

  it("takes a new value from outside (quick chips)", async () => {
    render(<ControlledMoney initial={6700} />);
    const input = screen.getByRole("textbox", { name: "Importo" });
    expect(input).toHaveValue("67,00");
    await userEvent.click(screen.getByRole("button", { name: "89,00" }));
    expect(input).toHaveValue("89,00");
  });

  it("shows the server's error on the field", () => {
    render(<ControlledMoney initial={0} error="L'importo deve essere almeno 0,01 €." />);
    expect(screen.getByRole("textbox", { name: "Importo" })).toHaveAccessibleDescription(
      "L'importo deve essere almeno 0,01 €.",
    );
  });
});

describe("NumberField", () => {
  it("reads whole numbers in it-IT and gives null when empty", async () => {
    const onChange = vi.fn();
    render(
      <I18nProvider locale="it-IT">
        <NumberField label="Durata predefinita" suffix="min" value={null} onChange={onChange} />
      </I18nProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Durata predefinita" });
    await userEvent.type(input, "90");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(90);
  });
});

describe("FormNote", () => {
  it("is an alert with the server's text, and nothing without text", () => {
    const { rerender } = render(<FormNote>{null}</FormNote>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<FormNote>Sei offline: niente è stato salvato.</FormNote>);
    expect(screen.getByRole("alert")).toHaveTextContent("Sei offline: niente è stato salvato.");
  });
});
