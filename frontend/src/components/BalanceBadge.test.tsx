import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BalanceBadge, BalanceInline, DraftBadge } from "./BalanceBadge";

describe("BalanceBadge", () => {
  it("debt: word + amount, debit colours, read as «ti deve 120 euro»", () => {
    const { container } = render(<BalanceBadge cents={-12000} />);
    expect(screen.getByText("ti deve 120 euro")).toHaveClass("sr-only");
    expect(container.firstElementChild).toHaveClass("bg-debito-wash", "text-debito");
    expect(container).toHaveTextContent("Ti deve120,00 €");
    expect(container).not.toHaveTextContent("-");
  });

  it("credit: word, amount and the time from credit_minutes", () => {
    const { container } = render(<BalanceBadge cents={4000} creditMinutes={120} />);
    expect(screen.getByText("in credito di 40 euro, circa 2 h")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("bg-credito-wash", "text-credito");
    expect(container).toHaveTextContent("Credito40,00 €·");
    expect(container).toHaveTextContent("2 h");
  });

  it("credit without a current rate shows only the amount", () => {
    const { container } = render(<BalanceBadge cents={4000} creditMinutes={null} />);
    expect(container).not.toHaveTextContent("·");
  });

  it("settled: «In pari» in ink-2, no colour", () => {
    render(<BalanceBadge cents={0} />);
    expect(screen.getByText("In pari")).toHaveClass("text-ink-2");
  });

  it("draft badge is dashed graphite", () => {
    render(<DraftBadge />);
    expect(screen.getByText("Bozza")).toHaveClass("pencil-dash", "text-pencil");
  });
});

describe("BalanceInline", () => {
  it("uppercase word + Plex amount without background (long lists)", () => {
    const { container } = render(<BalanceInline cents={-6700} />);
    expect(screen.getByText("ti deve 67 euro")).toBeInTheDocument();
    expect(screen.getByText("Deve")).toHaveClass("uppercase");
    expect(screen.getByText("67,00 €")).toHaveClass("font-money");
    expect(container.querySelector(".bg-debito-wash")).toBeNull();
  });

  it("credit gets «≈ 2 h» under it; settled has no amount", () => {
    const { rerender, container } = render(<BalanceInline cents={4000} creditMinutes={120} />);
    expect(screen.getByText("Credito")).toBeInTheDocument();
    expect(container).toHaveTextContent("circa 2 h");
    rerender(<BalanceInline cents={0} />);
    expect(container).not.toHaveTextContent("€");
  });
});
