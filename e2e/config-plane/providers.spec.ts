/**
 * Administration > Model providers (pages/administration/providers).
 */
import {
  dataRows,
  dialog,
  expect,
  expectHealthy,
  expectTooltipOnHover,
  field,
  gotoProto,
  main,
  nextFrames,
  openRowActions,
  rowByText,
  test,
  toast,
} from "../support";

test.describe("Providers list", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/providers", { persona: "platformEngineer" });
    // Every Model references a Provider by id (data-foundation), so the fixtures
    // include one Provider per Model brand.
    await expect(dataRows(page)).toHaveCount(5);
  });

  test("renders fixture providers with type, endpoint and status", async ({
    page,
    diagnostics,
  }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Model providers" })
    ).toBeVisible();
    await expect(
      page.getByText("Model providers host the models that agents use.")
    ).toBeVisible();
    await expect(page.getByRole("columnheader")).toContainText([
      "Name",
      "Type",
      "Endpoint",
      "Status",
      "Used by",
    ]);
    const anthropic = rowByText(page, "Anthropic Production");
    await expect(anthropic).toContainText("Anthropic");
    await expect(anthropic).toContainText("https://api.anthropic.com/v1");
    await expect(anthropic).toContainText("Verified");
    // one model: its name as plain text (models have no page)
    await expect(anthropic).toContainText("Claude 3.7 Sonnet");
    const azure = rowByText(page, "Azure OpenAI Corp");
    await expect(azure).toContainText("Unreachable");
    await expect(azure).toContainText(
      "The configured endpoint did not respond within 30 seconds. Check the API endpoint."
    );
    // a provider's status does not block its models: the server reason as sent, no effect sentence
    const vertex = rowByText(page, "Google Vertex AI");
    await expect(vertex).toContainText("Pending");
    await expect(vertex).toContainText(
      "Credential verification is in progress."
    );
    await expect(vertex).not.toContainText("Agents cannot use it");
    expectHealthy(diagnostics);
  });

  test("filter by verification status", async ({ page }) => {
    await page.getByRole("button", { name: "Name" }).first().click();
    await page.getByRole("menuitem", { name: "Status" }).click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page.getByRole("menuitem", { name: "Unreachable" }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(dataRows(page).first()).toContainText("Azure OpenAI Corp");
  });

  test("deleting an unused provider asks for confirmation and removes the row", async ({
    page,
  }) => {
    await main(page)
      .getByRole("button", { name: "Create model provider" })
      .click();
    await field(dialog(page), "Name").fill("QA Unused");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await field(dialog(page), "API endpoint").press("Enter");
    await expect(rowByText(page, "QA Unused")).toHaveCount(1);
    await expect(rowByText(page, "QA Unused")).toContainText("Not used");
    await openRowActions(page, "QA Unused");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(dialog(page)).toContainText("Delete model provider?");
    await expect(dialog(page)).toContainText(
      "QA Unused will be deleted. This action cannot be undone."
    );
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page, "Model provider deleted")).toBeVisible();
    await expect(rowByText(page, "QA Unused")).toHaveCount(0);
  });

  test("initial scenario shows the empty state", async ({ page }) => {
    await gotoProto(page, "/providers", {
      persona: "platformEngineer",
      scenario: "initial",
    });
    await expect(page.getByText("No model providers yet")).toBeVisible();
    await main(page)
      .getByRole("row")
      .getByRole("button", { name: "Create model provider" })
      .click();
    await expect(dialog(page)).toContainText("Create model provider");
  });

  // Regression guard: providers.tsx Delete has no in-use guard and mock DELETE /providers/:id has no 409; models keep a dangling provider name
  test("a provider referenced by models cannot be deleted", async ({
    page,
  }) => {
    await openRowActions(page, "Anthropic Production");
    await expect(page.getByRole("menuitem")).toHaveText(["Edit", "Delete"]);
    const remove = page.getByRole("menuitem", { name: "Delete" });
    await expect(remove).toBeDisabled();
    await expectTooltipOnHover(
      page,
      remove,
      "Used by 1 model. Move it to another provider or delete it first."
    );
  });
});

