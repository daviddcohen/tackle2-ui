/**
 * The stage page of a run on several applications: one agent
 * run per stage per application, picked with the application Select in the
 * header. The status line, the Agent run facts, the Skills section, the
 * Transcript, Logs and YAML tabs follow the selection; the attention alert
 * and its decision stay the stage's and name the application that needs
 * them. A run on one application keeps its application link.
 *
 * Mock data (client/src/mocks/stub-new-work/agentic/execution.ts and
 * observability.ts): in the `failed`, `actionRequired` and `running`
 * scenarios Run #1 is on Customer Management (1), Claims Processing (3) and
 * Underwriting Workbench (8). A Failed or Action required stage fails or
 * waits for the run's first application only; the others succeeded. Claims
 * Processing has its own skill (EJB to CDI conversion patterns). In the
 * `configured` scenario Run #2 is on one application.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, main, protoUrl, searchParam, test } from "../support";

const CUSTOMER = "Customer Management";
const CLAIMS = "Claims Processing";
const UNDERWRITING = "Underwriting Workbench";

const header = (page: Page) =>
  main(page)
    .getByRole("heading", { level: 1 })
    .locator("xpath=ancestor::section[1]");

const applicationToggle = (page: Page, name?: string) =>
  header(page).getByRole("button", {
    name: name != null ? `Application: ${name}` : /^Application: /,
    exact: name != null,
  });

const statusLine = (page: Page) =>
  header(page)
    .getByText(/^Stage \d of \d in /)
    .locator("xpath=ancestor::div[contains(@class, 'pf-v6-l-flex')][1]");

const pickApplication = async (page: Page, name: string) => {
  await applicationToggle(page).click();
  await page
    .getByRole("listbox", { name: "Applications" })
    .getByRole("option", { name: new RegExp(`^${name}`) })
    .click();
  await expect(applicationToggle(page, name)).toBeVisible();
};

const tabPanel = (page: Page) => main(page).getByRole("tabpanel");

const alertHeading = (scope: Locator, variant: string, title: string) =>
  scope.getByRole("heading", { name: `${variant} alert: ${title}` });

/** The Details fact with this term. */
const fact = (page: Page, term: string) =>
  tabPanel(page)
    .getByRole("term")
    .filter({ hasText: new RegExp(`^${term}$`) })
    .locator("xpath=following-sibling::*[1]");

