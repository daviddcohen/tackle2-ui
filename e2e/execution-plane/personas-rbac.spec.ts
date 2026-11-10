/**
 * Persona -> masquerade preset: platformEngineer=admin, enterpriseArchitect=architect,
 * hubMigrator=migrator (client/src/auth/roles-to-scopes.ts). All three hold
 * agentic.workflowruns:post; only admin/architect hold agentic.workflows write.
 */
import {
  type Persona,
  expect,
  inventoryRow,
  protoUrl,
  test,
  waitForInventory,
} from "../support";

const personas: { persona: Persona; canEditPlans: boolean }[] = [
  { persona: "platformEngineer", canEditPlans: true },
  { persona: "enterpriseArchitect", canEditPlans: true },
  { persona: "hubMigrator", canEditPlans: false },
];

for (const { persona, canEditPlans } of personas) {
  test.describe(`${persona} execution access`, () => {
    test("can start migrations from row and bulk actions", async ({ page }) => {
      await page.goto(
        protoUrl("/applications", { scenario: "configured", persona })
      );
      await waitForInventory(page);
      await expect(page.getByText("Read-only access")).toHaveCount(0);
      await inventoryRow(page, "Customer Management")
        .getByRole("button", { name: "Row actions" })
        .click();
      await expect(
        page.getByRole("menuitem", { name: "Run migration plan" })
      ).toBeEnabled();
      await page.keyboard.press("Escape");
      await inventoryRow(page, "Customer Management")
        .getByRole("checkbox")
        .check();
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await expect(
        page.getByRole("menuitem", { name: "Run migration plan" })
      ).toBeVisible();
    });

    test(`plan configuration is ${canEditPlans ? "editable" : "read only"}`, async ({
      page,
    }) => {
      await page.goto(
        protoUrl("/migration-plans", { scenario: "configured", persona })
      );
      await expect(
        page.getByRole("link", { name: "Java EE to Quarkus" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create Plan" })
      ).toHaveCount(canEditPlans ? 1 : 0);
      await expect(
        page.getByRole("button", { name: /Kebab toggle/ })
      ).toHaveCount(canEditPlans ? 8 : 0);
      await page.getByRole("link", { name: "Java EE to Quarkus" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Java EE to Quarkus" })
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit Plan" })).toHaveCount(
        canEditPlans ? 1 : 0
      );
    });

    test("can open plan runs and stage runs", async ({ page }) => {
      await page.goto(
        protoUrl("/plan-runs", { scenario: "configured", persona })
      );
      await page.getByRole("link", { name: /Run #1/ }).click();
      await page.getByRole("link", { name: "View run" }).first().click();
      await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/\d+\?/);
    });
  });
}

test("hub migrator lands on the inventory and has no Administration perspective", async ({
  page,
}) => {
  await page.goto(
    protoUrl("/applications", {
      scenario: "configured",
      persona: "hubMigrator",
    })
  );
  await waitForInventory(page);
  await page.getByRole("button", { name: /select persona/ }).click();
  await expect(
    page
      .getByRole("option", { name: "Administration" })
      .or(page.getByRole("menuitem", { name: "Administration" }))
  ).toHaveCount(0);
});
