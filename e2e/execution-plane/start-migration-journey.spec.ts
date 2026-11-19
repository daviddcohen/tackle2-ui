/**
 * Journey 1 (configured): pick apps -> preflight -> start -> plan run detail, all via clicks.
 */
import {
  AGENTIC_STATUS,
  approveButton,
  approveStage,
  countWithMigrationStatus,
  expect,
  migrationCell,
  openBulkRunMigration,
  pickMenuOption,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

test.describe("Start migration journey", () => {
  test("starting one ready application lands on its plan run with the app listed", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^Run #\d+ — /
    );
    const summary = page.getByRole("main").locator("dl").first();
    await expect(
      summary.getByRole("link", { name: "Customer Management" })
    ).toBeVisible();
    await expect(summary).toContainText("konveyor/agentic-migration");
    // Breadcrumb returns to the inventory the journey started from.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Application inventory" })
      .click();
    await waitForInventory(page);
  });

  test("target branch typed in preflight is carried to the run", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog
      .getByRole("textbox", { name: /Target branch/ })
      .fill("feature/e2e-branch");
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("main").locator("dl").first()).toContainText(
      "feature/e2e-branch"
    );
  });

  test("Plan override is used for the new run", async ({ page }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog
      .getByLabel("Use one migration plan for all applications")
      .check();
    await dialog.getByRole("button", { name: "Migration plan to run" }).click();
    await pickMenuOption(page, "Node.js runtime modernization");
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toContainText("Node.js runtime modernization");
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Node.js runtime modernization"
    );
  });

  // Regression guard: with "Use each application's migration plan", each app resolves to its own Plan but the mock creates a
  // single PlanRun for the first Plan whose archetype matches ANY selected app.
  test("recommended Plan run matches the Plan resolved in preflight", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toContainText("Java EE lift and shift");
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Java EE lift and shift"
    );
  });

  // Regression guard: onSuccess calls prototype.setScenario("running"), which (a) flips EVERY application to
  // Running and (b) fires the fixture-reset event that clears the per-app "started" overrides.
  test("starting one application does not change other applications' status", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Application inventory" })
      .click();
    await waitForInventory(page);
    await expect(
      migrationCell(page, "Order Service").locator(AGENTIC_STATUS)
    ).toHaveText("Ready to start");
    expect(await countWithMigrationStatus(page, "Running")).toBeLessThanOrEqual(
      1
    );
  });

  // Regression guard: list rows show raw fixture status; detail rows are re-projected by scenario.
  test("new run shows the same status in the Plan Runs list and the run detail", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Run #/);
    const title = await page.getByRole("heading", { level: 1 }).innerText();
    const detailStatus = await page
      .getByRole("main")
      .locator(AGENTIC_STATUS)
      .first()
      .innerText();
    await page.getByRole("link", { name: "Plan runs" }).click();
    await expect(
      page.getByRole("row", { name: new RegExp(title.replace(/[#—]/g, ".")) })
    ).toContainText(detailStatus);
  });

  // With the default interactive execution policy a started run pauses at
  // every stage that requires approval; approving each one on the plan run
  // page lets it reach Succeeded.
  test("a started run pauses for approval and succeeds after each approval", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog.getByRole("button", { name: "Run on 1 application" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    const status = page.getByRole("main").locator(AGENTIC_STATUS).first();
    const approve = approveButton(page);
    let approvals = 0;
    for (let i = 0; i < 4; i++) {
      await expect
        .poll(
          async () =>
            (await approve.count()) > 0
              ? "approve"
              : await status.textContent(),
          { timeout: 30000 }
        )
        .toMatch(/approve|Succeeded/);
      if ((await approve.count()) === 0) break;
      await approveStage(page);
      approvals++;
      await expect(approve).toHaveCount(0);
    }
    expect(approvals).toBe(2);
    await expect(status).toHaveText("Succeeded", { timeout: 30000 });
  });
});
