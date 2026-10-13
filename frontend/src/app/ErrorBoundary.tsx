import { Component, type ErrorInfo, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { errorMessage } from "@/lib/api/problem";

function ErrorPage({ title, detail }: { title: string; detail: string }) {
  return (
    <main id="main">
      <h1>{title}</h1>
      <p>{detail}</p>
      <p>
        <button type="button" onClick={() => window.location.reload()}>
          Ricarica la pagina
        </button>{" "}
        <a href="/oggi">Torna a Oggi</a>
      </p>
    </main>
  );
}

/** Last line of defence outside the router (providers, auth start-up). */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Only the component stack and the error type: messages may contain user data.
    console.error("Errore non gestito nell'interfaccia", {
      name: error instanceof Error ? error.name : typeof error,
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <ErrorPage
          title="Qualcosa è andato storto"
          detail="Si è verificato un errore imprevisto. Ricarica la pagina; i dati salvati non sono persi."
        />
      );
    }
    return this.props.children;
  }
}

/** errorElement of the root route: render errors and failed lazy route chunks. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <ErrorPage
        title="Pagina non trovata"
        detail="L'indirizzo non corrisponde a nessuna pagina."
      />
    );
  }
  // A deploy replaced the JS chunks while the tab was open: a reload fetches the new ones.
  if (error instanceof TypeError && /dynamically imported module|import/i.test(error.message)) {
    return (
      <ErrorPage
        title="È disponibile una nuova versione"
        detail="RipetiFlow è stato aggiornato. Ricarica la pagina per continuare."
      />
    );
  }
  return <ErrorPage title="Qualcosa è andato storto" detail={errorMessage(error)} />;
}
