import { expect, expectAccessible, test } from "./fixtures";

// The way in: landing → «Entra nel registro» → /accedi → demo → Oggi (03 §1–3), the session kept
// across a reload, and «Esci». The data comes from POST /dev/seed through the demo section of
// Impostazioni, as a tutor trying the demo would do.

test("i visitatori non autenticati vengono mandati ad /accedi", async ({ page }) => {
  await page.goto("/studenti");
  await expect(page).toHaveURL(/\/accedi$/);
  await expect(page.getByRole("heading", { name: "Entra nel tuo registro" })).toBeVisible();
});

test("landing → accesso demo → Oggi, dati di esempio, uscita", async ({
  page,
  mobile,
  screens,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Segna la lezione appena finita. Il conto lo tiene il registro.",
    }),
  ).toBeVisible();
  // Matita is off on this server: its section is not on the landing (03 §1, «solo se
  // assistant_available»); «Cosa non fa» always is.
  await expect(page.getByRole("heading", { name: "Cosa non fa" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Matita scrive a matita/ })).toHaveCount(0);
  await expectAccessible(page);
  await screens.page("landing");

  await page.getByRole("main").getByRole("link", { name: "Entra nel registro" }).first().click();
  await expect(page).toHaveURL(/\/accedi$/);
  await expect(page.getByRole("heading", { name: "Entra nel tuo registro" })).toBeVisible();
  // Only the demo is configured on the E2E server: no Google button, no email field.
  await expect(page.getByRole("button", { name: "Continua con Google" })).toHaveCount(0);
  await expect(
    page.getByText("Solo in sviluppo: dati di esempio, nessun account vero."),
  ).toBeVisible();
  await expectAccessible(page);
  await screens.page("accedi");

  await page.getByRole("button", { name: "Entra in modalità demo" }).click();
  await expect(page).toHaveURL(/\/oggi$/);
  await expect(page.getByRole("heading", { level: 1, name: "Oggi" })).toBeVisible();

  // Fresh demo data from Impostazioni («Altro» on mobile), with its confirmation (03 §8).
  const sections = page.getByRole("navigation", { name: "Sezioni" });
  if (mobile) {
    await sections.getByRole("link", { name: "Altro" }).click();
  } else {
    await page.getByRole("button", { name: "Account: Tutor Demo, TD" }).click();
    await page.getByRole("menuitem", { name: "Impostazioni" }).click();
  }
  await expect(page).toHaveURL(/\/impostazioni$/);
  await page.getByRole("button", { name: "Ricrea i dati di esempio" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(
    "Cancella e ricrea studenti, lezioni e pagamenti di esempio.",
  );
  await confirm.getByRole("button", { name: "Ricrea i dati" }).click();
  await expect(page.getByText(/Dati demo ricreati: [1-9]\d* studenti/)).toBeVisible();

  await sections.getByRole("link", { name: "Oggi" }).click();
  await expect(page).toHaveURL(/\/oggi$/);
  const upcoming = page.getByRole("region", { name: "Prossime lezioni" });
  const open = page.getByRole("region", { name: "Conti aperti" });
  await expect(upcoming.getByRole("listitem").first()).toBeVisible();
  await expect(open.getByRole("listitem").first()).toBeVisible();
  await expect(open.getByText("Da incassare")).toBeVisible();
  await expect(page.getByRole("region", { name: /^\p{L}+ \d{4}$/u })).toContainText(
    /lezioni? svolt[ae]/,
  );
  // ASSISTANT_PROVIDER=none: Matita says it is off, the form is the way (03 §9.4).
  if (!mobile) {
    await expect(
      page.getByText(
        "Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.",
      ),
    ).toBeVisible();
  }
  await expectAccessible(page);
  await screens.page("oggi");

  // The demo session lives in sessionStorage: a reload keeps it.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Oggi" })).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).first().click();
  await expect(page).toHaveURL(/\/(accedi)?$/);
  await page.goto("/oggi");
  await expect(page).toHaveURL(/\/accedi$/);
});
