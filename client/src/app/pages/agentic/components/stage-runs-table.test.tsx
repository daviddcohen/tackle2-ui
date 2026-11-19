import userEvent from "@testing-library/user-event";
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

  it("shows the fullest application of a run on several, with the lowest and how many reported", async () => {
    const forApplication = (
      stageId: string,
      id: number,
      contextUsed?: number
    ): StageAgentRun => ({
      ...agentRun(stageId, contextUsed),
      name: `run-1-${stageId}-app-${id}`,
      application: { id, name: `App ${id}` },
    });
    render(
      <MemoryRouter>
        <StageRunsTable
          runId="1"
          linkTo={(pathname) => pathname}
          stageRuns={stageRuns}
          agentRuns={{
            agentRuns: [
              forApplication("s1", 1, 122_000),
              forApplication("s1", 2, 164_000),
              // Running: one of the two applications reported so far.
              forApplication("s2", 1, 100_000),
              forApplication("s2", 2),
            ],
            isLoading: false,
            isUnavailable: false,
            applicationCount: 2,
          }}
        />
      </MemoryRouter>
    );
    expect(rows().map((row) => row[6])).toEqual([
      "Up to 82%",
      "Up to 50% (1 of 2 reported)",
      "Not started",
    ]);
    const bar = (stage: string) =>
      screen.getByRole("progressbar", { name: `Context window of ${stage}` });
    expect(bar("Stage 1")).toHaveAttribute("aria-valuenow", "82");
    expect(bar("Stage 1")).toHaveAttribute(
      "aria-valuetext",
      "Up to 82% across 2 applications, lowest 61%"
    );
    expect(bar("Stage 2")).toHaveAttribute(
      "aria-valuetext",
      "Up to 50%, 1 of 2 applications reported"
    );
    // The column help says what the column shows in such a run.
    await userEvent.click(
      screen.getByRole("button", { name: "More information about context" })
    );
    expect(
      await screen.findByText(
        /In a run on several applications, the column shows the fullest one\.$/
      )
    ).toBeVisible();
  });

  it("leaves out the lowest when every application reads the same", () => {
    render(
      <MemoryRouter>
        <StageRunsTable
          runId="1"
          linkTo={(pathname) => pathname}
          stageRuns={stageRuns}
          agentRuns={{
            agentRuns: [1, 2].map((id) => ({
              ...agentRun("s1", 100_000),
              name: `run-1-s1-app-${id}`,
              application: { id, name: `App ${id}` },
            })),
            isLoading: false,
            isUnavailable: false,
            applicationCount: 2,
          }}
        />
      </MemoryRouter>
    );
    expect(rows()[0][6]).toBe("Up to 50%");
    expect(
      screen.getByRole("progressbar", { name: "Context window of Stage 1" })
    ).toHaveAttribute("aria-valuetext", "Up to 50% across 2 applications");
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
  it("reads Unavailable, never Not available, and Not finished for a stage still going", () => {
    const renderStage = (stage: StageRun) =>
      render(
        <MemoryRouter>
          <StageRunsTable
            runId="1"
            linkTo={(pathname) => pathname}
            stageRuns={[stage]}
          />
        </MemoryRouter>
      );
    // No agent message stops the clock of the awaiting stage yet.
    let { unmount } = renderStage(
      stageRun({
        order: 1,
        status: "AwaitingApproval",
        startedAt: "2026-11-10T10:06:00Z",
      })
    );
    expect(rows()[0][5]).toBe("Not finished");
    unmount();

    // An ended stage without a completion time: its duration is unknown.
    ({ unmount } = renderStage(
      stageRun({
        order: 1,
        status: "Failed",
        startedAt: "2026-11-10T10:06:00Z",
      })
    ));
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
