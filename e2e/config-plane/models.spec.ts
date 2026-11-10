/**
 * Administration > Models (pages/agentic/models): list, row actions, the
 * create/edit form and how a rename reaches the Agents list. Route access by
 * persona is covered in navigation/routes.spec.ts.
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
  openRowActions,
  pickTypeahead,
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
    const claude = rowByText(page, "Claude 3.7 Sonnet");
    await expect(claude).toContainText("Default Model");
    await expect(claude).toContainText("Verified");
    await expect(claude).toContainText("3 Agents");
    await expect(rowByText(page, "Granite Code 20B")).toContainText(
      "Unreachable"
    );
    await expect(rowByText(page, "Gemini 2.5 Pro")).toContainText("Pending");
    expectHealthy(diagnostics);
  });

  test("default model cannot be deleted or re-set as default", async ({
    page,
  }) => {
    await openRowActions(page, "Claude 3.7 Sonnet");
    await expect(
      page.getByRole("menuitem", { name: "Set as Default" })
    ).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
  });

  test("model used by agents cannot be deleted", async ({ page }) => {
    await openRowActions(page, "Llama 3.3 70B");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  // Regression guard: models.tsx uses isDisabled + tooltipProps; disabled menu items get no pointer events so the tooltip never shows (agents.tsx uses isAriaDisabled correctly)
  test("disabled Delete explains why on hover", async ({ page }) => {
    await openRowActions(page, "Llama 3.3 70B");
    await expectTooltipOnHover(
      page,
      page.getByRole("menuitem", { name: "Delete" }),
      "Remove this Model from its Agents"
    );
  });

  test("set another model as default moves the label", async ({ page }) => {
    await openRowActions(page, "GPT-4o");
    await page.getByRole("menuitem", { name: "Set as Default" }).click();
    await expect(toast(page, /default/i)).toBeVisible();
    await expect(rowByText(page, "GPT-4o")).toContainText("Default Model");
    await expect(rowByText(page, "Claude 3.7 Sonnet")).not.toContainText(
      "Default Model"
    );
  });

  test("delete unused model asks for confirmation and removes the row", async ({
    page,
  }) => {
    await openRowActions(page, "Granite Code 20B");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(dialog(page)).toContainText(
      'Delete Model "Granite Code 20B"?'
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
      "A Model with this name already exists."
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
    await expect(dialog(page)).toContainText("Select a Provider first");
    await pickTypeahead(page, "model-provider-select", /Anthropic Production/);
    await page.locator("#model-id-select-input").click();
    await expect(page.getByRole("option")).toHaveText([
      "Claude Opus 5.5",
      "Claude Sonnet 4.6",
      "Claude Haiku 4.5",
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
      "Claude Sonnet 4.6"
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
    await expect(page.getByText("No Models configured")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create model" })
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
    await expect(page.getByText("No Models configured")).toHaveCount(0);
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
