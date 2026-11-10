import {
  PERSONAS,
  PERSONA_LABEL,
  PERSONA_START,
  type Persona,
  SCENARIOS_BY_PERSONA,
  breadcrumb,
  errorBoundary,
  expect,
  expectCanonicalProto,
  mainHeading,
  personaSelect,
  perspectiveToggle,
  protoUrl,
  scenarioSelect,
  searchParam,
  sidebar,
  stageSelect,
  switcher,
  test,
} from "../support";

const personas = PERSONAS;

test.describe("persona changes", () => {
  for (const persona of personas) {
    test(`choosing ${persona} opens its starting page with a fresh trail`, async ({
      page,
    }) => {
      // Start somewhere else, deep inside a breadcrumb trail.
      const from: Persona =
        persona === "enterpriseArchitect"
          ? "hubMigrator"
          : "enterpriseArchitect";
      await page.goto(protoUrl("/plan-runs", { persona: from }));
      await page
        .getByRole("link", { name: /^Run #1/ })
        .first()
        .click();
      await expect(breadcrumb(page)).toBeVisible();

      await personaSelect(page).selectOption(persona);

      await expect(page).toHaveURL(new RegExp(`${PERSONA_START[persona]}\\?`));
      await expect(personaSelect(page)).toHaveValue(persona);
      await expect(personaSelect(page).locator("option:checked")).toHaveText(
        PERSONA_LABEL[persona]
      );
      await expect(breadcrumb(page)).toHaveCount(0);
      expect(searchParam(page, "protoStage")).toBe("1");
      // Scenario is kept when the persona allows it, otherwise the first allowed one.
      const allowed = SCENARIOS_BY_PERSONA[persona];
      const scenario = searchParam(page, "protoScenario")!;
      expect(allowed).toContain(scenario);
      const options = await scenarioSelect(page)
        .locator("option")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLOptionElement).value)
        );
      expect(options).toEqual(allowed);
    });
  }

  test("browser Back after a persona change restores the previous persona and page", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs", {
        persona: "enterpriseArchitect",
        scenario: "running",
      })
    );
    await expect(mainHeading(page)).toHaveText("Plan Runs");
    await personaSelect(page).selectOption("platformEngineer");
    await expect(mainHeading(page)).toHaveText("Models");
    await expect(perspectiveToggle(page)).toHaveText("Administration");

    await page.goBack();
    await expect(mainHeading(page)).toHaveText("Plan Runs");
    await expectCanonicalProto(page, "enterpriseArchitect", "running");
    await expect(personaSelect(page)).toHaveValue("enterpriseArchitect");
    await expect(perspectiveToggle(page)).toHaveText("Migration");
  });
});

test.describe("every persona x scenario combination", () => {
  for (const persona of personas) {
    for (const scenario of SCENARIOS_BY_PERSONA[persona]) {
      test(`${persona} / ${scenario}: switcher keeps the route and the pages render`, async ({
        page,
        pageErrors,
      }) => {
        test.setTimeout(90_000);
        // Select the scenario through the UI on the persona's own start page.
        const initial = scenario === "configured" ? "failed" : "configured";
        await page.goto(
          protoUrl(PERSONA_START[persona], { persona, scenario: initial })
        );
        await expect(mainHeading(page)).toBeVisible();
        await scenarioSelect(page).selectOption(scenario);
        await expect(page).toHaveURL(
          new RegExp(`^[^?]*${PERSONA_START[persona]}\\?`)
        );
        await expectCanonicalProto(page, persona, scenario);
        await expect(
          switcher(page).locator(".prototype-scope-switcher__scenario-desc")
        ).not.toBeEmpty();

        // Navigate through the sidebar: prototype state must follow.
        for (const [link, heading] of [
          ["Agents", "Agents"],
          ["Plan Runs", "Plan Runs"],
          ["Skills", "Skills"],
          ["Application inventory", "Application inventory"],
        ] as const) {
          if (persona === "platformEngineer" && link === "Agents") {
            await perspectiveToggle(page).click();
            await page
              .getByRole("listbox")
              .getByRole("option", { name: "Migration" })
              .click();
            await expect(mainHeading(page)).toHaveText("Application inventory");
          }
          await sidebar(page)
            .getByRole("link", { name: link, exact: true })
            .click();
          await expect(mainHeading(page)).toHaveText(heading);
          await expectCanonicalProto(page, persona, scenario);
          await expect(errorBoundary(page)).toHaveCount(0);
        }
        expect(pageErrors).toEqual([]);
      });
    }
  }
});

