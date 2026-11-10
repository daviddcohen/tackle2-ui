/**
 * Agents list, agent form, agent detail, agent test modal.
 */
import type { Page } from "@playwright/test";

import {
  dataRows,
  dialog,
  expect,
  expectHealthy,
  expectTooltipOnHover,
  field,
  gotoProto,
  nextFrames,
  openRowActions,
  pickMulti,
  pickTypeahead,
  rowByText,
  spaNavigate,
  test,
  toast,
} from "../support";

const ARCHITECT = "enterpriseArchitect" as const;

const openCreate = async (page: Page) => {
  await page.getByRole("button", { name: "Create agent" }).click();
  await expect(dialog(page)).toContainText("Create Agent");
};

const fillMinimalAgent = async (page: Page, name: string) => {
  await field(dialog(page), "Name").fill(name);
  await pickTypeahead(page, "gateway-select-toggle", /Claude 3.7 Sonnet/);
};

test.describe("Agents list", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await expect(dataRows(page)).toHaveCount(8);
  });

  test("renders agents with model and skill counts", async ({
    page,
    diagnostics,
  }) => {
    const codeMigrator = rowByText(page, "Code Migrator");
    await expect(codeMigrator).toContainText("Claude 3.7 Sonnet");
    await expect(
      codeMigrator.getByRole("button", { name: /Code Migrator/ })
    ).toHaveText("4");
    expectHealthy(diagnostics);
  });

  test("skill count opens the associated skills modal with links", async ({
    page,
  }) => {
    await rowByText(page, "Code Migrator")
      .getByRole("button", { name: /Code Migrator/ })
      .click();
    await expect(dialog(page).getByRole("link")).toHaveCount(4);
    await dialog(page).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/skills\/\d+/);
  });

  test("agent used by plans cannot be deleted from the list (with reason)", async ({
    page,
  }) => {
    await openRowActions(page, "Migration Proposal Agent");
    const del = page.getByRole("menuitem", { name: "Delete" });
    await expect(del).toHaveAttribute("aria-disabled", "true");
    await expectTooltipOnHover(page, del, "Used by 8 Plans");
  });

  test("unused agent can be deleted after confirmation", async ({ page }) => {
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(dialog(page)).toContainText('Delete Agent "Test Runner"?');
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page, "Agent deleted")).toBeVisible();
    await expect(dataRows(page)).toHaveCount(7);
  });

  test("hub migrator sees agents read-only", async ({ page }) => {
    await gotoProto(page, "/agents", { persona: "hubMigrator" });
    await expect(dataRows(page)).toHaveCount(8);
    await expect(
      page.getByRole("button", { name: "Create agent" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /kebab toggle|row actions/i })
    ).toHaveCount(0);
  });

  test("initial scenario shows the empty state", async ({ page }) => {
    await gotoProto(page, "/agents", {
      persona: ARCHITECT,
      scenario: "initial",
    });
    await expect(page.getByText("No Agents yet")).toBeVisible();
  });
});

