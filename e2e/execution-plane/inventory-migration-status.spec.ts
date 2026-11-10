/**
 * Application Inventory "Migration" column, Migration activity overview, row/bulk start actions
 * and the preflight modal. Expectations are derived from the projection in
 * client/src/app/prototype/agentic/projection.ts (portfolio is fixed at 12 applications).
 */
import {
  type Scenario,
  expect,
  expectNoBrokenText,
  main,
  migrationCell,
  openBulkRunMigration,
  portfolioCounts,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

const expectedStatusByScenario = {
  configured: { "Customer Management": "Ready to start" },
  preflightBlocked: {
    "Advisor Workbench API": "Ready to start",
    "Branch Operations": "Blocked before start",
    "Inventory Service": "Review required",
  },
  partialConfiguration: {
    "Advisor Workbench API": "Review required",
    "Order Service": "Blocked before start",
  },
  queued: { "Customer Management": "Pending" },
  running: { "Customer Management": "Running" },
  failed: { "Customer Management": "Failed" },
  completed: { "Customer Management": "Succeeded" },
} as const;

const nextActionByStatus: Record<string, string> = {
  "Ready to start": "Next: Start migration",
  "Blocked before start": "Next: Resolve blockers",
  "Review required": "Next: Resolve blockers",
  Pending: "Next: Monitor progress",
  Running: "Next: Monitor progress",
  Failed: "Next: Review failure and retry",
  Succeeded: "Next: Review migration results",
};

test.describe("Inventory migration column", () => {
  for (const [scenario, expectations] of Object.entries(
    expectedStatusByScenario
  )) {
    test(`shows projected status and next action (${scenario})`, async ({
      page,
      pageErrors,
    }) => {
      await page.goto(
        protoUrl("/applications", { scenario: scenario as Scenario })
      );
      await waitForInventory(page);
      for (const [application, status] of Object.entries(expectations)) {
        const cell = migrationCell(page, application);
        await expect(cell.locator(".pf-v6-c-label")).toHaveText(status);
        await expect(cell).toContainText(nextActionByStatus[status]);
      }
      await expectNoBrokenText(main(page));
      expect(pageErrors).toEqual([]);
    });
  }

  test("overview counts add up to the portfolio for execution scenarios", async ({
    page,
  }) => {
    for (const [scenario, key] of [
      ["queued", "Pending"],
      ["running", "Running"],
      ["completed", "Succeeded"],
    ] as const) {
      await page.goto(protoUrl("/applications", { scenario }));
      await waitForInventory(page);
      await expect(
        page.getByRole("button", { name: "1 - 10 of 12" }).first()
      ).toBeVisible();
      await expect
        .poll(async () => (await portfolioCounts(page))[key])
        .toBe(12);
    }
  });

  test("Migration filter offers every display status", async ({ page }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "preflightBlocked" })
    );
    await waitForInventory(page);
    await page.getByRole("button", { name: "Name" }).first().click();
    await page
      .getByRole("menuitem", { name: "Migration", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    for (const label of [
      "Not configured",
      "Ready to start",
      "Blocked before start",
      "Review required",
      "Pending",
      "Running",
      "Action required",
      "Succeeded",
      "Failed",
    ]) {
      await expect(
        page.getByRole("menuitem", { name: label, exact: true })
      ).toBeVisible();
    }
    await page
      .getByRole("menuitem", { name: "Blocked before start", exact: true })
      .click();
    await page.keyboard.press("Escape");
    const labels = page
      .getByRole("gridcell")
      .filter({ hasText: "Next:" })
      .locator(".pf-v6-c-label");
    await expect(labels.first()).toBeVisible();
    await expect
      .poll(async () => [...new Set(await labels.allInnerTexts())])
      .toEqual(["Blocked before start"]);
  });

  test("row action Start is disabled for blocked applications and enabled for ready ones", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "preflightBlocked" })
    );
    await waitForInventory(page);
    await page
      .getByRole("row", { name: /Branch Operations/ })
      .getByRole("button", { name: "Row actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Run migration plan" })
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await page
      .getByRole("row", { name: /Advisor Workbench API/ })
      .getByRole("button", { name: "Row actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Run migration plan" })
    ).toBeEnabled();
  });

  // Regression guard: initial scenario returns zero applications; the disabled migrations query reports
  // isLoading=true forever in TanStack Query v4, so the inventory never leaves "Loading...".
  test("initial scenario renders the inventory (not an endless spinner)", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "initial" }));
    await expect(page.getByRole("button", { name: "Create New" })).toBeVisible({
      timeout: 8000,
    });
  });

  // Regression guard: mockExecutionPolicy is "unattended" and the Automation settings UI is not mounted,
  // so every actionRequired projection is rewritten to Failed.
  test("action required scenario surfaces application requests", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "actionRequired" }));
    await waitForInventory(page);
    await expect
      .poll(async () => (await portfolioCounts(page))["Action required"] ?? 0)
      .toBeGreaterThan(0);
  });
});

test.describe("Preflight modal", () => {
  test("mixed outcomes: only ready applications start; blocked and review-required are excluded", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "preflightBlocked" })
    );
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, [
      "Advisor Workbench API",
      "Branch Operations",
      "Inventory Service",
    ]);
    await expect(dialog).toContainText(
      "Review the resolved Plan and readiness for 3 selected applications."
    );
    await expect(
      dialog.getByRole("row", { name: /Advisor Workbench API/ })
    ).toContainText("Ready");
    await expect(
      dialog.getByRole("row", { name: /Branch Operations/ })
    ).toContainText("Blocked");
    await expect(
      dialog.getByRole("row", { name: /Branch Operations/ })
    ).toContainText("A source control credential reference is missing.");
    await expect(
      dialog.getByRole("row", { name: /Inventory Service/ })
    ).toContainText("Review required");
    await expect(
      dialog.getByText("2 applications will not start")
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Start 1 Ready Application" })
    ).toBeEnabled();
  });

  test("all-blocked selection cannot be started", async ({ page }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "partialConfiguration" })
    );
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, [
      "Order Service",
      "Advisor Workbench API",
    ]);
    await expect(
      dialog.getByRole("button", { name: "Start 0 Ready Applications" })
    ).toBeDisabled();
  });

  test("form validation: override requires a Plan and the target branch is required", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    const start = dialog.getByRole("button", {
      name: "Start 1 Ready Application",
    });
    await expect(start).toBeEnabled();
    await dialog.getByLabel("Override with a specific Plan").check();
    await expect(start).toBeDisabled();
    await dialog.getByLabel("Use recommended Plan").check();
    await expect(start).toBeEnabled();
    const branch = dialog.getByRole("textbox", { name: /Target branch/ });
    await branch.fill("   ");
    await branch.blur();
    await expect(
      dialog.getByText("A target branch is required.")
    ).toBeVisible();
    await expect(start).toBeDisabled();
  });

  test("cancel closes the modal and keeps the selection", async ({ page }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page
        .getByRole("row", { name: /Customer Management/ })
        .getByRole("checkbox")
    ).toBeChecked();
  });

  // Regression guard: readiness only checks `preflight === "ready"`, which stays "ready" for running and
  // succeeded applications, so a second concurrent run can be started for the same application.
  test("applications with an active or finished run are not offered as ready", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "running" }));
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toContainText("Blocked");
    await expect(
      dialog.getByRole("button", { name: /Start \d+ Ready/ })
    ).toBeDisabled();
  });
});
