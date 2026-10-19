import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ledger } from "@/components/Ledger";
import type { LedgerLineProps } from "@/components/shell/matita-slot";
import { ApiProblem } from "@/lib/api/problem";
import {
  NOW,
  SUBJECTS,
  giulia,
  mockApi,
  problem,
  renderWithProviders,
} from "@/features/forms/test-utils";
import { LedgerLine } from "./LedgerLine";
import { resetMatitaStores } from "./store";
import {
  MATITA_CONFIG,
  lessonDraft,
  messageDraft,
  paymentDraft,
  problemWithCode,
  reply,
  savedPayment,
} from "./test-helpers";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  resetMatitaStores();
});

const GIULIA_LESSON = lessonDraft({
  student: { id: "giulia", display_name: "Giulia Ferri" },
  subject: { id: "mat", name: "Matematica" },
  start_time: "16:30",
  end_time: "18:00",
  hourly_rate_cents: 2200,
  amount_cents: 3300,
  topic: "equazioni di secondo grado",
  warnings: ["Data nel futuro: la lezione sarà programmata."],
});

function renderLedger(
  routes: Record<string, unknown>,
  props: Partial<LedgerLineProps> = {},
  layout: "table" | "list" = "table",
) {
  const requests = mockApi({
    "GET /students/giulia": giulia(),
    "GET /subjects": { items: SUBJECTS },
    ...routes,
  });
  const openLessonForm = vi.fn();
  const openPaymentForm = vi.fn();
  const all: Omit<LedgerLineProps, "prompt"> = {
    student: { id: "giulia", first_name: "Giulia", display_name: "Giulia Ferri" },
    balanceCents: -6700,
    today: "2026-10-06",
    openLessonForm,
    openPaymentForm,
    ...props,
  };
  renderWithProviders(<Harness {...all} layout={layout} />, { config: MATITA_CONFIG });
  return { requests, openLessonForm, openPaymentForm };
}

/** The page around the line: «Promemoria» sets a new prompt (a new nonce) every press. */
function Harness({
  layout,
  ...props
}: Omit<LedgerLineProps, "prompt"> & { layout: "table" | "list" }) {
  const [prompt, setPrompt] = useState<LedgerLineProps["prompt"]>(null);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setPrompt((current) => ({
            text: "scrivi un promemoria di pagamento per Anna Ferri",
            nonce: (current?.nonce ?? 0) + 1,
          }))
        }
      >
        Promemoria
      </button>
      <button
        type="button"
        onClick={() => setPrompt((current) => (current ? { ...current } : null))}
      >
        Ridisegna
      </button>
      <Ledger caption="Registro di Giulia Ferri" layout={layout}>
        <LedgerLine {...props} prompt={prompt} />
      </Ledger>
    </>
  );
}

const line = () => screen.getByRole("textbox", { name: "Scrivi a Matita" });

async function ask(text: string) {
  await userEvent.type(line(), text);
  await userEvent.keyboard("{Enter}");
}

