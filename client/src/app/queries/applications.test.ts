import { QueryClient } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { rest } from "msw";

import { renderHook, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { retryUnlessNotFound, useFetchApplicationById } from "./applications";

const axiosError = (status: number) =>
  new AxiosError("failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

describe("application by id query", () => {
  it("never retries a missing application, and retries other errors up to 3 times", () => {
    expect(retryUnlessNotFound(0, axiosError(404))).toBe(false);
    expect(retryUnlessNotFound(0, axiosError(503))).toBe(true);
    expect(retryUnlessNotFound(2, axiosError(503))).toBe(true);
    expect(retryUnlessNotFound(3, axiosError(503))).toBe(false);
    expect(retryUnlessNotFound(0, new Error("network"))).toBe(true);
  });

  it("reports a missing application after one request", async () => {
    let requests = 0;
    server.use(
      rest.get("*/applications/99999", (_req, res, ctx) => {
        requests += 1;
        return res(ctx.status(404));
      })
    );
    // The test providers turn retries off; restore React Query's defaults
    // (3 retries) without the backoff, so this guards the query's own policy.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 3, retryDelay: 0 } },
    });
    const { result } = renderHook(() => useFetchApplicationById(99999, false), {
      queryClient,
    });
    await waitFor(() => expect(result.current.fetchError).not.toBeNull());
    expect(requests).toBe(1);
  });
});
