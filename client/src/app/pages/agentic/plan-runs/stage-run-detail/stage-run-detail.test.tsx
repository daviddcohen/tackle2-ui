import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { PlanRun, StageRun } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import StageRunDetail from "./stage-run-detail";

// English strings, plus a Trans that renders `<tag>text</tag>` with the
// component given for that tag (the shared stand-in has no Trans).
jest.mock("react-i18next", () => {
  const english = jest.requireActual("@app/test-config/english-i18n");
  const { cloneElement } = jest.requireActual("react");
  return {
    ...english,
    Trans: ({
      i18nKey,
      values,
      components,
    }: {
      i18nKey: string;
      values: Record<string, unknown>;
      components: Record<string, React.ReactElement>;
    }) =>
      english
        .englishT(i18nKey, values)
        .split(/(<\w+>.*?<\/\w+>)/)
        .map((part: string, index: number) => {
          const tag = /^<(\w+)>(.*)<\/\1>$/.exec(part);
          return tag
            ? cloneElement(components[tag[1]], { key: index }, tag[2])
            : part;
        }),
  };
});
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
  instructions: `Do ${name}.\n\nThen report.`,
  requiresApproval: false,
  order,
  status,
  ...overrides,
});

const run = (stageRuns: StageRun[], status: PlanRun["status"]): PlanRun => ({
  id: "1",
  name: "Run #1 — Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [{ id: 1, name: "Customer Management" }],
  status,
  targetBranch: "mta/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns,
});

