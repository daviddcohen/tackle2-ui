/**
 * Navigation context journeys: trails survive reload, Back/Forward, tab and
 * table state changes, scenario switches, viewport sizes and new tabs; they
 * reset on persona change and reset. See docs/navigation-context-handoff.md.
 */
import type { Page } from "@playwright/test";

import {
  appPath,
  breadcrumb,
  currentCrumb,
  expect,
  fixtureGraph,
  main,
  mainHeading,
  personaSelect,
  protoUrl,
  scenarioSelect,
  sidebar,
  switcher,
  test,
  withBase,
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
  await page
    .locator(`main a[href^="${withBase("/plan-runs/")}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(/\/plan-runs\/\d+/);
  const runURL = page.url();
  await page
    .getByRole("grid", { name: "Skills", exact: true })
    .getByRole("link", { name: "Jakarta EE namespace migration" })
    .click();
  await associationsTab(page).click();
  await expect(page).toHaveURL(/tab=associations/);
  const skillURL = page.url();
  await expect(crumbItems(page)).toHaveCount(4);
  const skillTitles = await crumbTitles(page);
  // The archetype drawer's title is the leaf: its trail lists ancestors only.
  await page
    .locator(`main a[href^="${withBase("/archetypes?")}"]`)
    .first()
    .click();
  await expect(crumbItems(page)).toHaveCount(4);
  await page.reload();
  await expect(crumbItems(page)).toHaveCount(4);
  await breadcrumb(page)
    .getByRole("link", { name: skillTitles.at(-1), exact: true })
    .click();
  await expect(page).toHaveURL(skillURL);
  await expect(associationsTab(page)).toHaveAttribute("aria-selected", "true");
  // Target profiles keep their owning archetype before the leaf.
  await page.locator('main a[href*="/target-profiles"]').first().click();
  await expect(crumbItems(page)).toHaveCount(6);
  await expect(page.locator("tr:focus")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(skillURL);
  await page
    .locator(`main a[href^="${withBase("/migration-plans/")}"]`)
    .first()
    .click();
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
  // The row's skills summary and plan count also open the agent.
  const agentLinks = page
    .locator("main")
    .getByRole("link", { name: "Code Migrator", exact: true });
  await expect(agentLinks).toHaveCount(1);
  const listURL = page.url();
  await agentLinks.click();
  await page.getByRole("tab", { name: "Runs", exact: true }).click();
  await expect(page).toHaveURL(/tab=runs/);
  await page.locator('main a[href*="/stages/"]').first().click();
  await expect(crumbItems(page)).toHaveCount(3);
  await scenarioSelect(page).selectOption("failed");
  await expect(crumbItems(page)).toHaveCount(3);
  await breadcrumb(page)
    .getByRole("link", { name: "Code Migrator", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Runs", exact: true })
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
  await page
    .locator(`main a[href^="${withBase("/skills/")}"]`)
    .first()
    .click();
  await expect(crumbItems(page)).toHaveCount(2);
  await expect(
    breadcrumb(page).getByRole("link", { name: "Skills", exact: true })
  ).toBeVisible();
});

test("returning through an Agent association restores the saved runs tab and truncates the cycle", async ({
  page,
}) => {
  await page.goto(view("/agents/2?tab=runs"));
  await page
    .locator(`main a[href^="${withBase("/plan-runs/1/stages/2")}"]`)
    .click();
  // The stage page reaches skills through its run (the run's Skills section).
  await page.locator(`main a[href="${withBase("/plan-runs/1")}"]`).click();
  await page.locator(`main a[href^="${withBase("/skills/2?")}"]`).click();
  await associationsTab(page).click();
  await page
    .locator(
      `main a[href^="${withBase("/agents/2")}"]:not(.pf-v6-c-breadcrumb__link)`
    )
    .click();
  await expect(crumbItems(page)).toHaveCount(2);
  await expect(
    page.getByRole("tab", { name: "Runs", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await expect(currentCrumb(page)).toHaveText("Code Migrator");
});

test("every Agents list Skills link preserves the list context", async ({
  page,
}) => {
  await page.goto(view("/agents"));
  const graph = await fixtureGraph(page);
  let onList = true;
  for (const agent of graph.agents) {
    const collections = agent.skillCollections ?? [];
    if (agent.skills.length === 0 && collections.length === 0) continue;
    // Back to the list through its crumb, not with a full page load per
    // agent: the loop then stays well inside the test timeout on a busy
    // machine.
    if (!onList)
      await breadcrumb(page)
        .getByRole("link", { name: "Agents", exact: true })
        .click();
    const row = page.getByRole("row").filter({
      has: page.getByRole("link", { name: agent.name, exact: true }),
    });
    // One skill and no collection is the skill itself; otherwise the
    // summary opens the agent, whose Details tab lists them.
    const single = agent.skills.length === 1 && collections.length === 0;
    await (
      single
        ? // A plan can share the skill's name: pick the skill's own link.
          row.locator(`a[href^="${withBase(`/skills/${agent.skills[0].id}`)}"]`)
        : row.getByRole("link", { name: /^\d+ (skill|collection)/ })
    ).click();
    await expect(currentCrumb(page)).toHaveText(
      single ? agent.skills[0].name : agent.name
    );
    await expect(
      breadcrumb(page).getByRole("link", { name: "Agents", exact: true })
    ).toBeVisible();
    onList = false;
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
  const drawerHeading = page
    .locator("#page-drawer-content")
    .getByRole("heading", { name: "Java EE Application", exact: true });
  // The drawer title is the leaf; the trail above it ends at the skill.
  await expect(drawerHeading).toBeVisible();
  await expect(currentCrumb(page)).toHaveCount(0);
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
    .getByRole("button", { name: "Run on 1 application", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      /^\/plan-runs\/\d+$/.test(appPath(url.pathname)) &&
      url.searchParams.get("protoScenario") === "configured"
  );
  await breadcrumb(page)
    .getByRole("link", { name: "Application inventory", exact: true })
    .click();
  // Starting a migration does not switch the global prototype scenario; the
  // started run itself is Pending/Running.
  await expect(scenarioSelect(page)).toHaveValue("configured");
  await expect(page).toHaveURL(
    (url) => appPath(url.pathname) === "/applications"
  );
});

test("an unavailable associated entity retains breadcrumbs back to the originating view", async ({
  page,
}) => {
  await page.goto(view("/skills/2?tab=associations"));
  const applicationLink = page
    .locator(`main a[href^="${withBase("/applications/")}"]`)
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
      appPath(url.pathname) === "/skills/2" &&
      url.searchParams.get("tab") === "associations"
  );
});

for (const action of ["persona", "reset"] as const) {
  test(`${action} changes start a fresh navigation trail even on the same Inventory route`, async ({
    page,
  }) => {
    await page.goto(view("/skills/2?tab=associations"));
    await page.locator(`main a[href^="${withBase("/archetypes?")}"]`).click();
    await page
      .locator(`#page-drawer-content a[href^="${withBase("/applications?")}"]`)
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
    await expect(page).toHaveURL(
      (url) => appPath(url.pathname) === "/applications"
    );
    await expect(breadcrumb(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("filters")).toBe(false);
  });
}

