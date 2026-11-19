import type { Page } from "@playwright/test";

import {
  AGENTIC_STATUS,
  agenticGet,
  expect,
  expectNoBrokenText,
  main,
  protoUrl,
  stageLinks,
  stagesTable,
  test,
} from "../support";

test.describe("Plan runs list", () => {
  test("a run awaiting approval whose clock cannot be read says Not finished", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs", { scenario: "configured" }));
    // The seeded run that waits for approval on a stage with no agent
    // message yet: nothing stops its clock, so its duration is not known.
    const runs = await agenticGet<
      {
        name: string;
        status: string;
        stageRuns: { status: string; messages?: { role: string }[] }[];
      }[]
    >(page, "/plan-runs");
    const waiting = runs.find(
      (run) =>
        run.status === "AwaitingApproval" &&
        run.stageRuns.some(
          (stage) =>
            stage.status === "AwaitingApproval" &&
            !(stage.messages ?? []).some((message) => message.role === "agent")
        )
    );
    expect(
      waiting,
      "a seeded run awaiting approval on a stage without agent messages"
    ).toBeDefined();
    const row = page.getByRole("row").filter({
      has: page.getByRole("link", { name: waiting!.name, exact: true }),
    });
    // Duration is the last column.
    await expect(row.getByRole("gridcell").last()).toHaveText("Not finished");
  });

  test("lists every run with a known status, sorted by start time", async ({
    page,
    pageErrors,
  }) => {
    await page.goto(protoUrl("/plan-runs", { scenario: "configured" }));
    const rows = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: /^Run #\d+/ }) });
    await expect(rows).toHaveCount(7);
    const statuses = await page
      .getByRole("gridcell")
      .filter({ has: page.locator(AGENTIC_STATUS) })
      .locator(AGENTIC_STATUS)
      .allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    await expect(
      page.getByRole("columnheader", { name: "Started" })
    ).toBeVisible();
    await expectNoBrokenText(main(page));
    expect(pageErrors).toEqual([]);
  });

  test("status filter narrows the table", async ({ page }) => {
    await page.goto(protoUrl("/plan-runs", { scenario: "configured" }));
    await page.getByRole("button", { name: "Name" }).first().click();
    await page.getByRole("menuitem", { name: "Status" }).click();
    await page.getByRole("combobox", { name: "Type to filter" }).click();
    await page
      .getByRole("menuitem", { name: "Action required", exact: true })
      .click();
    await page.keyboard.press("Escape");
    const rows = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: /^Run #\d+/ }) });
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all())
      await expect(row).toContainText("Action required");
  });

  test("initial scenario shows the empty state", async ({ page }) => {
    await page.goto(protoUrl("/plan-runs", { scenario: "initial" }));
    await expect(page.getByText("No plan runs yet")).toBeVisible();
  });

  test("API error shows an error state", async ({ page }) => {
    await page.goto(protoUrl("/plan-runs", { scenario: "apiError" }));
    await expect(page.getByText("Unable to connect")).toBeVisible({
      timeout: 20000,
    });
  });
});

