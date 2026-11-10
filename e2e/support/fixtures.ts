/**
 * The shared `test` object. Import `test` and `expect` from "../support"
 * instead of "@playwright/test" so every spec gets the same fixtures.
 *
 * Fixtures are lazy: a listener is attached only when a test asks for it.
 */
import { expect, test as base } from "@playwright/test";

/** Dev-server and tooling noise that is not an application problem. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[MSW\]/,
  /\[rspack-dev-server\]/,
  /\[HMR\]/,
  /hot-update/,
];

export interface Diagnostics {
  /** Uncaught exceptions thrown in the page. */
  pageErrors: string[];
  /** console.error / console.warn output (minus dev tooling noise). */
  console: string[];
  /** Hub requests answered with 4xx/5xx. */
  failedHubRequests: string[];
}

export const test = base.extend<{
  /** Uncaught page errors. Assert `expect(pageErrors).toEqual([])`. */
  pageErrors: string[];
  /** Page errors, console errors/warnings and failed Hub requests. */
  diagnostics: Diagnostics;
}>({
  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(errors);
  },
  diagnostics: async ({ page }, provide) => {
    const diagnostics: Diagnostics = {
      pageErrors: [],
      console: [],
      failedHubRequests: [],
    };
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const text = message.text();
      if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
      diagnostics.console.push(text.slice(0, 500));
    });
    page.on("response", (response) => {
      if (response.url().includes("/hub/") && response.status() >= 400)
        diagnostics.failedHubRequests.push(
          `${response.status()} ${response.request().method()} ${response.url()}`
        );
    });
    await provide(diagnostics);
  },
});

export { expect };

/** No uncaught errors, console errors/warnings or Hub 5xx responses. */
export const expectHealthy = (diagnostics: Diagnostics) => {
  expect(diagnostics.pageErrors, "page errors").toEqual([]);
  expect(diagnostics.console, "console errors and warnings").toEqual([]);
  expect(
    diagnostics.failedHubRequests.filter((entry) => entry.startsWith("5")),
    "Hub 5xx responses"
  ).toEqual([]);
};
