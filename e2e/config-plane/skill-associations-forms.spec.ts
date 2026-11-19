/**
 * Two-way skill associations edited in the agentic forms: a skill's
 * collections from the skill form, a collection's agents from the collection
 * form, and both sides staying consistent with the collection and agent
 * forms that already edit the same data.
 */
import type { Page } from "@playwright/test";

import {
  dialog,
  expect,
  expectHealthy,
  field,
  gotoProto,
  main,
  openRowActions,
  pickMulti,
  spaNavigate,
  test,
  toast,
} from "../support";

const SKILL_COLLECTIONS = "skill-skill-collections";
const COLLECTION_AGENTS = "skill-collection-agents";
const COLLECTION_SKILLS = "skill-collection-skills-select";

const chips = (page: Page, toggleId: string) =>
  dialog(page).locator(`[data-ouia-component-id="${toggleId}-chip-group"]`);

/** Opens Edit from a detail page's Actions menu. */
const editFromDetail = async (page: Page) => {
  await main(page)
    .getByRole("button", { name: "Actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
};

const collectionsSection = (page: Page) =>
  main(page).getByRole("grid", { name: /collections/i });

test.describe("Skill form: Skill collections", () => {
  test("adding a skill to a collection shows it in the collection's members", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, "/skills/1?tab=usage");
    await expect(collectionsSection(page)).toContainText(
      "Java modernization foundation"
    );
    await editFromDetail(page);
    await expect(chips(page, SKILL_COLLECTIONS)).toContainText(
      "Java modernization foundation"
    );

    await expect(
      dialog(page).getByRole("combobox", {
        name: "Skill collections",
        exact: true,
      })
    ).toBeVisible();
    await pickMulti(page, SKILL_COLLECTIONS, ["Platform deployment pack"]);
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill updated")).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    // The skill's own page refreshes without a reload.
    await expect(collectionsSection(page)).toContainText(
      "Platform deployment pack"
    );

    await spaNavigate(page, "/skills/collections/3");
    await expect(
      main(page).getByRole("link", { name: "Spring Boot to Quarkus migration" })
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("a new skill joins the collections chosen while creating it", async ({
    page,
  }) => {
    await gotoProto(page, "/skills");
    await page.getByRole("button", { name: "Create skill" }).click();
    await field(dialog(page), "Name").fill("QA collection skill");
    await field(dialog(page), "Content").fill("# QA\nGuidance.");
    await pickMulti(page, SKILL_COLLECTIONS, ["OpenShift delivery checks"]);
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill created")).toBeVisible();

    await spaNavigate(page, "/skills/collections/2");
    await expect(
      main(page).getByRole("link", { name: "QA collection skill" })
    ).toBeVisible();
  });
});

test.describe("Skill collection form: Agents", () => {
  test("removing a skill from the collection drops it from the skill's collections", async ({
    page,
  }) => {
    await gotoProto(page, "/skills/collections/1");
    await editFromDetail(page);
    await chips(page, COLLECTION_SKILLS)
      .getByRole("button", { name: "Remove Spring Boot to Quarkus migration" })
      .click();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill collection updated")).toBeVisible();

    // An old Associations link opens the Usage tab and is rewritten.
    await spaNavigate(page, "/skills/1?tab=associations");
    await expect(
      page.getByRole("tab", { name: "Usage", selected: true })
    ).toBeVisible();
    await expect(page).toHaveURL(/tab=usage/);
    await expect(
      main(page).getByRole("link", {
        name: "Quarkus 3.x (Spring Boot Application)",
      })
    ).toBeVisible();
    await expect(
      main(page).getByRole("link", { name: "Java modernization foundation" })
    ).toHaveCount(0);
  });

  test("adding an agent shows the collection on the agent's page", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, "/skills/collections/2");
    await editFromDetail(page);
    // One field named like the detail section, announced by its label.
    await expect(
      dialog(page).getByRole("combobox", { name: "Agents", exact: true })
    ).toBeVisible();
    await pickMulti(page, COLLECTION_AGENTS, ["Test Runner"]);
    // Close the menu so it does not cover the footer buttons.
    await dialog(page).getByRole("heading").first().click();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill collection updated")).toBeVisible();
    // The collection's own page refreshes without a reload.
    await expect(
      main(page).getByRole("link", { name: "Test Runner" })
    ).toBeVisible();

    await spaNavigate(page, "/agents/4");
    await expect(
      main(page).getByRole("link", { name: "OpenShift delivery checks" })
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("a collection chosen in the agent form is preselected in the collection form", async ({
    page,
  }) => {
    await gotoProto(page, "/agents");
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await pickMulti(page, "skill-collections-select-toggle", [
      "Platform deployment pack",
    ]);
    // Close the menu so it does not cover the footer buttons.
    await dialog(page).getByRole("heading").first().click();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Agent updated")).toBeVisible();

    await spaNavigate(page, "/skills/collections/3");
    await editFromDetail(page);
    await expect(chips(page, COLLECTION_AGENTS)).toContainText("Test Runner");
    // Untouched, so Save stays disabled: the preselection is not a change.
    await expect(
      dialog(page).getByRole("button", { name: "Save" })
    ).toBeDisabled();
  });
});

test.describe("Skill association forms: personas", () => {
  test("platform engineer can edit both pickers", async ({ page }) => {
    await gotoProto(page, "/skills/collections/1", {
      persona: "platformEngineer",
    });
    await editFromDetail(page);
    await expect(
      dialog(page).locator(`#${COLLECTION_AGENTS}-input`)
    ).toBeEnabled();
    await expect(chips(page, COLLECTION_AGENTS)).toContainText("Code Migrator");
  });

  test("hub migrator has no way into either form", async ({ page }) => {
    for (const path of ["/skills/1", "/skills/collections/1"]) {
      await gotoProto(page, path, { persona: "hubMigrator" });
      await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        main(page).getByRole("button", { name: "Actions", exact: true })
      ).toHaveCount(0);
    }
  });
});

test.describe("Skill association forms: locked chips", () => {
  test("the only skill of a collection keeps its chip and the form says why", async ({
    page,
  }) => {
    // Collection 3 starts with two skills; leave skill 1 as its only one.
    await gotoProto(page, "/skills/collections/3");
    await editFromDetail(page);
    await pickMulti(page, COLLECTION_SKILLS, [
      "Spring Boot to Quarkus migration",
    ]);
    for (const name of await chips(page, COLLECTION_SKILLS)
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((b) => b.getAttribute("aria-label") ?? "")
      ))
      if (name !== "Remove Spring Boot to Quarkus migration")
        await chips(page, COLLECTION_SKILLS)
          .getByRole("button", { name })
          .click();
    await dialog(page).getByRole("heading").first().click();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill collection updated")).toBeVisible();

    await spaNavigate(page, "/skills/1");
    await editFromDetail(page);
    await expect(
      dialog(page).getByText(
        "Platform deployment pack keeps this skill: a skill collection needs at least one skill."
      )
    ).toBeVisible();
    await expect(
      chips(page, SKILL_COLLECTIONS).getByRole("button", {
        name: "Remove Platform deployment pack",
      })
    ).toHaveCount(0);
    // Clearing keeps the locked chip.
    await dialog(page)
      .locator(`#${SKILL_COLLECTIONS}-input`)
      .locator("xpath=ancestor::div[contains(@class,'pf-v6-c-menu-toggle')]")
      .getByRole("button", { name: "Clear input value" })
      .click();
    await expect(chips(page, SKILL_COLLECTIONS)).toHaveText(
      "Platform deployment pack"
    );
  });
});
