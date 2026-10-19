import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReplyText } from "./ReplyText";

describe("ReplyText", () => {
  it("renders bold and lists, and nothing else: no links, no HTML", () => {
    const { container } = render(
      <ReplyText
        reply={
          "Ti devono più di 50 €:\n- **Marco Rossi**: 120,00 €\n- Giulia Ferri: 67,00 €\n\n<b>x</b> https://esempio.it"
        }
      />,
    );
    expect(screen.getByText("Marco Rossi").tagName).toBe("B");
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Marco Rossi: 120,00 €",
      "Giulia Ferri: 67,00 €",
    ]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("<b>x</b> https://esempio.it")).toBeInTheDocument();
    expect(container.querySelectorAll("b")).toHaveLength(1);
  });

  it("keeps single newlines as line breaks and drops single-star marks", () => {
    const { container } = render(<ReplyText reply={"Prima riga\nseconda *riga*"} />);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toBe("Prima rigaseconda riga");
  });
});
