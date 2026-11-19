import type { Locator, Page } from "@playwright/test";

import { expect, pickMenuOption, protoUrl, test } from "../support";

const openCreateWizard = async (page: Page) => {
  await page.goto(protoUrl("/migration-plans", { scenario: "configured" }));
  await page.getByRole("button", { name: "Create migration plan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create migration plan" })
  ).toBeVisible();
  return dialog;
};

const next = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Next", exact: true });

const fillPath = async (page: Page, dialog: Locator) => {
  await dialog.getByRole("button", { name: /^Archetype/ }).click();
  await pickMenuOption(page, "Java EE Application");
  await dialog.locator("#plan-target-profiles-input").click();
  await pickMenuOption(page, "Quarkus 3.x");
  // Close the menu (click outside it); the selection shows as a chip.
  await dialog.getByText(/^Applications in this archetype/).click();
  await expect(
    dialog.getByRole("list", { name: "Current selections" })
  ).toContainText("Quarkus 3.x");
};

/** Fills the open stage card (new stages open, the others are collapsed). */
const fillOpenStage = async (
  page: Page,
  dialog: Locator,
  name: string,
  agent: string
) => {
  await dialog.getByRole("textbox", { name: "Stage name" }).fill(name);
  await dialog.getByRole("button", { name: /^Agent/ }).click();
  await pickMenuOption(page, agent);
};

/** Stage card titles in order, from their expand toggles ("Stage 1: Analyze"). */
const stageTitles = (dialog: Locator) =>
  dialog
    .locator("button[id^='stage-'][id$='-toggle']")
    .evaluateAll((toggles) =>
      toggles.map((toggle) =>
        (toggle.getAttribute("aria-label") ?? "").replace(/^Details of /, "")
      )
    );

const collapseStage = (dialog: Locator, title: string) =>
  dialog.getByRole("button", { name: `Details of ${title}` }).click();

