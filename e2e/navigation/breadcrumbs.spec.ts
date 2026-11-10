import type { Page } from "@playwright/test";

import {
  breadcrumb,
  breadcrumbTitles,
  expect,
  main,
  mainHeading,
  protoUrl,
  test,
} from "../support";

interface Visit {
  url: string;
  crumbs: string[];
}

const currentPath = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search + url.hash;
};

/** Records the settled URL and trail of the current page. */
const visit = async (page: Page): Promise<Visit> => {
  await expect(mainHeading(page)).toBeVisible();
  await expect(breadcrumb(page)).toBeVisible();
  return { url: currentPath(page), crumbs: await breadcrumbTitles(page) };
};

const expectExtends = (child: Visit, parent: Visit) => {
  expect(child.crumbs.length).toBe(parent.crumbs.length + 1);
  // The parent's current (plain-text) crumb becomes a link with the same title.
  expect(child.crumbs.slice(0, -1)).toEqual(parent.crumbs);
};

test("an eight-level cross-entity journey keeps a coherent trail and every crumb returns to the exact view", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(
    protoUrl("/applications", {
      persona: "enterpriseArchitect",
      scenario: "completed",
      stage: 4,
    })
  );
  await expect(mainHeading(page)).toHaveText("Application inventory");
  const visits: Visit[] = [];

  // Application inventory -> application
  await main(page)
    .getByRole("link", { name: "Customer Management", exact: true })
    .click();
  await expect(mainHeading(page)).toHaveText("Customer Management");
  await page.getByRole("tab", { name: /Plan runs/ }).click();
  await expect(page).toHaveURL(/tab=plan-runs/);
  visits.push(await visit(page));

  // application -> plan run
  await main(page)
    .getByRole("link", { name: /^Run #1 — / })
    .first()
    .click();
  await expect(mainHeading(page)).toHaveText(/^Run #1 — /);
  visits.push(await visit(page));

  // plan run -> stage run
  await main(page).getByRole("link", { name: "View run" }).nth(1).click();
  await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/2/);
  visits.push(await visit(page));

  // stage run -> agent
  await main(page)
    .getByRole("link", { name: "Code Migrator", exact: true })
    .first()
    .click();
  await expect(mainHeading(page)).toHaveText("Code Migrator");
  visits.push(await visit(page));

  // agent -> skill
  const skillLink = main(page)
    .locator('a[href^="/skills/"]:not([href^="/skills/collections"])')
    .first();
  const skillName = (await skillLink.innerText()).trim();
  await skillLink.click();
  await expect(mainHeading(page)).toHaveText(skillName);
  await page.getByRole("tab", { name: /Associations/ }).click();
  await expect(page).toHaveURL(/tab=associations/);
  visits.push(await visit(page));

  // skill -> plan
  const planLink = main(page).locator('a[href^="/migration-plans/"]').first();
  const planName = (await planLink.innerText()).trim();
  await planLink.click();
  await expect(mainHeading(page)).toHaveText(planName);
  visits.push(await visit(page));

  // plan -> agent
  await main(page)
    .getByRole("link", { name: "Migration Proposal Agent", exact: true })
    .first()
    .click();
  await expect(mainHeading(page)).toHaveText("Migration Proposal Agent");
  visits.push(await visit(page));

  // agent -> skill collection
  await main(page)
    .getByRole("link", { name: "Java modernization foundation", exact: true })
    .click();
  await expect(mainHeading(page)).toHaveText("Java modernization foundation");
  visits.push(await visit(page));

  expect(visits[0].crumbs).toEqual([
    "Application inventory",
    "Customer Management",
  ]);
  for (let i = 1; i < visits.length; i++)
    expectExtends(visits[i], visits[i - 1]);
  const deepest = visits[visits.length - 1];

  // Reload keeps the trail (history state survives a refresh).
  await page.reload();
  await expect.poll(() => breadcrumbTitles(page)).toEqual(deepest.crumbs);

  // Back and Forward restore each entry's own trail.
  await page.goBack();
  await expect
    .poll(() => breadcrumbTitles(page))
    .toEqual(visits[visits.length - 2].crumbs);
  await page.goForward();
  await expect.poll(() => breadcrumbTitles(page)).toEqual(deepest.crumbs);

  // Every ancestor crumb returns to that exact view (tabs included) with its
  // own trail; Back then restores the deepest entry for the next crumb.
  for (let i = visits.length - 2; i >= 0; i--) {
    const target = visits[i];
    await breadcrumb(page)
      .getByRole("listitem")
      .nth(target.crumbs.length - 1)
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(target.url);
    await expect.poll(() => breadcrumbTitles(page)).toEqual(target.crumbs);
    await page.goBack();
    await expect.poll(() => breadcrumbTitles(page)).toEqual(deepest.crumbs);
  }

  // The root crumb returns to the inventory list.
  await breadcrumb(page)
    .getByRole("link", { name: "Application inventory", exact: true })
    .click();
  await expect(mainHeading(page)).toHaveText("Application inventory");
});

test("returning to an entity already in the trail truncates the cycle", async ({
  page,
}) => {
  await page.goto(
    protoUrl("/agents/2", {
      persona: "enterpriseArchitect",
      scenario: "completed",
      stage: 4,
    })
  );
  await expect(mainHeading(page)).toHaveText("Code Migrator");
  const skillLink = main(page)
    .locator('a[href^="/skills/"]:not([href^="/skills/collections"])')
    .first();
  await skillLink.click();
  await page.getByRole("tab", { name: /Associations/ }).click();
  await main(page)
    .getByRole("link", { name: "Code Migrator", exact: true })
    .first()
    .click();
  await expect(mainHeading(page)).toHaveText("Code Migrator");
  await expect
    .poll(() => breadcrumbTitles(page))
    .toEqual(["Agents", "Code Migrator"]);
});

test("cold deep links use the canonical hierarchy and each crumb works", async ({
  page,
}) => {
  for (const [path, crumbs] of [
    [
      "/plan-runs/1/stages/2",
      ["Plan Runs", "Run #1 — Java EE to Quarkus", "Migrate"],
    ],
    ["/skills/collections/1", ["Skills", "Java modernization foundation"]],
    [
      "/archetypes/1/target-profiles",
      ["Archetypes", "Java EE Application", "Target profiles"],
    ],
  ] as const) {
    await page.goto(protoUrl(path));
    await expect.poll(() => breadcrumbTitles(page)).toEqual([...crumbs]);
    for (let i = crumbs.length - 2; i >= 0; i--) {
      await page.goto(protoUrl(path));
      await expect.poll(() => breadcrumbTitles(page)).toEqual([...crumbs]);
      await breadcrumb(page)
        .getByRole("link", { name: crumbs[i], exact: true })
        .click();
      await expect(mainHeading(page)).toBeVisible();
      await expect(page).not.toHaveURL(new RegExp(`${path}(\\?|$)`));
    }
  }
});

test("an archetype crumb on the target-profiles page reopens that archetype's drawer", async ({
  page,
}) => {
  await page.goto(protoUrl("/archetypes/1/target-profiles"));
  await breadcrumb(page)
    .getByRole("link", { name: "Java EE Application", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/archetypes\?.*ar%3AactiveItem=1|\/archetypes\?.*ar:activeItem=1/
  );
  await expect(
    page.getByRole("heading", { name: "Java EE Application", level: 2 })
  ).toBeVisible();
});

test("a not-found detail keeps the trail it was reached from", async ({
  page,
}) => {
  await page.goto(
    protoUrl("/plan-runs/1", {
      persona: "enterpriseArchitect",
      scenario: "completed",
      stage: 4,
    })
  );
  await expect(mainHeading(page)).toHaveText(/^Run #1 — /);
  // Simulate the stage disappearing: navigate within the SPA with the run's trail.
  await page.evaluate(() => {
    const crumbs = [
      { title: "Plan Runs", path: "/plan-runs" },
      { title: "Run #1 — Java EE to Quarkus", path: "/plan-runs/1" },
    ];
    window.history.pushState(
      { state: { breadcrumbs: crumbs } },
      "",
      "/plan-runs/1/stages/99999"
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { state: { breadcrumbs: crumbs } },
      })
    );
  });
  await expect(page.getByText("Stage run not found").first()).toBeVisible();
  await expect
    .poll(() => breadcrumbTitles(page))
    .toEqual([
      "Plan Runs",
      "Run #1 — Java EE to Quarkus",
      "Stage run not found",
    ]);
});
