import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantReply } from "@/lib/api/types";
import { queryKeys } from "@/lib/queries";
import {
  NOW,
  type RecordedRequest,
  SUBJECTS,
  giulia,
  mockApi,
  problem,
  renderWithProviders,
  summary,
} from "@/features/forms/test-utils";
import { resetMatitaStores } from "./store";
import {
  MATITA_CONFIG,
  lessonDraft,
  messageDraft,
  paymentDraft,
  problemWithCode,
  reply,
  savedLesson,
  savedPayment,
} from "./test-helpers";
import { TodayLine } from "./TodayLine";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  resetMatitaStores();
});

const SARA = giulia({
  id: "sara",
  first_name: "Sara",
  last_name: "Conti",
  display_name: "Sara Conti",
  default_subject_id: "chi",
  rates: [{ id: "rs", hourly_rate_cents: 2500, effective_from: "2025-09-01", created_at: "" }],
});

const FORM_ROUTES = {
  "GET /subjects": {
    items: [...SUBJECTS, { id: "chi", name: "Chimica", position: 2, archived: false }],
  },
  "GET /students/sara": SARA,
  "GET /students/giulia": giulia(),
};

function renderLine(routes: Record<string, unknown>, { students = true } = {}) {
  const requests = mockApi({ ...FORM_ROUTES, ...routes });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    queryKeys.students.list({ archived: false, sort: "name" }),
    students ? [summary("luca", "Luca Bianchi", 4000), summary("sara", "Sara Conti", 0)] : [],
  );
  renderWithProviders(<TodayLine />, { config: MATITA_CONFIG, queryClient });
  return requests;
}

const line = () => screen.getByRole("textbox", { name: "Scrivi a Matita" });
const assistantCalls = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.path === "/assistant/messages");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function ask(text: string) {
  await userEvent.type(line(), text);
  await userEvent.keyboard("{Enter}");
}

