/**
 * The migration plans list (applications and run status per plan) and
 * running a plan from its row menu or its page (the dialog with the plan
 * fixed and a selectable readiness table).
 *
 * The fixture data changes over time (plans gain or lose their migration
 * path, runs are renamed), so plans, applications and runs are read from the
 * mock API and picked by their properties, never by id or name.
 */
import type { Page } from "@playwright/test";

import {
  type Persona,
  agenticGet,
  appPath,
  dialog,
  expect,
  expectTooltipOnHover,
  protoUrl,
  rowActions,
  test,
} from "../support";

interface Ref {
  id: number;
  name: string;
}
interface Plan {
  id: string;
  name: string;
  stages: unknown[];
  migrationPath?: { archetype: Ref };
  operatorManaged?: boolean;
  applicationImpact?: { matching: number; applications?: Ref[] };
}
interface Run {
  id: string;
  name: string;
  planId: string;
  status: string;
  startedAt: string;
  applications: Ref[];
}

const STATUS_TEXT: Record<string, string> = {
  Pending: "Pending",
  Running: "Running",
  Succeeded: "Succeeded",
  Failed: "Failed",
  AwaitingApproval: "Action required",
};

// shownRun and runBlocker mirror getShownPlanRun (projection.ts) and
// getRunBlocker (plan-run-blocker.ts) on purpose: the rules themselves are
// unit-tested there, and this spec checks the wiring against live mock data.
// A rule change must update both.

/** The list's rule: the newest run that needs action, else the newest (Pending first). */
const shownRun = (runs: Run[]) => {
  const start = (run: Run) => {
    if (run.status === "Pending") return Infinity;
    const time = Date.parse(run.startedAt);
    return Number.isNaN(time) ? -Infinity : time;
  };
  const newestFirst = [...runs].sort((a, b) => start(b) - start(a) || 0);
  return (
    newestFirst.find((run) => run.status === "AwaitingApproval") ??
    newestFirst[0]
  );
};

/** Why Run is off for the Enterprise Architect (who can edit plans), as the UI says it. */
const runBlocker = (plan: Plan) => {
  if (plan.migrationPath == null)
    return "This migration plan is not assigned to an archetype, so it has no applications. To run it, select applications in the application inventory.";
  if (plan.stages.length === 0)
    return plan.operatorManaged
      ? "This migration plan has no stages yet."
      : "This migration plan has no stages. Edit it to add one.";
  const impact = plan.applicationImpact;
  if (impact?.matching === 0 || impact?.applications?.length === 0)
    return `No applications in ${plan.migrationPath.archetype.name} use this migration plan yet.`;
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
  test("the list shows each plan's applications and the status of its shown run", async ({
    page,
  }) => {
    await openList(page);
    const { plans, runs } = await loadData(page);
    await expect(
      page.getByRole("main").getByRole("columnheader", { name: "Archetype" })
    ).toHaveCount(0);
    for (const plan of plans) {
      const row = planRow(page, plan);
      const applications = plan.applicationImpact?.applications ?? [];
      if (applications.length === 0) {
        await expect(row.getByRole("list")).toHaveCount(0);
        await expect(row.getByText("None", { exact: true })).toBeVisible();
      } else {
        const labels = row.getByRole("list", {
          name: `Applications of ${plan.name}`,
        });
        for (const application of applications.slice(0, 2))
          await expect(
            labels.getByRole("link", { name: application.name })
          ).toBeVisible();
        if (applications.length > 2)
          await expect(
            labels.getByRole("button", {
              name: `${applications.length - 2} more`,
            })
          ).toBeVisible();
      }
      const own = runs.filter((run) => run.planId === plan.id);
      if (own.length === 0) {
        await expect(row.getByText("Not run", { exact: true })).toBeVisible();
        continue;
      }
      const shown = shownRun(own);
      const status = row.getByRole("link", {
        name: `${STATUS_TEXT[shown.status]}, ${shown.name}`,
        exact: true,
      });
      await expect(status).toHaveText(STATUS_TEXT[shown.status]);
      await expect(status).toHaveAttribute(
        "href",
        new RegExp(`/plan-runs/${shown.id}$`)
      );
      await expect(row.getByText(`${own.length} runs`)).toHaveCount(
        own.length > 1 ? 1 : 0
      );
    }
  });

  test("in the Action required scenario a plan shows the run that needs action", async ({
    page,
  }) => {
    // Independent of the rule copy above: this scenario always has a run
    // awaiting approval, so some plan's status names one.
    await page.goto(
      protoUrl("/migration-plans", { scenario: "actionRequired" })
    );
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /^Action required, / })
        .first()
    ).toHaveText("Action required");
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
