import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { StudentSummary } from "@/lib/api/types";
import { StudentListItem } from "./StudentListItem";

const TODAY = "2026-10-06";

function student(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: "s-marco",
    first_name: "Marco",
    last_name: "Rossi",
    display_name: "Marco Rossi",
    grade: "2ª liceo classico",
    school: "Liceo Parini",
    archived: false,
    balance: {
      balance_cents: -12000,
      projected_balance_cents: -15000,
      charged_cents: 32000,
      paid_cents: 20000,
      scheduled_cents: 3000,
      done_minutes: 960,
      scheduled_minutes: 90,
      current_hourly_rate_cents: 2000,
      status: "debt",
      credit_minutes: null,
    },
    next_lesson: { date: "2026-10-07", start_time: "16:00" },
    last_lesson_date: "2026-10-01",
    ...overrides,
  };
}

describe("StudentListItem", () => {
  it("is one link to the student's page, named by the student", () => {
    render(
      <MemoryRouter>
        <StudentListItem student={student()} today={TODAY} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Marco Rossi" });
    expect(link).toHaveAttribute("href", "/studenti/s-marco");
    // Its name is all of its visible text (WCAG 2.5.3); the rest of the row describes it.
    expect(link).toHaveTextContent(/^Marco Rossi$/);
    expect(link).toHaveAccessibleDescription(
      "2ª liceo classico · prossima mer 7 ott, 16:00 ti deve 120 euro",
    );
  });

  it("credit with time, today's lesson, archived caption", () => {
    render(
      <MemoryRouter>
        <StudentListItem
          showArchived
          today={TODAY}
          student={student({
            display_name: "Luca Bianchi",
            archived: true,
            next_lesson: { date: TODAY, start_time: "15:00" },
            balance: {
              ...student().balance,
              balance_cents: 4000,
              status: "credit",
              credit_minutes: 120,
            },
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Luca Bianchi" })).toHaveAccessibleDescription(
      "2ª liceo classico · oggi 15:00 · archiviato in credito di 40 euro, circa 2 h",
    );
  });
});
