import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./Toast";
import { type ToastOptions, useToast } from "./toast-context";

function Trigger({ options }: { options: ToastOptions | string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      Mostra
    </button>
  );
}

function renderToast(options: ToastOptions | string) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mostra" }));
}

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is announced through an always-present polite live region", () => {
    render(
      <ToastProvider>
        <Trigger options="Lezione registrata · nel saldo" />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(region).toHaveTextContent("Lezione registrata · nel saldo");
  });

  it("leaves after 5 s", () => {
    renderToast("Tariffa salvata");
    void act(() => vi.advanceTimersByTime(4_900));
    expect(screen.getByRole("status")).toHaveTextContent("Tariffa salvata");
    void act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("«Annulla» used from the keyboard leaves the focus on the page, not on <body>", () => {
    const onAction = vi.fn();
    render(
      <main id="main" tabIndex={-1}>
        <ToastProvider>
          <Trigger
            options={{ message: "Lezione eliminata", action: { label: "Annulla", onAction } }}
          />
        </ToastProvider>
      </main>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostra" }));
    const undo = screen.getByRole("button", { name: "Annulla" });
    act(() => undo.focus());
    fireEvent.keyDown(undo, { key: "Enter" });
    fireEvent.keyUp(undo, { key: "Enter" });
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Annulla" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("with «Annulla» it stays 8 s, and the action runs once and closes it", () => {
    const onAction = vi.fn();
    renderToast({
      message: "Pagamento di 100,00 € registrato",
      action: { label: "Annulla", onAction },
    });
    void act(() => vi.advanceTimersByTime(6_000));
    const undo = screen.getByRole("button", { name: "Annulla" });
    fireEvent.click(undo);
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("pauses while hovered or focused", () => {
    renderToast({
      message: "Lezione programmata per gio 8 ott",
      action: { label: "Annulla", onAction: vi.fn() },
    });
    const toast = screen.getByText("Lezione programmata per gio 8 ott").parentElement!;
    void act(() => vi.advanceTimersByTime(3_000));
    fireEvent.pointerEnter(toast);
    void act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toHaveTextContent("Lezione programmata");
    fireEvent.pointerLeave(toast);
    fireEvent.focus(screen.getByRole("button", { name: "Annulla" }));
    void act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toHaveTextContent("Lezione programmata");
    fireEvent.blur(screen.getByRole("button", { name: "Annulla" }));
    void act(() => vi.advanceTimersByTime(5_100)); // the 5 s that were left
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("useToast outside the provider is a programming error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger options="x" />)).toThrow(/ToastProvider/);
  });
});
