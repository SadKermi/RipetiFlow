import { Link } from "react-router";

export function Component() {
  return (
    <main id="main">
      <h1>Pagina non trovata</h1>
      <p>L'indirizzo non corrisponde a nessuna pagina di RipetiFlow.</p>
      <p>
        <Link to="/">Torna all'inizio</Link>
      </p>
    </main>
  );
}
