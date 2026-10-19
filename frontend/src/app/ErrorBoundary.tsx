import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { buttonClasses } from "@/components/button-styles";
import { errorMessage } from "@/lib/api/problem";

/**
 * Full-page message outside the normal pages (02 §9.15): Literata title, one sentence, a way out.
 * Plain links and buttons on purpose: it may render outside the router and the providers.
 */
function ErrorPage({
  title,
  detail,
  reload = true,
}: {
  title: string;
  detail: string;
  reload?: boolean;
}) {
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-page bg-paper px-gutter py-10 text-ink">
      <a
        href="/oggi"
        className="inline-flex min-h-11 items-center font-display text-[1.375rem] font-medium text-ink no-underline"
      >
        Ripeti<i className="font-normal">Flow</i>
      </a>
      <section className="max-w-[36rem] py-10">
        <h1 className="m-0 font-display text-display-m font-normal text-balance">{title}</h1>
        <p className="mt-3 mb-0 text-body text-ink-2">{detail}</p>
        <p className="mt-6 mb-0 flex flex-wrap gap-2">
          {reload && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={buttonClasses({ variant: "ink" })}
            >
              <ArrowsClockwiseIcon size={20} aria-hidden />
              Ricarica la pagina
            </button>
          )}
          <a href="/oggi" className={buttonClasses({ variant: "line" })}>
            Torna a Oggi
          </a>
        </p>
      </section>
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
        detail="Questo indirizzo non corrisponde a nessuna pagina del registro."
        reload={false}
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
