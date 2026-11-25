/**
 * Application Inventory "Migration" column, attention alert, row/bulk start actions
 * and the preflight modal. Expectations are derived from the projection in
 * client/src/app/prototype/agentic/projection.ts (portfolio is fixed at 13 applications).
 */
import {
  AGENTIC_STATUS,
  type Scenario,
  countWithMigrationStatus,
  expect,
  expectNoBrokenText,
  main,
  migrationCell,
  openBulkRunMigration,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

const expectedStatusByScenario = {
  configured: { "Customer Management": "Ready to start" },
  preflightBlocked: {
    "Advisor Workbench API": "Ready to start",
    "Branch Operations": "Blocked",
    "Inventory Service": "Review before start",
  },
  partialConfiguration: {
    "Advisor Workbench API": "Review before start",
    "Order Service": "Blocked",
  },
  queued: { "Customer Management": "Pending" },
  running: { "Customer Management": "Running" },
  failed: { "Customer Management": "Failed" },
  completed: { "Customer Management": "Succeeded" },
} as const;

/** The cell's subtle second line by status: at most one. */
const secondLineByStatus: Record<string, RegExp | null> = {
  "Ready to start": null,
  Blocked: /^.+\.$/,
  "Review before start": /^.+\.$/,
  // A pending run has no current stage yet: the plan alone. The space before
  // the separator is non-breaking (\s matches it), so a narrow cell never
  // starts a line with "·".
  Pending: /^[^·]+(\s· .+)?$/,
  Running: /^.+\s· .+$/,
  Failed: null,
  Succeeded: null,
};

test.describe("Inventory migration column", () => {
  for (const [scenario, expectations] of Object.entries(
    expectedStatusByScenario
  )) {
    test(`shows the linked status and at most one context line (${scenario})`, async ({
      page,
      pageErrors,
    }) => {
      await page.goto(
        protoUrl("/applications", { scenario: scenario as Scenario })
      );
      await waitForInventory(page);
      for (const [application, status] of Object.entries(expectations)) {
        const cell = migrationCell(page, application);
        await expect(cell.locator(AGENTIC_STATUS)).toHaveText(status);
        // The status words link to the application's Migration tab.
        await expect(
          cell.getByRole("link", { name: status, exact: true })
        ).toHaveAttribute("href", /\/applications\/\d+\?tab=migration/);
        await expect(cell).not.toContainText("Next:");
        const lines = (await cell.innerText())
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const secondLine = secondLineByStatus[status];
        if (secondLine == null) expect(lines).toEqual([status]);
        else {
          expect(lines).toHaveLength(2);
          expect(lines[1]).toMatch(secondLine);
        }
      }
      await expectNoBrokenText(main(page));
      expect(pageErrors).toEqual([]);
    });
  }

  test("status counts add up to the portfolio for execution scenarios", async ({
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
        page.getByRole("button", { name: "1 - 10 of 13" }).first()
      ).toBeVisible();
      expect(await countWithMigrationStatus(page, key)).toBe(13);
    }
  });

  test("Migration status filter offers every display status, most urgent first", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "preflightBlocked" })
    );
    await waitForInventory(page);
    await page.getByRole("button", { name: "Name" }).first().click();
    await page
      .getByRole("menuitem", { name: "Migration status", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    const options = [
      "Action required",
      "Failed",
      "Running",
      "Pending",
      "Blocked",
      "Review before start",
      "Ready to start",
      "Not configured",
      "Succeeded",
    ];
    // Most urgent first, and every option shows without scrolling the menu.
    await expect(page.getByRole("listbox").getByRole("menuitem")).toHaveText(
      options
    );
    for (const label of options) {
      await expect(
        page.getByRole("menuitem", { name: label, exact: true })
      ).toBeInViewport({ ratio: 1 });
    }
    await page.getByRole("menuitem", { name: "Blocked", exact: true }).click();
    await page.keyboard.press("Escape");
    const labels = page
      .locator('td[data-label="Migration"]')
      .locator(AGENTIC_STATUS);
    await expect(labels.first()).toBeVisible();
    await expect
      .poll(async () => [...new Set(await labels.allInnerTexts())])
      .toEqual(["Blocked"]);
  });

  test("row action Start is disabled with its reason for blocked applications and enabled for ready ones", async ({
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
    const blocked = page.getByRole("menuitem", { name: "Run migration plan" });
    await expect(blocked).toBeDisabled();
    // A disabled action says why.
    await blocked.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "A source control credential reference is missing."
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("row", { name: /Advisor Workbench API/ })
      .getByRole("button", { name: "Row actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Run migration plan" })
    ).toBeEnabled();
  });

  test("bulk Run migration plan sits in the toolbar kebab and needs a selection", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    // No selection-only toggle appears next to Analyze.
    await expect(
      page.getByRole("button", { name: "Actions", exact: true })
    ).toHaveCount(0);
    const kebab = page.getByRole("button", { name: "Application actions" });
    await kebab.click();
    await expect(
      page.getByRole("menuitem", { name: "Run migration plan" })
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    const dialog = await openBulkRunMigration(page, ["Customer Management"]);
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toBeVisible();
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
    await expect(
      main(page).getByRole("heading", {
        name: /\d+ applications? needs? action/,
      })
    ).toBeVisible();
    expect(
      await countWithMigrationStatus(page, "Action required")
    ).toBeGreaterThan(0);
  });
});

