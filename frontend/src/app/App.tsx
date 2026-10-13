import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { RouterProvider } from "react-router";
import { createQueryClient } from "@/lib/queries/client";
import { AuthProvider } from "./auth";
import { AppErrorBoundary } from "./ErrorBoundary";
import { createAppRouter } from "./router";

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* D-23: Italian formats everywhere (dates, numbers, week starting on Monday). */}
        <I18nProvider locale="it-IT">
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
