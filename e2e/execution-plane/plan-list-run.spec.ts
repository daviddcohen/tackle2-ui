/**
 * The migration plans list (the target profiles that use each plan, and the
 * archetype filter) and running a plan from its row menu or its page (the
 * dialog with the plan fixed and a selectable readiness table).
 *
 * The fixture data changes over time (target profiles move between plans,
 * runs are renamed), so plans, applications and runs are read from the mock
 * API and picked by their properties, never by id or name.
 */
import type { Page } from "@playwright/test";

import {
  type Persona,
  agenticGet,
  appPath,
  dataRows,
  dialog,
  expect,
  expectTooltipOnHover,
  filterBy,
  protoUrl,
  rowActions,
  test,
} from "../support";

interface Ref {
  id: number;
  name: string;
}
interface MigrationPath {
  archetype: Ref;
  targetProfile: Ref;
}
interface Plan {
  id: string;
  name: string;
  stages: unknown[];
  /** Derived by the server: every target profile that uses the plan. */
  migrationPaths?: MigrationPath[];
  operatorManaged?: boolean;
  applicationImpact?: { matching: number; applications?: Ref[] };
}
interface Run {
  id: string;
  planId: string;
  applications: Ref[];
}

// runBlocker mirrors getRunBlocker (plan-run-blocker.ts) on purpose: the
// rules themselves are unit-tested there, and this spec checks the wiring
// against live mock data. A rule change must update both.

/** The target profiles that use the plan, with their archetypes. */
const pathsOf = (plan: Plan) => plan.migrationPaths ?? [];

/** The link of a target profile on its archetype's Target profiles page. */
const profileHref = (archetype: Ref, profile: Ref) =>
  new RegExp(
    `/archetypes/${archetype.id}/target-profiles#target-profile-${profile.id}$`
  );

/** Why Run is off for the Enterprise Architect (who can edit plans), as the UI says it. */
const runBlocker = (plan: Plan) => {
  if (pathsOf(plan).length === 0)
    return "No target profile uses this migration plan, so it has no applications. Assign it to a target profile on an archetype's Target profiles page.";
  if (plan.stages.length === 0)
    return plan.operatorManaged
      ? "This migration plan has no stages yet."
      : "This migration plan has no stages. Edit it to add one.";
  const impact = plan.applicationImpact;
  if (impact?.matching === 0 || impact?.applications?.length === 0)
    return "The archetypes of the target profiles that use this migration plan have no applications yet.";
  if (impact?.applications == null)
    return "The applications of this migration plan could not be loaded. Reload the page to try again.";
  return undefined;
};

const loadData = async (page: Page) => ({
  plans: await agenticGet<Plan[]>(page, "/plans"),
  runs: await agenticGet<Run[]>(page, "/plan-runs"),
});

/** The plan's applications that the dialog reports ready to start. */
const readyApplications = async (page: Page, plan: Plan) => {
  const applications = plan.applicationImpact?.applications ?? [];
  if (applications.length === 0) return [];
  const views = await agenticGet<Record<number, { preflight?: string }>>(
    page,
    `/application-migrations?applicationIds=${applications.map((application) => application.id).join(",")}`
  );
  return applications.filter(
    (application) => views[application.id]?.preflight === "ready"
  );
};

/** A plan Run is on for, with the most ready applications. */
const runnablePlan = async (page: Page, plans: Plan[]) => {
  let best: { plan: Plan; ready: Ref[] } | undefined;
  for (const plan of plans.filter((candidate) => !runBlocker(candidate))) {
    const ready = await readyApplications(page, plan);
    if (ready.length > (best?.ready.length ?? 0)) best = { plan, ready };
  }
  expect(best, "a plan with a ready application").toBeDefined();
  return best!;
};

const openList = async (page: Page, persona?: Persona) => {
  await page.goto(protoUrl("/migration-plans", { persona }));
  await expect(
    page.getByRole("heading", { level: 1, name: "Migration plans" })
  ).toBeVisible();
};

const planRow = (page: Page, plan: Plan) =>
  page
    .getByRole("main")
    .getByRole("row")
    .filter({
      has: page.getByRole("link", { name: plan.name, exact: true }),
    });

const runItem = (page: Page) =>
  page.getByRole("menuitem", { name: "Run migration plan" });

/** Selects exactly `application` in the open dialog and starts it; returns the new run's id. */
const runOnOne = async (page: Page, application: Ref, ready: number) => {
  const preflight = dialog(page, "Run migration plan");
  const table = preflight.getByRole("grid");
  // The header checkbox clears every ready row; then pick one by its name.
  await table.getByRole("row").first().getByRole("checkbox").uncheck();
  await expect(
    preflight.getByText(`0 of ${ready} ready applications selected.`, {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    preflight.getByRole("button", { name: "Run on 0 applications" })
  ).toBeDisabled();
  await table
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", { name: application.name }),
    })
    .getByRole("checkbox")
    .check();
  await expect(
    preflight.getByText(`1 of ${ready} ready`, { exact: false })
  ).toBeVisible();
  await preflight.getByRole("button", { name: "Run on 1 application" }).click();
  await expect(preflight).toBeHidden();
  await expect(page).toHaveURL((url) =>
    /^\/plan-runs\/\d+$/.test(appPath(url.pathname))
  );
  return appPath(new URL(page.url()).pathname).split("/").pop()!;
};

