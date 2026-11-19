import { MemoryRouter } from "react-router-dom";

import { StageAgentRun, StageRun } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { StageRunsTable } from "./stage-runs-table";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const stageRun = (overrides: Partial<StageRun> & Pick<StageRun, "order">) =>
  ({
    stageId: `s${overrides.order}`,
    name: `Stage ${overrides.order}`,
    agent: { id: `${overrides.order}`, name: `Agent ${overrides.order}` },
    instructions: "",
    requiresApproval: false,
    status: "Pending",
    ...overrides,
  }) as StageRun;

const headers = () =>
  screen.getAllByRole("columnheader").map((header) => header.textContent);
const rows = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    );

describe("StageRunsTable on a plan run", () => {
  it("lists stages in order with links, status, start and duration", () => {
    const linkTo = (pathname: string, search = "") => `${pathname}${search}`;
    render(
      <MemoryRouter>
        <StageRunsTable
          runId="1"
          linkTo={linkTo}
          origin="?from=run-1"
          stageRuns={[
            stageRun({ order: 2, name: "Migrate" }),
            stageRun({
              order: 1,
              name: "Prepare proposal",
              status: "Succeeded",
              startedAt: "2026-11-10T10:06:00Z",
              completedAt: "2026-11-10T10:15:00Z",
            }),
          ]}
        />
      </MemoryRouter>
    );

    expect(headers()).toEqual([
      "#",
      "Stage",
      "Agent",
      "Status",
      "Started",
      "Duration",
    ]);
    expect(rows()).toEqual([
      [
        "1",
        "Prepare proposal",
        "Agent 1",
        "Succeeded",
        "2026-11-10 10:06",
        "9m",
      ],
      ["2", "Migrate", "Agent 2", "Pending", "Not started", "Not started"],
    ]);
    // The stage is a child of the run (no origin); the agent is not.
    expect(
      screen.getByRole("link", { name: "Prepare proposal" })
    ).toHaveAttribute("href", "/plan-runs/1/stages/s1");
    expect(screen.getByRole("link", { name: "Agent 1" })).toHaveAttribute(
      "href",
      "/agents/1?from=run-1"
    );
  });
});

describe("StageRunsTable Context column", () => {
  const agentRun = (stageId: string, contextUsed?: number): StageAgentRun => ({
    name: `run-1-${stageId}`,
    runId: "1",
    stageId,
    phase: "Running",
    containers: ["agent"],
    usage:
      contextUsed != null ? { contextUsed, contextSize: 200_000 } : undefined,
  });
  const stageRuns = [
    stageRun({
      order: 1,
      status: "Succeeded",
      startedAt: "2026-11-10T10:06:00Z",
    }),
    stageRun({
      order: 2,
      status: "Running",
      startedAt: "2026-11-10T10:15:00Z",
    }),
    stageRun({ order: 3 }),
  ];
  const renderTable = (
    agentRuns: StageAgentRun[],
    state: { isLoading?: boolean; isUnavailable?: boolean } = {}
  ) =>
    render(
      <MemoryRouter>
        <StageRunsTable
          runId="1"
          linkTo={(pathname) => pathname}
          stageRuns={stageRuns}
          agentRuns={{
            agentRuns,
            isLoading: state.isLoading ?? false,
            isUnavailable: state.isUnavailable ?? false,
          }}
        />
      </MemoryRouter>
    );

  it("adds Context after Duration with the agent runs", () => {
    renderTable([agentRun("s1", 84_000), agentRun("s2", 190_000)]);
    expect(headers()).toEqual([
      "#",
      "Stage",
      "Agent",
      "Status",
      "Started",
      "Duration",
      "Context",
    ]);
    expect(rows().map((row) => row[6])).toEqual(["42%", "95%", "Not started"]);
    expect(
      screen.getByRole("progressbar", { name: "Context window of Stage 2" })
    ).toHaveAttribute("aria-valuetext", "190K of 200K tokens (95%)");
    // Neutral even near the limit.
    expect(
      screen
        .getByRole("progressbar", { name: "Context window of Stage 2" })
        .closest(".pf-v6-c-progress")?.className
    ).not.toMatch(/pf-m-(warning|danger)/);
    expect(
      screen.getByRole("button", { name: "More information about context" })
    ).toBeInTheDocument();
  });

  it("says Not reported, Not reported yet, Unavailable, or loads", () => {
    const { unmount } = renderTable([agentRun("s1")]);
    // The running stage has not reported yet; the finished one never did.
    expect(rows().map((row) => row[6])).toEqual([
      "Not reported",
      "Not reported yet",
      "Not started",
    ]);
    unmount();

    const { unmount: unmountError } = renderTable([], { isUnavailable: true });
    expect(rows()[0][6]).toBe("Unavailable");
    unmountError();

    renderTable([], { isLoading: true });
    expect(screen.getAllByText("Loading context usage")).toHaveLength(2);
  });

  it("leaves Context out without agent runs, as on the Migration tab", () => {
    render(
      <MemoryRouter>
        <StageRunsTable
          runId="1"
          linkTo={(pathname) => pathname}
          stageRuns={stageRuns}
        />
      </MemoryRouter>
    );
    expect(headers()).not.toContain("Context");
  });
});

describe("StageRunsTable, values that cannot be derived", () => {
  it("reads Unavailable, never Not available", () => {
    const { unmount } = render(
      <MemoryRouter>
        <StageRunsTable
          runId="1"
          linkTo={(pathname) => pathname}
          stageRuns={[
            stageRun({
              order: 1,
              status: "AwaitingApproval",
              startedAt: "2026-11-10T10:06:00Z",
            }),
          ]}
        />
      </MemoryRouter>
    );
    expect(rows()[0][5]).toBe("Unavailable");
    unmount();

    render(
      <MemoryRouter>
        <StageRunsTable
          stages={[{ stageName: "Migrate", phase: "Succeeded" }]}
        />
      </MemoryRouter>
    );
    expect(rows()[0][3]).toBe("Unavailable");
  });
});

describe("StageRunsTable on an application", () => {
  it("shows plain stage names, the summary line and completion", () => {
    render(
      <MemoryRouter>
        <StageRunsTable
          stages={[
            {
              stageName: "Prepare proposal",
              phase: "Failed",
              summary: "Error: Unable to resolve dependency tree.",
              completedAt: "2026-11-10T10:15:00Z",
            },
            { stageName: "Migrate", phase: "AwaitingApproval" },
            { stageName: "Validate", phase: "Pending" },
          ]}
        />
      </MemoryRouter>
    );

    expect(headers()).toEqual(["#", "Stage", "Status", "Completed"]);
    expect(rows()).toEqual([
      [
        "1",
        "Prepare proposalError: Unable to resolve dependency tree.",
        "Failed",
        "2026-11-10 10:15",
      ],
      ["2", "Migrate", "Action required", "Not finished"],
      ["3", "Validate", "Pending", "Not started"],
    ]);
    // Execution rows carry no stage id: never a link by name.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
