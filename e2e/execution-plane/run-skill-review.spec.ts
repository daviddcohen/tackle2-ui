/**
 * Skills a migration plan excludes, seen where a run starts and after: the
 * Run migration plan dialog previews one application's skills, the plan run
 * keeps its snapshot of excluded skills, and the application Skills tab and
 * the skill page agree. No fixture excludes a skill and a reload resets the
 * mock, so each test saves an exclusion on plan 5 (the plan of application
 * 13's Java 17 on OpenShift target profile) through the API and then
 * navigates inside the app. Application 13's other target profile runs
 * another plan, so the dialog asks which one it runs on.
 */
import type { Locator, Page } from "@playwright/test";

import {
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
  pickRunTargetProfile,
  spaNavigate,
  test,
  waitForInventory,
} from "../support";

const PLAN_ID = "5";
const APPLICATION_ID = 13;
const APPLICATION = "Branch Operations";
/** Application 13's target profile that uses plan 5. */
const TARGET_PROFILE_ID = 31;
const TARGET_PROFILE = "Java 17 on OpenShift";
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
}
interface MigrationView {
  migrationPaths?: { targetProfile: { id: number }; plan?: Ref }[];
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
  const path = views[APPLICATION_ID].migrationPaths?.find(
    ({ targetProfile }) => targetProfile.id === TARGET_PROFILE_ID
  );
  expect(path?.plan?.id).toBe(PLAN_ID);
  const plan = await agenticGet<{ excludedSkills?: Ref[] }>(
    page,
    `/plans/${PLAN_ID}`
  );
  expect(plan.excludedSkills?.map(({ id }) => id)).toEqual([EXCLUDED_SKILL_ID]);
  return { skillName: plan.excludedSkills![0].name };
};

/**
 * Picks application 13's target profile on plan 5 in the open dialog: its
 * archetype has two target profiles with a plan, so Run waits for a pick.
 */
const pickTargetProfile = (page: Page, preflight: Locator) =>
  pickRunTargetProfile(page, preflight, APPLICATION, TARGET_PROFILE);

/**
 * Skills by stage on the plan run page and in the Run dialog: "Skills by
 * stage", or "Skills by stage with {plan}" when the dialog starts several
 * runs.
 */
const stageSkillsTable = (
  scope: Locator,
  name: string | RegExp = "Skills by stage"
) =>
  scope.getByRole("grid", {
    name,
    ...(typeof name === "string" ? { exact: true } : {}),
  });

/**
 * Opens every collapsed group of a Skills by stage table. A table of a few
 * applications starts with every group open; with more, the Every stage
 * groups start collapsed.
 */
const expandAllGroups = async (table: Locator) => {
  // Wait for the (re)loaded table's first group toggle.
  await expect(table.locator("button[aria-expanded]").first()).toBeVisible();
  const collapsed = table.locator('button[aria-expanded="false"]');
  while ((await collapsed.count()) > 0) await collapsed.first().click();
};

/**
 * Every row of the skill is marked: an exclusion is per plan. The Run
 * dialog labels a plan's exclusion "Excluded by plan" (it cannot be undone
 * there).
 */
/** A locked row's checkbox description: its label, then its tooltip. */
const EXCLUDED_BY_PLAN_DESCRIPTION =
  "Excluded by plan The migration plan excludes this skill. To include it, edit the migration plan.";

