/**
 * Skills list, skill form (inline/git/oci), import modal, skill detail,
 * skill collections (create, detail), cross-entity effects.
 */
import type { Page } from "@playwright/test";

import {
  agenticGet,
  dataRows,
  dialog,
  expect,
  expectHealthy,
  field,
  filterByName,
  gotoProto,
  main,
  openRowActions,
  pickMulti,
  pickTypeahead,
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
  await field(dialog(page), "Content").fill(`# ${name}\nGuidance.`);
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(toast(page, "Skill created")).toBeVisible();
};

const sourceButton = (page: Page, name: "Inline" | "Git" | "OCI image") =>
  dialog(page).getByRole("button", { name, exact: true });

test.describe("Skills list", () => {
  test.beforeEach(async ({ page }) => openSkills(page));

  test("lists skills on the Skills tab, paginated", async ({
    page,
    diagnostics,
  }) => {
    await expect(page.getByRole("tab", { name: "Skills" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(
      page.getByRole("button", { name: /1 - 10 of 16/ }).first()
    ).toBeVisible();
    await expect(rowByText(page, "Corporate coding standards")).toContainText(
      "Inline"
    );
    await expect(
      dataRows(page).filter({ hasText: "Java modernization foundation" })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Go to next page" }).first().click();
    await expect(dataRows(page)).toHaveCount(6);
    expectHealthy(diagnostics);
  });

  test("source filter shows only Git skills", async ({ page }) => {
    await page.getByRole("button", { name: "Name" }).first().click();
    await page.getByRole("menuitem", { name: "Source", exact: true }).click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page.getByRole("menuitem", { name: "Git" }).click();
    await expect(dataRows(page).first()).toBeVisible();
    for (const row of await dataRows(page).all())
      await expect(row).toContainText("Git");
  });

  test("Skill collections tab lists the collections and keeps the tab in the URL", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await expect(page).toHaveURL(/tab=collections/);
    await expect(dataRows(page)).toHaveCount(4);
    const foundation = rowByText(page, "Java modernization foundation");
    await expect(foundation).toContainText("3 skills");
    await expect(foundation).toContainText("Java Code Migrator");
    await expect(rowByText(page, "OpenShift delivery checks")).toContainText(
      "Build Validator"
    );
  });

  test("usage summary links to the skill's Usage tab", async ({ page }) => {
    const row = rowByText(page, "Build validation standards");
    // A rule carries the marker after its name.
    await expect(row.getByText("Always followed")).toBeVisible();
    await row
      .getByRole("link", {
        name: "1 agent, 1 collection, 1 archetype, 1 application",
      })
      .click();
    await expect(page).toHaveURL(/\/skills\/\d+\?tab=usage/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Build validation standards",
      })
    ).toBeVisible();
  });

  test("skills in use cannot be deleted from the list", async ({ page }) => {
    await openRowActions(page, "Build validation standards");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  test("collections in use cannot be deleted from the list", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await openRowActions(page, "Java modernization foundation");
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  // Regression guard: translation agentic.skill.collectionContents has no _one/_other variants ('1 skills')
  test("a collection with one skill names it instead of counting", async ({
    page,
  }) => {
    await filterByName(page, "zzz");
    await createInlineSkill(page, "Single Member");
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await page.getByRole("button", { name: "Create skill collection" }).click();
    await field(dialog(page), "Name").fill("Single Pack");
    await pickMulti(page, "skill-collection-skills-select", ["Single Member"]);
    // Close the skills menu so it does not cover the footer buttons.
    await field(dialog(page), "Name").click();
    await field(dialog(page), "Description").fill("One skill");
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill collection created")).toBeVisible();
    await filterByName(page, "Single Pack");
    await expect(
      rowByText(page, "Single Pack").getByRole("link", {
        name: "Single Member",
      })
    ).toBeVisible();
    await expect(rowByText(page, "Single Pack")).not.toContainText("1 skills");
  });

  test("hub migrator gets no create/import/edit actions", async ({ page }) => {
    await openSkills(page, "hubMigrator");
    await expect(
      page.getByRole("button", { name: "Create skill" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Skill actions" })
    ).toHaveCount(0);
    await expect(
      rowByText(page, "Corporate coding standards").getByRole("button", {
        name: /kebab toggle|row actions/i,
      })
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await expect(
      page.getByRole("button", { name: "Create skill collection" })
    ).toHaveCount(0);
    await expect(
      rowByText(page, "Security and compliance").getByRole("button", {
        name: /kebab toggle|row actions/i,
      })
    ).toHaveCount(0);
  });

  test("initial scenario shows the empty states", async ({ page }) => {
    await gotoProto(page, "/skills", {
      persona: ARCHITECT,
      scenario: "initial",
    });
    await expect(page.getByText("No skills yet")).toBeVisible();
    await expect(
      main(page).getByRole("button", { name: "Import skill file" })
    ).toBeVisible();
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await expect(page.getByText("No skill collections yet")).toBeVisible();
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
    await expect(field(dialog(page), "Content")).toBeVisible();
    await expect(create).toBeDisabled();

    await sourceButton(page, "Git").click();
    await expect(field(dialog(page), "Content")).toHaveCount(0);
    await expect(field(dialog(page), "Branch")).toHaveValue("main");
    await expect(field(dialog(page), "Path")).toHaveValue("/");
    await expect(create).toBeDisabled();
    await field(dialog(page), "Repository URL").fill(
      "https://github.com/org/skills.git"
    );
    await expect(create).toBeEnabled();

    await sourceButton(page, "OCI image").click();
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
    await expect(field(dialog(page), "Content")).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("created inline skill attached to an agent is offered in the agent form", async ({
    page,
  }) => {
    await field(dialog(page), "Content").fill("# QA Skill\nGuidance.");
    // The Usage fields are always visible.
    await pickMulti(page, "skill-agents", ["Test Runner"]);
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill created")).toBeVisible();
    await filterByName(page, "QA Skill");
    await expect(rowByText(page, "QA Skill")).toContainText("1 agent");

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
    await page.getByRole("button", { name: "Skill actions" }).click();
    await page.getByRole("menuitem", { name: "Import skill file" }).click();
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
    await expect(toast(page, "Skill imported")).toBeVisible();
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
    await expect(toast(page, "Skill imported")).toBeVisible();
    await filterByName(page, "Corporate coding standards");
    await expect(dataRows(page)).toHaveCount(2);
  });
});

test.describe("Skill detail", () => {
  test("Test with an agent starts a test run with the skill added", async ({
    page,
  }) => {
    await gotoProto(page, "/skills/16", { persona: ARCHITECT });
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Edit",
      "Test with an agent",
      "Delete",
    ]);
    await page.getByRole("menuitem", { name: "Test with an agent" }).click();
    await expect(dialog(page)).toContainText(
      "Runs an agent once on one application with Spring Boot 3 upgrade added to its skills."
    );
    await expect(
      dialog(page).getByRole("button", { name: "Remove Spring Boot 3 upgrade" })
    ).toBeVisible();
    await pickTypeahead(page, "agent-test-agent-select", "Code Migrator");
    await pickTypeahead(
      page,
      "agent-test-application-select",
      "Customer Management"
    );
    await field(dialog(page), "Task").fill("Upgrade the web layer");
    await dialog(page).getByRole("button", { name: "Start test run" }).click();
    await expect(
      toast(page, "Test run for Code Migrator queued")
    ).toBeVisible();
    await page
      .locator(".pf-v6-c-alert-group")
      .getByRole("link", { name: "View runs" })
      .click();
    const runRow = page
      .getByRole("grid", { name: "Test runs" })
      .getByRole("row", { name: /Upgrade the web layer/ });
    await expect(
      runRow.getByRole("link", { name: "Spring Boot 3 upgrade" })
    ).toBeVisible();
  });

  test("details and usage tabs render", async ({ page, diagnostics }) => {
    await gotoProto(page, "/skills/1", { persona: ARCHITECT });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Spring Boot to Quarkus migration",
      })
    ).toBeVisible();
    await expect(main(page).getByText("Inline", { exact: true })).toBeVisible();
    await expect(
      main(page).getByRole("heading", { level: 2, name: "Content" })
    ).toBeVisible();
    // The skill's own "# Spring Boot to Quarkus Migration" is not a second page title.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(main(page).getByText("Available when needed")).toBeVisible();
    // The Usage fact opens the Usage tab.
    await main(page)
      .getByRole("link", {
        name: "1 collection, 1 target profile",
      })
      .click();
    await expect(page).toHaveURL(/tab=usage/);
    await expect(
      page.getByRole("tab", { name: "Usage", selected: true })
    ).toBeVisible();
    const attachedTo = main(page).getByRole("region", {
      name: /^Attached to/,
    });
    await expect(
      attachedTo.getByRole("link", {
        name: "Quarkus 3.x (Spring Boot Application)",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("grid", { name: /collections/i })
    ).toContainText("Java modernization foundation");
    expectHealthy(diagnostics);
  });

  test("target profiles with the same name are told apart by archetype", async ({
    page,
  }) => {
    // Quarkus best practices: on the Quarkus 3.x profiles of two archetypes.
    await gotoProto(page, "/skills/4?tab=usage", { persona: ARCHITECT });
    const grid = main(page).getByRole("region", { name: /^Attached to/ });
    await expect(
      grid.getByRole("link", { name: /^Quarkus 3\.x \(/ })
    ).toHaveCount(2);
    await expect(
      grid.getByRole("link", {
        name: "Quarkus 3.x (Spring Boot Application)",
      })
    ).toBeVisible();
    await expect(
      grid.getByRole("link", {
        name: "Quarkus 3.x (Java EE Application)",
      })
    ).toBeVisible();
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

test.describe("Skill content headings", () => {
  test("keep their levels under the Content section but are no larger than it", async ({
    page,
  }) => {
    await gotoProto(page, "/skills", { persona: ARCHITECT });
    const skills = await agenticGet<
      { id: string; name: string; content?: string }[]
    >(page, "/skills");
    const withHeading = skills.find((skill) =>
      /^# /m.test(skill.content ?? "")
    );
    expect(
      withHeading,
      "a seeded skill whose content has a # heading"
    ).toBeDefined();
    await gotoProto(page, `/skills/${withHeading!.id}`, { persona: ARCHITECT });
    await expect(
      main(page).getByRole("heading", { level: 2, name: "Content" })
    ).toBeVisible();
    // The Markdown's "#" is an h3 below the h2 section heading.
    const headings = main(page).getByRole("heading", { level: 3 });
    await expect(headings.first()).toBeVisible();
    const sizes = await main(page)
      .locator("h3, h4, h5, h6")
      .evaluateAll((elements) =>
        elements.map((element) =>
          ["pf-m-2xl", "pf-m-xl", "pf-m-3xl", "pf-m-4xl"].some((size) =>
            element.classList.contains(size)
          )
        )
      );
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every((isLarger) => !isLarger)).toBe(true);
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
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await page.getByRole("button", { name: "Create skill collection" }).click();
    await field(dialog(page), "Name").fill("Security and compliance");
    await pickMulti(page, "skill-collection-skills-select", [
      "Corporate coding standards",
    ]);
    // Close the skills menu so it does not cover the footer buttons.
    await field(dialog(page), "Name").click();
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
    await page.getByRole("tab", { name: "Skill collections" }).click();
    await page.getByRole("button", { name: "Create skill collection" }).click();
    await field(dialog(page), "Name").fill("Orphan Collection");
    await pickMulti(page, "skill-collection-skills-select", ["Orphan Skill"]);
    // Close the skills menu so it does not cover the footer buttons.
    await field(dialog(page), "Name").click();
    await field(dialog(page), "Description").fill("Holds one skill");
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Skill collection created")).toBeVisible();

    await page.getByRole("tab", { name: "Skills" }).click();
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

  // Regression guard: agent-form.tsx maps skills by NAME; the stale name no longer matches any skill so onSubmit silently drops it (Security Review Agent 2 -> 1 skills)
  test("saving an unrelated agent edit after a skill rename keeps all its skills", async ({
    page,
  }) => {
    await openSkills(page);
    await filterByName(page, "Platform security baseline");
    await openRowActions(page, "Platform security baseline");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("Platform security RENAMED");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill updated")).toBeVisible();

    await spaNavigate(page, "/agents");
    const row = rowByText(page, "Security Review Agent");
    // The Skills cell summarizes what the agent uses: its 2 skills
    // and 1 collection.
    const skillsSummary = row.getByRole("link", { name: /^\d+ skills?\b/ });
    await expect(skillsSummary).toHaveText("2 skills, 1 collection");
    await openRowActions(page, "Security Review Agent");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await dialog(page).locator("#agent-description").fill("Unrelated change");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Agent updated")).toBeVisible();
    await expect(skillsSummary).toHaveText("2 skills, 1 collection");
  });
});
