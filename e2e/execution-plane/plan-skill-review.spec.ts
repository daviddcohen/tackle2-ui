/**
 * Plan skill review: the wizard's Skills step lists every skill a draft plan
 * resolves to (stage agents, their skill collections, archetype, target
 * profiles) and lets the user exclude skills; Review and the plan Details tab
 * show the result. MSW state lives in the page, so after a save the specs
 * stay in the SPA (no reload).
 */
import type { Locator, Page } from "@playwright/test";

import {
  expect,
  main,
  mainHeading,
  pickMenuOption,
  protoUrl,
  test,
} from "../support";

const next = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Next", exact: true });

const useCheckbox = (scope: Locator, skill: string) =>
  scope.getByRole("checkbox", { name: `Use ${skill}`, exact: true });

/** The live count line of the Skills step, as [used, total]. */
const usedCount = async (dialog: Locator): Promise<[number, number]> => {
  const line = dialog.getByText(/^\d+ of \d+ skills will be used$/);
  await expect(line).toBeVisible();
  const [, used, total] =
    /^(\d+) of (\d+)/.exec((await line.textContent()) ?? "") ?? [];
  return [Number(used), Number(total)];
};

/** The Review step's Skills value and its lines. */
const reviewSkills = (dialog: Locator) =>
  dialog
    .locator(".pf-v6-c-description-list__group")
    .filter({ hasText: /^Skills/ });

const skillsTable = (page: Page) =>
  main(page).getByRole("grid", { name: "Skills", exact: true });

const skillRow = (scope: Locator, skill: string) =>
  scope.getByRole("row", { name: new RegExp(skill) });

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
    await page.goto(protoUrl("/migration-plans", { scenario: "configured" }));
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
      ["Migrate", "Code Migrator"],
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

    // Skills step: every resolved skill with where it comes from.
    await expect(
      dialog.getByText(
        "Clear a skill to exclude it from every stage of this plan. Application skills are added when the plan runs; a skill you clear here is not added from an application either."
      )
    ).toBeVisible();
    const [used, total] = await usedCount(dialog);
    expect(used).toBe(total);
    const table = dialog.getByRole("grid", { name: "Skills", exact: true });
    const jakarta = skillRow(table, "Jakarta EE namespace migration");
    await expect(jakarta).toContainText(
      "Agent: Migration Proposal Agent via Java modernization foundation"
    );
    await expect(jakarta).toContainText(
      "Agent: Code Migrator via Java modernization foundation"
    );
    await expect(skillRow(table, "Build validation standards")).toContainText(
      "Archetype: Legacy Java Application"
    );
    // Plain names: a link would leave the draft.
    await expect(table.getByRole("link")).toHaveCount(0);

    await useCheckbox(table, "Containerization standards").uncheck();
    await useCheckbox(table, "API compatibility checklist").uncheck();
    await expect(
      dialog.getByText(`${total - 2} of ${total} skills will be used`)
    ).toBeVisible();
    await expect(table.getByText("Excluded", { exact: true })).toHaveCount(0);

    await next(dialog).click();
    const review = reviewSkills(dialog);
    await expect(review).toContainText(`${total - 2} of ${total} used`);
    await expect(review).toContainText(
      "Excluded: API compatibility checklist, Containerization standards"
    );
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Migration plan created")).toBeVisible();

    // Plan Details (SPA navigation keeps the mock state).
    await main(page)
      .getByRole("link", { name: "Legacy Java on RHEL E2E" })
      .click();
    await expect(mainHeading(page)).toHaveText("Legacy Java on RHEL E2E");
    await expect(
      main(page).getByRole("heading", {
        name: `Skills (${total - 2} of ${total} used)`,
      })
    ).toBeVisible();
    const details = skillsTable(page);
    for (const skill of [
      "Containerization standards",
      "API compatibility checklist",
    ])
      await expect(skillRow(details, skill)).toContainText("Excluded");
    await expect(details.getByText("Excluded", { exact: true })).toHaveCount(2);
    await expect(details.getByRole("checkbox")).toHaveCount(0);
  });

  test("architect excludes a skill when editing a plan, and sees it kept", async ({
    page,
  }) => {
    const skill = "Build validation standards";
    await page.goto(protoUrl("/migration-plans/5", { scenario: "configured" }));
    await expect(
      main(page).getByRole("heading", { name: /^Skills \(\d+\)$/ })
    ).toBeVisible();
    let dialog = await openEdit(page);
    await dialog.getByRole("button", { name: "Skills", exact: true }).click();
    const [, total] = await usedCount(dialog);
    await useCheckbox(dialog, skill).uncheck();
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    await expect(reviewSkills(dialog)).toContainText(
      `Newly excluded: ${skill}`
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Migration plan updated")).toBeVisible();

    await expect(
      main(page).getByRole("heading", {
        name: `Skills (${total - 1} of ${total} used)`,
      })
    ).toBeVisible();
    await expect(skillRow(skillsTable(page), skill)).toContainText("Excluded");

    // Reopening the wizard starts from the saved exclusion.
    dialog = await openEdit(page);
    await dialog.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(
      dialog.getByText(`${total - 1} of ${total} skills will be used`)
    ).toBeVisible();
    await expect(useCheckbox(dialog, skill)).not.toBeChecked();
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    await expect(reviewSkills(dialog)).toContainText(
      `Still excluded: ${skill}`
    );
  });

  test("migrator sees the plan's skills read-only", async ({ page }) => {
    await page.goto(
      protoUrl("/migration-plans/5", {
        persona: "hubMigrator",
        scenario: "configured",
      })
    );
    await expect(
      main(page).getByRole("heading", { name: /^Skills \(\d+\)$/ })
    ).toBeVisible();
    await expect(
      main(page).getByText(
        "Skills from this plan's agents, their skill collections, the archetype and the target profiles. Application skills are added when the plan runs."
      )
    ).toBeVisible();
    const table = skillsTable(page);
    await expect(
      table.getByRole("link", { name: "Jakarta EE namespace migration" })
    ).toBeVisible();
    await expect(table.getByRole("checkbox")).toHaveCount(0);
  });
});
