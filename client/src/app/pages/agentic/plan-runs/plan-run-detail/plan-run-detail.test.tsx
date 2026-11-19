import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { PlanRun, StageRun } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
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
  name: "Run #1 — Java EE to Quarkus",
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
  resolvedSkills: [],
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

beforeEach(() => {
  mockGrantedScopes.all = true;
});

describe("PlanRunDetail", () => {
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
    expect(fact("Duration")).toHaveTextContent("135m");
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

  it("shows run skills that are unknown as unavailable, not as none", async () => {
    useRun(run({ resolvedSkills: undefined }));
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Skills" })
    ).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("says when a run gave its agents no skills", async () => {
    useRun(run({ resolvedSkills: [] }));
    renderPage();
    expect(
      await screen.findByText(
        "No skills were given to the agents when this run started."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Skills" })
    ).toBeInTheDocument();
  });

  const skill = (
    id: string,
    name: string,
    scope: "agent" | "archetype" = "agent",
    scopeName = "Code Migrator"
  ) => ({ skill: { id, name }, scope, scopeName });

  const skillsTable = () => screen.findByRole("grid", { name: "Skills" });

  it("counts the run's skills when the plan excluded none", async () => {
    useRun(
      run({
        resolvedSkills: [
          skill("1", "Quarkus patterns"),
          skill("2", "Java EE migration"),
        ],
      })
    );
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Skills (2)" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Skills given to the agents when this run started.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Excluded")).not.toBeInTheDocument();
  });

  it("keeps one excluded skill in the table, marked, and counts what was used", async () => {
    useRun(
      run({
        resolvedSkills: [
          skill("1", "Quarkus patterns"),
          skill("2", "Java EE migration"),
        ],
        excludedSkills: [
          skill("8", "Containerization standards", "archetype", "Java EE"),
        ],
      })
    );
    renderPage();
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Skills (2 of 3 used)",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills for this run and where each one comes from. Excluded skills are not given to the agents."
      )
    ).toBeInTheDocument();
    const rows = within(await skillsTable())
      .getAllByRole("row")
      .slice(1);
    // Name order: the excluded row does not move to the end.
    expect(rows.map((row) => row.textContent)).toEqual([
      "Containerization standardsExcludedArchetype: Java EE",
      "Java EE migrationAgent: Code Migrator",
      "Quarkus patternsAgent: Code Migrator",
    ]);
    expect(
      within(rows[0]).getByRole("link", { name: "Containerization standards" })
    ).toHaveAttribute("href", expect.stringContaining("/skills/8"));
    expect(within(rows[1]).queryByText("Excluded")).not.toBeInTheDocument();
  });

  it("counts several excluded skills, and none used when all were excluded", async () => {
    useRun(
      run({
        resolvedSkills: [],
        excludedSkills: [
          skill("1", "Quarkus patterns"),
          skill("2", "Java EE migration"),
        ],
      })
    );
    renderPage();
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Skills (0 of 2 used)",
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Excluded")).toHaveLength(2);
    expect(
      screen.queryByText(
        "No skills were given to the agents when this run started."
      )
    ).not.toBeInTheDocument();
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
    unmount();

    mockGrantedScopes.all = false;
    renderPage();
    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run migration plan" })
    ).toBeNull();
  });
});
