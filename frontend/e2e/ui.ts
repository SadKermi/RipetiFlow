// Small UI helpers shared by the journeys: they act like the tutor would (labels, roles, the
// picker of the device), never through test ids.
import { type Locator, type Page, expect } from "@playwright/test";

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * Chooses a day in a «Giorno» / «Valida dal» field (02 §9.3). On desktop through the calendar
 * popover (month by month, then the day); on a phone the field hands over to the native date
 * picker, which Playwright drives by filling its input, as the picker itself does.
 */
export async function pickDay(
  page: Page,
  scope: Locator,
  label: string,
  iso: string,
  mobile: boolean,
) {
  const group = scope.getByRole("group", { name: label, exact: true });
  if (mobile) {
    await group.locator('input[type="date"]').fill(iso);
  } else {
    await group.getByRole("button", { name: new RegExp(`^${label}`) }).click();
    const picker = page.getByRole("dialog", { name: `${label}: scegli dal calendario` });
    await expect(picker).toBeVisible();
    const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
    const target = `${MONTHS[month - 1] ?? ""} ${String(year)}`;
    const heading = picker.getByRole("heading");
    for (let i = 0; i < 30; i++) {
      // «Calendario, ottobre 2026»: the calendar's name, then the month shown.
      const shown = ((await heading.textContent()) ?? "")
        .replace(/^Calendario,\s*/, "")
        .trim()
        .toLowerCase();
      if (shown === target) break;
      const [shownMonth, shownYear] = shown.split(" ");
      const shownIndex = Number(shownYear) * 12 + MONTHS.indexOf(shownMonth ?? "");
      const targetIndex = year * 12 + month - 1;
      await picker
        .getByRole("button", {
          name: targetIndex < shownIndex ? "Mese precedente" : "Mese successivo",
        })
        .click();
    }
    await expect(heading).toHaveText(new RegExp(target, "i"));
    await picker
      .getByRole("button", { name: new RegExp(`\\b${String(day)} ${target}`, "i") })
      .click();
    await expect(picker).toBeHidden();
  }
  await expect(group).toContainText(formatDayFieldValue(iso));
}

/** «mar 6 ott 2026», the text of a day field. */
export function formatDayFieldValue(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

/** The button of a select field, named «<value> <label>[ (facoltativo)]». */
export function selectButton(scope: Locator, label: string): Locator {
  return scope.getByRole("button", { name: new RegExp(`(^|\\s)${label}( \\(facoltativo\\))?$`) });
}

/** Chooses an option of a select field (react-aria Select: button → listbox). */
export async function chooseOption(page: Page, scope: Locator, label: string, option: string) {
  await selectButton(scope, label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(selectButton(scope, label)).toContainText(option);
}

/** The «Saldo al …» block of the student page: its screen-reader sentence says the balance. */
export function balanceBlock(page: Page): Locator {
  return page.getByText(/^Saldo al /).locator("xpath=..");
}

/** The ledger: a table on desktop, a list on a phone, both named «Registro di …». */
export function ledger(page: Page, name: string, mobile: boolean): Locator {
  return page
    .getByRole("region", { name: "Registro" })
    .getByRole(mobile ? "list" : "table", { name: `Registro di ${name}` });
}

/** The toast region at the bottom of the screen (role="status", polite). */
export function toasts(page: Page): Locator {
  return page.locator('[role="status"][aria-relevant="additions text"]');
}

/** The action button («Annulla») of the toast that says `message`. */
export function toastAction(page: Page, message: string, action = "Annulla"): Locator {
  return toasts(page)
    .getByText(message, { exact: true })
    .locator("xpath=..")
    .getByRole("button", { name: action });
}

/**
 * On a phone, tariff, contacts and «Modifica dati» sit in the closable «Tariffa · Contatti · Note»
 * section at the bottom of the student page (03 §5): opens it when needed.
 */
export async function openStudentDetails(page: Page, mobile: boolean) {
  if (!mobile) return;
  const toggle = page.getByRole("button", { name: /Tariffa · Contatti · Note/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}
