/**
 * Navigation context journeys: trails survive reload, Back/Forward, tab and
 * table state changes, scenario switches, viewport sizes and new tabs; they
 * reset on persona change and reset. See docs/navigation-context-handoff.md.
 */
import type { Page } from "@playwright/test";

import {
  breadcrumb,
  currentCrumb,
  expect,
  fixtureGraph,
  personaSelect,
  protoUrl,
  scenarioSelect,
  sidebar,
  switcher,
  test,
} from "../support";

const state = { scenario: "completed", stage: 4 } as const;
const view = (path: string) => protoUrl(path, state);

const crumbItems = (page: Page) => breadcrumb(page).getByRole("listitem");
const crumbTitles = async (page: Page) =>
  (await crumbItems(page).allTextContents()).map((text) => text.trim());
const associationsTab = (page: Page) =>
  page.getByRole("tab", { name: /^Associations/ });

test("deep application, run, skill and association journeys retain tabs, survive reload and truncate cycles", async ({
  page,
}) => {
  await page.goto(view("/applications/1?tab=plan-runs"));
  await page.locator('main a[href^="/plan-runs/"]').first().click();
  await expect(page).toHaveURL(/\/plan-runs\/\d+/);
  const runURL = page.url();
  await page
    .getByRole("grid", { name: "Resolved skills table" })
    .getByRole("link")
    .first()
    .click();
  await associationsTab(page).click();
  await expect(page).toHaveURL(/tab=associations/);
  const skillURL = page.url();
  await expect(crumbItems(page)).toHaveCount(4);
  const skillTitles = await crumbTitles(page);
  await page.locator('main a[href^="/archetypes?"]').first().click();
  await expect(crumbItems(page)).toHaveCount(5);
  await page.reload();
  await expect(crumbItems(page)).toHaveCount(5);
  await breadcrumb(page)
    .getByRole("link", { name: skillTitles.at(-1), exact: true })
    .click();
  await expect(page).toHaveURL(skillURL);
  await expect(associationsTab(page)).toHaveAttribute("aria-selected", "true");
  await page.locator('main a[href*="/target-profiles"]').first().click();
  await expect(crumbItems(page)).toHaveCount(5);
  await expect(page.locator("tr:focus")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(skillURL);
  await page.locator('main a[href^="/migration-plans/"]').first().click();
  await expect(crumbItems(page)).toHaveCount(5);
  await breadcrumb(page)
    .getByRole("link", { name: skillTitles[2], exact: true })
    .click();
  await expect(page).toHaveURL(runURL);
  await expect(crumbItems(page)).toHaveCount(3);
  expect(await crumbTitles(page)).toEqual(skillTitles.slice(0, 3));
  await page.goBack();
  await expect(crumbItems(page)).toHaveCount(5);
  await page.goForward();
  await expect(page).toHaveURL(runURL);
});

test("tabs, table filters, scenario changes and sidebar navigation have explicit context behavior", async ({
  page,
}) => {
  await page.goto(view("/agents"));
  const nameFilter = page.getByRole("searchbox", {
    name: "Name filter",
    exact: true,
  });
  await nameFilter.fill("Code Migrator");
  await nameFilter.press("Enter");
  const agentLinks = page.locator('main a[href^="/agents/"]');
  await expect(agentLinks).toHaveCount(1);
  const listURL = page.url();
  await agentLinks.click();
  await page.getByRole("tab", { name: "Agent runs", exact: true }).click();
  await expect(page).toHaveURL(/tab=runs/);
  await page.locator('main a[href*="/stages/"]').first().click();
  await expect(crumbItems(page)).toHaveCount(3);
  await scenarioSelect(page).selectOption("failed");
  await expect(crumbItems(page)).toHaveCount(3);
  await breadcrumb(page)
    .getByRole("link", { name: "Code Migrator", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Agent runs", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await expect(scenarioSelect(page)).toHaveValue("failed");
  await expect(page).toHaveURL(/tab=runs/);
  await breadcrumb(page)
    .getByRole("link", { name: "Agents", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("agents:filters") ===
      new URL(listURL).searchParams.get("agents:filters")
  );
  await expect(agentLinks).toHaveCount(1);
  await sidebar(page)
    .getByRole("link", { name: "Skills", exact: true })
    .click();
  await page.locator('main a[href^="/skills/"]').first().click();
  await expect(crumbItems(page)).toHaveCount(2);
  await expect(
    breadcrumb(page).getByRole("link", { name: "Skills", exact: true })
  ).toBeVisible();
});

test("returning through an Agent association restores the saved runs tab and truncates the cycle", async ({
  page,
}) => {
  await page.goto(view("/agents/2?tab=runs"));
  await page.locator('main a[href^="/plan-runs/1/stages/2"]').click();
  await page.locator('main a[href^="/skills/2?"]').click();
  await associationsTab(page).click();
  await page
    .locator('main a[href^="/agents/2"]:not(.pf-v6-c-breadcrumb__link)')
    .click();
  await expect(crumbItems(page)).toHaveCount(2);
  await expect(
    page.getByRole("tab", { name: "Agent runs", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await expect(currentCrumb(page)).toHaveText("Code Migrator");
});

test("every Agent Skills dialog link preserves the list context", async ({
  page,
}) => {
  await page.goto(view("/agents"));
  const graph = await fixtureGraph(page);
  for (const agent of graph.agents) {
    for (const skill of agent.skills) {
      await page.goto(view("/agents"));
      await page
        .getByRole("button", {
          name: `View Skills for ${agent.name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: skill.name, exact: true })
        .click();
      await expect(currentCrumb(page)).toHaveText(skill.name);
      await expect(
        breadcrumb(page).getByRole("link", { name: "Agents", exact: true })
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  }
});

test("selected Archetype drawers survive pagination and filtering without losing the originating Skill", async ({
  page,
}) => {
  await page.goto(
    view(
      "/archetypes?ar:activeItem=1&ar:itemsPerPage=2&ar:pageNumber=1&from=skill-2"
    )
  );
  await expect(currentCrumb(page)).toHaveText("Java EE Application");
  const drawerHeading = page
    .locator("#page-drawer-content")
    .getByRole("heading", { name: "Java EE Application", exact: true });
  const nextPage = page
    .getByRole("button", { name: "Go to next page", exact: true })
    .first();
  await nextPage.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("ar:pageNumber") === "2"
  );
  await expect(drawerHeading).toBeVisible();
  const nameFilter = page.getByRole("searchbox", {
    name: "Name filter",
    exact: true,
  });
  await nameFilter.fill("Node.js");
  await nameFilter.press("Enter");
  await expect(drawerHeading).toBeVisible();
  await expect(
    breadcrumb(page).getByRole("link", {
      name: "EJB to CDI conversion patterns",
      exact: true,
    })
  ).toBeVisible();
});

test("launching a migration keeps the global scenario when returning to Inventory", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications", { scenario: "configured" }));
  const row = page.getByRole("row").filter({
    has: page.getByRole("link", { name: "Customer Management", exact: true }),
  });
  await row.getByRole("button", { name: "Row actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Run migration plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start 1 Ready Application", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      /^\/plan-runs\/\d+$/.test(url.pathname) &&
      url.searchParams.get("protoScenario") === "configured"
  );
  await breadcrumb(page)
    .getByRole("link", { name: "Application inventory", exact: true })
    .click();
  // Starting a migration does not switch the global prototype scenario; the
  // started run itself is Pending/Running.
  await expect(scenarioSelect(page)).toHaveValue("configured");
  await expect(page).toHaveURL((url) => url.pathname === "/applications");
});

test("an unavailable associated entity retains breadcrumbs back to the originating view", async ({
  page,
}) => {
  await page.goto(view("/skills/2?tab=associations"));
  const applicationLink = page
    .locator('main a[href^="/applications/"]')
    .first();
  const applicationName = await applicationLink.innerText();
  await applicationLink.click();
  await expect(
    page.getByRole("heading", { name: applicationName, exact: true })
  ).toBeVisible();
  await scenarioSelect(page).selectOption("apiError");
  // React Query retries before it reports the error.
  await expect(
    page.getByRole("heading", {
      name: "Danger alert: Error loading application",
      exact: true,
    })
  ).toBeVisible({ timeout: 20_000 });
  const skillCrumb = breadcrumb(page).getByRole("link", {
    name: "EJB to CDI conversion patterns",
    exact: true,
  });
  await expect(skillCrumb).toBeVisible();
  await skillCrumb.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/skills/2" &&
      url.searchParams.get("tab") === "associations"
  );
});

for (const action of ["persona", "reset"] as const) {
  test(`${action} changes start a fresh navigation trail even on the same Inventory route`, async ({
    page,
  }) => {
    await page.goto(view("/skills/2?tab=associations"));
    await page.locator('main a[href^="/archetypes?"]').click();
    await page
      .locator('#page-drawer-content a[href^="/applications?"]')
      .click();
    await expect(crumbItems(page)).toHaveCount(4);
    if (action === "persona") {
      await personaSelect(page).selectOption("hubMigrator");
      await expect(personaSelect(page)).toHaveValue("hubMigrator");
    } else {
      await switcher(page)
        .getByRole("button", { name: "Reset Prototype", exact: true })
        .click();
      await expect(scenarioSelect(page)).toHaveValue("configured");
    }
    await expect(page).toHaveURL((url) => url.pathname === "/applications");
    await expect(breadcrumb(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("filters")).toBe(false);
  });
}

test("Archetype application counts apply their filter when Inventory is an ancestor", async ({
  page,
}) => {
  await page.goto(view("/applications"));
  await page.locator('main a[href="/applications/1"]').click();
  await page.getByRole("tab", { name: "Skills", exact: true }).click();
  await page.locator('main a[href^="/archetypes?"]').first().click();
  await page
    .locator("#page-drawer-content")
    .getByRole("tabpanel", { name: "Details", exact: true })
    .getByRole("link", { name: /^\d+ applications?$/ })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/applications" &&
      url.searchParams.get("filters")?.includes("Java EE Application") === true
  );
  await expect(
    page.getByRole("button", { name: "Close Java EE Application", exact: true })
  ).toBeVisible();
  await expect(breadcrumb(page)).toHaveCount(0);
});

test("View applications applies the Plan filter when returning to an ancestor inventory", async ({
  page,
}) => {
  await page.goto(view("/applications"));
  await page.locator('main a[href="/applications/1"]').first().click();
  await page.getByRole("tab", { name: "Plan runs", exact: true }).click();
  await page.locator('main a[href^="/migration-plans/1"]').first().click();
  await page.getByRole("button", { name: /^View \d+ applications$/ }).click();
  // The inventory is filtered to the applications whose migration uses the
  // Plan, the same set the button counts.
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/applications" &&
      url.searchParams.get("filters")?.includes("migrationPlan") === true
  );
  await expect(
    page.getByRole("button", { name: "Close Java EE to Quarkus", exact: true })
  ).toBeVisible();
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["tablet", { width: 768, height: 1024 }],
  ["mobile", { width: 375, height: 812 }],
] as const) {
  test(`deep breadcrumbs remain visible and keyboard accessible at ${name} size`, async ({
    page,
  }) => {
    const expectInViewport = async () => {
      const bounds = await breadcrumb(page).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      for (const link of await breadcrumb(page).getByRole("link").all()) {
        await expect(link).toBeVisible();
        await link.click({ trial: true });
      }
    };
    await page.setViewportSize(viewport);
    await page.goto(view("/applications/1?tab=plan-runs"));
    await page.locator('main a[href^="/plan-runs/"]').first().click();
    await page
      .getByRole("grid", { name: "Resolved skills table" })
      .getByRole("link")
      .first()
      .click();
    await associationsTab(page).click();
    await page.locator('main a[href^="/migration-plans/"]').first().click();
    await expect(crumbItems(page)).toHaveCount(5);
    await expect(currentCrumb(page)).toHaveCount(1);
    await expectInViewport();
    const parent = breadcrumb(page).getByRole("link").last();
    await parent.focus();
    await expect(parent).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(associationsTab(page)).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(crumbItems(page)).toHaveCount(4);
    for (const selector of [
      'main a[href^="/archetypes?"]',
      'main a[href*="/target-profiles"]',
    ]) {
      await page.locator(selector).first().click();
      await expect(crumbItems(page)).toHaveCount(5);
      await expectInViewport();
      if (selector.includes("target-profiles"))
        await expect(page.locator("tr:focus")).toBeVisible();
      await breadcrumb(page).getByRole("link").last().click();
      await expect(associationsTab(page)).toHaveAttribute(
        "aria-selected",
        "true"
      );
    }
  });
}

test("cold links use the canonical hierarchy and a new tab has its own history", async ({
  page,
  context,
}) => {
  await page.goto(view("/plan-runs/1/stages/2?fromAgent=2"));
  await expect(
    breadcrumb(page).getByRole("link", { name: "Code Migrator", exact: true })
  ).toBeVisible();
  await page.locator('main a[href^="/skills/"]').first().click();
  await expect(crumbItems(page)).toHaveCount(4);
  const href = page.url();
  const newTab = await context.newPage();
  await newTab.goto(href);
  await expect(crumbItems(newTab)).toHaveCount(3);
  await expect(
    breadcrumb(newTab).getByRole("link", { name: /Run #1/ })
  ).toBeVisible();
  await newTab.goto(view("/archetypes/1/target-profiles#target-profile-11"));
  await expect(crumbItems(newTab)).toHaveCount(3);
  await expect(currentCrumb(newTab)).toHaveText("Quarkus 3.x");
  await newTab.close();
});

test("application details handle delayed, failed and missing entity reads without a broken page", async ({
  page,
}) => {
  await page.goto(view("/applications/999999"));
  // A missing application (404) is "not found", not an API error.
  await expect(
    page.getByRole("heading", {
      name: "Warning alert: Application not found",
      exact: true,
    })
  ).toBeVisible();
  await page.goto(protoUrl("/applications/1", { scenario: "apiError" }));
  await expect(
    page.getByRole("heading", {
      name: "Danger alert: Error loading application",
      exact: true,
    })
  ).toBeVisible({ timeout: 20_000 });
  await page.goto(protoUrl("/applications/1", { scenario: "loading" }));
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 })
  ).toHaveCount(0);
  // The loading scenario delays every response.
  await expect(
    page.getByRole("heading", { name: "Customer Management", exact: true })
  ).toBeVisible({ timeout: 20_000 });
});