/** The rows of the groups whose title matches (one tbody per group). */
const groupBody = (table: Locator, title: RegExp) =>
  table
    .locator("tbody")
    .filter({ has: table.page().getByRole("heading", { name: title }) });

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
    await pickTargetProfile(page, preflight);

    // Collapsed until asked for; then its groups are open.
    const toggle = preflight.getByRole("button", {
      name: "Review skills by stage",
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = stageSkillsTable(preflight);
    await expect(table).toBeVisible();
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
    // Measured from the table's bottom: the row's Target profile cell
    // changes height with the choice (a select, or the plan's profile).
    // Both in one read: the review's scroll into view may still be moving.
    const offset = async () => {
      const radio = await onePlan.elementHandle();
      return readiness.evaluate(
        (table, radio) =>
          radio!.getBoundingClientRect().top -
          table.getBoundingClientRect().bottom,
        radio
      );
    };
    const before = await offset();
    await onePlan.check();
    await expect(
      preflight.getByText("Select a migration plan to see skills by stage.")
    ).toBeVisible();
    // Sub-pixel scroll rounding aside.
    expect(Math.abs((await offset()) - before)).toBeLessThan(2);
    await preflight
      .getByLabel("Use the migration plan of each target profile")
      .check();
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
    await expectExcludedStageRows(
      main(page),
      skillName,
      undefined,
      "Excluded by plan"
    );

    // The Migration tab names that run; its skills stay on the run page.
    await spaNavigate(page, `/applications/${APPLICATION_ID}?tab=migration`);
    await expect(
      main(page)
        .getByRole("region", { name: "Latest plan run" })
        .getByRole("link", { name: /^Run #\d+/ })
    ).toHaveAttribute("href", new RegExp(`${runPath}(\\?|$)`));
    await expect(
      main(page).getByRole("region", { name: "Skills by stage" })
    ).toHaveCount(0);

    // Without the write scopes the run page shows the same rows, read-only.
    await spaNavigate(page, `${runPath}?protoPersona=hubMigrator`);
    await expect(personaSelect(page)).toHaveValue("hubMigrator");
    await expectExcludedStageRows(
      main(page),
      skillName,
      undefined,
      "Excluded by plan"
    );
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

  test("several applications: one preview per run, ready applications only, each application collapsed", async ({
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
    await pickTargetProfile(page, preflight);
    await preflight
      .getByRole("button", { name: "Review skills by stage" })
      .click();
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
    // the plan's exclusion. Each application's Every stage group starts
    // collapsed; its toggle opens it.
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
        run.getByRole("button", { name: `Every stage: ${application} Details` })
      ).toHaveAttribute("aria-expanded", "false");
    await expect(
      preflight.getByText(
        "Clear a skill to leave it out of every stage and every application in the plan run.",
        { exact: true }
      )
    ).toBeVisible();
    await run
      .getByRole("button", { name: "Every stage: Branch Operations Details" })
      .click();
    await expect(
      groupBody(run, /^Every stage: Branch Operations/)
        .getByRole("checkbox")
        .first()
    ).toBeVisible();
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

/**
 * Opens the Run dialog from an application's Migration tab; for application
 * 13 (the default) it also picks the target profile on plan 5.
 */
const openRunDialog = async (page: Page, applicationId = APPLICATION_ID) => {
  await spaNavigate(page, `/applications/${applicationId}?tab=migration`);
  await main(page)
    .getByRole("button", { name: "Run migration plan", exact: true })
    .click();
  const preflight = dialog(page, "Run migration plan");
  await expect(preflight).toBeVisible();
  if (applicationId === APPLICATION_ID)
    await pickTargetProfile(page, preflight);
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
    const toggle = preflight.getByRole("button", {
      name: /^Review skills by stage/,
    });
    await toggle.click();
    const table = stageSkillsTable(preflight);
    await expandAllGroups(table);
    const first = groupBody(table, /^Stage 1:/)
      .getByRole("checkbox", { name: / in this plan run$/ })
      .first();
    const label = (await first.getAttribute("aria-label"))!;
    const skillName = label
      .replace(/^Include /, "")
      .replace(/ in this plan run$/, "");
    await first.uncheck();
    // Said to screen readers; the toggle and the row show it.
    await expect(
      preflight.getByText(
        `${skillName} excluded from stage 1. 1 skill excluded for this run.`
      )
    ).toHaveAttribute("aria-live", "polite");
    await expect(toggle).toHaveText(
      "Review skills by stage (1 skill excluded)"
    );

    const run = await runAndOpen(page, preflight);
    expect(run.excludedSkills?.map(({ name }) => name)).toEqual([skillName]);
    // A fact names the run's own exclusions.
    await expect(
      main(page)
        .locator("dl")
        .first()
        .getByRole("link", { name: skillName, exact: true })
    ).toBeVisible();
    await expectExcludedStageRows(
      main(page),
      skillName,
      undefined,
      "Excluded for this run"
    );

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
    await preflight
      .getByRole("button", { name: /^Review skills by stage/ })
      .click();
    const table = stageSkillsTable(preflight);
    await expandAllGroups(table);
    // One name per skill in the dialog: the group tells the rows apart.
    const locked = groupBody(table, /^Stage \d+:/).getByRole("checkbox", {
      name: `Include ${skillName} in this plan run`,
    });
    await expect(locked.first()).toBeDisabled();
    await expect(locked.first()).toHaveAccessibleDescription(
      EXCLUDED_BY_PLAN_DESCRIPTION
    );
    const own = groupBody(table, /^Every stage/).getByRole("checkbox", {
      name: `Include ${skillName} in this plan run`,
    });
    await expect(own).toBeEnabled();
    await expect(own).toBeChecked();
    await own.uncheck();
    await expect(locked.first()).toHaveAccessibleDescription(
      EXCLUDED_BY_PLAN_DESCRIPTION
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

  test("an application with two runnable target profiles: Run waits for a pick, and the pick decides the plan", async ({
    page,
  }) => {
    // Customer Management (Java EE Application) runs Java EE to Quarkus on
    // Quarkus 3.x or Java lift and shift on OpenJDK 21 on OpenShift.
    await bootMockApi(page);
    const preflight = await openRunDialog(page, 1);
    const select = preflight.getByRole("button", {
      name: /^Target profile for Customer Management/,
    });
    const run = preflight.getByRole("button", {
      name: "Run on 1 application",
    });
    // No default: nothing preselected, and Run is off until a pick.
    await expect(select).toHaveAccessibleName(
      "Target profile for Customer Management Select a target profile"
    );
    await expect(select).toHaveAccessibleDescription(
      "Select a target profile to run this application."
    );
    await expect(
      preflight.getByText(/1 needs a target profile before it can run\./)
    ).toBeVisible();
    await expect(run).toBeDisabled();
    await select.click();
    // Each option says the plan it runs.
    await expect(
      page.getByRole("option", { name: /^Quarkus 3\.x/ })
    ).toContainText("Runs Java EE to Quarkus");
    await expect(
      page.getByRole("option", { name: /^OpenJDK 21 on OpenShift/ })
    ).toContainText("Runs Java lift and shift");
    await pickMenuOption(page, /^OpenJDK 21 on OpenShift/);
    await expect(select).toHaveAccessibleName(
      "Target profile for Customer Management OpenJDK 21 on OpenShift"
    );
    const row = preflight.getByRole("row", { name: /Customer Management/ });
    await expect(row).toContainText("Java lift and shift");
    await expect(run).toBeEnabled();

    const created = await runAndOpen(page, preflight);
    expect(created.name).toMatch(/: Java lift and shift$/);
  });

  test("from a plan shared by two archetypes, each application gets the target profile that uses it", async ({
    page,
  }) => {
    await bootMockApi(page);
    await spaNavigate(page, "/migration-plans/3");
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(
      "Java lift and shift"
    );
    await main(page).getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Run migration plan" }).click();
    const preflight = dialog(page, "Run migration plan");
    // Two target profiles use the plan: the description names neither.
    await expect(preflight).toContainText(
      "Runs Java lift and shift on the applications you select."
    );
    await expect(preflight).not.toContainText("Target profile: ");
    const table = preflight.getByRole("grid", {
      name: "Applications of Java lift and shift",
    });
    // The Target profile column says which: each application runs on the
    // one target profile of its archetype that uses the plan, as text, so
    // no pick is asked for.
    await expect(
      table.getByRole("columnheader", { name: "Target profile" })
    ).toBeVisible();
    await expect(
      table.getByRole("gridcell", { name: "OpenJDK 21 on OpenShift" }).first()
    ).toBeVisible();
    await expect(
      table.getByRole("gridcell", { name: "Java 8 on OpenShift" }).first()
    ).toBeVisible();
    await expect(
      table.getByRole("button", { name: /^Target profile for / })
    ).toHaveCount(0);
    await expect(
      preflight.getByText("Select a target profile to run this application.")
    ).toHaveCount(0);
    await expect(
      preflight.getByRole("button", { name: /^Run on \d+ applications/ })
    ).toBeEnabled();
    // The preview shows which: each application's own target profile skills.
    await preflight
      .getByRole("button", { name: "Review skills by stage" })
      .click();
    const preview = stageSkillsTable(preflight);
    await expandAllGroups(preview);
    await expect(
      preview
        .getByText(
          "Target profile: OpenJDK 21 on OpenShift (Java EE Application)"
        )
        .first()
    ).toBeVisible();
    await expect(
      preview
        .getByText(
          "Target profile: Java 8 on OpenShift (Legacy Java Application)"
        )
        .first()
    ).toBeVisible();
    await expect(
      preview.getByText(/^Target profile: Quarkus 3\.x/)
    ).toHaveCount(0);
  });
});
