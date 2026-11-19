/**
 * Skills a migration plan excludes, seen where a run starts and after: the
 * Run migration plan dialog previews one application's skills, the plan run
 * keeps its snapshot of excluded skills, and the application Skills tab and
 * the skill page agree. No fixture excludes a skill and a reload resets the
 * mock, so each test saves an exclusion on plan 5 (the plan of application
 * 13) through the API and then navigates inside the app.
 */
import type { Locator, Page } from "@playwright/test";

import {
  agenticGet,
  agenticRequest,
  bootMockApi,
  dialog,
  expect,
  main,
  openBulkRunMigration,
  personaSelect,
  spaNavigate,
  test,
  waitForInventory,
} from "../support";

const PLAN_ID = "5";
const APPLICATION_ID = 13;
const EXCLUDED_SKILL_ID = "8";
/** Reaches plan 5 only through its agents' skill collection. */
const COLLECTION_SKILL_ID = "3";

interface Ref {
  id: string;
  name: string;
}
interface SkillEntry {
  skill: Ref;
}
interface StoredPlan {
  name: string;
  description: string;
  stages: {
    id: string;
    name: string;
    agent: Ref;
    instructions: string;
    requiresApproval: boolean;
  }[];
  migrationPath: {
    archetype: Ref;
    targetProfiles: Ref[];
    isDefault?: boolean;
  };
}
interface MigrationView {
  plan?: Ref;
  effectiveSkills?: SkillEntry[];
  excludedSkills?: SkillEntry[];
}

/** Saves plan 5 with one excluded skill, as the plan wizard does. */
const savePlanExclusion = async (page: Page, skillId: string) => {
  const plan = await agenticGet<StoredPlan>(page, `/plans/${PLAN_ID}`);
  const saved = await agenticRequest(page, "PUT", `/plans/${PLAN_ID}`, {
    name: plan.name,
    description: plan.description,
    stages: plan.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      agent: { id: stage.agent.id },
      instructions: stage.instructions,
      requiresApproval: stage.requiresApproval,
    })),
    migrationPath: {
      archetype: { id: plan.migrationPath.archetype.id },
      targetProfiles: plan.migrationPath.targetProfiles.map(({ id }) => ({
        id,
      })),
      isDefault: plan.migrationPath.isDefault,
    },
    excludedSkills: [{ id: skillId }],
  });
  expect(saved.status, "PUT plan").toBeLessThan(300);
};

/**
 * Saves plan 5 with skill 8 excluded and returns the excluded skill's name
 * and the heading the application's skill set gets, both read from the
 * server.
 */
const excludeSkillOnPlan = async (page: Page) => {
  await savePlanExclusion(page, EXCLUDED_SKILL_ID);

  const views = await agenticGet<Record<number, MigrationView>>(
    page,
    `/application-migrations?applicationIds=${APPLICATION_ID}`
  );
  const view = views[APPLICATION_ID];
  expect(view.plan?.id).toBe(PLAN_ID);
  const distinct = (entries: SkillEntry[] = []) =>
    new Set(entries.map(({ skill }) => skill.id)).size;
  const used = distinct(view.effectiveSkills);
  const excluded = distinct(view.excludedSkills);
  expect(excluded).toBe(1);
  return {
    skillName: view.excludedSkills![0].skill.name,
    heading: `Skills (${used} of ${used + excluded} used)`,
  };
};

const skillsTable = (scope: Locator) =>
  scope.getByRole("grid", { name: "Skills", exact: true });

const expectExcludedRow = async (scope: Locator, skillName: string) => {
  const table = skillsTable(scope);
  await expect(table.getByText("Excluded", { exact: true })).toHaveCount(1);
  await expect(
    table.getByRole("row").filter({ hasText: skillName })
  ).toContainText("Excluded");
};

