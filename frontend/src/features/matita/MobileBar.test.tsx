import { act, screen, waitFor, within } from "@testing-library/react";
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
import { MobileBar } from "./MobileBar";
import { resetMatitaStores } from "./store";
import { MATITA_CONFIG, lessonDraft, reply, savedLesson } from "./test-helpers";

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

const line = () => screen.getByRole("textbox", { name: "Scrivi a Matita" });

describe("MobileBar (03 §9.1)", () => {
  it("«+» opens the lesson form; with text it becomes «Invia», which proposes", async () => {
    const requests = mockApi({
      ...ROUTES,
      "POST /assistant/messages": reply({ drafts: [lessonDraft()] }),
      "POST /lessons": savedLesson(),
    });
    renderWithProviders(<MobileBar />, { config: MATITA_CONFIG, path: "/oggi" });
    expect(line()).toHaveAttribute("placeholder", "Scrivi a Matita…");
    await userEvent.click(screen.getByRole("button", { name: "Nuova lezione con il modulo" }));
    expect(await screen.findByRole("heading", { name: "Nuova lezione" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.type(line(), "oggi 13-14 chimica con sara, stechiometria");
    expect(screen.queryByRole("button", { name: "Nuova lezione con il modulo" })).toBeNull();
    expect(screen.queryByText("Invio per proporre · Esc per annullare")).toBeNull(); // no Esc here
    await userEvent.click(screen.getByRole("button", { name: "Invia" }));

    // The proposal opens in the panel above the bar, focused, ready for one tap.
    const panel = await screen.findByRole("region", { name: "Matita" });
    const card = within(panel).getByRole("group", { name: /Matita propone/ });
    await waitFor(() => expect(card).toHaveFocus());
    await userEvent.click(within(card).getByRole("button", { name: /^Ripassa a penna/ }));
    expect(
      await screen.findByText("Lezione di Sara Conti registrata · nel saldo"),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.path === "/lessons")?.headers.get("X-RipetiFlow-Source")).toBe(
      "assistant",
    );
  });

  it("«Chiudi Matita» clears the panel and goes back to the line", async () => {
    mockApi({ ...ROUTES, "POST /assistant/messages": reply({ reply: "Sara è in pari." }) });
    renderWithProviders(<MobileBar />, { config: MATITA_CONFIG, path: "/oggi" });
    await userEvent.type(line(), "quanto mi deve Sara?{Enter}");
    const panel = await screen.findByRole("region", { name: "Matita" });
    expect(within(panel).getByText("Sara è in pari.")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Chiudi Matita" }));
    expect(screen.queryByRole("region", { name: "Matita" })).not.toBeInTheDocument();
    expect(line()).toHaveFocus();
  });

  it("starts over when the page changes", async () => {
    mockApi({ ...ROUTES, "POST /assistant/messages": reply({ drafts: [lessonDraft()] }) });
    const { router } = renderWithProviders(<MobileBar />, {
      config: MATITA_CONFIG,
      path: "/oggi",
    });
    await userEvent.type(line(), "oggi 13-14 chimica con sara{Enter}");
    expect(await screen.findByRole("region", { name: "Matita" })).toBeInTheDocument();
    await act(() => router.navigate("/agenda"));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Matita" })).not.toBeInTheDocument(),
    );
  });

  it("without Matita the bar keeps only the «+»", () => {
    mockApi(ROUTES);
    renderWithProviders(<MobileBar />, { config: TEST_CONFIG, path: "/oggi" });
    expect(screen.queryByRole("textbox", { name: "Scrivi a Matita" })).toBeNull();
    expect(screen.getByRole("button", { name: "Nuova lezione con il modulo" })).toBeInTheDocument();
  });
});
