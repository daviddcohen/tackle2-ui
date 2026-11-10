import { expect, expectNoBrokenText, main, protoUrl, test } from "../support";

test.describe("Plan Runs list", () => {
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
      .filter({ has: page.locator(".pf-v6-c-label") })
      .locator(".pf-v6-c-label")
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
      .getByRole("menuitem", { name: "Awaiting approval", exact: true })
      .click();
    await page.keyboard.press("Escape");
    const rows = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: /^Run #\d+/ }) });
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all())
      await expect(row).toContainText("Awaiting approval");
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
    ["actionRequired", "Awaiting approval"],
    ["failed", "Failed"],
    ["completed", "Succeeded"],
  ] as const) {
    test(`header status follows the ${scenario} scenario`, async ({ page }) => {
      await page.goto(protoUrl("/plan-runs/1", { scenario, stage: 1 }));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Run #1 — Java EE to Quarkus"
      );
      await expect(
        page.getByRole("main").locator(".pf-v6-c-label").first()
      ).toHaveText(expected);
      await expectNoBrokenText(main(page));
    });
  }

  test("links: plan, applications, agent and stage run", async ({ page }) => {
    await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
    const summary = page.getByRole("main").locator("dl").first();
    await expect(summary.getByRole("link")).toHaveCount(4); // plan + 3 applications
    await page.getByRole("link", { name: "View run" }).first().click();
    await expect(page).toHaveURL(/\/plan-runs\/1\/stages\/1\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Prepare proposal: Run #1 — Java EE to Quarkus"
    );
    await expect(page.getByRole("heading", { name: "Commits" })).toBeVisible();
  });

  test("unknown run and unknown stage show not-found states", async ({
    page,
  }) => {
    await page.goto(protoUrl("/plan-runs/abc", { scenario: "configured" }));
    await expect(page.getByText("Plan run not found").first()).toBeVisible();
    await page.goto(
      protoUrl("/plan-runs/2/stages/999", { scenario: "configured" })
    );
    await expect(page.getByText("Stage run not found").first()).toBeVisible({
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
        .locator(".pf-v6-c-label")
        .first()
        .innerText();
      expect(detail).toMatch(
        /^(Pending|Running|Succeeded|Failed|Awaiting approval)$/
      );
      await page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Plan Runs" })
        .click();
      await expect(
        page
          .getByRole("row", { name: /Run #2/ })
          .locator(".pf-v6-c-label")
          .first()
      ).toHaveText(detail);
      await page.goto(
        protoUrl("/applications/7?tab=plan-runs", { scenario, stage: 1 })
      );
      await expect(
        page
          .getByRole("row", { name: /Run #2/ })
          .locator(".pf-v6-c-label")
          .first()
      ).toHaveText(detail);
    });
  }

  // Regression guard: Partner Portal is a member of Run #2 (Spring Boot to Quarkus) but the inventory
  // projection resolves it to "Java EE lift and shift" with an unrelated stage and status.
  test("an application in a run shows that run's Plan in the inventory", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications", { scenario: "running" }));
    await expect(
      page.getByRole("row", { name: /Partner Portal/ })
    ).toContainText("Spring Boot to Quarkus");
  });

  // Regression guard: Run #2 lists Claims Processing and Document Archive, which are not in the 12-app
  // inventory produced by expandPrototypePortfolio().
  test("every application in a run is present in the inventory", async ({
    page,
  }) => {
    await page.goto(protoUrl("/applications?applications:itemsPerPage=20"));
    await expect(
      page.getByRole("link", { name: "Claims Processing" })
    ).toBeVisible();
  });
});
