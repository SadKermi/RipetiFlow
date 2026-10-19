import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isApiProblem } from "@/lib/api/problem";
import { LoadErrorBand, SkeletonRows } from "./States";

export interface LoadableInfo {
  /** The data on screen is from the cache and the refresh failed: show it in ink-2. */
  stale: boolean;
}

export interface LoadableProps<T> {
  query: UseQueryResult<T>;
  children: (data: T, info: LoadableInfo) => ReactNode;
  /** Shown while the first answer is pending (default: three skeleton rows after 300 ms). */
  skeleton?: ReactNode;
  /** Tutor's timezone, for «quelli che vedi sono delle 9:12». */
  timeZone?: string;
}

/**
 * Pending / error / data for one query with the designed states (02 §9.15, 03 §10):
 * skeleton rows while loading; on error the band with «Riprova»; when a refresh fails and there is
 * cached data, the band says how old it is and the data stays visible in ink-2 (never an empty
 * page with only the error when a cache exists).
 */
export function Loadable<T>({ query, children, skeleton, timeZone }: LoadableProps<T>) {
  if (query.isPending) {
    return <>{skeleton ?? <SkeletonRows />}</>;
  }
  const offline = isApiProblem(query.error) && query.error.code === "network_error";
  const retry = () => void query.refetch();
  const data = query.data;
  if (query.isError && data === undefined) {
    return (
      <LoadErrorBand
        onRetry={retry}
        isRetrying={query.isFetching}
        offline={offline}
        timeZone={timeZone}
      />
    );
  }
  if (query.isError) {
    return (
      <>
        <LoadErrorBand
          onRetry={retry}
          isRetrying={query.isFetching}
          offline={offline}
          cachedAt={query.dataUpdatedAt}
          timeZone={timeZone}
          className="mb-4"
        />
        <div className="text-ink-2" data-stale="true">
          {children(data as T, { stale: true })}
        </div>
      </>
    );
  }
  return <>{children(query.data, { stale: false })}</>;
}
