import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  Agent,
  MigrationPlan,
  PlanSkill,
  ResolvePlanSkillsRequest,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import PlanDetailsPage from "./plan-details";

// English strings; the page's one Trans (the Runs tab) renders its key.
jest.mock("react-i18next", () => ({
  ...jest.requireActual("@app/test-config/english-i18n"),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));
// setupTests stubs useLocation; the URL tabs need the real one.
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const agent = {
  id: "7",
  name: "Code Migrator",
  model: { id: "1", name: "Claude" },
  skills: [],
} as unknown as Agent;

const plan: MigrationPlan = {
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
  applicationImpact: { matching: 0 },
  runCount: 0,
};

const planSkills: PlanSkill[] = [
  {
    skill: { id: "9", name: "EJB to CDI conversion patterns" },
    sources: [
      {
        scope: "agent",
        scopeName: "Code Migrator",
        resource: { id: "7", name: "Code Migrator" },
      },
    ],
    excluded: false,
  },
  {
    skill: { id: "1", name: "Jakarta EE namespace migration" },
    sources: [
      {
        scope: "agent",
        scopeName: "Code Migrator via Java modernization foundation",
        resource: { id: "7", name: "Code Migrator" },
        collection: { id: "1", name: "Java modernization foundation" },
      },
    ],
    excluded: false,
  },
  {
    skill: { id: "3", name: "Quarkus best practices" },
    sources: [
      {
        scope: "targetProfile",
        scopeName: "Quarkus 3.x",
        resource: { id: 11, name: "Quarkus 3.x" },
      },
    ],
    excluded: false,
  },
];

const description =
  "Skills from this plan's agents, their skill collections, the archetype and the target profiles. Application skills are added when the plan runs.";

let resolveRequests: ResolvePlanSkillsRequest[];

// Responses a test holds open are released after it, so no pending handler
// keeps the process alive once the suite ends.
const heldResponses: (() => void)[] = [];
const holdResponse = () =>
  new Promise<void>((resolve) => heldResponses.push(resolve));
afterEach(() => heldResponses.splice(0).forEach((release) => release()));

const useEndpoints = (
  detail: MigrationPlan,
  resolveReply: (
    request: ResolvePlanSkillsRequest
  ) => PlanSkill[] | "error" | "missing" | "pending"
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
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) => res(ctx.json([]))),
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) => res(ctx.json([]))),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([]))),
    rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
      const body: ResolvePlanSkillsRequest = await req.json();
      resolveRequests.push(body);
      const reply = resolveReply(body);
      if (reply === "pending") {
        await holdResponse();
        return res(ctx.json({ skills: [] }));
      }
      if (reply === "error") return res(ctx.status(500));
      if (reply === "missing") return res(ctx.status(404));
      return res(ctx.json({ skills: reply }));
    })
  );

const renderPlan = () =>
  render(
    <NotificationsContext.Provider value={createMockNotifications()}>
      <MemoryRouter initialEntries={["/migration-plans/1"]}>
        <Route path={DevPaths.migrationPlanDetails}>
          <PlanDetailsPage />
        </Route>
      </MemoryRouter>
    </NotificationsContext.Provider>
  );

/** The DetailSection under a heading: Flex > FlexItem > heading. */
const skillsSection = async (heading: string) =>
  (await screen.findByRole("heading", { name: heading })).parentElement
    ?.parentElement as HTMLElement;

