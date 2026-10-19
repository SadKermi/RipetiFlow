import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { Outlet, ScrollRestoration, useHref, useNavigate } from "react-router";
import { ToastProvider } from "@/components/Toast";

/**
 * Root of every route. React Aria's RouterProvider makes its links (`href` on Link, MenuItem,
 * Tab…) navigate client-side through React Router. The toast region lives here so a toast survives
 * the navigation that often follows it («Giulia Ferri aggiunta» → her page).
 */
export function RootLayout() {
  const navigate = useNavigate();
  return (
    <AriaRouterProvider navigate={(to) => void navigate(to)} useHref={useHref}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
      <ScrollRestoration />
    </AriaRouterProvider>
  );
}