test("Archetype application counts apply their filter when Inventory is an ancestor", async ({
  page,
}) => {
  await page.goto(view("/applications"));
  await page.locator(`main a[href="${withBase("/applications/1")}"]`).click();
  await page.getByRole("tab", { name: "Skills", exact: true }).click();
  // Skill sources are plain text: reach the archetype through the skill.
  await page
    .getByRole("grid", { name: "Skills", exact: true })
    .getByRole("link", { name: "EJB to CDI conversion patterns" })
    .click();
  await associationsTab(page).click();
  await page
    .locator(`main a[href^="${withBase("/archetypes?")}"]`)
    .first()
    .click();
  await page
    .locator("#page-drawer-content")
    .getByRole("tabpanel", { name: "Details", exact: true })
    .getByRole("link", { name: /^\d+ applications?$/ })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      appPath(url.pathname) === "/applications" &&
      url.searchParams.get("filters")?.includes("Java EE Application") === true
  );
  await expect(
    page.getByRole("button", { name: "Close Java EE Application", exact: true })
  ).toBeVisible();
  await expect(breadcrumb(page)).toHaveCount(0);
});

test("The applications count applies the Plan filter when returning to an ancestor inventory", async ({
  page,
}) => {
  await page.goto(view("/applications"));
  await page
    .locator(`main a[href="${withBase("/applications/1")}"]`)
    .first()
    .click();
  await page.getByRole("tab", { name: "Plan runs", exact: true }).click();
  await page
    .locator(`main a[href^="${withBase("/migration-plans/1")}"]`)
    .first()
    .click();
  await main(page)
    .locator("dl")
    .getByRole("link", { name: /^\d+ applications?$/ })
    .click();
  // The inventory is filtered to the applications whose migration uses the
  // Plan, the same set the link counts.
  await expect(page).toHaveURL(
    (url) =>
      appPath(url.pathname) === "/applications" &&
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
    await page
      .locator(`main a[href^="${withBase("/plan-runs/")}"]`)
      .first()
      .click();
    await page
      .getByRole("grid", { name: "Skills", exact: true })
      .getByRole("link", { name: "Jakarta EE namespace migration" })
      .click();
    await associationsTab(page).click();
    await page
      .locator(`main a[href^="${withBase("/migration-plans/")}"]`)
      .first()
      .click();
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
    // The drawer trail lists ancestors only; the target profiles trail adds
    // the owning archetype before its leaf. Both end at the skill.
    for (const [selector, crumbs] of [
      [`main a[href^="${withBase("/archetypes?")}"]`, 4],
      ['main a[href*="/target-profiles"]', 6],
    ] as const) {
      await page.locator(selector).first().click();
      await expect(crumbItems(page)).toHaveCount(crumbs);
      await expectInViewport();
      if (selector.includes("target-profiles"))
        await expect(page.locator("tr:focus")).toBeVisible();
      await breadcrumb(page)
        .getByRole("link", {
          name: "Jakarta EE namespace migration",
          exact: true,
        })
        .click();
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
  // The stage page reaches skills through its run.
  await page.locator(`main a[href="${withBase("/plan-runs/1")}"]`).click();
  await page
    .locator(`main a[href^="${withBase("/skills/")}"]`)
    .first()
    .click();
  await expect(crumbItems(page)).toHaveCount(5);
  const href = page.url();
  const newTab = await context.newPage();
  await newTab.goto(href);
  await expect(crumbItems(newTab)).toHaveCount(3);
  await expect(
    breadcrumb(newTab).getByRole("link", { name: /Run #1/ })
  ).toBeVisible();
  await newTab.goto(view("/archetypes/1/target-profiles#target-profile-11"));
  await expect(crumbItems(newTab)).toHaveCount(3);
  await expect(currentCrumb(newTab)).toHaveText("Target profiles");
  await newTab.close();
});

test("application details handle delayed, failed and missing entity reads without a broken page", async ({
  page,
}) => {
  // Two waits of up to 20s each (apiError retries, loading delay) do not fit
  // the default 30s test timeout under parallel workers.
  test.setTimeout(60_000);
  await page.goto(view("/applications/999999"));
  // A missing application (404) is "not found", not an API error, with the
  // way back to the inventory (the shared detail states).
  await expect(mainHeading(page)).toHaveText("Application not found");
  await expect(
    page.getByRole("button", { name: "Back to application inventory" })
  ).toBeVisible();
  await page.goto(protoUrl("/applications/1", { scenario: "apiError" }));
  await expect(page.getByText("Unable to connect")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/not found/i)).toHaveCount(0);
  await page.goto(protoUrl("/applications/1", { scenario: "loading" }));
  // The shared loading page: the trail with the noun, no title yet.
  await expect(currentCrumb(page)).toHaveText("Application");
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 })
  ).toHaveCount(0);
  // The loading scenario delays every response.
  await expect(
    page.getByRole("heading", { name: "Customer Management", exact: true })
  ).toBeVisible({ timeout: 20_000 });
});

test("a failed refresh of a loaded application is said first in the open tab", async ({
  page,
}) => {
  // The first poll after the switch to apiError (5 s) is retried before it
  // fails, so the alert takes up to about 20 s.
  test.setTimeout(60_000);
  await page.goto(protoUrl("/applications"));
  const { applications } = await fixtureGraph(page);
  const application = applications[0];
  await page.goto(
    protoUrl(`/applications/${application.id}`, {
      params: { tab: "plan-runs" },
    })
  );
  await expect(mainHeading(page)).toHaveText(application.name);
  // The mock reads the scenario from the URL on every request.
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("protoScenario", "apiError");
    window.history.replaceState(window.history.state, "", url);
  });
  const panel = main(page).getByRole("tabpanel");
  await expect(
    panel.getByRole("heading", {
      name: "Danger alert: Error loading application",
    })
  ).toBeVisible({ timeout: 25_000 });
  // The page keeps its header and tabs; the alert is tab content.
  await expect(mainHeading(page)).toHaveText(application.name);
  await expect(main(page).getByRole("tablist")).toBeVisible();
  await expect(
    main(page).getByRole("heading", {
      name: "Danger alert: Error loading application",
    })
  ).toHaveCount(1);
});
