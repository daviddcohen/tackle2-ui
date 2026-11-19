import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  Agent,
  MigrationPlan,
  ResolvePlanSkillsRequest,
  SkillsByStage,
  StageSkill,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
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

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
// setupTests stubs useLocation; the URL tabs need the real one.
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const agent = {
  id: "7",
  name: "Java Code Migrator",
  model: { id: "1", name: "Claude" },
  skills: [],
} as unknown as Agent;

const javaCoder = { id: "7", name: "Java Code Migrator" };
const javaEE = { id: 1, name: "Java EE Application" };
const quarkus = { id: 11, name: "Quarkus 3.x" };

const plan: MigrationPlan = {
  id: "1",
  name: "Java EE to Quarkus",
  description: "",
  stages: [
    {
      id: "s1",
      name: "Migrate",
      agent: javaCoder,
      instructions: "",
      requiresApproval: false,
      order: 1,
    },
  ],
  migrationPath: {
    archetype: javaEE,
    targetProfiles: [quarkus],
    isDefault: true,
  },
  applicationImpact: { matching: 0 },
  runCount: 0,
};

const stageSkill = (
  id: string,
  name: string,
  from: StageSkill["from"],
  excluded = false
): StageSkill => ({
  skill: { id, name },
  loadPolicy: "skill",
  from,
  excluded,
});

/** What the resolver answers for the plan preview, with its exclusions. */
const preview = (excludedIds: string[] = []): SkillsByStage => ({
  stages: [
    {
      order: 1,
      name: "Migrate",
      agent: javaCoder,
      skills: [
        stageSkill(
          "1",
          "Jakarta EE namespace migration",
          [
            {
              kind: "collection",
              agent: javaCoder,
              collection: { id: "c1", name: "Java modernization foundation" },
            },
          ],
          excludedIds.includes("1")
        ),
      ],
    },
  ],
  everyStage: [
    {
      skills: [
        stageSkill(
          "3",
          "Quarkus best practices",
          [
            {
              kind: "targetProfile",
              targetProfile: quarkus,
              archetype: javaEE,
            },
          ],
          excludedIds.includes("3")
        ),
      ],
    },
  ],
});

let resolveRequests: ResolvePlanSkillsRequest[];

// Responses a test holds open are released after it, so no pending handler
// keeps the process alive once the suite ends.
const heldResponses: (() => void)[] = [];
const holdResponse = () =>
  new Promise<void>((resolve) => heldResponses.push(resolve));
afterEach(() => heldResponses.splice(0).forEach((release) => release()));

type Reply = SkillsByStage | "error" | "missing" | "pending" | "noStages";

const useEndpoints = (
  detail: MigrationPlan,
  resolveReply: (request: ResolvePlanSkillsRequest) => Reply
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
        return res(ctx.json(preview()));
      }
      // A client error is not retried.
      if (reply === "error") return res(ctx.status(400));
      if (reply === "missing") return res(ctx.status(404));
      // A server that answers without the per-stage groups.
      if (reply === "noStages") return res(ctx.json({}));
      return res(ctx.json(reply));
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

/** The DetailSection under its heading: Flex > FlexItem > heading. */
const skillsSection = async () =>
  (await screen.findByRole("heading", { level: 2, name: "Skills by stage" }))
    .parentElement?.parentElement as HTMLElement;

/** The section sentence, then the note on application skills. */
const description =
  "What each stage's agent gets when this plan runs, and where each skill comes from. Skills of this plan's archetype and target profile. When it runs, each application also gets its own skills. An application from another archetype gets its own archetype and target profile skills instead.";

