/**
 * Administration > Providers (pages/administration/providers).
 */
import {
  dataRows,
  dialog,
  expect,
  expectHealthy,
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
      page.getByRole("heading", { level: 1, name: "Providers" })
    ).toBeVisible();
    const anthropic = rowByText(page, "Anthropic Production");
    await expect(anthropic).toContainText("Anthropic");
    await expect(anthropic).toContainText("https://api.anthropic.com/v1");
    await expect(anthropic).toContainText("Verified");
    const azure = rowByText(page, "Azure OpenAI Corp");
    await expect(azure).toContainText("Unreachable");
    await expect(azure).toContainText("did not respond within 30 seconds");
    expectHealthy(diagnostics);
  });

  test("filter by verification status", async ({ page }) => {
    await page.getByRole("button", { name: "Name" }).first().click();
    await page.getByRole("menuitem", { name: "Verification status" }).click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page.getByRole("menuitem", { name: "Unreachable" }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(dataRows(page).first()).toContainText("Azure OpenAI Corp");
  });

  test("deleting an unused provider asks for confirmation and removes the row", async ({
    page,
  }) => {
    await main(page).getByRole("button", { name: "Add provider" }).click();
    await field(dialog(page), "Name").fill("QA Unused");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await dialog(page).getByRole("button", { name: "Add provider" }).click();
    await expect(rowByText(page, "QA Unused")).toHaveCount(1);
    await openRowActions(page, "QA Unused");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(dialog(page)).toContainText('Delete provider "QA Unused"?');
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(rowByText(page, "QA Unused")).toHaveCount(0);
  });

  test("initial scenario shows the empty state", async ({ page }) => {
    await gotoProto(page, "/providers", {
      persona: "platformEngineer",
      scenario: "initial",
    });
    await expect(page.getByText("No providers configured")).toBeVisible();
  });

  // Regression guard: providers.tsx Delete has no in-use guard and mock DELETE /providers/:id has no 409; models keep a dangling provider name
  test("a provider referenced by models cannot be deleted", async ({
    page,
  }) => {
    await openRowActions(page, "Anthropic Production");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });
});

test.describe("Provider form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoProto(page, "/providers", { persona: "platformEngineer" });
    // Every Model references a Provider by id (data-foundation), so the fixtures
    // include one Provider per Model brand.
    await expect(dataRows(page)).toHaveCount(5);
    await main(page).getByRole("button", { name: "Add provider" }).click();
    await expect(dialog(page)).toContainText("Add provider");
  });

  test("submit is disabled until name and endpoint are filled", async ({
    page,
  }) => {
    const submit = dialog(page).getByRole("button", { name: "Add provider" });
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
    await dialog(page).getByRole("button", { name: "Add provider" }).click();
    await expect(toast(page, "Provider added")).toBeVisible();
    await expect(rowByText(page, "QA Provider")).toContainText("Pending");
  });

  // Regression guard: useFetchProviders has no refetchInterval (models poll every 3s); status stays Pending until the page is revisited
  test("new provider status updates to Verified without a manual refresh", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("QA Polling");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await dialog(page).getByRole("button", { name: "Add provider" }).click();
    await expect(rowByText(page, "QA Polling")).toContainText("Verified", {
      timeout: 10000,
    });
  });

  // Regression guard: provider-form.tsx uses useState instead of react-hook-form + yup; no duplicateNameCheck
  test("duplicate provider names are rejected", async ({ page }) => {
    await field(dialog(page), "Name").fill("Anthropic Production");
    await field(dialog(page), "API endpoint").fill("https://qa.example.com/v1");
    await expect(
      dialog(page).getByRole("button", { name: "Add provider" })
    ).toBeDisabled();
  });

  // Regression guard: provider-form.tsx only checks endpoint is non-empty
  test("endpoint must be a valid URL", async ({ page }) => {
    await field(dialog(page), "Name").fill("QA Bad URL");
    await field(dialog(page), "API endpoint").fill("not a url");
    await expect(
      dialog(page).getByRole("button", { name: "Add provider" })
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

  test("Escape closes the modal without creating anything", async ({
    page,
  }) => {
    await field(dialog(page), "Name").fill("Never saved");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowByText(page, "Never saved")).toHaveCount(0);
  });
});
