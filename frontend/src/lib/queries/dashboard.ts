import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { CalendarConnect, CalendarResync } from "../api/types";
import { invalidateAfter } from "./invalidation";
import { queryKeys } from "./keys";

// --- Dashboard "Oggi" (D-21) ------------------------------------------------------------------

export const dashboardQuery = (days = 7) =>
  queryOptions({
    queryKey: queryKeys.dashboard.detail(days),
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/dashboard", { params: { query: { days } }, signal })),
  });

export function useDashboard(days = 7) {
  return useQuery(dashboardQuery(days));
}

// --- Google Calendar (D-31) -------------------------------------------------------------------

export const calendarStatusQuery = () =>
  queryOptions({
    queryKey: queryKeys.calendar.status(),
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/integrations/google-calendar", { signal })),
  });

export function useCalendarStatus() {
  return useQuery(calendarStatusQuery());
}

/** Sends the Google refresh token once (from /auth/callback?next=calendar). */
export function useConnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    // The token is the mutation's `variables`: never keep it in the cache once the hand-off is
    // over (the default would hold it in memory for 5 minutes after the page is gone, D-31).
    gcTime: 0,
    mutationFn: async (body: CalendarConnect) =>
      unwrap(await api.POST("/integrations/google-calendar/connect", { body })),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.calendar.status(), status);
      return invalidateAfter(queryClient, { type: "calendar" });
    },
  });
}

export function useResyncCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CalendarResync = { scope: "upcoming" }) =>
      unwrap(await api.POST("/integrations/google-calendar/resync", { body })),
    onSuccess: () => invalidateAfter(queryClient, { type: "calendar" }),
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ removeCalendar = false }: { removeCalendar?: boolean } = {}) => {
      unwrap(
        await api.DELETE("/integrations/google-calendar", {
          params: { query: { remove_calendar: removeCalendar } },
        }),
      );
    },
    onSuccess: () => invalidateAfter(queryClient, { type: "calendar" }),
  });
}
