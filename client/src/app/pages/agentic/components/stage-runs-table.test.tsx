import { MemoryRouter } from "react-router-dom";

import { StageRun } from "@app/agentic";
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
