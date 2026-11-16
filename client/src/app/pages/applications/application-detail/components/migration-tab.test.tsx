jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView, PlanRun } from "@app/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";

import { DecoratedApplication } from "../../useDecoratedApplications";

import { MigrationTab } from "./migration-tab";

const mockState: {
  migration?: ApplicationMigrationView;
  migrationsError?: unknown;
  migrationsLoading?: boolean;
  planRun?: PlanRun;
  runError?: unknown;
  runLoading?: boolean;
  canRun: boolean;
  archetypes: { id: number; name: string; profiles?: { id: number }[] }[];
  open: jest.Mock;
  decide: jest.Mock;
} = { canRun: true, archetypes: [], open: jest.fn(), decide: jest.fn() };

jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockState.canRun,
}));

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: mockState.migration ? { 1: mockState.migration } : {},
    isLoading: mockState.migrationsLoading ?? false,
    fetchError: mockState.migrationsError ?? null,
  }),
  useFetchPlanRun: () => ({
    planRun: mockState.planRun,
    isLoading: mockState.runLoading ?? false,
    fetchError: mockState.runError ?? null,
  }),
  useResolveApplicationMigrationRequestMutation: () => ({
    mutateAsync: mockState.decide,
    isPending: false,
  }),
}));

jest.mock("@app/queries/archetypes", () => ({
  useFetchArchetypes: () => ({ archetypes: mockState.archetypes }),
}));

// The launcher gives no `open` without the run write scope, like the real one.
jest.mock("@app/pages/agentic/components/run-migration-plan-launcher", () => ({
  useRunMigrationPlanLauncher: () => ({
    open: mockState.canRun ? mockState.open : undefined,
    modal: null,
  }),
}));

const application = (archetypes: DecoratedApplication["archetypes"] = []) =>
  ({
    id: 1,
    name: "Customer Management",
    archetypes,
  }) as DecoratedApplication;

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  preflight: "ready",
  plan: { id: "1", name: "Java EE to Quarkus" },
  targetProfile: { id: 11, name: "Quarkus 3.x" },
  effectiveSkills: [],
  ...overrides,
});

const stageRun = (
  order: number,
  name: string,
  status: PlanRun["status"]
): PlanRun["stageRuns"][number] => ({
  stageId: `s${order}`,
  name,
  agent: { id: "a1", name: "Migration Proposal Agent" },
  instructions: "",
  requiresApproval: true,
  order,
  status,
});

const run = (
  status: PlanRun["status"],
  stageRuns: PlanRun["stageRuns"]
): PlanRun => ({
  id: "1",
  name: "Run #1 — Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [
    { id: 1, name: "Customer Management" },
    { id: 2, name: "Policy Administration" },
  ],
  status,
  targetBranch: "mta/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns,
});

const runRef = { id: "1", name: "Run #1 — Java EE to Quarkus" };

const renderTab = (
  app = application(),
  notifications = createMockNotifications()
) =>
  render(
    <NotificationsContext.Provider value={notifications}>
      <Router history={createMemoryHistory()}>
        <MigrationTab application={app} applicationId={1} linkCrumbs={[]} />
      </Router>
    </NotificationsContext.Provider>
  );

const fact = (term: string) =>
  screen.getByText(term).closest(".pf-v6-c-description-list__group")
    ?.lastElementChild as HTMLElement;

