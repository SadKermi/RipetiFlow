import { test as base, expect } from "@playwright/test";

// Smoke test of the plumbing: public config → demo sign-in → API calls with the bearer token →
// seed → data on screen. The full journeys (student, lesson, payment, balance) come with the
// designed screens.

// Any console error or uncaught exception in the page fails the test.
const test = base.extend<{ pageProblems: string[] }>({
  pageProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(message.text());
      });
      page.on("pageerror", (error) => problems.push(error.message));
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

test("i visitatori non autenticati vengono mandati ad /accedi", async ({ page }) => {
  await page.goto("/studenti");
  await expect(page).toHaveURL(/\/accedi$/);
  await expect(page.getByRole("heading", { name: "Accedi a RipetiFlow" })).toBeVisible();
});

test("demo: accesso, dati di esempio, elenco studenti e libro mastro", async ({ page }) => {
  await page.goto("/accedi");
  await page.getByRole("button", { name: "Entra in modalità demo" }).click();
  await expect(page).toHaveURL(/\/oggi$/);
  await expect(page.getByRole("heading", { name: "Oggi" })).toBeVisible();

  await page.getByRole("link", { name: "Impostazioni" }).click();
  await page.getByRole("button", { name: "Ricarica i dati demo" }).click();
  await expect(page.getByText(/Dati demo ricreati: [1-9]\d* studenti/)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Sezioni" })
    .getByRole("link", { name: "Studenti" })
    .click();
  await expect(page).toHaveURL(/\/studenti$/);
  await expect(page.getByText(/^[1-9]\d* student[ei]$/)).toBeVisible();

  const students = page.getByRole("main").getByRole("listitem").getByRole("link");
  expect(await students.count()).toBeGreaterThan(0);
  await students.first().click();
  await expect(page).toHaveURL(/\/studenti\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^[1-9]\d* movimenti$/)).toBeVisible();

  // The demo session lives in sessionStorage: a reload keeps it.
  await page.reload();
  await expect(page.getByText(/^[1-9]\d* movimenti$/)).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).first().click();
  await expect(page).toHaveURL(/\/accedi$/);
});
