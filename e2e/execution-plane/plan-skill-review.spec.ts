/**
 * Plan skill review: the wizard's Skills step shows Skills by stage for a
 * draft plan (each stage's agent and collection skills, then the archetype
 * and target profile skills every stage gets) and lets the user exclude
 * skills from the plan; Review and the plan page's Skills by stage show the
 * result. MSW state lives in the page, so after a save the specs
 * stay in the SPA (no reload).
 */
import type { Locator, Page } from "@playwright/test";

import {
  addTargetProfile,
  expect,
  main,
  mainHeading,
  pickMenuOption,
  protoUrl,
  spaNavigate,
  test,
} from "../support";

const next = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Next", exact: true });

/** The Include checkbox of a skill in one group ("stage 2", "every stage"). */
const includeBox = (scope: Locator, skill: string, group: string) =>
  scope.getByRole("checkbox", {
    name: `Include ${skill} in ${group}`,
    exact: true,
  });

/** The Review step's "Excluded skills" fact. */
const reviewSkills = (dialog: Locator) =>
  dialog
    .locator(".pf-v6-c-description-list__group")
    .filter({ hasText: /^Excluded skills/ });

const skillsTable = (scope: Locator) =>
  scope.getByRole("grid", { name: "Skills by stage", exact: true });

const skillRows = (scope: Locator, skill: string) =>
  scope.getByRole("row", { name: new RegExp(skill) });

const groupTitles = (table: Locator, level: number) =>
  table.getByRole("heading", { level });

const openEdit = async (page: Page) => {
  await main(page).getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Edit migration plan" })
  ).toBeVisible();
  return dialog;
};

