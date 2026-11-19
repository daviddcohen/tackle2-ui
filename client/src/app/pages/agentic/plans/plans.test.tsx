import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, MigrationPlan, ModelProjection, PlanRun } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import MigrationPlansPage from "./plans";

// setupTests stubs useLocation; the list's URL state needs the real one.
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockGrantedScopes: { all: boolean; scopes: string[] } = {
  all: true,
  scopes: [],
};
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (required: string[]) =>
    mockGrantedScopes.all ||
    required.some((scope) => mockGrantedScopes.scopes.includes(scope)),
}));

const agent = {
  id: "7",
  name: "Code Migrator",
  model: { id: "1", name: "Claude" },
} as Agent;

const model = {
  id: "1",
  name: "Claude",
  provider: { id: "1", name: "Anthropic" },
  verificationStatus: "verified",
} as ModelProjection;

const basePlan: MigrationPlan = {
  id: "1",
  name: "Java EE to Quarkus",
  description: "",
  stages: [
    {
      id: "s1",
      name: "Migrate",
      agent: { id: "7", name: "Code Migrator" },
      instructions: "",
      requiresApproval: false,
      order: 1,
    },
  ],
  migrationPath: {
    archetype: { id: 1, name: "Java EE Application" },
    targetProfiles: [{ id: 11, name: "Quarkus 3.x" }],
    isDefault: true,
  },
  applicationImpact: {
    matching: 3,
    applications: [
      { id: 3, name: "Billing" },
      { id: 1, name: "Customer Management" },
      { id: 2, name: "Inventory Service" },
    ],
  },
  runCount: 1,
};

const planRun = (
  id: string,
  status: PlanRun["status"],
  startedAt: string,
  planId = "1"
) =>
  ({
    id,
    name: `Run #${id}`,
    planId,
    planName: basePlan.name,
    status,
    startedAt,
    applications: [],
    stageRuns: [],
  }) as unknown as PlanRun;

const run = planRun("4", "Running", "2026-11-01T10:00:00Z");

const useEndpoints = ({
  plans = [basePlan],
  models = [model],
  runs = [run],
}: {
  plans?: MigrationPlan[];
  models?: ModelProjection[];
  runs?: PlanRun[];
}) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) => res(ctx.json(plans))),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(ctx.json([agent]))
    ),
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      res(ctx.json(models))
    ),
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) =>
      res(ctx.json(runs))
    ),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([]))),
    rest.get(AGENTIC_ENDPOINTS.applicationMigrations, (_req, res, ctx) =>
      res(ctx.json({}))
    )
  );

const renderList = () =>
  render(
    <MemoryRouter initialEntries={["/migration-plans"]}>
      <MigrationPlansPage />
    </MemoryRouter>
  );

const row = async (name: string) =>
  (await screen.findByRole("link", { name })).closest("tr") as HTMLElement;

