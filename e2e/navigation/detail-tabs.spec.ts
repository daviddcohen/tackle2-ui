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

test("the Skills tab link opens the Migration tab on its section, focused", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications/3?tab=skills"));
  // Claims Processing was in Run #1: the link opens that run's skills.
  await main(page)
    .getByRole("link", { name: "See what each stage got in the latest run" })
    .click();
  await expect(page).toHaveURL(/tab=migration.*#skills-by-stage$/);
  await expect(
    page.getByRole("tab", { name: "Migration", selected: true })
  ).toBeVisible();
  await expect(
    main(page).getByRole("heading", { name: "Skills by stage", level: 2 })
  ).toBeFocused();
});

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
  await spaNavigate(page, "/applications/4?tab=migration");
  const stages = main(page).getByRole("region", { name: "Stages" });
  await expect(stages).toContainText(
    "The latest run ran Java lift and shift. This application's migration plan is Spring Boot to Quarkus."
  );
  await expect(
    stages.getByRole("link", { name: "latest run", exact: true })
  ).toHaveAttribute("href", /\/plan-runs\/\d+/);
  await expect(
    stages.getByRole("link", { name: "Spring Boot to Quarkus", exact: true })
  ).toHaveAttribute("href", /\/migration-plans\/2(\?|$)/);
  // Skills by stage is the latest run's snapshot, not the next run's plan.
  const skills = main(page).getByRole("region", { name: "Skills by stage" });
  await expect(skills).toContainText(
    /What each stage got for this application in Run #\d+: Java lift and shift, its latest plan run\./
  );
});

test("the Migration tab says when the latest run ran a plan none of its target profiles uses", async ({
  page,
}) => {
  // Customer Management (Java EE Application) runs Java EE to Quarkus or
  // Java lift and shift, one per target profile, so it has no single plan.
  await bootMockApi(page);
  await startPlan(page, 1, "2");
  await spaNavigate(page, "/applications/1?tab=migration");
  const stages = main(page).getByRole("region", { name: "Stages" });
  await expect(stages).toContainText(
    "The latest run ran Spring Boot to Quarkus, which none of this application's target profiles uses."
  );
  await expect(
    stages.getByRole("link", { name: "Spring Boot to Quarkus", exact: true })
  ).toHaveAttribute("href", /\/migration-plans\/2(\?|$)/);
});

test("the Migration tab names no other plan when the latest run ran one of its target profiles' plans", async ({
  page,
}) => {
  // Partner Portal's latest run ran Java lift and shift, the plan of its
  // OpenJDK 21 on OpenShift target profile.
  await page.goto(protoUrl("/applications/7?tab=migration"));
  const skills = main(page).getByRole("region", { name: "Skills by stage" });
  await expect(skills).toContainText(
    "What each stage got for this application in Run #4: Java lift and shift, its latest plan run."
  );
  await expect(
    skills.getByRole("link", { name: "Run #4: Java lift and shift" })
  ).toHaveAttribute("href", /\/plan-runs\/4(\?|$)/);
  const stages = main(page).getByRole("region", { name: "Stages" });
  await expect(stages).not.toContainText("The latest run ran");
});
