jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView, PlanRun } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { PlanRunsTab } from "./plan-runs-tab";

const readyMigration: ApplicationMigrationView = {
  configured: true,
  intervention: "none",
  preflight: "ready",
  stages: [],
};

const mockState: {
  planRuns: PlanRun[];
  fetchError?: unknown;
  isLoading?: boolean;
  canRun: boolean;
  open: jest.Mock;
  migration?: ApplicationMigrationView;
  migrationsLoading?: boolean;
  migrationsError?: unknown;
} = { planRuns: [], canRun: true, open: jest.fn() };

jest.mock("@app/queries/agentic", () => ({
  useFetchPlanRuns: () => ({
    planRuns: mockState.planRuns,
    isLoading: mockState.isLoading ?? false,
    fetchError: mockState.fetchError ?? null,
  }),
  useFetchApplicationMigrations: () => ({
    migrations: mockState.migration != null ? { 1: mockState.migration } : {},
    isLoading: mockState.migrationsLoading ?? false,
    fetchError: mockState.migrationsError ?? null,
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
  name: `Run #${id}: Java EE to Quarkus`,
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: applicationIds.map((appId) => ({
    id: appId,
    name: `App ${appId}`,
  })),
  status: "Succeeded",
  targetBranch: "konveyor/agentic-migration",
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
    mockState.migration = readyMigration;
    mockState.migrationsLoading = undefined;
    mockState.migrationsError = undefined;
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
      screen.getByRole("link", { name: "Run #1: Java EE to Quarkus" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Run #3: Java EE to Quarkus" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Run #2: Java EE to Quarkus" })
    ).not.toBeInTheDocument();
  });

  it("offers Run migration plan when the application has no run", () => {
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

  it.each([
    ["has no migration path", undefined],
    [
      "is blocked",
      {
        ...readyMigration,
        preflight: "blocked",
        preflightReason: "No migration plan is assigned.",
      } as ApplicationMigrationView,
    ],
    [
      "needs a review before it starts",
      {
        ...readyMigration,
        preflight: "reviewRequired",
      } as ApplicationMigrationView,
    ],
  ])(
    "offers no start when the application %s, like the Migration tab",
    (_case, migration) => {
      mockState.migration = migration;
      renderTab();
      expect(
        screen.getByText("agentic.applicationDetail.planRunsEmpty")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "agentic.execution.startMigration",
        })
      ).not.toBeInTheDocument();
    }
  );

  it("waits for the application's status before it draws the section", () => {
    mockState.migrationsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "agentic.execution.startMigration",
      })
    ).not.toBeInTheDocument();
  });

  it("leaves the start to the dialog when the status cannot be read", () => {
    mockState.migration = undefined;
    mockState.migrationsError = new Error("503");
    renderTab();
    expect(
      screen.getByRole("button", { name: "agentic.execution.startMigration" })
    ).toBeInTheDocument();
  });

  it("keeps a blocked status it already read when a refresh fails", () => {
    mockState.migration = {
      ...readyMigration,
      preflight: "blocked",
      preflightReason: "No migration plan is assigned.",
    };
    mockState.migrationsError = new Error("503");
    renderTab();
    expect(
      screen.queryByRole("button", {
        name: "agentic.execution.startMigration",
      })
    ).not.toBeInTheDocument();
  });

  it("has no start in the empty section without the run write scope", () => {
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

  it("shows the app placeholder while the runs load", () => {
    mockState.isLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "agentic.applicationDetail.tabPlanRuns",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the error state when the runs cannot be read", () => {
    mockState.fetchError = new Error("503");
    renderTab();
    expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
  });
});
