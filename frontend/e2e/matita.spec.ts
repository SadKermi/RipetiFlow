import { randomUUID } from "node:crypto";
import { expect, expectAccessible, firstOfPreviousMonth, isoDay, test } from "./fixtures";
import { balanceBlock, toasts } from "./ui";

// Matita with ASSISTANT_PROVIDER=none (03 §9.4 «Non disponibile», 02 §9.13): the server says
// assistant_available=false, so Matita steps aside everywhere and the forms do the work.
//
// The backend has no fake provider outside its own tests (FakeProvider is injected there), so the
// draft → «Ripassa a penna» journey runs with the model's step simulated in the browser: the
// config says Matita is on and POST /assistant/messages answers with a draft shaped exactly as
// docs/05-api.md says. Everything after that is real: the confirmation is a POST /lessons to the
// backend with X-RipetiFlow-Source: assistant (D-42: only the tutor's confirmation writes).

const UNAVAILABLE =
  "Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.";

test("Matita non attiva: nessuna riga, nessuna scorciatoia, i moduli funzionano", async ({
  page,
  mobile,
  demo,
  request,
  screens,
}) => {
  const config = (await (await request.get("/api/v1/public/config")).json()) as {
    assistant_available: boolean;
  };
  expect(config.assistant_available).toBe(false);

  await page.goto("/oggi");
  await expect(page.getByRole("heading", { level: 1, name: "Oggi" })).toBeVisible();
  // No Matita field anywhere: neither the line of Oggi nor the bar of the phone.
  await expect(page.getByRole("textbox", { name: /Matita/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Matita/ })).toHaveCount(0);
  if (mobile) {
    // The bar keeps only «+» (02 §9.13 «Non disponibile»).
    await expect(page.getByText(UNAVAILABLE)).toHaveCount(0);
  } else {
    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    // Cmd/Ctrl K does nothing: no dialog opens.
    await page.goto("/studenti");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/oggi");
  }

  // «+» is the way: the lesson form opens.
  await page.getByRole("button", { name: "Nuova lezione con il modulo" }).first().click();
  const form = page.getByRole("dialog", { name: "Nuova lezione" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Annulla" }).click();
  await expect(form).toBeHidden();

  // Student page: the line in the ledger says it is off; no «Promemoria» (it is Matita's).
  const student = await demo.api.createStudent({
    first_name: "Irene",
    last_name: "Valli",
    hourly_rate_cents: 2000,
    rate_effective_from: firstOfPreviousMonth(),
  });
  await page.goto(`/studenti/${student.id}`);
  await expect(page.getByRole("region", { name: "Registro" }).getByText(UNAVAILABLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Promemoria" })).toHaveCount(0);
  await expectAccessible(page);
  await screens.page("matita-non-attiva");
});

test("Matita non attiva: l'API risponde 503 con un problem+json in italiano", async ({
  request,
}) => {
  const login = (await (await request.post("/api/v1/dev/login")).json()) as {
    access_token: string;
  };
  const response = await request.post("/api/v1/assistant/messages", {
    headers: { Authorization: `Bearer ${login.access_token}` },
    data: { messages: [{ role: "user", content: "quanto mi deve Giulia?" }] },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  const problem = (await response.json()) as { detail: string };
  expect(problem.detail).toBe("Matita non è disponibile: nessun provider AI configurato.");
});

test("Matita (risposta del modello simulata): la bozza resta a matita finché non la ripassi", async ({
  page,
  demo,
  request,
  screens,
}) => {
  const student = await demo.api.createStudent({
    first_name: "Irene",
    last_name: "Valli",
    hourly_rate_cents: 2000,
    rate_effective_from: firstOfPreviousMonth(),
  });
  const subjects = (await (
    await request.get("/api/v1/subjects", { headers: { Authorization: `Bearer ${demo.token}` } })
  ).json()) as { items: { id: string; name: string }[] };
  const math = subjects.items.find((subject) => subject.name === "Matematica");
  expect(math).toBeDefined();

  await page.route("**/api/v1/public/config", async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...config, assistant_available: true } });
  });
  const sent: unknown[] = [];
  const yesterday = isoDay(-1);
  await page.route("**/api/v1/assistant/messages", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      json: {
        reply: "",
        refused: false,
        usage: { requests_today: 1, daily_limit: 60 },
        drafts: [
          {
            type: "lesson",
            id: randomUUID(),
            student: { id: student.id, display_name: student.display_name },
            subject: math,
            date: yesterday,
            start_time: "10:00",
            end_time: "11:00",
            hourly_rate_cents: 2000,
            amount_cents: 2000,
            topic: "equazioni",
            notes: null,
            warnings: [],
          },
        ],
      },
    });
  });

  await page.goto(`/studenti/${student.id}`);
  await expect(balanceBlock(page)).toContainText("in pari");
  const line = page.getByRole("region", { name: "Registro" }).getByRole("textbox", {
    name: "Scrivi a Matita",
  });
  await line.fill("ieri 10-11 matematica, equazioni");
  await line.press("Enter");

  // The draft is in pencil, at the top of the ledger; the totals do not move (03 §11).
  const confirm = page.getByRole("button", { name: /^Ripassa a penna/ });
  await expect(confirm).toBeVisible();
  // The focus is on the proposal, not on its «Ripassa a penna»: typing on as if still in the
  // line (a space, Enter) never writes; only Cmd/Ctrl + Enter or the button do (02 §9.13).
  const lessonWrites: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/v1/lessons") {
      lessonWrites.push(req.url());
    }
  });
  await expect(page.locator("[data-matita-proposal]").first()).toBeFocused();
  await page.keyboard.type(" e oggi");
  await page.keyboard.press("Enter");
  await expect(confirm).toBeVisible();
  expect(lessonWrites).toEqual([]);
  await expect(page.getByText("Matita ha letto:")).toBeVisible();
  await expect(balanceBlock(page)).toContainText("in pari");
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    messages: [{ role: "user", content: "ieri 10-11 matematica, equazioni" }],
    context: { student_id: student.id },
  });
  await expectAccessible(page);
  await screens.page("matita-bozza");

  // «Ripassa a penna»: the real write, marked as Matita's.
  const write = page.waitForRequest(
    (req) => req.method() === "POST" && new URL(req.url()).pathname === "/api/v1/lessons",
  );
  await confirm.click();
  expect((await write).headers()["x-ripetiflow-source"]).toBe("assistant");
  await expect(toasts(page)).toContainText("Lezione registrata · nel saldo");
  await expect(balanceBlock(page)).toContainText("ti deve 20 euro");
  await expect(page.getByRole("button", { name: /^Ripassa a penna/ })).toHaveCount(0);
});