test.describe("Agent form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await expect(dataRows(page)).toHaveCount(8);
    await openCreate(page);
  });

  test("name validation: min, duplicate, description max", async ({ page }) => {
    const create = dialog(page).getByRole("button", { name: "Create" });
    await expect(create).toBeDisabled();
    await field(dialog(page), "Name").fill("ab");
    await field(dialog(page), "Name").blur();
    await expect(dialog(page)).toContainText(
      "Name must be at least 3 characters."
    );
    await field(dialog(page), "Name").fill("Code Migrator");
    await expect(dialog(page)).toContainText(
      "An Agent with this name already exists."
    );
    await field(dialog(page), "Name").fill("QA Agent");
    await field(dialog(page), "Description").fill("d".repeat(501));
    await expect(dialog(page)).toContainText(
      "Description must be at most 500 characters."
    );
  });

  test("only verified models are offered", async ({ page }) => {
    await page.locator("#gateway-select-toggle-input").click();
    await expect(page.getByRole("option")).toHaveText([
      // Labels show the Model's Provider record (models reference providers by id).
      "Claude 3.7 Sonnet (Anthropic Production)",
      "GPT-4o (Azure OpenAI Corp)",
      "Llama 3.3 70B (Internal Ollama)",
    ]);
  });

  test("parameter rows require a name", async ({ page }) => {
    await fillMinimalAgent(page, "QA Params");
    await page.getByRole("button", { name: "Add parameter" }).click();
    await expect(
      dialog(page).getByRole("button", { name: "Create" })
    ).toBeDisabled();
    await page.locator("#agent-parameter-0-name").fill("p1");
    await expect(
      dialog(page).getByRole("button", { name: "Create" })
    ).toBeEnabled();
  });

  // Regression guard: agent-form.tsx has no uniqueness test on parameters[].name; detail page then logs a React duplicate-key warning (key={p.name})
  test("duplicate parameter names are rejected", async ({ page }) => {
    await fillMinimalAgent(page, "QA Dup Params");
    await page.getByRole("button", { name: "Add parameter" }).click();
    await page.locator("#agent-parameter-0-name").fill("p1");
    await page.getByRole("button", { name: "Add parameter" }).click();
    await page.locator("#agent-parameter-1-name").fill("p1");
    await expect(
      dialog(page).getByRole("button", { name: "Create" })
    ).toBeDisabled();
  });

  test("create with skills + collection, then detail page reflects it", async ({
    page,
    diagnostics,
  }) => {
    await fillMinimalAgent(page, "QA Agent");
    await field(dialog(page), "Description").fill("QA agent description");
    await pickMulti(page, "skills-select-toggle", [
      "Quarkus best practices",
      "Corporate coding standards",
    ]);
    await pickMulti(page, "skill-collections-select-toggle", [
      "Security and compliance",
    ]);
    await field(dialog(page), "Capabilities").fill("One\nTwo");
    await dialog(page).getByRole("button", { name: "Create" }).click();
    await expect(toast(page, "Agent created")).toBeVisible();
    const row = rowByText(page, "QA Agent");
    await expect(row).toContainText("Claude 3.7 Sonnet");
    await row.getByRole("link", { name: "QA Agent" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "QA Agent" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Quarkus best practices" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Security and compliance" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "This agent is not assigned to any migration plan stage yet."
      )
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  // Regression guard: Escape in MultiSelect/TypeaheadSelect propagates to the PF Modal, which closes and discards the whole form (no dirty-state guard)
  test("pressing Escape inside an open select only closes the select", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("Unsaved work");
    await page.locator("#skills-select-toggle-input").click();
    // after picking an option, focus sits inside the menu
    await page
      .getByRole("menuitem", { name: "Quarkus best practices" })
      .click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#skills-select-toggle-input")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    // The close used to land a frame later, so an immediate check passed.
    await nextFrames(page);
    await expect(dialog(page)).toBeVisible();
    await expect(field(dialog(page), "Name")).toHaveValue("Unsaved work");
  });

  test("Cancel discards input", async ({ page }) => {
    await field(dialog(page), "Name").fill("Discard");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await openCreate(page);
    await expect(field(dialog(page), "Name")).toHaveValue("");
  });
});

test.describe("Agent test modal", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await expect(dataRows(page)).toHaveCount(8);
  });

  test("start a test run and see it on the agent runs tab", async ({
    page,
  }) => {
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Test" }).click();
    await expect(dialog(page)).toContainText("Test Test Runner");
    const start = dialog(page).getByRole("button", { name: "Start test run" });
    await expect(start).toBeDisabled();
    await pickTypeahead(
      page,
      "agent-test-application-select",
      "Customer Management"
    );
    await field(dialog(page), "Task description").fill("Run the unit tests");
    await start.click();
    await expect(toast(page, "Test run for Test Runner queued")).toBeVisible();
    await rowByText(page, "Test Runner").getByRole("link").click();
    await page.getByRole("tab", { name: "Agent runs" }).click();
    const runRow = page.getByRole("row", { name: /Run the unit tests/ });
    await expect(runRow).toContainText("Test");
    await expect(runRow).toContainText("Customer Management");
  });

  // Regression guard: AgentTestModal stays mounted and never resets react-hook-form on close/agent change; previous application + task leak into the next agent's test
  test("re-opening the modal for another agent starts with an empty form", async ({
    page,
  }) => {
    await openRowActions(page, "Build Validator");
    await page.getByRole("menuitem", { name: "Test" }).click();
    await pickTypeahead(
      page,
      "agent-test-application-select",
      "Customer Management"
    );
    await field(dialog(page), "Task description").fill(
      "Task for build validator"
    );
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Test" }).click();
    await expect(field(dialog(page), "Task description")).toHaveValue("");
    await expect(
      page.locator("#agent-test-application-select-input")
    ).toHaveValue("");
  });
});