describe("MigrationTab", () => {
  beforeEach(() => {
    mockState.migration = undefined;
    mockState.migrationsError = undefined;
    mockState.migrationsLoading = undefined;
    mockState.planRun = undefined;
    mockState.runError = undefined;
    mockState.runLoading = undefined;
    mockState.canRun = true;
    mockState.archetypes = [];
    mockState.open = jest.fn();
    mockState.decide = jest.fn().mockResolvedValue({});
  });

  describe("no migration path", () => {
    it("links to the target profiles of the application's archetype", () => {
      renderTab(application([{ id: 3, name: "Java EE Application" }]));
      expect(
        screen.getByRole("heading", {
          name: "agentic.execution.noMigrationPathTitle",
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText("agentic.execution.noMigrationPathBody")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "agentic.execution.viewTargetProfiles",
        })
      ).toHaveAttribute("href", "/archetypes/3/target-profiles");
    });

    it("sends an application without an archetype to the archetypes", () => {
      renderTab(application([]));
      expect(
        screen.getByText("agentic.execution.noArchetypeBody")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "agentic.execution.goToArchetypes" })
      ).toHaveAttribute("href", "/archetypes");
    });
  });

  it("shows the app placeholder while the migration loads (AP9)", () => {
    mockState.migrationsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "agentic.execution.noMigrationPathTitle",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the app placeholder while the migration's run loads (AP9)", () => {
    mockState.migration = view({ planRun: runRef, runPhase: "Running" });
    mockState.runLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.execution.statusLabel")
    ).not.toBeInTheDocument();
  });

  it("shows the error state when the migration cannot be read (AP9)", () => {
    mockState.migrationsError = new Error("503");
    renderTab();
    expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
  });

  describe("with a run", () => {
    const awaiting = () =>
      run("Running", [
        stageRun(1, "Prepare proposal", "AwaitingApproval"),
        stageRun(2, "Migrate", "Pending"),
      ]);

    it("leads with the decision, then the facts and the stages", () => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Running",
        intervention: "actionRequired",
        stages: [
          { stageName: "Prepare proposal", phase: "AwaitingApproval" },
          { stageName: "Migrate", phase: "Pending" },
        ],
        effectiveSkills: [
          {
            skill: { id: "1", name: "A" },
            scope: "agent",
            scopeName: "Code Migrator",
          },
          {
            skill: { id: "1", name: "A" },
            scope: "archetype",
            scopeName: "Java EE Application",
          },
          {
            skill: { id: "2", name: "B" },
            scope: "agent",
            scopeName: "Code Migrator",
          },
        ] as ApplicationMigrationView["effectiveSkills"],
      });
      mockState.planRun = awaiting();
      mockState.archetypes = [
        { id: 4, name: "Java EE Application", profiles: [{ id: 11 }] },
      ];
      renderTab();

      expect(screen.getByRole("heading", { level: 4 }).textContent).toContain(
        "agentic.stageAttention.approvalTitle"
      );
      expect(
        screen.getByRole("button", { name: "agentic.stageAttention.approve" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "agentic.stageAttention.reject" })
      ).toBeInTheDocument();
      expect(
        within(fact("agentic.entity.planRun")).getByRole("link")
      ).toHaveAttribute("href", "/plan-runs/1");
      // The profile's owner is found by profile id, not the application's archetype.
      expect(
        within(fact("agentic.execution.targetProfile")).getByRole("link")
      ).toHaveAttribute(
        "href",
        "/archetypes/4/target-profiles#target-profile-11"
      );
      expect(fact("agentic.execution.targetBranch")).toHaveTextContent(
        "mta/agentic-migration"
      );
      // Skills are counted once per skill and open the Skills tab.
      expect(
        within(fact("agentic.applicationDetail.tabSkills")).getByRole("link", {
          name: "agentic.execution.skillCount",
        })
      ).toHaveAttribute("href", "/?tab=skills");
      expect(
        screen.getByRole("heading", { name: "agentic.stageRunsTable.label" })
      ).toBeInTheDocument();
      expect(screen.getByText("Prepare proposal")).toBeInTheDocument();
    });

    it("without the run write scope waits for approval and offers no decision (X9, AP16)", () => {
      mockState.canRun = false;
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Running",
        intervention: "actionRequired",
        stages: [{ stageName: "Prepare proposal", phase: "AwaitingApproval" }],
      });
      mockState.planRun = awaiting();
      renderTab();
      expect(
        screen.getByText("agentic.stageAttention.waitingBody")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "agentic.stageAttention.approve",
        })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "agentic.stageAttention.reject" })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "agentic.stageAttention.reviewStage" })
      ).toHaveAttribute("href", "/plan-runs/1/stages/s1");
    });

    it.each([
      [
        "approve",
        "agentic.stageAttention.approve",
        "agentic.planRun.stageApproved",
      ],
      [
        "reject",
        "agentic.stageAttention.reject",
        "agentic.execution.runRejected",
      ],
    ])(
      "confirms, then says what the %s decided (AP13)",
      async (decision, button, toast) => {
        mockState.migration = view({
          planRun: runRef,
          runPhase: "Running",
          intervention: "actionRequired",
        });
        mockState.planRun = awaiting();
        const notifications = createMockNotifications();
        renderTab(application(), notifications);
        screen.getByRole("button", { name: button }).click();
        const dialog = await screen.findByRole("dialog");
        within(dialog).getByRole("button", { name: button }).click();
        await waitFor(() =>
          expect(notifications.pushNotification).toHaveBeenCalledWith({
            title: toast,
            variant: "success",
          })
        );
        expect(mockState.decide).toHaveBeenCalledWith({
          applicationId: 1,
          decision,
        });
      }
    );

    it("keeps a profile no archetype owns as text (AP14)", () => {
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      mockState.planRun = run("Running", []);
      renderTab();
      expect(fact("agentic.execution.targetProfile")).toHaveTextContent(
        "Quarkus 3.x"
      );
      expect(
        within(fact("agentic.execution.targetProfile")).queryByRole("link")
      ).not.toBeInTheDocument();
    });

    it("says Unavailable when the server gives no skills (X6)", () => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Running",
        effectiveSkills: undefined,
      });
      mockState.planRun = run("Running", []);
      renderTab();
      expect(fact("agentic.applicationDetail.tabSkills")).toHaveTextContent(
        "agentic.common.unavailable"
      );
    });

    it("sends the user to the run when it cannot be read and needs action", () => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Failed",
      });
      mockState.runError = new Error("503");
      renderTab();
      expect(
        screen.getByText("agentic.execution.planRunUnavailable")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "agentic.execution.viewPlanRun" })
      ).toHaveAttribute("href", "/plan-runs/1");
      expect(fact("agentic.execution.targetBranch")).toHaveTextContent(
        "agentic.common.unavailable"
      );
    });

    it("says Unavailable for the branch when the run never arrives", () => {
      // A run id the query will not fetch: no error, no run, no loading.
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      renderTab();
      expect(fact("agentic.execution.targetBranch")).toHaveTextContent(
        "agentic.common.unavailable"
      );
    });

    it("lists the commits of a finished migration, the branch once", () => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Succeeded",
        result: {
          repositoryName: "customer-management",
          targetBranch: "mta/agentic-migration",
          branchUrl: "https://git.example.com/tree/mta",
          commits: [
            {
              hash: "007a69cafe",
              message: "Prepare proposal: apply migration changes",
              stageName: "Prepare proposal",
              url: "https://git.example.com/commit/007a69cafe",
            },
          ],
        },
      });
      mockState.planRun = run("Succeeded", [
        stageRun(1, "Prepare proposal", "Succeeded"),
      ]);
      renderTab();
      expect(
        within(fact("agentic.execution.targetBranch")).getByRole("link")
      ).toHaveAttribute("href", "https://git.example.com/tree/mta");
      expect(
        screen.getByRole("heading", { name: "agentic.execution.commitsTitle" })
      ).toBeInTheDocument();
      const commitLink = screen.getByRole("link", { name: "007a69cafe" });
      expect(commitLink).toHaveAttribute(
        "href",
        "https://git.example.com/commit/007a69cafe"
      );
      expect(commitLink).toHaveAttribute("target", "_blank");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("before a run", () => {
    it("offers Run migration plan when the application is ready", () => {
      mockState.migration = view();
      renderTab();
      expect(screen.queryByText("agentic.entity.planRun")).toBeNull();
      expect(screen.queryByText("agentic.execution.targetBranch")).toBeNull();
      expect(
        screen.getByText("agentic.execution.noRunYet")
      ).toBeInTheDocument();
      screen
        .getByRole("button", { name: "agentic.execution.startMigration" })
        .click();
      expect(mockState.open).toHaveBeenCalled();
    });

    it("has no start without the run write scope (X9)", () => {
      mockState.canRun = false;
      mockState.migration = view();
      renderTab();
      expect(
        screen.getByText("agentic.execution.stagesAppearHere")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "agentic.execution.startMigration",
        })
      ).not.toBeInTheDocument();
    });

    it("says why it cannot start, and only before a run", () => {
      mockState.migration = view({
        preflight: "blocked",
        preflightReason: "A source control credential reference is missing.",
      });
      renderTab();
      expect(
        screen.getByText("agentic.execution.cannotStartTitle")
      ).toBeInTheDocument();
      expect(
        screen.getByText("agentic.execution.stagesAppearHere")
      ).toBeInTheDocument();
    });

    it("shows no blocker during or after a run", () => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Succeeded",
        preflight: "blocked",
        preflightReason: "Run #1 is already in progress.",
      });
      mockState.planRun = run("Succeeded", []);
      renderTab();
      expect(
        screen.queryByText("agentic.execution.cannotStartTitle")
      ).not.toBeInTheDocument();
    });
  });
});
