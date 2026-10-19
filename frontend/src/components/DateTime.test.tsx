import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { describe, expect, it, vi } from "vitest";
import { checkTimeRange } from "@/lib/forms";
import { DayField, TimeRangeField } from "./DateTime";

const TODAY = "2026-10-06";

function Day({ initial = TODAY, error }: { initial?: string; error?: string }) {
  const [date, setDate] = useState(initial);
  return (
    <I18nProvider locale="it-IT">
      <DayField value={date} onChange={setDate} today={TODAY} error={error} maxValue="2028-10-06" />
      <output>{date}</output>
    </I18nProvider>
  );
}

describe("DayField", () => {
  it("on a phone the field opens the native date picker only, not the calendar too", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("max-width"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    // jsdom has no showPicker(): stand in for the phone's native picker.
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
      value: showPicker,
      configurable: true,
    });
    try {
      render(<Day />);
      await userEvent.click(screen.getByRole("button", { name: /Giorno mar 6 ott 2026/ }));
      expect(showPicker).toHaveBeenCalledOnce();
      await userEvent.click(screen.getByRole("button", { name: "Altro…" }));
      expect(showPicker).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(HTMLInputElement.prototype, "showPicker");
      vi.unstubAllGlobals();
    }
  });

  it("shows the day with the year and «oggi», named by its label", () => {
    render(<Day />);
    const field = screen.getByRole("button", { name: /Giorno mar 6 ott 2026, oggi/ });
    expect(field).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("group", { name: "Giorno" })).toBeInTheDocument();
  });

  it("«Oggi · Ieri» shortcuts set the date in the tutor's calendar", async () => {
    render(<Day initial="2026-09-28" />);
    expect(screen.getByRole("button", { name: /lun 28 set 2026/ })).toBeInTheDocument();
    const shortcuts = screen.getByRole("group", { name: "Giorno: scorciatoie" });
    await userEvent.click(within(shortcuts).getByRole("button", { name: "Ieri" }));
    expect(screen.getByRole("status")).toHaveTextContent("2026-10-05");
    expect(screen.getByRole("button", { name: /lun 5 ott 2026, ieri/ })).toBeInTheDocument();
    await userEvent.click(within(shortcuts).getByRole("button", { name: "Oggi" }));
    expect(screen.getByRole("status")).toHaveTextContent(TODAY);
  });

  it("«Altro…» opens a Monday-first calendar on desktop; choosing a day closes it", async () => {
    render(<Day />);
    await userEvent.click(screen.getByRole("button", { name: "Altro…" }));
    const dialog = await screen.findByRole("dialog", { name: /scegli dal calendario/ });
    const headers = Array.from(dialog.querySelectorAll("thead th"), (th) => th.textContent);
    expect(headers[0]).toMatch(/^lun/i);
    expect(headers[6]).toMatch(/^dom/i);
    await userEvent.click(within(dialog).getByRole("button", { name: /giovedì 8 ottobre 2026/i }));
    expect(screen.getByRole("status")).toHaveTextContent("2026-10-08");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links the error to the field and marks it for focusFirstInvalid", () => {
    render(<Day error="La data è troppo lontana: al massimo due anni da oggi." />);
    const field = screen.getByRole("button", { name: /Giorno/ });
    expect(field).toHaveAttribute("data-rf-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      "La data è troppo lontana: al massimo due anni da oggi.",
    );
  });
});

function Times({ onEnd }: { onEnd?: (value: string) => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const check = checkTimeRange(start, end);
  return (
    <TimeRangeField
      start={start}
      end={end}
      onStartChange={setStart}
      onEndChange={(value) => {
        setEnd(value);
        onEnd?.(value);
      }}
      startError={check.startError}
      endError={check.endError}
      warning={check.warning}
    />
  );
}

describe("TimeRangeField", () => {
  it("normalizes «1630» on blur and the quick lengths fill «Fine»", async () => {
    render(<Times />);
    const start = screen.getByRole("textbox", { name: "Inizio" });
    expect(start).toHaveAttribute("inputmode", "numeric");
    await userEvent.type(start, "1630");
    await userEvent.tab();
    expect(start).toHaveValue("16:30");
    await userEvent.click(screen.getByRole("button", { name: "Durata 1 h 30 min" }));
    expect(screen.getByRole("textbox", { name: "Fine" })).toHaveValue("18:00");
    expect(screen.getByText("1 h 30 min")).toBeInTheDocument();
  });

  it("quick lengths wait for a valid start", () => {
    render(<Times />);
    expect(screen.getByRole("button", { name: "Durata 1 h" })).toBeDisabled();
  });

  it("shows the server's text when the end is not after the start", async () => {
    render(<Times />);
    await userEvent.type(screen.getByRole("textbox", { name: "Inizio" }), "16:30");
    const end = screen.getByRole("textbox", { name: "Fine" });
    await userEvent.type(end, "16");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      /L'orario di fine deve essere successivo a quello di inizio\./,
    );
  });

  it("warns, without blocking, above 8 hours", async () => {
    const onEnd = vi.fn();
    render(<Times onEnd={onEnd} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Inizio" }), "8");
    await userEvent.type(screen.getByRole("textbox", { name: "Fine" }), "17");
    expect(screen.getByText("Sono 9 h di lezione: è giusto?")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Fine" })).not.toHaveAttribute("aria-invalid");
  });
});