test.describe("Plan run detail", () => {
  for (const [scenario, expected] of [
    ["queued", "Pending"],
    ["running", "Running"],
    ["actionRequired", "Action required"],
    ["failed", "Failed"],
    ["completed", "Succeeded"],
  ] as const) {
    test(`header status follows the ${scenario} scenario`, async ({ page }) => {
      await page.goto(protoUrl("/plan-runs/1", { scenario, stage: 1 }));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Run #1: Java EE to Quarkus"
      );
      await expect(
        page.getByRole("main").locator(AGENTIC_STATUS).first()
      ).toHaveText(expected);
      await expectNoBrokenText(main(page));
    });
  }

  test("links: plan, applications, agent and stage run", async ({ page }) => {
    await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
    const summary = page.getByRole("main").locator("dl").first();
    await expect(summary.getByRole("link")).toHaveCount(4); // plan + 3 applications
    await stageLinks(page).first().click();
    await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/1\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Prepare proposal"
    );
    await expect(page.getByRole("heading", { name: "Commits" })).toBeVisible();
  });

  // What each stage got, then one Every stage group per
  // application, worked out when the run started.
  test("Skills by stage: each stage, then each application's own group", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
    await expect(
      main(page).getByRole("heading", { level: 2, name: "Skills by stage" })
    ).toBeVisible();
    // Several applications: the attribution is said once.
    await expect(
      main(page).getByText(
        "Worked out when the run started. Each stage's agent reads its own skills when the stage starts, so a change to that agent before then can change what the stage gets. An application's archetype, target profile and own skills go to that application only."
      )
    ).toBeVisible();
    const table = main(page).getByRole("grid", { name: "Skills by stage" });
    const titles = table.getByRole("heading", { level: 3 });
    await expect(titles.first()).toHaveText(/^Stage 1: /);
    await expect(
      table.getByRole("heading", { name: "Every stage: Claims Processing" })
    ).toBeVisible();
    // Claims Processing's own skill reads "This application" in its group
    // only; the group title names the application.
    const own = table
      .getByRole("row")
      .filter({ hasText: "EJB to CDI conversion patterns" })
      .filter({ hasText: "This application" });
    await expect(own).toHaveCount(1);
    await expect(
      table
        .getByRole("row")
        .filter({ hasText: "Application: Claims Processing" })
    ).toHaveCount(0);
    // Every Every stage title says what the group holds.
    await expect(
      table.getByRole("row").filter({
        has: page.getByRole("heading", {
          name: "Every stage: Claims Processing",
        }),
      })
    ).toContainText("Archetype, target profile and application skills");
    // Links keep their own query, with the run as origin.
    await expect(
      table
        .getByRole("heading", { name: "Every stage: Claims Processing" })
        .getByRole("link")
    ).toHaveAttribute("href", /\/applications\/\d+\?tab=skills&from=run-1$/);
    await expect(table.getByRole("checkbox")).toHaveCount(0);
  });

  test("unknown run and unknown stage show not-found states", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/abc", { scenario: "configured" }));
    await expect(page.getByText("Plan run not found").first()).toBeVisible();
    await page.goto(
      protoUrl("/plan-runs/2/stages/999", { scenario: "configured" })
    );
    await expect(page.getByText("Stage not found").first()).toBeVisible({
      timeout: 20000,
    });
  });

  // Regression guard: fetchError is ignored; an API failure renders "Plan run not found".
  test("API error is reported as an error, not as not-found", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/2", { scenario: "apiError" }));
    await expect(
      page
        .getByRole("main")
        .getByText(/unavailable|error/i)
        .first()
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Plan run not found")).toHaveCount(0);
  });
});

test.describe("Status consistency across surfaces", () => {
  // Regression guard: GET /plan-runs returns raw fixtures while GET /plan-runs/:id re-projects the run for
  // the active scenario, so list, application tab and detail disagree.
  for (const scenario of ["running", "failed", "completed"] as const) {
    test(`Run #2 status matches in list, application tab and detail (${scenario})`, async ({
      page,
    }) => {
      await page.goto(protoUrl("/plan-runs/2", { scenario, stage: 1 }));
      const detail = await page
        .getByRole("main")
        .locator(AGENTIC_STATUS)
        .first()
        .innerText();
      expect(detail).toMatch(
        /^(Pending|Running|Succeeded|Failed|Action required)$/
      );
      await page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Plan runs" })
        .click();
      await expect(
        page
          .getByRole("row", { name: /Run #2/ })
          .locator(AGENTIC_STATUS)
          .first()
      ).toHaveText(detail);
      await page.goto(
        protoUrl("/applications/12?tab=plan-runs", { scenario, stage: 1 })
      );
      await expect(
        page
          .getByRole("row", { name: /Run #2/ })
          .locator(AGENTIC_STATUS)
          .first()
      ).toHaveText(detail);
    });
  }

  // Regression guard: Notification Service is a member of Run #2 (Spring Boot to Quarkus) but the
  // inventory projection resolved it to an unrelated Plan, stage and status.
  test("an application in a run shows that run's Plan in the inventory", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "running" }));
    await expect(
      page.getByRole("row", { name: /Notification Service/ })
    ).toContainText("Spring Boot to Quarkus");
    // Partner Portal runs Java EE lift and shift, picked for all applications,
    // while its own plan is Java EE to Quarkus: the row shows the run's plan.
    await expect(
      page.getByRole("row", { name: /Partner Portal/ })
    ).toContainText("Java EE lift and shift");
  });

  // Regression guard: every application of a seeded run (Claims Processing is in Run #1) must be in
  // the 13-application inventory.
  test("every application in a run is present in the inventory", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications?applications:itemsPerPage=20"));
    await expect(
      page.getByRole("link", { name: "Claims Processing" })
    ).toBeVisible();
  });
});

