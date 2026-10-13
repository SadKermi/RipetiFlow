import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { ProfilePatch, Subject, SubjectCreate, SubjectPatch } from "../api/types";
import { invalidateAfter } from "./invalidation";
import { queryKeys } from "./keys";

// --- Profile (GET/PATCH /me) ----------------------------------------------------------------

export const profileQuery = () =>
  queryOptions({
    queryKey: queryKeys.profile(),
    queryFn: async ({ signal }) => unwrap(await api.GET("/me", { signal })),
  });

export function useProfile() {
  return useQuery(profileQuery());
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => unwrap(await api.PATCH("/me", { body: patch })),
    onSuccess: async (profile) => {
      queryClient.setQueryData(queryKeys.profile(), profile);
      await invalidateAfter(queryClient, { type: "profile" });
    },
  });
}

// --- Subjects -------------------------------------------------------------------------------

export const subjectsQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: queryKeys.subjects.list(includeArchived),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/subjects", {
          params: { query: { include_archived: includeArchived } },
          signal,
        }),
      ).items,
  });

export function useSubjects(includeArchived = false) {
  return useQuery(subjectsQuery(includeArchived));
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubjectCreate): Promise<Subject> =>
      unwrap(await api.POST("/subjects", { body })),
    onSuccess: () => invalidateAfter(queryClient, { type: "subject" }),
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SubjectPatch }): Promise<Subject> =>
      unwrap(
        await api.PATCH("/subjects/{subject_id}", {
          params: { path: { subject_id: id } },
          body: patch,
        }),
      ),
    onSuccess: () => invalidateAfter(queryClient, { type: "subject" }),
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await api.DELETE("/subjects/{subject_id}", { params: { path: { subject_id: id } } }));
    },
    onSuccess: () => invalidateAfter(queryClient, { type: "subject" }),
  });
}