test.describe("Plan wizard", () => {
  test("plan details: required name and duplicate names", async ({ page }) => {
    const dialog = await openCreateWizard(page);
    await expect(next(dialog)).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("java ee to quarkus ");
    await expect(
      dialog.getByText("A migration plan with this name already exists.")
    ).toBeVisible();
    await expect(next(dialog)).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("Unique E2E plan");
    await expect(
      dialog.getByText("A migration plan with this name already exists.")
    ).toBeHidden();
    await expect(next(dialog)).toBeEnabled();
  });

  test("migration path: target profiles wait for an archetype", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Path E2E plan");
    await next(dialog).click();
    await expect(dialog.getByText("Select an archetype first")).toBeVisible();
    await expect(next(dialog)).toBeDisabled();
    await fillPath(page, dialog);
    await expect(
      dialog.getByText(
        "Changing the archetype clears the selected target profiles."
      )
    ).toBeVisible();
    await expect(next(dialog)).toBeEnabled();
  });

  test("create a plan: add, reorder, remove stages, review, back/next, submit", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("E2E wizard plan");
    await next(dialog).click();
    await fillPath(page, dialog);
    await next(dialog).click();

    await expect(next(dialog)).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: /^Remove/ })
    ).toBeDisabled();
    await fillOpenStage(page, dialog, "Stage A", "Migration Proposal Agent");
    await expect(
      dialog.getByText(/^Migration Proposal Agent uses /)
    ).toBeVisible();
    await collapseStage(dialog, "Stage 1: Stage A");
    await dialog.getByRole("button", { name: "Add stage" }).click();
    await expect(next(dialog)).toBeDisabled();
    await fillOpenStage(page, dialog, "Stage B", "Code Migrator");
    await collapseStage(dialog, "Stage 2: Stage B");
    await dialog.getByRole("button", { name: "Add stage" }).click();
    await fillOpenStage(page, dialog, "Stage C", "Build Validator");
    await dialog
      .getByRole("checkbox", { name: "Require approval after this stage" })
      .check();
    // A collapsed card says who runs it.
    await expect(dialog.getByText("Run by Code Migrator")).toBeVisible();

    await expect(
      dialog.getByRole("button", { name: "Move Stage A up" })
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Move Stage C down" })
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Move Stage C up" }).click();
    expect(await stageTitles(dialog)).toEqual([
      "Stage 1: Stage A",
      "Stage 2: Stage C",
      "Stage 3: Stage B",
    ]);
    await dialog.getByRole("button", { name: "Remove Stage A" }).click();
    expect(await stageTitles(dialog)).toEqual([
      "Stage 1: Stage C",
      "Stage 2: Stage B",
    ]);
    await expect(
      dialog.getByRole("checkbox", {
        name: "Require approval after this stage",
      })
    ).toBeChecked();
    await expect(next(dialog)).toBeEnabled();
    await next(dialog).click();

    const review = dialog.getByRole("grid", { name: "Stages to review" });
    const rows = review.locator(
      "tbody > tr:not(.pf-v6-c-table__expandable-row)"
    );
    await expect(rows.nth(0)).toContainText("Stage C");
    await expect(rows.nth(0)).toContainText("Requires approval");
    await expect(rows.nth(0)).toContainText("Build Validator");
    await expect(rows.nth(1)).toContainText("Stage B");
    await expect(rows.nth(1)).toContainText("Code Migrator");
    await expect(dialog).toContainText("Quarkus 3.x");

    await dialog.getByRole("button", { name: "Back" }).click();
    await dialog.getByRole("button", { name: "Back" }).click();
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(dialog.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      "E2E wizard plan"
    );
    await next(dialog).click();
    await next(dialog).click();
    expect(await stageTitles(dialog)).toEqual([
      "Stage 1: Stage C",
      "Stage 2: Stage B",
    ]);
    await next(dialog).click();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText("Migration plan created")).toBeVisible();
    await page.getByRole("link", { name: "E2E wizard plan" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E wizard plan" })
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Stage C");
    // A new plan is not assigned to its target profiles yet.
    await expect(
      page.getByText(
        "Not assigned. Applications get this plan once it is assigned."
      )
    ).toBeVisible();
  });

  test("cancel discards the draft", async ({ page }) => {
    const dialog = await openCreateWizard(page);
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("Draft that is cancelled");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Draft that is cancelled" })
    ).toHaveCount(0);
    await page
      .getByRole("main")
      .getByRole("button", { name: "Create migration plan" })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: /^Name/ })
    ).toHaveValue("");
  });

  test("edit plan pre-fills every step and saves", async ({ page }) => {
    await page.goto(protoUrl("/migration-plans/2", { scenario: "configured" }));
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit migration plan" })
    ).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      "Spring Boot to Quarkus"
    );
    // Every step can be opened while editing.
    await dialog.getByRole("button", { name: "Migration path" }).click();
    await expect(
      dialog.getByRole("button", { name: /^Archetype/ })
    ).toContainText("Spring Boot Application");
    await dialog.getByRole("button", { name: "Stages", exact: true }).click();
    expect(await stageTitles(dialog)).toEqual([
      "Stage 1: Analyze",
      "Stage 2: Migrate",
      "Stage 3: Validate",
    ]);
    // Existing stages open collapsed.
    await expect(
      dialog.getByRole("textbox", { name: "Stage name" })
    ).toHaveCount(0);
    await next(dialog).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Migration plan updated")).toBeVisible();
  });

  // Regression guard: Escape pressed to close an open Select inside the wizard closes the whole wizard.
  test("Escape closes an open select without discarding the wizard", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Escape test");
    await next(dialog).click();
    await dialog.getByRole("button", { name: /^Archetype/ }).click();
    await pickMenuOption(page, "Java EE Application");
    await dialog.locator("#plan-target-profiles-input").click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  });

  // Regression guard: PF Modal sets aria-hidden on every <body> child on each update, including the Select
  // popper, so options are invisible to assistive technology. The menus are appended to the modal.
  test("select options inside the wizard are exposed to assistive technology", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("A11y");
    await next(dialog).click();
    await dialog.getByRole("button", { name: /^Archetype/ }).click();
    await expect(
      page.getByRole("option", { name: "Java EE Application" })
    ).toBeVisible();
  });

  // Regression guard: the agent menu was clipped by the stage card.
  test("the agent menu is not clipped by its stage card", async ({ page }) => {
    const dialog = await openCreateWizard(page);
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Menu E2E plan");
    await next(dialog).click();
    await fillPath(page, dialog);
    await next(dialog).click();
    await dialog.getByRole("button", { name: /^Agent/ }).click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Code Migrator/ })
    ).toContainText("Model: Claude 3.7 Sonnet");
    // Appended to the modal box, outside the card's overflow.
    await expect(dialog.locator(".pf-v6-c-card .pf-v6-c-menu")).toHaveCount(0);
  });
});
