/**
 * Skills list, skill form (inline/git/oci), import modal, skill detail,
 * skill collections (create from selection, detail), cross-entity effects.
 */
import type { Page } from "@playwright/test";

import {
  dataRows,
  dialog,
  expect,
  expectHealthy,
  field,
  filterByName,
  gotoProto,
  openRowActions,
  pickMulti,
  rowByText,
  spaNavigate,
  test,
  toast,
} from "../support";

const ARCHITECT = "enterpriseArchitect" as const;

const openSkills = async (
  page: Page,
  persona: typeof ARCHITECT | "hubMigrator" = ARCHITECT
) => {
  await gotoProto(page, "/skills", { persona: persona });
  await expect(dataRows(page)).toHaveCount(10);
};

const createInlineSkill = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Create skill" }).click();
  await field(dialog(page), "Name").fill(name);
  await field(dialog(page), "Skill content").fill(`# ${name}\nGuidance.`);
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(toast(page, "Skill created")).toBeVisible();
};

const sourceButton = (page: Page, name: "Inline" | "Git" | "OCI") =>
  dialog(page).getByRole("button", { name, exact: true });

test.describe("Skills list", () => {
  test.beforeEach(async ({ page }) => openSkills(page));

  test("lists skills and collections together, paginated", async ({
    page,
    diagnostics,
  }) => {
    await expect(
      page.getByRole("button", { name: /1 - 10 of 20/ }).first()
    ).toBeVisible();
    await expect(
      rowByText(page, "Java modernization foundation")
    ).toContainText("Collection");
    await expect(rowByText(page, "Corporate coding standards")).toContainText(
      "Inline"
    );
    await page.getByRole("button", { name: "Go to next page" }).first().click();
    await expect(dataRows(page)).toHaveCount(10);
    expectHealthy(diagnostics);
  });

  test("type filter shows only collections", async ({ page }) => {
    await page.getByRole("button", { name: "Name" }).first().click();
    await page.getByRole("menuitem", { name: "Type", exact: true }).click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page.getByRole("menuitem", { name: "Collection" }).click();
    await expect(dataRows(page)).toHaveCount(4);
  });

  test("associations link opens the inspector modal", async ({ page }) => {
    await rowByText(page, "Build validation standards")
      .getByRole("button", { name: /associations/i })
      .click();
    await expect(dialog(page)).toContainText("Build Validator");
  });

  test("skills in use cannot be deleted from the list", async ({ page }) => {
    await openRowActions(page, "Build validation standards");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  // Regression guard: translation agentic.skill.collectionContents has no _one/_other variants ('1 skills')
  test("collection content count is pluralized", async ({ page }) => {
    await filterByName(page, "zzz");
    await createInlineSkill(page, "Single Member");
    await filterByName(page, "Single Member");
    await dataRows(page).first().getByRole("checkbox").check();
    await page.getByRole("button", { name: /^Create collection/ }).click();
    await field(dialog(page), "Name").fill("Single Pack");
    await field(dialog(page), "Description").fill("One skill");
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill collection created")).toBeVisible();
    await filterByName(page, "Single Pack");
    await expect(rowByText(page, "Single Pack")).toContainText("1 skill");
    await expect(rowByText(page, "Single Pack")).not.toContainText("1 skills");
  });

  test("hub migrator gets no create/import/edit actions", async ({ page }) => {
    await openSkills(page, "hubMigrator");
    await expect(
      page.getByRole("button", { name: "Create skill" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Import skill file" })
    ).toHaveCount(0);
    await expect(
      rowByText(page, "Corporate coding standards").getByRole("button", {
        name: /row actions/i,
      })
    ).toHaveCount(0);
  });

  test("initial scenario shows the empty state", async ({ page }) => {
    await gotoProto(page, "/skills", {
      persona: ARCHITECT,
      scenario: "initial",
    });
    await expect(page.getByText("No Skills yet")).toBeVisible();
  });
});

test.describe("Skill form", () => {
  test.beforeEach(async ({ page }) => {
    await openSkills(page);
    await page.getByRole("button", { name: "Create skill" }).click();
    await field(dialog(page), "Name").fill("QA Skill");
  });

  test("source type switches conditional required fields", async ({ page }) => {
    const create = dialog(page).getByRole("button", { name: "Create" });
    await expect(field(dialog(page), "Skill content")).toBeVisible();
    await expect(create).toBeDisabled();

    await sourceButton(page, "Git").click();
    await expect(field(dialog(page), "Skill content")).toHaveCount(0);
    await expect(field(dialog(page), "Branch")).toHaveValue("main");
    await expect(field(dialog(page), "Path")).toHaveValue("/");
    await expect(create).toBeDisabled();
    await field(dialog(page), "Repository URL").fill(
      "https://github.com/org/skills.git"
    );
    await expect(create).toBeEnabled();

    await sourceButton(page, "OCI").click();
    await expect(field(dialog(page), "Repository URL")).toHaveCount(0);
    await expect(create).toBeDisabled();
    await field(dialog(page), "Image reference").fill("quay.io/org/skill:1.0");
    await expect(create).toBeEnabled();
  });

  test("name validation: min length and duplicate", async ({ page }) => {
    await field(dialog(page), "Name").fill("ab");
    await field(dialog(page), "Name").blur();
    await expect(dialog(page)).toContainText("at least 3 characters");
    await field(dialog(page), "Name").fill("Corporate coding standards");
    await expect(dialog(page)).toContainText("already exists");
  });

  // Regression guard: skill-form.tsx repoUrl only has .required()
  test("git repository URL must be a valid URL", async ({ page }) => {
    await sourceButton(page, "Git").click();
    await field(dialog(page), "Repository URL").fill("not a url");
    await expect(
      dialog(page).getByRole("button", { name: "Create" })
    ).toBeDisabled();
  });

  test("switching source type does not log React warnings", async ({
    page,
    diagnostics,
  }) => {
    await sourceButton(page, "Git").click();
    await sourceButton(page, "Inline").click();
    await expect(field(dialog(page), "Skill content")).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("created inline skill associated to an agent is offered in the agent form", async ({
    page,
  }) => {
    await field(dialog(page), "Skill content").fill("# QA Skill\nGuidance.");
    await pickMulti(page, "skill-association-select", ["Test Runner"]);
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill created")).toBeVisible();
    await filterByName(page, "QA Skill");
    await expect(rowByText(page, "QA Skill")).toContainText("Test Runner");

    await spaNavigate(page, "/agents");
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(
      dialog(page).getByLabel("QA Skill", { exact: true })
    ).toBeVisible();
    await page.locator("#skills-select-toggle-input").click();
    await expect(
      page.getByRole("menuitem", { name: "QA Skill" })
    ).toBeVisible();
  });
});

test.describe("Import skill", () => {
  test.beforeEach(async ({ page }) => {
    await openSkills(page);
    await page.getByRole("button", { name: "Import skill file" }).click();
  });

  test("import is disabled until a file is loaded, then creates a skill", async ({
    page,
  }) => {
    const importBtn = dialog(page).getByRole("button", {
      name: "Import",
      exact: true,
    });
    await expect(importBtn).toBeDisabled();
    await page.locator("input[type=file]").setInputFiles({
      name: "unique-skill.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Unique imported skill\nBody"),
    });
    await expect(importBtn).toBeEnabled();
    await importBtn.click();
    await expect(toast(page, "Skill imported successfully")).toBeVisible();
    await filterByName(page, "Unique imported skill");
    await expect(dataRows(page)).toHaveCount(1);
  });

  // Regression guard: import-skill-modal.tsx derives the name from the first heading with no duplicate check and no way to edit it; mock POST accepts duplicates
  test("importing a file whose heading duplicates an existing skill is rejected", async ({
    page,
  }) => {
    await page.locator("input[type=file]").setInputFiles({
      name: "dup.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Corporate coding standards\nBody"),
    });
    // The name is prefilled from the heading and editable; a duplicate blocks Import.
    await expect(field(dialog(page), "Name")).toHaveValue(
      "Corporate coding standards"
    );
    await expect(dialog(page)).toContainText("already exists");
    await expect(
      dialog(page).getByRole("button", { name: "Import", exact: true })
    ).toBeDisabled();
    await field(dialog(page), "Name").fill(
      "Corporate coding standards (imported)"
    );
    await dialog(page)
      .getByRole("button", { name: "Import", exact: true })
      .click();
    await expect(toast(page, "Skill imported successfully")).toBeVisible();
    await filterByName(page, "Corporate coding standards");
    await expect(dataRows(page)).toHaveCount(2);
  });
});

test.describe("Skill detail", () => {
  test("details and associations tabs render", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, "/skills/1", { persona: ARCHITECT });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Spring Boot to Quarkus migration",
      })
    ).toBeVisible();
    await page.getByRole("tab", { name: /Associations/ }).click();
    await expect(page).toHaveURL(/tab=associations/);
    await expect(
      page.getByRole("link", { name: "Code Migrator" })
    ).toBeVisible();
    await expect(
      page.getByRole("grid", { name: /collections/i })
    ).toContainText("Java modernization foundation");
    expectHealthy(diagnostics);
  });

  // Regression guard: skill-detail.tsx renders Actions without a skillsWriteScopes check
  test("hub migrator gets no Edit/Delete actions on skill detail", async ({
    page,
  }) => {
    await gotoProto(page, "/skills/1", { persona: "hubMigrator" });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Spring Boot to Quarkus migration",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actions", exact: true })
    ).toHaveCount(0);
  });

  // Regression guard: skill-detail.tsx Delete has no in-use guard (list disables it)
  test("skill in use cannot be deleted from the detail page", async ({
    page,
  }) => {
    await gotoProto(page, "/skills/1", { persona: ARCHITECT });
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("Skill collections", () => {
  test("collection detail lists members and agents using it", async ({
    page,
  }) => {
    await gotoProto(page, "/skills/collections/1", { persona: ARCHITECT });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Java modernization foundation",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Spring Boot to Quarkus migration" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Code Migrator" })
    ).toBeVisible();
  });

  // Regression guard: skill-collection-form.tsx has no duplicateNameCheck or max length
  test("duplicate collection names are rejected", async ({ page }) => {
    await openSkills(page);
    await dataRows(page)
      .filter({ hasText: "Corporate coding standards" })
      .getByRole("checkbox")
      .check();
    await page.getByRole("button", { name: /^Create collection/ }).click();
    await field(dialog(page), "Name").fill("Security and compliance");
    await field(dialog(page), "Description").fill("dup");
    await expect(
      dialog(page).getByRole("button", { name: "Create" })
    ).toBeDisabled();
  });

  // Regression guard: skill-collection-detail.tsx renders Actions without a skillCollectionsWriteScopes check
  test("hub migrator gets no Edit/Delete actions on collection detail", async ({
    page,
  }) => {
    await gotoProto(page, "/skills/collections/1", { persona: "hubMigrator" });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Java modernization foundation",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actions", exact: true })
    ).toHaveCount(0);
  });
});

