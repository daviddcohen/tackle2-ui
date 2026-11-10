/**
 * Query behavior seen from the network: no requests for unusable ids, no
 * retries on 404, and no failing requests on healthy pages. Polling lives in
 * polling.spec.ts.
 */
import { expect, mainHeading, protoUrl, test } from "../support";

test("plan run detail renders from the run snapshot without failing requests", async ({
  page,
  diagnostics,
}) => {
  const planRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/hub/prototype/agentic/plans/"))
      planRequests.push(request.url());
  });
  await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
  await expect(mainHeading(page)).toHaveText("Run #1 — Java EE to Quarkus");
  await expect(
    page.getByRole("link", { name: "View run" }).first()
  ).toBeVisible();
  expect(planRequests.filter((url) => /\/plans\/0(\?|$)/.test(url))).toEqual(
    []
  );
  expect(diagnostics.failedHubRequests).toEqual([]);
});

test("an unknown plan run shows not-found after a single request (no retries on 404)", async ({
  page,
}) => {
  const hits: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/hub/prototype/agentic/plan-runs/99999"))
      hits.push(request.url());
  });
  await page.goto(protoUrl("/plan-runs/99999", { scenario: "completed" }));
  // With retries the not-found state would only appear after 3 more requests.
  await expect(page.getByText(/not found/i).first()).toBeVisible();
  expect(hits.length).toBeGreaterThanOrEqual(1);
  expect(hits.length).toBeLessThanOrEqual(2);
});

for (const path of ["/skills/abc", "/agents/abc", "/skills/collections/abc"]) {
  test(`${path} is not sent to the API as NaN`, async ({ page }) => {
    const nanRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/hub\/.*\/NaN(\?|$)/.test(request.url()))
        nanRequests.push(request.url());
    });
    await page.goto(protoUrl(path));
    await expect(page.getByText(/not found/).first()).toBeVisible();
    expect(nanRequests).toEqual([]);
  });
}
