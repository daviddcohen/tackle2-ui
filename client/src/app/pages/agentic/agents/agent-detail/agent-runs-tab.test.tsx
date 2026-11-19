import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AgentTestRun, PlanRun, StageRun } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { AgentRunsTab, AgentRunsTabProps } from "./agent-runs-tab";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const stage = (
  stageId: string,
  agentId: string,
  extra: Partial<StageRun>
): StageRun => ({
  stageId,
  name: `Stage ${stageId}`,
  agent: { id: agentId, name: `Agent ${agentId}` },
  instructions: "",
  requiresApproval: false,
  order: Number(stageId),
  status: "Pending",
  ...extra,
});

const run = (id: string, stageRuns: StageRun[]): PlanRun => ({
  id,
  name: `Run #${id} — Plan`,
  planId: "1",
  planName: "Plan",
  applications: [],
  status: "Running",
  targetBranch: "main",
  startedAt: "2026-11-10T10:00:00Z",
  stageRuns,
});

const planRuns = [
  run("1", [
    stage("1", "2", {
      status: "Succeeded",
      startedAt: "2026-11-01T10:00:00Z",
      completedAt: "2026-11-01T10:52:00Z",
    }),
    stage("2", "9", { status: "Running" }),
  ]),
  run("2", [stage("1", "2", { status: "Pending" })]),
];

const testRun: AgentTestRun = {
  id: "9002",
  agent: { id: "2", name: "Agent 2" },
  application: { id: 5, name: "Inventory Service" },
  task: "Apply the conversion patterns.",
  phase: "Failed",
  startedAt: "2026-09-19T09:30:00Z",
};

const renderTab = (props: Partial<AgentRunsTabProps> = {}) =>
  render(
    <MemoryRouter>
      <AgentRunsTab
        agentId="2"
        planRuns={planRuns}
        isLoadingPlanRuns={false}
        planRunsError={null}
        testRuns={[testRun]}
        isLoadingTestRuns={false}
        testRunsError={null}
        canTestAgent
        linkCrumbs={[]}
        {...props}
      />
    </MemoryRouter>
  );

const rowsOf = (name: string) =>
  within(screen.getByRole("grid", { name })).getAllByRole("row").slice(1);

describe("AgentRunsTab", () => {
  it("lists this agent's stages, not-started first, with status and duration", () => {
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Migration plan stages (2)" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Stages this agent runs in plan runs.")
    ).toBeInTheDocument();
    const rows = rowsOf("Migration plan stages");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Run #2 — Plan");
    expect(rows[0]).toHaveTextContent("Pending");
    expect(rows[0]).toHaveTextContent("Not started");
    expect(rows[1]).toHaveTextContent("Run #1 — Plan");
    expect(rows[1]).toHaveTextContent("Succeeded");
    expect(rows[1]).toHaveTextContent("2026-11-01 10:00");
    expect(rows[1]).toHaveTextContent("52m");
    expect(
      within(rows[1]).getByRole("link", { name: "Stage 1" })
    ).toHaveAttribute("href", "/plan-runs/1/stages/1?from=agent-2");
  });

  it("lists the test runs without a type column", () => {
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Test runs (1)" })
    ).toBeInTheDocument();
    const [row] = rowsOf("Test runs");
    expect(
      within(row).getByRole("link", { name: "Inventory Service" })
    ).toHaveAttribute("href", "/applications/5");
    expect(row).toHaveTextContent("Failed");
    expect(row).toHaveTextContent("2026-09-19 09:30");
    expect(screen.queryByText("Type")).toBeNull();
  });

  it("pages a section only when it has more than 10 rows", async () => {
    const manyStages = Array.from({ length: 11 }, (_, index) =>
      run(String(index + 1), [stage("1", "2", { status: "Pending" })])
    );
    const tenTestRuns = Array.from({ length: 10 }, (_, index) => ({
      ...testRun,
      id: String(9100 + index),
    }));
    renderTab({ planRuns: manyStages, testRuns: tenTestRuns });
    expect(
      screen.getByRole("heading", { name: "Migration plan stages (11)" })
    ).toBeInTheDocument();
    expect(rowsOf("Migration plan stages")).toHaveLength(10);
    expect(rowsOf("Test runs")).toHaveLength(10);
    const [nextPage] = screen.getAllByRole("button", {
      name: "Go to next page",
    });
    expect(
      screen.getAllByRole("button", { name: "Go to next page" })
    ).toHaveLength(1);
    await userEvent.click(nextPage);
    expect(rowsOf("Migration plan stages")).toHaveLength(1);
  });

  it("says how to start a test run only with the agent run scope", () => {
    const { unmount } = renderTab({ planRuns: [], testRuns: [] });
    expect(
      screen.getByRole("heading", { name: "Migration plan stages" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This agent has not run in a plan run yet.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No test runs yet. Use Test agent in the Actions menu to start one."
      )
    ).toBeInTheDocument();
    unmount();
    renderTab({ planRuns: [], testRuns: [], canTestAgent: false });
    expect(screen.getByText("No test runs yet.")).toBeInTheDocument();
  });

  it("never shows an empty section while the runs load or after they fail", () => {
    renderTab({
      planRuns: [],
      isLoadingPlanRuns: true,
      testRuns: [],
      testRunsError: new Error("boom"),
    });
    expect(
      screen.queryByText("This agent has not run in a plan run yet.")
    ).toBeNull();
    expect(screen.queryByText(/^No test runs yet/)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Migration plan stages" })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("grid", { name: "Test runs" })).getByText(
        "Unable to connect"
      )
    ).toBeInTheDocument();
  });
});
