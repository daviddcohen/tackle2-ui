import { QueryClient } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";

import { renderHook } from "@app/test-config/test-utils";

import { useRetryUnlessNotFound } from "./retry";

const axiosError = (status: number) =>
  new AxiosError("failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

const retryWith = (
  retry?: boolean | number | ((failureCount: number, error: unknown) => boolean)
) =>
  renderHook(() => useRetryUnlessNotFound(), {
    queryClient: new QueryClient({
      defaultOptions: { queries: retry === undefined ? {} : { retry } },
    }),
  }).result.current;

describe("useRetryUnlessNotFound", () => {
  it("never retries a 404", () => {
    expect(retryWith()(0, axiosError(404))).toBe(false);
    expect(retryWith(5)(0, axiosError(404))).toBe(false);
  });

  it("keeps the client's rule for other failures", () => {
    // React Query's default: three retries.
    const byDefault = retryWith();
    expect(byDefault(2, axiosError(503))).toBe(true);
    expect(byDefault(3, axiosError(503))).toBe(false);
    // A client that never retries (the test client) still never retries.
    expect(retryWith(false)(0, axiosError(503))).toBe(false);
    expect(retryWith(1)(0, axiosError(503))).toBe(true);
    expect(retryWith(1)(1, axiosError(503))).toBe(false);
  });

  it("asks a client's retry function for other failures, never for a 404", () => {
    const rule = jest.fn((failureCount: number) => failureCount < 1);
    const retry = retryWith(rule);
    expect(retry(0, axiosError(503))).toBe(true);
    expect(retry(1, axiosError(503))).toBe(false);
    expect(retry(0, axiosError(404))).toBe(false);
    expect(rule).toHaveBeenCalledTimes(2);
  });
});
