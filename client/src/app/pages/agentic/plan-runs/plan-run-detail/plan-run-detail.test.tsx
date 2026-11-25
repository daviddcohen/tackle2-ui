import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  PlanRun,
  SkillsByStage,
  StageAgentRun,
  StageRun,
  StageSkill,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import PlanRunDetail from "./plan-run-detail";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockGrantedScopes = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const stage = (
  order: number,
  name: string,
  status: StageRun["status"],
  overrides: Partial<StageRun> = {}
): StageRun => ({
  stageId: String(order),
  name,
  agent: { id: String(order), name: `${name} Agent` },
  instructions: "",
  requiresApproval: false,
  order,
  status,
  ...overrides,
});

const run = (overrides: Partial<PlanRun>): PlanRun => ({
  id: "1",
  name: "Run #1: Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [
    { id: 1, name: "Customer Management" },
    { id: 3, name: "Claims Processing" },
  ],
  status: "Running",
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns: [
    stage(1, "Prepare proposal", "Running", {
      startedAt: "2026-11-10T10:06:00Z",
    }),
    stage(2, "Migrate", "Pending"),
  ],
  skills: { stages: [], everyStage: [] },
  ...overrides,
});

const useRun = (planRun: PlanRun) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.planRuns}/:id`, (_req, res, ctx) =>
      res(ctx.json(planRun))
    )
  );

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/plan-runs/1"]}>
      <Route path={DevPaths.planRunDetails}>
        <PlanRunDetail />
      </Route>
    </MemoryRouter>
  );

const fact = (term: string) => {
  const dt = screen
    .getAllByRole("term")
    .find((candidate) => candidate.textContent === term);
  if (dt == null) throw new Error(`No fact "${term}"`);
  return dt.nextElementSibling as HTMLElement;
};

const useAgentRuns = (agentRuns: StageAgentRun[]) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.planRuns}/:id/agent-runs`, (_req, res, ctx) =>
      res(ctx.json(agentRuns))
    )
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
  useAgentRuns([]);
});

