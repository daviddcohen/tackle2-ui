/**
 * The application Plan runs tab offers "Run migration plan" in its empty
 * section only when the application can start, the same rule as the
 * Migration tab: a blocked or unconfigured application would open a dialog
 * that can only say it cannot start. Applications are picked from the mock
 * API, not hard-coded, because the fixtures change.
 */
import {
  type Scenario,
  agenticGet,
  bootMockApi,
  expect,
  fixtureGraph,
  main,
  protoUrl,
  test,
} from "../support";

interface MigrationView {
  configured: boolean;
  preflight?: string;
  runPhase?: string;
  intervention?: string;
}

/** An application in `scenario` whose status matches and that has no plan run. */
const findApplication = async (
  page: Parameters<typeof fixtureGraph>[0],
  scenario: Scenario,
  matches: (view: MigrationView) => boolean
) => {
  await bootMockApi(page, scenario);
  const graph = await fixtureGraph(page);
  const inRuns = new Set(
    graph.runs.flatMap((run) => run.applications.map((app) => Number(app.id)))
  );
  const ids = graph.applications
    .map((app) => Number(app.id))
    .filter((id) => !inRuns.has(id));
  const views = await agenticGet<Record<number, MigrationView>>(
    page,
    `/application-migrations?applicationIds=${ids.join(",")}`
  );
  // The aggregate omits an application without a migration plan: it is not
  // configured, as the Migration tab reads it.
  const id = ids.find((candidate) => {
    const view = views[candidate] ?? { configured: false };
    return view.runPhase == null && matches(view);
  });
  expect(id, "a matching application in the fixtures").toBeDefined();
  return id!;
};

const emptySentence = "This application has not been in a plan run yet.";

test("a ready application without runs offers Run migration plan", async ({
  page,
}) => {
  const id = await findApplication(
    page,
    "configured",
    (view) => view.configured && view.preflight === "ready"
  );
  await page.goto(
    protoUrl(`/applications/${id}`, { params: { tab: "plan-runs" } })
  );
  await expect(main(page).getByText(emptySentence)).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: "Run migration plan" })
  ).toBeVisible();
});

test("a blocked application offers no run in the empty section", async ({
  page,
}) => {
  const scenario = "preflightBlocked";
  const id = await findApplication(
    page,
    scenario,
    (view) => view.configured && view.preflight === "blocked"
  );
  await page.goto(
    protoUrl(`/applications/${id}`, { scenario, params: { tab: "plan-runs" } })
  );
  await expect(main(page).getByText(emptySentence)).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: "Run migration plan" })
  ).toHaveCount(0);
});

test("an application without a migration path offers no run in the empty section", async ({
  page,
}) => {
  // The initial scenario has no migration plans, so no application has a
  // migration path; it also lists no applications, so pick one from the
  // configured fixtures and open it there.
  await bootMockApi(page, "configured");
  const id = (await fixtureGraph(page)).applications[0].id;
  await page.goto(
    protoUrl(`/applications/${id}`, {
      scenario: "initial",
      params: { tab: "plan-runs" },
    })
  );
  await expect(main(page).getByText(emptySentence)).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: "Run migration plan" })
  ).toHaveCount(0);
  // The Migration tab next to it says why.
  await page.goto(
    protoUrl(`/applications/${id}`, {
      scenario: "initial",
      params: { tab: "migration" },
    })
  );
  await expect(
    main(page).getByRole("heading", { name: "No migration plan" })
  ).toBeVisible();
});
