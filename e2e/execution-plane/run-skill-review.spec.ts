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
  addTargetProfile,
  agenticGet,
  agenticRequest,
  appPath,
  bootMockApi,
  dialog,
  expect,
  main,
  openBulkRunMigration,
  personaSelect,
  pickMenuOption,
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
  excluded: boolean;
}
interface SkillGroup {
  skills: SkillEntry[];
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
  skills?: { stages: SkillGroup[]; everyStage: SkillGroup[] };
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
 * Saves plan 5 with skill 8 excluded and returns the excluded skill's name,
 * read from the server.
 */
const excludeSkillOnPlan = async (page: Page) => {
  await savePlanExclusion(page, EXCLUDED_SKILL_ID);

  const views = await agenticGet<Record<number, MigrationView>>(
    page,
    `/application-migrations?applicationIds=${APPLICATION_ID}`
  );
  const view = views[APPLICATION_ID];
  expect(view.plan?.id).toBe(PLAN_ID);
  const excluded = [
    ...(view.skills?.stages ?? []),
    ...(view.skills?.everyStage ?? []),
  ]
    .flatMap((group) => group.skills)
    .filter((entry) => entry.excluded);
  expect(new Set(excluded.map(({ skill }) => skill.id))).toEqual(
    new Set([EXCLUDED_SKILL_ID])
  );
  return { skillName: excluded[0].skill.name };
};

/**
 * Skills by stage on the plan run page, the Migration tab and the Run
 * dialog: "Skills by stage", or "Skills by stage with {plan}" when the
 * dialog starts several runs.
 */
const stageSkillsTable = (
  scope: Locator,
  name: string | RegExp = "Skills by stage"
) =>
  scope.getByRole("grid", {
    name,
    ...(typeof name === "string" ? { exact: true } : {}),
  });

/** Opens every collapsed group of a Skills by stage table (the dialog's). */
const expandAllGroups = async (table: Locator) => {
  const collapsed = table.locator('button[aria-expanded="false"]');
  while ((await collapsed.count()) > 0) await collapsed.first().click();
};

/**
 * Every row of the skill is marked: an exclusion is per plan. The Run
 * dialog labels a plan's exclusion "Excluded by plan" (it cannot be undone
 * there).
 */
const expectExcludedStageRows = async (
  scope: Locator,
  skillName: string,
  name?: string | RegExp,
  label = "Excluded"
) => {
  const table = stageSkillsTable(scope, name);
  const rows = table.getByRole("row").filter({ hasText: skillName });
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all())
    await expect(row).toContainText("Excluded");
  await expect(table.getByText(label, { exact: true })).toHaveCount(
    await rows.count()
  );
};

