import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, MigrationPlan, ModelProjection } from "@app/agentic";
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

const useEndpoints = ({
  plans = [basePlan],
  models = [model],
}: {
  plans?: MigrationPlan[];
  models?: ModelProjection[];
}) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) => res(ctx.json(plans))),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(ctx.json([agent]))
    ),
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      res(ctx.json(models))
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

  it("lists each plan's name and target profiles, and nothing else", async () => {
    useEndpoints({});
    renderList();
    const plan = await row("Java EE to Quarkus");
    expect(
      screen
        .getAllByRole("columnheader")
        // The table controls add an unnamed column after the data.
        .filter((header) => header.textContent !== "")
        .map((header) => header.textContent)
    ).toEqual(["terms.name", "terms.targetProfiles", "actions.rowActions"]);
    // One target profile is shown inline (its copy and link are covered by
    // the cell's own tests, which render English).
    expect(
      within(plan).getByText("agentic.plan.targetProfilePath")
    ).toBeInTheDocument();
    expect(within(plan).queryByLabelText(/configurationCheck/)).toBeNull();
  });

  it("explains the Target profiles column in a help popover", async () => {
    const user = userEvent.setup();
    useEndpoints({});
    renderList();
    await row("Java EE to Quarkus");
    await user.click(
      screen.getByRole("button", {
        name: "agentic.plan.targetProfilesHelpLabel",
      })
    );
    expect(
      await screen.findByText("agentic.plan.targetProfilesHelp")
    ).toBeInTheDocument();
    // Translated close button and a named dialog, not PF's English defaults.
    expect(
      screen.getByRole("dialog", {
        name: "agentic.plan.targetProfilesHelpLabel",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "actions.close" })
    ).toBeInTheDocument();
  });

  it("says Not assigned when no target profile uses the plan", async () => {
    useEndpoints({
      plans: [
        { ...basePlan, migrationPath: undefined },
        {
          ...basePlan,
          id: "2",
          name: "Not the default",
          migrationPath: { ...basePlan.migrationPath!, isDefault: false },
        },
        {
          ...basePlan,
          id: "3",
          name: "No profiles",
          migrationPath: { ...basePlan.migrationPath!, targetProfiles: [] },
        },
      ],
    });
    renderList();
    for (const name of [
      "Java EE to Quarkus",
      "Not the default",
      "No profiles",
    ]) {
      const plan = await row(name);
      expect(
        within(plan).getByText("agentic.execution.notAssigned")
      ).toBeInTheDocument();
      expect(within(plan).getAllByRole("link")).toHaveLength(1);
    }
  });

  it("counts several target profiles and lists them in a popover", async () => {
    const user = userEvent.setup();
    useEndpoints({
      plans: [
        {
          ...basePlan,
          migrationPath: {
            ...basePlan.migrationPath!,
            targetProfiles: [
              { id: 12, name: "Spring Boot 3" },
              { id: 11, name: "Quarkus 3.x" },
            ],
          },
        },
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    await user.click(
      within(plan).getByRole("button", {
        name: "agentic.plan.targetProfileCount",
      })
    );
    const popover = await screen.findByRole("dialog", {
      name: "agentic.plan.targetProfilesOfPlan",
    });
    expect(within(popover).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(popover).getByRole("button", { name: "actions.close" })
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

  it("marks no plan for having no migration path", async () => {
    // Plans without a path run when someone picks them: not an issue.
    useEndpoints({
      plans: [
        { ...basePlan, migrationPath: undefined },
        { ...basePlan, id: "9", name: "No stages yet", stages: [] },
      ],
    });
    renderList();
    const plan = await row("Java EE to Quarkus");
    // The checks have run once the plan without stages shows its marker.
    expect(
      await within(await row("No stages yet")).findByLabelText(
        "agentic.plan.configurationCheck.stages.empty"
      )
    ).toBeInTheDocument();
    expect(within(plan).queryByLabelText(/configurationCheck/)).toBeNull();
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

    // A plan without stages has an issue whatever agents say, but no marker
    // is shown while the agents query has failed.
    let agentRequests = 0;
    useEndpoints({ plans: [{ ...basePlan, stages: [] }] });
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
    // The reason is the item's description and its tooltip on hover.
    expect(runItem).toHaveAccessibleDescription(
      "agentic.plan.runBlocked.noApplications"
    );
    await user.hover(runItem);
    expect(
      await screen.findByText("agentic.plan.runBlocked.noApplications", {
        selector: '[role="tooltip"] *',
      })
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
    expect(runItem).toHaveAccessibleDescription(
      "agentic.plan.runBlocked.noApplications"
    );
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
      await screen.findByText("agentic.plan.runBlocked.noStages", {
        selector: '[role="tooltip"] *',
      })
    ).toBeInTheDocument();
  });

  it("filters by the archetypes of the target profiles, with Not assigned", async () => {
    const user = userEvent.setup();
    useEndpoints({
      plans: [
        basePlan,
        {
          ...basePlan,
          id: "2",
          name: "Spring Boot upgrade",
          migrationPath: {
            archetype: { id: 2, name: "Spring Boot Application" },
            targetProfiles: [{ id: 21, name: "Spring Boot 3" }],
            isDefault: true,
          },
        },
        {
          ...basePlan,
          id: "3",
          name: "Draft plan",
          migrationPath: {
            archetype: { id: 3, name: "Node.js Service" },
            targetProfiles: [{ id: 31, name: "Node 22" }],
            isDefault: false,
          },
        },
        {
          ...basePlan,
          id: "4",
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
    // Only archetypes whose target profiles use a listed plan.
    const options = screen.getAllByRole("menuitem");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Java EE Application",
      "Spring Boot Application",
      "agentic.execution.notAssigned",
    ]);
    await user.click(within(options[2]).getByRole("checkbox"));
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Java EE to Quarkus" })
      ).toBeNull()
    );
    expect(
      screen.queryByRole("link", { name: "Spring Boot upgrade" })
    ).toBeNull();
    // The rows the column says Not assigned for.
    for (const name of ["Draft plan", "Java EE lift and shift"]) {
      expect(
        within(await row(name)).getByText("agentic.execution.notAssigned")
      ).toBeInTheDocument();
    }
    await user.click(within(options[2]).getByRole("checkbox"));
    await user.click(within(options[1]).getByRole("checkbox"));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Draft plan" })).toBeNull()
    );
    expect(
      screen.getByRole("link", { name: "Spring Boot upgrade" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Java EE to Quarkus" })
    ).toBeNull();
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
