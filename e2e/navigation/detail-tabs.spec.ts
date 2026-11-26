/**
 * Entity detail pages: the inventory opens a full application page (it
 * replaced upstream's drawer), tabs are URL-backed (`?tab=`) and an unknown
 * tab value falls back to the first tab.
 */
import type { Page } from "@playwright/test";

import {
  agenticRequest,
  bootMockApi,
  breadcrumb,
  expect,
  main,
  mainHeading,
  protoUrl,
  spaNavigate,
  test,
  withBase,
} from "../support";

test("an application name in the inventory opens its detail page, and the crumb returns", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications"));
  const link = main(page).getByRole("link", {
    name: "Customer Management",
    exact: true,
  });
  await expect(link).toHaveAttribute(
    "href",
    new RegExp(`^${withBase("/applications/")}\\d+`)
  );
  await link.click();
  await expect(page).toHaveURL(/\/applications\/\d+/);
  await expect(mainHeading(page)).toHaveText("Customer Management");
  await expect(page.locator(".pf-v6-c-drawer.pf-m-expanded")).toHaveCount(0);
  for (const tab of ["Details", "Migration", "Plan runs", "Skills"])
    await expect(
      page.getByRole("tab", { name: tab, exact: true })
    ).toBeVisible();

  await page.getByRole("tab", { name: "Plan runs", exact: true }).click();
  await expect(page).toHaveURL(/tab=plan-runs/);
  await breadcrumb(page)
    .getByRole("link", { name: "Application inventory", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications(\?|$)/);
});

test("the selected tab controls an existing panel", async ({ page }) => {
  await page.goto(protoUrl("/applications/1?tab=migration"));
  const tab = page.getByRole("tab", { name: "Migration", selected: true });
  const panelId = await tab.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await expect(
    page.locator(`[id="${panelId}"][role="tabpanel"]`)
  ).toBeVisible();
});

