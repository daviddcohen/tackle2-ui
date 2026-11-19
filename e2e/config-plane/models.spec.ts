/**
 * Administration > Models (pages/agentic/models): list, row actions, the
 * create/edit form and how a rename reaches the Agents list. Route access by
 * persona is covered in navigation/routes.spec.ts.
 */
import type { Page } from "@playwright/test";

import {
  breadcrumb,
  breadcrumbTitles,
  dataRows,
  dialog,
  expect,
  expectHealthy,
  expectTooltipOnHover,
  field,
  gotoProto,
  mainHeading,
  openRowActions,
  pickTypeahead,
  rowActions,
  rowByText,
  spaNavigate,
  test,
  toast,
} from "../support";

const createModel = async (page: Page, name: string, description = "") => {
  await page.getByRole("button", { name: "Create model" }).click();
  await field(dialog(page), "Name").fill(name);
  if (description) await field(dialog(page), "Description").fill(description);
  await pickTypeahead(page, "model-provider-select", /Anthropic Production/);
  await pickTypeahead(page, "model-id-select", "Claude Sonnet 4.6");
  await pickTypeahead(
    page,
    "model-credential-select",
    "Anthropic production credential"
  );
  await dialog(page)
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect(toast(page, "Model created")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
};

test.describe("Models list", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/models", { persona: "platformEngineer" });
    await expect(dataRows(page)).toHaveCount(5);
  });

  test("renders fixture models with default, status and usage", async ({
    page,
    diagnostics,
  }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Models" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Models are the LLMs agents run on. Only verified models can be used by agents."
      )
    ).toBeVisible();
    await expect(page.getByRole("columnheader")).toContainText([
      "Name",
      "Provider",
      "Model ID",
      "Status",
      "Used by",
    ]);
    const claude = rowByText(page, "Claude 3.7 Sonnet");
    await expect(claude).toContainText("Default");
    await expect(claude).toContainText("Verified");
    await expect(claude).toContainText("3 agents");
    const granite = rowByText(page, "Granite Code 20B");
    await expect(granite).toContainText("Unreachable");
    await expect(granite).toContainText(
      "The configured endpoint did not respond within 30 seconds. Check the API endpoint and credential."
    );
    await expect(granite).toContainText("Not used");
    const gemini = rowByText(page, "Gemini 2.5 Pro");
    await expect(gemini).toContainText("Pending");
    await expect(gemini).toContainText(
      "Verification has not been run for this Model. Agents cannot use it until it is verified."
    );
    expectHealthy(diagnostics);
  });

  test("the Default label explains itself on hover and on keyboard focus", async ({
    page,
  }) => {
    const label = rowByText(page, "Claude 3.7 Sonnet").locator(
      '[tabindex="0"]',
      { hasText: /^Default$/ }
    );
    await expectTooltipOnHover(
      page,
      label,
      "New agents start with this model selected."
    );
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await label.focus();
    await expect(page.getByRole("tooltip")).toHaveText(
      "New agents start with this model selected."
    );
  });

  test("Used by opens a popover of agent links that return to Models", async ({
    page,
  }) => {
    const claude = rowByText(page, "Claude 3.7 Sonnet");
    await claude.getByRole("button", { name: "3 agents" }).click();
    const popover = page.getByRole("dialog", { name: "Used by 3 agents" });
    await expect(popover.getByRole("link")).toHaveText([
      "Code Migrator",
      "Migration Proposal Agent",
      "Security Review Agent",
    ]);
    await popover.getByRole("link", { name: "Code Migrator" }).click();
    await expect(mainHeading(page)).toHaveText("Code Migrator");
    expect(await breadcrumbTitles(page)).toEqual(["Models", "Code Migrator"]);
    await breadcrumb(page).getByRole("link", { name: "Models" }).click();
    await expect(page).toHaveURL(/\/models/);
    await expect(dataRows(page)).toHaveCount(5);
  });

  test("default model cannot be deleted or re-set as default", async ({
    page,
  }) => {
    await openRowActions(page, "Claude 3.7 Sonnet");
    await expect(page.getByRole("menuitem")).toHaveText([
      "Edit",
      "Set as default",
      "Delete",
    ]);
    const setDefault = page.getByRole("menuitem", { name: "Set as default" });
    await expect(setDefault).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
    await expectTooltipOnHover(page, setDefault, "Already the default model.");
    await expectTooltipOnHover(
      page,
      page.getByRole("menuitem", { name: "Delete" }),
      "Choose another default model before deleting this one."
    );
  });

  test("a disabled row action says why from the keyboard too", async ({
    page,
  }) => {
    const kebab = rowActions(rowByText(page, "Claude 3.7 Sonnet"));
    await kebab.focus();
    await page.keyboard.press("Enter");
    await expect(kebab).toHaveAttribute("aria-expanded", "true");
    // Arrow keys reach the disabled items right away, and focus shows their
    // reason, not only a hover; screen readers get it as the description.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const setDefault = page.getByRole("menuitem", { name: "Set as default" });
    await expect(setDefault).toBeFocused();
    await expect(setDefault).toHaveAccessibleDescription(
      "Already the default model."
    );
    await expect(
      page
        .getByRole("tooltip")
        .filter({ hasText: "Already the default model." })
    ).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const deleteItem = page.getByRole("menuitem", { name: "Delete" });
    await expect(deleteItem).toBeFocused();
    await expect(deleteItem).toHaveAccessibleDescription(
      "Choose another default model before deleting this one."
    );
    await expect(
      page.getByRole("tooltip").filter({
        hasText: "Choose another default model before deleting this one.",
      })
    ).toBeVisible();
  });

  test("only verified models can be set as default", async ({ page }) => {
    await openRowActions(page, "Gemini 2.5 Pro");
    const setDefault = page.getByRole("menuitem", { name: "Set as default" });
    await expect(setDefault).toBeDisabled();
    await expectTooltipOnHover(
      page,
      setDefault,
      "Only verified models can be the default."
    );
  });

  test("model used by agents cannot be deleted", async ({ page }) => {
    await openRowActions(page, "Llama 3.3 70B");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  // Regression guard: a disabled menu item must be aria-disabled (disabledActionProps); with isDisabled it gets no pointer events and its tooltip never shows
  test("disabled Delete explains why on hover", async ({ page }) => {
    await openRowActions(page, "Llama 3.3 70B");
    await expectTooltipOnHover(
      page,
      page.getByRole("menuitem", { name: "Delete" }),
      "Used by 2 agents. Remove it from those agents before deleting it."
    );
  });

  test("set another model as default moves the label", async ({ page }) => {
    await openRowActions(page, "GPT-4o");
    await page.getByRole("menuitem", { name: "Set as default" }).click();
    await expect(dialog(page)).toContainText("Change the default model?");
    await expect(dialog(page)).toContainText(
      "GPT-4o will replace Claude 3.7 Sonnet as the organization default. New agents start with the default model selected; existing agents keep the model they use."
    );
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(rowByText(page, "Claude 3.7 Sonnet")).toContainText("Default");

    await openRowActions(page, "GPT-4o");
    await page.getByRole("menuitem", { name: "Set as default" }).click();
    await dialog(page).getByRole("button", { name: "Set as default" }).click();
    await expect(toast(page, "Default model updated")).toBeVisible();
    await expect(rowByText(page, "GPT-4o")).toContainText("Default");
    await expect(rowByText(page, "Claude 3.7 Sonnet")).not.toContainText(
      "Default"
    );
  });

  test("delete unused model asks for confirmation and removes the row", async ({
    page,
  }) => {
    await openRowActions(page, "Granite Code 20B");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(dialog(page)).toContainText("Delete model?");
    await expect(dialog(page)).toContainText(
      "Granite Code 20B will be deleted. It can no longer be selected for agents. This action cannot be undone."
    );
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(rowByText(page, "Granite Code 20B")).toHaveCount(1);

    await openRowActions(page, "Granite Code 20B");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page, "Model deleted")).toBeVisible();
    await expect(rowByText(page, "Granite Code 20B")).toHaveCount(0);
  });

  test("name filter narrows rows and shows no-results state", async ({
    page,
  }) => {
    const filter = page.getByPlaceholder(/filter by name/i);
    await filter.fill("Llama");
    await filter.press("Enter");
    await expect(dataRows(page)).toHaveCount(1);
    await filter.fill("zzz-no-match");
    await filter.press("Enter");
    await expect(page.getByText("No results found")).toBeVisible();
  });

  test("sorting by name toggles order", async ({ page }) => {
    const firstCell = dataRows(page).first().locator("td").first();
    await expect(firstCell).toContainText("Claude 3.7 Sonnet");
    await page.getByRole("button", { name: "Name" }).last().click();
    await expect(firstCell).toContainText("Llama 3.3 70B");
  });
});

