import { expect, expectAccessible, test } from "./fixtures";

// Agenda (03 §6): the current week, Monday to Sunday. Desktop: a column per day; a phone: a list
// per day with a strip of days. Tapping a lesson opens the student's page on that row.

test.beforeEach(({ demo }) => {
  expect(demo.api).toBeDefined();
});

const WEEKDAY = /^(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica) \d{1,2} \p{L}+/u;

test("Agenda: la settimana e una lezione aperta dalla sua riga", async ({
  page,
  mobile,
  screens,
}) => {
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
  const main = page.getByRole("main");
  const days = main.getByRole("region", { name: WEEKDAY });
  await expect(days).toHaveCount(7);
  await expect(days.first()).toHaveAccessibleName(/^lunedì /);
  await expect(days.last()).toHaveAccessibleName(/^domenica /);
  await expect(main.getByRole("region", { name: /, oggi$/ })).toHaveCount(1);
  // The week's summary (scheduled lessons included): the seed has lessons Monday to Friday.
  await expect(main.getByText(/^[1-9]\d* lezion[ei] · .+ · .+\s€$/)).toBeVisible();
  await expectAccessible(page);
  await screens.page("agenda");

  // Another week and back with «Oggi».
  const range = main.getByText(/^Settimana \d/);
  const thisWeek = await range.textContent();
  await page.getByRole("button", { name: "Settimana successiva" }).click();
  await expect(range).not.toHaveText(thisWeek ?? "");
  await expect(page).toHaveURL(/\/agenda\?.+/); // the week is in the URL
  await page.getByRole("button", { name: "Vai alla settimana di oggi" }).click();
  await expect(range).toHaveText(thisWeek ?? "");

  let day = days.filter({ has: page.getByRole("link") }).last();
  if (mobile) {
    // The strip of days jumps to a day of the list (and moves the focus there).
    const strip = page.getByRole("navigation", { name: "Giorni della settimana" });
    await expect(strip.getByRole("button")).toHaveCount(7);
    await strip
      .getByRole("button", { name: /, [1-9]\d* lezion[ei]$/ })
      .last()
      .click();
    day = main.locator("section:focus");
    await expect(day).toBeInViewport();
  }
  const lesson = day.getByRole("link").first();
  await lesson.click();
  await expect(page).toHaveURL(/\/studenti\/[0-9a-f-]{36}\?riga=[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Registro" })).toBeVisible();
});

test("Agenda desktop: un giorno libero apre il modulo Lezione su quel giorno", async ({
  page,
  mobile,
  screens,
}) => {
  test.skip(mobile, "the day columns with their «+» exist on desktop only (03 §6)");
  await page.goto("/agenda");
  const saturday = page.getByRole("region", { name: /^sabato / });
  await saturday.getByRole("button", { name: /^Nuova lezione sabato / }).click();
  const form = page.getByRole("dialog", { name: "Nuova lezione" });
  await expect(form).toBeVisible();
  await expect(form.getByRole("group", { name: "Giorno", exact: true })).toContainText(
    /^Giorno\s*sab /,
  );
  await screens.dialog("agenda-nuova-lezione", form);
  await form.getByRole("button", { name: "Annulla" }).click();
  await expect(form).toBeHidden();
});
