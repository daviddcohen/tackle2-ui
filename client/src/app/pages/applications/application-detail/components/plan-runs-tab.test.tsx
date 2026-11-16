jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { PlanRun } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { PlanRunsTab } from "./plan-runs-tab";

const mockState: {
  planRuns: PlanRun[];
  fetchError?: unknown;
  isLoading?: boolean;
  canRun: boolean;
  open: jest.Mock;
} = { planRuns: [], canRun: true, open: jest.fn() };

jest.mock("@app/queries/agentic", () => ({
  useFetchPlanRuns: () => ({
    planRuns: mockState.planRuns,
    isLoading: mockState.isLoading ?? false,
    fetchError: mockState.fetchError ?? null,
  }),
}));

// The launcher gives no `open` without the run write scope, like the real one.
jest.mock("@app/pages/agentic/components/run-migration-plan-launcher", () => ({
  useRunMigrationPlanLauncher: () => ({
    open: mockState.canRun ? mockState.open : undefined,
    modal: null,
  }),
}));

const run = (id: string, applicationIds: number[]): PlanRun => ({
  id,
  name: `Run #${id} — Java EE to Quarkus`,
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: applicationIds.map((appId) => ({
    id: appId,
    name: `App ${appId}`,
  })),
  status: "Succeeded",
  targetBranch: "mta/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  completedAt: "2026-11-10T10:15:00Z",
  stageRuns: [],
});

const renderTab = () =>
  render(
    <Router history={createMemoryHistory()}>
      <PlanRunsTab
        applicationId={1}
        applicationName="Customer Management"
        linkCrumbs={[]}
      />
    </Router>
  );

describe("PlanRunsTab", () => {
  beforeEach(() => {
    mockState.planRuns = [];
    mockState.fetchError = undefined;
    mockState.isLoading = undefined;
    mockState.canRun = true;
    mockState.open = jest.fn();
  });

  it("lists only the runs that include the application, under a counted heading", () => {
    mockState.planRuns = [run("1", [1, 2]), run("2", [3]), run("3", [1])];
    renderTab();
    expect(
      screen.getByRole("heading", {
        name: "agentic.applicationDetail.planRunsTitle",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("agentic.applicationDetail.planRunsDescription")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Run #1 — Java EE to Quarkus" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Run #3 — Java EE to Quarkus" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Run #2 — Java EE to Quarkus" })
    ).not.toBeInTheDocument();
  });

  it("offers Run migration plan when the application has no run (AP5)", () => {
    renderTab();
    expect(
      screen.getByRole("heading", {
        name: "agentic.applicationDetail.tabPlanRuns",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("agentic.applicationDetail.planRunsEmpty")
    ).toBeInTheDocument();
    screen
      .getByRole("button", { name: "agentic.execution.startMigration" })
      .click();
    expect(mockState.open).toHaveBeenCalled();
  });

  it("has no start in the empty section without the run write scope (X9)", () => {
    mockState.canRun = false;
    renderTab();
    expect(
      screen.getByText("agentic.applicationDetail.planRunsEmpty")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "agentic.execution.startMigration",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the app placeholder while the runs load (AP9)", () => {
    mockState.isLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "agentic.applicationDetail.tabPlanRuns",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the error state when the runs cannot be read (AP9)", () => {
    mockState.fetchError = new Error("503");
    renderTab();
    expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
  });
});
