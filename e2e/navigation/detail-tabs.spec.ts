/**
 * Entity detail pages: the inventory opens a full application page (it
 * replaced upstream's drawer), tabs are URL-backed (`?tab=`) and an unknown
 * tab value falls back to the first tab.
 */
import {
  breadcrumb,
  expect,
  main,
  mainHeading,
  protoUrl,
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

test("See skills by stage opens the Migration tab on its section, focused", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications/3?tab=skills"));
  await main(page).getByRole("link", { name: "See skills by stage" }).click();
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

test("the Migration tab names both plans when the latest run ran another one", async ({
  page,
}) => {
  // Partner Portal's latest run ran Java EE lift and shift; its own plan is
  // Java EE to Quarkus.
  await page.goto(protoUrl("/applications/7?tab=migration"));
  const stages = main(page).getByRole("region", { name: "Stages" });
  await expect(stages).toContainText(
    "The latest run ran Java EE lift and shift. This application's migration plan is Java EE to Quarkus."
  );
  await expect(
    stages.getByRole("link", { name: "latest run", exact: true })
  ).toHaveAttribute("href", /\/plan-runs\/\d+/);
  await expect(
    stages.getByRole("link", { name: "Java EE to Quarkus", exact: true })
  ).toHaveAttribute("href", /\/migration-plans\/1(\?|$)/);
  await expect(
    main(page).getByRole("region", { name: "Skills by stage" })
  ).toContainText(
    "The next time Java EE to Quarkus runs on this application, each stage's agent gets these skills."
  );
});
