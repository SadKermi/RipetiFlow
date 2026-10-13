import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { setSessionBridge } from "@/lib/api/session";
import { AuthContext, type AuthContextValue } from "./context";
import { authStore } from "./instance";
import type { AuthStore } from "./store";

export function AuthProvider({
  children,
  store = authStore,
}: {
  children: ReactNode;
  /** Injected in tests. */
  store?: AuthStore;
}) {
  const queryClient = useQueryClient();

  // Layout effect: registered before any child's passive effect can start a request.
  useLayoutEffect(
    () =>
      setSessionBridge({
        getAccessToken: store.getAccessToken,
        onUnauthorized: store.handleUnauthorized,
      }),
    [store],
  );

  useEffect(() => {
    void store.start();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // Cached data belongs to one tutor: drop it whenever the signed-in identity changes or ends.
  const userId = snapshot.user?.id ?? null;
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    if (previousUserId.current !== null && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [userId, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      getAccessToken: store.getAccessToken,
      signInWithGoogle: store.signInWithGoogle,
      sendMagicLink: store.sendMagicLink,
      signInDemo: store.signInDemo,
      seedDemo: store.seedDemo,
      signOut: () => store.signOut(),
      retry: store.retry,
      connectGoogleCalendar: store.connectGoogleCalendar,
      takeCalendarGrant: store.takeCalendarGrant,
      forgetProviderTokens: store.forgetProviderTokens,
    }),
    [snapshot, store],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
