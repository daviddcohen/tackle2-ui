/**
 * A detail route with an unknown or malformed id must settle into a not-found
 * state (not an endless spinner, blank page, or crash) that names the missing
 * entity and keeps a breadcrumb back to the owning list. Request-level checks
 * (no retries on 404, no `/NaN` or `/0` ids) live in data-layer/.
 */
import { breadcrumb, expect, mainHeading, protoUrl, test } from "../support";

const cases: [path: string, message: RegExp, list: string, listPath: string][] =
  [
    [
      "/migration-plans/99999",
      /Plan not found/,
      "Migration Plans",
      "/migration-plans",
    ],
    [
      "/migration-plans/abc",
      /Plan not found/,
      "Migration Plans",
      "/migration-plans",
    ],
    ["/plan-runs/99999", /Plan run not found/, "Plan Runs", "/plan-runs"],
    ["/plan-runs/abc", /Plan run not found/, "Plan Runs", "/plan-runs"],
    [
      "/plan-runs/1/stages/99999",
      /Stage run not found/,
      "Plan Runs",
      "/plan-runs",
    ],
    [
      "/plan-runs/abc/stages/xyz",
      /Stage run not found/,
      "Plan Runs",
      "/plan-runs",
    ],
    ["/plan-runs/99999/stages/1", /not found/i, "Plan Runs", "/plan-runs"],
    ["/agents/99999", /Agent not found/, "Agents", "/agents"],
    ["/agents/abc", /Agent not found/, "Agents", "/agents"],
    ["/skills/99999", /Skill not found/, "Skills", "/skills"],
    ["/skills/abc", /Skill not found/, "Skills", "/skills"],
    [
      "/skills/collections/99999",
      /Skill collection not found/,
      "Skills",
      "/skills",
    ],
    [
      "/skills/collections/abc",
      /Skill collection not found/,
      "Skills",
      "/skills",
    ],
    [
      "/applications/99999",
      /Application not found/,
      "Application inventory",
      "/applications",
    ],
    [
      "/archetypes/99999/target-profiles",
      /not found/i,
      "Archetypes",
      "/archetypes",
    ],
  ];

for (const [path, message, list, listPath] of cases) {
  test(`${path} settles into a not-found state with a way back`, async ({
    page,
    pageErrors,
  }) => {
    await page.goto(protoUrl(path));
    await expect(page.getByText(message).first()).toBeVisible();
    await expect(page.getByText("Loading...")).toHaveCount(0);
    await breadcrumb(page)
      .getByRole("link", { name: list, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${listPath}(\\?|$)`));
    await expect(mainHeading(page)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}

test("/applications/abc is not an application id: the inventory is shown", async ({
  page,
}) => {
  // The application detail route only matches numeric ids.
  await page.goto(protoUrl("/applications/abc"));
  await expect(mainHeading(page)).toHaveText("Application inventory");
  await expect(page.getByText("Loading...")).toHaveCount(0);
});
