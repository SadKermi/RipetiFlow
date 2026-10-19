import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "@/lib/api/types";
import { PaymentFormDialog, type PaymentFormDialogProps } from "./PaymentFormDialog";
import { NOW, giulia, mockApi, problem, renderWithProviders, summary } from "./test-utils";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const PAYMENT: Payment = {
  id: "p-2ott",
  student: { id: "giulia", display_name: "Giulia Ferri" },
  amount_cents: 5000,
  paid_on: "2026-10-02",
  method: "bank_transfer",
  note: null,
  created_at: "",
  updated_at: "",
};

const ROUTES = {
  "GET /students": { items: [summary("giulia", "Giulia Ferri", -6700)] },
  "GET /students/giulia": giulia(),
};

function Harness(props: Omit<PaymentFormDialogProps, "isOpen" | "onOpenChange">) {
  const [open, setOpen] = useState(true);
  return <PaymentFormDialog {...props} isOpen={open} onOpenChange={setOpen} />;
}

function dialog() {
  return screen.getByRole("dialog");
}

describe("PaymentFormDialog", () => {
  it("suggests the debt, shows «Dopo: …» and registers the payment", async () => {
    const requests = mockApi({
      ...ROUTES,
      "POST /payments": { ...PAYMENT, id: "new", amount_cents: 6700, paid_on: "2026-10-06" },
    });
    renderWithProviders(<Harness initial={{ student_id: "giulia" }} />);
    expect(screen.getByRole("heading", { name: "Pagamento ricevuto" })).toBeInTheDocument();
    const amount = within(dialog()).getByRole("textbox", { name: /Importo/ });
    await waitFor(() => expect(amount).toHaveValue("67,00"));
    expect(within(dialog()).getByText("ti deve 67 euro")).toBeInTheDocument(); // the badge
    expect(within(dialog()).getByText("in pari")).toBeInTheDocument(); // «Dopo: in pari»

    // Chips: the balance and the balance with the scheduled lessons.
    const chips = within(dialog()).getByRole("group", { name: "Importi suggeriti" });
    await userEvent.click(
      within(chips).getByRole("button", { name: /89,00 €, con le programmate/ }),
    );
    expect(amount).toHaveValue("89,00");
    expect(within(dialog()).getByText(/credito 22,00\s€/)).toBeInTheDocument();

    await userEvent.click(within(chips).getByRole("button", { name: /67,00 €, il saldo/ }));
    await userEvent.click(within(dialog()).getByRole("radio", { name: "Bonifico" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Registra pagamento" }));

    await waitFor(() => expect(requests.some((r) => r.method === "POST")).toBe(true));
    expect(requests.find((r) => r.method === "POST")?.body).toEqual({
      student_id: "giulia",
      amount_cents: 6700,
      paid_on: "2026-10-06",
      method: "bank_transfer",
      note: null,
    });
    expect(await screen.findByText(/Pagamento di 67,00\s€ registrato/)).toBeInTheDocument();
  });

  it("with «Altro» the note is suggested; a very high amount warns without blocking", async () => {
    mockApi(ROUTES);
    renderWithProviders(<Harness initial={{ student_id: "giulia" }} />);
    const amount = within(dialog()).getByRole("textbox", { name: /Importo/ });
    await waitFor(() => expect(amount).toHaveValue("67,00"));
    await userEvent.click(within(dialog()).getByRole("radio", { name: "Altro" }));
    expect(within(dialog()).getByPlaceholderText("es. Satispay, PayPal")).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Scrivi come ti ha pagato: comparirà nel registro e nel CSV."),
    ).toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, "300");
    expect(
      within(dialog()).getByText(
        /Sono 300,00\s€: dopo, Giulia avrà 233,00\s€ di credito \(circa 10 h 35 min a 22,00\s€\/h\)\./,
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Registra pagamento" })).toBeEnabled();
  });

  it("the server's amount error lands on «Importo»", async () => {
    mockApi({
      ...ROUTES,
      "POST /payments": problem(422, "Dati non validi", [
        {
          field: "amount_cents",
          message: "L'importo deve essere compreso tra 0,01 € e 100.000,00 €.",
        },
      ]),
    });
    renderWithProviders(<Harness initial={{ student_id: "giulia", amount_cents: 1 }} />);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Registra pagamento" }));
    expect(
      await within(dialog()).findByText(
        "L'importo deve essere compreso tra 0,01 € e 100.000,00 €.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole("textbox", { name: /Importo/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("edits a payment: the old amount is taken out of «Dopo», only changes are sent", async () => {
    const requests = mockApi({
      ...ROUTES,
      "GET /payments/p-2ott": PAYMENT,
      "PATCH /payments/p-2ott": { ...PAYMENT, amount_cents: 6000 },
    });
    renderWithProviders(<Harness paymentId="p-2ott" />);
    expect(screen.getByRole("heading", { name: "Modifica pagamento" })).toBeInTheDocument();
    const amount = await within(dialog()).findByRole("textbox", { name: /Importo/ });
    expect(amount).toHaveValue("50,00");
    await userEvent.clear(amount);
    await userEvent.type(amount, "60");
    // Balance −67 without this payment is −117; + 60 → deve 57,00 €.
    expect(within(dialog()).getByText(/deve 57,00\s€/)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Salva pagamento" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PATCH")).toBe(true));
    expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ amount_cents: 6000 });
    expect(await screen.findByText("Pagamento modificato")).toBeInTheDocument();
  });

  it("editing: the suggested amounts settle the balance without this payment", async () => {
    mockApi({ ...ROUTES, "GET /payments/p-2ott": PAYMENT });
    renderWithProviders(<Harness paymentId="p-2ott" />);
    const amount = await within(dialog()).findByRole("textbox", { name: /Importo/ });
    expect(amount).toHaveValue("50,00");
    // Owes 67,00 € with this payment counted: 117,00 € without it, 139,00 € with the scheduled.
    const chips = await within(dialog()).findByRole("group", { name: "Importi suggeriti" });
    await userEvent.click(within(chips).getByRole("button", { name: /^117,00 €, il saldo/ }));
    expect(amount).toHaveValue("117,00");
    expect(within(dialog()).getByText("in pari")).toBeInTheDocument();
    expect(
      within(chips).getByRole("button", { name: /^139,00 €, con le programmate/ }),
    ).toBeInTheDocument();
  });

  it("checks locally that someone and an amount are given", async () => {
    const requests = mockApi(ROUTES);
    renderWithProviders(<Harness />);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Registra pagamento" }));
    expect(await within(dialog()).findByText("Scegli chi ha pagato.")).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Scrivi l'importo ricevuto, per esempio 50,00."),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });
});