test.describe("Plan run stages: context and failed stage logs", () => {
  /** The Context cell of a stage in the Stages table, by stage name. */
  const contextCell = (page: Page, stage: string) =>
    stagesTable(page)
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: stage, exact: true }) })
      .locator('td[data-label="Context"]');

  test("the Stages table has a Context column: a value per started stage, Not started for pending", async ({
    page,
  }) => {
    // Run 1 failed in Migrate: Prepare proposal and Migrate ran, Validate did not.
    await page.goto(protoUrl("/plan-runs/1", { scenario: "failed", stage: 2 }));
    await expect(
      stagesTable(page).getByRole("columnheader", { name: /^Context/ })
    ).toBeVisible();
    await expect(
      stagesTable(page).getByRole("button", {
        name: "More information about context",
      })
    ).toBeVisible();
    // Run 1 is on three applications: each stage shows its fullest agent
    // run, with the lowest in the accessible value. Exact values from the
    // mock's agent runs.
    const run = await agenticGet<{
      stageRuns: { stageId: string; name: string }[];
    }>(page, "/plan-runs/1");
    const agentRuns = await agenticGet<
      {
        stageId: string;
        usage?: { contextUsed?: number; contextSize?: number };
      }[]
    >(page, "/plan-runs/1/agent-runs");
    for (const stage of ["Prepare proposal", "Migrate"]) {
      const stageId = run.stageRuns.find((s) => s.name === stage)?.stageId;
      const percents = agentRuns
        .filter((agentRun) => agentRun.stageId === stageId)
        .map(({ usage }) =>
          Math.min(
            100,
            Math.floor(
              ((usage?.contextUsed ?? 0) / (usage?.contextSize ?? 1)) * 100
            )
          )
        );
      expect(percents).toHaveLength(3);
      const highest = Math.max(...percents);
      const lowest = Math.min(...percents);
      const bar = contextCell(page, stage).getByRole("progressbar", {
        name: `Context window of ${stage}`,
      });
      await expect(bar).toBeVisible();
      await expect(contextCell(page, stage)).toHaveText(`Up to ${highest}%`);
      await expect(bar).toHaveAttribute("aria-valuenow", String(highest));
      await expect(bar).toHaveAttribute(
        "aria-valuetext",
        `Up to ${highest}% across 3 applications, lowest ${lowest}%`
      );
    }
    await expect(contextCell(page, "Validate")).toHaveText("Not started");
  });

  test("a run whose model does not meter context says Not reported for that stage", async ({
    page,
  }) => {
    // Run 6, Upgrade runtime uses the self-hosted model (no context reported).
    await page.goto(protoUrl("/plan-runs/6", { scenario: "configured" }));
    await expect(contextCell(page, "Upgrade runtime")).toHaveText(
      "Not reported"
    );
    await expect(
      contextCell(page, "Configure deployment").getByRole("progressbar")
    ).toBeVisible();
  });

  test("Review stage for a failed stage opens that stage's logs", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/1", { scenario: "failed", stage: 2 }));
    const review = main(page).getByRole("link", { name: "Review stage" });
    await expect(review).toHaveAttribute(
      "href",
      /\/plan-runs\/1\/stages\/2\?(.*&)?tab=logs\b/
    );
    await review.click();
    await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/2\?/);
    await expect(page).toHaveURL(/[?&]tab=logs\b/);
    await expect(
      page.getByRole("tab", { name: "Logs", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      main(page).getByRole("region", { name: / log$/ })
    ).toBeVisible();
  });

  test("Review stage for a stage awaiting approval opens its Details", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/1", { scenario: "actionRequired", stage: 1 })
    );
    const review = main(page).getByRole("link", { name: "Review stage" });
    await expect(review).not.toHaveAttribute("href", /tab=logs/);
    await review.click();
    await expect(
      page.getByRole("tab", { name: "Details", exact: true })
    ).toHaveAttribute("aria-selected", "true");
  });
});
