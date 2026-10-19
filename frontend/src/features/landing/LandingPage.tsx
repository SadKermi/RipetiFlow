// Public landing «/» (03 §1, D-22): in 10 seconds what it does, for whom and what it does NOT do;
// one invitation only: enter. Hierarchy: H1 → subtitle → CTA → the real ledger, annotated →
// Matita → what it does not do → questions → footer. No images above the fold, no carousel.
import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  Heading,
} from "react-aria-components";
import { useAuth } from "@/app/auth";
import { LinkButton, Wordmark, cx } from "@/components";
import { SkipLink } from "@/components/shell/Navigation";
import { AnnotatedLedger, HeroLedger, NoteMarker } from "./ExampleLedger";
import { MatitaDemo } from "./MatitaDemo";
import { signInLine } from "./signin";

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

/** «Entra nel registro» → /accedi; signed in: «Apri il registro» → /oggi (03 §1 «Stati»). */
function useEntry(): { to: string; short: string; long: string } {
  const { status } = useAuth();
  return status === "signedIn"
    ? { to: "/oggi", short: "Apri il registro", long: "Apri il registro" }
    : { to: "/accedi", short: "Entra", long: "Entra nel registro" };
}

function SectionTitle({ n, id, children }: { n: number; id: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 lg:col-span-12 lg:gap-0">
      <span
        aria-hidden
        className="shrink-0 font-money text-[0.8125rem] whitespace-nowrap text-ink-3 lg:w-[8.5rem]"
      >
        § {n}
      </span>
      <h2 id={id} className="m-0 font-display text-display-m font-normal text-balance text-ink">
        {children}
      </h2>
    </div>
  );
}

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <div className={cx(CONTAINER, "py-12 lg:py-20")}>
        <div className="border-t-2 border-ink pt-5 lg:pt-6">
          <SectionTitle n={n} id={`${id}-title`}>
            {title}
          </SectionTitle>
          <div className="mt-8 lg:mt-10 lg:pl-[8.5rem]">{children}</div>
        </div>
      </div>
    </section>
  );
}

const NOTES: readonly [string, string][] = [
  [
    "La lezione.",
    "Giorno, orario, materia e argomento. L'importo lo calcola dalla tariffa di quel giorno. Una lezione futura resta «programmata» ed entra nel saldo quando finisce.",
  ],
  [
    "Il pagamento.",
    "Contanti, bonifico o altro, anche in anticipo: il credito si legge anche in tempo («circa 2 h di lezione»).",
  ],
  ["Il saldo.", "In rosso se ti deve, in blu se è in credito. Nessun segno meno da interpretare."],
];

const NOT_DOING: readonly string[] = [
  "Non incassa pagamenti e non manda fatture: registri tu quello che hai ricevuto.",
  "Non legge il tuo Google Calendar: scrive le lezioni in un calendario a parte, «RipetiFlow», e se sposti un evento lì il registro non cambia.",
  "Non manda messaggi al posto tuo: prepara il testo, lo invii tu.",
];

// «Quanto costa?» is not published until the price is decided (03 §1).
const QUESTIONS: readonly [string, string][] = [
  [
    "I miei dati chi li vede?",
    "Solo tu: ogni riga è legata al tuo account. Puoi scaricare tutto in CSV da Impostazioni.",
  ],
  [
    "Posso cambiare la tariffa di uno studente?",
    "Sì, da una data in poi. Se la data è già passata scegli tu se ricalcolare le lezioni registrate da quel giorno; quelle con una tariffa scritta a mano non cambiano mai.",
  ],
  [
    "E se sbaglio una riga?",
    "La correggi o la elimini. Lo storico modifiche tiene traccia di tutto.",
  ],
  [
    "Funziona dal telefono?",
    "È pensato prima di tutto per il telefono: si registra una lezione in pochi tocchi.",
  ],
];

function Questions() {
  return (
    <DisclosureGroup allowsMultipleExpanded className="border-t border-rule-strong">
      {QUESTIONS.map(([question, answer]) => (
        <Disclosure key={question} className="border-b border-rule">
          <Heading level={3} className="m-0">
            <AriaButton
              slot="trigger"
              className="group flex min-h-14 w-full cursor-pointer items-center gap-3 py-3 text-left text-[1.0625rem] leading-6 font-medium text-ink data-hovered:text-ink-2"
            >
              <CaretRightIcon
                size={20}
                aria-hidden
                className="shrink-0 text-ink-3 transition-transform group-aria-expanded:rotate-90"
              />
              {question}
            </AriaButton>
          </Heading>
          <DisclosurePanel>
            <p className="m-0 max-w-[40rem] pb-5 pl-8 text-body text-ink-2">{answer}</p>
          </DisclosurePanel>
        </Disclosure>
      ))}
    </DisclosureGroup>
  );
}