test.describe("Model form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/models", { persona: "platformEngineer" });
    await expect(dataRows(page)).toHaveCount(5);
    await page.getByRole("button", { name: "Create model" }).click();
  });

  test("required, max length and duplicate name validation", async ({
    page,
  }) => {
    const name = field(dialog(page), "Name");
    const create = dialog(page).getByRole("button", {
      name: "Create",
      exact: true,
    });
    await expect(create).toBeDisabled();
    await name.fill("Claude 3.7 Sonnet");
    await expect(dialog(page)).toContainText(
      "A model with this name already exists."
    );
    await name.fill("x".repeat(121));
    await expect(dialog(page)).toContainText(
      "Name must be at most 120 characters."
    );
    await name.fill("");
    await name.blur();
    await expect(dialog(page)).toContainText("Name is required.");
    await expect(create).toBeDisabled();
  });

  test("model ID options depend on the selected provider", async ({ page }) => {
    // the dialog is named and described by its header
    await expect(
      page.getByRole("dialog", { name: "Create model" })
    ).toHaveAccessibleDescription(
      "Agents can use a model once it is verified. Verification runs after you save."
    );
    await expect(dialog(page)).toContainText(
      "The model provider that hosts this model."
    );
    await expect(dialog(page)).toContainText("Select a provider first.");
    const modelId = page.locator("#model-id-select-input");
    await expect(modelId).toBeDisabled();

    // provider options are sorted and say their type and status
    await page.locator("#model-provider-select-input").click();
    await expect(page.getByRole("option")).toHaveText([
      /Anthropic ProductionAnthropic · Verified/,
      /Azure OpenAI CorpAzure OpenAI · Unreachable/,
      /Google Vertex AIGoogle Vertex AI · Pending/,
      /IBM watsonxOther · Verified/,
      /Internal OllamaOllama · Verified/,
    ]);
    await page.getByRole("option", { name: /Anthropic Production/ }).click();
    await expect(dialog(page)).toContainText(
      "Endpoint: https://api.anthropic.com/v1"
    );
    await expect(dialog(page)).toContainText(
      "Models offered by Anthropic Production."
    );
    await expect(modelId).toBeEnabled();
    await modelId.click();
    await expect(page.getByRole("option")).toHaveText([
      "Claude Opus 5.5 (claude-opus-5-5)",
      "Claude Sonnet 4.6 (claude-sonnet-4-6)",
      "Claude Haiku 4.5 (claude-haiku-4-5)",
    ]);
  });

  test("Escape closes the modal and Cancel discards input", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("Discard me");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Create model" }).click();
    await expect(field(dialog(page), "Name")).toHaveValue("");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test("create succeeds, row appears pending, then verifies", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await createModel(page, "QA Model");
    const row = rowByText(page, "QA Model");
    await expect(row).toContainText("Pending");
    await expect(row).toContainText("claude-sonnet-4-6");
    // mock flips to verified after ~2.5s; the list polls every 3s
    await expect(row).toContainText("Verified", { timeout: 15000 });
  });

  // Regression guard: model-form.tsx onSubmit used to hardcode an empty description
  test("description entered on create is persisted", async ({ page }) => {
    await page.keyboard.press("Escape");
    await createModel(page, "QA Described", "QA description text");
    await openRowActions(page, "QA Described");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(field(dialog(page), "Description")).toHaveValue(
      "QA description text"
    );
  });

  // Regression guard: model-form.tsx 'Clear model when provider changes' effect runs on mount and wipes `model`; Save stays disabled until Model ID is re-picked
  test("editing a model keeps its Model ID (rename-only edit can be saved)", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await createModel(page, "QA Editable");
    await openRowActions(page, "QA Editable");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.locator("#model-id-select-input")).toHaveValue(
      "Claude Sonnet 4.6 (claude-sonnet-4-6)"
    );
    await field(dialog(page), "Name").fill("QA Editable 2");
    await expect(
      dialog(page).getByRole("button", { name: "Save" })
    ).toBeEnabled();
  });

  // Regression guard: Model.provider is a free-text name ('Azure OpenAI') matched by name against Provider records ('Azure OpenAI Corp'); no match -> required provider empty -> rename-only edits cannot be saved
  test("editing a fixture model pre-selects its provider", async ({ page }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "GPT-4o");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("GPT-4o renamed");
    await expect(
      dialog(page).getByRole("button", { name: "Save" })
    ).toBeEnabled();
  });

  test("editing a model in use warns that changes apply to its agents", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "Claude 3.7 Sonnet");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog(page)).toContainText("Edit model");
    await expect(dialog(page)).toContainText(
      "Saving verifies the model again."
    );
    await expect(dialog(page)).toContainText(
      "Used by 3 agents. Changes apply to them."
    );
    await expect(
      dialog(page).getByRole("button", { name: "Save" })
    ).toBeDisabled();
  });

  test("editing an unreachable model shows its status and what to do", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "Granite Code 20B");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog(page)).toContainText("This model is unreachable");
    await expect(dialog(page)).toContainText(
      "The configured endpoint did not respond within 30 seconds. Check the API endpoint and credential, then save to verify it again."
    );
    // not in use, so no in-use sentence
    await expect(dialog(page)).not.toContainText("Used by");
  });

  test("re-selecting the provider while editing keeps the saved Model ID", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "Claude 3.7 Sonnet");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const modelId = dialog(page).locator("#model-id-select-input");
    await expect(modelId).toHaveValue("claude-3-7-sonnet");
    await pickTypeahead(page, "model-provider-select", /Anthropic Production/);
    await expect(modelId).toHaveValue(/claude-3-7-sonnet/);
  });
});