test.describe("Skill cross-entity consistency", () => {
  // Regression guard: isSkillInUse ignores collection membership; mock DELETE /skills/:id leaves the skill in mockSkillCollections -> dangling member link
  test("a skill that belongs to a collection cannot be deleted", async ({
    page,
  }) => {
    await openSkills(page);
    await createInlineSkill(page, "Orphan Skill");
    await filterByName(page, "Orphan Skill");
    await dataRows(page).first().getByRole("checkbox").check();
    await page.getByRole("button", { name: /^Create collection/ }).click();
    await field(dialog(page), "Name").fill("Orphan Collection");
    await field(dialog(page), "Description").fill("Holds one skill");
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill collection created")).toBeVisible();

    await filterByName(page, "Orphan Skill");
    await openRowActions(page, "Orphan Skill");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  // Regression guard: Agent.skills / SkillCollection.skills store {id,name}; mock PUT /skills/:id does not cascade the new name
  test("renaming a skill is reflected on agent and collection detail pages", async ({
    page,
  }) => {
    await openSkills(page);
    await filterByName(page, "Spring Boot to Quarkus");
    await openRowActions(page, "Spring Boot to Quarkus migration");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("Spring Boot to Quarkus RENAMED");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill updated")).toBeVisible();
    await spaNavigate(page, "/skills/collections/1");
    await expect(
      page.getByRole("link", { name: "Spring Boot to Quarkus RENAMED" })
    ).toBeVisible();
  });

  // Regression guard: agent-form.tsx maps skills by NAME; the stale name no longer matches any skill so onSubmit silently drops it (Code Migrator 4 -> 3 skills)
  test("saving an unrelated agent edit after a skill rename keeps all its skills", async ({
    page,
  }) => {
    await openSkills(page);
    await filterByName(page, "Spring Boot to Quarkus");
    await openRowActions(page, "Spring Boot to Quarkus migration");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("Spring Boot to Quarkus RENAMED");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill updated")).toBeVisible();

    await spaNavigate(page, "/agents");
    const row = rowByText(page, "Code Migrator");
    await expect(row.getByRole("button", { name: /Code Migrator/ })).toHaveText(
      "4"
    );
    await openRowActions(page, "Code Migrator");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await dialog(page).locator("#agent-description").fill("Unrelated change");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Agent updated")).toBeVisible();
    await expect(row.getByRole("button", { name: /Code Migrator/ })).toHaveText(
      "4"
    );
  });
});
