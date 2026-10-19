import { readFileSync } from "node:fs";
import { expect, expectAccessible, firstOfPreviousMonth, isoDay, shortDay, test } from "./fixtures";
import {
  balanceBlock,
  chooseOption,
  ledger,
  openStudentDetails,
  pickDay,
  toastAction,
  toasts,
} from "./ui";

// The heart of the app (03 §4–5, §7): students, the ledger, lessons, payments, rates. Each test
// starts from fresh demo data; the student it works on is created for the test (through the UI
// when that is the journey, through the API otherwise), so the amounts never depend on today.

const NEW_STUDENT = { first_name: "Irene", last_name: "Valli" };

// Every test here starts signed in as the demo tutor, with fresh demo data.
test.beforeEach(({ demo }) => {
  expect(demo.api).toBeDefined();
});

test("Studenti: ricerca, filtri e scheda con il registro", async ({ page, mobile, screens }) => {
  await page.goto("/studenti");
  if (mobile) {
    await expect(page.getByRole("heading", { level: 1, name: "Studenti" })).toBeVisible();
    await expect(page.getByText("6 attivi")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { level: 1, name: "Studenti · 6 attivi" }),
    ).toBeVisible();
  }
  const main = page.getByRole("main");
  const rows = mobile
    ? main.getByRole("list", { name: "Studenti" }).getByRole("listitem")
    : main
        .getByRole("table", { name: "Studenti attivi" })
        .getByRole("row")
        .filter({
          has: page.getByRole("cell"),
        });
  await expect(rows).toHaveCount(6);
  // Default order = balance: who owes most first, then even, then credit (03 §4).
  await expect(rows.first()).toContainText("Luca Bianchi");
  await expect(rows.first()).toContainText("ti deve 44 euro");
  await expect(rows.last()).toContainText(/in credito di \d+ euro/);
  await expectAccessible(page);
  await screens.page("studenti");

  // Search: the API's q, 250 ms after the last letter.
  const search = page.getByRole("searchbox", { name: "Cerca per nome" });
  await search.fill("giul");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Giulia Ferri");
  await search.fill("Giovanni");
  await expect(page.getByText("Nessuno studente con “Giovanni” nel nome.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aggiungi Giovanni come studente" })).toBeVisible();
  await page.getByRole("button", { name: "Cancella la ricerca" }).click();
  await expect(rows).toHaveCount(6);

  // Filter on the balance, client side.
  const filter = page.getByRole("radiogroup", { name: "Filtra per saldo" });
  await filter.getByText("Ti devono").click();
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) await expect(row).toContainText("ti deve");
  await filter.getByText("In credito").click();
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) await expect(row).toContainText("in credito");
  await filter.getByText("Tutti").click();
  await expect(rows).toHaveCount(6);

  await main.getByRole("link", { name: /Giulia Ferri/ }).click();
  await expect(page).toHaveURL(/\/studenti\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Giulia Ferri" })).toBeVisible();
  await expect(balanceBlock(page)).toContainText("in credito di 66 euro");
  const registro = ledger(page, "Giulia Ferri", mobile);
  await expect(registro).toBeVisible();
  await expect(registro).toContainText("Programmata · non ancora nel saldo");
  await expect(registro).toContainText(/Pagamento · (contanti|bonifico|altro)/);
  await expect(registro).toContainText(/Riporto al/);
  await expectAccessible(page);
  await screens.page("studente");

  // «Esporta CSV»: this student's ledger, as the server writes it (03 §5).
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const csv = readFileSync(await file.path(), "utf8");
  expect(csv.replace(/^\uFEFF/, "").split(/\r?\n/)[0]).toBe(
    "Data;Tipo;Descrizione;Inizio;Fine;Durata (min);Tariffa oraria (€);Dare (€);Avere (€);Saldo (€);Stato",
  );
  expect(csv).toContain(";Programmata");
});