describe("MigrationPlansPage", () => {
  afterEach(() => {
    mockGrantedScopes.all = true;
    mockGrantedScopes.scopes = [];
  });

  it("lists each plan's name, applications and shown run, and nothing else", async () => {
    useEndpoints({});
    renderList();
    const plan = await row("Java EE to Quarkus");
    expect(
      screen
        .getAllByRole("columnheader")
        // The table controls add an unnamed column after the data.
        .filter((header) => header.textContent !== "")
        .map((header) => header.textContent)
    ).toEqual([
      "terms.name",
      "terms.applications",
      "agentic.plan.runs",
      "actions.rowActions",
    ]);
    // Two application labels link to their pages; PF's toggle holds the rest.
    const applications = within(plan).getByRole("list", {
      name: "agentic.plan.applicationsOfPlan",
    });
    expect(
      within(applications).getByRole("link", { name: "Billing" })
    ).toHaveAttribute("href", "/applications/3");
    expect(
      within(applications).getByRole("link", { name: "Customer Management" })
    ).toBeInTheDocument();
    expect(
      within(applications).queryByRole("link", { name: "Inventory Service" })
    ).toBeNull();
    // The overflow toggle and its expanded text are translated.
    expect(
      within(applications).getByRole("button", {
        name: "agentic.plan.moreApplications",
      })
    ).toBeInTheDocument();
    // The run's status links to it; one run has no count line.
    const status = await within(plan).findByRole("link", {
      name: "agentic.plan.runStatusLabel",
    });
    expect(status).toHaveAttribute("href", "/plan-runs/4");
    expect(status).toHaveTextContent("agentic.runStatus.running");
    expect(within(plan).queryByText("agentic.plan.runCount")).toBeNull();
    expect(within(plan).queryByLabelText(/configurationCheck/)).toBeNull();
  });

  it("expands the rest of the applications with a translated toggle", async () => {
    const user = userEvent.setup();
    useEndpoints({});
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", {
        name: "agentic.plan.moreApplications",
      })
    );
    expect(
      within(plan).getByRole("link", { name: "Inventory Service" })
    ).toBeInTheDocument();
    expect(
      within(plan).getByRole("button", { name: "terms.showLess" })
    ).toBeInTheDocument();
  });

  it("explains the Applications column in a help popover", async () => {
    const user = userEvent.setup();
    useEndpoints({});
    renderList();
    await row("Java EE to Quarkus");
    await user.click(
      screen.getByRole("button", { name: "agentic.plan.applicationsHelpLabel" })
    );
    expect(
      await screen.findByText("agentic.plan.applicationsHelp")
    ).toBeInTheDocument();
    // Translated close button and a named dialog, not PF's English defaults.
    expect(
      screen.getByRole("dialog", { name: "agentic.plan.applicationsHelpLabel" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "actions.close" })
    ).toBeInTheDocument();
  });

  it("shows the run that needs action, with the count, and Not run without runs", async () => {
    useEndpoints({
      plans: [
        basePlan,
        { ...basePlan, id: "2", name: "Spring Boot to Quarkus" },
      ],
      runs: [
        planRun("1", "AwaitingApproval", "2026-11-01T10:00:00Z"),
        planRun("2", "Succeeded", "2026-11-02T10:00:00Z"),
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    const status = await within(plan).findByRole("link", {
      name: "agentic.plan.runStatusLabel",
    });
    expect(status).toHaveAttribute("href", "/plan-runs/1");
    expect(status).toHaveTextContent("agentic.runStatus.awaitingApproval");
    expect(within(plan).getByText("agentic.plan.runCount")).toBeInTheDocument();
    const other = await row("Spring Boot to Quarkus");
    expect(within(other).getByText("agentic.plan.notRun")).toBeInTheDocument();
  });

  it("waits for runs only in the Runs cell, and says Unavailable if they fail", async () => {
    let releaseRuns = () => {};
    const runsReleased = new Promise<void>((resolve) => {
      releaseRuns = resolve;
    });
    useEndpoints({});
    server.use(
      rest.get(AGENTIC_ENDPOINTS.planRuns, async (_req, res, ctx) => {
        await runsReleased;
        return res(ctx.status(500));
      })
    );
    renderList();
    const plan = await row("Java EE to Quarkus");
    // The rest of the row is there while the runs load.
    expect(within(plan).getByRole("link", { name: "Billing" })).toBeVisible();
    expect(within(plan).getByText("terms.loading")).toBeInTheDocument();
    releaseRuns();
    expect(
      await within(plan).findByText(
        "agentic.common.unavailable",
        {},
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
  });

  it("marks a plan whose stages use a model that is not verified", async () => {
    useEndpoints({ models: [{ ...model, verificationStatus: "pending" }] });
    renderList();
    const plan = await row("Java EE to Quarkus");
    expect(
      await within(plan).findByLabelText(
        "agentic.plan.configurationCheck.models.unavailable"
      )
    ).toBeInTheDocument();
  });

  it("says None without applications and a count when the server only counts them", async () => {
    useEndpoints({
      plans: [
        { ...basePlan, applicationImpact: { matching: 0, applications: [] } },
        {
          ...basePlan,
          id: "2",
          name: "Spring Boot to Quarkus",
          applicationImpact: { matching: 2 },
        },
      ],
    });
    renderList();
    const empty = await row("Java EE to Quarkus");
    expect(within(empty).getByText("terms.none")).toBeInTheDocument();
    const counted = await row("Spring Boot to Quarkus");
    expect(
      within(counted).getByRole("link", {
        name: "agentic.plan.applicationCount",
      })
    ).toBeInTheDocument();
  });

  it("says Unavailable for the applications the server did not report", async () => {
    useEndpoints({
      plans: [
        {
          ...basePlan,
          migrationPath: undefined,
          applicationImpact: undefined,
          runCount: undefined,
        },
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    expect(
      within(plan).getAllByText("agentic.common.unavailable")
    ).toHaveLength(1);
  });

  it("shows no marker until agents and models load, and none if they fail", async () => {
    let releaseModels = () => {};
    const modelsReleased = new Promise<void>((resolve) => {
      releaseModels = resolve;
    });
    const unverified = { ...model, verificationStatus: "pending" };
    useEndpoints({});
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, async (_req, res, ctx) => {
        await modelsReleased;
        return res(ctx.json([unverified]));
      })
    );
    const marker = "agentic.plan.configurationCheck.models.unavailable";
    const { unmount } = renderList();
    const plan = await row("Java EE to Quarkus");
    expect(within(plan).queryByLabelText(marker)).toBeNull();
    releaseModels();
    expect(await within(plan).findByLabelText(marker)).toBeInTheDocument();
    unmount();

    // A plan without a path has an issue whatever agents say, but no marker
    // is shown while the agents query has failed.
    let agentRequests = 0;
    useEndpoints({ plans: [{ ...basePlan, migrationPath: undefined }] });
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) => {
        agentRequests += 1;
        return res(ctx.status(500));
      })
    );
    renderList();
    const failed = await row("Java EE to Quarkus");
    // The request and its one retry have both failed.
    await waitFor(() => expect(agentRequests).toBe(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(failed).queryByLabelText(/configurationCheck/)).toBeNull();
  });

  it("offers Edit, Run migration plan, a separator and Delete", async () => {
    const user = userEvent.setup();
    useEndpoints({});
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual([
      "actions.edit",
      "agentic.execution.startMigration",
      "actions.delete",
    ]);
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    const runItem = screen.getByRole("menuitem", {
      name: "agentic.execution.startMigration",
    });
    expect(runItem).not.toHaveAttribute("aria-disabled", "true");

    // It opens the dialog on this plan's applications, with the plan fixed.
    await user.click(runItem);
    const dialog = await screen.findByRole("dialog", {
      name: "agentic.execution.startMigration",
    });
    expect(
      within(dialog).getByText(
        "agentic.execution.preflightDescriptionPlanProfile"
      )
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("link", { name: "Inventory Service" })
    ).toBeInTheDocument();
  });

  it("disables Run migration plan with the reason", async () => {
    const user = userEvent.setup();
    useEndpoints({
      plans: [
        { ...basePlan, applicationImpact: { matching: 0, applications: [] } },
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    const runItem = screen.getByRole("menuitem", {
      name: "agentic.execution.startMigration",
    });
    expect(runItem).toHaveAttribute("aria-disabled", "true");
    await user.hover(runItem);
    expect(
      await screen.findByText("agentic.plan.runBlocked.noApplications")
    ).toBeInTheDocument();
  });

  it("shows the Run reason when the disabled item gets keyboard focus", async () => {
    const user = userEvent.setup();
    useEndpoints({
      plans: [
        { ...basePlan, applicationImpact: { matching: 0, applications: [] } },
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    const runItem = screen.getByRole("menuitem", {
      name: "agentic.execution.startMigration",
    });
    expect(runItem).toHaveAttribute("id", "migration-plans-table-row-1-run");
    // Arrow keys move through the items until Run has focus.
    for (let step = 0; step < 4 && document.activeElement !== runItem; step++)
      await user.keyboard("{ArrowDown}");
    expect(runItem).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "agentic.plan.runBlocked.noApplications"
    );
  });

  it("offers Edit and Delete but no Run with the plan scope alone", async () => {
    const user = userEvent.setup();
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = [
      "agentic.workflows:get",
      "agentic.workflows:post",
      "agentic.workflows:put",
      "agentic.workflows:delete",
    ];
    useEndpoints({});
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["actions.edit", "actions.delete"]);
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
  });

  it("does not block running on a model that is not verified", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: [{ ...model, verificationStatus: "pending" }] });
    renderList();
    const plan = await row("Java EE to Quarkus");
    // The marker still warns.
    await within(plan).findByLabelText(
      "agentic.plan.configurationCheck.models.unavailable"
    );
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    expect(
      screen.getByRole("menuitem", { name: "agentic.execution.startMigration" })
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("offers only Run migration plan with the run scope alone", async () => {
    const user = userEvent.setup();
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = [
      "agentic.workflows:get",
      "agentic.workflowruns:post",
    ];
    useEndpoints({
      plans: [{ ...basePlan, stages: [] }],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    expect(
      screen.queryByRole("button", { name: "agentic.plan.createTitle" })
    ).toBeNull();
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["agentic.execution.startMigration"]);
    expect(within(menu).queryByRole("separator")).toBeNull();
    // No edit fix for a user who cannot edit.
    await user.hover(within(menu).getByRole("menuitem"));
    expect(
      await screen.findByText("agentic.plan.runBlocked.noStages")
    ).toBeInTheDocument();
  });

  it("filters by archetype, with Not assigned for plans without a path", async () => {
    const user = userEvent.setup();
    useEndpoints({
      plans: [
        basePlan,
        {
          ...basePlan,
          id: "2",
          name: "Java EE lift and shift",
          migrationPath: undefined,
        },
      ],
    });
    renderList();
    await row("Java EE to Quarkus");
    // The category toggle, not the Name column's sort button.
    const categories = screen
      .getAllByRole("button", { name: "terms.name" })
      .find((button) => button.getAttribute("aria-haspopup") === "menu");
    await user.click(categories as HTMLElement);
    await user.click(
      await screen.findByRole("menuitem", { name: "terms.archetype" })
    );
    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("menuitem");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Java EE Application",
      "agentic.execution.notAssigned",
    ]);
    await user.click(within(options[1]).getByRole("checkbox"));
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Java EE to Quarkus" })
      ).toBeNull()
    );
    expect(
      screen.getByRole("link", { name: "Java EE lift and shift" })
    ).toBeInTheDocument();
  });

  it("disables Edit and Delete of a plan managed by Konveyor", async () => {
    const user = userEvent.setup();
    useEndpoints({
      plans: [
        {
          ...basePlan,
          operatorManaged: true,
          applicationImpact: { matching: 0 },
          runCount: 0,
        },
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", { name: /Kebab toggle/ })
    );
    for (const name of ["actions.edit", "actions.delete"]) {
      expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
    }
  });

  it("offers a create action in the empty state", async () => {
    useEndpoints({ plans: [] });
    renderList();
    expect(
      await screen.findByText("agentic.plan.emptyDescription")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "agentic.plan.createTitle" })
    ).toHaveLength(2);
  });

  it("is read-only without the plan write scope", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.workflows:get"];
    useEndpoints({});
    renderList();
    await row("Java EE to Quarkus");
    expect(
      screen.queryByRole("button", { name: "agentic.plan.createTitle" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Kebab toggle/ })).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "actions.rowActions" })
    ).toBeNull();
  });

  it("explains where plans come from when the list is empty and read-only", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.workflows:get"];
    useEndpoints({ plans: [] });
    renderList();
    expect(
      await screen.findByText("agentic.plan.emptyDescriptionReadOnly")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /createTitle/ })).toBeNull()
    );
  });
});
