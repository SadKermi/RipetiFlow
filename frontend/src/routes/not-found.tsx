import { useAuth } from "@/app/auth";
import { usePageTitle } from "@/app/page";
import { LinkButton } from "@/components/Button";
import { PageMessage } from "@/components/States";
import { Wordmark } from "@/components/shell/Wordmark";

// Unknown address (03 §10.3): «Pagina non trovata», one sentence, one ink link back — to Oggi when
// signed in, to the landing otherwise. No illustrations, no error codes.
export function Component() {
  usePageTitle("Pagina non trovata");
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto max-w-page px-gutter pt-3">
        <Wordmark to={signedIn ? "/oggi" : "/"} />
      </header>
      <main id="main" className="mx-auto max-w-page px-gutter">
        <PageMessage
          title="Pagina non trovata"
          action={
            signedIn ? (
              <LinkButton to="/oggi" variant="ink">
                Vai a Oggi
              </LinkButton>
            ) : (
              <LinkButton to="/" variant="ink">
                Torna alla home
              </LinkButton>
            )
          }
        >
          Questo indirizzo non corrisponde a nessuna pagina del registro.
        </PageMessage>
      </main>
    </div>
  );
}
