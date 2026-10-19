import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { useFocusMainOnNavigation, usePageTitle } from "./page";

function Page({ title }: { title: string | null }) {
  usePageTitle(title);
  return (
    <>
      <Link to="/studenti">Studenti</Link>
      <Link to="/oggi?riga=1">Stessa pagina</Link>
    </>
  );
}

function Shell() {
  useFocusMainOnNavigation();
  return (
    <main id="main" tabIndex={-1}>
      <Routes>
        <Route path="/oggi" element={<Page title="Oggi" />} />
        <Route path="/studenti" element={<Page title="Studenti" />} />
        <Route path="/" element={<Page title={null} />} />
      </Routes>
    </main>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
}

describe("usePageTitle", () => {
  it("names the page before the app", () => {
    renderAt("/oggi");
    expect(document.title).toBe("Oggi · RipetiFlow");
  });

  it("uses the app name alone without a title", () => {
    renderAt("/");
    expect(document.title).toBe("RipetiFlow");
  });
});

describe("useFocusMainOnNavigation", () => {
  it("leaves focus alone on the first render", () => {
    renderAt("/oggi");
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to <main> after moving to another page", async () => {
    const user = userEvent.setup();
    renderAt("/oggi");
    await user.click(screen.getByRole("link", { name: "Studenti" }));
    expect(document.title).toBe("Studenti · RipetiFlow");
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("does not move focus when only the query changes", async () => {
    const user = userEvent.setup();
    renderAt("/oggi");
    const link = screen.getByRole("link", { name: "Stessa pagina" });
    await user.click(link);
    expect(document.activeElement).toBe(link);
  });
});