describe("LedgerLine — drafts in the student's ledger (02 §9.6, §9.13 a)", () => {
  it("sends the student as context and shows a payment as a ledger row «sarà deve …»", async () => {
    const { requests } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [paymentDraft()] }),
      "POST /payments": savedPayment(),
    });
    expect(line()).toHaveAttribute(
      "placeholder",
      "Scrivi una riga… «oggi 16:30–18 matematica, equazioni»",
    );
    await ask("mi ha dato 50 euro in contanti");
    const table = screen.getByRole("table", { name: "Registro di Giulia Ferri" });
    const row = await within(table).findByText("Matita propone:", { exact: false });
    expect(requests.find((r) => r.path === "/assistant/messages")?.body).toMatchObject({
      context: { student_id: "giulia", today: "2026-10-06" },
    });
    const draftRow = row.closest("tr")!;
    expect(within(draftRow).getByText("Pagamento")).toBeInTheDocument();
    expect(within(draftRow).getByText("contanti")).toBeInTheDocument();
    expect(within(draftRow).getByText("sarà deve 17 euro")).toBeInTheDocument();
    expect(within(draftRow).getByText("mi ha dato 50 euro in contanti")).toBeInTheDocument();
    // The proposal (the whole row) takes the focus, not its «Ripassa a penna» button.
    const proposal = within(table).getByRole("group", {
      name: "Matita propone: pagamento di Giulia Ferri, mar 6 ott",
    });
    await waitFor(() => expect(proposal).toHaveFocus());
    const confirm = within(draftRow).getByRole("button", { name: /^Ripassa a penna/ });

    await userEvent.click(confirm);
    expect(await screen.findByText(/Pagamento di 50,00\s€ registrato/)).toBeInTheDocument();
    expect(requests.find((r) => r.path === "/payments")?.headers.get("X-RipetiFlow-Source")).toBe(
      "assistant",
    );
    await waitFor(() => expect(screen.queryByText("Matita propone:", { exact: false })).toBeNull());
  });

  it("a lesson still to come: «Bozza · programmata», the warning, no «sarà»", async () => {
    renderLedger({ "POST /assistant/messages": reply({ drafts: [GIULIA_LESSON] }) });
    await ask("oggi 16:30–18 mate, equazioni di secondo grado");
    expect(
      await screen.findByText("Bozza · programmata: non entra subito nel saldo"),
    ).toBeInTheDocument();
    expect(screen.getByText("Data nel futuro: la lezione sarà programmata.")).toBeInTheDocument();
    expect(screen.getByText("33,00")).toBeInTheDocument();
    expect(screen.getByText("1 h 30")).toBeInTheDocument();
    expect(screen.queryByText(/^sarà/)).toBeNull();
  });

  it("a lesson already over says what the balance will be", async () => {
    renderLedger({
      "POST /assistant/messages": reply({
        drafts: [{ ...GIULIA_LESSON, start_time: "12:00", end_time: "13:30", warnings: [] }],
      }),
    });
    await ask("oggi 12–13:30 mate");
    expect(await screen.findByText("sarà deve 100 euro")).toBeInTheDocument();
  });

  it("drafts for another student are cards under the line, not ledger rows", async () => {
    renderLedger({ "POST /assistant/messages": reply({ drafts: [lessonDraft()] }) });
    await ask("anche Sara oggi 13-14 chimica");
    const card = await screen.findByRole("group", { name: /lezione di Sara Conti/ });
    expect(card.closest("td")).not.toBeNull();
    expect(screen.queryByText("Bozza", { exact: true })).toBeNull();
  });

  it("«Modifica» opens the page's form prefilled; the draft goes once the form is saved", async () => {
    const { openLessonForm } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [GIULIA_LESSON] }),
    });
    await ask("oggi 16:30–18 mate");
    await userEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    expect(openLessonForm).toHaveBeenCalledOnce();
    const [initial, options] = openLessonForm.mock.calls[0] as [
      Record<string, unknown>,
      { source: string; onSaved: () => void },
    ];
    expect(initial).toEqual({
      student_id: "giulia",
      subject_id: "mat",
      date: "2026-10-06",
      start_time: "16:30",
      end_time: "18:00",
      topic: "equazioni di secondo grado",
      notes: null,
    });
    expect(options.source).toBe("assistant");
    options.onSaved();
    await waitFor(() =>
      expect(screen.queryByText("Bozza · programmata: non entra subito nel saldo")).toBeNull(),
    );
  });

  it("a 422 on «Ripassa a penna» opens the form with the error, the draft stays", async () => {
    const { openLessonForm } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [GIULIA_LESSON] }),
      "POST /lessons": problem(422, "Dati non validi", [
        { field: "start_time", message: "Gli orari devono essere espressi in minuti interi." },
      ]),
    });
    await ask("oggi 16:30–18 mate");
    await userEvent.click(await screen.findByRole("button", { name: /^Ripassa a penna/ }));
    await waitFor(() => expect(openLessonForm).toHaveBeenCalledOnce());
    const options = openLessonForm.mock.calls[0]![1] as { error: unknown; source: string };
    expect(options.source).toBe("assistant");
    expect(options.error).toBeInstanceOf(ApiProblem);
    expect(screen.getByText("Bozza · programmata: non entra subito nel saldo")).toBeInTheDocument();
  });

  it("Ctrl + Enter on a focused row button goes over it in ink, even on «Modifica»", async () => {
    const { requests, openPaymentForm } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [paymentDraft()] }),
      "POST /payments": savedPayment(),
    });
    await ask("mi ha dato 50 euro");
    const edit = await screen.findByRole("button", { name: "Modifica" });
    edit.focus();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(await screen.findByText(/Pagamento di 50,00\s€ registrato/)).toBeInTheDocument();
    expect(openPaymentForm).not.toHaveBeenCalled();
    expect(requests.filter((r) => r.path === "/payments")).toHaveLength(1);
  });

  it("typing on after the reply never goes over a draft in ink: only Ctrl + Enter does", async () => {
    const { requests } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [paymentDraft()] }),
      "POST /payments": savedPayment(),
    });
    await ask("mi ha dato 50 euro");
    await screen.findByRole("button", { name: /^Ripassa a penna/ });
    // The tutor goes on writing the next sentence as if still in the line, and presses Enter.
    await userEvent.keyboard("e oggi 17-18 fisica{Enter}");
    await userEvent.keyboard(" ");
    expect(requests.filter((r) => r.path === "/payments")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Ripassa a penna/ })).toBeInTheDocument();

    // Ctrl + Enter on the focused proposal is the explicit gesture (02 §9.13).
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(await screen.findByText(/Pagamento di 50,00\s€ registrato/)).toBeInTheDocument();
    expect(requests.filter((r) => r.path === "/payments")).toHaveLength(1);
  });

  it("Esc on the focused proposal row discards it", async () => {
    const { requests } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [paymentDraft()] }),
    });
    await ask("mi ha dato 50 euro");
    const proposal = await screen.findByRole("group", { name: /^Matita propone: pagamento/ });
    await waitFor(() => expect(proposal).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Ripassa a penna/ })).toBeNull(),
    );
    expect(requests.filter((r) => r.path === "/payments")).toHaveLength(0);
  });

  it("works in the mobile list too", async () => {
    renderLedger({ "POST /assistant/messages": reply({ drafts: [paymentDraft()] }) }, {}, "list");
    await ask("mi ha dato 50 euro");
    const list = screen.getByRole("list", { name: "Registro di Giulia Ferri" });
    expect(await within(list).findByText("sarà deve 17 euro")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /^Ripassa a penna/ })).toBeInTheDocument();
  });
});

