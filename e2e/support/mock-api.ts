/**
 * Direct calls to the MSW-mocked Hub API from inside the page (the service
 * worker only answers requests made by the page). Use these to set up or
 * inspect server state; assert user-visible behavior through the UI.
 */
import type { Page } from "@playwright/test";

import { expect } from "./fixtures";
import { type Scenario, protoUrl } from "./proto";

export const AGENTIC_API = "/hub/prototype/agentic";

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

/** `fetch` from the page; `path` is relative to the Hub root (`/hub`). */
export const hubRequest = <T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> =>
  page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed as T };
    },
    { method, url: `/hub${path}`, body }
  );

/** Same as `hubRequest`, relative to the agentic API root. */
export const agenticRequest = <T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown
) => hubRequest<T>(page, method, `/prototype/agentic${path}`, body);

/** GET that must succeed; returns the body. */
export const agenticGet = async <T>(page: Page, path: string) => {
  const response = await agenticRequest<T>(page, "GET", path);
  expect(response.status, `GET ${path}`).toBe(200);
  return response.body;
};

/**
 * Opens a light page in `scenario` and waits until the mock service worker
 * answers agentic requests with the scenario's status.
 */
export const bootMockApi = async (
  page: Page,
  scenario: Scenario = "configured"
) => {
  await page.goto(protoUrl("/applications", { scenario }));
  await expect
    .poll(
      async () => (await agenticRequest(page, "GET", "/providers")).status,
      { timeout: 20_000 }
    )
    .toBe(scenario === "apiError" ? 503 : 200);
};
