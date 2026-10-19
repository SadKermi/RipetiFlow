import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuthStore } from "@/app/auth/store";
import {
  PROFILE,
  SUBJECTS,
  demoStore,
  json,
  problem,
  renderRoutes,
  stubApi,
  type ApiRoutes,
} from "@/features/landing/testing";
import type { Subject } from "@/lib/api/types";
import { SettingsPage } from "./SettingsPage";
import { THEME_STORAGE_KEY } from "./theme";

function renderSettings(routes: ApiRoutes = {}, store: AuthStore = demoStore()) {
  const calls = stubApi({
    "GET /me": PROFILE,
    "GET /subjects": { items: SUBJECTS },
    ...routes,
  });
  const view = renderRoutes([{ path: "/impostazioni", element: <SettingsPage /> }], {
    path: "/impostazioni",
    store,
  });
  return { calls, ...view };
}

const writes = (calls: ReturnType<typeof stubApi>) =>
  calls
    .filter((call) => call.method !== "GET")
    .map(({ method, path, search, body }) => ({
      method,
      path,
      search,
      body,
    }));

describe("Impostazioni · Profilo (03 §8)", () => {
  it("shows the profile; «Salva profilo» appears only with changes and sends only them", async () => {
    const { calls } = renderSettings({
      "PATCH /me": (_request, body) => json({ ...PROFILE, ...(body as object) }),
    });
    const name = await screen.findByRole("textbox", { name: "Nome e cognome" });
    expect(name).toHaveValue("Daniele Marchi");
    expect(screen.getByText("d.marchi@esempio.it")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Salva profilo" })).not.toBeInTheDocument();

    await userEvent.clear(name);
    await userEvent.type(name, "Daniele M.");
    await userEvent.click(screen.getByRole("button", { name: "Salva profilo" }));

    expect(await screen.findByText("Salvato")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Salva profilo" })).not.toBeInTheDocument();
    expect(writes(calls)).toEqual([
      { method: "PATCH", path: "/me", search: "", body: { full_name: "Daniele M." } },
    ]);
  });

  it("an empty name clears it, a server error lands on its field", async () => {
    const { calls } = renderSettings({
      "PATCH /me": problem(422, "Dati non validi.", [
        { field: "full_name", message: "Al massimo 120 caratteri." },
      ]),
    });
    const name = await screen.findByRole("textbox", { name: "Nome e cognome" });
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole("button", { name: "Salva profilo" }));
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining("Al massimo 120 caratteri.") as string,
    );
    expect(name).toHaveFocus();
    expect(writes(calls)[0]?.body).toEqual({ full_name: null });
  });

  it("an unreadable default rate is stopped before sending", async () => {
    const { calls } = renderSettings();
    const rate = await screen.findByRole("textbox", { name: /Tariffa predefinita/ });
    expect(rate).toHaveValue("20,00");
    await userEvent.clear(rate);
    await userEvent.type(rate, "venti");
    await userEvent.click(screen.getByRole("button", { name: "Salva profilo" }));
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(writes(calls)).toEqual([]);
  });

  it("a section that fails shows its own band, the others still work", async () => {
    renderSettings({ "GET /me": problem(500, "Errore interno.") });
    expect(await screen.findByText("Non riesco a caricare i dati.")).toBeVisible();
    expect(await screen.findByText("Matematica")).toBeVisible();
  });
});

