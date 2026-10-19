import { PlusIcon } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Button, InlineButton, LinkButton } from "./Button";

describe("Button", () => {
  it("is a real button with its variant look", async () => {
    const onPress = vi.fn();
    render(
      <Button variant="ink" onPress={onPress}>
        Salva lezione
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salva lezione" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("bg-ink");
    expect(button.className).toContain("h-control");
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("small buttons are 36 px only from 768 px up (44 on mobile)", () => {
    render(
      <Button size="sm" variant="quiet">
        Modifica
      </Button>,
    );
    const className = screen.getByRole("button", { name: "Modifica" }).className;
    expect(className).toContain("h-control ");
    expect(className).toContain("md:h-control-sm");
  });

  it("pending: keeps the label, sets aria-busy and ignores presses (no double submit)", async () => {
    const onPress = vi.fn();
    render(
      <Button variant="ink" icon={PlusIcon} isPending onPress={onPress}>
        Registra pagamento
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Registra pagamento/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toBeNull(); // icon replaced by the static dots
    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("square icon buttons are named by aria-label", () => {
    render(<Button square icon={PlusIcon} aria-label="Nuova lezione" />);
    const button = screen.getByRole("button", { name: "Nuova lezione" });
    expect(button.className).toContain("w-control");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("disabled buttons say so to assistive tech", () => {
    render(
      <Button variant="ink" isDisabled>
        Salva tariffa
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Salva tariffa" })).toBeDisabled();
  });
});

describe("LinkButton / InlineButton", () => {
  it("navigates like a link and looks like a button", () => {
    render(
      <MemoryRouter>
        <LinkButton to="/oggi" variant="ink">
          Vai a Oggi
        </LinkButton>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Vai a Oggi" });
    expect(link).toHaveAttribute("href", "/oggi");
    expect(link.className).toContain("bg-ink");
  });

  it("inline buttons keep a 44 px touch area", async () => {
    const onPress = vi.fn();
    render(<InlineButton onPress={onPress}>Riprova</InlineButton>);
    const button = screen.getByRole("button", { name: "Riprova" });
    expect(button.className).toContain("py-3");
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledOnce();
  });
});
