import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AgendaItem, DayHeading } from "./AgendaItem";

const TODAY = "2026-10-06";
const LESSON = {
  id: "l1",
  date: TODAY,
  start_time: "15:00",
  end_time: "16:00",
  settled: false,
  student: { id: "s-luca", display_name: "Luca Bianchi" },
  subject: { id: "lat", name: "Latino" },
  calendar: { status: "synced" as const, error: null },
};

function renderItem(props: Partial<React.ComponentProps<typeof AgendaItem>> = {}) {
  return render(
    <MemoryRouter>
      <AgendaItem lesson={LESSON} today={TODAY} nowMinutes={14 * 60 + 20} {...props} />
    </MemoryRouter>,
  );
}

describe("AgendaItem", () => {
  it("links to the student's page with the lesson, and counts down on the highlighter", () => {
    renderItem();
    const link = screen.getByRole("link", { name: /Luca Bianchi/ });
    expect(link).toHaveAttribute("href", "/studenti/s-luca?riga=l1");
    expect(screen.getByText("tra 40 min")).toHaveClass("marker");
    expect(link).toHaveClass("text-ink");
  });

  it("is named by all of its visible text, in reading order (WCAG 2.5.3)", () => {
    renderItem();
    const link = screen.getByRole("link");
    expect(link).toHaveAccessibleName(/^15:00.*16:00.*Luca Bianchi.*Latino.*tra 40 min$/);
    expect(link).not.toHaveAttribute("aria-labelledby");
  });

  it("says «in corso» during the lesson", () => {
    renderItem({ nowMinutes: 15 * 60 + 30 });
    expect(screen.getByText("in corso")).toHaveClass("marker");
  });

  it("a lesson already in the balance is ink-2, no other sign", () => {
    renderItem({ lesson: { ...LESSON, settled: true }, nowMinutes: 17 * 60 });
    expect(screen.getByRole("link")).toHaveClass("text-ink-2");
    expect(screen.queryByText(/tra|in corso/)).not.toBeInTheDocument();
  });

  it("flags a lesson that is not in Google Calendar", () => {
    renderItem({ lesson: { ...LESSON, calendar: { status: "error", error: "x" } } });
    expect(screen.getByText("Non è in Google Calendar")).toHaveClass("sr-only");
  });
});

describe("DayHeading", () => {
  it("is a heading in caption style", () => {
    render(<DayHeading date="2026-10-07" />);
    expect(screen.getByRole("heading", { level: 3, name: "mer 7 ott" })).toHaveClass("uppercase");
  });

  it("long form with «oggi»", () => {
    render(<DayHeading date={TODAY} today={TODAY} long level={2} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "martedì 6 ott · oggi" }),
    ).toBeInTheDocument();
  });
});
