/**
 * Every next action shown in the inventory Migration column (and on the application's Migration
 * tab) leads somewhere actionable: preflight, the Migration tab (blockers, pending decision,
 * failure evidence + new run), the plan run, or the migration path configuration.
 */
import type { Page } from "@playwright/test";

import {
  expect,
  migrationCell,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

const nextAction = (page: Page, application: string, name: string) =>
  migrationCell(page, application).getByRole("button", { name, exact: true });

test.describe("Migration next actions", () => {
  test("Start migration opens preflight for that application", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    await nextAction(page, "Customer Management", "Start migration").click();
    const dialog = page.getByRole("dialog", { name: "Run migration plan" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Start 1 Ready Application" })
    ).toBeEnabled();
  });

  test("Resolve blockers opens the Migration tab with the blocker", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "preflightBlocked" })
    );
    await waitForInventory(page);
    await nextAction(page, "Branch Operations", "Resolve blockers").click();
    await expect(page).toHaveURL(/\/applications\/\d+\?.*tab=migration/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Branch Operations"
    );
    await expect(
      page.getByRole("tab", { name: "Migration", selected: true })
    ).toBeVisible();
    await expect(
      page.getByText("A source control credential reference is missing.")
    ).toBeVisible();
  });

  test("Monitor progress opens the application's plan run", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "running" }));
    await waitForInventory(page);
    await nextAction(page, "Customer Management", "Monitor progress").click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Run #"
    );
    await expect(
      page.getByRole("main").getByRole("link", { name: "Customer Management" })
    ).toBeVisible();
  });

  test("Review migration results opens the plan run", async ({ page }) => {
    await page.goto(protoUrl("/applications", { scenario: "completed" }));
    await waitForInventory(page);
    await nextAction(
      page,
      "Customer Management",
      "Review migration results"
    ).click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
  });

  test("Review pending request: approve on the Migration tab", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "actionRequired" }));
    await waitForInventory(page);
    await nextAction(
      page,
      "Customer Management",
      "Review pending request"
    ).click();
    await expect(
      page.getByRole("tab", { name: "Migration", selected: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve and Continue" }).click();
    // The decision belongs to the shared plan run: the confirmation names
    // every application in it.
    const confirm = page.getByRole("dialog");
    await expect(confirm).toContainText("Customer Management");
    await confirm.getByRole("button", { name: "Approve and Continue" }).click();
    await expect(page.getByText("Migration request resolved")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve and Continue" })
    ).toHaveCount(0);
  });

  test("Review N Requests lists each request and opens its Migration tab", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "actionRequired" }));
    await waitForInventory(page);
    await page.getByRole("button", { name: /Review \d+ Requests?/ }).click();
    const dialog = page.getByRole("dialog", { name: "Action required" });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText(/contract|prototype/i);
    await dialog
      .getByRole("button", { name: "Review Migration Proposal" })
      .first()
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("tab", { name: "Migration", selected: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reject Request" })
    ).toBeVisible();
  });

  test("Review failure and retry: evidence and Start New Run on the Migration tab", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "failed" }));
    await waitForInventory(page);
    await nextAction(
      page,
      "Customer Management",
      "Review failure and retry"
    ).click();
    await expect(page.getByText(/Stage failed/).first()).toBeVisible();
    await page.getByRole("button", { name: "Start New Run" }).click();
    const dialog = page.getByRole("dialog", { name: "Run migration plan" });
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toBeVisible();
  });

  test("a failed plan run starts a new run prefilled with its Plan and branch", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/2", { scenario: "failed" }));
    await page.getByRole("button", { name: "Start new run" }).click();
    const dialog = page.getByRole("dialog", { name: "Run migration plan" });
    await expect(
      dialog.getByLabel("Override with a specific Plan")
    ).toBeChecked();
    await expect(
      dialog.getByRole("textbox", { name: /Target branch/ })
    ).toHaveValue("mta/spring-quarkus");
    await dialog
      .getByRole("button", { name: /^Start \d+ Ready Applications?$/ })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Spring Boot to Quarkus"
    );
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText(
      "Run #2 "
    );
  });

  test("an application without a migration path offers Configure migration path", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    await page.evaluate(() =>
      fetch("/hub/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Aardvark Unmapped Service",
          description: "",
          tags: [],
        }),
      })
    );
    const cell = migrationCell(page, "Aardvark Unmapped Service");
    await expect(cell.locator(".pf-v6-c-label")).toHaveText("Not configured", {
      timeout: 20000,
    });
    await nextAction(
      page,
      "Aardvark Unmapped Service",
      "Configure migration path"
    ).click();
    await expect(page).toHaveURL(/\/migration-plans(\?|$)/);
  });
});
