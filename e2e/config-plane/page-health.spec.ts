/**
 * Smoke matrix: every configuration-plane page for each persona/scenario
 * renders its heading, logs no console errors/warnings or page errors, and
 * shows no raw i18n keys / undefined / NaN / [object Object].
 */
import {
  type Persona,
  type Scenario,
  expect,
  expectHealthy,
  expectNoBrokenText,
  gotoProto,
  test,
} from "../support";

const PAGES: { path: string; heading: string | RegExp; adminOnly?: boolean }[] =
  [
    { path: "/models", heading: "Models", adminOnly: true },
    { path: "/providers", heading: "Providers", adminOnly: true },
    { path: "/agents", heading: "Agents" },
    { path: "/agents/1", heading: "Migration Proposal Agent" },
    { path: "/agents/3?tab=runs", heading: "Build Validator" },
    { path: "/skills", heading: "Skills" },
    { path: "/skills/1", heading: "Spring Boot to Quarkus migration" },
    {
      path: "/skills/1?tab=associations",
      heading: "Spring Boot to Quarkus migration",
    },
    { path: "/skills/collections/1", heading: "Java modernization foundation" },
  ];

const MATRIX: { persona: Persona; scenarios: Scenario[] }[] = [
  {
    persona: "platformEngineer",
    scenarios: ["initial", "partialConfiguration", "configured", "failed"],
  },
  { persona: "enterpriseArchitect", scenarios: ["initial", "configured"] },
  { persona: "hubMigrator", scenarios: ["configured"] },
];

for (const { persona, scenarios } of MATRIX) {
  for (const scenario of scenarios) {
    test.describe(`${persona} / ${scenario}`, () => {
      for (const { path, heading, adminOnly } of PAGES) {
        if (adminOnly && persona !== "platformEngineer") continue;
        // detail pages are reached from lists; with an empty list (initial) skip them
        if (scenario === "initial" && /\/\d+/.test(path)) continue;
        test(`${path} renders cleanly`, async ({ page, diagnostics }) => {
          await gotoProto(page, path, { persona: persona, scenario: scenario });
          await expect(
            page.getByRole("heading", { level: 1, name: heading })
          ).toBeVisible();
          // let list queries settle (table body or empty state)
          await expect(page.getByText("Loading...")).toHaveCount(0);
          await expectNoBrokenText(page.locator("main"));
          expectHealthy(diagnostics);
        });
      }
    });
  }
}

test.describe("initial scenario consistency", () => {
  // Regression guard: mock GET /agents, /skills, /skill-collections return [] for 'initial' but GET /agents/:id, /skills/:id, /skill-collections/:id still return fixtures
  test("detail endpoints agree with the empty lists in the initial scenario", async ({
    page,
  }) => {
    await gotoProto(page, "/agents/1", {
      persona: "enterpriseArchitect",
      scenario: "initial",
    });
    // The detail endpoint now 404s like the empty list implies; the page shows its
    // not-found state (copy is owned by the page) instead of the fixture agent.
    await expect(
      page.getByText(/No Agents yet|not found/i).first()
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Migration Proposal Agent" })
    ).toHaveCount(0);
  });
});
