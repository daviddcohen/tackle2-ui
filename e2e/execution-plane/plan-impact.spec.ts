import {
  expect,
  inventoryRow,
  pickMenuOption,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

test.describe("Plan impact and lifecycle", () => {
  // Regression guard: applicationImpact.matching is a fixture constant (18); the button filters the inventory
  // by archetype only and returns 4 apps, 2 of which resolve to a different Plan.
  test("'View N applications' count matches the applications shown", async ({
    page,
  }) => {
    await page.goto(protoUrl("/migration-plans/1", { scenario: "configured" }));
    const button = page.getByRole("button", {
      name: /^View \d+ applications?$/,
    });
    const expected = Number((await button.innerText()).match(/\d+/)![0]);
    await button.click();
    await waitForInventory(page);
    await expect(
      page.getByRole("button", { name: new RegExp(`of ${expected}$`) }).first()
    ).toBeVisible();
  });

  test("all fixture plans are protected from deletion while in use", async ({
    page,
  }) => {
    await page.goto(protoUrl("/migration-plans", { scenario: "configured" }));
    const kebabs = page.getByRole("button", { name: /Kebab toggle/ });
    await expect(kebabs).toHaveCount(8);
    await kebabs.first().click();
    await expect(
      page.getByRole("menuitem", { name: "Delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  // Regression guard: delete is guarded only by applicationImpact/isDefault, not by plan runs. Deleting a
  // Plan used by a run flips the run to Pending and its Plan link to "Plan not found".
  test("a Plan used by a plan run cannot be deleted", async ({ page }) => {
    await page.goto(protoUrl("/migration-plans", { scenario: "configured" }));
    await page.getByRole("button", { name: "Create Plan" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("Plan in use by a run");
    await dialog.getByRole("button", { name: "Select an archetype" }).click();
    await pickMenuOption(page, "Node.js Service");
    await dialog
      .getByRole("button", { name: "Select target profiles" })
      .click();
    await pickMenuOption(page, "Node.js 22 on OpenShift");
    await dialog
      .getByRole("button", { name: "1 target profile selected" })
      .click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog
      .getByRole("textbox", { name: "Stage name" })
      .fill("Only stage");
    await dialog.getByRole("button", { name: "Select an Agent" }).click();
    await pickMenuOption(page, "Code Migrator");
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Create Plan" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: "Application inventory" }).click();
    await waitForInventory(page);
    await inventoryRow(page, "Customer Management")
      .getByRole("button", { name: "Row actions" })
      .click();
    await page.getByRole("menuitem", { name: "Run migration plan" }).click();
    await dialog.getByLabel("Override with a specific Plan").check();
    await dialog.getByRole("button", { name: "Plan override" }).click();
    await pickMenuOption(page, "Plan in use by a run");
    await dialog
      .getByRole("button", { name: "Start 1 Ready Application" })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Plan in use by a run"
    );

    await page.getByRole("link", { name: "Migration Plans" }).click();
    await page
      .getByRole("row", { name: /Plan in use by a run/ })
      .getByRole("button", { name: /Kebab toggle/ })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});
