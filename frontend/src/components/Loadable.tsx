import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api/problem";

/**
 * Pending / error / data for one query. Plain placeholder markup: the designed loading and error
 * states come with the design system components.
 */
export function Loadable<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <p role="status" aria-live="polite">
        Caricamento…
      </p>
    );
  }
  if (query.isError) {
    return (
      <div role="alert">
        <p>{errorMessage(query.error)}</p>
        <button type="button" onClick={() => void query.refetch()}>
          Riprova
        </button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}