test.describe("Skills in the run dialog and on the run pages", () => {
  test("one application: preview, override, run, and the run and Skills tab agree", async ({
    page,
  }) => {
    await bootMockApi(page);
    const { skillName } = await excludeSkillOnPlan(page);

    await spaNavigate(page, `/applications/${APPLICATION_ID}?tab=migration`);
    await main(page)
      .getByRole("button", { name: "Run migration plan", exact: true })
      .click();
    const preflight = dialog(page, "Run migration plan");
    await expect(preflight).toBeVisible();

    // Collapsed until asked for; every group in it collapsed too.
    const toggle = preflight.getByRole("button", { name: "Skills by stage" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = stageSkillsTable(preflight);
    await expect(table).toBeVisible();
    // The collapsed summary of the stage that loses the skill says so.
    await expect(table.getByText(/, 1 excluded$/).first()).toBeVisible();
    await expandAllGroups(table);
    await expectExcludedStageRows(
      preflight,
      skillName,
      undefined,
      "Excluded by plan"
    );
    // Plain names: a link would close the dialog and lose its choices.
    await expect(table.getByRole("link")).toHaveCount(0);

    // One plan for all applications: the preview asks for the plan first,
    // and switching back keeps it open.
    // The preview sits below the choice, so the radio keeps its place under
    // the readiness table whatever the preview shows.
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
    await expect(
      preflight.getByText("Select a migration plan to see skills by stage.")
    ).toBeVisible();
    // Sub-pixel scroll rounding aside.
    expect(Math.abs((await offset()) - before)).toBeLessThan(2);
    await preflight.getByLabel("Use each application's migration plan").check();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // The run snapshots the exclusion.
    await preflight
      .getByRole("button", { name: "Run on 1 application" })
      .click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    const runPath = appPath(new URL(page.url()).pathname);
    await expect(
      main(page).getByRole("heading", {
        level: 2,
        name: "Skills by stage",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      main(page).getByText(
        "Worked out when the run started. Each stage's agent reads its own skills when the stage starts, so a change to that agent before then can change what the stage gets."
      )
    ).toBeVisible();
    await expectExcludedStageRows(main(page), skillName);

    // The Migration tab shows that run's snapshot: the same exclusion.
    await spaNavigate(page, `/applications/${APPLICATION_ID}?tab=migration`);
    await expect(
      main(page).getByRole("region", { name: "Skills by stage" })
    ).toContainText(
      /What each stage got for this application in .+, its latest plan run\./
    );
    await expectExcludedStageRows(main(page), skillName);

    // Without the write scopes the run page shows the same rows, read-only.
    await spaNavigate(page, `${runPath}?protoPersona=hubMigrator`);
    await expect(personaSelect(page)).toHaveValue("hubMigrator");
    await expectExcludedStageRows(main(page), skillName);
    await expect(
      stageSkillsTable(main(page)).getByRole("checkbox")
    ).toHaveCount(0);
  });

  test("the skill page marks the plan that excludes it", async ({ page }) => {
    await bootMockApi(page);
    await excludeSkillOnPlan(page);
    const plan = await agenticGet<StoredPlan>(page, `/plans/${PLAN_ID}`);

    await spaNavigate(page, `/skills/${EXCLUDED_SKILL_ID}?tab=usage`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    // The exclusion marks the stages of this plan only, one row per stage.
    // A plan's rows share one row group; its name spans them.
    const excludedRows = plans
      .getByRole("rowgroup")
      .filter({
        has: page.getByRole("link", { name: plan.name, exact: true }),
      })
      .getByRole("row")
      .filter({ hasText: "Excluded" });
    await expect(excludedRows.first()).toBeVisible();
    await expect(plans.getByText("Excluded", { exact: true })).toHaveCount(
      await excludedRows.count()
    );
    // The heading counts every plan the server lists, the excluding one
    // too, never "{used} of {count}".
    const { plans: listed } = await agenticGet<{ plans: unknown[] }>(
      page,
      `/skills/${EXCLUDED_SKILL_ID}/plans`
    );
    await expect(
      main(page).getByRole("heading", {
        level: 2,
        name: `Used in migration plans (${listed.length})`,
      })
    ).toBeVisible();
  });

  test("the skill page lists a plan that gets the skill through a skill collection", async ({
    page,
  }) => {
    await bootMockApi(page);
    await savePlanExclusion(page, COLLECTION_SKILL_ID);
    const plan = await agenticGet<StoredPlan>(page, `/plans/${PLAN_ID}`);

    await spaNavigate(page, `/skills/${COLLECTION_SKILL_ID}?tab=usage`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    // The stage that gets it from its agent's collection, marked Excluded.
    const row = plans
      .getByRole("row")
      .filter({ hasText: plan.name })
      .filter({ hasText: "Collection: " });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Excluded", { exact: true })).toBeVisible();
    await expect(row).toContainText(/Stage \d+: /);
  });

  test("several applications: one preview per run, ready applications only, the attribution once", async ({
    page,
  }) => {
    await bootMockApi(page);
    const { skillName } = await excludeSkillOnPlan(page);
    await waitForInventory(page);
    const preflight = await openBulkRunMigration(page, [
      "Advisor Workbench API",
      "Branch Operations",
      "Claims Processing",
    ]);
    await preflight.getByRole("button", { name: "Skills by stage" }).click();
    // Each application on its own plan: one table per run.
    await expect(
      stageSkillsTable(
        preflight,
        /^Skills by stage with Legacy Java/
      ).getByRole("heading", { name: "Every stage: Branch Operations" })
    ).toBeVisible();
    await expect(
      stageSkillsTable(preflight, /^Skills by stage with \.NET/).getByRole(
        "heading",
        { name: "Every stage: Advisor Workbench API" }
      )
    ).toBeVisible();
    // Claims Processing is blocked: it starts nothing, so no table names it.
    await expect(
      preflight.getByRole("heading", { name: /Every stage: Claims Processing/ })
    ).toHaveCount(0);

    // One plan for all: one run of both ready applications, resolved with
    // the plan's exclusion, the attribution said once.
    await preflight
      .getByLabel("Use one migration plan for all applications")
      .check();
    await preflight
      .getByRole("button", { name: "Migration plan to run" })
      .click();
    await pickMenuOption(page, "Legacy Java runtime modernization");
    const run = stageSkillsTable(preflight);
    for (const application of ["Advisor Workbench API", "Branch Operations"])
      await expect(
        run.getByRole("heading", { name: `Every stage: ${application}` })
      ).toBeVisible();
    await expect(
      preflight.getByText(
        "An application's archetype, target profile and own skills go to that application only."
      )
    ).toHaveCount(1);
    await expandAllGroups(run);
    await expectExcludedStageRows(
      preflight,
      skillName,
      undefined,
      "Excluded by plan"
    );
  });
});

// ── Run exclusions and the target profile pick ──────────────────────────────

/** A plan run as the mock serves it: its snapshot and own exclusions. */
interface RunWithExclusions {
  name: string;
  excludedSkills?: Ref[];
  skills: { stages: SkillGroup[]; everyStage: SkillGroup[] };
}

/** The skill loader's resource name for a skill (lower case, dashes). */
const resourceName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Opens the Run dialog from application 13's Migration tab. */
const openRunDialog = async (page: Page, applicationId = APPLICATION_ID) => {
  await spaNavigate(page, `/applications/${applicationId}?tab=migration`);
  await main(page)
    .getByRole("button", { name: "Run migration plan", exact: true })
    .click();
  const preflight = dialog(page, "Run migration plan");
  await expect(preflight).toBeVisible();
  return preflight;
};

/** Runs, lands on the new plan run and returns it as the server has it. */
const runAndOpen = async (page: Page, preflight: Locator) => {
  await preflight
    .getByRole("button", { name: /^Run on 1 application/ })
    .click();
  await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
  const runId = appPath(new URL(page.url()).pathname).split("/")[2];
  return agenticGet<RunWithExclusions>(page, `/plan-runs/${runId}`);
};

test.describe("Excluding skills and picking the target profile for a run", () => {
  test("a skill cleared in the dialog is left out of the run and its skill loader", async ({
    page,
  }) => {
    await bootMockApi(page);
    const preflight = await openRunDialog(page);
    const toggle = preflight.getByRole("button", { name: /^Skills by stage/ });
    await toggle.click();
    const table = stageSkillsTable(preflight);
    await expandAllGroups(table);
    const first = table.getByRole("checkbox", { name: / in stage 1$/ }).first();
    const label = (await first.getAttribute("aria-label"))!;
    const skillName = label
      .replace(/^Include /, "")
      .replace(/ in stage 1$/, "");
    await first.uncheck();
    await expect(
      preflight.getByText(
        `${skillName} excluded from stage 1. 1 skill excluded for this run.`
      )
    ).toBeVisible();
    await expect(toggle).toHaveText("Skills by stage (1 skill excluded)");

    const run = await runAndOpen(page, preflight);
    expect(run.excludedSkills?.map(({ name }) => name)).toEqual([skillName]);
    await expect(
      main(page).getByText(
        // The plan excludes nothing here: the plain sentence.
        `Excluded for this run only: ${skillName}.`
      )
    ).toBeVisible();
    await expectExcludedStageRows(main(page), skillName);

    // The first stage's skill loader does not stage it.
    const firstStage = main(page)
      .getByRole("grid", { name: /Stages/ })
      .locator("tbody tr")
      .first();
    await expect(firstStage).toContainText(/\d+%/, { timeout: 30_000 });
    await firstStage.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/stages\//);
    await page.getByRole("tab", { name: "Logs", exact: true }).click();
    const log = main(page).getByRole("region", { name: / log$/ });
    await log.getByRole("button", { name: /^Container: / }).click();
    await page.getByRole("option", { name: /^Skill loader/ }).click();
    const loader = main(page).getByRole("region", { name: "Skill loader log" });
    await expect(loader).toContainText(/sources: \d+ declared/);
    const staged = (
      await loader.locator(".pf-v6-c-log-viewer__text").allInnerTexts()
    )
      .filter((line) => / \((skill|rule)\) from /.test(line))
      .map((line) => line.split(" ")[0]);
    expect(staged.length).toBeGreaterThan(0);
    expect(staged).not.toContain(resourceName(skillName));
  });

  test("a plan's exclusion is locked; the application's own skill can still be excluded", async ({
    page,
  }) => {
    await bootMockApi(page);
    // Skill 8 is the plan's exclusion and also attached to application 13.
    const attached = await agenticRequest(
      page,
      "PUT",
      `/applications/${APPLICATION_ID}/skills`,
      { skills: [{ id: EXCLUDED_SKILL_ID }] }
    );
    expect(attached.status, "PUT application skills").toBeLessThan(300);
    const { skillName } = await excludeSkillOnPlan(page);

    const preflight = await openRunDialog(page);
    await preflight.getByRole("button", { name: /^Skills by stage/ }).click();
    const table = stageSkillsTable(preflight);
    await expandAllGroups(table);
    const locked = table.getByRole("checkbox", {
      name: new RegExp(`^Include ${skillName} in stage \\d+$`),
    });
    await expect(locked.first()).toBeDisabled();
    await expect(locked.first()).toHaveAccessibleDescription(
      "Excluded by plan"
    );
    const own = table.getByRole("checkbox", {
      name: `Include ${skillName} in every stage`,
    });
    await expect(own).toBeEnabled();
    await expect(own).toBeChecked();
    await own.uncheck();
    await expect(locked.first()).toHaveAccessibleDescription(
      "Excluded by plan"
    );

    const run = await runAndOpen(page, preflight);
    expect(run.excludedSkills?.map(({ id }) => id)).toEqual([
      EXCLUDED_SKILL_ID,
    ]);
    // Every row of the skill is excluded in the snapshot, the application's too.
    const rows = [...run.skills.stages, ...run.skills.everyStage]
      .flatMap((group) => group.skills)
      .filter(({ skill }) => skill.id === EXCLUDED_SKILL_ID);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every(({ excluded }) => excluded)).toBe(true);
  });

  test("an archetype with two target profiles: the pick decides the plan", async ({
    page,
  }) => {
    await bootMockApi(page);
    // A second profile on Java EE Application (Customer Management's), with
    // Java EE lift and shift assigned to it: runtime data, not a fixture.
    const profile = { id: 19, name: "OpenJDK 21 on OpenShift" };
    await addTargetProfile(page, 1, profile);
    const assigned = await agenticRequest(
      page,
      "PUT",
      `/archetypes/1/target-profiles/${profile.id}/plan`,
      { planId: "3" }
    );
    expect(assigned.status, "PUT target profile plan").toBeLessThan(300);

    const preflight = await openRunDialog(page, 1);
    const select = preflight.getByRole("button", {
      name: /^Target profile for Customer Management/,
    });
    // The server's default is preselected.
    await expect(select).toHaveAccessibleName(
      "Target profile for Customer Management Quarkus 3.x"
    );
    await select.click();
    await pickMenuOption(page, profile.name);
    await expect(select).toHaveAccessibleName(
      `Target profile for Customer Management ${profile.name}`
    );
    const row = preflight.getByRole("row", { name: /Customer Management/ });
    await expect(
      row.getByRole("link", { name: "Java EE lift and shift" })
    ).toBeVisible();

    const run = await runAndOpen(page, preflight);
    expect(run.name).toMatch(/: Java EE lift and shift$/);
  });
});
