// Sign-in helpers shared by the landing, /accedi and /auth/callback (03 §1–2, D-30).
import type { PublicConfig } from "@/lib/api/types";

export interface SignInMethods {
  google: boolean;
  email: boolean;
  demo: boolean;
}

/** Each method only when its flag in GET /public/config is true (and Supabase is configured). */
export function signInMethods(config: PublicConfig | null): SignInMethods {
  if (!config) return { google: false, email: false, demo: false };
  const supabase = Boolean(config.supabase_url && config.supabase_publishable_key);
  return {
    google: supabase && config.google_login_enabled,
    email: supabase && config.magic_link_enabled,
    demo: config.dev_auth_enabled,
  };
}

/** The line under the landing's CTA, after the methods that are on (03 §1). */
export function signInLine(config: PublicConfig | null): string {
  const { google, email } = signInMethods(config);
  if (google && email) {
    return "Entri con il tuo account Google o con un link via email, senza password.";
  }
  if (google) return "Entri con il tuo account Google.";
  if (email) return "Entri con un link via email, senza password.";
  return "Entri senza password.";
}

// --- What was started, so /auth/callback can tell an expired link from a cancelled Google --------
// localStorage (not sessionStorage): the email link usually opens in a new tab.

const ATTEMPT_KEY = "ripetiflow.signin-attempt";

export interface SignInAttempt {
  method: "google" | "email";
  /** The address the link went to, to write it again in «Mandane un altro». */
  email?: string;
}

export function rememberSignIn(attempt: SignInAttempt): void {
  try {
    window.localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // storage blocked: the callback falls back to the generic messages
  }
}

export function recallSignIn(): SignInAttempt | null {
  try {
    const raw = window.localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SignInAttempt> | null;
    if (value?.method !== "google" && value?.method !== "email") return null;
    return {
      method: value.method,
      ...(typeof value.email === "string" ? { email: value.email } : {}),
    };
  } catch {
    return null;
  }
}

export function forgetSignIn(): void {
  try {
    window.localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // nothing to forget
  }
}

// --- /auth/callback -----------------------------------------------------------------------------

export interface CallbackError {
  /** `error` (e.g. access_denied). */
  error: string;
  /** `error_code` (e.g. otp_expired), when Supabase gives one. */
  code: string | null;
  description: string | null;
}

/** Supabase puts errors in the query (PKCE) or in the fragment (older links): read both. */
export function callbackError(search: string, hash: string): CallbackError | null {
  for (const raw of [search, hash.replace(/^#/, "")]) {
    const params = new URLSearchParams(raw.replace(/^\?/, ""));
    const error = params.get("error") ?? params.get("error_code");
    if (error) {
      return {
        error,
        code: params.get("error_code"),
        description: params.get("error_description"),
      };
    }
  }
  return null;
}

export type CallbackFailure = "link-expired" | "google-failed" | "failed";

/** Why a sign-in callback ended without a session (03 §2 «Stati»). */
export function classifyFailure(
  error: CallbackError | null,
  attempt: SignInAttempt | null,
): CallbackFailure {
  const text = `${error?.code ?? ""} ${error?.description ?? ""}`.toLowerCase();
  if (error?.code === "otp_expired" || /expired|scadut/.test(text)) return "link-expired";
  if (attempt?.method === "email") return "link-expired";
  if (error && attempt?.method === "google") return "google-failed";
  if (error?.error === "access_denied") return "google-failed";
  return "failed";
}

/** State passed to /accedi: a failed Google return, or the address to write again. */
export interface SignInPageState {
  signInError?: "google";
  email?: string;
  from?: string;
}

export function readSignInPageState(state: unknown): SignInPageState {
  if (typeof state !== "object" || state === null) return {};
  const value = state as Record<string, unknown>;
  return {
    ...(value.signInError === "google" ? { signInError: "google" as const } : {}),
    ...(typeof value.email === "string" ? { email: value.email } : {}),
    ...(typeof value.from === "string" ? { from: value.from } : {}),
  };
}