test.describe("Stage page of a run on several applications", () => {
  test("opens on the failed application, written to the URL, and switches the header and Details", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/1/stages/1", { scenario: "failed", stage: 1 })
    );
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    await expect.poll(() => searchParam(page, "application")).toBe("1");
    await expect(statusLine(page)).toContainText("Failed");
    await expect(
      alertHeading(
        tabPanel(page),
        "Danger",
        `Prepare proposal failed for ${CUSTOMER}`
      )
    ).toBeVisible();
    const customerPod = await fact(page, "Pod").textContent();

    // Each option shows its application's status for this stage.
    await applicationToggle(page).click();
    const options = page
      .getByRole("listbox", { name: "Applications" })
      .getByRole("option");
    await expect(options).toHaveText([
      `${CUSTOMER}Failed`,
      `${CLAIMS}Succeeded`,
      `${UNDERWRITING}Succeeded`,
    ]);
    await page.keyboard.press("Escape");

    await pickApplication(page, CLAIMS);
    expect(searchParam(page, "application")).toBe("3");
    await expect(statusLine(page)).toContainText("Succeeded");
    await expect(statusLine(page)).not.toContainText("Failed");
    await expect(fact(page, "Pod")).not.toHaveText(customerPod ?? "");
    // Claims Processing succeeded: Details points to the failed application,
    // with nothing to decide here.
    await expect(
      alertHeading(
        tabPanel(page),
        "Danger",
        `Prepare proposal failed for ${CUSTOMER}`
      )
    ).toBeVisible();
    await expect(
      tabPanel(page).getByRole("button", { name: "Run migration plan" })
    ).toHaveCount(0);
    await expect(
      tabPanel(page).getByRole("link", { name: "View logs" })
    ).toHaveCount(0);
    // Its other tabs carry no alert.
    await page.getByRole("tab", { name: "Logs", exact: true }).click();
    await expect(
      tabPanel(page).getByRole("heading", { name: /alert:/ })
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "Details", exact: true }).click();

    // "Show" switches to the failed application and its decision.
    await tabPanel(page)
      .getByRole("button", { name: `Show ${CUSTOMER}` })
      .click();
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    expect(searchParam(page, "application")).toBe("1");
    await expect(
      tabPanel(page).getByRole("button", { name: "Run migration plan" })
    ).toBeVisible();
    await expect(
      tabPanel(page).getByRole("link", { name: "View logs" })
    ).toHaveAttribute("href", /application=1/);
  });

  test("shows each application's transcript, and keeps the selection across tabs", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/1/stages/2", {
        scenario: "failed",
        stage: 2,
        params: { tab: "transcript" },
      })
    );
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    await expect(tabPanel(page)).toContainText(`I work on ${CUSTOMER}`);
    await pickApplication(page, CLAIMS);
    await expect(tabPanel(page)).toContainText(`I work on ${CLAIMS}`);
    await expect(tabPanel(page)).not.toContainText(`I work on ${CUSTOMER}`);

    await page.getByRole("tab", { name: "YAML", exact: true }).click();
    expect(searchParam(page, "application")).toBe("3");
    await expect(tabPanel(page)).toContainText(/name:\s+run-1-migrate-app-3/);
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    expect(searchParam(page, "application")).toBe("3");
    await expect(applicationToggle(page, CLAIMS)).toBeVisible();
  });

  test("shows each application's live log", async ({ page }) => {
    await page.goto(
      protoUrl("/plan-runs/1/stages/2", { scenario: "running", stage: 2 })
    );
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    const customerPod = (await fact(page, "Pod").textContent()) ?? "";
    await pickApplication(page, CLAIMS);
    const claimsPod = (await fact(page, "Pod").textContent()) ?? "";
    expect(claimsPod).not.toBe(customerPod);

    await page.getByRole("tab", { name: "Logs", exact: true }).click();
    await expect(tabPanel(page)).toContainText(`Live from pod ${claimsPod}`);
    await pickApplication(page, CUSTOMER);
    await expect(tabPanel(page)).toContainText(`Live from pod ${customerPod}`);
    expect(searchParam(page, "tab")).toBe("logs");
  });

  test("points from an application that succeeded to the one that waits, which keeps Approve", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/1/stages/1", {
        scenario: "actionRequired",
        params: { application: "8" },
      })
    );
    await expect(applicationToggle(page, UNDERWRITING)).toBeVisible();
    await expect(statusLine(page)).toContainText("Succeeded");
    await expect(
      alertHeading(
        tabPanel(page),
        "Warning",
        `Prepare proposal needs approval for ${CUSTOMER}`
      )
    ).toBeVisible();
    await expect(
      tabPanel(page).getByRole("button", { name: "Approve and continue" })
    ).toHaveCount(0);
    await tabPanel(page)
      .getByRole("button", { name: `Show ${CUSTOMER}` })
      .click();
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    // Approving moves every application on, and the page says so.
    await expect(tabPanel(page)).toContainText(
      `for ${CUSTOMER}. Check its logs and commits, then approve to start Migrate for all 3 applications.`
    );
    await expect(
      tabPanel(page).getByRole("button", { name: "Approve and continue" })
    ).toBeVisible();
    // The default without a parameter is the application that waits.
    await page.goto(
      protoUrl("/plan-runs/1/stages/1", { scenario: "actionRequired" })
    );
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    await expect(statusLine(page)).toContainText("Action required");
  });

  test("lists this stage's skills and the selected application's Every stage group only", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/1/stages/1", { scenario: "failed", stage: 1 })
    );
    const skills = main(page).getByRole("region", { name: "Skills" });
    await expect(skills).toContainText(
      "Worked out when the run started. If the agent's skills changed before this stage started, the agent got the new ones."
    );
    const groups = skills
      .getByRole("grid", { name: "Skills" })
      .getByRole("heading");
    await expect(groups).toHaveText([
      /^Stage 1: Prepare proposal/,
      `Every stage: ${CUSTOMER}`,
    ]);
    // Claims Processing's own skill reaches only its Every stage group.
    const ejb = skills
      .getByRole("row")
      .filter({ hasText: "EJB to CDI conversion patterns" });
    await expect(ejb).toHaveCount(1);
    await expect(ejb).not.toContainText("This application");

    await pickApplication(page, CLAIMS);
    await expect(groups).toHaveText([
      /^Stage 1: Prepare proposal/,
      `Every stage: ${CLAIMS}`,
    ]);
    await expect(ejb).toHaveCount(1);
    await expect(ejb).toContainText("This application");
  });

  test("opens on the application of the Migration tab link, not the default", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/applications/3", {
        scenario: "failed",
        stage: 1,
        params: { tab: "migration" },
      })
    );
    // The failed run's alert leads to the stage, on this application.
    await main(page).getByRole("link", { name: "Review stage" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/1\?/);
    await expect(applicationToggle(page, CLAIMS)).toBeVisible();
    expect(searchParam(page, "application")).toBe("3");
    await expect(statusLine(page)).toContainText("Succeeded");
  });

  test("lists each application's own commits", async ({ page }) => {
    await page.goto(
      protoUrl("/plan-runs/1/stages/1", {
        scenario: "completed",
        params: { application: "1" },
      })
    );
    const commits = tabPanel(page).getByRole("grid", { name: "Commits" });
    await expect(commits.getByRole("row")).toHaveCount(2);
    const customerHash = await commits.getByRole("row").nth(1).textContent();
    await pickApplication(page, CLAIMS);
    await expect(commits.getByRole("row")).toHaveCount(2);
    await expect(commits.getByRole("row").nth(1)).not.toHaveText(
      customerHash ?? ""
    );
  });

  test("names the failed application on the plan run, and reviews its agent run", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/1", { scenario: "failed", stage: 2 }));
    await expect(
      alertHeading(main(page), "Danger", `Migrate failed for ${CUSTOMER}`)
    ).toBeVisible();
    await main(page).getByRole("link", { name: "Review stage" }).click();
    await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/2\?/);
    expect(searchParam(page, "application")).toBe("1");
    expect(searchParam(page, "tab")).toBe("logs");
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
  });

  test("opens the plan run's stage links on the default application", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/1", { scenario: "failed", stage: 1 }));
    await main(page)
      .getByRole("grid", { name: "Stages" })
      .getByRole("link", { name: "Prepare proposal", exact: true })
      .click();
    await expect(applicationToggle(page, CUSTOMER)).toBeVisible();
    await expect.poll(() => searchParam(page, "application")).toBe("1");
  });
});

test.describe("Stage page of a run on one application", () => {
  test("keeps the application link, no Select, and leaves the URL alone", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/2/stages/4"));
    await expect(main(page).getByRole("tablist")).toBeVisible();
    const row = header(page).getByText(/^Application: /);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link")).toHaveCount(1);
    await expect(applicationToggle(page)).toHaveCount(0);
    expect(searchParam(page, "application")).toBeNull();
    await expect(
      main(page)
        .getByRole("region", { name: "Skills" })
        .getByRole("heading", {
          name: /^Every stage: /,
        })
    ).toHaveCount(1);
  });
});
