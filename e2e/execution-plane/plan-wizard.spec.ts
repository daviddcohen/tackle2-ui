import type { Locator, Page } from "@playwright/test";

import { expect, pickMenuOption, protoUrl, test } from "../support";

const openCreateWizard = async (page: Page) => {
  await page.goto(protoUrl("/migration-plans", { scenario: "configured" }));
  await page.getByRole("button", { name: "Create Plan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create Plan" })
  ).toBeVisible();
  return dialog;
};

const fillDetails = async (page: Page, dialog: Locator, name: string) => {
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  await dialog.getByRole("button", { name: "Select an archetype" }).click();
  await pickMenuOption(page, "Java EE Application");
  await dialog.getByRole("button", { name: "Select target profiles" }).click();
  await pickMenuOption(page, "Quarkus 3.x");
  await dialog
    .getByRole("button", { name: "1 target profile selected" })
    .click();
};

const fillStage = async (
  page: Page,
  dialog: Locator,
  index: number,
  name: string,
  agent: string
) => {
  await dialog
    .getByRole("textbox", { name: "Stage name" })
    .nth(index)
    .fill(name);
  await dialog.getByRole("button", { name: "Select an Agent" }).first().click();
  await pickMenuOption(page, agent);
};

const stageNames = (dialog: Locator) =>
  dialog
    .getByRole("textbox", { name: "Stage name" })
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value)
    );

test.describe("Plan wizard", () => {
  test("step 1 validation: required fields and duplicate names", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    const next = dialog.getByRole("button", { name: "Next" });
    await expect(next).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("java ee to quarkus ");
    await expect(
      dialog.getByText("A Plan with this name already exists.")
    ).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Select target profiles" })
    ).toBeDisabled();
    await fillDetails(page, dialog, "Unique E2E plan");
    await expect(
      dialog.getByText("A Plan with this name already exists.")
    ).toBeHidden();
    await expect(next).toBeEnabled();
  });

  test("create a plan: add, reorder, remove stages, review, back/next, submit", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await fillDetails(page, dialog, "E2E wizard plan");
    await dialog.getByRole("button", { name: "Next" }).click();

    const next = dialog.getByRole("button", { name: "Next" });
    await expect(next).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: /^Remove/ })
    ).toBeDisabled();
    await fillStage(page, dialog, 0, "Stage A", "Migration Proposal Agent");
    await dialog.getByRole("button", { name: "Add Stage" }).click();
    await expect(next).toBeDisabled();
    await fillStage(page, dialog, 1, "Stage B", "Code Migrator");
    await dialog.getByRole("button", { name: "Add Stage" }).click();
    await fillStage(page, dialog, 2, "Stage C", "Build Validator");
    await dialog
      .getByRole("checkbox", { name: "Requires approval before proceeding" })
      .nth(2)
      .check();

    await expect(
      dialog.getByRole("button", { name: "Move Stage A Up" })
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Move Stage C Down" })
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Move Stage C Up" }).click();
    expect(await stageNames(dialog)).toEqual(["Stage A", "Stage C", "Stage B"]);
    await dialog.getByRole("button", { name: "Remove Stage A" }).click();
    expect(await stageNames(dialog)).toEqual(["Stage C", "Stage B"]);
    await expect(
      dialog
        .getByRole("checkbox", { name: "Requires approval before proceeding" })
        .first()
    ).toBeChecked();
    await expect(next).toBeEnabled();
    await next.click();

    const review = dialog.getByRole("list").filter({ hasText: "Stage C" });
    await expect(review.getByRole("listitem").nth(0)).toContainText(
      "Stage C, Build Validator"
    );
    await expect(review.getByRole("listitem").nth(0)).toContainText(
      "Approval required"
    );
    await expect(review.getByRole("listitem").nth(1)).toContainText(
      "Stage B, Code Migrator"
    );
    await expect(dialog).toContainText("Quarkus 3.x");

    await dialog.getByRole("button", { name: "Back" }).click();
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(dialog.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      "E2E wizard plan"
    );
    await dialog.getByRole("button", { name: "Next" }).click();
    expect(await stageNames(dialog)).toEqual(["Stage C", "Stage B"]);
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Create Plan" }).click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByText('Plan "E2E wizard plan" created')
    ).toBeVisible();
    await page.getByRole("link", { name: "E2E wizard plan" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E wizard plan" })
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Stage C");
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
    await page.getByRole("button", { name: "Create Plan" }).click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: /^Name/ })
    ).toHaveValue("");
  });

  test("edit plan pre-fills every step and saves", async ({ page }) => {
    await page.goto(protoUrl("/migration-plans/2", { scenario: "configured" }));
    await page.getByRole("button", { name: "Edit Plan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      "Spring Boot to Quarkus"
    );
    await expect(
      dialog.getByRole("button", { name: "Spring Boot Application" })
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();
    expect(await stageNames(dialog)).toEqual([
      "Analyze",
      "Migrate",
      "Validate",
    ]);
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText('Plan "Spring Boot to Quarkus" updated')
    ).toBeVisible();
  });

  // Regression guard: Escape pressed to close an open Select inside the wizard closes the whole wizard.
  test("Escape closes an open select without discarding the wizard", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Escape test");
    await dialog.getByRole("button", { name: "Select an archetype" }).click();
    await pickMenuOption(page, "Java EE Application");
    await dialog
      .getByRole("button", { name: "Select target profiles" })
      .click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  });

  // Regression guard: PF Modal sets aria-hidden on every <body> child on each update, including the Select
  // popper, so options are invisible to assistive technology.
  test("select options inside the wizard are exposed to assistive technology", async ({
    page,
  }) => {
    const dialog = await openCreateWizard(page);
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("A11y");
    await dialog.getByRole("button", { name: "Select an archetype" }).click();
    await expect(
      page.getByRole("option", { name: "Java EE Application" })
    ).toBeVisible();
  });
});
