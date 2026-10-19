import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { LessonFormDialog, type LessonFormDialogProps } from "./LessonFormDialog";
import {
  NOW,
  SUBJECTS,
  giulia,
  lesson,
  mockApi,
  problem,
  renderWithProviders,
  summary,
} from "./test-utils";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const BASE_ROUTES = {
  "GET /students": {
    items: [summary("giulia", "Giulia Ferri", -6700), summary("marco", "Marco Rossi", 0)],
  },
  "GET /subjects": { items: SUBJECTS },
  "GET /students/giulia": giulia(),
};

/** Opens the form and closes it like the page does. */
function Harness(props: Omit<LessonFormDialogProps, "isOpen">) {
  const [open, setOpen] = useState(true);
  return (
    <LessonFormDialog
      {...props}
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        props.onOpenChange(next);
      }}
    />
  );
}

function dialog() {
  return screen.getByRole("dialog");
}

describe("LessonFormDialog — new lesson", () => {
  it("opens prefilled from the student page and sends no rate when the tutor did not write one", async () => {
    const onSaved = vi.fn();
    const requests = mockApi({
      ...BASE_ROUTES,
      "POST /lessons": lesson({
        id: "new",
        date: "2026-10-06",
        start_time: "14:15",
        end_time: "15:45",
        settled: false,
      }),
    });
    renderWithProviders(
      <LessonFormDialog
        isOpen
        onOpenChange={() => undefined}
        initial={{ student_id: "giulia" }}
        onSaved={onSaved}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
    // The usual subject and the rate of the day come from the student.
    expect(
      await within(dialog()).findByText(/1 h 30 min · 33,00\s€ a 22,00\s€\/h/),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Programmata: entra nel saldo alle 15:45 di oggi."),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: /Matematica/ })).toBeInTheDocument();

    await userEvent.type(within(dialog()).getByRole("textbox", { name: /Argomento/ }), "equazioni");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Salva lezione" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const post = requests.find((r) => r.method === "POST");
    expect(post?.body).toEqual({
      student_id: "giulia",
      subject_id: "mat",
      date: "2026-10-06",
      start_time: "14:15",
      end_time: "15:45",
      topic: "equazioni",
      notes: null,
    });
    expect(
      await screen.findByText("Lezione programmata per mar 6 ott alle 14:15"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
  });

  it("checks the times locally with the server's text and focuses the field", async () => {
    const requests = mockApi(BASE_ROUTES);
    renderWithProviders(
      <LessonFormDialog isOpen onOpenChange={() => undefined} initial={{ student_id: "giulia" }} />,
    );
    const end = within(dialog()).getByRole("textbox", { name: "Fine" });
    await userEvent.clear(end);
    await userEvent.type(end, "13");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Salva lezione" }));

    expect(
      await within(dialog()).findByText(
        "L'orario di fine deve essere successivo a quello di inizio.",
      ),
    ).toBeInTheDocument();
    expect(end).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(end).toHaveFocus());
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });

  it("puts the server's field errors on their fields and the rest above the actions", async () => {
    mockApi({
      ...BASE_ROUTES,
      "POST /lessons": problem(422, "Dati non validi", [
        { field: "subject_id", message: "Materia non trovata." },
        { field: "body", message: "Richiesta incompleta." },
      ]),
    });
    renderWithProviders(
      <LessonFormDialog isOpen onOpenChange={() => undefined} initial={{ student_id: "giulia" }} />,
    );
    await within(dialog()).findByText(/33,00/);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Salva lezione" }));
    expect(await within(dialog()).findByText("Materia non trovata.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("Richiesta incompleta.");
    // The form stays open and filled, and nothing is toasted.
    expect(screen.getByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
    expect(screen.queryByText(/Lezione programmata/)).not.toBeInTheDocument();
  });

  it("sends the rate only when written for this lesson (D-16)", async () => {
    const requests = mockApi({ ...BASE_ROUTES, "POST /lessons": lesson({ id: "new" }) });
    renderWithProviders(
      <LessonFormDialog isOpen onOpenChange={() => undefined} initial={{ student_id: "giulia" }} />,
    );
    const toggle = await within(dialog()).findByRole("button", {
      name: /Tariffa per questa lezione: 22,00/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    const rate = within(dialog()).getByRole("textbox", { name: "Tariffa oraria" });
    expect(rate).toHaveValue("22,00");
    expect(
      within(dialog()).getByText(
        /È la tariffa di Giulia per il 6 ott\. Cambiala solo per questa lezione/,
      ),
    ).toBeInTheDocument();
    await userEvent.clear(rate);
    await userEvent.type(rate, "25");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Salva lezione" }));
    await waitFor(() => expect(requests.some((r) => r.method === "POST")).toBe(true));
    expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({
      hourly_rate_cents: 2500,
    });
  });

  it("shows the error of a failed «Ripassa a penna» on its field at opening", async () => {
    mockApi(BASE_ROUTES);
    const error = ApiProblem.fromBody(422, {
      detail: "Dati non validi",
      code: "validation_error",
      errors: [
        { field: "start_time", message: "Gli orari devono essere espressi in minuti interi." },
      ],
    });
    renderWithProviders(
      <LessonFormDialog
        isOpen
        onOpenChange={() => undefined}
        initial={{ student_id: "giulia", start_time: "15:00", end_time: "16:00" }}
        source="assistant"
        initialError={error}
      />,
    );
    expect(
      await within(dialog()).findByText("Gli orari devono essere espressi in minuti interi."),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole("textbox", { name: "Inizio" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

describe("LessonFormDialog — edit", () => {
  it("loads the lesson with its notes, sends only what changed and «Annulla» puts it back", async () => {
    const original = lesson();
    const requests = mockApi({
      ...BASE_ROUTES,
      "GET /lessons/l-5ott": original,
      "PATCH /lessons/l-5ott": (request: { body: unknown }) => ({
        ...original,
        ...(request.body as object),
      }),
    });
    const onOpenChange = vi.fn();
    renderWithProviders(<Harness onOpenChange={onOpenChange} lessonId="l-5ott" />);
    expect(screen.getByRole("heading", { name: "Modifica lezione" })).toBeInTheDocument();
    const topic = await within(dialog()).findByRole("textbox", { name: /Argomento/ });
    expect(topic).toHaveValue("moto rettilineo uniforme");
    expect(within(dialog()).getByRole("textbox", { name: "Note (solo per te)" })).toHaveValue(
      "esercizi 4–9",
    );
    await userEvent.clear(topic);
    await userEvent.type(topic, "moto uniformemente accelerato");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Salva lezione" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const patches = requests.filter((r) => r.method === "PATCH");
    expect(patches[0]?.body).toEqual({ topic: "moto uniformemente accelerato" });

    await userEvent.click(await screen.findByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(requests.filter((r) => r.method === "PATCH")).toHaveLength(2));
    expect(requests.filter((r) => r.method === "PATCH")[1]?.body).toEqual({
      topic: "moto rettilineo uniforme",
    });
  });

  it("a lesson deleted elsewhere: says so instead of the form", async () => {
    mockApi({ ...BASE_ROUTES, "GET /lessons/gone": problem(404, "Lezione non trovata.") });
    renderWithProviders(<LessonFormDialog isOpen onOpenChange={() => undefined} lessonId="gone" />);
    expect(
      await screen.findByText(
        "Questa riga non c'è più: forse è stata eliminata da un'altra finestra.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chiudi" })).toBeInTheDocument();
  });

  it("[Elimina] asks with the effect on the balance, deletes and offers to undo", async () => {
    const original = lesson();
    const requests = mockApi({
      ...BASE_ROUTES,
      "GET /lessons/l-5ott": original,
      "DELETE /lessons/l-5ott": new Response(null, { status: 204 }),
      "POST /lessons": lesson({ id: "recreated" }),
    });
    const onOpenChange = vi.fn();
    renderWithProviders(<Harness onOpenChange={onOpenChange} lessonId="l-5ott" />);
    await screen.findByRole("textbox", { name: /Argomento/ });
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));

    const confirm = await screen.findByRole("alertdialog", {
      name: "Eliminare la lezione di lun 5 ott?",
    });
    expect(
      await within(confirm).findByText(
        /Il saldo passa da deve 67,00\s€ a deve 23,00\s€\. Resta traccia nello storico modifiche\./,
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina lezione" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(requests.some((r) => r.method === "DELETE" && r.path === "/lessons/l-5ott")).toBe(true);
    expect(await screen.findByText("Lezione eliminata")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({
        student_id: "giulia",
        date: "2026-10-05",
        hourly_rate_cents: 2200,
        notes: "esercizi 4–9",
      }),
    );
  });
});
