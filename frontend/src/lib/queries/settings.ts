// Settings-only writes that the generic hooks in profile.ts do not cover.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { Subject } from "../api/types";
import { invalidateAfter } from "./invalidation";
import { queryKeys } from "./keys";

/**
 * New `position` for each subject so that `orderedIds` comes out in that order (1, 2, 3…).
 * Only the subjects whose position actually changes are returned: the API has no bulk reorder,
 * so every change is one PATCH /subjects/{id}.
 */
export function positionChanges(
  subjects: readonly Pick<Subject, "id" | "position">[],
  orderedIds: readonly string[],
): { id: string; position: number }[] {
  const current = new Map(subjects.map((subject) => [subject.id, subject.position]));
  const changes: { id: string; position: number }[] = [];
  orderedIds.forEach((id, index) => {
    const position = index + 1;
    if (current.has(id) && current.get(id) !== position) changes.push({ id, position });
  });
  return changes;
}

/**
 * Reorders the active subjects (the order of the «Materia» menu, 03 §8). The cached lists are
 * updated at once (no jump back while the PATCHes run) and refreshed from the server afterwards,
 * also when one PATCH fails halfway.
 */
export function useReorderSubjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subjects,
      orderedIds,
    }: {
      subjects: readonly Subject[];
      orderedIds: readonly string[];
    }) => {
      for (const { id, position } of positionChanges(subjects, orderedIds)) {
        unwrap(
          await api.PATCH("/subjects/{subject_id}", {
            params: { path: { subject_id: id } },
            body: { position },
          }),
        );
      }
    },
    onMutate: async ({ orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.subjects.all() });
      const rank = new Map(orderedIds.map((id, index) => [id, index + 1]));
      queryClient.setQueriesData<Subject[]>({ queryKey: queryKeys.subjects.all() }, (list) =>
        list
          ?.map((subject) => {
            const position = rank.get(subject.id);
            return position === undefined ? subject : { ...subject, position };
          })
          .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "it")),
      );
    },
    onSettled: () => invalidateAfter(queryClient, { type: "subject" }),
  });
}
