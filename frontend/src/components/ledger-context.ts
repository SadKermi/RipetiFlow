import { createContext, useContext } from "react";

/** Real <table> from 760 px of viewport, <ol> below (02 §10.6, §10.9). */
export type LedgerLayout = "table" | "list";

export const LedgerLayoutContext = createContext<LedgerLayout>("table");

export function useLedgerLayout(): LedgerLayout {
  return useContext(LedgerLayoutContext);
}

/** Desktop column widths (02 §9.6): Data | Voce | Durata | Lezione | Pagato | Saldo. */
export const LEDGER_GRID = "grid-cols-[104px_minmax(0,1fr)_76px_100px_100px_136px]";
/** Mobile: Data 72 | Voce | Importo. */
export const LEDGER_LIST_GRID = "grid-cols-[72px_minmax(0,1fr)_auto]";