test.describe("Models scenarios and access", () => {
  test("initial scenario shows the empty state", async ({ page }) => {
    await gotoProto(page, "/models", {
      persona: "platformEngineer",
      scenario: "initial",
    });
    await expect(page.getByText("No models yet")).toBeVisible();
    await expect(
      page.getByText("Create a model provider first, then create models here.")
    ).toBeVisible();
    // without a model provider there is nothing to create a model from
    const create = page.getByRole("button", { name: "Create model" });
    await expect(create).toHaveAttribute("aria-disabled", "true");
    await expectTooltipOnHover(page, create, "Create a model provider first.");
    await page.getByRole("link", { name: "Go to model providers" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Model providers" })
    ).toBeVisible();
  });

  test("partial configuration shows every model pending verification", async ({
    page,
  }) => {
    await gotoProto(page, "/models", {
      persona: "platformEngineer",
      scenario: "partialConfiguration",
    });
    await expect(dataRows(page)).toHaveCount(5);
    for (const row of await dataRows(page).all()) {
      await expect(row).toContainText("Pending");
    }
  });

  test("API error scenario shows an error state, not an empty state", async ({
    page,
  }) => {
    await gotoProto(page, "/models", {
      persona: "platformEngineer",
      scenario: "apiError",
    });
    // react-query retries 3x before surfacing the error (~7s)
    await expect(page.getByText("Unable to connect")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("No models yet")).toHaveCount(0);
  });

  test("model rename is reflected on the Agents list", async ({ page }) => {
    await gotoProto(page, "/models", { persona: "platformEngineer" });
    await openRowActions(page, "Llama 3.3 70B");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(dialog(page), "Name").fill("Llama Renamed");
    await pickTypeahead(page, "model-provider-select", /Anthropic Production/);
    await pickTypeahead(page, "model-id-select", "Claude Opus 5.5");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Model updated")).toBeVisible();
    await spaNavigate(page, "/agents");
    await expect(rowByText(page, "Containerization Agent")).toContainText(
      "Llama Renamed"
    );
  });
});
