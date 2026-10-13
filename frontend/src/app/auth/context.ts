import { createContext, useContext } from "react";
import type { AuthSnapshot, AuthStore } from "./store";

type Actions = Pick<
  AuthStore,
  | "getAccessToken"
  | "signInWithGoogle"
  | "sendMagicLink"
  | "signInDemo"
  | "seedDemo"
  | "retry"
  | "connectGoogleCalendar"
  | "takeCalendarGrant"
  | "forgetProviderTokens"
>;

export interface AuthContextValue extends AuthSnapshot, Actions {
  /** "Esci". */
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Auth state and actions: {status, user, config, getAccessToken, signIn…, signOut, …}. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth() va usato dentro <AuthProvider>");
  return value;
}
