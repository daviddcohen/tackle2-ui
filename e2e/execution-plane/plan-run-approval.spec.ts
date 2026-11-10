/**
 * Run #2 (Spring Boot to Quarkus: Analyze -> Migrate -> Validate) in the actionRequired scenario.
 * Stage 1 (Analyze) requires approval; stages 2-3 do not.
 */
import { approveButton, expect, protoUrl, stageStatus, test } from "../support";

test.describe("Plan run approval", () => {
  test("awaiting stage is expanded with an approval call to action", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs", { scenario: "actionRequired" }));
    await page.getByRole("link", { name: /Run #2/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Run #2 — Spring Boot to Quarkus"
    );
    await expect(
      page.getByText("This stage requires your approval")
    ).toBeVisible();
    await expect(stageStatus(page, "Analyze")).toHaveText("Awaiting approval");
    await expect(stageStatus(page, "Migrate")).toHaveText("Pending");
    await expect(approveButton(page)).toBeEnabled();
  });

  test("approve advances to the next stage and shows a running stage", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/2", { scenario: "actionRequired", stage: 1 })
    );
    await approveButton(page).click();
    // The server advances the run; the global prototype scenario is not touched.
    await expect(stageStatus(page, "Analyze")).toHaveText("Succeeded");
    await expect(stageStatus(page, "Migrate")).toHaveText("Running");
    await expect(approveButton(page)).toHaveCount(0);
    await expect(page).toHaveURL(/protoScenario=actionRequired&protoStage=1/);
  });

  test("view run opens the stage run detail with matching status", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/2", { scenario: "actionRequired", stage: 1 })
    );
    await page.getByRole("link", { name: "View run" }).first().click();
    await expect(page).toHaveURL(/\/plan-runs\/2\/stages\/4\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Analyze: Run #2 — Spring Boot to Quarkus"
    );
    await expect(
      page.getByRole("definition").filter({ hasText: "Awaiting approval" })
    ).toBeVisible();
    await expect(approveButton(page)).toBeVisible();
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Run #2 — Spring Boot to Quarkus" })
      .click();
    await expect(page).toHaveURL(/\/plan-runs\/2\?/);
  });

  // Regression guard: StageRunSection initialises isExpanded with useState() once. A stage first rendered
  // as Pending stays collapsed when it later becomes AwaitingApproval, hiding the Approve button.
  // Run #4 (Java EE lift and shift) has a second approval gate on its last stage ("Review
  // security"); with the interactive policy the server stops there after ~12 s.
  test("a stage that transitions to awaiting approval is expanded", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto(
      protoUrl("/plan-runs/4", { scenario: "actionRequired", stage: 1 })
    );
    await page.evaluate(() =>
      fetch("/hub/prototype/agentic/execution-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionMode: "interactive" }),
      })
    );
    await approveButton(page).click();
    await expect(stageStatus(page, "Containerize")).toHaveText("Running");
    // Next approval gate on the same, already-mounted page.
    await expect(stageStatus(page, "Review security")).toHaveText(
      "Awaiting approval",
      {
        timeout: 30000,
      }
    );
    await expect(approveButton(page)).toBeVisible();
  });

  // Regression guard: stage-run-detail approve does not call prototype.advanceStage(); the scenario
  // projection immediately re-applies AwaitingApproval so the click appears to do nothing.
  test("approving from the stage run detail page changes the stage status", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/2/stages/4", {
        scenario: "actionRequired",
        stage: 1,
      })
    );
    await approveButton(page).click();
    await expect(
      page.getByRole("definition").filter({ hasText: /^Running$|^Succeeded$/ })
    ).toBeVisible();
  });

  // Regression guard: plan-run-detail offers Approve for any AwaitingApproval stage, stage-run-detail only
  // when stage.requiresApproval; Migrate (requiresApproval=false) shows no action on its own page.
  test("stage run detail offers approval whenever the run detail does", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/2", { scenario: "actionRequired", stage: 2 })
    );
    // A stage awaiting approval opens on its own.
    await expect(
      page.getByRole("button", { name: /Migrate/ }).first()
    ).toHaveAttribute("aria-expanded", "true");
    await expect(approveButton(page)).toBeVisible();
    await page.getByRole("link", { name: "View run" }).nth(1).click();
    await expect(page).toHaveURL(/\/stages\/5\?/);
    await expect(approveButton(page)).toBeVisible();
  });

  test("failed stage shows error output and a recovery action", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/2", { scenario: "failed", stage: 1 }));
    await expect(
      page.getByText(/Unable to resolve dependency tree/).first()
    ).toBeVisible();
    await expect(stageStatus(page, "Analyze")).toHaveText("Failed");
    // Recovery: a failed run offers "Start new run" (preflight prefilled with its apps, Plan and branch).
    await expect(
      page.getByRole("button", { name: /retry|start new run|new run/i })
    ).toBeVisible();
  });
});
