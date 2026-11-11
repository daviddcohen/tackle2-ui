/**
 * A detail route with an unknown or malformed id must settle into a not-found
 * state (not an endless spinner, blank page, or crash) that names the missing
 * entity and keeps a breadcrumb back to the owning list. Request-level checks
 * (no retries on 404, no `/NaN` or `/0` ids) live in data-layer/.
 */
import {
  breadcrumb,
  currentCrumb,
  expect,
  mainHeading,
  protoUrl,
  test,
} from "../support";

// The leaf is the missing entity's noun (guide 3.5 rule 2); a stage of a
// missing run is that run's not found (addenda R3). The target profiles page
// keeps its own leaf, "Target profiles", under the missing archetype (AR8).
const cases: [
  path: string,
  message: RegExp,
  list: string,
  listPath: string,
  leaf: string,
][] = [
  [
    "/migration-plans/99999",
    /Migration plan not found/,
    "Migration plans",
    "/migration-plans",
    "Migration plan",
  ],
  [
    "/migration-plans/abc",
    /Migration plan not found/,
    "Migration plans",
    "/migration-plans",
    "Migration plan",
  ],
  [
    "/plan-runs/99999",
    /Plan run not found/,
    "Plan runs",
    "/plan-runs",
    "Plan run",
  ],
  [
    "/plan-runs/abc",
    /Plan run not found/,
    "Plan runs",
    "/plan-runs",
    "Plan run",
  ],
  [
    "/plan-runs/1/stages/99999",
    /Stage not found/,
    "Plan runs",
    "/plan-runs",
    "Stage",
  ],
  [
    "/plan-runs/abc/stages/xyz",
    /Plan run not found/,
    "Plan runs",
    "/plan-runs",
    "Plan run",
  ],
  [
    "/plan-runs/99999/stages/1",
    /Plan run not found/,
    "Plan runs",
    "/plan-runs",
    "Plan run",
  ],
  ["/agents/99999", /Agent not found/, "Agents", "/agents", "Agent"],
  ["/agents/abc", /Agent not found/, "Agents", "/agents", "Agent"],
  ["/skills/99999", /Skill not found/, "Skills", "/skills", "Skill"],
  ["/skills/abc", /Skill not found/, "Skills", "/skills", "Skill"],
  [
    "/skills/collections/99999",
    /Skill collection not found/,
    "Skills",
    "/skills",
    "Skill collection",
  ],
  [
    "/skills/collections/abc",
    /Skill collection not found/,
    "Skills",
    "/skills",
    "Skill collection",
  ],
  [
    "/applications/99999",
    /Application not found/,
    "Application inventory",
    "/applications",
    "Application",
  ],
  [
    "/archetypes/99999/target-profiles",
    /Archetype not found/,
    "Archetypes",
    "/archetypes",
    "Target profiles",
  ],
];

for (const [path, message, list, listPath, leaf] of cases) {
  test(`${path} settles into a not-found state with a way back`, async ({
    page,
    pageErrors,
  }) => {
    await page.goto(protoUrl(path));
    await expect(page.getByText(message).first()).toBeVisible();
    await expect(page.getByText("Loading...")).toHaveCount(0);
    await expect(currentCrumb(page)).toHaveText(leaf);
    await breadcrumb(page)
      .getByRole("link", { name: list, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${listPath}(\\?|$)`));
    await expect(mainHeading(page)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}

test("a missing stage of a known run goes back to that run by name", async ({
  page,
}) => {
  await page.goto(protoUrl("/plan-runs/1/stages/99999"));
  await expect(mainHeading(page)).toHaveText("Stage not found");
  await page
    .getByRole("button", { name: "Back to Run #1 — Java EE to Quarkus" })
    .click();
  await expect(page).toHaveURL(/\/plan-runs\/1(\?|$)/);
});

test("/applications/abc is not an application id: the inventory is shown", async ({
  page,
}) => {
  // The application detail route only matches numeric ids.
  await page.goto(protoUrl("/applications/abc"));
  await expect(mainHeading(page)).toHaveText("Application inventory");
  await expect(page.getByText("Loading...")).toHaveCount(0);
});

// A failed fetch (every call returns 503) is the error branch, never "not
// found": the trail keeps the entity noun as its leaf above the shared error.
const errorCases: [path: string, leaf: string][] = [
  ["/agents/2", "Agent"],
  ["/migration-plans/1", "Migration plan"],
  ["/plan-runs/1", "Plan run"],
  ["/plan-runs/1/stages/1", "Stage"],
  ["/skills/1", "Skill"],
  ["/skills/collections/1", "Skill collection"],
];

for (const [path, leaf] of errorCases) {
  test(`${path} reports an API failure as an error, not as not found`, async ({
    page,
  }) => {
    await page.goto(protoUrl(path, { scenario: "apiError" }));
    await expect(page.getByText("Unable to connect")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/not found/i)).toHaveCount(0);
    await expect(currentCrumb(page)).toHaveText(leaf);
    // A stage keeps its run's noun crumb, the same trail as while it loads.
    if (path.includes("/stages/")) {
      await expect(
        breadcrumb(page).getByRole("link", { name: "Plan run", exact: true })
      ).toBeVisible();
    }
  });
}
