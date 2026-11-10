/**
 * Polling policy: lists poll only while something can still change, and stop
 * while errored. Time is driven with Playwright's fake clock, so the "stops
 * polling" checks do not depend on wall-clock sleeps: each test first proves
 * that advancing the clock does trigger polling (positive control), then that
 * it no longer does.
 */
import type { Page } from "@playwright/test";

import {
  dialog,
  expect,
  gotoProto,
  main,
  rowActions,
  rowByText,
  test,
} from "../support";

/** Requests matching `pattern`, recorded from now on. */
const recordRequests = (page: Page, pattern: RegExp) => {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && pattern.test(request.url()))
      urls.push(request.url());
  });
  return urls;
};

/** Lets fetches started by fired timers reach the network layer. */
const flush = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));

/**
 * Positive control: advancing the clock in 1 s steps keeps producing matching
 * requests. (Small steps: a tick that fires while the previous fetch is still
 * in flight is deduplicated by React Query.)
 */
const expectPolling = async (page: Page, urls: string[]) => {
  const before = urls.length;
  await expect
    .poll(async () => {
      await page.clock.runFor(1_000);
      await flush(page);
      return urls.length - before;
    })
    .toBeGreaterThanOrEqual(2);
};

/** Advancing the clock by `seconds` produces no matching request. */
const expectNoPolling = async (page: Page, urls: string[], seconds = 30) => {
  const before = urls.length;
  for (let second = 0; second < seconds; second++) {
    await page.clock.runFor(1_000);
    await flush(page);
  }
  expect(urls.slice(before)).toEqual([]);
};

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

test("the models list polls while a model is pending and stops once none is", async ({
  page,
}) => {
  const models = recordRequests(
    page,
    /\/hub\/prototype\/agentic\/models(\?|$)/
  );
  await gotoProto(page, "/models", { persona: "platformEngineer" });
  // "Gemini 2.5 Pro" is pending verification, so the list polls.
  await expect(rowByText(page, "Gemini 2.5 Pro")).toContainText("Pending");
  await expectPolling(page, models);

  // Remove the only pending model (unused, not the default).
  await rowActions(rowByText(page, "Gemini 2.5 Pro")).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  // The delete invalidates the list: wait for that refetch to complete.
  const refetch = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /\/hub\/prototype\/agentic\/models(\?|$)/.test(response.url())
  );
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await refetch;
  await expect(rowByText(page, "Gemini 2.5 Pro")).toHaveCount(0);
  await expectNoPolling(page, models);
});

test("the inventory polls application migrations only while runs are active", async ({
  page,
}) => {
  const migrations = recordRequests(page, /\/application-migrations/);
  await gotoProto(page, "/applications", { scenario: "running" });
  await expect(main(page).getByText("Running: ").first()).toBeVisible();
  await expectPolling(page, migrations);

  await gotoProto(page, "/applications", { scenario: "completed" });
  await expect(main(page).getByText("Succeeded: ").first()).toBeVisible();
  await expectNoPolling(page, migrations);
});

test("the plan runs list polls while runs are active and stops while errored", async ({
  page,
}) => {
  const runs = recordRequests(
    page,
    /\/hub\/prototype\/agentic\/plan-runs(\?|$)/
  );
  await gotoProto(page, "/plan-runs", { scenario: "running" });
  await expect(main(page).getByRole("link", { name: /^Run #1/ })).toBeVisible();
  await expectPolling(page, runs);

  await gotoProto(page, "/plan-runs", { scenario: "apiError" });
  // Retries are bounded; then the error state is shown and polling pauses.
  await expect(async () => {
    await page.clock.runFor(5_000);
    await expect(main(page).getByText("Unable to connect")).toBeVisible({
      timeout: 500,
    });
  }).toPass();
  await expectNoPolling(page, runs);
});
