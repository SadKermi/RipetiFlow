import { QueryClient } from "@tanstack/react-query";
import { isApiProblem } from "../api/problem";

/** 4xx answers are final (validation, not found, unauthorized…): retrying cannot fix them. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiProblem(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });
}
