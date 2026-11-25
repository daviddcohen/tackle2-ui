/**
 * Agents list, agent form, agent detail, agent test modal.
 */
import type { Page } from "@playwright/test";

import {
  appPath,
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
  await expect(dialog(page)).toContainText("Create agent");
};

const fillMinimalAgent = async (page: Page, name: string) => {
  await field(dialog(page), "Name").fill(name);
  await pickTypeahead(page, "gateway-select-toggle", /Claude 3.7 Sonnet/);
};

test.describe("Agents list", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await expect(dataRows(page)).toHaveCount(9);
  });

  test("renders agents with model and skills summary", async ({
    page,
    diagnostics,
  }) => {
    const securityReview = rowByText(page, "Security Review Agent");
    await expect(securityReview).toContainText("Claude 3.7 Sonnet");
    await expect(
      securityReview.getByRole("link", { name: "2 skills, 1 collection" })
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("skills summary opens the agent; a single skill opens the skill", async ({
    page,
  }) => {
    await rowByText(page, "Test Runner")
      .getByRole("link", { name: "Database migration patterns" })
      .click();
    await expect(page).toHaveURL(/\/skills\/\d+/);
    await page.goBack();
    await rowByText(page, "Security Review Agent")
      .getByRole("link", { name: "2 skills, 1 collection" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Security Review Agent" })
    ).toBeVisible();
  });

  test("agent used by plans cannot be deleted from the list (with reason)", async ({
    page,
  }) => {
    await openRowActions(page, "Migration Proposal Agent");
    const del = page.getByRole("menuitem", { name: "Delete" });
    await expect(del).toHaveAttribute("aria-disabled", "true");
    await expectTooltipOnHover(page, del, "Used by 8 migration plans");
  });

  test("unused agent can be deleted after confirmation", async ({ page }) => {
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(dialog(page)).toContainText("Delete agent?");
    await expect(dialog(page)).toContainText(
      "Test Runner will be deleted. It can no longer be assigned to migration plan stages. This action cannot be undone."
    );
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page, "Agent deleted")).toBeVisible();
    await expect(dataRows(page)).toHaveCount(8);
  });

  test("hub migrator sees agents read-only", async ({ page }) => {
    await gotoProto(page, "/agents", { persona: "hubMigrator" });
    await expect(dataRows(page)).toHaveCount(9);
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
    await expect(page.getByText("No agents yet")).toBeVisible();
  });
});

test.describe("Agent form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await expect(dataRows(page)).toHaveCount(9);
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
      "An agent with this name already exists."
    );
    await field(dialog(page), "Name").fill("QA Agent");
    await field(dialog(page), "Description").fill("d".repeat(501));
    await expect(dialog(page)).toContainText(
      "Description must be at most 500 characters."
    );
  });

  test("only verified models are offered, the default preselected", async ({
    page,
  }) => {
    const input = page.locator("#gateway-select-toggle-input");
    await expect(input).toHaveValue("Claude 3.7 Sonnet (Anthropic Production)");
    await input.click();
    await expect(page.getByRole("option")).toHaveText([
      // Labels show the Model's Provider record (models reference providers by id);
      // the organization default is marked with the option description.
      /Claude 3\.7 Sonnet \(Anthropic Production\)\s*Default$/,
      /GPT-4o \(Azure OpenAI Corp\)$/,
      /Llama 3\.3 70B \(Internal Ollama\)$/,
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
      page.getByText("This agent is not used in any migration plan yet.")
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

test("with no verified model, Model is disabled and points to the models", async ({
  page,
}) => {
  await gotoProto(page, "/agents", {
    persona: "platformEngineer",
    scenario: "partialConfiguration",
  });
  await openCreate(page);
  await expect(page.locator("#gateway-select-toggle-input")).toBeDisabled();
  await expect(dialog(page)).toContainText(
    "No verified models yet. Agents can use a model once it is verified."
  );
  await dialog(page).getByRole("link", { name: "Go to models" }).click();
  await expect(page).toHaveURL(/\/models/);
});

test.describe("Agent test modal", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/agents", { persona: ARCHITECT });
    await expect(dataRows(page)).toHaveCount(9);
  });

  test("start a test run and see it on the agent runs tab", async ({
    page,
  }) => {
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Test agent" }).click();
    await expect(dialog(page)).toContainText("Test agent");
    await expect(dialog(page)).toContainText(
      "Runs Test Runner once on one application. Results are for review only; the repository is not changed."
    );
    const start = dialog(page).getByRole("button", { name: "Start test run" });
    await expect(start).toBeDisabled();
    await pickTypeahead(
      page,
      "agent-test-application-select",
      "Customer Management"
    );
    await field(dialog(page), "Task").fill("Run the unit tests");
    // The agent's own skill is listed but cannot be added again.
    await page.locator("#agent-test-added-skills-input").click();
    await expect(
      page.getByRole("menuitem", { name: /Database migration patterns/ })
    ).toContainText("Already included: the agent has this skill");
    await expect(
      page.getByRole("menuitem", { name: /Spring Boot 3 upgrade/ })
    ).toContainText("Available when needed");
    await page.getByRole("menuitem", { name: /Spring Boot 3 upgrade/ }).click();
    // Close the menu by clicking outside it (Escape would close the modal).
    await dialog(page).getByRole("heading", { name: "Test agent" }).click();
    await start.click();
    await expect(toast(page, "Test run for Test Runner queued")).toBeVisible();
    await page
      .locator(".pf-v6-c-alert-group")
      .getByRole("link", { name: "View runs" })
      .click();
    // The prototype bar may reorder the query, so check the parts.
    await expect(page).toHaveURL(
      (url) =>
        appPath(url.pathname) === "/agents/4" &&
        url.searchParams.get("tab") === "runs"
    );
    await expect(page.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Test runs are their own section, so the row needs no type label.
    const runRow = page
      .getByRole("grid", { name: "Test runs" })
      .getByRole("row", { name: /Run the unit tests/ });
    await expect(runRow).toContainText("Customer Management");
    await expect(
      runRow.getByRole("link", { name: "Spring Boot 3 upgrade" })
    ).toBeVisible();
  });

  // Regression guard: AgentTestModal stays mounted and never resets react-hook-form on close/agent change; previous application + task leak into the next agent's test
  test("re-opening the modal for another agent starts with an empty form", async ({
    page,
  }) => {
    await openRowActions(page, "Build Validator");
    await page.getByRole("menuitem", { name: "Test agent" }).click();
    await pickTypeahead(
      page,
      "agent-test-application-select",
      "Customer Management"
    );
    await field(dialog(page), "Task").fill("Task for build validator");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await openRowActions(page, "Test Runner");
    await page.getByRole("menuitem", { name: "Test agent" }).click();
    await expect(field(dialog(page), "Task")).toHaveValue("");
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
    await expect(page.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(
      page.getByRole("heading", { name: /^Migration plan stages/ })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Test runs/ })
    ).toBeVisible();
    const stages = page.getByRole("grid", { name: "Migration plan stages" });
    for (const column of ["Run", "Stage", "Status", "Started", "Duration"])
      await expect(
        stages.getByRole("columnheader", { name: column, exact: true })
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
    await expect(page.getByText("No agents yet")).toHaveCount(0);
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
