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
  test,
  toast,
} from "../support";

const PROFILE = "Quarkus 3.x";
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
      "Edit",
      "Manage generators",
      "Change analysis profile",
      "Change migration plan",
      "Manage skills",
      "Delete",
    ]);
    await page.keyboard.press("Escape");
    expectHealthy(diagnostics);
  });

  test("Edit renames the profile and keeps its other fields", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PAGE);
    // The row by its id: its text changes.
    const row = page.locator("#target-profile-11");
    const kebab = rowActions(row);
    await openAction(page, kebab, "Edit");

    const edit = dialog(page, "Edit target profile");
    const name = edit.getByRole("textbox", { name: /^Name/ });
    await expect(name).toBeFocused();
    await expect(edit.getByText("Generators")).toHaveCount(0);
    await name.fill("Quarkus 3.15");
    await edit.getByRole("button", { name: "Save" }).click();

    await expect(toast(page, "Target profile updated")).toBeVisible();
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

    await expect(toast(page, "Analysis profile assigned")).toBeVisible();
    await expect(change).toHaveCount(0);
    await expect(kebab).toBeFocused();
    await expect(cell(row, "Analysis profile")).toHaveText(
      "Spring Boot to Quarkus"
    );

    await openAction(page, kebab, "Change analysis profile");
    await change.getByRole("button", { name: "Clear input value" }).click();
    await change.getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Analysis profile removed")).toBeVisible();
    await expect(cell(row, "Analysis profile")).toHaveText("Not assigned");
    await expect(cell(row, "Generators")).toHaveText("OpenShift manifests");

    await kebab.click();
    await expect(menuItem(page, "Assign analysis profile")).toBeVisible();
    await page.keyboard.press("Escape");
    expectHealthy(diagnostics);
  });

  for (const [action, title] of [
    ["Edit", "Edit target profile"],
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
    // Fixture profiles have a plan, which blocks Delete: create one first.
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
    await expect(toast(page, "Target profile deleted")).toBeVisible();
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

    await expect(toast(page, "Target profile created")).toBeVisible();
    await expect(create).toHaveCount(0);
    const row = rowByText(page, "JBoss EAP 8 on OpenShift");
    await expect(cell(row, "Generators")).toHaveText("Container build assets");
    await expect(cell(row, "Analysis profile")).toHaveText(
      "Java EE lift and shift"
    );
    expectHealthy(diagnostics);
  });
});
