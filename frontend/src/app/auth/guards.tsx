import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./context";

export interface FromState {
  /** Where a signed-out visitor was going: /accedi sends them back there after sign-in. */
  from?: string;
}

function Pending() {
  return (
    <p role="status" aria-live="polite">
      Caricamento…
    </p>
  );
}

/** Protected routes: signed-out visitors go to /accedi (and come back after signing in). */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Pending />;
  if (status === "signedOut") {
    const state: FromState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/accedi" replace state={state} />;
  }
  return children ?? <Outlet />;
}

/** /accedi for someone already signed in: straight to the app. */
export function RedirectIfSignedIn({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Pending />;
  if (status === "signedIn") {
    const from = (location.state as FromState | null)?.from;
    const target = from?.startsWith("/") && !from.startsWith("//") ? from : "/oggi";
    return <Navigate to={target} replace />;
  }
  return children ?? <Outlet />;
}
