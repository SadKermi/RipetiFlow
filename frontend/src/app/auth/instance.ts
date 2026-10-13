// The app's AuthStore, wired to the real browser, API and supabase-js.
import { absoluteUrl, api, unwrap } from "@/lib/api/client";
import { AuthStore, type StorageLike, type SupabaseAuth } from "./store";

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled (privacy settings)
  }
}

async function createSupabase(url: string, publishableKey: string): Promise<SupabaseAuth> {
  // Loaded on demand: demo-only installs and the public landing never download supabase-js.
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, publishableKey, {
    auth: {
      flowType: "pkce", // ?code= in the callback URL instead of tokens in the fragment
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client.auth;
}

export const authStore = new AuthStore({
  loadConfig: async () => unwrap(await api.GET("/public/config")),
  createSupabase,
  storage: sessionStorageOrNull(),
  fetch: (path, init) => globalThis.fetch(absoluteUrl(path), init),
  origin: () => window.location.origin,
});