const useRun = (planRun: PlanRun) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.planRuns}/:id`, (_req, res, ctx) =>
      res(ctx.json(planRun))
    )
  );

const renderStage = (stageId: string) =>
  render(
    <MemoryRouter initialEntries={[`/plan-runs/1/stages/${stageId}`]}>
      <Route path={DevPaths.stageRunDetails}>
        <StageRunDetail />
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

const awaiting = run(
  [
    stage(1, "Prepare proposal", "AwaitingApproval", {
      requiresApproval: true,
      startedAt: "2026-11-10T10:06:00Z",
      messages: [
        {
          role: "agent",
          content: "Analysis complete.",
          timestamp: "2026-11-10T10:15:00Z",
        },
        {
          role: "user",
          content: "Looks good.",
          timestamp: "2026-11-10T10:16:00Z",
        },
      ],
      commits: [
        {
          hash: "007a69cafe",
          message: "Prepare proposal: ready",
          stageName: "Prepare proposal",
        },
        {
          hash: "b2c3d4e5f6a1",
          message: "Prepare proposal: notes",
          stageName: "Prepare proposal",
          url: "https://git.example.com/commit/b2c3d4e5f6a1",
        },
      ],
    }),
    stage(2, "Migrate", "Pending"),
  ],
  "AwaitingApproval"
);

beforeEach(() => {
  mockGrantedScopes.all = true;
});

describe("StageRunDetail", () => {
  it("is titled by the stage and links back to its run", async () => {
    useRun(awaiting);
    renderStage("1");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Prepare proposal" })
    ).toBeInTheDocument();
    const runLinks = screen.getAllByRole("link", {
      name: "Run #1 — Java EE to Quarkus",
    });
    // The breadcrumb and the status line both lead to the run (addenda R1).
    expect(runLinks).toHaveLength(2);
    expect(runLinks[1]).toHaveAttribute("href", "/plan-runs/1");
    expect(runLinks[1].parentElement).toHaveTextContent(
      /^Stage 1 of 2 in Run #1 — Java EE to Quarkus · Started November 10, 2026/
    );
  });

  it("has the facts Agent, Duration and Approval only", async () => {
    useRun(awaiting);
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Agent", "Duration", "Approval"]
    );
    expect(
      within(fact("Agent")).getByRole("link", {
        name: "Prepare proposal Agent",
      })
    ).toHaveAttribute("href", "/agents/1?from=run-1");
    expect(fact("Duration")).toHaveTextContent("9m");
    expect(fact("Approval")).toHaveTextContent("Required after this stage");
  });

  it("says a passed gate was approved, or not required without a record", async () => {
    const finished = {
      startedAt: "2026-11-10T10:06:00Z",
      requiresApproval: true,
    };
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Succeeded", {
            ...finished,
            approvedAt: "2026-11-10T10:20:00Z",
          }),
          // An unattended run passes the gate without an approval record.
          stage(2, "Migrate", "Succeeded", finished),
        ],
        "Succeeded"
      )
    );
    const { unmount } = renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Approval")).toHaveTextContent(/^Approved November 10, 2026/);
    unmount();

    renderStage("2");
    await screen.findByRole("heading", { level: 1, name: "Migrate" });
    expect(fact("Approval")).toHaveTextContent("Not required");
  });

  it("keeps the gate ahead of a gated stage that failed", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Failed", {
            startedAt: "2026-11-10T10:06:00Z",
            requiresApproval: true,
          }),
        ],
        "Failed"
      )
    );
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Approval")).toHaveTextContent("Required after this stage");
  });

  it("asks to check the evidence below, with no link to itself", async () => {
    useRun(awaiting);
    renderStage("1");
    expect(
      await screen.findByText(
        "Prepare proposal Agent finished Prepare proposal. Check its activity and commits below, then approve to start Migrate."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review stage" })).toBeNull();
  });

  it("lists activity by time and sender, and commits with a count", async () => {
    useRun(awaiting);
    renderStage("1");
    await screen.findByRole("heading", { level: 2, name: "Activity" });
    const activity = screen.getByRole("grid", { name: "Activity" });
    expect(
      within(activity)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent)
    ).toEqual([
      "2026-11-10 10:15Prepare proposal AgentAnalysis complete.",
      "2026-11-10 10:16UserLooks good.",
    ]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Commits (2)" })
    ).toBeInTheDocument();
    const commits = screen.getByRole("grid", { name: "Commits" });
    expect(within(commits).getByText("007a69cafe")).toBeInTheDocument();
    expect(
      within(commits).getByRole("link", { name: /b2c3d4e5f6a1/ })
    ).toHaveAttribute("href", "https://git.example.com/commit/b2c3d4e5f6a1");
  });

  it("keeps the raw output collapsed behind Show output", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Failed", {
            startedAt: "2026-11-10T10:06:00Z",
            completedAt: "2026-11-10T10:15:00Z",
            output: "Error: Unable to resolve dependency tree.\nat line 2",
          }),
          stage(2, "Migrate", "Pending"),
        ],
        "Failed"
      )
    );
    renderStage("1");
    const toggle = await screen.findByRole("button", { name: "Show output" });
    expect(screen.getByText(/at line 2/)).not.toBeVisible();
    // The alert shows the first line only; the block has all of it.
    expect(
      screen.getByText("Error: Unable to resolve dependency tree.")
    ).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide output" })
    ).toBeInTheDocument();
    expect(screen.getByText(/at line 2/)).toBeVisible();

    expect(screen.getByText("This stage recorded no activity.")).toBeVisible();
    expect(screen.getByText("This stage made no commits.")).toBeVisible();
  });

  it("says a running stage has no activity or commits yet", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Running", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
        "Running"
      )
    );
    renderStage("1");
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
    expect(screen.getByText("No commits yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Commits" })
    ).toBeInTheDocument();
  });

  it("explains a pending stage and leaves out activity and commits", async () => {
    useRun(awaiting);
    renderStage("2");
    expect(
      await screen.findByText(
        "This stage starts after Prepare proposal is approved."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/^Stage 2 of 2 in/).textContent).not.toMatch(
      /Started/
    );
    expect(fact("Duration")).toHaveTextContent("Not started");
    expect(fact("Approval")).toHaveTextContent("Not required");
    expect(
      screen.getByRole("heading", { level: 2, name: "Instructions" })
    ).toBeInTheDocument();
    expect(screen.getByText("Do Migrate.")).toBeInTheDocument();
    expect(screen.getByText("Then report.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Commits/ })).toBeNull();
  });

  it("offers no decision without the scope to approve", async () => {
    mockGrantedScopes.all = false;
    useRun(awaiting);
    renderStage("1");
    expect(
      await screen.findByText(
        "Prepare proposal Agent finished Prepare proposal. Waiting for approval."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve and continue" })
    ).toBeNull();
  });
});
