import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell } from "./AppShell";
import { RedirectIfSignedIn, RequireAuth } from "./auth";
import { RouteError } from "./ErrorBoundary";
import { RootLayout } from "./RootLayout";

// Each page is its own chunk (code splitting per route): a route module exports `Component`
// (and optionally `ErrorBoundary`), see src/routes/*.tsx.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    // Shown while the first lazy route chunk loads.
    hydrateFallbackElement: (
      <p role="status" aria-live="polite">
        Caricamento…
      </p>
    ),
    children: [
      { index: true, lazy: () => import("@/routes/landing") },
      {
        path: "accedi",
        element: <RedirectIfSignedIn />,
        children: [{ index: true, lazy: () => import("@/routes/accedi") }],
      },
      { path: "auth/callback", lazy: () => import("@/routes/auth-callback") },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { path: "oggi", lazy: () => import("@/routes/oggi") },
          { path: "studenti", lazy: () => import("@/routes/studenti") },
          { path: "studenti/:id", lazy: () => import("@/routes/studente") },
          { path: "agenda", lazy: () => import("@/routes/agenda") },
          { path: "impostazioni", lazy: () => import("@/routes/impostazioni") },
        ],
      },
      { path: "*", lazy: () => import("@/routes/not-found") },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
