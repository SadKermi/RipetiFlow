import { BankIcon, MoneyIcon, WalletIcon } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { PaymentMethod } from "@/lib/api/types";
import { SegmentedControl } from "./SegmentedControl";

function Method() {
  const [method, setMethod] = useState<PaymentMethod | null>("cash");
  return (
    <>
      <SegmentedControl
        label="Come"
        value={method}
        onChange={setMethod}
        fullWidth
        options={[
          { value: "cash", label: "Contanti", icon: MoneyIcon },
          { value: "bank_transfer", label: "Bonifico", icon: BankIcon },
          { value: "other", label: "Altro", icon: WalletIcon },
        ]}
      />
      <output>{method}</output>
    </>
  );
}

describe("SegmentedControl", () => {
  it("is a labelled radiogroup", () => {
    render(<Method />);
    expect(screen.getByRole("radiogroup", { name: "Come" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Contanti" })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("changes with a click and with the arrow keys", async () => {
    render(<Method />);
    await userEvent.click(screen.getByRole("radio", { name: "Bonifico" }));
    expect(screen.getByRole("status")).toHaveTextContent("bank_transfer");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Altro" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("other");
  });
});