test("nuovo studente con la sua tariffa", async ({ page, mobile, screens }) => {
  await page.goto("/studenti");
  await page
    .getByRole("button", { name: mobile ? "Nuovo" : "Nuovo studente", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "Nuovo studente" });
  await expect(form).toBeVisible();
  await screens.dialog("studente-nuovo", form);

  // Name and rate are required: the errors land on the fields (03 §7.4, §10.4).
  await form.getByRole("button", { name: "Salva studente" }).click();
  const firstName = form.getByRole("textbox", { name: "Nome", exact: true }).first();
  await expect(firstName).toHaveAttribute("aria-invalid", "true");
  await expect(firstName).toBeFocused();
  await expect(form.getByRole("textbox", { name: /^Tariffa oraria/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await screens.dialog("studente-nuovo-errori", form);

  await firstName.fill(NEW_STUDENT.first_name);
  await form.getByRole("textbox", { name: "Cognome" }).fill(NEW_STUDENT.last_name);
  await form.getByRole("textbox", { name: "Classe" }).fill("2ª liceo scientifico");
  await chooseOption(page, form, "Materia abituale", "Matematica");
  await form.getByRole("textbox", { name: /^Tariffa oraria/ }).fill("21,50");
  const from = firstOfPreviousMonth();
  await pickDay(page, form, "Valida dal", from, mobile);
  const guardian = form.getByRole("group", { name: "Genitore o referente" });
  await guardian.getByRole("textbox", { name: "Nome" }).fill("Paola Valli");
  await guardian.getByRole("textbox", { name: "Telefono" }).fill("347 123 4567");
  await form.getByRole("button", { name: "Salva studente" }).click();

  await expect(form).toBeHidden();
  await expect(toasts(page)).toContainText("Scheda di Irene Valli creata");
  await expect(page).toHaveURL(/\/studenti\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Irene Valli" })).toBeVisible();
  await expect(balanceBlock(page)).toContainText("in pari");
  await expect(
    page.getByText("Pagina bianca. Scrivi la prima riga qui sopra o usa il modulo."),
  ).toBeVisible();
  await openStudentDetails(page, mobile);
  const rates = page.getByRole("region", { name: "Tariffa oraria" });
  await expect(rates).toContainText("21,50 €/h");
  await expectAccessible(page);
  await screens.page("studente-nuovo-vuoto");

  await page.goto("/studenti");
  await expect(page.getByRole("main").getByRole("link", { name: /Irene Valli/ })).toBeVisible();
  await expect(page.getByText(/^(Studenti · )?7 attivi$/)).toBeVisible();
});

test("lezioni: una passata entra nel saldo, si modifica, si duplica, si elimina", async ({
  page,
  mobile,
  demo,
  screens,
}) => {
  const student = await demo.api.createStudent({
    ...NEW_STUDENT,
    hourly_rate_cents: 2000,
    rate_effective_from: firstOfPreviousMonth(),
  });
  await page.goto(`/studenti/${student.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Irene Valli" })).toBeVisible();
  await expect(balanceBlock(page)).toContainText("in pari");

  // A lesson that already happened (yesterday) enters the balance right away (03 §7.1).
  await page.getByRole("button", { name: "Nuova lezione con il modulo" }).first().click();
  const form = page.getByRole("dialog", { name: "Nuova lezione" });
  await expect(form).toBeVisible();
  await expect(form.getByRole("button", { name: /\bStudente\b/ })).toContainText("Irene Valli");
  const yesterday = isoDay(-1);
  await form
    .getByRole("group", { name: "Giorno: scorciatoie" })
    .getByRole("button", { name: "Ieri" })
    .click();
  await expect(form.getByRole("group", { name: "Giorno", exact: true })).toContainText("ieri");
  await form.getByRole("textbox", { name: "Inizio" }).fill("10:00");
  await form.getByRole("button", { name: "Durata 1 h 30 min" }).click();
  await expect(form.getByRole("textbox", { name: "Fine" })).toHaveValue("11:30");
  await expect(form).toContainText("1 h 30 min · 30,00 € a 20,00 €/h");
  await chooseOption(page, form, "Materia", "Matematica");
  await form.getByRole("textbox", { name: /^Argomento/ }).fill("equazioni di secondo grado");
  await screens.dialog("lezione-nuova", form);
  await form.getByRole("button", { name: "Salva lezione" }).click();
  await expect(form).toBeHidden();
  await expect(toasts(page)).toContainText("Lezione registrata · nel saldo");
  await expect(balanceBlock(page)).toContainText("ti deve 30 euro");
  const registro = ledger(page, "Irene Valli", mobile);
  const lessonRow = registro.getByRole("button", {
    name: "Matematica · equazioni di secondo grado",
  });
  await expect(lessonRow).toHaveCount(1);

  // Edit: the end moves to 12:00 → 2 h, 40,00 €.
  await lessonRow.click();
  const edit = page.getByRole("dialog", { name: "Modifica lezione" });
  await expect(edit.getByRole("textbox", { name: "Fine" })).toHaveValue("11:30");
  await edit.getByRole("textbox", { name: "Fine" }).fill("12:00");
  await expect(edit).toContainText("2 h · 40,00 € a 20,00 €/h");
  await screens.dialog("lezione-modifica", edit);
  await edit.getByRole("button", { name: "Salva lezione" }).click();
  await expect(edit).toBeHidden();
  await expect(toasts(page)).toContainText("Lezione modificata");
  await expect(balanceBlock(page)).toContainText("ti deve 40 euro");

  // Duplicate the week after: a scheduled lesson, only in «Previsto» (03 §5).
  await lessonRow.click();
  await expect(edit.getByRole("textbox", { name: "Fine" })).toHaveValue("12:00");
  await edit.getByRole("button", { name: "Duplica" }).click();
  await page.getByRole("menuitem", { name: "Duplica la settimana dopo" }).click();
  await expect(edit).toBeHidden();
  const nextWeek = isoDay(6);
  await expect(toasts(page)).toContainText(
    `Lezione programmata per ${shortDay(nextWeek)} alle 10:00`,
  );
  await expect(registro.getByText("Programmata · non ancora nel saldo")).toHaveCount(1);
  await expect(lessonRow).toHaveCount(2);
  await expect(balanceBlock(page)).toContainText("ti deve 40 euro");
  await expect(balanceBlock(page)).toContainText(
    "Previsto con le lezioni programmate: deve 80,00 €",
  );
  await screens.page("studente-registro");

  // Delete the lesson in the balance, with the effect spelled out (03 §7.5): from the row menu on
  // desktop, from the edit sheet on a phone (no row menu there).
  if (mobile) {
    await lessonRow.last().click();
    await expect(edit.getByRole("textbox", { name: "Fine" })).toHaveValue("12:00");
    await edit.getByRole("button", { name: "Elimina" }).click();
  } else {
    await registro
      .getByRole("button", { name: `Azioni per la lezione di ${shortDay(yesterday)}` })
      .click();
    await page.getByRole("menuitem", { name: "Elimina" }).click();
  }
  const confirm = page.getByRole("alertdialog", {
    name: `Eliminare la lezione di ${shortDay(yesterday)}?`,
  });
  await expect(confirm).toContainText("Il saldo passa da deve 40,00 € a in pari.");
  await expect(confirm).toContainText("Resta traccia nello storico modifiche.");
  await screens.dialog("lezione-elimina", confirm);
  await confirm.getByRole("button", { name: "Elimina lezione" }).click();
  await expect(confirm).toBeHidden();
  await expect(toasts(page)).toContainText("Lezione eliminata");
  await expect(balanceBlock(page)).toContainText("in pari");
  await expect(lessonRow).toHaveCount(1); // the scheduled copy is still there
  // The deleted row (and what opened the confirmation) is gone: the focus stays in the ledger,
  // on the row that took its place, instead of falling back to the page (WCAG 2.4.3).
  await expect(lessonRow).toBeFocused();

  // «Annulla» in the toast brings it back (a new row with the same data).
  await toastAction(page, "Lezione eliminata").click();
  await expect(balanceBlock(page)).toContainText("ti deve 40 euro");
  await expect(lessonRow).toHaveCount(2);

  // Storico modifiche: everything above, deletions included (03 §5.1).
  if (mobile) {
    await page.getByRole("button", { name: "Altre azioni per Irene Valli" }).click();
  } else {
    await page
      .getByRole("complementary", { name: "Scheda" })
      .getByRole("button", {
        name: "Altre azioni per Irene Valli",
      })
      .click();
  }
  await page.getByRole("menuitem", { name: "Storico modifiche" }).click();
  const history = page.getByRole("dialog", { name: "Storico modifiche" });
  await expect(history).toBeVisible();
  const day = yesterday.slice(8, 10) + "/" + yesterday.slice(5, 7);
  await expect(
    history.getByText(`Lezione del ${day} registrata`, { exact: false }).first(),
  ).toBeVisible();
  await expect(
    history.getByText(new RegExp(`Lezione del ${day} modificata`)).first(),
  ).toBeVisible();
  await expect(history.getByText(new RegExp(`Lezione del ${day} eliminata`)).first()).toBeVisible();
  await expectAccessible(page, '[role="dialog"]');
  await screens.dialog("storico-modifiche", history);
  await history.getByRole("button", { name: "Dettagli" }).first().click();
  await expect(history.getByText("fine", { exact: true }).first()).toBeVisible();
});

test("un pagamento aggiorna il saldo", async ({ page, mobile, demo, screens }) => {
  const student = await demo.api.createStudent({
    ...NEW_STUDENT,
    hourly_rate_cents: 2000,
    rate_effective_from: firstOfPreviousMonth(),
  });
  await demo.api.createLesson({
    student_id: student.id,
    date: isoDay(-1),
    start_time: "10:00",
    end_time: "12:00",
    topic: "disequazioni",
  });
  await page.goto(`/studenti/${student.id}`);
  await expect(balanceBlock(page)).toContainText("ti deve 40 euro");

  await page.getByRole("button", { name: "Pagamento", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Pagamento ricevuto" });
  await expect(form).toBeVisible();
  await expect(form.getByRole("button", { name: /\bDa\b/ })).toContainText("Irene Valli");
  await expect(form).toContainText(/Ti deve\s*40,00\s€/);
  // The suggested amount is the debt; «Dopo» previews the balance (03 §7.2).
  const amount = form.getByRole("textbox", { name: /^Importo/ });
  await expect(amount).toHaveValue("40,00");
  await expect(form).toContainText("Dopo: in pari");
  await amount.fill("50");
  await expect(form).toContainText("Dopo: credito 10,00 €");
  await form.getByRole("radiogroup", { name: "Come" }).getByText("Contanti").click();
  await screens.dialog("pagamento", form);
  await form.getByRole("button", { name: "Registra pagamento" }).click();
  await expect(form).toBeHidden();
  await expect(toasts(page)).toContainText("Pagamento di 50,00 € registrato");
  await expect(balanceBlock(page)).toContainText("in credito di 10 euro");
  await expect(balanceBlock(page)).toContainText("Circa 30 min di lezione a 20,00 €/h.");
  await expect(
    ledger(page, "Irene Valli", mobile).getByRole("button", { name: "Pagamento · contanti" }),
  ).toBeVisible();
});

test("cambio tariffa: anteprima, scelta esplicita e ricalcolo", async ({
  page,
  mobile,
  demo,
  screens,
}) => {
  const student = await demo.api.createStudent({
    ...NEW_STUDENT,
    hourly_rate_cents: 2000,
    rate_effective_from: firstOfPreviousMonth(),
  });
  for (const offset of [-3, -1]) {
    await demo.api.createLesson({
      student_id: student.id,
      date: isoDay(offset),
      start_time: "15:00",
      end_time: "16:00",
    });
  }
  await page.goto(`/studenti/${student.id}`);
  await expect(balanceBlock(page)).toContainText("ti deve 40 euro");

  await openStudentDetails(page, mobile);
  await page.getByRole("button", { name: "Cambia tariffa…" }).click();
  const form = page.getByRole("dialog", { name: "Nuova tariffa per Irene" });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: /^Nuova tariffa/ }).fill("25,00");
  const from = isoDay(-7);
  await pickDay(page, form, "Valida dal", from, mobile);
  // The preview counts the lessons that follow the history from that day (D-16).
  await expect(form).toContainText(
    `Dal ${shortDay(from).split(" ").slice(1).join(" ")} ci sono 2 lezioni che seguono la tariffa dello storico: 40,00 €.`,
  );
  const choice = form.getByRole("radiogroup", { name: "Cosa fare con queste 2 lezioni?" });
  await expect(choice.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Salva tariffa" })).toBeDisabled();
  await expect(form).toContainText("Scegli cosa fare con le lezioni già registrate");
  await screens.dialog("tariffa", form);
  await choice.getByText("Ricalcola le 2 lezioni (+10,00 €)").click();
  await expect(form).toContainText("Da 40,00 € a 50,00 €.");
  await form.getByRole("button", { name: "Salva tariffa" }).click();
  await expect(form).toBeHidden();
  await expect(toasts(page)).toContainText(
    `Tariffa di 25,00 €/h dal ${shortDay(from).split(" ").slice(1).join(" ")} salvata · 2 lezioni ricalcolate`,
  );
  await expect(balanceBlock(page)).toContainText("ti deve 50 euro");
  await openStudentDetails(page, mobile);
  await expect(page.getByRole("region", { name: "Tariffa oraria" })).toContainText("25,00 €/h");
});

test("archiviare uno studente con un saldo aperto", async ({ page, mobile, demo, screens }) => {
  const student = await demo.api.createStudent({
    ...NEW_STUDENT,
    hourly_rate_cents: 2000,
    rate_effective_from: firstOfPreviousMonth(),
  });
  await demo.api.createLesson({
    student_id: student.id,
    date: isoDay(-2),
    start_time: "09:00",
    end_time: "10:00",
  });
  await page.goto(`/studenti/${student.id}`);
  await expect(balanceBlock(page)).toContainText("ti deve 20 euro");

  const scheda = mobile
    ? page.getByRole("main")
    : page.getByRole("complementary", { name: "Scheda" });
  await scheda.getByRole("button", { name: "Altre azioni per Irene Valli" }).click();
  await page.getByRole("menuitem", { name: "Archivia" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Archiviare Irene Valli?" });
  await expect(confirm).toContainText(
    "Irene ti deve ancora 20,00 €. Resterà in «Conti aperti» finché il saldo non torna in pari.",
  );
  await screens.dialog("studente-archivia", confirm);
  await confirm.getByRole("button", { name: "Archivia" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Archiviato: non compare nelle liste.")).toBeVisible();
  await screens.page("studente-archiviato");

  // Out of the active list, in the closed «Archiviati» section; still in «Conti aperti».
  await page.goto("/studenti");
  await expect(page.getByText(/^(Studenti · )?6 attivi$/)).toBeVisible();
  const archived = page.getByRole("button", { name: "Archiviati (1)" });
  await expect(archived).toHaveAttribute("aria-expanded", "false");
  await archived.click();
  await expect(page.getByRole("list", { name: "Archiviati" })).toContainText("Irene Valli");
  await page.goto("/oggi");
  await expect(page.getByRole("region", { name: "Conti aperti" })).toContainText("Irene Valli");

  // «Ripristina» from the student page brings it back.
  await page.goto(`/studenti/${student.id}`);
  await page.getByRole("button", { name: "Ripristina" }).click();
  await expect(page.getByText("Archiviato: non compare nelle liste.")).toBeHidden();
});
