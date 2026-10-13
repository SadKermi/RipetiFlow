import { Link } from "react-router";
import { useAuth } from "@/app/auth";

// Placeholder for the public landing (D-22, docs/design/03-schermate.md).
export function Component() {
  const { status } = useAuth();
  return (
    <main id="main">
      <h1>RipetiFlow</h1>
      <p>
        Il registro delle ripetizioni: lezioni, pagamenti e saldo di ogni studente, giusti al
        centesimo.
      </p>
      <p>
        {status === "signedIn" ? (
          <Link to="/oggi">Vai a Oggi</Link>
        ) : (
          <Link to="/accedi">Accedi</Link>
        )}
      </p>
    </main>
  );
}