test.describe("Plan skill review", () => {
  test("architect reviews and excludes skills while creating a plan", async ({
    page,
  }) => {
    // A second profile for the archetype, which no plan is assigned to yet,
    // added before any page reads the archetypes.
    await page.goto(protoUrl("/models", { scenario: "configured" }));
    await addTargetProfile(page, 3, { id: 32, name: "Java 17 on RHEL" });
    await spaNavigate(page, "/migration-plans");
    await page.getByRole("button", { name: "Create migration plan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(
        "Choose which applications the plan is for, define the stages that run in order, and review their skills."
      )
    ).toBeVisible();
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("Legacy Java on RHEL E2E");
    await next(dialog).click();
    await dialog.getByRole("button", { name: /^Archetype/ }).click();
    await pickMenuOption(page, "Legacy Java Application");
    await dialog.locator("#plan-target-profiles-input").click();
    await pickMenuOption(page, "Java 17 on RHEL");
    await dialog.getByText(/^Applications in this archetype/).click();
    await next(dialog).click();
    const stages: [string, string][] = [
      ["Propose", "Migration Proposal Agent"],
      ["Migrate", "Java Code Migrator"],
      ["Validate", "Build Validator"],
    ];
    for (const [index, [name, agent]] of stages.entries()) {
      if (index > 0)
        await dialog.getByRole("button", { name: "Add stage" }).click();
      await dialog.getByRole("textbox", { name: "Stage name" }).fill(name);
      await dialog.getByRole("button", { name: /^Agent/ }).click();
      await pickMenuOption(page, agent);
      await dialog
        .getByRole("button", { name: `Details of Stage ${index + 1}: ${name}` })
        .click();
    }
    await next(dialog).click();

    // Skills step: what each stage gets, and where each skill comes from.
    await expect(
      dialog.getByText(
        "Each stage gets its agent's skills and the skills in Every stage. Skills of this plan's archetype and target profile. When it runs, each application also gets its own skills. An application from another archetype gets its own archetype and target profile skills instead. Clear a skill to exclude it from this plan; it is then left out of every stage. Skills attached to an application are always included: a plan cannot exclude them."
      )
    ).toBeVisible();
    await expect(dialog.getByText("No skills excluded.")).toBeVisible();
    const table = skillsTable(dialog);
    await expect(groupTitles(table, 2)).toHaveText([
      "Stage 1: Propose",
      "Stage 2: Migrate",
      "Stage 3: Validate",
      "Every stage",
    ]);
    const jakarta = skillRows(table, "Jakarta EE namespace migration");
    await expect(jakarta).toHaveCount(1);
    await expect(jakarta).toContainText(
      "Collection: Java modernization foundation"
    );
    // On the stage agent and on the archetype: one row in each group.
    const validation = skillRows(table, "Build validation standards");
    await expect(validation).toHaveCount(2);
    await expect(validation.nth(0)).toContainText("Agent: Build Validator");
    await expect(validation.nth(1)).toContainText(
      "Archetype: Legacy Java Application"
    );
    // Plain names: a link would leave the draft.
    await expect(table.getByRole("link")).toHaveCount(0);

    await includeBox(
      table,
      "Containerization standards",
      "every stage"
    ).uncheck();
    await expect(
      dialog.getByText(
        "Containerization standards excluded from every stage. 1 skill excluded from this plan."
      )
    ).toBeVisible();
    await includeBox(table, "API compatibility checklist", "stage 1").uncheck();
    await expect(
      dialog.getByText(
        "API compatibility checklist excluded from stage 1. 2 skills excluded from this plan."
      )
    ).toBeVisible();
    await expect(table.getByText("Excluded", { exact: true })).toHaveCount(2);

    await next(dialog).click();
    const review = reviewSkills(dialog);
    await expect(review).toContainText("API compatibility checklist (stage 1)");
    await expect(review).toContainText(
      "Containerization standards (every stage)"
    );
    await expect(review).not.toContainText(/\d+ skills?/);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Migration plan created")).toBeVisible();

    // Plan Details (SPA navigation keeps the mock state).
    await main(page)
      .getByRole("link", { name: "Legacy Java on RHEL E2E" })
      .click();
    await expect(mainHeading(page)).toHaveText("Legacy Java on RHEL E2E");
    await expect(
      main(page).getByRole("heading", { level: 2, name: "Skills by stage" })
    ).toBeVisible();
    const details = skillsTable(main(page));
    await expect(groupTitles(details, 3)).toHaveText([
      "Stage 1: Propose",
      "Stage 2: Migrate",
      "Stage 3: Validate",
      "Every stage",
    ]);
    for (const skill of [
      "Containerization standards",
      "API compatibility checklist",
    ]) {
      await expect(skillRows(details, skill)).toHaveCount(1);
      await expect(skillRows(details, skill)).toContainText("Excluded");
    }
    await expect(details.getByText("Excluded", { exact: true })).toHaveCount(2);
    await expect(details.getByRole("checkbox")).toHaveCount(0);
  });

  test("architect excludes a skill when editing a plan, and sees it kept", async ({
    page,
  }) => {
    const skill = "Build validation standards";
    await page.goto(protoUrl("/migration-plans/5", { scenario: "configured" }));
    const details = skillsTable(main(page));
    await expect(skillRows(details, skill)).toHaveCount(2);
    await expect(details.getByText("Excluded", { exact: true })).toHaveCount(0);
    let dialog = await openEdit(page);
    await dialog.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(dialog.getByText("No skills excluded.")).toBeVisible();
    await includeBox(dialog, skill, "stage 4").uncheck();
    // One exclusion per plan: the Every stage row clears too.
    await expect(includeBox(dialog, skill, "every stage")).not.toBeChecked();
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    // Alone, the name needs no "Newly excluded:".
    await expect(reviewSkills(dialog)).toContainText(`${skill} (every stage)`);
    await expect(reviewSkills(dialog)).not.toContainText("Newly excluded");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Migration plan updated")).toBeVisible();

    // Both rows of the skill (Validate and Every stage) are marked.
    await expect(skillRows(details, skill)).toHaveCount(2);
    await expect(details.getByText("Excluded", { exact: true })).toHaveCount(2);
    for (const row of await skillRows(details, skill).all())
      await expect(row).toContainText("Excluded");

    // Reopening the wizard starts from the saved exclusion.
    dialog = await openEdit(page);
    await dialog.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(
      dialog.getByText("1 skill excluded from this plan.")
    ).toBeVisible();
    await expect(includeBox(dialog, skill, "stage 4")).not.toBeChecked();
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    await expect(reviewSkills(dialog)).toContainText(`${skill} (every stage)`);
    await expect(reviewSkills(dialog)).not.toContainText("Still excluded");
  });

  test("migrator sees the plan's skills read-only", async ({ page }) => {
    await page.goto(
      protoUrl("/migration-plans/5", {
        persona: "hubMigrator",
        scenario: "configured",
      })
    );
    await expect(
      main(page).getByRole("heading", { level: 2, name: "Skills by stage" })
    ).toBeVisible();
    await expect(
      main(page).getByText(
        "What each stage's agent gets when this plan runs, and where each skill comes from. Skills of this plan's archetype and target profile. When it runs, each application also gets its own skills. An application from another archetype gets its own archetype and target profile skills instead."
      )
    ).toBeVisible();
    const table = skillsTable(main(page));
    await expect(
      table.getByRole("link", { name: "Jakarta EE namespace migration" })
    ).toBeVisible();
    await expect(table.getByRole("checkbox")).toHaveCount(0);
  });
});
