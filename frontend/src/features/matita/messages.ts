// Matita's interface copy (docs/design/03-schermate.md §9.4, 02 §9.13). Texts that come from the
// server (`reply`, `warnings[]`, the 429 `detail`) are never written here: they are shown as is.

export const MATITA_TEXT = {
  inputLabel: "Scrivi a Matita",
  placeholderLedger: "Scrivi una riga… «oggi 16:30–18 matematica, equazioni»",
  placeholderMobile: "Scrivi a Matita…",
  /** Without students there is no example (Matita does not create students). */
  placeholderBare: "Scrivi una riga…",
  thinking: "Matita sta scrivendo…",
  writingHint: "Invio per proporre · Esc per annullare",
  cancelHint: "Esc per annullare",
  proposes: "Matita propone",
  read: "Matita ha letto:",
  confirm: "Ripassa a penna",
  edit: "Modifica",
  discard: "Scarta",
  send: "Invia",
  newLesson: "Nuova lezione con il modulo",
  orUseForm: "oppure usa il modulo",
  retry: "Riprova",
  limitTail: "I moduli funzionano come sempre.",
  upstream: "Matita non risponde in questo momento. La riga è ancora nel campo.",
  offline: "Sei offline o il server non risponde. La riga è ancora nel campo.",
  unavailable: "Matita non è attiva su questo server. Usa i moduli: tutto funziona come sempre.",
  close: "Chiudi Matita",
  recent: "Frasi usate di recente",
  copy: "Copia",
  copied: "Messaggio copiato",
  copyFailed: "Non riesco a copiare: seleziona il testo e copialo a mano.",
  editDone: "Fine",
  messageLabel: "Testo del messaggio",
  addPhone: "Aggiungi il numero",
  topBar: "Matita",
} as const;

/** «Scrivi una riga… «ieri 15–16:30 matematica con Luca»» (Oggi, the ⌘K dialog). */
export function placeholderWithStudent(firstName: string | null): string {
  return firstName
    ? `Scrivi una riga… «ieri 15–16:30 matematica con ${firstName}»`
    : MATITA_TEXT.placeholderBare;
}

/** «Ripassa tutte a penna (3)». */
export function confirmAllLabel(count: number): string {
  return `Ripassa tutte a penna (${String(count)})`;
}

/** «Ancora 8 richieste a Matita oggi.» (when 10 or fewer are left). */
export function remainingText(remaining: number): string {
  if (remaining <= 0) return "Nessuna richiesta a Matita rimasta per oggi.";
  if (remaining === 1) return "Ancora 1 richiesta a Matita oggi.";
  return `Ancora ${String(remaining)} richieste a Matita oggi.`;
}

/** Announced when drafts arrive: «Matita propone 2 bozze.». */
export function proposalAnnouncement(count: number): string {
  return count === 1 ? "Matita propone una bozza." : `Matita propone ${String(count)} bozze.`;
}

/** Heading of a message draft, from `recipient_hint` («mamma di Marco»). */
export function messageHeading(recipientHint: string): string {
  return `Messaggio per ${recipientHint}`;
}

/** No usable number in the student's page (03 §9.3). */
export function noPhoneText(firstName: string): string {
  return `Nella scheda di ${firstName} non c'è un numero di telefono valido: WhatsApp ti chiederà a chi mandarlo.`;
}
