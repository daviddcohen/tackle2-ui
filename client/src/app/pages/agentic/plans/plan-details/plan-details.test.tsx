import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Agent, MigrationPlan, ModelProjection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { adminScopes, architectScopes } from "@app/auth/roles-to-scopes";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import PlanDetailsPage from "./plan-details";

// setupTests stubs useLocation; the URL tabs and the delete redirect need the real one.
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

const agent: Agent = {
  id: "7",
  name: "Code Migrator",
  description: "",
  model: { id: "1", name: "Claude" },
  skills: [],
  prompt: "",
  capabilities: [],
  parameters: [],
};

const verifiedModel: ModelProjection = {
  id: "1",
  name: "Claude",
  provider: { id: "1", name: "Anthropic" },
  model: "claude",
  verificationStatus: "verified",
  isOrganizationDefault: true,
};

const plan: MigrationPlan = {
  id: "1",
  name: "Java EE to Quarkus",
  description: "Moves Java EE applications to Quarkus.",
  stages: [
    {
      id: "s1",
      name: "Migrate",
      agent: { id: "7", name: "Code Migrator" },
      instructions: "First paragraph.\n\nSecond paragraph.",
      requiresApproval: true,
      order: 1,
    },
  ],
  migrationPath: {
    archetype: { id: 1, name: "Java EE Application" },
    targetProfiles: [{ id: 11, name: "Quarkus 3.x" }],
    isDefault: true,
  },
  effectiveSkills: [
    {
      skill: { id: "3", name: "Quarkus best practices" },
      scope: "targetProfile",
      scopeName: "Quarkus 3.x",
    },
  ],
  applicationImpact: { matching: 3 },
  runCount: 0,
};

