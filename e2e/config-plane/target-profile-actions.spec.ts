/**
 * Target profile row actions: one action (and modal) per configuration
 * area, each saving only its own field. Every save is checked in the row,
 * in-app (MSW state lives in the page).
 */
import type { Locator, Page } from "@playwright/test";

import {
  dialog,
  expect,
  expectHealthy,
  gotoProto,
  main,
  pickMenuOption,
  rowActions,
  rowByText,
  spaNavigate,
  test,
  toast,
} from "../support";

const PROFILE = "Quarkus 3.x";
// Used by OpenJDK 21 on OpenShift (Java EE Application) and Java 8 on
// OpenShift (Legacy Java Application).
const SHARED_PLAN = "Java lift and shift";
const PAGE = "/archetypes/1/target-profiles";

const menuItem = (page: Page, name: string) =>
  page.getByRole("menuitem", { name, exact: true });

/** The row's cell under `column` (cells are labelled by their column). */
const cell = (row: Locator, column: string) =>
  row.locator(`td[data-label="${column}"]`);

const openAction = async (page: Page, kebab: Locator, action: string) => {
  await kebab.click();
  await menuItem(page, action).click();
};

test.describe("Target profile row actions", () => {
  test("one action per configuration area, in the order of the columns", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    await rowActions(rowByText(page, PROFILE)).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Rename",
      "Manage generators",
      "Change analysis profile",
      "Change migration plan",
      "Manage skills",
      "Delete",
    ]);
    await page.keyboard.press("Escape");
    expectHealthy(diagnostics);
  });

  test("Rename renames the profile and keeps its other fields", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    // The row by its id: its text changes.
    const row = page.locator("#target-profile-11");
    const kebab = rowActions(row);
    await openAction(page, kebab, "Rename");

    const edit = dialog(page, "Rename target profile");
    const name = edit.getByRole("textbox", { name: /^Name/ });
    await expect(name).toBeFocused();
    await expect(edit.getByText("Generators")).toHaveCount(0);
    await name.fill("Quarkus 3.15");
    await edit.getByRole("button", { name: "Save" }).click();

    await expect(
      toast(page, "Target profile renamed to Quarkus 3.15")
    ).toBeVisible();
    await expect(edit).toHaveCount(0);
    await expect(kebab).toBeFocused();
    await expect(cell(row, "Name")).toHaveText("Quarkus 3.15");
    await expect(cell(row, "Generators")).toHaveText("OpenShift manifests");
    await expect(cell(row, "Analysis profile")).toHaveText(
      "Java EE to Quarkus"
    );
    expectHealthy(diagnostics);
  });

  test("Manage generators saves the chosen set into the Generators column", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    const row = rowByText(page, PROFILE);
    const kebab = rowActions(row);
    await openAction(page, kebab, "Manage generators");

    const manage = dialog(page, `Manage generators for ${PROFILE}`);
    await expect(manage).toHaveAccessibleDescription(
      `Applications in Java EE Application that target ${PROFILE} get assets from these generators.`
    );
    await expect(
      manage.getByRole("textbox", { name: "Search available options" })
    ).toBeFocused();
    const save = manage.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    await manage.getByText("Container build assets", { exact: true }).click();
    await manage.getByRole("button", { name: "Add selected" }).click();
    await save.click();

    await expect(
      toast(page, `Generators for ${PROFILE} updated`)
    ).toBeVisible();
    await expect(manage).toHaveCount(0);
    await expect(kebab).toBeFocused();
    await expect(cell(row, "Generators")).toContainText(
      "Container build assets"
    );
    await expect(cell(row, "Generators")).toContainText("OpenShift manifests");
    await expect(cell(row, "Name")).toHaveText(PROFILE);
    expectHealthy(diagnostics);
  });

  test("Change analysis profile assigns another one, then clears it", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    const row = rowByText(page, PROFILE);
    const kebab = rowActions(row);
    await openAction(page, kebab, "Change analysis profile");

    const change = dialog(page, "Change analysis profile");
    await expect(change).toHaveAccessibleDescription(
      `Applications in Java EE Application that target ${PROFILE} are analyzed with this analysis profile.`
    );
    const select = change.getByRole("combobox", { name: "Analysis profile" });
    await expect(select).toBeFocused();
    await select.click();
    await pickMenuOption(page, "Spring Boot to Quarkus");
    await change.getByRole("button", { name: "Save" }).click();

    await expect(
      toast(page, `Analysis profile for ${PROFILE} updated`)
    ).toBeVisible();
    await expect(change).toHaveCount(0);
    await expect(kebab).toBeFocused();
    await expect(cell(row, "Analysis profile")).toHaveText(
      "Spring Boot to Quarkus"
    );

    await openAction(page, kebab, "Change analysis profile");
    await change.getByRole("button", { name: "Clear input value" }).click();
    await change.getByRole("button", { name: "Save" }).click();
    await expect(
      toast(page, `Analysis profile for ${PROFILE} removed`)
    ).toBeVisible();
    await expect(cell(row, "Analysis profile")).toHaveText("Not assigned");
    await expect(cell(row, "Generators")).toHaveText("OpenShift manifests");

    await kebab.click();
    await expect(menuItem(page, "Assign analysis profile")).toBeVisible();
    await page.keyboard.press("Escape");
    expectHealthy(diagnostics);
  });

  for (const [action, title] of [
    ["Rename", "Rename target profile"],
    ["Manage generators", `Manage generators for ${PROFILE}`],
    ["Change analysis profile", "Change analysis profile"],
    ["Change migration plan", "Change migration plan"],
  ] as const) {
    test(`${action}: Cancel and Escape close without saving and return focus to the kebab`, async ({
      page,
    }) => {
      await gotoProto(page, PAGE);
      const kebab = rowActions(rowByText(page, PROFILE));

      await openAction(page, kebab, action);
      const modal = dialog(page, title);
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(modal).toHaveCount(0);
      await expect(kebab).toBeFocused();

      await openAction(page, kebab, action);
      await expect(modal).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
      await expect(kebab).toBeFocused();
      await expect(toast(page, /updated|assigned|removed/)).toHaveCount(0);
    });
  }

  test("Delete: Cancel returns focus to the kebab, a confirmed delete to Create target profile", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    // A profile of its own, so the fixture profiles stay for other checks.
    const create = main(page).getByRole("button", {
      name: "Create target profile",
    });
    await create.click();
    const form = dialog(page, "Create target profile");
    await form.getByRole("textbox", { name: /^Name/ }).fill("Retired profile");
    await form.getByRole("button", { name: "Create" }).click();
    await expect(form).toHaveCount(0);

    const row = rowByText(page, "Retired profile");
    const kebab = rowActions(row);
    await openAction(page, kebab, "Delete");
    const confirm = dialog(page, "Confirm dialog");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(kebab).toBeFocused();

    await openAction(page, kebab, "Delete");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(
      toast(page, "Target profile Retired profile deleted")
    ).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(create).toBeFocused();
    expectHealthy(diagnostics);
  });

  test("Create collects name, generators and analysis profile", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    await main(page)
      .getByRole("button", { name: "Create target profile" })
      .click();

    const create = dialog(page, "Create target profile");
    const name = create.getByRole("textbox", { name: /^Name/ });
    await expect(name).toBeFocused();
    await name.fill(PROFILE);
    await expect(
      create.getByText("A target profile with this name already exists.")
    ).toBeVisible();
    await name.fill("JBoss EAP 8 on OpenShift");
    await create.getByText("Container build assets", { exact: true }).click();
    await create.getByRole("button", { name: "Add selected" }).click();
    await create.getByRole("combobox", { name: "Analysis profile" }).click();
    await pickMenuOption(page, "Java EE lift and shift");
    await create.getByRole("button", { name: "Create" }).click();

    await expect(
      toast(page, "Target profile JBoss EAP 8 on OpenShift created")
    ).toBeVisible();
    await expect(create).toHaveCount(0);
    const row = rowByText(page, "JBoss EAP 8 on OpenShift");
    await expect(cell(row, "Generators")).toHaveText("Container build assets");
    await expect(cell(row, "Analysis profile")).toHaveText(
      "Java EE lift and shift"
    );
    expectHealthy(diagnostics);
  });
  test("Delete is offered on a profile that uses a migration plan, and says what it ends", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    const profile = "OpenJDK 21 on OpenShift";
    const row = rowByText(page, profile);
    await expect(cell(row, "Migration plan")).toHaveText(SHARED_PLAN);
    await openAction(page, rowActions(row), "Delete");
    const confirm = dialog(page, "Confirm dialog");
    await expect(confirm).toContainText(
      `${profile} will be deleted, and applications in Java EE Application can no longer run ${SHARED_PLAN} on it.`
    );
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(
      toast(page, `Target profile ${profile} deleted`)
    ).toBeVisible();
    await expect(row).toHaveCount(0);

    // The plan keeps its other target profile.
    await spaNavigate(page, "/migration-plans");
    await expect(
      main(page)
        .getByRole("row")
        .filter({
          has: page.getByRole("link", { name: SHARED_PLAN, exact: true }),
        })
    ).toContainText("Java 8 on OpenShift (Legacy Java Application)");
    expectHealthy(diagnostics);
  });

  // The Hub assigns target profile ids; the mock gives each new profile its
  // own, so row actions act on the profile they belong to.
  test("two profiles created in one session get their own ids", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    const create = main(page).getByRole("button", {
      name: "Create target profile",
    });
    for (const name of ["First new profile", "Second new profile"]) {
      await create.click();
      const form = dialog(page, "Create target profile");
      await form.getByRole("textbox", { name: /^Name/ }).fill(name);
      await form.getByRole("button", { name: "Create" }).click();
      await expect(form).toHaveCount(0);
      await expect(rowByText(page, name)).toHaveCount(1);
    }
    const ids = await main(page)
      .locator("tr[id^='target-profile-']")
      .evaluateAll((rows) => rows.map((row) => row.id));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);

    // Renaming the second leaves the first alone.
    const second = page.locator(
      `#${await rowByText(page, "Second new profile").getAttribute("id")}`
    );
    await openAction(page, rowActions(second), "Rename");
    const edit = dialog(page, "Rename target profile");
    await edit.getByRole("textbox", { name: /^Name/ }).fill("Renamed profile");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(
      toast(page, "Target profile renamed to Renamed profile")
    ).toBeVisible();
    await expect(cell(second, "Name")).toHaveText("Renamed profile");
    await expect(rowByText(page, "First new profile")).toHaveCount(1);

    // Deleting the first leaves the renamed one.
    await openAction(
      page,
      rowActions(rowByText(page, "First new profile")),
      "Delete"
    );
    await dialog(page, "Confirm dialog")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      toast(page, "Target profile First new profile deleted")
    ).toBeVisible();
    await expect(rowByText(page, "First new profile")).toHaveCount(0);
    await expect(rowByText(page, "Renamed profile")).toHaveCount(1);
    expectHealthy(diagnostics);
  });

  test("assigning a shared plan here leaves it on the other archetype's profile", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    const row = rowByText(page, PROFILE);
    await expect(cell(row, "Migration plan")).toHaveText("Java EE to Quarkus");
    await openAction(page, rowActions(row), "Change migration plan");
    const change = dialog(page, "Change migration plan");
    await expect(change).toContainText(
      "A target profile uses one migration plan. Target profiles of several archetypes can share a plan."
    );
    const select = change.getByRole("combobox", { name: /^Migration plan/ });
    // Every plan is offered, another archetype's plan too.
    await expect(
      select.getByRole("option", { name: "Spring Boot to Quarkus" })
    ).toHaveCount(1);
    await select.selectOption({ label: SHARED_PLAN });
    await change.getByRole("button", { name: "Save" }).click();
    await expect(
      toast(page, `Migration plan for ${PROFILE} updated`)
    ).toBeVisible();
    await expect(cell(row, "Migration plan")).toHaveText(SHARED_PLAN);
    await expect(
      cell(rowByText(page, "OpenJDK 21 on OpenShift"), "Migration plan")
    ).toHaveText(SHARED_PLAN);

    // Legacy Java Application's profile keeps it.
    await spaNavigate(page, "/archetypes/3/target-profiles");
    await expect(
      cell(rowByText(page, "Java 8 on OpenShift"), "Migration plan")
    ).toHaveText(SHARED_PLAN);
    await spaNavigate(page, "/migration-plans");
    const planRow = (name: string) =>
      main(page)
        .getByRole("row")
        .filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(
      planRow(SHARED_PLAN).getByRole("button", { name: "3 target profiles" })
    ).toBeVisible();
    await expect(planRow("Java EE to Quarkus")).toContainText("Not assigned");
    expectHealthy(diagnostics);
  });
});