describe("Impostazioni · Materie (03 §8)", () => {
  it("lists the active subjects in menu order, the archived ones apart", async () => {
    renderSettings();
    const list = await screen.findByRole("list", { name: "Materie, nell'ordine del menu" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Matematica", "Fisica", "Latino"]);
    const archived = screen.getByRole("button", { name: "Archiviate (1)" });
    expect(screen.getByText("Chimica")).not.toBeVisible();
    await userEvent.click(archived);
    expect(screen.getByText("Chimica")).toBeVisible();
  });

  it("adds a subject; a duplicate name is an error on the field", async () => {
    let created = false;
    const { calls } = renderSettings({
      "POST /subjects": (_request, body) => {
        if (created) {
          return problem(409, "Esiste già una materia con questo nome.", [
            { field: "name", message: "Esiste già una materia con questo nome." },
          ]);
        }
        created = true;
        return json(
          { id: "s-sto", name: (body as { name: string }).name, position: 5, archived: false },
          201,
        );
      },
    });
    const field = await screen.findByRole("textbox", { name: "Nuova materia" });
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(field).toHaveAccessibleDescription("Scrivi il nome della materia.");

    await userEvent.type(field, "  Storia ");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(field).toHaveValue(""));

    await userEvent.type(field, "storia");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() =>
      expect(field).toHaveAccessibleDescription("Esiste già una materia con questo nome."),
    );
    expect(writes(calls).map((call) => call.body)).toEqual([
      { name: "Storia" },
      { name: "storia" },
    ]);
  });

  it("Invio pressed again while a subject is being added does not send it twice", async () => {
    let release!: () => void;
    const answered = new Promise<void>((done) => {
      release = done;
    });
    const { calls } = renderSettings({
      "POST /subjects": async (_request, body) => {
        await answered;
        return json(
          { id: "s-sto", name: (body as { name: string }).name, position: 5, archived: false },
          201,
        );
      },
    });
    const field = await screen.findByRole("textbox", { name: "Nuova materia" });
    await userEvent.type(field, "Storia{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Aggiungi" })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    await userEvent.type(field, "{Enter}");
    release();
    await waitFor(() => expect(field).toHaveValue(""));
    expect(writes(calls)).toHaveLength(1);
    expect(field).not.toHaveAccessibleDescription(/Esiste già/);
  });

  it("renames in line: Invio saves, Esc cancels", async () => {
    const { calls } = renderSettings({
      "PATCH /subjects/s-fis": (_request, body) =>
        json({ ...SUBJECTS[1], ...(body as Partial<Subject>) }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Azioni per «Fisica»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rinomina" }));
    const field = screen.getByRole("textbox", { name: "Nuovo nome di «Fisica»" });
    expect(field).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Nuovo nome di «Fisica»" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Azioni per «Fisica»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rinomina" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Nuovo nome di «Fisica»" }));
    await userEvent.keyboard("Fisica 2{Enter}");
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Nuovo nome di «Fisica»" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /^Riordina «Fisica»/ })).toHaveFocus();
    expect(writes(calls)).toEqual([
      { method: "PATCH", path: "/subjects/s-fis", search: "", body: { name: "Fisica 2" } },
    ]);
  });

  it("Invio pressed again while a rename is being saved sends it once", async () => {
    let release!: () => void;
    const answered = new Promise<void>((done) => {
      release = done;
    });
    const { calls } = renderSettings({
      "PATCH /subjects/s-fis": async (_request, body) => {
        await answered;
        return json({ ...SUBJECTS[1], ...(body as Partial<Subject>) });
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Azioni per «Fisica»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rinomina" }));
    const field = screen.getByRole("textbox", { name: "Nuovo nome di «Fisica»" });
    await userEvent.clear(field);
    await userEvent.keyboard("Fisica 2{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salva" })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    await userEvent.keyboard("{Enter}");
    release();
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Nuovo nome di «Fisica»" })).toBeNull(),
    );
    expect(writes(calls)).toHaveLength(1);
  });

  it("reorders from the menu and with Alt + arrows on the handle", async () => {
    // A server that remembers the positions, so the refetch after each move agrees.
    let list = SUBJECTS.map((subject) => ({ ...subject }));
    const patch = (id: string) => (_request: Request, body: unknown) => {
      list = list.map((subject) =>
        subject.id === id ? { ...subject, ...(body as Partial<Subject>) } : subject,
      );
      return json(list.find((subject) => subject.id === id));
    };
    const { calls } = renderSettings({
      "GET /subjects": () => json({ items: [...list].sort((a, b) => a.position - b.position) }),
      "PATCH /subjects/s-mat": patch("s-mat"),
      "PATCH /subjects/s-fis": patch("s-fis"),
      "PATCH /subjects/s-lat": patch("s-lat"),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Azioni per «Matematica»" }));
    expect(screen.getByRole("menuitem", { name: "Sposta su" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Sposta giù" }));
    await waitFor(() =>
      expect(writes(calls)).toEqual([
        { method: "PATCH", path: "/subjects/s-fis", search: "", body: { position: 1 } },
        { method: "PATCH", path: "/subjects/s-mat", search: "", body: { position: 2 } },
      ]),
    );
    expect(screen.getByText("«Matematica» spostata in posizione 2 di 3.")).toBeInTheDocument();
    const list1 = screen.getByRole("list", { name: "Materie, nell'ordine del menu" });
    await waitFor(() =>
      expect(
        within(list1)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Fisica", "Matematica", "Latino"]),
    );

    const handle = screen.getByRole("button", { name: /^Riordina «Latino»/ });
    handle.focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await waitFor(() => expect(writes(calls)).toHaveLength(4));
    expect(writes(calls).slice(2)).toEqual([
      { method: "PATCH", path: "/subjects/s-lat", search: "", body: { position: 2 } },
      { method: "PATCH", path: "/subjects/s-mat", search: "", body: { position: 3 } },
    ]);
    // The focus stays on the moved row's handle.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Riordina «Latino», posizione 2/ })).toHaveFocus(),
    );
  });

  it("archiving moves the focus to the neighbouring row", async () => {
    let list = SUBJECTS.map((subject) => ({ ...subject }));
    renderSettings({
      "GET /subjects": () => json({ items: list }),
      "PATCH /subjects/s-lat": (_request, body) => {
        list = list.map((subject) =>
          subject.id === "s-lat" ? { ...subject, ...(body as Partial<Subject>) } : subject,
        );
        return json(list.find((subject) => subject.id === "s-lat"));
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Azioni per «Latino»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archivia" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Riordina «Fisica»/ })).toHaveFocus(),
    );
    expect(screen.getByText("«Latino» archiviata.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archiviate (2)" })).toBeVisible();
  });

  it("archives and restores; deleting asks first and says what happens", async () => {
    const { calls } = renderSettings({
      "PATCH /subjects/s-lat": (_r, body) => json({ ...SUBJECTS[2], ...(body as object) }),
      "PATCH /subjects/s-chi": (_r, body) => json({ ...SUBJECTS[3], ...(body as object) }),
      "DELETE /subjects/s-fis": () => new Response(null, { status: 204 }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Azioni per «Latino»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archivia" }));
    await userEvent.click(screen.getByRole("button", { name: "Archiviate (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Ripristina «Chimica»" }));

    await userEvent.click(screen.getByRole("button", { name: "Azioni per «Fisica»" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Elimina" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Eliminare «Fisica»?" });
    expect(
      within(dialog).getByText(
        "Le lezioni con questa materia restano, senza materia. Per toglierla solo dal menu, archiviala.",
      ),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina materia" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    expect(writes(calls)).toEqual([
      { method: "PATCH", path: "/subjects/s-lat", search: "", body: { archived: true } },
      { method: "PATCH", path: "/subjects/s-chi", search: "", body: { archived: false } },
      { method: "DELETE", path: "/subjects/s-fis", search: "", body: undefined },
    ]);
  });
});

describe("Impostazioni · Aspetto, Esporta, demo, Esci (03 §8)", () => {
  it("applies the theme to <html> and remembers it", async () => {
    renderSettings();
    const dark = await screen.findByRole("radio", { name: "Scuro" });
    expect(screen.getByRole("radio", { name: "Sistema" })).toBeChecked();
    await userEvent.click(dark);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await userEvent.click(screen.getByRole("radio", { name: "Sistema" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("downloads the whole ledger as CSV; a failure is a note under the button", async () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    let fail = false;
    renderSettings({
      "GET /export/ledger.csv": () =>
        fail
          ? problem(500, "Errore interno.")
          : new Response("Data;Tipo\n", {
              headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": 'attachment; filename="registro.csv"',
              },
            }),
    });
    const button = await screen.findByRole("button", { name: "Scarica tutto il registro (CSV)" });
    await userEvent.click(button);
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    fail = true;
    await userEvent.click(button);
    expect(await screen.findByText("Errore interno.")).toBeVisible();
  });

  it("demo tutor: recreates the sample data after a confirmation", async () => {
    const store = demoStore({
      login: () => Promise.resolve(json({ students: 6, lessons: 91, payments: 18 })),
    });
    renderSettings({}, store);
    await userEvent.click(await screen.findByRole("button", { name: "Ricrea i dati di esempio" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ricreare i dati di esempio?" });
    expect(
      within(dialog).getByText("Cancella e ricrea studenti, lezioni e pagamenti di esempio."),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ricrea i dati" }));
    expect(
      await screen.findByText("Dati demo ricreati: 6 studenti, 91 lezioni, 18 pagamenti."),
    ).toBeVisible();
  });

  it("has no account deletion (the API does not offer it)", async () => {
    renderSettings();
    await screen.findByRole("heading", { name: "Impostazioni" });
    expect(screen.queryByRole("button", { name: /Elimina account/ })).not.toBeInTheDocument();
  });

  it("«Esci» closes the session and goes back to the landing", async () => {
    const store = demoStore();
    const { router } = renderSettings({}, store);
    await userEvent.click(await screen.findByRole("button", { name: "Esci" }));
    await waitFor(() => expect(store.getSnapshot().status).toBe("signedOut"));
    expect(router.state.location.pathname).toBe("/");
  });
});