const useEndpoints = (
  detail: MigrationPlan,
  { models = [verifiedModel] }: { models?: ModelProjection[] } = {}
) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.plans}/:id`, (_req, res, ctx) =>
      res(ctx.json(detail))
    ),
    rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
      res(ctx.json([detail]))
    ),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(ctx.json([agent]))
    ),
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      res(ctx.json(models))
    ),
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) => res(ctx.json([]))),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([])))
  );

const renderAt = (url = "/migration-plans/1") => {
  const notifications = createMockNotifications();
  let location = "";
  render(
    <NotificationsContext.Provider value={notifications}>
      <MemoryRouter initialEntries={[url]}>
        <Route path={DevPaths.migrationPlanDetails}>
          <PlanDetailsPage />
        </Route>
        <Route
          path="*"
          render={(props) => {
            location = props.location.pathname;
            return null;
          }}
        />
      </MemoryRouter>
    </NotificationsContext.Provider>
  );
  return { notifications, location: () => location };
};

const fact = (term: string) =>
  screen.getByText(term, { selector: ".pf-v6-c-description-list__text" })
    .parentElement?.nextElementSibling as HTMLElement;

describe("PlanDetailsPage", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    mockGrantedScopes.all = true;
    mockGrantedScopes.scopes = [];
  });

  it("shows the facts, the stages and the skills of the plan", async () => {
    useEndpoints(plan);
    renderAt();
    await screen.findByRole("heading", {
      level: 1,
      name: "Java EE to Quarkus",
    });
    expect(
      screen.getByText("Moves Java EE applications to Quarkus.")
    ).toBeInTheDocument();
    expect(
      within(fact("terms.archetype")).getByRole("link", {
        name: "Java EE Application",
      })
    ).toBeInTheDocument();
    expect(
      within(fact("terms.applications")).getByRole("link", {
        name: "agentic.plan.applicationCount",
      })
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/applications?filters=")
    );
    expect(within(fact("agentic.plan.runs")).getByText("terms.none"));
    await waitFor(() =>
      expect(
        within(fact("agentic.plan.configuration")).getByText(
          "agentic.configurationStatus.checksPassed"
        )
      ).toBeInTheDocument()
    );

    const stages = screen.getByRole("grid", { name: "agentic.plan.stages" });
    expect(within(stages).getByText("agentic.plan.requiresApproval"));
    expect(
      within(stages).getByRole("link", { name: "Code Migrator" })
    ).toBeInTheDocument();
    expect(within(stages).getByText("Anthropic")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "agentic.planDetail.skillsTitle" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names the stages whose model is not verified", async () => {
    useEndpoints(plan, {
      models: [{ ...verifiedModel, verificationStatus: "pending" }],
    });
    renderAt();
    expect(
      await screen.findByText("agentic.plan.affectedStage")
    ).toBeInTheDocument();
    expect(
      screen.getByText("agentic.plan.configurationCheck.models.unavailable")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.plan.viewModels" })
    ).toHaveAttribute("href", "/models");
    expect(
      within(fact("agentic.plan.configuration")).getByText(
        "agentic.configurationStatus.issues"
      )
    ).toBeInTheDocument();
  });

  it("offers View models only to users who can open Models", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.workflows:get"];
    useEndpoints(plan, {
      models: [{ ...verifiedModel, verificationStatus: "pending" }],
    });
    renderAt();
    await screen.findByText("agentic.plan.affectedStage");
    expect(
      screen.queryByRole("link", { name: "agentic.plan.viewModels" })
    ).toBeNull();
  });

  it.each([
    ["architects, who cannot open Models", architectScopes, false],
    ["platform engineers", adminScopes, true],
  ])("View models with the scopes of %s", async (_, scopes, shown) => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = scopes;
    useEndpoints(plan, {
      models: [{ ...verifiedModel, verificationStatus: "pending" }],
    });
    renderAt();
    await screen.findByText("agentic.plan.affectedStage");
    const link = screen.queryByRole("link", {
      name: "agentic.plan.viewModels",
    });
    if (shown) {
      expect(link).toHaveAttribute("href", "/models");
    } else {
      expect(link).toBeNull();
    }
  });

  it("says Unavailable for the path, usage and skills the server did not report", async () => {
    const user = userEvent.setup();
    useEndpoints({
      ...plan,
      migrationPath: undefined,
      applicationImpact: undefined,
      effectiveSkills: undefined,
    });
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    for (const term of [
      "terms.archetype",
      "terms.targetProfiles",
      "terms.applications",
    ]) {
      expect(
        within(fact(term)).getByText("agentic.common.unavailable")
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", {
        name: "agentic.planDetail.skillsTitleEmpty",
      })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "agentic.common.actions" })
    );
    expect(
      screen.getByRole("menuitem", { name: "actions.delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("says Not evaluated, with the reason, when a check cannot run", async () => {
    const user = userEvent.setup();
    useEndpoints({ ...plan, effectiveSkills: undefined });
    renderAt();
    const status = await within(
      await waitFor(() => fact("agentic.plan.configuration"))
    ).findByText("agentic.configurationStatus.notEvaluated");
    await user.hover(status);
    expect(
      await screen.findByText(
        "agentic.plan.configurationCheck.skills.notEvaluated"
      )
    ).toBeInTheDocument();
  });

  it("disables Edit and Delete of a plan managed by Konveyor", async () => {
    const user = userEvent.setup();
    useEndpoints({
      ...plan,
      operatorManaged: true,
      applicationImpact: { matching: 0 },
      migrationPath: { ...plan.migrationPath!, isDefault: false },
    });
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    await user.click(
      screen.getByRole("button", { name: "agentic.common.actions" })
    );
    for (const name of ["actions.edit", "actions.delete"]) {
      expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
    }
    await user.hover(screen.getByRole("menuitem", { name: "actions.delete" }));
    expect(
      await screen.findByText("agentic.common.managedByKonveyor")
    ).toBeInTheDocument();
  });

  it("says when no skills apply", async () => {
    useEndpoints({ ...plan, effectiveSkills: [] });
    renderAt();
    expect(
      await screen.findByText("agentic.planDetail.skillsEmpty")
    ).toBeInTheDocument();
  });

  it("cues a plan that is not assigned to its target profiles", async () => {
    useEndpoints({
      ...plan,
      migrationPath: { ...plan.migrationPath!, isDefault: false },
    });
    renderAt();
    expect(
      await screen.findByText("agentic.plan.notAssignedCue", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.plan.viewTargetProfiles" })
    ).toHaveAttribute("href", "/archetypes/1/target-profiles");
  });

  it("deletes an unused plan and returns to the list", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    let detailFetches = 0;
    const unused: MigrationPlan = {
      ...plan,
      applicationImpact: { matching: 0 },
      migrationPath: { ...plan.migrationPath!, isDefault: false },
    };
    useEndpoints(unused);
    server.use(
      rest.delete(`${AGENTIC_ENDPOINTS.plans}/:id`, (req, res, ctx) => {
        deleted.push(String(req.params.id));
        return res(ctx.status(204));
      }),
      rest.get(`${AGENTIC_ENDPOINTS.plans}/:id`, (_req, res, ctx) => {
        detailFetches += 1;
        return deleted.length > 0
          ? res(ctx.status(404))
          : res(ctx.json(unused));
      })
    );
    const { notifications, location } = renderAt();
    await screen.findByRole("heading", { level: 1 });
    await user.click(
      screen.getByRole("button", { name: "agentic.common.actions" })
    );
    await user.click(screen.getByRole("menuitem", { name: "actions.delete" }));
    expect(
      screen.getByText("agentic.plan.deleteDescription")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "actions.delete" }));
    await waitFor(() => expect(deleted).toEqual(["1"]));
    await waitFor(() => expect(location()).toBe("/migration-plans"));
    // The page left before it could refetch the deleted plan.
    expect(detailFetches).toBe(1);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "agentic.plan.deleted",
      variant: "success",
    });
  });

  it("has no Actions menu and no start sentence without the write scopes", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.workflows:get"];
    useEndpoints({ ...plan, runCount: 1 });
    server.use(
      rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) =>
        res(
          ctx.json([
            {
              id: "1",
              name: "Run #1",
              planId: "1",
              planName: plan.name,
              status: "Running",
              applications: [],
              stageRuns: [],
            },
          ])
        )
      )
    );
    renderAt("/migration-plans/1?tab=runs");
    await waitFor(() =>
      expect(
        screen.getByText("agentic.planDetail.runsDescription")
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "agentic.common.actions" })
    ).toBeNull();
  });

  it("says No runs yet with a link to the inventory when the plan has no runs", async () => {
    useEndpoints(plan);
    renderAt("/migration-plans/1?tab=runs");
    expect(
      await screen.findByText("agentic.planDetail.runsEmptyTitle")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "agentic.planDetail.runsTitleEmpty" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.planDetail.goToInventory" })
    ).toHaveAttribute("href", expect.stringMatching(/^\/applications/));
  });

  it("shows the runs table spinner, then its error row when runs fail to load", async () => {
    useEndpoints(plan);
    server.use(
      // A 4xx is not retried, so the error shows at once.
      rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) =>
        res(ctx.delay(100), ctx.status(403))
      )
    );
    // useUrlParams writes back with document.location's pathname: keep it on the page.
    window.history.replaceState(null, "", "/migration-plans/1?tab=runs");
    renderAt("/migration-plans/1?tab=runs");
    expect(
      await screen.findByRole("heading", {
        name: "agentic.planDetail.runsTitleEmpty",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(
      await screen.findByText("message.unableToConnect")
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("agentic.planDetail.runsEmptyTitle")).toBeNull();
  });

  it("falls back to Details for the removed Knowledge base tab", async () => {
    useEndpoints(plan);
    renderAt("/migration-plans/1?tab=knowledge-base");
    expect(
      await screen.findByRole("tab", {
        name: "agentic.planDetail.tabDetails",
        selected: true,
      })
    ).toBeInTheDocument();
  });
});
