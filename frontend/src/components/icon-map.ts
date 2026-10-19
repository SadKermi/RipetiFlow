// Concept → Phosphor icon (docs/design/02-design-system.md §6). Weight `regular` always; sizes 20
// by default, 16 in rows and badges, 22 in the tab bar. Import icons from here when a concept has
// one, so the same idea never gets two different pictures.
import {
  BankIcon,
  type Icon,
  MoneyIcon,
  PencilSimpleLineIcon,
  PenNibIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import type { PaymentMethod } from "@/lib/api/types";

export const PAYMENT_METHOD_ICON: Readonly<Record<PaymentMethod, Icon>> = {
  cash: MoneyIcon,
  bank_transfer: BankIcon,
  other: WalletIcon,
};

/** Labels identical to the backend's CSV and activity log (02 §7). */
export const PAYMENT_METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  cash: "Contanti",
  bank_transfer: "Bonifico",
  other: "Altro",
};

/** Matita (assistant, drafts) and «Ripassa a penna» (confirm a draft). */
export const MATITA_ICON: Icon = PencilSimpleLineIcon;
export const INK_ICON: Icon = PenNibIcon;
