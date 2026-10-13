import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAfter } from "@/lib/queries/invalidation";
import { useAuth } from "./context";

/** "Ricarica i dati demo" (POST /dev/seed): every cached query is stale afterwards. */
export function useSeedDemo() {
  const { seedDemo } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: seedDemo,
    onSuccess: () => invalidateAfter(queryClient, { type: "everything" }),
  });
}
