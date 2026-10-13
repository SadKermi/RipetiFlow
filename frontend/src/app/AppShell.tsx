import { NavLink, Outlet } from "react-router";
import { useAuth } from "./auth";

// Placeholder shell (plain semantic HTML): the real navigation comes with the design system
// (docs/design/03-schermate.md). Student-first sections only, no global lessons/payments (D-20).
const SECTIONS = [
  { to: "/oggi", label: "Oggi" },
  { to: "/studenti", label: "Studenti" },
  { to: "/agenda", label: "Agenda" },
  { to: "/impostazioni", label: "Impostazioni" },
] as const;

export function AppShell() {
  const { user, signOut } = useAuth();
  return (
    <>
      <a href="#main">Salta al contenuto</a>
      <header>
        <p>
          <strong>RipetiFlow</strong>
          {user?.mode === "demo" ? " · modalità demo" : null}
        </p>
        <nav aria-label="Sezioni">
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.to}>
                <NavLink to={section.to}>{section.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" onClick={() => void signOut()}>
          Esci
        </button>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
