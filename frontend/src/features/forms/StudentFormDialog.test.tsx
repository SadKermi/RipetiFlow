import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteStudentDialog } from "./confirmations";
import { StudentFormDialog, type StudentFormDialogProps } from "./StudentFormDialog";
import { NOW, SUBJECTS, giulia, mockApi, problem, renderWithProviders } from "./test-utils";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function Harness(props: Omit<StudentFormDialogProps, "isOpen" | "onOpenChange">) {
  const [open, setOpen] = useState(true);
  return <StudentFormDialog {...props} isOpen={open} onOpenChange={setOpen} />;
}

describe("StudentFormDialog", () => {
  it("creates a student with the profile's default rate and opens the page", async () => {
    const created = giulia({
      id: "new",
      first_name: "Giovanni",
      last_name: "Rossi",
      display_name: "Giovanni Rossi",
    });
    const requests = mockApi({ "GET /subjects": { items: SUBJECTS }, "POST /students": created });
    const { router } = renderWithProviders(<Harness initialName="Giovanni Rossi" />, {
      path: "/studenti",
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Nuovo studente" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox", { name: "Nome" })[0]!).toHaveValue("Giovanni");
    expect(within(dialog).getByRole("textbox", { name: "Cognome" })).toHaveValue("Rossi");
    expect(within(dialog).getByRole("textbox", { name: /Tariffa oraria/ })).toHaveValue("20,00");
    const guardian = within(dialog).getByRole("group", { name: "Genitore o referente" });
    await userEvent.type(
      within(guardian).getByRole("textbox", { name: "Telefono" }),
      "347 512 0896",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva studente" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/studenti/new"));
    expect(requests.find((r) => r.method === "POST")?.body).toEqual({
      first_name: "Giovanni",
      last_name: "Rossi",
      grade: null,
      school: null,
      phone: null,
      email: null,
      guardian_name: null,
      guardian_phone: "347 512 0896",
      guardian_email: null,
      notes: null,
      default_subject_id: null,
      hourly_rate_cents: 2000,
      rate_effective_from: "2026-10-06",
    });
    expect(await screen.findByText("Scheda di Giovanni Rossi creata")).toBeInTheDocument();
  });

  it("requires the first name locally and shows server errors on the fields", async () => {
    const requests = mockApi({
      "GET /subjects": { items: SUBJECTS },
      "POST /students": problem(422, "Dati non validi", [
        { field: "email", message: "Deve essere un testo." },
      ]),
    });
    renderWithProviders(<Harness />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva studente" }));
    expect(await within(dialog).findByText("Scrivi il nome.")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getAllByRole("textbox", { name: "Nome" })[0]!).toHaveFocus(),
    );
    expect(requests.some((r) => r.method === "POST")).toBe(false);

    await userEvent.type(within(dialog).getAllByRole("textbox", { name: "Nome" })[0]!, "Sara");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva studente" }));
    expect(await within(dialog).findByText("Deve essere un testo.")).toBeInTheDocument();
    const student = within(dialog).getByRole("group", { name: "Studente" });
    expect(within(student).getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("edits without the rate and sends only the changes", async () => {
    const requests = mockApi({
      "GET /subjects": { items: SUBJECTS },
      "GET /students/giulia": giulia(),
      "PATCH /students/giulia": giulia({ grade: "4ª liceo scientifico" }),
    });
    renderWithProviders(<Harness studentId="giulia" />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Modifica dati" })).toBeInTheDocument();
    const grade = await within(dialog).findByRole("textbox", { name: "Classe" });
    expect(
      within(dialog).queryByRole("textbox", { name: /Tariffa oraria/ }),
    ).not.toBeInTheDocument();
    await userEvent.clear(grade);
    await userEvent.type(grade, "4ª liceo scientifico");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva studente" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PATCH")).toBe(true));
    expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({
      grade: "4ª liceo scientifico",
    });
  });
});

describe("DeleteStudentDialog", () => {
  it("a student with lessons answers 409: the server's text and [Archivia]", async () => {
    mockApi({
      "DELETE /students/giulia": problem(
        409,
        "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.",
      ),
    });
    const onArchive = vi.fn();
    const onDeleted = vi.fn();
    function DeleteHarness() {
      const [open, setOpen] = useState(true);
      return (
        <DeleteStudentDialog
          student={giulia()}
          isOpen={open}
          onOpenChange={setOpen}
          onDeleted={onDeleted}
          onArchive={onArchive}
        />
      );
    }
    renderWithProviders(<DeleteHarness />);
    const dialog = screen.getByRole("alertdialog", { name: "Eliminare Giulia Ferri?" });
    expect(
      within(dialog).getByText(
        "Si può solo se non ha lezioni né pagamenti; altrimenti archivialo.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina studente" }));
    expect(
      await within(dialog).findByText(
        "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.",
      ),
    ).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Archivia" }));
    expect(onArchive).toHaveBeenCalledOnce();
  });
});
