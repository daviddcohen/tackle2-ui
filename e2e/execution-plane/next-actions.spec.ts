/**
 * Every inventory Migration status leads somewhere actionable: its link opens the application's
 * Migration tab (blockers, pending decision, failure evidence + new run, the plan run, the
 * migration path configuration), and a ready application starts from its row actions.
 */
import type { Page } from "@playwright/test";

import {
  AGENTIC_STATUS,
  approveButton,
  expect,
  migrationCell,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

/** The inventory status of an application, a link to its Migration tab. */
const statusLink = (page: Page, application: string, status: string) =>
  migrationCell(page, application).getByRole("link", {
    name: status,
    exact: true,
  });

const expectMigrationTab = async (page: Page, application: string) => {
  await expect(page).toHaveURL(/\/applications\/\d+\?.*tab=migration/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(application);
  await expect(
    page.getByRole("tab", { name: "Migration", selected: true })
  ).toBeVisible();
};

test.describe("Migration next actions", () => {
  test("Run migration plan in the row actions opens preflight for that application", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "configured" }));
    await waitForInventory(page);
    await page
      .getByRole("row", { name: /Customer Management/ })
      .getByRole("button", { name: "Row actions" })
      .click();
    await page.getByRole("menuitem", { name: "Run migration plan" }).click();
    const dialog = page.getByRole("dialog", { name: "Run migration plan" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Run on 1 application" })
    ).toBeEnabled();
  });

  test("Blocked opens the Migration tab with the blocker", async ({ page }) => {
    await page.goto(
      protoUrl("/applications", { scenario: "preflightBlocked" })
    );
    await waitForInventory(page);
    await statusLink(page, "Branch Operations", "Blocked").click();
    await expectMigrationTab(page, "Branch Operations");
    await expect(
      page.getByText("A source control credential reference is missing.")
    ).toBeVisible();
  });

  test("Running opens the Migration tab, which links to the plan run", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "running" }));
    await waitForInventory(page);
    await statusLink(page, "Customer Management", "Running").click();
    await expectMigrationTab(page, "Customer Management");
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Run #\d+/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Run #"
    );
    // The run's facts list the application.
    await expect(
      page
        .getByRole("main")
        .locator("dl")
        .first()
        .getByRole("link", { name: "Customer Management" })
    ).toBeVisible();
  });

  test("Succeeded opens the Migration tab, which links to the plan run", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "completed" }));
    await waitForInventory(page);
    await statusLink(page, "Customer Management", "Succeeded").click();
    await expectMigrationTab(page, "Customer Management");
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Run #\d+/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/plan-runs\/\d+\?/);
  });

  test("Action required: approve on the Migration tab", async ({ page }) => {
    await page.goto(protoUrl("/applications", { scenario: "actionRequired" }));
    await waitForInventory(page);
    await statusLink(page, "Customer Management", "Action required").click();
    await expectMigrationTab(page, "Customer Management");
    await approveButton(page).click();
    // The decision belongs to the shared plan run: the confirmation says
    // it applies to every application in it.
    const confirm = page.getByRole("dialog");
    await expect(confirm).toContainText(
      /This decision applies to all \d+ applications in Run #/
    );
    await confirm.getByRole("button", { name: "Approve and continue" }).click();
    await expect(page.getByText("Migration request resolved")).toBeVisible();
    await expect(approveButton(page)).toHaveCount(0);
  });

  test("Show applications lists each request and its status opens the Migration tab", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "actionRequired" }));
    await waitForInventory(page);
    await page.getByRole("button", { name: "Show applications" }).click();
    const statuses = page
      .locator('td[data-label="Migration"]')
      .getByRole("link", { name: "Action required", exact: true });
    await expect(statuses.first()).toBeVisible();
    await expect(
      page.locator('td[data-label="Migration"]').getByRole("link")
    ).toHaveCount(await statuses.count());
    await statuses.first().click();
    await expect(
      page.getByRole("tab", { name: "Migration", selected: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reject", exact: true })
    ).toBeVisible();
  });

  test("Failed: evidence and Run migration plan on the Migration tab", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "failed" }));
    await waitForInventory(page);
    await statusLink(page, "Customer Management", "Failed").click();
    await expectMigrationTab(page, "Customer Management");
    await expect(
      page.getByRole("heading", { name: /^Danger alert: .+ failed$/ })
    ).toBeVisible();
    await page.getByRole("button", { name: "Run migration plan" }).click();
    const dialog = page.getByRole("dialog", { name: "Run migration plan" });
    await expect(
      dialog.getByRole("row", { name: /Customer Management/ })
    ).toBeVisible();
    // The application still resolves to the run's plan (R5), even though
    // the run covers other applications this tab does not load.
    await expect(
      dialog.getByLabel("Use each application's migration plan")
    ).toBeChecked();
  });

  for (const [scenario, title] of [
    ["actionRequired", /needs approval$/],
    ["failed", / failed$/],
  ] as const) {
    test(`${scenario}: the Migration tab leads with the attention alert`, async ({
      page,
    }) => {
      await page.goto(
        protoUrl("/applications/1", {
          scenario,
          params: { tab: "migration" },
        })
      );
      // What needs the user comes first, so no link has to move focus to it.
      await expect(
        page.getByRole("tabpanel").getByRole("heading").first()
      ).toHaveText(title);
    });
  }

  test("a failed plan run starts a new run prefilled with its Plan and branch", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/2", { scenario: "failed" }));
    await page.getByRole("button", { name: "Run migration plan" }).click();
    const dialog = page.getByRole("dialog", { name: "Run migration plan" });
    // Every application still resolves to the run's plan: keep their own.
    await expect(
      dialog.getByLabel("Use each application's migration plan")
    ).toBeChecked();
    await expect(
      dialog.getByRole("textbox", { name: /Target branch/ })
    ).toHaveValue("mta/spring-quarkus");
    await dialog
      .getByRole("button", { name: /^Run on \d+ applications?$/ })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Spring Boot to Quarkus"
    );
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText(
      "Run #2 "
    );
  });

  test("an application without a migration path opens its Migration tab", async ({
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
    await expect(cell.locator(AGENTIC_STATUS)).toHaveText("Not configured", {
      timeout: 20000,
    });
    await statusLink(
      page,
      "Aardvark Unmapped Service",
      "Not configured"
    ).click();
    await expectMigrationTab(page, "Aardvark Unmapped Service");
    // Without an archetype there is no target profile to assign a plan to.
    await expect(
      page.getByText("This application has no archetype.", { exact: false })
    ).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("link", { name: "Go to archetypes", exact: true })
      .click();
    await expect(page).toHaveURL(/\/archetypes(\?|$)/);
  });

  test("an application whose archetype has no plan links to its target profiles", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications/1", {
        scenario: "initial",
        params: { tab: "migration" },
      })
    );
    await expect(
      page.getByRole("heading", { name: "No migration path" })
    ).toBeVisible();
    await expect(
      page.getByText("Check the target profiles of Java EE Application.", {
        exact: false,
      })
    ).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("link", { name: "View target profiles", exact: true })
      .click();
    await expect(page).toHaveURL(/\/archetypes\/\d+\/target-profiles/);
  });
});
