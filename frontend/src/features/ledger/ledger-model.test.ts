import { describe, expect, it } from "vitest";
import type { Activity, Rate } from "@/lib/api/types";
import {
  TODAY,
  giulia,
  giuliaLedger,
  lessonEntry,
  paymentEntry,
} from "@/features/forms/test-utils";
import { fieldLabel, groupByDay, sourceLabel, timeOf } from "./activity-model";
import { buildLedgerView, lastPaymentSentence, monthsToShow, showMonthLabel } from "./ledger-model";

const nbsp = (text: string) => text.replace(/ €/g, " €");

function describeRows(view: ReturnType<typeof buildLedgerView>): string[] {
  return view.rows.map((row) =>
    row.type === "entry"
      ? `${row.entry.kind} ${row.entry.date}`
      : row.type === "rate"
        ? `rate ${row.rate.effective_from}`
        : `carry ${row.date} ${String(row.balanceCents)}`,
  );
}

describe("buildLedgerView", () => {
  it("puts the rate change under the rows of its first day (03 «Dati d'esempio»)", () => {
    const view = buildLedgerView(giuliaLedger(), giulia().rates, { today: TODAY, months: 2 });
    expect(describeRows(view)).toEqual([
      "lesson 2026-10-08",
      "lesson 2026-10-05",
      "payment 2026-10-02",
      "lesson 2026-10-01",
      "rate 2026-10-01",
      "lesson 2026-09-28",
    ]);
    expect(view.nextHiddenMonth).toBeNull();
    expect(view.shownEntries).toBe(5);
  });

  it("scheduled lessons come first even when the API interleaves them", () => {
    const items = [
      lessonEntry({ id: "done", date: TODAY, start_time: "10:00", settled: true }),
      lessonEntry({ id: "later", date: TODAY, start_time: "18:00", settled: false }),
    ];
    const view = buildLedgerView(items, [], { today: TODAY, months: 2 });
    expect(view.rows.map((row) => (row.type === "entry" ? row.entry.id : row.type))).toEqual([
      "later",
      "done",
    ]);
  });

  it("shows the current and previous month, then a carry-over row with the older balance", () => {
    const items = [
      ...giuliaLedger(),
      paymentEntry({
        id: "p-ago",
        date: "2026-08-20",
        credit_cents: 2000,
        running_balance_cents: 0,
      }),
      lessonEntry({ id: "l-ago", date: "2026-08-10", running_balance_cents: -2000 }),
    ];
    const view = buildLedgerView(items, [], { today: TODAY, months: 2 });
    expect(describeRows(view).at(-1)).toBe("carry 2026-08-31 0");
    expect(view.nextHiddenMonth).toBe("2026-08-01");
    expect(showMonthLabel("2026-08-01", TODAY)).toBe("Mostra agosto");
    expect(showMonthLabel("2025-12-01", TODAY)).toBe("Mostra dicembre 2025");

    const wider = buildLedgerView(items, [], { today: TODAY, months: 3 });
    expect(describeRows(wider).slice(-2)).toEqual(["payment 2026-08-20", "lesson 2026-08-10"]);
    expect(wider.nextHiddenMonth).toBeNull();
  });

  it("widens to the newest month with rows when the window would be empty", () => {
    const items = [
      lessonEntry({ date: "2026-03-10" }),
      lessonEntry({ id: "x", date: "2026-02-10" }),
    ];
    const view = buildLedgerView(items, [], { today: TODAY, months: 2 });
    expect(describeRows(view)).toEqual(["lesson 2026-03-10", "carry 2026-02-28 -6700"]);
  });

  it("an empty ledger has no rows and nothing hidden", () => {
    const view = buildLedgerView([], giulia().rates, { today: TODAY, months: 2 });
    expect(view.shownEntries).toBe(0);
    expect(view.nextHiddenMonth).toBeNull();
    // The first rate is not a change; the 1 Oct change is in the window.
    expect(describeRows(view)).toEqual(["rate 2026-10-01"]);
  });

  it("a future rate appears above the lessons it will govern", () => {
    const rates: Rate[] = [
      ...giulia().rates,
      { id: "r3", hourly_rate_cents: 2400, effective_from: "2026-11-01", created_at: "" },
    ];
    const view = buildLedgerView(giuliaLedger(), rates, { today: TODAY, months: 2 });
    expect(describeRows(view)[0]).toBe("rate 2026-11-01");
  });

  it("months to show for a highlighted row", () => {
    expect(monthsToShow("2026-10-05", TODAY)).toBe(1);
    expect(monthsToShow("2026-07-30", TODAY)).toBe(4);
    expect(monthsToShow("2025-12-01", TODAY)).toBe(11);
  });
});

describe("lastPaymentSentence (03 §5)", () => {
  it("the last payment, then the lessons in the balance since and what was left", () => {
    expect(lastPaymentSentence(giuliaLedger())).toBe(
      nbsp(
        "Ultimo pagamento 50,00 € il 2 ott, con bonifico. Da allora 1 lezione, 2 h (più 23,00 € rimasti dopo il bonifico).",
      ),
    );
  });

  it("other ways of paying and no lessons since", () => {
    expect(
      lastPaymentSentence([
        paymentEntry({ method: "other", note: "Satispay", running_balance_cents: 0 }),
      ]),
    ).toBe(nbsp("Ultimo pagamento 50,00 € il 2 ott, con Satispay."));
    expect(lastPaymentSentence([lessonEntry()])).toBe("Nessun pagamento registrato.");
    expect(lastPaymentSentence([])).toBeNull();
  });
});

describe("activity", () => {
  const item = (id: string, at: string, extra: Partial<Activity> = {}): Activity => ({
    id,
    entity: "lesson",
    entity_id: "l1",
    action: "update",
    source: "app",
    occurred_at: at,
    summary: "Lezione del 05/10 modificata: fine 18:30 → 19:00",
    changes: [],
    ...extra,
  });

  it("groups by day in the tutor's timezone: oggi, ieri, then the date", () => {
    const days = groupByDay(
      [
        item("a", "2026-10-06T12:31:00Z"),
        item("b", "2026-10-05T22:30:00Z"), // 00:30 of 6 Oct in Rome
        item("c", "2026-10-05T17:12:00Z"),
        item("d", "2026-10-02T16:40:00Z"),
        item("e", "2025-12-30T10:00:00Z"),
      ],
      "Europe/Rome",
      TODAY,
    );
    expect(days.map((day) => [day.label, day.items.map((i) => i.id).join("")])).toEqual([
      ["oggi", "ab"],
      ["ieri", "c"],
      ["ven 2 ott", "d"],
      ["mar 30 dic 2025", "e"],
    ]);
    expect(timeOf("2026-10-06T12:31:00Z", "Europe/Rome")).toBe("14:31");
  });

  it("labels the source and the fields like the server's summaries", () => {
    expect(sourceLabel("assistant")).toBe("da Matita");
    expect(sourceLabel("import")).toBe("importata");
    expect(sourceLabel("system")).toBe("automatica");
    expect(sourceLabel("app")).toBeNull();
    expect(fieldLabel("lesson", "lesson_date")).toBe("data");
    expect(fieldLabel("payment", "method")).toBe("metodo");
    expect(fieldLabel("student", "unknown_field")).toBe("unknown field");
  });
});
