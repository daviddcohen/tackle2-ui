/**
 * Upstream (non-agentic) Konveyor features that the prototype touched.
 * Runs under MOCK=stub: only applications, archetypes, assessments,
 * questionnaires and a few prototype-support endpoints are stubbed, so pages
 * backed by other Hub endpoints are checked for "renders without crashing".
 */
import {
  errorBoundary,
  expect,
  main,
  mainHeading,
  protoUrl,
  test,
} from "../support";

test.describe("Application inventory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(protoUrl("/applications"));
    await expect(mainHeading(page)).toHaveText("Application inventory");
    await expect(
      main(page).getByRole("link", { name: "Customer Management", exact: true })
    ).toBeVisible();
  });

  test("Create New opens the application form", async ({ page }) => {
    await main(page).getByRole("button", { name: "Create New" }).click();
    const dialog = page.getByRole("dialog", { name: "New application" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("the application form finishes loading", async ({ page }) => {
    await main(page).getByRole("button", { name: "Create New" }).click();
    const dialog = page.getByRole("dialog", { name: "New application" });
    await expect(dialog.getByRole("textbox", { name: /Name/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("filter toolbar keeps every upstream category and filters by name", async ({
    page,
  }) => {
    // The first "Name" button in the toolbar is the filter-category toggle.
    await main(page)
      .getByRole("button", { name: "Name", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Migration", exact: true })
    ).toBeVisible();
    const categories = await page.getByRole("menuitem").allInnerTexts();
    for (const upstreamCategory of [
      "Name",
      "Archetypes",
      "Source platforms",
      "Business service",
      "Credential type",
      "Repository type",
      "Artifact",
      "Tags",
      "Risk",
      "Analysis",
    ])
      expect(categories).toContain(upstreamCategory);
    await page.keyboard.press("Escape");
    // Upstream's Name filter is a typeahead multiselect of application names.
    await main(page)
      .getByRole("combobox", { name: "Type to filter" })
      .fill("Customer");
    await page
      .getByRole("listbox")
      .getByRole("menuitem", { name: "Customer Management" })
      .click();
    await expect(page).toHaveURL(/filters=/);
    await expect(
      main(page).getByRole("link", { name: "Customer Management", exact: true })
    ).toBeVisible();
    await expect(
      main(page).getByRole("link", { name: "Order Service", exact: true })
    ).toHaveCount(0);
  });

  test("Manage columns lists every upstream column and can re-enable a hidden one", async ({
    page,
  }) => {
    await main(page).getByRole("button", { name: "Manage Columns" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Manage Columns" })
    ).toBeVisible();
    const columns = [
      "Name",
      "Business Service",
      "Assessment",
      "Review",
      "Analysis",
      "Migration",
      "Tags",
      "Effort",
    ];
    for (const column of columns)
      await expect(dialog.getByText(column, { exact: true })).toBeVisible();
    // Upstream gap: the column checkboxes have no accessible label, so select by position.
    await dialog
      .getByRole("checkbox")
      .nth(columns.indexOf("Business Service"))
      .check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      main(page).getByRole("columnheader", { name: "Business Service" })
    ).toBeVisible();
  });

  test("upstream default columns are visible without opening Manage columns", async ({
    page,
  }) => {
    // Known open issue (see e2e/README.md "Known open issues"): product
    // decision pending on the 5 upstream columns the prototype hides by
    // default. Restore them (and drop this marker) or delete the test.
    test.fail(true, "upstream inventory columns hidden by default");
    for (const column of [
      "Business Service",
      "Assessment",
      "Review",
      "Tags",
      "Effort",
    ])
      await expect(
        main(page).getByRole("columnheader", { name: column })
      ).toBeVisible();
  });

  test("Analyze opens the analysis wizard for the selected application", async ({
    page,
  }) => {
    await page
      .getByRole("row", { name: /Customer Management/ })
      .getByRole("checkbox")
      .check();
    await main(page).locator("#analyze-application").click();
    const wizard = page.getByRole("dialog", { name: /Application analysis/ });
    await expect(wizard).toBeVisible();
    await expect(wizard.getByText("Customer Management")).toBeVisible();
  });

  test("upstream Analyze toolbar button (#analyze-application) is still available", async ({
    page,
  }) => {
    await expect(page.locator("#analyze-application")).toBeVisible();
    await expect(page.locator("#analyze-application")).toBeDisabled();
  });

  test("row kebab keeps the upstream actions and Review opens the review page", async ({
    page,
  }) => {
    const row = page.getByRole("row", { name: /Customer Management/ });
    await row.getByRole("button").last().click();
    const items = await page.getByRole("menuitem").allInnerTexts();
    for (const action of [
      "Assess",
      "Review",
      "Manage dependencies",
      "Manage credentials",
      "Retrieve configurations",
      "Generate assets",
      "Delete",
    ])
      expect(items).toContain(action);
    await page.getByRole("menuitem", { name: "Review" }).click();
    await expect(page).toHaveURL(/\/applications\/1\/review/);
    await expect(mainHeading(page)).toHaveText("Review");
  });
});

test.describe("Application details (replaces the upstream drawer)", () => {
  for (const tab of [
    "Details",
    "Tags",
    "Reports",
    "Review",
    "Tasks",
    "Platform",
  ]) {
    test(`upstream drawer tab "${tab}" renders on the details page`, async ({
      page,
      pageErrors,
    }) => {
      await page.goto(protoUrl("/applications/1"));
      await expect(mainHeading(page)).toHaveText("Customer Management");
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(
        page.getByRole("tab", { name: tab, exact: true })
      ).toHaveAttribute("aria-selected", "true");
      await expect(errorBoundary(page)).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });
  }
});

test.describe("Archetypes", () => {
  test("list, drawer tabs and Create new archetype work", async ({
    page,
    pageErrors,
  }) => {
    await page.goto(protoUrl("/archetypes"));
    await expect(mainHeading(page)).toHaveText("Archetypes");
    await page
      .getByRole("row", { name: /Java EE Application/ })
      .getByText("Java EE Application", { exact: true })
      .click();
    const drawerHeading = page.getByRole("heading", {
      name: "Java EE Application",
      level: 2,
    });
    await expect(drawerHeading).toBeVisible();
    for (const tab of ["Details", "Target profiles", "Skills", "Review"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(
        page.getByRole("tab", { name: tab, exact: true })
      ).toHaveAttribute("aria-selected", "true");
    }
    await page.getByRole("button", { name: /close drawer/i }).click();
    await expect(drawerHeading).toHaveCount(0);
    await main(page)
      .getByRole("button", { name: "Create new archetype" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("target profiles page opens the create form", async ({ page }) => {
    await page.goto(protoUrl("/archetypes/1/target-profiles"));
    await expect(mainHeading(page)).toHaveText(
      "Target profiles for Java EE Application"
    );
    await main(page)
      .getByRole("button", { name: "Create New Target Profile" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("Controls", () => {
  for (const [tab, path] of [
    ["Stakeholders", "/controls/stakeholders"],
    ["Stakeholder groups", "/controls/stakeholder-groups"],
    ["Job functions", "/controls/job-functions"],
    ["Business services", "/controls/business-services"],
    ["Tags", "/controls/tags"],
  ] as const) {
    test(`${tab} tab renders and routes`, async ({ page, pageErrors }) => {
      await page.goto(protoUrl("/controls/stakeholders"));
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
      await expect(
        main(page)
          .getByRole("button", { name: /^Create/ })
          .first()
      ).toBeVisible();
      await expect(errorBoundary(page)).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });
  }
});

test.describe("other upstream pages render without crashing", () => {
  for (const [path, heading, persona] of [
    ["/migration-waves", "Migration waves", "enterpriseArchitect"],
    ["/issues/all", "Issues", "enterpriseArchitect"],
    ["/insights/all", "Insights", "enterpriseArchitect"],
    ["/dependencies", "Dependencies", "enterpriseArchitect"],
    ["/tasks", "Task Manager", "enterpriseArchitect"],
    ["/migration-targets", "Custom migration targets", "enterpriseArchitect"],
    ["/analysis-profiles", "Analysis Profiles", "enterpriseArchitect"],
    [
      "/applications/application-imports",
      "Application imports",
      "enterpriseArchitect",
    ],
    ["/general", "General configuration", "platformEngineer"],
    ["/identities", "Credentials", "platformEngineer"],
    ["/repositories/git", "Git configuration", "platformEngineer"],
    ["/repositories/svn", "Subversion configuration", "platformEngineer"],
    ["/repositories/maven", "Maven configuration", "platformEngineer"],
    ["/proxies", "Proxy configuration", "platformEngineer"],
    ["/jira", "Jira configuration", "platformEngineer"],
    ["/source-platforms", "Source platforms", "platformEngineer"],
    ["/asset-generators", "Generators", "platformEngineer"],
    ["/users", "Users", "platformEngineer"],
    ["/roles", "Roles", "platformEngineer"],
    ["/scopes", "Scopes", "platformEngineer"],
    ["/tokens", "Tokens", "platformEngineer"],
  ] as const) {
    test(`${path}`, async ({ page, pageErrors }) => {
      await page.goto(protoUrl(path, { persona }));
      await expect(mainHeading(page)).toHaveText(heading);
      await page.waitForLoadState("networkidle");
      await expect(errorBoundary(page)).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });
  }

  test("Credentials list has no duplicate React keys", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Encountered two children with the same key"))
        warnings.push(message.text());
    });
    await page.goto(protoUrl("/identities", { persona: "platformEngineer" }));
    await expect(mainHeading(page)).toHaveText("Credentials");
    await page.waitForLoadState("networkidle");
    expect(warnings).toEqual([]);
  });
});
