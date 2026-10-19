import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOW,
  SUBJECTS,
  TEST_CONFIG,
  mockApi,
  renderWithProviders,
  summary,
} from "@/features/forms/test-utils";
import { MATITA_SLOTS } from ".";
import { resetMatitaStores } from "./store";
import { MATITA_CONFIG, lessonDraft, reply, savedLesson } from "./test-helpers";
import { TodayLine } from "./TodayLine";
import { TopBarButton } from "./TopBarButton";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  resetMatitaStores();
});

const ROUTES = {
  "GET /students": { items: [summary("sara", "Sara Conti", 0)] },
  "GET /subjects": { items: SUBJECTS },
};

describe("TopBarButton and Cmd/Ctrl K (03 §9.2)", () => {
  it("is absent, with no shortcut, when Matita is not available", async () => {
    mockApi(ROUTES);
    renderWithProviders(<TopBarButton />, { config: TEST_CONFIG, path: "/agenda" });
    expect(screen.queryByRole("button", { name: /Matita/ })).toBeNull();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("where the page has no line, opens the dialog on the line with the last phrases", async () => {
    window.localStorage.setItem(
      "rf.matita.recenti.u1",
      JSON.stringify(["quanto mi deve Giulia?", "ieri 15–16:30 matematica con Luca"]),
    );
    mockApi(ROUTES);
    renderWithProviders(<TopBarButton />, { config: MATITA_CONFIG, path: "/agenda" });
    expect(screen.getByRole("button", { name: /Matita/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+K Control+K",
    );
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Matita" });
    const input = within(dialog).getByRole("textbox", { name: "Scrivi a Matita" });
    await waitFor(() => expect(input).toHaveFocus());

    await userEvent.tab(); // the «+» of the line
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "quanto mi deve Giulia?" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveValue("quanto mi deve Giulia?");
    expect(input).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("where the page has its line (Oggi, the ledger), focuses it instead", async () => {
    mockApi(ROUTES);
    renderWithProviders(
      <>
        <TopBarButton />
        <TodayLine />
      </>,
      { config: MATITA_CONFIG, path: "/oggi" },
    );
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("textbox", { name: "Scrivi a Matita" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The button does the same.
    screen.getByRole("textbox", { name: "Scrivi a Matita" }).blur();
    await userEvent.click(screen.getByRole("button", { name: /Matita/ }));
    expect(screen.getByRole("textbox", { name: "Scrivi a Matita" })).toHaveFocus();
  });

  it("in the dialog, «Ripassa a penna» saves and closes", async () => {
    const requests = mockApi({
      ...ROUTES,
      "POST /assistant/messages": reply({ drafts: [lessonDraft()] }),
      "POST /lessons": savedLesson(),
    });
    renderWithProviders(<TopBarButton />, { config: MATITA_CONFIG, path: "/studenti" });
    await userEvent.click(screen.getByRole("button", { name: /Matita/ }));
    const dialog = await screen.findByRole("dialog", { name: "Matita" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Scrivi a Matita" }),
      "oggi 13-14 chimica con sara{Enter}",
    );
    const card = await within(dialog).findByRole("group", { name: /Matita propone/ });
    await userEvent.click(within(card).getByRole("button", { name: /^Ripassa a penna/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      await screen.findByText("Lezione di Sara Conti registrata · nel saldo"),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.path === "/lessons")?.headers.get("X-RipetiFlow-Source")).toBe(
      "assistant",
    );
  });

  it("«Modifica» in the dialog closes it and opens the form; the draft waits in the dialog", async () => {
    mockApi({ ...ROUTES, "POST /assistant/messages": reply({ drafts: [lessonDraft()] }) });
    renderWithProviders(<TopBarButton />, { config: MATITA_CONFIG, path: "/studenti" });
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Matita" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Scrivi a Matita" }),
      "oggi 13-14 chimica con sara{Enter}",
    );
    await userEvent.click(await within(dialog).findByRole("button", { name: "Modifica" }));
    expect(await screen.findByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Matita" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.keyboard("{Control>}k{/Control}");
    const again = await screen.findByRole("dialog", { name: "Matita" });
    expect(within(again).getByRole("group", { name: /Matita propone/ })).toBeInTheDocument();
  });
});

describe("MATITA_SLOTS", () => {
  it("loads the slot components on demand", async () => {
    mockApi(ROUTES);
    const TopBar = MATITA_SLOTS.TopBarButton!;
    renderWithProviders(<TopBar />, { config: MATITA_CONFIG, path: "/agenda" });
    expect(await screen.findByRole("button", { name: /Matita/ })).toBeInTheDocument();
  });
});
