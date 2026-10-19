import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useToast } from "@/components/toast-context";
import { errorMessage } from "@/lib/api/problem";

/**
 * Toast after a write, with «Annulla» when `undo` is given (02 §9.11). If undoing fails there is
 * no field to put the error on, so the server's text comes back as a toast.
 */
export function useUndoToast() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useCallback(
    (message: string, undo?: (qc: QueryClient) => Promise<unknown>) => {
      toast.show({
        message,
        action: undo
          ? {
              label: "Annulla",
              onAction: () => {
                undo(queryClient).catch((error: unknown) => {
                  toast.show(`Non è stato possibile annullare: ${errorMessage(error)}`);
                });
              },
            }
          : undefined,
      });
    },
    [toast, queryClient],
  );
}