for (const [path, firstTab] of [
  ["/agents/3", "Details"],
  ["/migration-plans/1", "Details"],
  ["/applications/1", "Details"],
  ["/skills/1", "Details"],
] as const) {
  test(`${path}?tab=bogus falls back to the ${firstTab} tab`, async ({
    page,
  }) => {
    await page.goto(protoUrl(`${path}?tab=bogus`));
    await expect(
      page.getByRole("tab", { name: firstTab, exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
    await expect(main(page).getByRole("tabpanel")).toBeVisible();
  });
}

// Every tabbed page names its tab set on the tablist itself, so a screen
// reader announces which set of tabs it is in.
for (const [path, name] of [
  ["/agents/3", "Agent details"],
  ["/migration-plans/1", "Plan details"],
  ["/applications/1", "Application details"],
  ["/skills/1", "Skill details"],
  ["/skills", "Skills and skill collections"],
  ["/plan-runs/1/stages/1", "Stage views"],
] as const) {
  test(`${path} names its tablist "${name}"`, async ({ page }) => {
    await page.goto(protoUrl(path));
    await expect(main(page).getByRole("tablist", { name })).toBeVisible();
  });
}

test("a stage link on the Migration tab opens the stage for this application", async ({
  page,
}) => {
  // Partner Portal's latest run failed at its first stage.
  await page.goto(protoUrl("/applications/7?tab=migration"));
  const review = main(page).getByRole("link", { name: "Review stage" });
  await expect(review).toHaveAttribute(
    "href",
    /\/plan-runs\/\d+\/stages\/[^?]+\?application=7/
  );
});

/** Starts `planId` on one application through the mock API ("one plan for all"). */
const startPlan = async (page: Page, applicationId: number, planId: string) => {
  const started = await agenticRequest(
    page,
    "POST",
    "/application-migrations",
    {
      applicationIds: [applicationId],
      planSelection: "single",
      planId,
      targetBranch: "main",
    }
  );
  expect(started.status, "POST /application-migrations").toBe(202);
};

test("the Migration tab names both plans when the latest run ran another one", async ({
  page,
}) => {
  // Order Service (Spring Boot Application) has one target profile, on
  // Spring Boot to Quarkus; its latest run runs Java lift and shift.
  await bootMockApi(page);
  await startPlan(page, 4, "3");
  // The run count comes from the plan runs list, which the tab does not
  // wait for: read the list before saying nothing about other runs.
  const planRunsRead = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      // The unfiltered list, not one filtered by plan.
      /\/hub\/prototype\/agentic\/plan-runs$/.test(response.url())
  );
  await spaNavigate(page, "/applications/4?tab=migration");
  const planRuns = (await (await planRunsRead).json()) as {
    applications: { id: number }[];
  }[];
  expect(
    planRuns.filter((run) => run.applications.some(({ id }) => id === 4))
  ).toHaveLength(1);
  const latest = main(page).getByRole("region", { name: "Latest plan run" });
  await expect(latest).toContainText(
    "This plan run used Java lift and shift. The next run uses Spring Boot to Quarkus unless you pick another."
  );
  // The Plan run fact is the one link to the run.
  await expect(
    latest.getByRole("link", { name: /^Run #\d+: Java lift and shift$/ })
  ).toHaveAttribute("href", /\/plan-runs\/\d+/);
  await expect(latest.locator('a[href*="/plan-runs/"]')).toHaveCount(1);
  await expect(
    latest.getByRole("link", { name: "Spring Boot to Quarkus", exact: true })
  ).toHaveAttribute("href", /\/migration-plans\/2(\?|$)/);
  // Its only run: nothing about other runs.
  await expect(latest).not.toContainText("plan runs on this application");
});

test("the Migration tab says when the latest run ran a plan none of its target profiles uses", async ({
  page,
}) => {
  // Customer Management (Java EE Application) runs Java EE to Quarkus or
  // Java lift and shift, one per target profile, so it has no single plan.
  await bootMockApi(page);
  await startPlan(page, 1, "2");
  await spaNavigate(page, "/applications/1?tab=migration");
  const latest = main(page).getByRole("region", { name: "Latest plan run" });
  await expect(latest).toContainText(
    "This plan run used Spring Boot to Quarkus, which none of this application's target profiles uses."
  );
  await expect(
    latest.getByRole("link", { name: "Spring Boot to Quarkus", exact: true })
  ).toHaveAttribute("href", /\/migration-plans\/2(\?|$)/);
});

test("the Migration tab names no other plan when the latest run ran one of its target profiles' plans", async ({
  page,
}) => {
  // Partner Portal's latest run ran Java lift and shift, the plan of its
  // OpenJDK 21 on OpenShift target profile.
  await page.goto(protoUrl("/applications/7?tab=migration"));
  const latest = main(page).getByRole("region", { name: "Latest plan run" });
  await expect(
    latest.getByRole("link", { name: "Run #4: Java lift and shift" })
  ).toHaveAttribute("href", /\/plan-runs\/4(\?|$)/);
  await expect(latest).not.toContainText("This plan run used");
  // The target profile Run #4 ran on, of the archetype's two.
  await expect(
    latest.getByRole("link", { name: "OpenJDK 21 on OpenShift", exact: true })
  ).toBeVisible();
  // What each stage got stays on the plan run page.
  await expect(
    main(page).getByRole("region", { name: "Skills by stage" })
  ).toHaveCount(0);
});

test("the Migration tab says its latest run is one of several and links to the Plan runs tab", async ({
  page,
}) => {
  // Partner Portal's Run #4 failed: run Java lift and shift again.
  await bootMockApi(page);
  await startPlan(page, 7, "3");
  await spaNavigate(page, "/applications/7?tab=migration");
  const latest = main(page).getByRole("region", { name: "Latest plan run" });
  await expect(latest).toContainText(
    "The latest of 2 plan runs on this application."
  );
  await latest.getByRole("link", { name: "View plan runs" }).click();
  await expect(
    page.getByRole("tab", { name: "Plan runs", selected: true })
  ).toBeVisible();
  await expect(
    main(page).getByRole("heading", { level: 2, name: "Plan runs (2)" })
  ).toBeVisible();
});
