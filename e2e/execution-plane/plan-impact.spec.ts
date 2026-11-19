import {
  expect,
  inventoryRow,
  pickMenuOption,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

test.describe("Plan impact and lifecycle", () => {
  // Regression guard: applicationImpact.matching is a fixture constant (18); the link filtered the inventory
  // by archetype only and returned 4 apps, 2 of which resolve to a different Plan.
  test("the Applications count matches the applications shown", async ({
    page,
  }) => {
    await page.goto(protoUrl("/migration-plans/1", { scenario: "configured" }));
    const link = page
      .getByRole("main")
      .locator("dl")
      .getByRole("link", { name: /^\d+ applications?$/ });
    const expected = Number((await link.innerText()).match(/\d+/)![0]);
    await link.click();
    await waitForInventory(page);
    await expect(
      page.getByRole("button", { name: new RegExp(`of ${expected}$`) }).first()
    ).toBeVisible();
  });

  // One alert names the problem and lists each affected
  // stage with its agent and model; the Configuration fact, which would say
  // the same with another count, is left out while the alert shows.
  test("an unverified model is named with the stages it affects", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/migration-plans/1", { scenario: "partialConfiguration" })
    );
    const configuration = page
      .getByRole("main")
      .locator("dl")
      .locator(".pf-v6-c-description-list__group")
      .filter({
        has: page.getByRole("term").getByText("Configuration", { exact: true }),
      });
    const alert = page.locator(".pf-v6-c-alert.pf-m-warning");
    await expect(alert).toContainText(
      "3 stages use a model that is not verified"
    );
    // Checked on the loaded page, once the alert is there.
    await expect(configuration).toHaveCount(0);
    await expect(alert.getByRole("listitem")).toHaveText([
      "Prepare proposal: Migration Proposal Agent uses Claude 3.7 Sonnet (Pending)",
      "Migrate: Java Code Migrator uses Claude 3.7 Sonnet (Pending)",
      "Validate: Build Validator uses GPT-4o (Pending)",
    ]);
    // Architects cannot open Models (the route needs the admin view scopes), so no link.
    await expect(alert.getByRole("link", { name: "View models" })).toHaveCount(
      0
    );

    await page.goto(
      protoUrl("/migration-plans/1", {
        persona: "platformEngineer",
        scenario: "partialConfiguration",
      })
    );
    await alert.getByRole("link", { name: "View models" }).click();
    await expect(page).toHaveURL(/\/models(\?|$)/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Models" })
    ).toBeVisible();

    await page.goto(protoUrl("/migration-plans/1", { scenario: "configured" }));
    await expect(configuration).toContainText("Checks passed");
    await expect(page.locator(".pf-v6-c-alert.pf-m-warning")).toHaveCount(0);
  });

  // A plan without a migration path runs when someone picks it ("Use one
  // migration plan for all applications"): not a configuration issue, so no
  // marker on the plans list and no alert on its page.
  test("a plan without a migration path has no configuration issue", async ({
    page,
  }) => {
    // With unverified models some plans get a marker: once one shows, the
    // checks have run, and none names the missing path.
    await page.goto(
      protoUrl("/migration-plans", { scenario: "partialConfiguration" })
    );
    await expect(
      page
        .getByRole("row", { name: /Java EE to Quarkus/ })
        .getByLabel(/not verified/)
    ).toBeVisible();
    const row = page.getByRole("row", { name: /Java EE lift and shift/ });
    await expect(row).toBeVisible();
    await expect(row.getByLabel(/migration path/i)).toHaveCount(0);

    await page.goto(protoUrl("/migration-plans/3", { scenario: "configured" }));
    await expect(
      page.getByRole("heading", { level: 1, name: "Java EE lift and shift" })
    ).toBeVisible();
    const configuration = page
      .getByRole("main")
      .locator("dl")
      .locator(".pf-v6-c-description-list__group")
      .filter({
        has: page.getByRole("term").getByText("Configuration", { exact: true }),
      });
    await expect(configuration).toContainText("Checks passed");
    await expect(page.locator(".pf-v6-c-alert.pf-m-warning")).toHaveCount(0);
    // Its archetype and target profiles read "Not assigned".
    for (const term of ["Archetype", "Target profiles"])
      await expect(
        page
          .getByRole("main")
          .locator("dl")
          .locator(".pf-v6-c-description-list__group")
          .filter({
            has: page.getByRole("term").getByText(term, { exact: true }),
          })
      ).toContainText("Not assigned");
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
    await page
      .getByRole("main")
      .getByRole("button", { name: "Create migration plan" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill("Plan in use by a run");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await dialog.getByRole("button", { name: /^Archetype/ }).click();
    await pickMenuOption(page, "Node.js Service");
    await dialog.locator("#plan-target-profiles-input").click();
    await pickMenuOption(page, "Node.js 22 on OpenShift");
    await dialog.getByText(/^Applications in this archetype/).click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: "Stage name" })
      .fill("Only stage");
    await dialog.getByRole("button", { name: /^Agent/ }).click();
    await pickMenuOption(page, "Code Migrator");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    // Skills step.
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: "Application inventory" }).click();
    await waitForInventory(page);
    await inventoryRow(page, "Customer Management")
      .getByRole("button", { name: "Row actions" })
      .click();
    await page.getByRole("menuitem", { name: "Run migration plan" }).click();
    await dialog
      .getByLabel("Use one migration plan for all applications")
      .check();
    await dialog.getByRole("button", { name: "Migration plan to run" }).click();
    await pickMenuOption(page, "Plan in use by a run");
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Plan in use by a run"
    );

    await page.getByRole("link", { name: "Migration plans" }).click();
    await page
      .getByRole("row", { name: /Plan in use by a run/ })
      .getByRole("button", { name: /Kebab toggle/ })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});
