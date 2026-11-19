import { useQueryClient } from "@tanstack/react-query";

import { isNotFoundError } from "./agentic";

/**
 * The query client's retry rule, except that a 404 is never retried: a
 * missing entity stays missing, so its page says so right away (as the
 * agentic queries do) instead of after the retries.
 */
export const useRetryUnlessNotFound = () => {
  const fallback = useQueryClient().getDefaultOptions().queries?.retry ?? 3;
  return (failureCount: number, error: unknown) => {
    if (isNotFoundError(error)) return false;
    if (typeof fallback === "function") return fallback(failureCount, error);
    if (typeof fallback === "number") return failureCount < fallback;
    return fallback;
  };
};
