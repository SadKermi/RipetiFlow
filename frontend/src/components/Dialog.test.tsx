import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { Button } from "./Button";
import { ConfirmDialog, Sheet, SheetActions } from "./Dialog";
import { FormNote } from "./Field";

function LessonSheet({ dirty = false, note }: { dirty?: boolean; note?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>Nuova lezione</Button>
      <Sheet
        isOpen={open}
        onOpenChange={setOpen}
        title="Nuova lezione"
        isDirty={dirty}
        note={note ? <FormNote>{note}</FormNote> : null}
        actions={({ close }) => (
          <SheetActions>
            <Button onPress={close}>Annulla</Button>
            <Button variant="ink" type="submit">
              Salva lezione
            </Button>
          </SheetActions>
        )}
      >
        <label>
          Argomento
          <input />
        </label>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("is a modal dialog titled by its heading; Esc closes it and focus returns", async () => {
    render(<LessonSheet />);
    const opener = screen.getByRole("button", { name: "Nuova lezione" });
    await userEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Nuova lezione" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("asks «Scartare le modifiche?» before closing with unsaved changes", async () => {
    render(<LessonSheet dirty />);
    await userEvent.click(screen.getByRole("button", { name: "Nuova lezione" }));
    await userEvent.click(await screen.findByRole("button", { name: "Annulla" }));
    expect(screen.getByText("Scartare le modifiche?")).toBeInTheDocument();
    const keepEditing = screen.getByRole("button", { name: "Continua a modificare" });
    expect(keepEditing).toHaveFocus();
    await userEvent.click(keepEditing);
    expect(screen.getByRole("button", { name: "Salva lezione" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Scarta modifiche" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the server's note above the action bar", async () => {
    render(
      <LessonSheet note="Sei offline: niente è stato salvato. Riprova quando torna la rete." />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nuova lezione" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sei offline: niente è stato salvato.",
    );
  });
});

function DeleteLesson({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      isOpen={open}
      onOpenChange={setOpen}
      title="Eliminare la lezione di lun 5 ott?"
      effect="Il saldo passa da deve 67,00 € a deve 23,00 €. Resta traccia nello storico modifiche."
      confirmLabel="Elimina lezione"
      onConfirm={onConfirm}
      recovery={() => <Button>Archivia</Button>}
    />
  );
}

describe("ConfirmDialog", () => {
  it("says the effect with real numbers; [Annulla] and the danger verb", async () => {
    render(<DeleteLesson onConfirm={() => Promise.resolve()} />);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Eliminare la lezione di lun 5 ott?",
    });
    expect(dialog).toHaveTextContent("Il saldo passa da deve 67,00 € a deve 23,00 €.");
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina lezione" }).className).toContain(
      "text-debito",
    );
  });

  it("closes after the action succeeds", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    render(<DeleteLesson onConfirm={onConfirm} />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina lezione" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("stays open with the server's text (and the way out) when the action fails", async () => {
    const conflict = ApiProblem.fromBody(409, {
      code: "conflict",
      detail: "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.",
    });
    render(<DeleteLesson onConfirm={() => Promise.reject(conflict)} />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina lezione" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lo studente ha lezioni o pagamenti registrati: archivialo invece di eliminarlo.",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivia" })).toBeInTheDocument();
  });
});
