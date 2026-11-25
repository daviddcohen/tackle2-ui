import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  Agent,
  EntityRef,
  MigrationPlan,
  ModelProjection,
  SkillsByStage,
} from "@app/agentic";
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
  migrationPaths: [
    {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfile: { id: 11, name: "Quarkus 3.x" },
    },
  ],
  applicationImpact: { matching: 3 },
  runCount: 0,
};

/** The target profile skills the plan's Every stage group gets. */
const PROFILE_SKILLS: EntityRef[] = [
  { id: "3", name: "Quarkus best practices" },
];

/**
 * The plan's skill resolution: its stages without skills, then
 * `profileSkills` as the Every stage group. With `profileSkills` null the
 * resolution is missing, as on a backend that cannot resolve a plan's
 * skills.
 */
const resolvedSkills = (
  detail: MigrationPlan,
  profileSkills: EntityRef[] | null
): SkillsByStage | undefined =>
  profileSkills == null
    ? undefined
    : {
        stages: detail.stages.map((stage) => ({
          order: stage.order,
          name: stage.name,
          agent: stage.agent,
          skills: [],
        })),
        everyStage: [
          {
            skills: profileSkills.map((skill) => ({
              skill,
              loadPolicy: "skill",
              from: [
                {
                  kind: "targetProfile",
                  targetProfile: { id: 11, name: "Quarkus 3.x" },
                  archetype: { id: 1, name: "Java EE Application" },
                },
              ],
              excluded: false,
            })),
          },
        ],
      };