test.describe("Provider form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/providers", { persona: "platformEngineer" });
    // Every Model references a Provider by id (data-foundation), so the fixtures
    // include one Provider per Model brand.
    await expect(dataRows(page)).toHaveCount(5);
    await main(page)
      .getByRole("button", { name: "Create model provider" })
      .click();
    await expect(dialog(page)).toContainText("Create model provider");
  });

  test("submit is disabled until name and endpoint are filled", async ({
    page,
  }) => {
    const submit = dialog(page).getByRole("button", {
      name: "Create",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await field(dialog(page), "Name").fill("QA Provider");
    await expect(submit).toBeDisabled();
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await expect(submit).toBeEnabled();
  });

  // Regression guard: provider-form.tsx sets validated='error' whenever the value is empty, so both inputs are red as soon as the modal opens
  test("pristine form does not show fields in error state", async ({
    page,
  }) => {
    await expect(dialog(page).locator("[aria-invalid=true]")).toHaveCount(0);
  });

  test("create adds a pending row and shows a toast", async ({ page }) => {
    await field(dialog(page), "Name").fill("QA Provider");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await dialog(page)
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(toast(page, "Model provider created")).toBeVisible();
    await expect(rowByText(page, "QA Provider")).toContainText("Pending");
  });

  // Regression guard: useFetchProviders has no refetchInterval (models poll every 3s); status stays Pending until the page is revisited
  test("new provider status updates to Verified without a manual refresh", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("QA Polling");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await dialog(page)
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(rowByText(page, "QA Polling")).toContainText("Verified", {
      timeout: 10000,
    });
  });

  // Regression guard: provider-form.tsx uses useState instead of react-hook-form + yup; no duplicateNameCheck
  test("duplicate provider names are rejected", async ({ page }) => {
    await field(dialog(page), "Name").fill("Anthropic Production");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await expect(
      dialog(page).getByRole("button", { name: "Create", exact: true })
    ).toBeDisabled();
  });

  // Regression guard: provider-form.tsx only checks endpoint is non-empty
  test("endpoint must be a valid URL", async ({ page }) => {
    await field(dialog(page), "Name").fill("QA Bad URL");
    await field(dialog(page), "API endpoint").fill("not a url");
    await expect(
      dialog(page).getByRole("button", { name: "Create", exact: true })
    ).toBeDisabled();
  });

  // Regression guard: provider-form.tsx <Form> has no onSubmit and the primary button is not type=submit
  test("Enter in a field submits the form", async ({ page }) => {
    await field(dialog(page), "Name").fill("QA Enter");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await field(dialog(page), "API endpoint").press("Enter");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("Escape inside the open provider type select only closes the select", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("Unsaved");
    await dialog(page).getByRole("button", { name: "Provider type" }).click();
    await page.getByRole("option", { name: "Ollama" }).focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option", { name: "Ollama" })).toHaveCount(0);
    // The modal handles Escape after the select does.
    await nextFrames(page);
    await expect(dialog(page)).toBeVisible();
    await expect(field(dialog(page), "Name")).toHaveValue("Unsaved");
  });

  test("create form says what a provider is and gives the example in helper text", async ({
    page,
  }) => {
    // the dialog is named and described by its header
    await expect(
      page.getByRole("dialog", { name: "Create model provider" })
    ).toHaveAccessibleDescription(
      "A model provider connects to a service that hosts models. It is verified after you save it."
    );
    await expect(dialog(page)).toContainText(
      "For example, https://api.anthropic.com/v1"
    );
    await expect(field(dialog(page), "API endpoint")).toHaveValue("");
  });

  test("editing an unreachable provider shows its status, last verification and models", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "Azure OpenAI Corp");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog(page)).toContainText("Edit model provider");
    await expect(dialog(page)).toContainText(
      "This model provider is unreachable"
    );
    await expect(dialog(page)).toContainText(
      "The configured endpoint did not respond within 30 seconds. Check the API endpoint, then save to verify it again."
    );
    await expect(dialog(page)).toContainText(
      /Last verified .+\. Used by 1 model\. Changes apply to it\./
    );
    // the alert says to save to verify it again, so the description does not
    await expect(
      page.getByRole("dialog", { name: "Edit model provider" })
    ).toHaveAccessibleDescription(
      "A model provider connects to a service that hosts models."
    );
  });

  test("editing a pending provider without a verification date omits it", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "Google Vertex AI");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog(page)).toContainText(
      "This model provider is being verified"
    );
    await expect(dialog(page)).toContainText(
      "Used by 1 model. Changes apply to it."
    );
    await expect(dialog(page)).not.toContainText("Last verified");
  });

  test("editing a verified provider in use warns about its models", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openRowActions(page, "Anthropic Production");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog(page)).toContainText(
      "Used by 1 model. Changes apply to it."
    );
    await expect(dialog(page)).not.toContainText("unreachable");
    // saving moves it to Pending, and no alert says so
    await expect(
      page.getByRole("dialog", { name: "Edit model provider" })
    ).toHaveAccessibleDescription(
      "A model provider connects to a service that hosts models. Saving verifies it again."
    );
  });

  test("Escape closes the modal without creating anything", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("Never saved");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowByText(page, "Never saved")).toHaveCount(0);
  });
});
