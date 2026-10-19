import { readFileSync } from "node:fs";
import { expect, expectAccessible, test } from "./fixtures";
import { chooseOption } from "./ui";

// Impostazioni (03 §8): profile, subjects, Calendar (not available on this server), theme, CSV
// export and the demo section.

test.beforeEach(({ demo }) => {
  expect(demo.api).toBeDefined();
});

test("Impostazioni: profilo, materie, aspetto ed esportazione", async ({
  page,
  mobile,
  problems,
  screens,
}) => {
  await page.goto("/impostazioni");
  await expect(page.getByRole("heading", { level: 1, name: "Impostazioni" })).toBeVisible();
  for (const name of [
    "Profilo",
    "Materie",
    "Google Calendar",
    "Aspetto",
    "Esporta",
    "Modalità demo",
  ]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Google Calendar" })).toContainText(
    "La sincronizzazione con Google Calendar non è attiva su questo server.",
  );
  await expectAccessible(page);
  await screens.page("impostazioni");

  // Profile: «Salva profilo» appears only with a change; then «Salvato».
  const profile = page.getByRole("region", { name: "Profilo" });
  await expect(profile.getByRole("button", { name: "Salva profilo" })).toHaveCount(0);
  await profile.getByRole("textbox", { name: "Nome e cognome" }).fill("Daniele Marchi");
  await chooseOption(page, profile, "Durata predefinita", "1 h 30 min");
  await profile.getByRole("button", { name: "Salva profilo" }).click();
  await expect(profile.getByText("Salvato")).toBeVisible();
  await page.reload();
  await expect(profile.getByRole("textbox", { name: "Nome e cognome" })).toHaveValue(
    "Daniele Marchi",
  );
  if (!mobile) {
    await expect(page.getByRole("button", { name: "Account: Daniele Marchi, DM" })).toBeVisible();
  }

  // Subjects: add, a duplicate refused on the field (409), rename, delete with confirmation.
  const subjects = page.getByRole("region", { name: "Materie" });
  const list = subjects.getByRole("list", { name: "Materie, nell'ordine del menu" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  const newSubject = subjects.getByRole("textbox", { name: "Nuova materia" });
  await newSubject.fill("Musica");
  await subjects.getByRole("button", { name: "Aggiungi" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(11);
  await expect(list.getByRole("listitem").last()).toContainText("Musica");

  problems.allow(/status of 409/);
  await newSubject.fill("matematica");
  await subjects.getByRole("button", { name: "Aggiungi" }).click();
  await expect(newSubject).toHaveAttribute("aria-invalid", "true");
  await expect(subjects.getByText("Esiste già una materia con questo nome.")).toBeVisible();
  await newSubject.fill("");

  await subjects.getByRole("button", { name: "Azioni per «Musica»" }).click();
  await page.getByRole("menuitem", { name: "Rinomina" }).click();
  const rename = subjects.getByRole("textbox", { name: "Nuovo nome di «Musica»" });
  await expect(rename).toBeFocused();
  await rename.fill("Musica e solfeggio");
  await rename.press("Enter");
  await expect(list.getByRole("listitem").last()).toContainText("Musica e solfeggio");

  await subjects.getByRole("button", { name: "Azioni per «Musica e solfeggio»" }).click();
  await page.getByRole("menuitem", { name: "Elimina" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Eliminare «Musica e solfeggio»?" });
  await expect(confirm).toContainText("Le lezioni con questa materia restano, senza materia.");
  await screens.dialog("materia-elimina", confirm);
  await confirm.getByRole("button", { name: "Elimina materia" }).click();
  await expect(confirm).toBeHidden();
  await expect(list.getByRole("listitem")).toHaveCount(10);

  // CSV of the whole ledger: the server names the file; «;» separator, BOM for Excel.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Scarica tutto il registro (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const csv = readFileSync(await file.path(), "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.slice(1).split(/\r?\n/)[0]).toBe(
    "Studente;Data;Tipo;Descrizione;Inizio;Fine;Durata (min);Tariffa oraria (€);Dare (€);Avere (€);Saldo (€);Stato",
  );
  expect(csv).toContain("Giulia Ferri;");

  // Theme: dark, saved in this browser, checked by axe too (contrast of the dark tokens).
  const theme = page.getByRole("radiogroup", { name: "Tema" });
  await theme.getByText("Scuro").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);
  await screens.page("impostazioni-scuro");
  await page.goto("/oggi");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);
  await screens.page("oggi-scuro");
  await page.goto("/impostazioni");
  await page.getByRole("radiogroup", { name: "Tema" }).getByText("Sistema").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
});
