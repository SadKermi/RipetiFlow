import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";
import { CONFIG, SUPABASE_CONFIG, demoStore, renderRoutes, stubApi } from "./testing";

function renderLanding(store = demoStore({ signedIn: false })) {
  stubApi({});
  return renderRoutes([{ path: "/", element: <LandingPage /> }], { path: "/", store });
}

describe("landing (03 §1)", () => {
  it("says what it does and invites to enter", async () => {
    renderLanding(demoStore({ signedIn: false, config: SUPABASE_CONFIG }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Segna la lezione appena finita. Il conto lo tiene il registro.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Per chi dà ripetizioni")).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: "Entra nel registro" });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/accedi");
    expect(screen.getByRole("link", { name: "Entra" })).toHaveAttribute("href", "/accedi");
    expect(
      await screen.findAllByText(
        "Entri con il tuo account Google o con un link via email, senza password.",
      ),
    ).toHaveLength(2);
  });

  it("shows the real ledger, annotated, and what it does not do", () => {
    renderLanding();
    expect(screen.getByRole("heading", { name: "Una pagina per studente" })).toBeInTheDocument();
    const ledger = screen.getByRole("list", {
      name: "Registro di Giulia Ferri (esempio con note)",
    });
    expect(within(ledger).getByText("moto rettilineo uniforme")).toBeInTheDocument();
    expect(within(ledger).getByText("deve 23 euro")).toBeInTheDocument();
    expect(screen.getByText("La lezione.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cosa non fa" })).toBeInTheDocument();
    expect(
      screen.getByText("Non manda messaggi al posto tuo: prepara il testo, lo invii tu."),
    ).toBeInTheDocument();
  });

  it("opens the questions one by one and never publishes the price", async () => {
    renderLanding();
    const question = screen.getByRole("button", { name: "E se sbaglio una riga?" });
    expect(question).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(question);
    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("La correggi o la elimini. Lo storico modifiche tiene traccia di tutto."),
    ).toBeVisible();
    expect(screen.queryByText(/Quanto costa/)).not.toBeInTheDocument();
  });

  it("shows Matita only when the server has it, and inks the card on request", async () => {
    renderLanding(demoStore({ signedIn: false, config: { ...CONFIG, assistant_available: true } }));
    expect(
      await screen.findByRole("heading", { name: "Matita scrive a matita. Tu ripassi a penna." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Matita" })).toHaveAttribute("href", "#matita");
    expect(screen.getByText("Matita propone")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ripassa a penna" }));
    expect(screen.getByText("Lezione registrata · nel saldo")).toHaveAttribute("role", "status");
    expect(screen.getByText("Lezione registrata · nel saldo")).toHaveFocus();
    expect(screen.getByText("Nel registro")).toBeInTheDocument();
  });

  it("without Matita the section is not there", async () => {
    renderLanding();
    expect(await screen.findAllByText("Entri senza password.")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: /Matita scrive/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Matita" })).not.toBeInTheDocument();
  });

  it("signed in: «Apri il registro» leads to Oggi", async () => {
    renderLanding(demoStore({ signedIn: true }));
    const links = await screen.findAllByRole("link", { name: "Apri il registro" });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute("href", "/oggi");
  });

  it("config unreachable: the page stays, the line says only «Entri senza password.»", async () => {
    renderLanding(demoStore({ signedIn: false, config: new Error("offline") }));
    expect(await screen.findAllByText("Entri senza password.")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Entra nel registro" })[0]).toHaveAttribute(
      "href",
      "/accedi",
    );
  });
});
