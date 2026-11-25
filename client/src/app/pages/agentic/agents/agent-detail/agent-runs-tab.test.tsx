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
  name: `Run #${id}: Plan`,
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
  name: "Test run #2",
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
        onStartTest={jest.fn()}
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
    expect(rows[0]).toHaveTextContent("Run #2: Plan");
    expect(rows[0]).toHaveTextContent("Pending");
    expect(rows[0]).toHaveTextContent("Not started");
    expect(rows[1]).toHaveTextContent("Run #1: Plan");
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
    // The run's name opens it; its start is plain text.
    expect(
      within(row).getByRole("link", { name: "Test run #2" })
    ).toHaveAttribute("href", "/agents/2/test-runs/9002");
    expect(row).toHaveTextContent("2026-09-19 09:30");
    expect(
      within(row).queryByRole("link", { name: "2026-09-19 09:30" })
    ).toBeNull();
    expect(screen.queryByText("Type")).toBeNull();
  });

  it("shows the skills each test run added, None when it added none", async () => {
    const user = userEvent.setup();
    const withSkills: AgentTestRun = {
      ...testRun,
      id: "9003",
      name: "Test run #3",
      startedAt: "2026-09-19T11:00:00Z",
      addedSkills: [
        { id: "16", name: "Spring Boot 3 upgrade" },
        { id: "4", name: "Quarkus best practices" },
        { id: "5", name: "Corporate coding standards" },
      ],
    };
    renderTab({ testRuns: [testRun, withSkills] });
    const grid = screen.getByRole("grid", { name: "Test runs" });
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual([
      "Run",
      "Application",
      "Task",
      "Added skills",
      "Status",
      "Started",
    ]);

    const [latest, plain] = rowsOf("Test runs");
    expect(plain).toHaveTextContent("None");
    const skills = within(latest).getByRole("list", {
      name: "Skills added to the test run on Inventory Service started 2026-09-19 11:00",
    });
    expect(
      within(skills).getByRole("link", { name: "Spring Boot 3 upgrade" })
    ).toHaveAttribute("href", "/skills/16");
    expect(
      within(skills).queryByRole("link", {
        name: "Corporate coding standards",
      })
    ).toBeNull();
    await user.click(within(skills).getByRole("button", { name: "1 more" }));
    expect(
      within(skills).getByRole("link", { name: "Corporate coding standards" })
    ).toHaveAttribute("href", "/skills/5");
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

  it("offers to start a test run only with the agent run scope", async () => {
    const onStartTest = jest.fn();
    const { unmount } = renderTab({ planRuns: [], testRuns: [], onStartTest });
    expect(
      screen.getByRole("heading", { name: "Migration plan stages" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This agent has not run in a plan run yet.")
    ).toBeInTheDocument();
    expect(screen.getByText(/^No test runs yet\./)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Start a test run" })
    );
    expect(onStartTest).toHaveBeenCalledTimes(1);
    unmount();
    renderTab({ planRuns: [], testRuns: [], canTestAgent: false });
    expect(screen.getByText("No test runs yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start a test run" })
    ).toBeNull();
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