describe("TodayLine — proposing a lesson (03 §9.1)", () => {
  it("writes, thinks, then shows the draft «a matita» with what the server computed", async () => {
    const answer = deferred<AssistantReply>();
    const requests = renderLine({ "POST /assistant/messages": () => answer.promise });
    expect(line()).toHaveAttribute(
      "placeholder",
      "Scrivi una riga… «ieri 15–16:30 matematica con Luca»",
    );
    await userEvent.type(line(), "oggi 13-14 chimica con sara, stechiometria");
    expect(screen.getByText("Invio per proporre · Esc per annullare")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    // Thinking: the text stays, locked, and Matita says it is writing (aria-live polite).
    expect(line()).toHaveAttribute("readonly");
    expect(line()).toHaveValue("oggi 13-14 chimica con sara, stechiometria");
    expect(screen.getByText("Matita sta scrivendo…", { selector: ".marker" })).toBeInTheDocument();
    expect(
      screen.getByText("Matita sta scrivendo…", { selector: "[aria-live]" }),
    ).toBeInTheDocument();
    expect(assistantCalls(requests)[0]?.body).toEqual({
      messages: [{ role: "user", content: "oggi 13-14 chimica con sara, stechiometria" }],
      context: { student_id: null, today: "2026-10-06" },
    });

    await act(async () => {
      answer.resolve(
        reply({
          drafts: [
            lessonDraft({ warnings: ["Esiste già una lezione con Sara il 06/10 alle 13:00."] }),
          ],
        }),
      );
      await answer.promise;
    });

    const card = await screen.findByRole("group", { name: /Matita propone/ });
    expect(
      within(card).getByText("oggi 13-14 chimica con sara, stechiometria"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Sara Conti")).toBeInTheDocument();
    expect(within(card).getByText(/mar 6 ott 2026/)).toBeInTheDocument();
    expect(within(card).getByText("(oggi)")).toBeInTheDocument();
    expect(within(card).getByText("13:00–14:00")).toBeInTheDocument();
    expect(within(card).getByText("Chimica")).toBeInTheDocument();
    expect(within(card).getByText("stechiometria")).toBeInTheDocument();
    expect(within(card).getByText(/^25,00\s€$/)).toBeInTheDocument();
    expect(within(card).getByText(/a 25,00\s€\/h/)).toBeInTheDocument();
    expect(
      within(card).getByText("Esiste già una lezione con Sara il 06/10 alle 13:00."),
    ).toBeInTheDocument();
    // The line is free again and the focus is on the proposal.
    expect(line()).toHaveValue("");
    expect(line()).not.toHaveAttribute("readonly");
    await waitFor(() => expect(card).toHaveFocus());
    expect(
      screen.getByText(/Matita propone una bozza\./, { selector: "[aria-live]" }),
    ).toBeInTheDocument();
  });

  it("«Ripassa a penna» writes it with X-RipetiFlow-Source: assistant and no rate", async () => {
    const requests = renderLine({
      "POST /assistant/messages": reply({ drafts: [lessonDraft()] }),
      "POST /lessons": savedLesson(),
    });
    await ask("oggi 13-14 chimica con sara, stechiometria");
    await userEvent.click(await screen.findByRole("button", { name: /^Ripassa a penna/ }));

    expect(
      await screen.findByText("Lezione di Sara Conti registrata · nel saldo"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
    const post = requests.find((request) => request.path === "/lessons");
    expect(post?.headers.get("X-RipetiFlow-Source")).toBe("assistant");
    expect(post?.body).toEqual({
      student_id: "sara",
      subject_id: "chi",
      date: "2026-10-06",
      start_time: "13:00",
      end_time: "14:00",
      topic: "stechiometria",
      notes: null,
    });
    expect(screen.queryByRole("group", { name: /Matita propone/ })).not.toBeInTheDocument();
    await waitFor(() => expect(line()).toHaveFocus());
  });

  it("a 422 keeps the draft and opens the form prefilled with the error on its field", async () => {
    renderLine({
      "POST /assistant/messages": reply({ drafts: [lessonDraft()] }),
      "POST /lessons": problem(422, "Dati non validi", [
        {
          field: "end_time",
          message: "L'orario di fine deve essere successivo a quello di inizio.",
        },
      ]),
    });
    await ask("oggi 13-14 chimica con sara");
    await userEvent.click(await screen.findByRole("button", { name: /^Ripassa a penna/ }));

    const form = await screen.findByRole("dialog");
    expect(within(form).getByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
    expect(
      await within(form).findByText("L'orario di fine deve essere successivo a quello di inizio."),
    ).toBeInTheDocument();
    expect(within(form).getByRole("textbox", { name: "Fine" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(within(form).getByRole("textbox", { name: "Inizio" })).toHaveValue("13:00");
    // Still «a matita» behind the form.
    expect(screen.getAllByText("Matita propone", { exact: false }).length).toBeGreaterThan(0);
  });

  it("«Modifica» opens the form prefilled; saving it confirms the draft as Matita's", async () => {
    const requests = renderLine({
      "POST /assistant/messages": reply({ drafts: [lessonDraft()] }),
      "POST /lessons": savedLesson(),
    });
    await ask("oggi 13-14 chimica con sara, stechiometria");
    await userEvent.click(await screen.findByRole("button", { name: "Modifica" }));

    const form = await screen.findByRole("dialog");
    expect(within(form).getByRole("textbox", { name: "Inizio" })).toHaveValue("13:00");
    expect(within(form).getByRole("textbox", { name: "Fine" })).toHaveValue("14:00");
    expect(within(form).getByRole("textbox", { name: /Argomento/ })).toHaveValue("stechiometria");
    await userEvent.click(within(form).getByRole("button", { name: "Salva lezione" }));

    await waitFor(() =>
      expect(screen.queryByRole("group", { name: /Matita propone/ })).not.toBeInTheDocument(),
    );
    const post = requests.find((request) => request.path === "/lessons");
    expect(post?.headers.get("X-RipetiFlow-Source")).toBe("assistant");
  });
});

describe("TodayLine — more proposals and the keyboard", () => {
  it("Esc discards the focused proposal, Ctrl + Enter goes over the next one in ink", async () => {
    const requests = renderLine({
      "POST /assistant/messages": reply({ drafts: [lessonDraft(), paymentDraft()] }),
      "POST /payments": savedPayment(),
    });
    await ask("ieri lezione con Sara e Giulia mi ha dato 50 euro");
    const cards = await screen.findAllByRole("group", { name: /Matita propone/ });
    expect(cards).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ripassa tutte a penna (2)" })).toBeInTheDocument();
    await waitFor(() => expect(cards[0]).toHaveFocus());

    await userEvent.keyboard("{Escape}");
    expect(screen.getAllByRole("group", { name: /Matita propone/ })).toHaveLength(1);
    const payment = screen.getByRole("group", { name: /pagamento di Giulia Ferri/ });
    await waitFor(() => expect(payment).toHaveFocus());

    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(await screen.findByText(/Pagamento di 50,00\s€ registrato/)).toBeInTheDocument();
    expect(requests.filter((request) => request.path === "/lessons")).toHaveLength(0);
    expect(
      requests.find((request) => request.path === "/payments")?.headers.get("X-RipetiFlow-Source"),
    ).toBe("assistant");
  });

  it("«Ripassa tutte a penna» goes one at a time and stops at the first error", async () => {
    const requests = renderLine({
      "POST /assistant/messages": reply({ drafts: [lessonDraft(), paymentDraft()] }),
      "POST /lessons": problem(500, "Errore interno: riprova tra poco."),
      "POST /payments": savedPayment(),
    });
    await ask("ieri lezione con Sara e Giulia mi ha dato 50 euro");
    await userEvent.click(await screen.findByRole("button", { name: "Ripassa tutte a penna (2)" }));

    expect(await screen.findByText("Errore interno: riprova tra poco.")).toBeInTheDocument();
    expect(requests.filter((request) => request.path === "/payments")).toHaveLength(0);
    expect(screen.getAllByRole("group", { name: /Matita propone/ })).toHaveLength(2);
  });
});

describe("TodayLine — answers and conversation (03 §9.3)", () => {
  it("shows the margin note with the question; Esc clears it, ↑ brings it back", async () => {
    renderLine({
      "POST /assistant/messages": reply({
        reply: "Giulia ti deve **67,00 €**: 23,00 € rimasti dopo il bonifico del 2 ottobre.",
      }),
    });
    await ask("quanto mi deve Giulia?");
    const note = await screen.findByRole("region", { name: "Risposta di Matita" });
    expect(within(note).getByText("quanto mi deve Giulia?")).toBeInTheDocument();
    expect(within(note).getByText("67,00 €").tagName).toBe("B");
    expect(
      screen.getByText("Giulia ti deve 67,00 €: 23,00 € rimasti dopo il bonifico del 2 ottobre.", {
        selector: "[aria-live]",
      }),
    ).toBeInTheDocument();
    expect(line()).toHaveFocus(); // an answer leaves the focus in the line

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Risposta di Matita" })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("region", { name: "Risposta di Matita" })).toBeInTheDocument();
  });

  it("«oppure usa il modulo» opens the lesson form", async () => {
    renderLine({
      "POST /assistant/messages": reply({
        reply:
          "Non sono riuscito a preparare una risposta affidabile. Riprova con una richiesta più semplice, per esempio: «quanto mi deve Giulia?»",
      }),
    });
    await ask("boh");
    await userEvent.click(await screen.findByRole("button", { name: "oppure usa il modulo" }));
    expect(await screen.findByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
  });

  it("a clarifying question continues in the same line, with the previous turns", async () => {
    let call = 0;
    const requests = renderLine({
      "POST /assistant/messages": () => {
        call += 1;
        return call === 1
          ? reply({ reply: "Ci sono due Luca: Bianchi e Moretti. Quale intendi?" })
          : reply({ reply: "Luca Bianchi è in credito di 40,00 €." });
      },
    });
    await ask("quanto mi deve Luca?");
    await screen.findByText("Ci sono due Luca: Bianchi e Moretti. Quale intendi?", {
      selector: "p",
    });
    await ask("Bianchi");
    await screen.findByText("Luca Bianchi è in credito di 40,00 €.", { selector: "p" });
    expect(assistantCalls(requests)[1]?.body).toMatchObject({
      messages: [
        { role: "user", content: "quanto mi deve Luca?" },
        { role: "assistant", content: "Ci sono due Luca: Bianchi e Moretti. Quale intendi?" },
        { role: "user", content: "Bianchi" },
      ],
    });
  });

  it("out of scope: the server's fixed text with the Prohibit note, never rewritten", async () => {
    const refusal =
      "Posso aiutarti solo con il tuo registro: lezioni, pagamenti, saldi e messaggi per studenti e famiglie. Prova per esempio: «quanto mi deve Giulia?»";
    renderLine({ "POST /assistant/messages": reply({ reply: refusal, refused: true }) });
    await ask("spiegami le derivate");
    const note = await screen.findByRole("region", { name: "Risposta di Matita" });
    expect(within(note).getByText(refusal)).toBeInTheDocument();
    expect(within(note).queryByRole("button", { name: "oppure usa il modulo" })).toBeNull();
  });

  it("a message draft: copy it, or open WhatsApp asking whom (no student in Oggi)", async () => {
    const user = userEvent.setup();
    renderLine({ "POST /assistant/messages": reply({ drafts: [messageDraft()] }) });
    await user.type(line(), "scrivi un promemoria per la mamma di Giulia{Enter}");
    const card = await screen.findByRole("group", { name: "Messaggio per mamma di Giulia" });
    const whatsapp = within(card).getByRole("link", { name: "WhatsApp" });
    expect(whatsapp.getAttribute("href")).toBe(
      `https://wa.me/?text=${encodeURIComponent(messageDraft().text)}`,
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");

    await user.click(within(card).getByRole("button", { name: "Modifica" }));
    const text = within(card).getByRole("textbox", { name: "Testo del messaggio" });
    await user.clear(text);
    await user.type(text, "Testo corretto");
    expect(within(card).getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe(
      "https://wa.me/?text=Testo%20corretto",
    );
    await user.click(within(card).getByRole("button", { name: "Copia" }));
    expect(await screen.findByText("Messaggio copiato")).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe("Testo corretto");
  });
});

describe("TodayLine — limits and errors (02 §9.13)", () => {
  it("429: the server's sentence, the forms still work, the line keeps its text and waits", async () => {
    const requests = renderLine({
      "POST /assistant/messages": problemWithCode(
        429,
        "rate_limited",
        "Hai raggiunto il limite di 60 richieste a Matita per oggi. Riprova domani.",
      ),
    });
    await ask("quanto mi deve Giulia?");
    expect(
      await screen.findByText(
        "Hai raggiunto il limite di 60 richieste a Matita per oggi. Riprova domani. I moduli funzionano come sempre.",
      ),
    ).toBeInTheDocument();
    expect(line()).toHaveValue("quanto mi deve Giulia?");
    expect(line()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(line());
    await userEvent.keyboard("{Enter}");
    expect(assistantCalls(requests)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Nuova lezione con il modulo" })).toBeEnabled();
  });

  it("502: «Matita non risponde…», the line is still there and «Riprova» sends it again", async () => {
    let call = 0;
    const requests = renderLine({
      "POST /assistant/messages": () => {
        call += 1;
        return call === 1
          ? problemWithCode(502, "upstream_error", "Il servizio AI non risponde.")
          : reply({ reply: "Giulia ti deve 67,00 €." });
      },
    });
    await ask("quanto mi deve Giulia?");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Matita non risponde in questo momento. La riga è ancora nel campo.",
    );
    expect(line()).toHaveValue("quanto mi deve Giulia?");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(
      await screen.findByText("Giulia ti deve 67,00 €.", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(assistantCalls(requests)).toHaveLength(2);
  });

  it("offline: «Sei offline o il server non risponde…»", async () => {
    renderLine({
      "POST /assistant/messages": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await ask("quanto mi deve Giulia?");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sei offline o il server non risponde. La riga è ancora nel campo.",
    );
  });

  it("503: Matita steps aside and says so; the «+» stays", async () => {
    renderLine({
      "POST /assistant/messages": problemWithCode(503, "unavailable", "Matita non è disponibile."),
    });
    await ask("quanto mi deve Giulia?");
    expect(
      await screen.findByText(
        "Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Scrivi a Matita" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova lezione con il modulo" })).toBeInTheDocument();
  });

  it("near the daily limit: «Ancora 8 richieste a Matita oggi.»", async () => {
    renderLine({
      "POST /assistant/messages": reply({
        reply: "Giulia ti deve 67,00 €.",
        usage: { requests_today: 52, daily_limit: 60 },
      }),
    });
    await ask("quanto mi deve Giulia?");
    expect(await screen.findByText("Ancora 8 richieste a Matita oggi.")).toBeInTheDocument();
  });

  it("without students there is no example in the line", () => {
    renderLine({}, { students: false });
    expect(line()).toHaveAttribute("placeholder", "Scrivi una riga…");
  });

  it("Esc while Matita is writing stops the request; the line keeps its text", async () => {
    const answer = deferred<AssistantReply>();
    renderLine({ "POST /assistant/messages": () => answer.promise });
    await ask("quanto mi deve Giulia?");
    expect(screen.getByText("Matita sta scrivendo…", { selector: ".marker" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Matita sta scrivendo…", { selector: ".marker" })).toBeNull();
    expect(line()).not.toHaveAttribute("readonly");
    expect(line()).toHaveValue("quanto mi deve Giulia?");
    // A late answer to the stopped request is not shown.
    await act(async () => {
      answer.resolve(reply({ reply: "Giulia ti deve 67,00 €." }));
      await answer.promise;
    });
    expect(screen.queryByRole("region", { name: "Risposta di Matita" })).toBeNull();
  });
});
