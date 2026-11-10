import {
  type Persona,
  expect,
  expectCanonicalProto,
  expectNavCurrent,
  mainHeading,
  perspectiveToggle,
  protoUrl,
  sidebar,
  test,
} from "../support";

const agenticItems = [
  { name: "Agents", href: "/agents", heading: "Agents" },
  {
    name: "Migration Plans",
    href: "/migration-plans",
    heading: "Migration Plans",
  },
  { name: "Plan Runs", href: "/plan-runs", heading: "Plan Runs" },
  { name: "Skills", href: "/skills", heading: "Skills" },
];

const migrationItems = [
  {
    name: "Application inventory",
    href: "/applications",
    heading: "Application inventory",
  },
  { name: "Archetypes", href: "/archetypes", heading: "Archetypes" },
  {
    name: "Migration waves",
    href: "/migration-waves",
    heading: "Migration waves",
  },
  { name: "Reports", href: "/reports" },
  { name: "Issues", href: "/issues/all", heading: "Issues" },
  { name: "Insights", href: "/insights/all", heading: "Insights" },
  { name: "Dependencies", href: "/dependencies", heading: "Dependencies" },
  {
    name: "Analysis Profiles",
    href: "/analysis-profiles",
    heading: "Analysis Profiles",
  },
  { name: "Controls", href: "/controls", heading: "Controls" },
  {
    name: "Custom migration targets",
    href: "/migration-targets",
    heading: "Custom migration targets",
  },
  { name: "Task Manager", href: "/tasks", heading: "Task Manager" },
];

const adminItems = [
  { name: "General", href: "/general", heading: "General configuration" },
  { name: "Credentials", href: "/identities", heading: "Credentials" },
  { name: "Providers", href: "/providers", heading: "Providers" },
  { name: "Models", href: "/models", heading: "Models" },
  { name: "Git", href: "/repositories/git", heading: "Git configuration" },
  {
    name: "Subversion",
    href: "/repositories/svn",
    heading: "Subversion configuration",
  },
  {
    name: "Maven",
    href: "/repositories/maven",
    heading: "Maven configuration",
  },
  { name: "Proxy", href: "/proxies", heading: "Proxy configuration" },
  { name: "Jira", href: "/jira", heading: "Jira configuration" },
  { name: "Assessment questionnaires", href: "/assessment" },
  {
    name: "Source platforms",
    href: "/source-platforms",
    heading: "Source platforms",
  },
  { name: "Generators", href: "/asset-generators", heading: "Generators" },
  { name: "Task Manager", href: "/tasks", heading: "Task Manager" },
  { name: "Users", href: "/users", heading: "Users" },
  { name: "Tokens", href: "/tokens", heading: "Tokens" },
  { name: "Roles", href: "/roles", heading: "Roles" },
  { name: "Scopes", href: "/scopes", heading: "Scopes" },
];

for (const persona of [
  "platformEngineer",
  "enterpriseArchitect",
  "hubMigrator",
] as Persona[]) {
  test(`${persona}: Migration sidebar exposes every item and the Agentic Migration group`, async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { persona }));
    await expect(mainHeading(page)).toHaveText("Application inventory");
    const nav = sidebar(page);
    await expect(
      nav.getByRole("button", { name: "Agentic Migration" })
    ).toBeVisible();
    for (const item of [...migrationItems, ...agenticItems]) {
      await expect(
        nav.getByRole("link", { name: item.name, exact: true })
      ).toHaveAttribute("href", item.href);
    }
    // Administration-only items never leak into the Migration perspective.
    for (const name of ["Models", "Providers", "General"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
    }
  });

  test(`${persona}: each agentic sidebar item opens its page, highlights itself and keeps prototype state`, async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { persona, scenario: "failed" }));
    await expect(mainHeading(page)).toHaveText("Application inventory");
    for (const item of agenticItems) {
      await sidebar(page)
        .getByRole("link", { name: item.name, exact: true })
        .click();
      await expect(mainHeading(page)).toHaveText(item.heading);
      await expectNavCurrent(page, item.name);
      await expectCanonicalProto(page, persona, "failed");
    }
  });
}

test("Administration sidebar lists every upstream item plus Providers and Models", async ({
  page,
}) => {
  await page.goto(protoUrl("/general", { persona: "platformEngineer" }));
  await expect(mainHeading(page)).toHaveText("General configuration");
  for (const item of adminItems) {
    await expect(
      sidebar(page).getByRole("link", { name: item.name, exact: true })
    ).toHaveAttribute("href", item.href);
  }
});

test("Administration sidebar items open their pages and highlight", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(protoUrl("/general", { persona: "platformEngineer" }));
  for (const item of adminItems.filter((entry) => entry.heading)) {
    await sidebar(page)
      .getByRole("link", { name: item.name, exact: true })
      .click();
    await expect(mainHeading(page)).toHaveText(item.heading!);
    await expectNavCurrent(page, item.name);
    await expect(perspectiveToggle(page)).toHaveText("Administration");
  }
});

test("Task Manager opened from Administration keeps the Administration sidebar", async ({
  page,
}) => {
  await page.goto(protoUrl("/models", { persona: "platformEngineer" }));
  await sidebar(page)
    .getByRole("link", { name: "Task Manager", exact: true })
    .click();
  await expect(mainHeading(page)).toHaveText("Task Manager");
  await expect(perspectiveToggle(page)).toHaveText("Administration");
  await expect(
    sidebar(page).getByRole("link", { name: "Models", exact: true })
  ).toBeVisible();
});

test("detail pages highlight their owning sidebar item", async ({ page }) => {
  for (const [path, item] of [
    ["/agents/1", "Agents"],
    ["/migration-plans/1", "Migration Plans"],
    ["/plan-runs/1/stages/2", "Plan Runs"],
    ["/skills/collections/1", "Skills"],
    ["/applications/1", "Application inventory"],
    ["/archetypes/1/target-profiles", "Archetypes"],
  ] as const) {
    await page.goto(protoUrl(path));
    await expect(mainHeading(page)).toBeVisible();
    await expectNavCurrent(page, item);
  }
});