describe("PlanDetailsPage Skills by stage", () => {
  beforeEach(() => {
    resolveRequests = [];
  });

  it("comes after Stages: each stage, then Every stage with the plan note", async () => {
    useEndpoints(plan, () => preview());
    renderPlan();
    const section = await skillsSection();
    expect(within(section).getByText(description)).toBeInTheDocument();
    const table = await within(section).findByRole("grid", {
      name: "Skills by stage",
    });
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings.indexOf("Skills by stage")).toBe(
      headings.indexOf("Stages") + 1
    );
    expect(
      within(table)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Stage 1: Migrate", "Every stage"]);
    // The note on application skills is in the section description (above); the Every stage
    // title has the subtitle every context shows.
    expect(
      within(table).getByText(
        "Archetype, target profile and application skills"
      )
    ).toBeVisible();
    expect(
      within(table).queryByText(/Skills of this plan's archetype/)
    ).toBeNull();
    // The plan's own archetype: the profile has no archetype suffix.
    expect(
      within(table).getByRole("row", { name: /Quarkus best practices/ })
    ).toHaveTextContent("Target profile: Quarkus 3.x");
    expect(
      within(table).queryByText(/\(Java EE Application\)/)
    ).not.toBeInTheDocument();
    // Read-only: no checkboxes, no Manage skills.
    expect(within(table).queryByRole("checkbox")).toBeNull();
    expect(within(section).queryByText("Manage skills")).toBeNull();
    expect(resolveRequests[0]).toEqual({
      stages: [{ agent: { id: "7" }, name: "Migrate" }],
      migrationPath: { archetype: { id: 1 }, targetProfiles: [{ id: 11 }] },
      excludedSkills: [],
    });
  });

  it("links names with the plan as origin, keeping their own query and anchor", async () => {
    useEndpoints(plan, () => preview());
    renderPlan();
    const table = await within(await skillsSection()).findByRole("grid", {
      name: "Skills by stage",
    });
    expect(
      within(table).getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", "/skills/3?from=plan-1");
    expect(
      within(table).getByRole("link", { name: "Quarkus 3.x" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles?from=plan-1#target-profile-11"
    );
    expect(
      within(table).getByRole("link", { name: "Java Code Migrator" })
    ).toHaveAttribute("href", "/agents/7?from=plan-1");
  });

  it("gives its toggles names of their own, apart from the Stages table", async () => {
    useEndpoints(plan, () => preview());
    renderPlan();
    const table = await within(await skillsSection()).findByRole("grid", {
      name: "Skills by stage",
    });
    expect(
      within(table).getByRole("heading", { name: "Stage 1: Migrate" })
    ).toHaveAttribute("id", "simple-node100");
    expect(
      within(table).getByRole("button", { name: "Every stage Details" })
    ).toBeVisible();
  });

  it("marks each row of a skill the plan excludes, in every group it reaches", async () => {
    // Jakarta reaches stage 1 (collection) and every stage (archetype).
    const both = (excluded: boolean): SkillsByStage => {
      const base = preview(excluded ? ["1"] : []);
      return {
        ...base,
        everyStage: [
          {
            skills: [
              ...base.everyStage[0].skills,
              stageSkill(
                "1",
                "Jakarta EE namespace migration",
                [{ kind: "archetype", archetype: javaEE }],
                excluded
              ),
            ],
          },
        ],
      };
    };
    useEndpoints(
      {
        ...plan,
        excludedSkills: [{ id: "1", name: "Jakarta EE namespace migration" }],
      },
      ({ excludedSkills = [] }) => both(excludedSkills.length > 0)
    );
    renderPlan();
    const table = await within(await skillsSection()).findByRole("grid", {
      name: "Skills by stage",
    });
    const rows = within(table).getAllByRole("row", {
      name: /Jakarta EE namespace migration/,
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByText("Excluded")).toBeInTheDocument();
    }
    expect(within(table).getAllByText("Excluded")).toHaveLength(2);
    expect(resolveRequests[0].excludedSkills).toEqual([{ id: "1" }]);
  });

  it("says what every stage gets for a plan without a migration path", async () => {
    useEndpoints({ ...plan, migrationPath: undefined }, () => ({
      stages: preview().stages,
      everyStage: [{ skills: [] }],
    }));
    renderPlan();
    const section = await skillsSection();
    const table = await within(section).findByRole("grid", {
      name: "Skills by stage",
    });
    expect(
      within(section).getByText(
        "What each stage's agent gets when this plan runs, and where each skill comes from. This plan has no archetype or target profile. When it runs, each application gets its own archetype, target profile and application skills in every stage."
      )
    ).toBeVisible();
    expect(within(table).getByText("No skills")).toBeVisible();
  });

  it("shows skeleton rows while the skills resolve", async () => {
    useEndpoints(plan, () => "pending");
    renderPlan();
    const section = await skillsSection();
    expect(
      await within(section).findByText("Loading skills")
    ).toBeInTheDocument();
    expect(within(section).queryByText("Unavailable")).toBeNull();
  });

  it("shows the load error with Try again", async () => {
    let fail = true;
    useEndpoints(plan, () => (fail ? "error" : preview()));
    renderPlan();
    const section = await skillsSection();
    expect(
      await within(section).findByText("Skills could not be loaded.")
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(
      within(section).getByRole("button", { name: "Try again" })
    );
    expect(
      await within(section).findByRole("grid", { name: "Skills by stage" })
    ).toBeInTheDocument();
  });

  it("says Unavailable, with why, when the server has no resolve endpoint", async () => {
    useEndpoints(plan, () => "missing");
    renderPlan();
    const section = await skillsSection();
    expect(await within(section).findByText("Unavailable")).toBeInTheDocument();
    expect(
      within(section).getByText(
        "This server cannot list the skills of a migration plan."
      )
    ).toBeInTheDocument();
    expect(within(section).queryByRole("button")).toBeNull();
  });

  it("says Unavailable when the server answers without the per-stage groups", async () => {
    useEndpoints(plan, () => "noStages");
    renderPlan();
    const section = await skillsSection();
    expect(await within(section).findByText("Unavailable")).toBeInTheDocument();
    expect(
      within(section).getByText(
        "This server cannot list the skills of a migration plan."
      )
    ).toBeInTheDocument();
    expect(within(section).queryByRole("grid")).toBeNull();
  });

  it("sends the stages in stage order, with their names", async () => {
    useEndpoints(
      {
        ...plan,
        stages: [
          { ...plan.stages[0], id: "s2", order: 2, name: "Validate" },
          { ...plan.stages[0], id: "s1", agent: { id: "8", name: "Planner" } },
        ],
      },
      () => preview()
    );
    renderPlan();
    await waitFor(() => expect(resolveRequests).toHaveLength(1));
    expect(resolveRequests[0].stages).toEqual([
      { agent: { id: "8" }, name: "Migrate" },
      { agent: { id: "7" }, name: "Validate" },
    ]);
  });
});