describe("LedgerLine — «Promemoria» and messages (03 §5, §9.3)", () => {
  it("sends the request once per press and offers WhatsApp to the guardian's number", async () => {
    const user = userEvent.setup();
    const { requests } = renderLedger({
      "POST /assistant/messages": reply({ drafts: [messageDraft()] }),
    });
    await user.click(screen.getByRole("button", { name: "Promemoria" }));
    const card = await screen.findByRole("group", { name: "Messaggio per mamma di Giulia" });
    const calls = () => requests.filter((r) => r.path === "/assistant/messages");
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.body).toMatchObject({
      messages: [{ role: "user", content: "scrivi un promemoria di pagamento per Anna Ferri" }],
      context: { student_id: "giulia" },
    });
    const whatsapp = within(card).getByRole("link", { name: "WhatsApp · 347 512 0896" });
    expect(whatsapp.getAttribute("href")).toBe(
      `https://wa.me/393475120896?text=${encodeURIComponent(messageDraft().text)}`,
    );
    await waitFor(() => expect(card).toHaveFocus());

    // A re-render with the same press sends nothing; a new press sends again.
    await user.click(screen.getByRole("button", { name: "Ridisegna" }));
    expect(calls()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Promemoria" }));
    await waitFor(() => expect(calls()).toHaveLength(2));

    await user.click(within(card).getByRole("button", { name: "Copia" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(messageDraft().text);
  });

  it("without a usable number WhatsApp asks whom, and the number can be added", async () => {
    renderLedger({
      "GET /students/giulia": giulia({ guardian_phone: null, phone: "331 22" }),
      "POST /assistant/messages": reply({ drafts: [messageDraft()] }),
    });
    await ask("scrivi un promemoria di pagamento");
    const card = await screen.findByRole("group", { name: "Messaggio per mamma di Giulia" });
    expect(
      within(card).getByText(
        "Nella scheda di Giulia non c'è un numero di telefono valido: WhatsApp ti chiederà a chi mandarlo.",
      ),
    ).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/\?text=/,
    );
    await userEvent.click(within(card).getByRole("button", { name: "Aggiungi il numero" }));
    expect(await screen.findByRole("heading", { name: "Modifica dati" })).toBeInTheDocument();
  });

  it("an email draft opens the mail app to the guardian's address", async () => {
    renderLedger({
      "GET /students/giulia": giulia({ guardian_email: "anna.ferri@esempio.it" }),
      "POST /assistant/messages": reply({
        drafts: [messageDraft({ channel: "email", text: "Gentile signora Ferri" })],
      }),
    });
    await ask("scrivi una mail alla mamma");
    const card = await screen.findByRole("group", { name: "Messaggio per mamma di Giulia" });
    expect(within(card).getByRole("link", { name: "Email" }).getAttribute("href")).toBe(
      "mailto:anna.ferri@esempio.it?body=Gentile%20signora%20Ferri",
    );
    expect(within(card).queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });
});

describe("LedgerLine — not available", () => {
  it("after a 503 the row says Matita is not active and keeps the «+»", async () => {
    const { openLessonForm } = renderLedger({
      "POST /assistant/messages": problemWithCode(503, "unavailable", "Matita non è disponibile."),
    });
    await ask("quanto mi deve?");
    expect(
      await screen.findByText(
        "Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nuova lezione con il modulo" }));
    expect(openLessonForm).toHaveBeenCalledWith({});
  });
});
