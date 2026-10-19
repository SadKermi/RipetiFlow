import { StudentIcon } from "@phosphor-icons/react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchSelect, Select, type SelectOption } from "./Select";

const SUBJECTS: SelectOption[] = [
  { id: "mat", label: "Matematica" },
  { id: "fis", label: "Fisica" },
];

const STUDENTS: SelectOption[] = [
  { id: "s1", label: "Marco Rossi", detail: "2ª liceo classico" },
  { id: "s2", label: "Giulia Ferri", detail: "3ª liceo scientifico" },
  { id: "s3", label: "Luca Bianchi", detail: "4ª liceo classico" },
];

function SubjectSelect({ onCreate }: { onCreate?: () => void }) {
  const [value, setValue] = useState<string | null>("mat");
  return (
    <>
      <Select
        label="Materia"
        options={SUBJECTS}
        value={value}
        onChange={setValue}
        emptyOption="Nessuna materia"
        createLabel="Nuova materia"
        onCreate={onCreate}
      />
      <output>{value ?? "nessuna"}</output>
    </>
  );
}

describe("Select", () => {
  it("shows the chosen subject and changes it", async () => {
    render(<SubjectSelect />);
    const trigger = screen.getByRole("button", { name: /Matematica/ });
    await userEvent.click(trigger);
    const listbox = await screen.findByRole("listbox");
    await userEvent.click(within(listbox).getByRole("option", { name: "Fisica" }));
    expect(screen.getByRole("status")).toHaveTextContent("fis");
  });

  it("«Nessuna materia» is a valid choice (null)", async () => {
    render(<SubjectSelect />);
    await userEvent.click(screen.getByRole("button", { name: /Matematica/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Nessuna materia" }));
    expect(screen.getByRole("status")).toHaveTextContent("nessuna");
  });

  it("the graphite «Nuova materia» runs onCreate and keeps the selection", async () => {
    const onCreate = vi.fn();
    render(<SubjectSelect onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: /Matematica/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Nuova materia" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("mat");
  });

  it("shows an error on the trigger", () => {
    render(
      <Select
        label="Materia"
        options={SUBJECTS}
        value={null}
        onChange={() => undefined}
        error="Materia non trovata."
      />,
    );
    expect(screen.getByText("Materia non trovata.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Materia/ })).toHaveAttribute(
      "data-rf-invalid",
      "true",
    );
  });
});

function StudentPicker({ onCreate }: { onCreate?: (query: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  return (
    <>
      <SearchSelect
        label="Studente"
        icon={StudentIcon}
        placeholder="Scegli lo studente"
        options={STUDENTS}
        value={value}
        onChange={setValue}
        query={query}
        onQueryChange={setQuery}
        createLabel="Nuovo studente"
        onCreate={onCreate}
      />
      <output>{value ?? "nessuno"}</output>
    </>
  );
}

describe("SearchSelect", () => {
  it("filters while typing and Enter takes the first match", async () => {
    render(<StudentPicker />);
    await userEvent.click(screen.getByRole("button", { name: /Scegli lo studente/ }));
    const search = await screen.findByRole("searchbox", { name: "Cerca per nome" });
    expect(search).toHaveFocus();
    await userEvent.type(search, "giu");
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByRole("option", { name: /Marco Rossi/ })).not.toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: /Giulia Ferri/ })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("s2");
  });

  it("offers «Nuovo studente» with what was typed", async () => {
    const onCreate = vi.fn();
    render(<StudentPicker onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: /Scegli lo studente/ }));
    await userEvent.type(await screen.findByRole("searchbox"), "Giovanni");
    await userEvent.click(screen.getByRole("option", { name: "Nuovo studente" }));
    expect(onCreate).toHaveBeenCalledWith("Giovanni");
    expect(screen.getByRole("status")).toHaveTextContent("nessuno");
  });
});

describe("SearchSelect on mobile", () => {
  it("opens a full-height sheet with the search on top", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("max-width"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    render(<StudentPicker />);
    await userEvent.click(screen.getByRole("button", { name: /Scegli lo studente/ }));
    const sheet = await screen.findByRole("dialog", { name: "Studente" });
    const search = within(sheet).getByRole("searchbox", { name: "Cerca per nome" });
    await userEvent.type(search, "luca");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("s3");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