test.describe("Skills in the run dialog and on the run pages", () => {
  test("one application: preview, override, run, and the run and Skills tab agree", async ({
    page,
  }) => {
    await bootMockApi(page);
    const { skillName, heading } = await excludeSkillOnPlan(page);

    await spaNavigate(page, `/applications/${APPLICATION_ID}?tab=migration`);
    await main(page)
      .getByRole("button", { name: "Run migration plan", exact: true })
      .click();
    const preflight = dialog(page, "Run migration plan");
    await expect(preflight).toBeVisible();

    // Collapsed, with the count in the toggle's accessible name.
    const toggle = preflight.getByRole("button", { name: heading });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(skillsTable(preflight)).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      preflight.getByText(
        "Skills for migrating this application and where each one comes from. Its migration plan excludes the skills marked Excluded, so they are not given to the agents."
      )
    ).toBeVisible();
    await expectExcludedRow(preflight, skillName);
    // Plain names: a link would close the dialog and lose its choices.
    await expect(skillsTable(preflight).getByRole("link")).toHaveCount(0);

    // One plan for all applications: no preview and no note, as for several
    // applications. The preview sits below the choice, so the radio keeps its
    // place under the readiness table, and switching back keeps it expanded.
    const onePlan = preflight.getByLabel(
      "Use one migration plan for all applications"
    );
    const readiness = preflight.getByRole("grid", {
      name: "Selected applications",
    });
    const offset = async () =>
      (await onePlan.boundingBox())!.y - (await readiness.boundingBox())!.y;
    const before = await offset();
    await onePlan.check();
    await expect(preflight.getByRole("button", { name: heading })).toHaveCount(
      0
    );
    // Sub-pixel scroll rounding aside (the preview used to move it by its
    // whole height).
    expect(Math.abs((await offset()) - before)).toBeLessThan(2);
    await expect(preflight.getByText(/not previewed/)).toHaveCount(0);
    await preflight.getByLabel("Use each application's migration plan").check();
    await expect(
      preflight.getByRole("button", { name: heading })
    ).toHaveAttribute("aria-expanded", "true");

    // The run snapshots the exclusion.
    await preflight
      .getByRole("button", { name: "Run on 1 application" })
      .click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    const runPath = new URL(page.url()).pathname;
    await expect(
      main(page).getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
    await expect(
      main(page).getByText(
        "Skills for this run and where each one comes from. Excluded skills are not given to the agents."
      )
    ).toBeVisible();
    await expectExcludedRow(main(page), skillName);

    // The application Skills tab shows the same set.
    await spaNavigate(page, `/applications/${APPLICATION_ID}?tab=skills`);
    await expect(
      main(page).getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
    await expectExcludedRow(main(page), skillName);

    // Without the write scopes the run page shows the same rows, read-only.
    await spaNavigate(page, `${runPath}?protoPersona=hubMigrator`);
    await expect(personaSelect(page)).toHaveValue("hubMigrator");
    await expect(
      main(page).getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
    await expectExcludedRow(main(page), skillName);
    await expect(skillsTable(main(page)).getByRole("checkbox")).toHaveCount(0);
  });

  test("the skill page marks the plan that excludes it", async ({ page }) => {
    await bootMockApi(page);
    await excludeSkillOnPlan(page);
    const plan = await agenticGet<StoredPlan>(page, `/plans/${PLAN_ID}`);

    await spaNavigate(page, `/skills/${EXCLUDED_SKILL_ID}?tab=associations`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    const row = plans.getByRole("row").filter({ hasText: plan.name });
    await expect(row.getByText("Excluded", { exact: true })).toBeVisible();
    await expect(plans.getByText("Excluded", { exact: true })).toHaveCount(1);
    // The heading counts the plans that use the skill, as other pages do.
    const planCount = await plans.locator("tbody tr").count();
    await expect(
      main(page).getByRole("heading", {
        level: 2,
        name: `Used in migration plans (${planCount - 1} of ${planCount})`,
      })
    ).toBeVisible();
    await expect(
      main(page).getByText("A plan marked Excluded does not give this skill", {
        exact: false,
      })
    ).toBeVisible();
  });

  test("the skill page lists a plan that gets the skill through a skill collection", async ({
    page,
  }) => {
    await bootMockApi(page);
    await savePlanExclusion(page, COLLECTION_SKILL_ID);
    const plan = await agenticGet<StoredPlan>(page, `/plans/${PLAN_ID}`);

    await spaNavigate(page, `/skills/${COLLECTION_SKILL_ID}?tab=associations`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    const row = plans.getByRole("row").filter({ hasText: plan.name });
    await expect(row.getByText("Excluded", { exact: true })).toBeVisible();
    // Its sources are the agents' collection, in the "via" form.
    await expect(row).toContainText(" via ");
    await expect(
      main(page).getByText("A plan marked Excluded does not give this skill", {
        exact: false,
      })
    ).toBeVisible();
  });

  test("several applications: no skills preview and no sentence", async ({
    page,
  }) => {
    await bootMockApi(page);
    await excludeSkillOnPlan(page);
    await waitForInventory(page);
    const preflight = await openBulkRunMigration(page, [
      "Advisor Workbench API",
      "Branch Operations",
      "Claims Processing",
    ]);
    await expect(
      preflight.getByRole("columnheader", { name: "Application" })
    ).toBeVisible();
    await expect(
      preflight.getByRole("columnheader", { name: /Skills/ })
    ).toHaveCount(0);
    await expect(
      preflight.getByRole("button", { name: /^Skills/ })
    ).toHaveCount(0);
    await preflight
      .getByLabel("Use one migration plan for all applications")
      .check();
    await expect(preflight.getByText(/Skills are not previewed/)).toHaveCount(
      0
    );
  });
});
