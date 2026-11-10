import {
  type Persona,
  breadcrumbTitles,
  errorBoundary,
  expect,
  expectNavCurrent,
  mainHeading,
  protoUrl,
  searchParam,
  test,
} from "../support";

interface RouteCase {
  path: string;
  persona?: Persona;
  heading: string | RegExp;
  nav?: string;
  crumbs?: string[];
}

/** Every route in Paths.ts/Routes.tsx with a valid id, as seen by a persona that may open it. */
const routes: RouteCase[] = [
  // Agentic (prototype) routes
  { path: "/agents", heading: "Agents", nav: "Agents" },
  {
    path: "/agents/1",
    heading: "Migration Proposal Agent",
    nav: "Agents",
    crumbs: ["Agents", "Migration Proposal Agent"],
  },
  {
    path: "/migration-plans",
    heading: "Migration Plans",
    nav: "Migration Plans",
  },
  {
    path: "/migration-plans/1",
    heading: "Java EE to Quarkus",
    nav: "Migration Plans",
    crumbs: ["Migration Plans", "Java EE to Quarkus"],
  },
  { path: "/plan-runs", heading: "Plan Runs", nav: "Plan Runs" },
  {
    path: "/plan-runs/1",
    heading: "Run #1 — Java EE to Quarkus",
    nav: "Plan Runs",
    crumbs: ["Plan Runs", "Run #1 — Java EE to Quarkus"],
  },
  {
    path: "/plan-runs/1/stages/1",
    heading: "Prepare proposal: Run #1 — Java EE to Quarkus",
    nav: "Plan Runs",
    crumbs: ["Plan Runs", "Run #1 — Java EE to Quarkus", "Prepare proposal"],
  },
  { path: "/skills", heading: "Skills", nav: "Skills" },
  {
    path: "/skills/1",
    heading: "Spring Boot to Quarkus migration",
    nav: "Skills",
    crumbs: ["Skills", "Spring Boot to Quarkus migration"],
  },
  {
    path: "/skills/collections/1",
    heading: "Java modernization foundation",
    nav: "Skills",
    crumbs: ["Skills", "Java modernization foundation"],
  },
  {
    path: "/applications/1",
    heading: "Customer Management",
    nav: "Application inventory",
    crumbs: ["Application inventory", "Customer Management"],
  },
  {
    path: "/models",
    persona: "platformEngineer",
    heading: "Models",
    nav: "Models",
  },
  {
    path: "/providers",
    persona: "platformEngineer",
    heading: "Providers",
    nav: "Providers",
  },
  // Upstream Migration routes
  {
    path: "/applications",
    heading: "Application inventory",
    nav: "Application inventory",
  },
  {
    path: "/applications/application-imports",
    heading: "Application imports",
    nav: "Application inventory",
  },
  {
    path: "/applications/1/review",
    heading: "Review",
    nav: "Application inventory",
  },
  { path: "/archetypes", heading: "Archetypes", nav: "Archetypes" },
  {
    path: "/archetypes/1/target-profiles",
    heading: "Target profiles for Java EE Application",
    nav: "Archetypes",
    crumbs: ["Archetypes", "Java EE Application", "Target profiles"],
  },
  { path: "/archetypes/1/review", heading: "Review", nav: "Archetypes" },
  { path: "/controls/stakeholders", heading: "Controls", nav: "Controls" },
  {
    path: "/controls/stakeholder-groups",
    heading: "Controls",
    nav: "Controls",
  },
  { path: "/controls/job-functions", heading: "Controls", nav: "Controls" },
  { path: "/controls/tags", heading: "Controls", nav: "Controls" },
  { path: "/controls/business-services", heading: "Controls", nav: "Controls" },
  {
    path: "/migration-waves",
    heading: "Migration waves",
    nav: "Migration waves",
  },
  { path: "/issues/all", heading: "Issues", nav: "Issues" },
  { path: "/issues/single-app", heading: "Issues" },
  { path: "/insights/all", heading: "Insights", nav: "Insights" },
  { path: "/dependencies", heading: "Dependencies", nav: "Dependencies" },
  {
    path: "/migration-targets",
    heading: "Custom migration targets",
    nav: "Custom migration targets",
  },
  {
    path: "/analysis-profiles",
    heading: "Analysis Profiles",
    nav: "Analysis Profiles",
  },
  { path: "/tasks", heading: "Task Manager", nav: "Task Manager" },
  // Upstream Administration routes
  {
    path: "/general",
    persona: "platformEngineer",
    heading: "General configuration",
    nav: "General",
  },
  {
    path: "/identities",
    persona: "platformEngineer",
    heading: "Credentials",
    nav: "Credentials",
  },
  {
    path: "/repositories/git",
    persona: "platformEngineer",
    heading: "Git configuration",
    nav: "Git",
  },
  {
    path: "/repositories/svn",
    persona: "platformEngineer",
    heading: "Subversion configuration",
    nav: "Subversion",
  },
  {
    path: "/repositories/maven",
    persona: "platformEngineer",
    heading: "Maven configuration",
    nav: "Maven",
  },
  {
    path: "/proxies",
    persona: "platformEngineer",
    heading: "Proxy configuration",
    nav: "Proxy",
  },
  {
    path: "/jira",
    persona: "platformEngineer",
    heading: "Jira configuration",
    nav: "Jira",
  },
  {
    path: "/source-platforms",
    persona: "platformEngineer",
    heading: "Source platforms",
    nav: "Source platforms",
  },
  {
    path: "/asset-generators",
    persona: "platformEngineer",
    heading: "Generators",
    nav: "Generators",
  },
  {
    path: "/users",
    persona: "platformEngineer",
    heading: "Users",
    nav: "Users",
  },
  {
    path: "/roles",
    persona: "platformEngineer",
    heading: "Roles",
    nav: "Roles",
  },
  {
    path: "/scopes",
    persona: "platformEngineer",
    heading: "Scopes",
    nav: "Scopes",
  },
];