test.describe("Migration plans list and running a plan", () => {
  test("the list shows the target profiles that use each plan", async ({
    page,
  }) => {
    await openList(page);
    const { plans } = await loadData(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: plans[0].name })).toBeVisible();
    // The actions column is named for screen readers only; the table
    // controls add an unnamed column after the data.
    expect(
      await main
        .getByRole("columnheader")
        .evaluateAll((headers) =>
          headers
            .map((header) => header.textContent?.trim())
            .filter((text) => text !== "")
        )
    ).toEqual(["Name", "Target profiles", "Row actions"]);
    for (const plan of plans) {
      const row = planRow(page, plan);
      const paths = pathsOf(plan);
      if (paths.length === 0) {
        await expect(row).toContainText("Not assigned");
        continue;
      }
      if (paths.length > 1) {
        await expect(
          row.getByRole("button", {
            name: `${paths.length} target profiles`,
          })
        ).toBeVisible();
        continue;
      }
      // "Quarkus 3.x (Java EE Application)": only the profile is a link.
      const [{ archetype, targetProfile: profile }] = paths;
      await expect(row).toContainText(`${profile.name} (${archetype.name})`);
      await expect(
        row.getByRole("link", { name: profile.name, exact: true })
      ).toHaveAttribute("href", profileHref(archetype, profile));
      await expect(
        row.getByRole("link", { name: archetype.name, exact: true })
      ).toHaveCount(0);
    }
  });

  // Target profiles of several archetypes can share one plan: the fixtures
  // have one (Java lift and shift, used by a Java EE and a Legacy Java profile).
  test("a plan used by target profiles of several archetypes lists them in a popover", async ({
    page,
  }) => {
    await openList(page);
    const { plans } = await loadData(page);
    const plan = plans.find(
      (candidate) =>
        new Set(pathsOf(candidate).map(({ archetype }) => archetype.id)).size >
        1
    );
    expect(
      plan,
      "a plan used by target profiles of two archetypes"
    ).toBeDefined();
    const paths = pathsOf(plan!);
    const row = planRow(page, plan!);
    await row
      .getByRole("button", { name: `${paths.length} target profiles` })
      .click();
    const popover = page.getByRole("dialog", {
      name: `Target profiles using ${plan!.name}`,
    });
    await expect(popover).toBeVisible();
    // In the server's order (archetype name, then profile name).
    await expect(popover.getByRole("listitem")).toHaveText(
      paths.map(
        ({ archetype, targetProfile }) =>
          `${targetProfile.name} (${archetype.name})`
      )
    );
    for (const { archetype, targetProfile } of paths)
      await expect(
        popover.getByRole("link", { name: targetProfile.name, exact: true })
      ).toHaveAttribute("href", profileHref(archetype, targetProfile));
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();

    // The archetype filter matches the archetype of any of its profiles.
    const [first, second] = [
      ...new Map(
        paths.map(({ archetype }) => [archetype.id, archetype])
      ).values(),
    ];
    await filterBy(page, "Archetype", first.name);
    await page.keyboard.press("Escape");
    await expect(row).toBeVisible();
    // Swap the selection for the other archetype: the plan still shows.
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page.getByRole("menuitem", { name: first.name, exact: true }).click();
    await page
      .getByRole("menuitem", { name: second.name, exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(row).toBeVisible();
    // An archetype none of its profiles belongs to hides it.
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page
      .getByRole("menuitem", { name: second.name, exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Not assigned", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(dataRows(page).first()).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test("the Not assigned filter shows exactly the plans no target profile uses", async ({
    page,
  }) => {
    await openList(page);
    const { plans } = await loadData(page);
    const unassigned = plans.filter((plan) => pathsOf(plan).length === 0);
    expect(unassigned.length, "a plan no target profile uses").toBeGreaterThan(
      0
    );
    await filterBy(page, "Archetype", "Not assigned");
    await page.keyboard.press("Escape");
    await expect(dataRows(page)).toHaveCount(unassigned.length);
    for (const plan of unassigned) {
      const row = planRow(page, plan);
      await expect(row).toBeVisible();
      await expect(row).toContainText("Not assigned");
    }
  });

  test("runs a plan from its row menu on the selected applications and opens the new run", async ({
    page,
  }) => {
    await openList(page);
    const { plans, runs } = await loadData(page);
    const { plan, ready } = await runnablePlan(page, plans);
    await rowActions(planRow(page, plan)).click();
    await runItem(page).click();
    const preflight = dialog(page, "Run migration plan");
    await expect(preflight).toContainText(
      `Runs ${plan.name} on the applications you select.`
    );
    // The plan is fixed: no plan choice.
    await expect(preflight.getByRole("radio")).toHaveCount(0);
    const runId = await runOnOne(page, ready[0], ready.length);
    expect(runs.map((run) => run.id)).not.toContain(runId);
    const created = await agenticGet<Run>(page, `/plan-runs/${runId}`);
    expect(created.planId).toBe(plan.id);
    expect(created.applications.map((application) => application.id)).toEqual([
      ready[0].id,
    ]);
  });

  test("previews and runs only the selected applications, from the plans list", async ({
    page,
  }) => {
    await openList(page);
    const { plans } = await loadData(page);
    const { plan, ready } = await runnablePlan(page, plans);
    expect(ready.length, "a plan with two ready applications").toBeGreaterThan(
      1
    );
    await rowActions(planRow(page, plan)).click();
    await runItem(page).click();
    const preflight = dialog(page, "Run migration plan");
    const table = preflight.getByRole("grid", {
      name: `Applications of ${plan.name}`,
    });
    // Leave the last ready application out.
    const left = ready[ready.length - 1];
    const kept = ready.slice(0, -1);
    await table
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: left.name }) })
      .getByRole("checkbox")
      .uncheck();
    await preflight.getByRole("button", { name: "Skills by stage" }).click();
    // One run of the fixed plan: the kept applications, never the left one.
    const preview = preflight.getByRole("grid", {
      name: "Skills by stage",
      exact: true,
    });
    await expect(preview).toBeVisible();
    for (const application of kept)
      await expect(
        preview.getByRole("heading", {
          name: `Every stage: ${application.name}`,
        })
      ).toBeVisible();
    await expect(
      preview.getByRole("heading", { name: `Every stage: ${left.name}` })
    ).toHaveCount(0);

    // Run counts what it sends, and sends what the preview showed.
    const runButton = preflight.getByRole("button", {
      name: `Run on ${kept.length} application${kept.length === 1 ? "" : "s"}`,
    });
    await expect(runButton).toBeEnabled();
    await runButton.click();
    await expect(preflight).toBeHidden();
    await expect(page).toHaveURL((url) =>
      /^\/plan-runs\/\d+$/.test(appPath(url.pathname))
    );
    const runId = appPath(new URL(page.url()).pathname).split("/").pop()!;
    const created = await agenticGet<Run>(page, `/plan-runs/${runId}`);
    expect(created.planId).toBe(plan.id);
    expect(
      created.applications.map((application) => application.id).sort()
    ).toEqual(kept.map((application) => application.id).sort());
  });

  test("runs a plan from the Actions menu of its page", async ({ page }) => {
    await openList(page);
    const { plans } = await loadData(page);
    const { plan, ready } = await runnablePlan(page, plans);
    await page.getByRole("link", { name: plan.name, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: plan.name })
    ).toBeVisible();
    await page.getByRole("button", { name: "Actions" }).click();
    await runItem(page).click();
    const preflight = dialog(page, "Run migration plan");
    await expect(
      preflight.getByRole("grid", { name: `Applications of ${plan.name}` })
    ).toBeVisible();
    await expect(
      preflight.getByText(
        `${ready.length} of ${ready.length} ready application`,
        { exact: false }
      )
    ).toBeVisible();
    const runId = await runOnOne(page, ready[0], ready.length);
    const created = await agenticGet<Run>(page, `/plan-runs/${runId}`);
    expect(created.planId).toBe(plan.id);
  });

  test("Run is off with its reason for a plan that cannot run", async ({
    page,
  }) => {
    await openList(page);
    const { plans } = await loadData(page);
    const plan = plans.find((candidate) => runBlocker(candidate) != null);
    expect(plan, "a plan that cannot run").toBeDefined();
    const reason = runBlocker(plan!)!;
    await rowActions(planRow(page, plan!)).click();
    await expect(runItem(page)).toHaveAttribute("aria-disabled", "true");
    // The row item's tooltip binds to the item's button once the menu has
    // rendered, so a hover that lands first sees no tooltip and hovering
    // again in place fires no new mouseenter: leave the item before retrying.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await runItem(page).hover({ force: true });
      await expect(page.getByRole("tooltip")).toContainText(reason, {
        timeout: 1_500,
      });
    }).toPass();
    // Keyboard focus shows the same reason.
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await runItem(page).focus();
    await expect(page.getByRole("tooltip")).toContainText(reason);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: plan!.name, exact: true }).click();
    await page.getByRole("button", { name: "Actions" }).click();
    await expect(runItem(page)).toHaveAttribute("aria-disabled", "true");
    await expectTooltipOnHover(page, runItem(page), reason);
  });

  test("the migrator can only run plans", async ({ page }) => {
    await openList(page, "hubMigrator");
    const { plans } = await loadData(page);
    await expect(
      page.getByRole("button", { name: "Create migration plan" })
    ).toHaveCount(0);
    const plan = plans[0];
    await rowActions(planRow(page, plan)).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Run migration plan"]);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: plan.name, exact: true }).click();
    await page.getByRole("button", { name: "Actions" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Run migration plan"]);
  });

  // No prototype persona lacks the run scope (all three hold
  // agentic.workflowruns:post), so "no run without the scope" is covered by
  // the unit tests of the list and the plan page.
});