function Cta({ className }: { className?: string }) {
  const { config } = useAuth();
  const entry = useEntry();
  return (
    <div className={className}>
      <LinkButton to={entry.to} variant="ink" className="w-full sm:w-auto">
        {entry.long}
      </LinkButton>
      <p className="mt-3 mb-0 text-[0.875rem] leading-5 text-ink-3">{signInLine(config)}</p>
    </div>
  );
}

export function LandingPage() {
  const { config } = useAuth();
  const entry = useEntry();
  const matita = config?.assistant_available === true;
  const nav: [string, string][] = [
    ["#come-funziona", "Come funziona"],
    ...(matita ? ([["#matita", "Matita"]] as [string, string][]) : []),
    ["#domande", "Domande"],
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <SkipLink />
      <header className="border-b border-rule">
        <div className={cx(CONTAINER, "flex h-16 items-center gap-8")}>
          <Wordmark to="/" />
          <nav aria-label="Pagina" className="ml-auto hidden lg:block">
            <ul className="m-0 flex list-none items-center gap-7 p-0">
              {nav.map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="inline-flex h-11 items-center text-[0.9375rem] font-medium text-ink-2 no-underline hover:text-ink"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <LinkButton to={entry.to} variant="line" className="max-lg:ml-auto">
            {entry.short}
          </LinkButton>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none focus-visible:shadow-none">
        <section aria-labelledby="landing-title">
          <div
            className={cx(
              CONTAINER,
              "grid gap-12 pt-10 pb-12 lg:grid-cols-12 lg:items-start lg:pt-20 lg:pb-16",
            )}
          >
            <div className="lg:col-span-6">
              <p className="m-0 text-caption text-ink-3 uppercase">Per chi dà ripetizioni</p>
              <h1
                id="landing-title"
                className="mt-4 mb-0 font-display text-display-xl font-normal text-balance text-ink"
              >
                Segna la lezione appena finita.{" "}
                <span className="marker">Il conto lo tiene il registro.</span>
              </h1>
              <p className="mt-6 mb-0 max-w-[34rem] text-[1.0625rem] leading-7 text-pretty text-ink-2">
                Un registro per ogni studente: lezioni, pagamenti (contanti, bonifico o altro) e un
                saldo che si aggiorna riga per riga. Sai sempre chi ti deve cosa e chi ha pagato in
                anticipo.
              </p>
              <Cta className="mt-8" />
            </div>
            <div className="hidden lg:col-span-6 lg:block">
              <HeroLedger />
            </div>
          </div>
        </section>

        <Section id="come-funziona" n={1} title="Una pagina per studente">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
            <AnnotatedLedger />
            <ol className="m-0 flex list-none flex-col gap-5 p-0">
              {NOTES.map(([title, text], index) => (
                <li key={title} className="flex gap-3">
                  <NoteMarker n={index + 1} className="mt-0.5" />
                  <p className="m-0 text-body text-ink-2">
                    <b className="font-semibold text-ink">{title}</b> {text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {matita && (
          <Section id="matita" n={2} title="Matita scrive a matita. Tu ripassi a penna.">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
              <p className="m-0 max-w-[34rem] text-[1.0625rem] leading-7 text-ink-2">
                Scrivi come scriveresti su un foglietto:{" "}
                <span className="font-display text-ink italic">
                  «ieri 15–16:30 matematica con Luca, equazioni di secondo grado»
                </span>
                . Matita prepara la riga e la lascia a matita: entra nel registro solo quando la
                confermi. Può anche risponderti («quanto mi deve Giulia?») e scrivere un promemoria
                che poi mandi tu, su WhatsApp o dove preferisci.
              </p>
              <MatitaDemo />
            </div>
          </Section>
        )}

        <Section id="cosa-non-fa" n={matita ? 3 : 2} title="Cosa non fa">
          <ul className="m-0 grid list-none gap-x-12 gap-y-4 p-0 lg:grid-cols-2">
            {NOT_DOING.map((text) => (
              <li key={text} className="flex gap-3 border-t border-rule pt-4 text-body text-ink-2">
                <span aria-hidden className="text-ink-3">
                  —
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="domande" n={matita ? 4 : 3} title="Domande">
          <Questions />
          <Cta className="mt-10" />
        </Section>
      </main>

      <footer className="border-t border-rule">
        <div
          className={cx(CONTAINER, "flex min-h-16 items-center py-4 text-[0.875rem] text-ink-3")}
        >
          <p className="m-0">RipetiFlow · © 2026</p>
        </div>
      </footer>
    </div>
  );
}