test.describe("Inventory attention alert", () => {
  test("counts every application that needs action and filters to them", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "actionRequired" }));
    await waitForInventory(page);
    const alert = main(page).locator(".pf-v6-c-alert", {
      hasText: /^.*\d+ applications? needs? action/,
    });
    await expect(alert).toHaveCount(1);
    const count = Number(
      (await alert.getByRole("heading").innerText()).match(/(\d+)/)?.[1]
    );
    expect(count).toBeGreaterThan(0);
    await alert.getByRole("button", { name: "Show applications" }).click();
    await expect(page).toHaveURL(/filters=/);
    await expect(main(page)).toContainText("Migration status");
    const statuses = main(page)
      .locator('td[data-label="Migration"]')
      .locator(AGENTIC_STATUS);
    await expect(statuses).toHaveCount(Math.min(count, 10));
    await expect
      .poll(async () => [...new Set(await statuses.allInnerTexts())])
      .toEqual(["Action required"]);
  });

  for (const scenario of ["running", "completed"] as const) {
    test(`is absent when nothing needs action (${scenario})`, async ({
      page,
    }) => {
      await page.goto(protoUrl("/applications", { scenario }));
      await waitForInventory(page);
      await expect(
        migrationCell(page, "Customer Management").locator(AGENTIC_STATUS)
      ).toBeVisible();
      await expect(main(page).getByText(/need action/)).toHaveCount(0);
    });
  }

  test("a failed migrations query says so once and disables the filter", async ({
    page,
  }) => {
    // Only the migrations read fails: send it to a path no mock handles,
    // which the dev server cannot answer either.
    await page.addInitScript(() => {
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: unknown[]
      ) {
        const target = String(url).replace(
          "/application-migrations",
          "/application-migrations-unavailable"
        );
        return (open as (...args: unknown[]) => void).call(
          this,
          method,
          target,
          ...rest
        );
      } as typeof XMLHttpRequest.prototype.open;
    });
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    await expect(
      main(page).getByText("Migration status could not be loaded")
    ).toBeVisible({ timeout: 20000 });
    await expect(main(page).getByText(/need action/)).toHaveCount(0);
    await expect(migrationCell(page, "Customer Management")).toHaveText(
      "Unavailable"
    );
    await page.getByRole("button", { name: "Name" }).first().click();
    await page
      .getByRole("menuitem", { name: "Migration status", exact: true })
      .click();
    // A category without options renders a disabled typeahead toggle.
    await expect(
      page.locator(".pf-v6-c-menu-toggle.pf-m-typeahead", {
        has: page.locator(
          '[data-ouia-component-id="filter-for-agenticMigration"]'
        ),
      })
    ).toHaveClass(/pf-m-disabled/);
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
      "Starts migrating the selected applications. Each application is checked before it starts."
    );
    // The readiness table comes first, with its count as the caption.
    await expect(dialog.locator("caption")).toHaveText(
      "1 of 3 applications are ready. Only ready applications start."
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
    ).toContainText("Review before start");
    await expect(
      dialog.getByRole("button", { name: "Run on 1 application" })
    ).toBeEnabled();
  });

  test("all-blocked selection cannot be started: it says why and offers only Close", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "partialConfiguration" })
    );
    await waitForInventory(page);
    const dialog = await openBulkRunMigration(page, [
      "Order Service",
      "Advisor Workbench API",
    ]);
    await expect(
      dialog.getByRole("heading", {
        name: /None of the selected applications can start/,
      })
    ).toBeVisible();
    await expect(dialog.locator("caption")).toHaveText(
      "0 of 2 applications are ready."
    );
    await expect(dialog.getByRole("button", { name: /^Run on/ })).toHaveCount(
      0
    );
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    // The footer's only button (the header has its own close icon).
    const footer = dialog.locator(".pf-v6-c-modal-box__footer");
    await expect(footer.getByRole("button")).toHaveCount(1);
    await footer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("form validation: one plan for all requires a plan and the target branch is required", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    // One target profile with a plan: it runs without a pick.
    const dialog = await openBulkRunMigration(page, ["Order Service"]);
    const start = dialog.getByRole("button", {
      name: "Run on 1 application",
    });
    await expect(start).toBeEnabled();
    await dialog
      .getByLabel("Use one migration plan for all applications")
      .check();
    await expect(start).toBeDisabled();
    await dialog.getByLabel("Use each application's migration plan").check();
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
    const row = dialog.getByRole("row", { name: /Customer Management/ });
    await expect(row).toContainText("Blocked");
    // The reason names the run and links to it.
    await expect(
      row.getByRole("link", { name: /^Run #\d+: / })
    ).toHaveAttribute("href", /\/plan-runs\/\d+/);
    await expect(dialog.getByRole("button", { name: /^Run on/ })).toHaveCount(
      0
    );
  });
});