for (const route of routes) {
  test(`${route.path} renders its page, sidebar item and breadcrumbs`, async ({
    page,
    pageErrors,
  }) => {
    await page.goto(protoUrl(route.path, { persona: route.persona }));
    await expect(mainHeading(page)).toHaveText(route.heading);
    expect(new URL(page.url()).pathname).toBe(route.path);
    if (route.nav) await expectNavCurrent(page, route.nav);
    if (route.crumbs)
      await expect.poll(() => breadcrumbTitles(page)).toEqual(route.crumbs);
    await expect(errorBoundary(page)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

test.describe("pages that crashed under MOCK=stub (fixed: questionnaire mock returns an array)", () => {
  // mocks/stub-new-work/assessments.ts returns the questionnaire record object,
  // not an array, for GET /hub/questionnaires. Same code on upstream/main.
  for (const [path, persona] of [
    ["/reports", "enterpriseArchitect"],
    ["/applications/assessment-actions/1", "enterpriseArchitect"],
    ["/archetypes/assessment-actions/1", "enterpriseArchitect"],
    ["/assessment", "platformEngineer"],
  ] as const) {
    test(`${path} renders without the error boundary`, async ({
      page,
      pageErrors,
    }) => {
      await page.goto(protoUrl(path, { persona }));
      // The crash happens once questionnaires resolve, so wait for the network to settle.
      await page.waitForLoadState("networkidle");
      await expect(errorBoundary(page)).toHaveCount(0);
      await expect(mainHeading(page)).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }
});

test.describe("unknown and retired routes", () => {
  for (const path of [
    "/totally-bogus-route",
    "/not-found",
    "/waves",
    "/repositories",
    // Upstream agentic console routes replaced on purpose by the prototype
    "/agent-runs",
    "/workflows",
    "/workflow-runs",
    "/gateways",
  ]) {
    test(`${path} redirects to the inventory and keeps prototype state`, async ({
      page,
    }) => {
      await page.goto(
        protoUrl(path, { persona: "hubMigrator", scenario: "running" })
      );
      await expect(mainHeading(page)).toHaveText("Application inventory");
      expect(new URL(page.url()).pathname).toBe("/applications");
      expect(searchParam(page, "protoPersona")).toBe("hubMigrator");
      expect(searchParam(page, "protoScenario")).toBe("running");
    });
  }

  test("/skills/collections (Paths.skillCollections) opens Skills filtered to collections", async ({
    page,
  }) => {
    await page.goto(protoUrl("/skills/collections"));
    await expect(mainHeading(page)).toHaveText("Skills", { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/skills");
    expect(searchParam(page, "skills:filters")).toBe('{"type":["collection"]}');
    expect(searchParam(page, "protoPersona")).toBe("enterpriseArchitect");
  });

  for (const path of [
    "/applications/analysis-tab",
    "/applications/assessment-tab",
  ]) {
    test(`${path} (declared in Paths.ts) is not swallowed by the application detail route`, async ({
      page,
    }) => {
      await page.goto(protoUrl(path));
      await expect(mainHeading(page)).toHaveText("Application inventory", {
        timeout: 15_000,
      });
    });
  }
});

test.describe("administration routes are scope-gated per persona", () => {
  for (const persona of ["enterpriseArchitect", "hubMigrator"] as const) {
    for (const path of ["/models", "/providers", "/general", "/identities"]) {
      test(`${persona} opening ${path} lands on the inventory`, async ({
        page,
      }) => {
        await page.goto(protoUrl(path, { persona }));
        await expect(mainHeading(page)).toHaveText("Application inventory");
        expect(new URL(page.url()).pathname).toBe("/applications");
        expect(searchParam(page, "protoPersona")).toBe(persona);
      });
    }
  }
});
