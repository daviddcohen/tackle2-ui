import type { QueryStatus } from "@tanstack/react-query";

/**
 * A `refetchInterval` that pauses while the query is errored: a failing
 * endpoint is not polled again until a refetch (Try again, window focus)
 * brings it back. Used inline rather than spread into the options object, so
 * the hook's return type is still inferred.
 */
export const pollUnlessErrored = (
  query: { state: { status: QueryStatus } },
  refetchInterval: number | false
): number | false => (query.state.status === "error" ? false : refetchInterval);
