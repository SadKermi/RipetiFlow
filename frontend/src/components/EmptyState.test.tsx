import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("one sentence and one action", () => {
    render(
      <EmptyState action={<Button variant="ink">Aggiungi studente</Button>}>
        Nessuno studente. Inizia dal primo: nome e tariffa bastano.
      </EmptyState>,
    );
    expect(
      screen.getByText("Nessuno studente. Inizia dal primo: nome e tariffa bastano."),
    ).toHaveClass("text-ink");
    expect(screen.getByRole("button", { name: "Aggiungi studente" })).toBeInTheDocument();
  });

  it("quiet tone for «Tutti in pari.», blank page for an empty ledger (decorative)", () => {
    const { container } = render(
      <EmptyState blankPage tone="quiet">
        Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo.
      </EmptyState>,
    );
    expect(screen.getByText(/Pagina bianca/)).toHaveClass("text-ink-2");
    const page = container.querySelector('[aria-hidden="true"]');
    expect(page?.children).toHaveLength(6);
  });
});
