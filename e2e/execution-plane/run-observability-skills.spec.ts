/**
 * The plan skill review and run observability together on one run: a run
 * started after its plan excluded a skill shows the Excluded marker in its
 * Skills section next to the Stages table's Context column, both survive the
 * page's live refresh, and the stage's skill loader stages what that stage
 * gets (its own group and the application's every-stage group), each skill
 * once and never the excluded one. No fixture excludes a skill and a reload
 * resets the mock, so the test saves an exclusion on plan 5 (the plan of
 * application 13) through the API and then navigates inside the app.
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
  spaNavigate,
  test,
} from "../support";

const PLAN_ID = "5";
const APPLICATION_ID = 13;
const EXCLUDED_SKILL_ID = "8";
/** The first stage starts after the mock's pending time and reports usage. */
const STAGE_START_TIMEOUT = 30_000;

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
interface StageSkillRow extends SkillEntry {
  excluded: boolean;
}
interface Run {
  skills: {
    stages: { skills: StageSkillRow[] }[];
    everyStage: { skills: StageSkillRow[] }[];
  };
}

/** Saves plan 5 with one excluded skill, as the plan wizard does. */
const excludeSkillOnPlan = async (page: Page) => {
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
    excludedSkills: [{ id: EXCLUDED_SKILL_ID }],
  });
  expect(saved.status, "PUT plan").toBeLessThan(300);
};

/** The skill loader's resource name for a skill (lower case, dashes). */
const resourceName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const names = (entries: SkillEntry[] = []) => [
  ...new Set(entries.map(({ skill }) => skill.name)),
];

const skillsTable = (scope: Locator) =>
  scope.getByRole("grid", { name: "Skills by stage", exact: true });

const stagesTable = (page: Page) =>
  main(page).getByRole("grid", { name: /Stages/ });

test("a run with an excluded skill: skills, context and the skill loader agree", async ({
  page,
}) => {
  await bootMockApi(page);
  await excludeSkillOnPlan(page);

  await spaNavigate(page, `/applications/${APPLICATION_ID}?tab=migration`);
  await main(page)
    .getByRole("button", { name: "Run migration plan", exact: true })
    .click();
  await dialog(page, "Run migration plan")
    .getByRole("button", { name: "Run on 1 application" })
    .click();
  await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
  const runId = appPath(new URL(page.url()).pathname).split("/")[2];
  const run = await agenticGet<Run>(page, `/plan-runs/${runId}`);
  const rows = [...run.skills.stages, ...run.skills.everyStage].flatMap(
    (group) => group.skills
  );
  const used = names(rows.filter((row) => !row.excluded));
  const excluded = names(rows.filter((row) => row.excluded));
  expect(excluded).toHaveLength(1);
  expect(used.length).toBeGreaterThan(0);

  // Feature 2's Skills by stage and feature 3's Context column, side by side.
  await expect(
    main(page).getByRole("heading", { level: 2, name: "Skills by stage" })
  ).toBeVisible();
  // An exclusion is per plan: every row of the skill is marked.
  const excludedRows = skillsTable(main(page))
    .getByRole("row")
    .filter({ hasText: excluded[0] });
  await expect(excludedRows.first()).toContainText("Excluded");
  const excludedRowCount = await excludedRows.count();
  await expect(
    skillsTable(main(page)).getByText("Excluded", { exact: true })
  ).toHaveCount(excludedRowCount);
  await expect(
    stagesTable(page).getByRole("columnheader", { name: /^Context/ })
  ).toBeVisible();

  // The page refreshes on its own: the first stage starts and reports its
  // context, and the Skills section stays as it was (one heading, one mark).
  const firstStage = stagesTable(page).locator("tbody tr").first();
  await expect(firstStage).toContainText(/\d+%/, {
    timeout: STAGE_START_TIMEOUT,
  });
  await expect(
    main(page).getByRole("heading", { level: 2, name: /^Skills/ })
  ).toHaveCount(1);
  await expect(
    skillsTable(main(page)).getByText("Excluded", { exact: true })
  ).toHaveCount(excludedRowCount);

  // The stage page: tabs, the context row, and the skill loader's log.
  await firstStage.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/stages\//);
  await expect(main(page).getByText("Context window")).toBeVisible();
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  const log = main(page).getByRole("region", { name: / log$/ });
  await log.getByRole("button", { name: /^Container: / }).click();
  await page.getByRole("option", { name: /^Skill loader/ }).click();
  const loader = main(page).getByRole("region", { name: "Skill loader log" });
  // The first stage gets its own group and the application's context.
  const stageGets = names(
    [...run.skills.stages[0].skills, ...run.skills.everyStage[0].skills].filter(
      ({ excluded }) => !excluded
    )
  );
  await expect(loader).toContainText(`sources: ${stageGets.length} declared`);
  const staged = (
    await loader.locator(".pf-v6-c-log-viewer__text").allInnerTexts()
  )
    .filter((line) => / \((skill|rule)\) from /.test(line))
    .map((line) => line.split(" ")[0]);
  expect(staged.sort()).toEqual(stageGets.map(resourceName).sort());
  expect(staged).not.toContain(resourceName(excluded[0]));
});
