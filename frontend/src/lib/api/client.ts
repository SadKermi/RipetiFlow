// Typed API client (openapi-fetch + types generated from FastAPI, see `npm run gen:api`).
//
// - Paths are written without the "/api/v1" prefix: api.GET("/students/{student_id}", …).
// - Every request carries "Authorization: Bearer <token>" from the auth layer (session.ts).
// - Every non-2xx answer is thrown as ApiProblem; a 401 also tells the auth layer to sign out.
//   So `data` is always present after `unwrap(await api.GET(…))`.
import createClient, { type Client, type Middleware } from "openapi-fetch";
import { ApiProblem } from "./problem";
import type { paths } from "./schema";
import { getAccessToken, notifyUnauthorized } from "./session";

export const API_BASE = "/api/v1";
export const SOURCE_HEADER = "X-RipetiFlow-Source";

/** Who is writing: "assistant" marks writes that confirm a Matita draft (activity log source). */
export type WriteSource = "app" | "assistant";

type StripPrefix<P, Prefix extends string> = {
  [K in keyof P as K extends `${Prefix}${infer Rest}` ? Rest : never]: P[K];
};

/** The API's paths relative to API_BASE ("/api/health" is outside it and not used by the SPA). */
export type ApiPaths = StripPrefix<paths, typeof API_BASE>;
export type ApiClient = Client<ApiPaths>;

/** Absolute URL on the SPA's own origin (production: FastAPI serves both; dev: Vite proxies /api). */
export function absoluteUrl(path: string): string {
  const origin = globalThis.location?.origin ?? "http://localhost";
  return new URL(path, origin).href;
}

/** Headers for a write; `assistant` adds X-RipetiFlow-Source (docs/05 "Convenzioni"). */
export function sourceHeaders(source: WriteSource = "app"): Record<string, string> {
  return source === "assistant" ? { [SOURCE_HEADER]: "assistant" } : {};
}

function isAbort(error: unknown): boolean {
  // DOMException is not always an Error subclass across realms (jsdom), so check the name.
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

export const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.headers.has("Authorization")) return request;
    const token = await getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

export const problemMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined;
    const problem = await ApiProblem.fromResponse(response);
    if (response.status === 401) notifyUnauthorized();
    throw problem;
  },
  onError({ error }) {
    // Aborts are rethrown untouched (returning nothing): TanStack Query cancels through the signal.
    if (isAbort(error)) return undefined;
    if (error instanceof ApiProblem) return error;
    return ApiProblem.network(error);
  },
};

export function createApiClient(
  options: { baseUrl?: string; fetch?: (request: Request) => Promise<Response> } = {},
): ApiClient {
  const client = createClient<ApiPaths>({
    baseUrl: options.baseUrl ?? absoluteUrl(API_BASE),
    // Looked up at call time, so tests can stub globalThis.fetch after this module is loaded.
    fetch: options.fetch ?? ((request) => globalThis.fetch(request)),
  });
  client.use(authMiddleware, problemMiddleware);
  return client;
}

/** The client the whole app uses. */
export const api = createApiClient();

/**
 * Returns `data` from an openapi-fetch result. Errors are already thrown by problemMiddleware;
 * the check below only guards against a client created without it.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.error !== undefined) {
    throw ApiProblem.fromBody(result.response.status, result.error);
  }
  return result.data as T;
}