describe("PlanRunDetail", () => {
  it("shows each stage's context window in the Stages table", async () => {
    // One application: the stage's one agent run (several: "Up to").
    useRun(run({ applications: [{ id: 1, name: "Customer Management" }] }));
    useAgentRuns([
      {
        name: "run-1-prepare-proposal",
        runId: "1",
        stageId: "1",
        phase: "Running",
        containers: ["agent"],
        usage: { contextUsed: 121_400, contextSize: 200_000 },
      },
    ]);
    renderPage();
    const bar = await screen.findByRole("progressbar", {
      name: "Context window of Prepare proposal",
    });
    expect(bar).toHaveAttribute("aria-valuetext", "121K of 200K tokens (60%)");
    const table = screen.getByRole("grid", { name: "Stages" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual([
      "#",
      "Stage",
      "Agent",
      "Status",
      "Started",
      "Duration",
      "Context",
    ]);
    // The pending stage has no agent run yet.
    const pending = within(table).getAllByRole("row")[2];
    expect(within(pending).getAllByRole("cell")[6]).toHaveTextContent(
      "Not started"
    );
  });

  it("names the current stage and the start in the status line", async () => {
    useRun(run({}));
    renderPage();
    expect(
      await screen.findByText(
        /^Stage 1 of 2: Prepare proposal · Started November 10, 2026/
      )
    ).toBeInTheDocument();
    // Started is in the status line only, never a fact.
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Migration plan", "Applications", "Target branch", "Duration", "Commits"]
    );
  });

  it("says a pending run is waiting for its first stage", async () => {
    useRun(
      run({
        status: "Pending",
        stageRuns: [
          stage(2, "Migrate", "Pending"),
          stage(1, "Prepare proposal", "Pending"),
        ],
      })
    );
    renderPage();
    expect(
      await screen.findByText("Waiting to start. Prepare proposal runs first.")
    ).toBeInTheDocument();
    expect(fact("Duration")).toHaveTextContent("Not started");
    expect(fact("Commits")).toHaveTextContent("None");
  });

  it("says Not finished for a running duration it cannot read yet, Unavailable once it ended", async () => {
    // The awaiting stage has no agent message to stop the clock.
    useRun(
      run({
        status: "AwaitingApproval",
        stageRuns: [
          stage(1, "Prepare proposal", "AwaitingApproval", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
          stage(2, "Migrate", "Pending"),
        ],
      })
    );
    const { unmount } = renderPage();
    await waitFor(() =>
      expect(fact("Duration")).toHaveTextContent("Not finished")
    );
    unmount();

    // A run that ended without a completion time: its duration is unknown.
    useRun(
      run({
        status: "Failed",
        stageRuns: [
          stage(1, "Prepare proposal", "Failed", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
      })
    );
    renderPage();
    await waitFor(() =>
      expect(fact("Duration")).toHaveTextContent("Unavailable")
    );
  });

  it("gives a succeeded run its start and completion, and its commit total", async () => {
    useRun(
      run({
        status: "Succeeded",
        completedAt: "2026-11-10T12:21:00Z",
        stageRuns: [
          stage(1, "Prepare proposal", "Succeeded", {
            commits: [{ hash: "a", message: "A", stageName: "x" }],
          }),
          stage(2, "Migrate", "Succeeded", {
            commits: [
              { hash: "b", message: "B", stageName: "y" },
              { hash: "c", message: "C", stageName: "y" },
            ],
          }),
        ],
      })
    );
    renderPage();
    expect(
      await screen.findByText(
        /^Started November 10, 2026 .* · Completed November 10, 2026/
      )
    ).toBeInTheDocument();
    expect(fact("Duration")).toHaveTextContent("2h 15m");
    expect(fact("Commits")).toHaveTextContent("3");
  });

  it("links the plan and each application from the facts", async () => {
    useRun(run({}));
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(
      within(fact("Migration plan")).getByRole("link", {
        name: "Java EE to Quarkus",
      })
    ).toHaveAttribute("href", "/migration-plans/1?from=run-1");
    expect(
      within(fact("Applications"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/applications/1", "/applications/3"]);
    expect(fact("Target branch")).toHaveTextContent(
      "konveyor/agentic-migration"
    );
  });

  const javaCoder = { id: "9", name: "Java Code Migrator" };
  const javaEE = { id: 1, name: "Java EE Application" };
  const quarkus = { id: 11, name: "Quarkus 3.x" };
  const claims = { id: 3, name: "Claims Processing" };
  const customers = { id: 1, name: "Customer Management" };

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

  /** Run #1's snapshot: two stages, then each application's Every stage. */
  const snapshot = (
    applications: { id: number; name: string }[]
  ): SkillsByStage => ({
    stages: [
      {
        order: 1,
        name: "Prepare proposal",
        agent: { id: "1", name: "Prepare proposal Agent" },
        stageId: "1",
        skills: [],
      },
      {
        order: 2,
        name: "Migrate",
        agent: javaCoder,
        stageId: "2",
        skills: [
          stageSkill(
            "20",
            "Spring Boot to Quarkus migration",
            [{ kind: "agent", agent: javaCoder }],
            true
          ),
        ],
      },
    ],
    everyStage: applications.map((application) => ({
      application,
      skills: [
        stageSkill("3", "Quarkus best practices", [
          { kind: "targetProfile", targetProfile: quarkus, archetype: javaEE },
        ]),
        ...(application.id === claims.id
          ? [
              stageSkill("8", "EJB to CDI conversion patterns", [
                { kind: "application", application: claims },
              ]),
            ]
          : []),
      ],
    })),
  });

  const skillsTable = () =>
    screen.findByRole("grid", { name: "Skills by stage" });

  it("says Unavailable, with why, when the run reports no skills", async () => {
    useRun(run({ skills: undefined }));
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Skills by stage" })
    ).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("This server does not report the skills of a run yet.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: "Skills by stage" })).toBeNull();
    // No snapshot: no sentence about how it was worked out.
    expect(screen.queryByText(/^Worked out when the run started/)).toBeNull();
  });

  it("shows each stage, then each application's Every stage group", async () => {
    useRun(run({ skills: snapshot([customers, claims]) }));
    renderPage();
    const table = await skillsTable();
    expect(
      within(table)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual([
      "Stage 1: Prepare proposal",
      "Stage 2: Migrate",
      "Every stage: Customer Management",
      "Every stage: Claims Processing",
    ]);
    // The section sentence, then the attribution once: two applications.
    expect(
      screen.getByText(
        "Worked out when the run started. Each stage's agent reads its own skills when the stage starts, so a change to that agent before then can change what the stage gets. An application's archetype, target profile and own skills go to that application only."
      )
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("row", {
        name: /Spring Boot to Quarkus migration/,
      })
    ).toHaveTextContent("Excluded");
    // Under "Every stage: Claims Processing" its own skill reads "This
    // application", as on the Migration tab.
    expect(
      within(table).getByRole("row", { name: /EJB to CDI conversion/ })
    ).toHaveTextContent("This application");
    // The application's group title links to its Skills tab.
    expect(
      within(
        within(table).getByRole("heading", {
          name: "Every stage: Claims Processing",
        })
      ).getByRole("link")
    ).toHaveAttribute("href", "/applications/3?tab=skills&from=run-1");
  });

  it("links with the run as origin, keeping each link's own query and anchor", async () => {
    useRun(run({ skills: snapshot([claims]) }));
    renderPage();
    const table = await skillsTable();
    expect(
      within(table).getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", "/skills/3?from=run-1");
    expect(
      within(table).getByRole("link", { name: "Quarkus 3.x" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles?from=run-1#target-profile-11"
    );
    expect(
      within(table).getAllByRole("link", { name: "Claims Processing" })[0]
    ).toHaveAttribute("href", "/applications/3?tab=skills&from=run-1");
    // A run's target profiles can belong to several archetypes: each names
    // its archetype.
    expect(
      within(table).getByRole("row", { name: /Quarkus best practices/ })
    ).toHaveTextContent("Quarkus 3.x (Java EE Application)");
  });

  it("says the section sentence without the attribution for one application", async () => {
    useRun(run({ applications: [claims], skills: snapshot([claims]) }));
    renderPage();
    await skillsTable();
    expect(
      screen.getByText(
        "Worked out when the run started. Each stage's agent reads its own skills when the stage starts, so a change to that agent before then can change what the stage gets."
      )
    ).toBeInTheDocument();
  });

  it("lists the skills the run excluded on its own, apart from the plan's", async () => {
    const skills = snapshot([claims]);
    // The run excluded the application's own skill: its row is marked too.
    skills.everyStage[0].skills[1].excluded = true;
    useRun(
      run({
        applications: [claims],
        skills,
        excludedSkills: [
          { id: "8", name: "EJB to CDI conversion patterns" },
          { id: "3", name: "Quarkus best practices" },
        ],
      })
    );
    renderPage();
    await skillsTable();
    expect(
      screen.getByText(
        "Excluded for this run only, in addition to the migration plan's exclusions: EJB to CDI conversion patterns and Quarkus best practices."
      )
    ).toBeInTheDocument();
  });

  it("says the run's exclusions plainly when the plan excluded nothing", async () => {
    const skills = snapshot([claims]);
    // Only the run's own exclusion is marked: the plan excluded nothing.
    skills.stages[1].skills[0].excluded = false;
    skills.everyStage[0].skills[1].excluded = true;
    useRun(
      run({
        applications: [claims],
        skills,
        excludedSkills: [{ id: "8", name: "EJB to CDI conversion patterns" }],
      })
    );
    renderPage();
    await skillsTable();
    expect(
      screen.getByText(
        "Excluded for this run only: EJB to CDI conversion patterns."
      )
    ).toBeInTheDocument();
  });

  it("says nothing of its own exclusions when the run has none", async () => {
    useRun(run({ applications: [claims], skills: snapshot([claims]) }));
    renderPage();
    await skillsTable();
    expect(screen.queryByText(/^Excluded for this run only/)).toBeNull();
  });

  it("keeps every group open with three applications", async () => {
    const applications = [11, 12, 13].map((id) => ({
      id,
      name: `Application ${id}`,
    }));
    useRun(run({ applications, skills: snapshot(applications) }));
    renderPage();
    const table = await skillsTable();
    for (const toggle of within(table).getAllByRole("button", {
      name: / Details$/,
    }))
      expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("starts the Every stage groups collapsed above three applications", async () => {
    const applications = [11, 12, 13, 14].map((id) => ({
      id,
      name: `Application ${id}`,
    }));
    useRun(run({ applications, skills: snapshot(applications) }));
    renderPage();
    const table = await skillsTable();
    const expanded = (name: string) =>
      within(table)
        .getByRole("button", { name: `${name} Details` })
        .getAttribute("aria-expanded");
    expect(expanded("Stage 2: Migrate")).toBe("true");
    expect(expanded("Every stage: Application 11")).toBe("false");
    expect(within(table).getAllByText("1 skill")).toHaveLength(4);
  });

  it("offers no decision without the scope to approve", async () => {
    mockGrantedScopes.all = false;
    useRun(
      run({
        status: "AwaitingApproval",
        stageRuns: [
          stage(1, "Prepare proposal", "AwaitingApproval", {
            requiresApproval: true,
            startedAt: "2026-11-10T10:06:00Z",
          }),
          stage(2, "Migrate", "Pending"),
        ],
      })
    );
    renderPage();
    expect(
      await screen.findByText(
        "Prepare proposal Agent finished Prepare proposal. Waiting for approval."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve and continue" })
    ).toBeNull();
  });

  it("offers Run migration plan on a failed run only with the scope", async () => {
    const failed = run({
      status: "Failed",
      stageRuns: [
        stage(1, "Prepare proposal", "Failed", { output: "Error: boom" }),
        stage(2, "Migrate", "Pending"),
      ],
    });
    useRun(failed);
    const { unmount } = renderPage();
    expect(
      await screen.findByRole("button", { name: "Run migration plan" })
    ).toBeInTheDocument();
    // A failure is read in the stage's saved log.
    expect(screen.getByRole("link", { name: "Review stage" })).toHaveAttribute(
      "href",
      "/plan-runs/1/stages/1?tab=logs"
    );
    unmount();

    mockGrantedScopes.all = false;
    renderPage();
    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run migration plan" })
    ).toBeNull();
  });

  it("names the application that failed, and reviews its agent run", async () => {
    useRun(
      run({
        status: "Failed",
        stageRuns: [
          stage(1, "Prepare proposal", "Failed", { output: "Error: boom" }),
          stage(2, "Migrate", "Pending"),
        ],
      })
    );
    useAgentRuns(
      [
        { id: 1, name: "Customer Management", phase: "Succeeded" as const },
        { id: 3, name: "Claims Processing", phase: "Failed" as const },
      ].map(({ id, name, phase }) => ({
        name: `run-1-prepare-proposal-app-${id}`,
        runId: "1",
        stageId: "1",
        application: { id, name },
        phase,
        containers: ["agent"],
      }))
    );
    renderPage();
    expect(
      await screen.findByRole("heading", {
        name: "Danger alert: Prepare proposal failed for Claims Processing",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review stage" })).toHaveAttribute(
      "href",
      "/plan-runs/1/stages/1?tab=logs&application=3"
    );
  });
});