describe("PlanDetailsPage Skills section", () => {
  beforeEach(() => {
    resolveRequests = [];
  });

  it("lists the plan's resolved skills, collection skills included, with links and sources", async () => {
    useEndpoints(plan, () => planSkills);
    renderPlan();
    const section = await skillsSection("Skills (3)");
    expect(within(section).getByText(description)).toBeInTheDocument();
    const table = within(section).getByRole("grid", { name: "Skills" });
    expect(
      within(table).getByRole("row", { name: /Jakarta EE namespace migration/ })
    ).toHaveTextContent(
      "Agent: Code Migrator via Java modernization foundation"
    );
    expect(
      within(table).getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", expect.stringMatching(/^\/skills\/3\?/));
    // Read-only: no checkboxes, no markers when nothing is excluded.
    expect(within(table).queryByRole("checkbox")).toBeNull();
    expect(within(table).queryByText("Excluded")).toBeNull();
    expect(resolveRequests[0]).toEqual({
      stages: [{ agent: { id: "7" } }],
      migrationPath: { archetype: { id: 1 }, targetProfiles: [{ id: 11 }] },
      excludedSkills: [],
    });
  });

  it("marks the skills the plan excludes and counts the used ones in the heading", async () => {
    useEndpoints(
      {
        ...plan,
        excludedSkills: [{ id: "9", name: "EJB to CDI conversion patterns" }],
      },
      ({ excludedSkills = [] }) =>
        planSkills.map((entry) => ({
          ...entry,
          excluded: excludedSkills.some(({ id }) => id === entry.skill.id),
        }))
    );
    renderPlan();
    const section = await skillsSection("Skills (2 of 3 used)");
    const table = within(section).getByRole("grid", { name: "Skills" });
    const excluded = within(table).getByRole("row", {
      name: /EJB to CDI conversion patterns/,
    });
    expect(within(excluded).getByText("Excluded")).toBeInTheDocument();
    expect(
      within(excluded).getByRole("link", {
        name: "EJB to CDI conversion patterns",
      })
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        `${description} Excluded skills are not given to the agents.`
      )
    ).toBeInTheDocument();
    expect(within(table).getAllByText("Excluded")).toHaveLength(1);
    expect(within(table).queryByRole("checkbox")).toBeNull();
    expect(resolveRequests[0].excludedSkills).toEqual([{ id: "9" }]);
  });

  it("reads correctly when the plan's only skill is excluded", async () => {
    useEndpoints(
      {
        ...plan,
        excludedSkills: [{ id: "3", name: "Quarkus best practices" }],
      },
      () => [{ ...planSkills[2], excluded: true }]
    );
    renderPlan();
    expect(await skillsSection("Skills (0 of 1 used)")).toBeInTheDocument();
  });

  it("shows a skeleton while the skills resolve", async () => {
    useEndpoints(plan, () => "pending");
    renderPlan();
    const section = await skillsSection("Skills");
    expect(within(section).getByText("Loading skills")).toBeInTheDocument();
    expect(within(section).queryByText("Unavailable")).toBeNull();
  });

  it("says Unavailable when the skills could not be resolved", async () => {
    useEndpoints(plan, () => "error");
    renderPlan();
    const section = await skillsSection("Skills");
    expect(await within(section).findByText("Unavailable")).toBeInTheDocument();
    expect(within(section).queryByRole("grid")).toBeNull();
  });

  it("says so, without Unavailable, when the server has no resolve endpoint", async () => {
    useEndpoints(plan, () => "missing");
    renderPlan();
    const section = await skillsSection("Skills");
    expect(
      await within(section).findByText(
        "This server cannot list the skills of a migration plan."
      )
    ).toBeInTheDocument();
    expect(within(section).queryByText("Unavailable")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
  });

  it("sends the stages in stage order", async () => {
    useEndpoints(
      {
        ...plan,
        stages: [
          { ...plan.stages[0], id: "s1", agent: { id: "8", name: "Planner" } },
          { ...plan.stages[0], id: "s2", order: 2 },
        ],
      },
      () => planSkills
    );
    renderPlan();
    await skillsSection("Skills (3)");
    expect(resolveRequests[0].stages).toEqual([
      { agent: { id: "8" } },
      { agent: { id: "7" } },
    ]);
  });

  it("says when no skills are associated with the plan", async () => {
    useEndpoints(plan, () => []);
    renderPlan();
    expect(
      await screen.findByText(
        "No skills are associated with this plan's agents, archetype or target profiles."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
  });
});
