import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { Outlet, ScrollRestoration, useHref, useNavigate } from "react-router";

/**
 * Root of every route. React Aria's RouterProvider makes its links (`href` on Link, MenuItem,
 * Tab…) navigate client-side through React Router.
 */
export function RootLayout() {
  const navigate = useNavigate();
  return (
    <AriaRouterProvider navigate={(to) => void navigate(to)} useHref={useHref}>
      <Outlet />
      <ScrollRestoration />
    </AriaRouterProvider>
  );
}