const useEndpoints = (
  detail: MigrationPlan,
  {
    models = [verifiedModel],
    profileSkills = PROFILE_SKILLS,
  }: { models?: ModelProjection[]; profileSkills?: EntityRef[] | null } = {}
) =>
  server.use(
    rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) => {
      const skills = resolvedSkills(detail, profileSkills);
      return skills == null ? res(ctx.status(404)) : res(ctx.json(skills));
    }),
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
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([]))),
    rest.get(AGENTIC_ENDPOINTS.applicationMigrations, (_req, res, ctx) =>
      res(ctx.json({}))
    )
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
    // One Target profiles fact, each profile with its archetype; no
    // Archetype fact of its own.
    expect(
      within(fact("terms.targetProfiles")).getByRole("link", {
        name: "agentic.skill.targetProfileOption",
      })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
    expect(
      screen.queryByText("terms.archetype", {
        selector: ".pf-v6-c-description-list__text",
      })
    ).toBeNull();
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
    // The skills come from the plan skill resolution, which answers on its own.
    expect(
      await screen.findByRole("grid", { name: "agentic.stageSkills.title" })
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
    // The alert says it; the Configuration fact would repeat it.
    expect(
      screen
        .getAllByRole("term")
        .filter((term) => term.textContent === "agentic.plan.configuration")
    ).toHaveLength(0);
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

  it("says Unavailable for target profiles, usage and skills the server did not report", async () => {
    const user = userEvent.setup();
    useEndpoints(
      {
        ...plan,
        migrationPaths: undefined,
        applicationImpact: undefined,
      },
      { profileSkills: null }
    );
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    // Unknown, never "Not assigned".
    expect(
      within(fact("terms.targetProfiles")).getByText(
        "agentic.common.unavailable"
      )
    ).toBeInTheDocument();
    expect(
      within(fact("terms.applications")).getByText("agentic.common.unavailable")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("agentic.planDetail.skillsNotAvailable")
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
    useEndpoints(plan);
    // A client error is not retried: the models check cannot run at once.
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(ctx.status(403))
      )
    );
    renderAt();
    const status = await within(
      await waitFor(() => fact("agentic.plan.configuration"))
    ).findByText("agentic.configurationStatus.notEvaluated");
    await user.hover(status);
    expect(
      await screen.findByText(
        "agentic.plan.configurationCheck.models.notEvaluated"
      )
    ).toBeInTheDocument();
  });

  it("has no configuration issue for a plan no target profile uses", async () => {
    // Such a plan is run when someone picks it (plans 4 and 7).
    useEndpoints({ ...plan, migrationPaths: [] });
    renderAt();
    await waitFor(() =>
      expect(
        within(fact("agentic.plan.configuration")).getByText(
          "agentic.configurationStatus.checksPassed"
        )
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables Edit and Delete of a plan managed by Konveyor", async () => {
    const user = userEvent.setup();
    useEndpoints({
      ...plan,
      operatorManaged: true,
      applicationImpact: { matching: 0 },
      migrationPaths: [],
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
    useEndpoints(plan, { profileSkills: [] });
    renderAt();
    const table = await screen.findByRole("grid", {
      name: "agentic.stageSkills.title",
    });
    // The stage group and the Every stage group each say so.
    expect(
      within(table).getAllByText("agentic.stageSkills.noSkills")
    ).toHaveLength(2);
  });

  it("shows every target profile that uses the plan, across archetypes", async () => {
    useEndpoints({
      ...plan,
      migrationPaths: [
        ...plan.migrationPaths!,
        {
          archetype: { id: 3, name: "Legacy Java Application" },
          targetProfile: { id: 32, name: "Java 8 on OpenShift" },
        },
      ],
    });
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    const links = within(fact("terms.targetProfiles")).getAllByRole("link");
    // In the server's order, each named with its archetype and linked to
    // its target profile.
    expect(links.map((link) => link.textContent)).toEqual([
      "agentic.skill.targetProfileOption",
      "agentic.skill.targetProfileOption",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/archetypes/1/target-profiles#target-profile-11",
      "/archetypes/3/target-profiles#target-profile-32",
    ]);
  });

  it("says Not assigned when no target profile uses the plan", async () => {
    useEndpoints({ ...plan, migrationPaths: [] });
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    expect(
      within(fact("terms.targetProfiles")).getByText(
        "agentic.execution.notAssigned"
      )
    ).toBeInTheDocument();
    // The next step, above the facts: assign it on an archetype's page.
    expect(
      screen.getByText("agentic.plan.notAssignedTitle")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.execution.goToArchetypes" })
    ).toHaveAttribute("href", "/archetypes");
  });

  it("has no assignment note for a plan a target profile uses", async () => {
    useEndpoints(plan);
    renderAt();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("agentic.plan.notAssignedTitle")).toBeNull();
  });

  it("deletes an unused plan and returns to the list", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    let detailFetches = 0;
    const unused: MigrationPlan = {
      ...plan,
      applicationImpact: { matching: 0 },
      migrationPaths: [],
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

  it("has no Actions menu without the write scopes", async () => {
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

  const runnable: MigrationPlan = {
    ...plan,
    applicationImpact: {
      matching: 2,
      applications: [
        { id: 2, name: "Billing" },
        { id: 1, name: "Customer Management" },
      ],
    },
  };
  const runItemName = "agentic.execution.startMigration";
  const openActions = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(
      await screen.findByRole("button", { name: "agentic.common.actions" })
    );

  it("lists Run migration plan between Edit and Delete and opens the dialog on the plan", async () => {
    const user = userEvent.setup();
    useEndpoints(runnable);
    renderAt();
    await openActions(user);
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["actions.edit", runItemName, "actions.delete"]);
    const runItem = screen.getByRole("menuitem", { name: runItemName });
    expect(runItem).not.toHaveAttribute("aria-disabled", "true");
    await user.click(runItem);
    const dialog = await screen.findByRole("dialog", { name: runItemName });
    expect(
      within(dialog).getByText(
        "agentic.execution.preflightDescriptionPlanProfile"
      )
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("link", { name: "Billing" })
    ).toBeInTheDocument();
  });

  it("disables Run migration plan with the reason", async () => {
    const user = userEvent.setup();
    useEndpoints({ ...runnable, migrationPaths: [] });
    renderAt();
    await openActions(user);
    const runItem = screen.getByRole("menuitem", { name: runItemName });
    expect(runItem).toHaveAttribute("aria-disabled", "true");
    await user.hover(runItem);
    expect(
      await screen.findByText("agentic.plan.runBlocked.notAssigned")
    ).toBeInTheDocument();
  });

  it("offers only Run migration plan with the run scope alone", async () => {
    const user = userEvent.setup();
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = [
      "agentic.workflows:get",
      "agentic.workflowruns:post",
    ];
    useEndpoints(runnable);
    renderAt();
    await openActions(user);
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual([runItemName]);
  });

  it("says in one sentence that the plan has no runs and offers Run migration plan", async () => {
    const user = userEvent.setup();
    useEndpoints(runnable);
    renderAt("/migration-plans/1?tab=runs");
    expect(
      await screen.findByText("agentic.planDetail.runsEmptyDescription")
    ).toBeInTheDocument();
    // Like the other section empty states: the section heading, then one
    // sentence, no title of its own.
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toContain(
      "agentic.planDetail.runsTitleEmpty"
    );
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    const runButton = screen.getByRole("button", { name: runItemName });
    expect(runButton).toHaveClass("pf-m-link");
    await user.click(runButton);
    expect(
      await screen.findByRole("dialog", { name: runItemName })
    ).toBeInTheDocument();
  });

  it("disables the empty state's Run migration plan with the reason", async () => {
    const user = userEvent.setup();
    useEndpoints({ ...runnable, stages: [] });
    renderAt("/migration-plans/1?tab=runs");
    const runButton = await screen.findByRole("button", { name: runItemName });
    expect(runButton).toHaveAttribute("aria-disabled", "true");
    await user.hover(runButton);
    expect(
      await screen.findByText("agentic.plan.runBlocked.noStagesEdit")
    ).toBeInTheDocument();
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
    useEndpoints(runnable);
    renderAt();
    await openActions(user);
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["actions.edit", "actions.delete"]);
    expect(
      within(screen.getByRole("menu")).getByRole("separator")
    ).toBeInTheDocument();
  });

  it("offers no run in the Runs tab with the plan scope alone", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = [
      "agentic.workflows:get",
      "agentic.workflows:post",
      "agentic.workflows:put",
      "agentic.workflows:delete",
    ];
    useEndpoints(runnable);
    renderAt("/migration-plans/1?tab=runs");
    expect(
      await screen.findByText("agentic.planDetail.runsEmptyDescription")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: runItemName })).toBeNull();
  });

  it("offers no run in the empty state without the run scope", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.workflows:get"];
    useEndpoints(runnable);
    renderAt("/migration-plans/1?tab=runs");
    expect(
      await screen.findByText("agentic.planDetail.runsEmptyDescription")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: runItemName })).toBeNull();
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
    expect(
      screen.queryByText("agentic.planDetail.runsEmptyDescription")
    ).toBeNull();
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
