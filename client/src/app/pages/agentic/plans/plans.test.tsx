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
  applicationImpact: { matching: 1 },
  runCount: 1,
};

const run = {
  id: "4",
  name: "Run #4",
  planId: "1",
  planName: basePlan.name,
  status: "Running",
  applications: [],
  stageRuns: [],
} as unknown as PlanRun;

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
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) =>
      res(ctx.json([run]))
    ),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([])))
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

  it("lists each plan's archetype, target profile, applications and runs", async () => {
    useEndpoints({});
    renderList();
    const plan = await row("Java EE to Quarkus");
    expect(
      within(plan).getByRole("link", { name: "Java EE Application" })
    ).toBeInTheDocument();
    expect(
      within(plan).getByRole("link", { name: "Quarkus 3.x" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
    // One application stays a count (addenda P4); one run is its name.
    expect(
      within(plan).getByRole("link", { name: "agentic.plan.applicationCount" })
    ).toBeInTheDocument();
    expect(
      await within(plan).findByRole("link", { name: "Run #4" })
    ).toHaveAttribute("href", "/plan-runs/4");
    expect(within(plan).queryByLabelText(/configurationCheck/)).toBeNull();
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

  it("says Unavailable for the path and usage the server did not report", async () => {
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
    // Archetype, Target profiles, Applications and Runs.
    expect(
      within(plan).getAllByText("agentic.common.unavailable")
    ).toHaveLength(4);
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