test.describe("Agent detail", () => {
  test("details tab shows configuration and plans using the agent", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, "/agents/1", { persona: ARCHITECT });
    await expect(
      page.getByRole("heading", { level: 1, name: "Migration Proposal Agent" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
    ).toContainText("Agents");
    await expect(
      page.getByRole("grid", { name: /used in migration plans/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Java EE to Quarkus" })
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("runs tab is deep-linkable", async ({ page }) => {
    await gotoProto(page, "/agents/3?tab=runs", { persona: ARCHITECT });
    await expect(page.getByRole("tab", { name: "Agent runs" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    for (const column of ["Started", "Completed"])
      await expect(
        page.getByRole("columnheader", { name: column })
      ).toBeVisible();
  });

  test("edit from detail updates the title and breadcrumb", async ({
    page,
  }) => {
    await gotoProto(page, "/agents/4", { persona: ARCHITECT });
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("Test Runner Renamed");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Agent updated")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Test Runner Renamed" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
    ).toContainText("Test Runner Renamed");
  });

  // Regression guard: agent-detail.tsx Delete has no in-use guard (list blocks it); mock DELETE succeeds and 8 plans keep a dangling agent ref
  test("agent used by plans cannot be deleted from the detail page", async ({
    page,
  }) => {
    await gotoProto(page, "/agents/1", { persona: ARCHITECT });
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    const del = page.getByRole("menuitem", { name: "Delete" });
    await expect(del).toHaveAttribute("aria-disabled", "true");
  });

  // Regression guard: agent-detail.tsx renders the Actions dropdown without a useHasSomeScopes(agentsWriteScopes) check
  test("hub migrator gets no Edit/Delete actions on the detail page", async ({
    page,
  }) => {
    await gotoProto(page, "/agents/1", { persona: "hubMigrator" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Migration Proposal Agent" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actions", exact: true })
    ).toHaveCount(0);
  });

  // Regression guard: agent-detail.tsx reuses agentic.agent.emptyTitle ('No Agents yet' / 'Create an Agent...') for 404 and 503 alike
  test("unknown agent id shows a not-found message (not the list empty state)", async ({
    page,
  }) => {
    await gotoProto(page, "/agents/99999", { persona: ARCHITECT });
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("No Agents yet")).toHaveCount(0);
  });

  // Regression guard: agent-detail.tsx casts searchParams.get('tab') without validation; ?tab=foo renders no tab content (skill-detail validates)
  test("invalid ?tab value falls back to the details tab", async ({ page }) => {
    await gotoProto(page, "/agents/1?tab=foo", { persona: ARCHITECT });
    await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});

test.describe("Agent cross-entity consistency", () => {
  // Regression guard: mock DELETE /agents/:id does not clean Skill.associations (synchronizeAgentSkills is not called); the skill still lists the deleted agent and stays undeletable
  test("deleting an agent removes it from skill associations", async ({
    page,
  }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page, "Agent deleted")).toBeVisible();
    await spaNavigate(page, "/skills");
    await expect(rowByText(page, "Database migration patterns")).toBeVisible();
    await expect(
      rowByText(page, "Database migration patterns")
    ).not.toContainText("Test Runner");
  });

  // Regression guard: agent-form.tsx keys model by name and filters to verified; renamed (and now pending) model is not an option, field looks empty, Save is enabled but onSubmit returns silently (`if (!matchedModel) return`)
  test("editing an agent after its model was renamed still saves", async ({
    page,
  }) => {
    await gotoProto(page, "/models", { persona: "platformEngineer" });
    await openRowActions(page, "Llama 3.3 70B");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("Llama Renamed");
    await pickTypeahead(page, "model-provider-select", /Anthropic Production/);
    await pickTypeahead(page, "model-id-select", "Claude Opus 5.5");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Model updated")).toBeVisible();
    await spaNavigate(page, "/agents");
    await openRowActions(page, "Containerization Agent");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await dialog(page).locator("#agent-description").fill("Changed");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Agent updated")).toBeVisible();
  });
});