test.describe("reset and URL validation", () => {
  test("Reset Prototype returns to defaults, the inventory and a fresh trail", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/plan-runs/1", {
        persona: "hubMigrator",
        scenario: "actionRequired",
        stage: 2,
      })
    );
    await expect(mainHeading(page)).toHaveText(/^Run #1/);
    await switcher(page)
      .getByRole("button", { name: "Reset Prototype" })
      .click();
    await expect(page).toHaveURL(/\/applications\?/);
    await expectCanonicalProto(page, "enterpriseArchitect", "configured");
    expect(searchParam(page, "protoStage")).toBe("1");
    await expect(mainHeading(page)).toHaveText("Application inventory");
    await expect(breadcrumb(page)).toHaveCount(0);
    await expect(perspectiveToggle(page)).toHaveText("Migration");
  });

  for (const [query, persona, scenario, stage] of [
    ["protoScenario=bogus", "enterpriseArchitect", "configured", "1"],
    [
      "protoPersona=bogus&protoScenario=running",
      "enterpriseArchitect",
      "running",
      "1",
    ],
    [
      "protoPersona=hubMigrator&protoScenario=initial",
      "hubMigrator",
      "configured",
      "1",
    ],
    [
      "protoPersona=platformEngineer&protoScenario=running",
      "platformEngineer",
      "configured",
      "1",
    ],
    [
      "protoScenario=running&protoStage=0",
      "enterpriseArchitect",
      "running",
      "1",
    ],
    [
      "protoScenario=running&protoStage=-3",
      "enterpriseArchitect",
      "running",
      "1",
    ],
    [
      "protoScenario=running&protoStage=abc",
      "enterpriseArchitect",
      "running",
      "1",
    ],
  ] as const) {
    test(`invalid URL state "${query}" is canonicalized`, async ({
      page,
      pageErrors,
    }) => {
      await page.goto(`/plan-runs?${query}`);
      await expect(mainHeading(page)).toHaveText("Plan Runs");
      await expectCanonicalProto(page, persona, scenario);
      expect(searchParam(page, "protoStage")).toBe(stage);
      await expect(scenarioSelect(page)).toHaveValue(scenario);
      expect(pageErrors).toEqual([]);
    });
  }

  test("an out-of-range stage is clamped to the run's stages and shown in the switcher", async ({
    page,
  }) => {
    // Known open issue (see e2e/README.md "Known open issues"): protoStage
    // has no upper bound, so ?protoStage=999 stays in the URL and the Stage
    // control shows 1 while the run renders its last stage.
    test.fail(true, "protoStage has no upper bound");
    await page.goto(
      protoUrl("/plan-runs/1", {
        persona: "enterpriseArchitect",
        scenario: "running",
        stage: 999,
      })
    );
    await expect(mainHeading(page)).toHaveText(/^Run #1/);
    const stage = stageSelect(page);
    await expect(stage).toHaveValue(searchParam(page, "protoStage")!);
    expect(Number(searchParam(page, "protoStage"))).toBeLessThanOrEqual(3);
  });

  test("approving the final stage completes the run", async ({ page }) => {
    // Approval is a server mutation: the run completes on the server and the
    // switcher's scenario and stage stay as they were (no URL change).
    await page.goto(
      protoUrl("/plan-runs/1", {
        persona: "enterpriseArchitect",
        scenario: "actionRequired",
        stage: 3,
      })
    );
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await expect(mainHeading(page)).toHaveText(/^Run #1/);
    await expect(
      page.getByRole("main").locator(".pf-v6-c-label").first()
    ).toHaveText("Succeeded");
    await expect(
      page.getByRole("button", { name: /Approve and continue/ })
    ).toHaveCount(0);
    expect(searchParam(page, "protoScenario")).toBe("actionRequired");
    expect(searchParam(page, "protoStage")).toBe("3");
    expect(
      await page.getByRole("main").getByText("Running", { exact: true }).count()
    ).toBe(0);
  });
});

test.describe("sidebar perspective per persona", () => {
  test("Platform Engineer can switch between Administration and Migration and keeps state", async ({
    page,
  }) => {
    await page.goto(
      protoUrl("/models", {
        persona: "platformEngineer",
        scenario: "partialConfiguration",
      })
    );
    await expect(perspectiveToggle(page)).toHaveText("Administration");
    await perspectiveToggle(page).click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
      "Migration",
      "Administration",
    ]);
    await page
      .getByRole("listbox")
      .getByRole("option", { name: "Migration" })
      .click();
    await expect(page).toHaveURL(/\/applications\?/);
    await expectCanonicalProto(
      page,
      "platformEngineer",
      "partialConfiguration"
    );
    await expect(perspectiveToggle(page)).toHaveText("Migration");

    await perspectiveToggle(page).click();
    await page
      .getByRole("listbox")
      .getByRole("option", { name: "Administration" })
      .click();
    await expect(page).toHaveURL(/\/general\?/);
    await expect(mainHeading(page)).toHaveText("General configuration");
    await expectCanonicalProto(
      page,
      "platformEngineer",
      "partialConfiguration"
    );
  });

  for (const persona of ["enterpriseArchitect", "hubMigrator"] as const) {
    test(`${persona} only gets the Migration perspective`, async ({ page }) => {
      await page.goto(protoUrl("/applications", { persona }));
      await expect(perspectiveToggle(page)).toHaveText("Migration");
      await perspectiveToggle(page).click();
      await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
        "Migration",
      ]);
    });
  }
});

test.describe("switcher controls", () => {
  test("scenario descriptions explain the selected scenario", async ({
    page,
  }) => {
    const description = switcher(page).locator(
      ".prototype-scope-switcher__scenario-desc"
    );
    for (const [scenario, text] of [
      ["completed", "succeeded"],
      ["apiError", "503"],
    ] as const) {
      await page.goto(protoUrl("/applications", { scenario }));
      await expect(description).toContainText(text);
    }
  });

  // The Stage control only applies to a plan run that is in progress.
  for (const [path, scenario, visible] of [
    ["/applications", "running", false],
    ["/plan-runs", "running", false],
    ["/plan-runs/1", "configured", false],
    ["/plan-runs/1", "queued", false],
    ["/plan-runs/1", "completed", false],
    ["/plan-runs/1", "running", true],
    ["/plan-runs/1", "actionRequired", true],
    ["/plan-runs/1", "failed", true],
  ] as const) {
    test(`Stage control is ${visible ? "shown" : "hidden"} on ${path} (${scenario})`, async ({
      page,
    }) => {
      await page.goto(protoUrl(path, { scenario }));
      await expect(mainHeading(page)).toBeVisible();
      if (visible) await expect(stageSelect(page)).toBeVisible();
      else await expect(stageSelect(page)).toHaveCount(0);
    });
  }
});
