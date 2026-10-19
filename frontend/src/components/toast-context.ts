import { createContext, useContext } from "react";

export interface ToastAction {
  /** Almost always «Annulla» (03: «Annulla» on a creation = DELETE of what was just created). */
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  /** «Lezione registrata · nel saldo», «Pagamento di 100,00 € registrato». */
  message: string;
  action?: ToastAction;
  /** Default 5 s, 8 s with an action (02 §9.11). Paused while hovered or focused. */
  durationMs?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. Errors are never toasts: they stay next to the field. */
  show: (options: ToastOptions | string) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** `const toast = useToast(); toast.show({ message: "…", action: { label: "Annulla", onAction } })` */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() va usato dentro <ToastProvider>");
  return api;
}

export const TOAST_DURATION_MS = 5_000;
export const TOAST_WITH_ACTION_DURATION_MS = 8_000;
