import { type Locator, type Page } from "@playwright/test";
import { expect, expectAccessible, test } from "./fixtures";
import { balanceBlock } from "./ui";

// Keyboard and missing pages (02 §10, 03 §10.3): a whole form done with the keyboard alone, the
// visible focus, Esc and the focus coming back; «Pagina non trovata» and «Studente non trovato».

/** Presses Tab until `target` has the focus: it must be reachable with the keyboard. */
async function tabTo(page: Page, target: Locator, max = 25) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/** The focus is drawn: ink outline and/or the yellow halo (02 §10, tokens.css :focus-visible). */
async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  const style = await target.evaluate((el) => {
    const css = getComputedStyle(el);
    return { outline: css.outlineStyle, width: css.outlineWidth, shadow: css.boxShadow };
  });
  expect(
    (style.outline !== "none" && style.width !== "0px") || style.shadow !== "none",
    JSON.stringify(style),
  ).toBe(true);
}

test("con la sola tastiera: nuovo studente, poi un pagamento lasciato con Esc", async ({
  page,
  mobile,
  demo,
}) => {
  expect(demo.api).toBeDefined();
  await page.goto("/studenti");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The first Tab lands on «Salta al contenuto», which moves into the main content.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Salta al contenuto" });
  await expectVisibleFocus(skip);
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");

  const create = page.getByRole("button", {
    name: mobile ? "Nuovo" : "Nuovo studente",
    exact: true,
  });
  await tabTo(page, create);
  await expectVisibleFocus(create);
  await page.keyboard.press("Enter");
  const form = page.getByRole("dialog", { name: "Nuovo studente" });
  await expect(form).toBeVisible();

  const firstName = form.getByRole("textbox", { name: "Nome", exact: true }).first();
  await tabTo(page, firstName);
  await expectVisibleFocus(firstName);
  await page.keyboard.type("Bruno");
  await page.keyboard.press("Tab");
  await expect(form.getByRole("textbox", { name: "Cognome" })).toBeFocused();
  await page.keyboard.type("Neri");
  const rate = form.getByRole("textbox", { name: /^Tariffa oraria/ });
  await tabTo(page, rate);
  await expectVisibleFocus(rate);
  await page.keyboard.type("18");
  // Invio saves (03 §7).
  await page.keyboard.press("Enter");
  await expect(form).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Bruno Neri" })).toBeVisible();
  await expect(balanceBlock(page)).toContainText("in pari");

  // Pagamento: opened with the keyboard, left with Esc; the focus goes back to the button.
  const payment = page.getByRole("button", { name: "Pagamento", exact: true });
  await tabTo(page, payment, 40);
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Pagamento ricevuto" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: /^Importo/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(payment).toBeFocused();
});

test("pagina non trovata, da fuori e da dentro il registro", async ({ page, demo, screens }) => {
  // Signed out first: the demo session is set for every page load of this test, so use a new
  // context without it.
  const browser = page.context().browser();
  if (browser) {
    const outside = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: page.viewportSize(),
      locale: "it-IT",
    });
    const visitor = await outside.newPage();
    await visitor.goto("/questa-pagina-non-esiste");
    await expect(
      visitor.getByRole("heading", { level: 1, name: "Pagina non trovata" }),
    ).toBeVisible();
    await expect(
      visitor.getByText("Questo indirizzo non corrisponde a nessuna pagina del registro."),
    ).toBeVisible();
    await visitor.getByRole("link", { name: "Torna alla home" }).click();
    await expect(visitor).toHaveURL(/\/$/);
    await outside.close();
  }

  expect(demo.api).toBeDefined();
  await page.goto("/questa-pagina-non-esiste");
  await expect(page.getByRole("heading", { level: 1, name: "Pagina non trovata" })).toBeVisible();
  await expectAccessible(page);
  await screens.page("pagina-non-trovata");
  await page.getByRole("link", { name: "Vai a Oggi" }).click();
  await expect(page).toHaveURL(/\/oggi$/);
});

test("studente non trovato", async ({ page, demo, problems, screens }) => {
  expect(demo.api).toBeDefined();
  problems.allow(/status of 404/);
  await page.goto("/studenti/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { level: 1, name: "Studente non trovato" })).toBeVisible();
  await expect(
    page.getByText("Forse è stato eliminato, o il link è di un altro account."),
  ).toBeVisible();
  await expectAccessible(page);
  await screens.page("studente-non-trovato");
  await page.getByRole("link", { name: "Torna agli studenti" }).click();
  await expect(page).toHaveURL(/\/studenti$/);
});
