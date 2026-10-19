import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rate } from "@/lib/api/types";
import { DeleteRateDialog, RateChangeDialog } from "./RateDialogs";
import { NOW, giulia, mockApi, problem, renderWithProviders } from "./test-utils";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function ChangeHarness() {
  const [open, setOpen] = useState(true);
  return <RateChangeDialog isOpen={open} onOpenChange={setOpen} student={giulia()} />;
}

const PREVIEW = {
  affected_lessons: 2,
  current_total_cents: 6600,
  new_total_cents: 7200,
  delta_cents: 600,
};

describe("RateChangeDialog (D-16)", () => {
  it("previews the lessons, requires an explicit choice and sends it", async () => {
    const requests = mockApi({
      "POST /students/giulia/rates/preview": PREVIEW,
      "POST /students/giulia/rates": {
        rate: { id: "r3", hourly_rate_cents: 2400, effective_from: "2026-10-05", created_at: "" },
        repriced_lessons: 2,
      },
    });
    renderWithProviders(<ChangeHarness />);
    expect(screen.getByRole("heading", { name: "Nuova tariffa per Giulia" })).toBeInTheDocument();
    expect(screen.getByText(/Tariffa attuale 22,00\s€\/h dal 1 ott/)).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: /Nuova tariffa/ }), "24");
    await userEvent.click(screen.getByRole("button", { name: "Ieri" }));

    expect(
      await screen.findByText(
        /Dal 5 ott ci sono 2 lezioni che seguono la tariffa dello storico: 66,00\s€\./,
      ),
    ).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "Cosa fare con queste 2 lezioni?" });
    const keep = within(group).getByRole("radio", { name: /Solo per le nuove lezioni/ });
    const reprice = within(group).getByRole("radio", {
      name: /Ricalcola le 2 lezioni \(\+6,00\s€\)/,
    });
    expect(keep).not.toBeChecked();
    expect(reprice).not.toBeChecked();
    expect(screen.getByText(/Le 2 lezioni restano a 22,00\s€\/h\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva tariffa" })).toBeDisabled();
    expect(screen.getByText("Scegli cosa fare con le lezioni già registrate")).toBeInTheDocument();

    await userEvent.click(reprice);
    await userEvent.click(screen.getByRole("button", { name: "Salva tariffa" }));
    await waitFor(() =>
      expect(requests.find((r) => r.path === "/students/giulia/rates")?.body).toEqual({
        hourly_rate_cents: 2400,
        effective_from: "2026-10-05",
        reprice_existing: true,
      }),
    );
    expect(
      await screen.findByText(/Tariffa di 24,00\s€\/h dal 5 ott salvata · 2 lezioni ricalcolate/),
    ).toBeInTheDocument();
  });

  it("without lessons affected there is no choice and nothing is repriced", async () => {
    const requests = mockApi({
      "POST /students/giulia/rates/preview": { ...PREVIEW, affected_lessons: 0, delta_cents: 0 },
      "POST /students/giulia/rates": problem(
        409,
        "Esiste già una tariffa con questa data di decorrenza.",
        [
          {
            field: "effective_from",
            message: "Esiste già una tariffa con questa data di decorrenza.",
          },
        ],
      ),
    });
    renderWithProviders(<ChangeHarness />);
    await userEvent.type(screen.getByRole("textbox", { name: /Nuova tariffa/ }), "24");
    expect(
      await screen.findByText(
        "Nessuna lezione registrata dal 6 ott: la nuova tariffa vale per le prossime.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salva tariffa" }));
    // 409 on the same date: the server's text on «Valida dal».
    expect(
      await screen.findByText("Esiste già una tariffa con questa data di decorrenza."),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.path === "/students/giulia/rates")?.body).toMatchObject({
      reprice_existing: false,
    });
    expect(screen.getByRole("button", { name: /Valida dal/ })).toHaveAttribute(
      "data-rf-invalid",
      "true",
    );
  });
});

describe("DeleteRateDialog", () => {
  function DeleteHarness({ rate }: { rate: Rate }) {
    const [current, setCurrent] = useState<Rate | null>(rate);
    return (
      <DeleteRateDialog
        rate={current}
        rates={giulia().rates}
        studentId="giulia"
        onOpenChange={(open) => {
          if (!open) setCurrent(null);
        }}
      />
    );
  }

  it("asks what to do with the lessons and sends reprice_existing", async () => {
    const requests = mockApi({
      "DELETE /students/giulia/rates/r2": new Response(null, { status: 204 }),
    });
    renderWithProviders(<DeleteHarness rate={giulia().rates[0]!} />);
    const dialog = screen.getByRole("alertdialog", {
      name: /Eliminare la tariffa di 22,00\s€\/h dal 1 ott 2026\?/,
    });
    const confirm = within(dialog).getByRole("button", { name: "Elimina tariffa" });
    expect(confirm).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole("radio", {
        name: /Riporta alla tariffa precedente \(20,00\s€\/h\) le lezioni dal 1 ott che seguono lo storico/,
      }),
    );
    await userEvent.click(confirm);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.url.searchParams.get("reprice_existing")).toBe("true");
    expect(await screen.findByText(/Tariffa di 22,00\s€\/h eliminata/)).toBeInTheDocument();
  });
});
