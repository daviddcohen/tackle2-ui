import { MemoryRouter } from "react-router-dom";

import { PlanRun, StageRun } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { PlanRunsTable, getActiveStage } from "./plan-runs-table";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const stage = (
  order: number,
  name: string,
  status: StageRun["status"]
): StageRun => ({
  stageId: String(order),
  name,
  agent: { id: "1", name: "Agent" },
  instructions: "",
  requiresApproval: false,
  order,
  status,
});

const run = (overrides: Partial<PlanRun> & Pick<PlanRun, "id">): PlanRun => ({
  name: `Run #${overrides.id} — Java EE to Quarkus`,
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [{ id: 1, name: "Customer Management" }],
  status: "Succeeded",
  targetBranch: "mta/agentic-migration",
  startedAt: "2026-09-20T08:00:00Z",
  completedAt: "2026-09-20T10:15:00Z",
  stageRuns: [],
  ...overrides,
});

const runs: PlanRun[] = [
  run({ id: "3" }),
  run({
    id: "1",
    status: "AwaitingApproval",
    startedAt: "2026-11-10T10:06:00Z",
    completedAt: undefined,
    applications: [
      { id: 1, name: "Customer Management" },
      { id: 3, name: "Claims Processing" },
      { id: 8, name: "Underwriting Workbench" },
    ],
    stageRuns: [
      stage(2, "Migrate", "Pending"),
      stage(1, "Prepare proposal", "AwaitingApproval"),
      stage(3, "Validate", "Pending"),
    ],
  }),
  run({
    id: "7",
    status: "Pending",
    completedAt: undefined,
    stageRuns: [stage(1, "Prepare proposal", "Pending")],
  }),
];

const linkTo = (pathname: string, search = "") => `${pathname}${search}`;

const renderTable = (
  props: Partial<React.ComponentProps<typeof PlanRunsTable>>
) =>
  render(
    <MemoryRouter>
      <PlanRunsTable runs={runs} linkTo={linkTo} {...props} />
    </MemoryRouter>
  );

const bodyRows = () => screen.getAllByRole("row").slice(1);
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("getActiveStage", () => {
  it("names the stage awaiting approval or running, with its position", () => {
    expect(getActiveStage(runs[1])).toEqual({
      stageRun: expect.objectContaining({ name: "Prepare proposal" }),
      position: 1,
      count: 3,
    });
    expect(
      getActiveStage(
        run({
          id: "2",
          status: "Running",
          stageRuns: [
            stage(1, "Prepare proposal", "Succeeded"),
            stage(2, "Migrate", "Running"),
            stage(3, "Validate", "Pending"),
          ],
        })
      )
    ).toMatchObject({ position: 2, count: 3 });
  });

  it("has no active stage before or after the run", () => {
    expect(getActiveStage(runs[0])).toBeUndefined();
    expect(getActiveStage(runs[2])).toBeUndefined();
  });
});

describe("PlanRunsTable", () => {
  it("shows the kit columns, newest first, with verbatim run names", () => {
    renderTable({ origin: "?from=app-1" });

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toEqual([
      "Run",
      "Migration plan",
      "Status",
      "Applications",
      "Started",
      "Duration",
    ]);
    const [pending, actionRequired, succeeded] = bodyRows();

    // A pending run has not started, whatever its startedAt says.
    expect(cells(pending)).toEqual([
      "Run #7 — Java EE to Quarkus",
      "Java EE to Quarkus",
      "Pending",
      "Customer Management",
      "Not started",
      "Not started",
    ]);
    expect(cells(actionRequired).slice(0, 5)).toEqual([
      "Run #1 — Java EE to Quarkus",
      "Java EE to Quarkus",
      "Action requiredApproval needed: Prepare proposal",
      "3 applications",
      "2026-11-10 10:06",
    ]);
    // Its awaiting stage has no agent message to stop the clock: unknown.
    expect(cells(actionRequired)[5]).toBe("Unavailable");
    expect(cells(succeeded)[4]).toBe("2026-09-20 08:00");
    expect(cells(succeeded)[5]).toBe("135m");

    // Every link carries the caller's origin; several applications open the run.
    expect(
      within(actionRequired).getByRole("link", { name: "3 applications" })
    ).toHaveAttribute("href", "/plan-runs/1?from=app-1");
    expect(
      within(succeeded).getByRole("link", { name: "Customer Management" })
    ).toHaveAttribute("href", "/applications/1?from=app-1");
    expect(
      within(succeeded).getByRole("link", { name: "Java EE to Quarkus" })
    ).toHaveAttribute("href", "/migration-plans/1?from=app-1");
  });

  it("does not link the page's own application to itself", () => {
    renderTable({ runs: [runs[0]], currentApplicationId: 1 });
    const [row] = bodyRows();
    expect(cells(row)[3]).toBe("Customer Management");
    expect(
      within(row).queryByRole("link", { name: "Customer Management" })
    ).not.toBeInTheDocument();
  });

  it("names the running stage and its position", () => {
    renderTable({
      runs: [
        run({
          id: "2",
          status: "Running",
          completedAt: undefined,
          stageRuns: [
            stage(1, "Prepare proposal", "Succeeded"),
            stage(2, "Migrate", "Running"),
            stage(3, "Validate", "Pending"),
          ],
        }),
      ],
    });
    expect(cells(bodyRows()[0])[2]).toBe("RunningStage 2 of 3: Migrate");
  });

  it("hides the Migration plan column on a plan's Runs tab", () => {
    renderTable({ showPlan: false });

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toEqual(["Run", "Status", "Applications", "Started", "Duration"]);
    expect(cells(bodyRows()[0])[0]).toBe("Run #7 — Java EE to Quarkus");
  });

  it("paginates a tab only above 10 runs", () => {
    const { unmount } = renderTable({});
    expect(screen.queryByLabelText(/pagination/i)).not.toBeInTheDocument();
    unmount();

    renderTable({
      runs: Array.from({ length: 11 }, (_, index) =>
        run({ id: String(index + 1) })
      ),
    });
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getAllByLabelText(/pagination/i).length).toBeGreaterThan(0);
  });

  it("shows the caller's empty state without runs", () => {
    renderTable({ runs: [], emptyState: <p>No plan runs yet</p> });
    expect(screen.getByText("No plan runs yet")).toBeInTheDocument();
  });
});
