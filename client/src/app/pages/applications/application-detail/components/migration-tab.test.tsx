jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView, PlanRun, SkillsByStage } from "@app/agentic";
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
  open: jest.Mock;
  decide: jest.Mock;
} = { canRun: true, open: jest.fn(), decide: jest.fn() };

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

const skillsByStage: SkillsByStage = {
  stages: [
    {
      order: 1,
      name: "Prepare proposal",
      agent: { id: "a1", name: "Migration Proposal Agent" },
      skills: [
        {
          skill: { id: "7", name: "API compatibility checklist" },
          loadPolicy: "skill",
          from: [
            {
              kind: "agent",
              agent: { id: "a1", name: "Migration Proposal Agent" },
            },
          ],
          excluded: false,
        },
      ],
    },
  ],
  everyStage: [
    {
      application: { id: 1, name: "Customer Management" },
      skills: [
        {
          skill: { id: "5", name: "Corporate coding standards" },
          loadPolicy: "rule",
          from: [
            {
              kind: "application",
              application: { id: 1, name: "Customer Management" },
            },
          ],
          excluded: false,
        },
      ],
    },
  ],
};

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  preflight: "ready",
  plan: { id: "1", name: "Java EE to Quarkus" },
  targetProfile: { id: 11, name: "Quarkus 3.x" },
  archetype: { id: 4, name: "Java EE Application" },
  skills: skillsByStage,
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
  name: "Run #1: Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [
    { id: 1, name: "Customer Management" },
    { id: 2, name: "Policy Administration" },
  ],
  status,
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns,
});

const runRef = { id: "1", name: "Run #1: Java EE to Quarkus" };

const renderTab = (
  app = application(),
  notifications = createMockNotifications(),
  initialEntry = "/applications/1?tab=migration"
) =>
  render(
    <NotificationsContext.Provider value={notifications}>
      <Router history={createMemoryHistory({ initialEntries: [initialEntry] })}>
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
    mockState.open = jest.fn();
    mockState.decide = jest.fn().mockResolvedValue({});
  });

  describe("no migration plan", () => {
    const unconfigured = (overrides: Partial<ApplicationMigrationView> = {}) =>
      view({
        configured: false,
        plan: undefined,
        preflight: undefined,
        skills: undefined,
        ...overrides,
      });

    it("names a target profile without a plan and links to its archetype's profiles", () => {
      mockState.migration = unconfigured();
      renderTab(application([{ id: 4, name: "Java EE Application" }]));
      expect(
        screen.getByRole("heading", {
          name: "agentic.execution.noMigrationPathTitle",
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText("agentic.execution.noPlanForProfileBody")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "agentic.execution.viewTargetProfiles",
        })
      ).toHaveAttribute("href", "/archetypes/4/target-profiles");
      // The chain facts say which link is missing.
      expect(fact("agentic.entity.migrationPlan")).toHaveTextContent(
        "agentic.execution.notAssigned"
      );
      expect(
        screen.queryByRole("heading", { name: "agentic.stageSkills.title" })
      ).toBeNull();
    });

    it("says the archetype has no target profile", () => {
      mockState.migration = unconfigured({
        targetProfile: undefined,
        archetype: undefined,
      });
      renderTab(application([{ id: 3, name: "Node.js Service" }]));
      expect(
        screen.getByText("agentic.execution.noTargetProfileBody")
      ).toBeInTheDocument();
      expect(fact("agentic.execution.targetProfile")).toHaveTextContent(
        "agentic.execution.none"
      );
      expect(
        within(fact("agentic.execution.archetype")).getByRole("link")
      ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=3");
      expect(
        screen.getByRole("link", {
          name: "agentic.execution.viewTargetProfiles",
        })
      ).toHaveAttribute("href", "/archetypes/3/target-profiles");
    });

    it("names the archetype's only target profile from the paths", () => {
      mockState.migration = unconfigured({
        targetProfile: undefined,
        archetype: undefined,
        migrationPaths: [
          {
            archetype: { id: 4, name: "Java EE Application" },
            targetProfile: { id: 11, name: "Quarkus 3.x" },
          },
        ],
      });
      renderTab(application([{ id: 4, name: "Java EE Application" }]));
      expect(
        screen.getByText("agentic.execution.noPlanForProfileBody")
      ).toBeInTheDocument();
      // The only path is the chain the facts show.
      expect(
        within(fact("agentic.execution.targetProfile")).getByRole("link", {
          name: "Quarkus 3.x",
        })
      ).toHaveAttribute(
        "href",
        "/archetypes/4/target-profiles#target-profile-11"
      );
    });

    it("says none of the archetype's target profiles has a plan", () => {
      mockState.migration = unconfigured({
        targetProfile: undefined,
        archetype: undefined,
        migrationPaths: [
          {
            archetype: { id: 4, name: "Java EE Application" },
            targetProfile: { id: 11, name: "Quarkus 3.x" },
          },
          {
            archetype: { id: 4, name: "Java EE Application" },
            targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
          },
        ],
      });
      renderTab(application([{ id: 4, name: "Java EE Application" }]));
      expect(
        screen.getByText("agentic.execution.noPlanForProfilesBody")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("agentic.execution.noPlanForProfileBody")
      ).toBeNull();
      // Each path is listed; none can run, so no note about picking one.
      expect(
        within(fact("terms.targetProfiles")).getAllByRole("listitem")
      ).toHaveLength(2);
      expect(
        screen.queryByText("agentic.execution.migrationPathsNote")
      ).toBeNull();
      expect(
        screen.getByRole("link", {
          name: "agentic.execution.viewTargetProfiles",
        })
      ).toHaveAttribute("href", "/archetypes/4/target-profiles");
    });

    it("sends an application without an archetype to the archetypes", () => {
      renderTab(application([]));
      expect(
        screen.getByText("agentic.execution.noArchetypeBody")
      ).toBeInTheDocument();
      expect(fact("agentic.execution.archetype")).toHaveTextContent(
        "agentic.execution.none"
      );
      expect(
        screen.getByRole("link", { name: "agentic.execution.goToArchetypes" })
      ).toHaveAttribute("href", "/archetypes");
    });
  });

  it("shows the app placeholder while the migration loads", () => {
    mockState.migrationsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "agentic.execution.noMigrationPathTitle",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the app placeholder while the migration's run loads", () => {
    mockState.migration = view({ planRun: runRef, runPhase: "Running" });
    mockState.runLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.execution.statusLabel")
    ).not.toBeInTheDocument();
  });

  it("shows the error state when the migration cannot be read", () => {
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
      });
      mockState.planRun = awaiting();
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
      // The chain: archetype, its target profile, the plan they resolve to.
      expect(
        within(fact("agentic.execution.archetype")).getByRole("link", {
          name: "Java EE Application",
        })
      ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=4");
      expect(
        within(fact("agentic.execution.targetProfile")).getByRole("link")
      ).toHaveAttribute(
        "href",
        "/archetypes/4/target-profiles#target-profile-11"
      );
      expect(fact("agentic.execution.targetBranch")).toHaveTextContent(
        "konveyor/agentic-migration"
      );
      expect(
        within(fact("agentic.entity.migrationPlan")).getByRole("link")
      ).toHaveAttribute("href", "/migration-plans/1");
      // No pooled skills count: Skills by stage says what each stage gets.
      expect(
        screen.queryByText("agentic.applicationDetail.tabSkills")
      ).toBeNull();
      expect(
        screen.getByRole("heading", { name: "agentic.stageRunsTable.label" })
      ).toBeInTheDocument();
      expect(screen.getByText("Prepare proposal")).toBeInTheDocument();
    });

    it("without the run write scope waits for approval and offers no decision", () => {
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
      ).toHaveAttribute("href", "/plan-runs/1/stages/s1?application=1");
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
      "confirms, then says what the %s decided",
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

    it("keeps a profile without a known archetype as text", () => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Running",
        archetype: undefined,
      });
      mockState.planRun = run("Running", []);
      renderTab();
      expect(fact("agentic.execution.targetProfile")).toHaveTextContent(
        "Quarkus 3.x"
      );
      expect(
        within(fact("agentic.execution.targetProfile")).queryByRole("link")
      ).not.toBeInTheDocument();
    });

    it("names every archetype, the target profile's first", () => {
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      mockState.planRun = run("Running", []);
      renderTab(
        application([
          { id: 2, name: "Batch Jobs" },
          { id: 4, name: "Java EE Application" },
        ])
      );
      expect(
        within(fact("agentic.execution.archetypes"))
          .getAllByRole("link")
          .map((link) => link.textContent)
      ).toEqual(["Java EE Application", "Batch Jobs"]);
    });

    describe("several target profiles with a plan", () => {
      const javaEE = { id: 4, name: "Java EE Application" };
      const noDefault = (overrides: Partial<ApplicationMigrationView> = {}) =>
        view({
          plan: undefined,
          targetProfile: undefined,
          archetype: undefined,
          migrationPaths: [
            {
              archetype: javaEE,
              targetProfile: { id: 11, name: "Quarkus 3.x" },
              plan: { id: "1", name: "Java EE to Quarkus" },
            },
            {
              archetype: javaEE,
              targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
              plan: { id: "3", name: "Java lift and shift" },
            },
            {
              archetype: javaEE,
              targetProfile: { id: 13, name: "Payara 6" },
            },
          ],
          ...overrides,
        });

      it("lists each target profile with its plan in one fact, and says a run picks one", () => {
        mockState.migration = noDefault();
        renderTab(application([javaEE]));
        expect(
          within(fact("terms.targetProfiles")).getAllByRole("listitem")
        ).toHaveLength(3);
        expect(
          screen.getByText("agentic.execution.migrationPathsNote")
        ).toBeInTheDocument();
        // No single chain: no Target profile or Migration plan fact.
        expect(
          screen.queryByText("agentic.execution.targetProfile")
        ).toBeNull();
        expect(screen.queryByText("agentic.entity.migrationPlan")).toBeNull();
      });

      it("says the latest run ran a plan none of its target profiles uses", () => {
        mockState.migration = noDefault({
          planRun: { id: "4", name: "Run #4: .NET lift and shift" },
          planRunPlan: { id: "7", name: ".NET lift and shift" },
          runPhase: "Failed",
        });
        mockState.planRun = run("Failed", []);
        renderTab(application([javaEE]));
        expect(
          screen.getByText("agentic.execution.latestRunUnusedPlan")
        ).toBeInTheDocument();
        expect(
          screen.queryByText("agentic.execution.latestRunOtherPlan")
        ).toBeNull();
      });

      it("says nothing when the latest run ran one of its target profiles' plans", () => {
        mockState.migration = noDefault({
          planRun: { id: "4", name: "Run #4: Java lift and shift" },
          planRunPlan: { id: "3", name: "Java lift and shift" },
          runPhase: "Failed",
        });
        mockState.planRun = run("Failed", []);
        renderTab(application([javaEE]));
        expect(
          screen.queryByText("agentic.execution.latestRunUnusedPlan")
        ).toBeNull();
        expect(
          screen.queryByText("agentic.execution.latestRunOtherPlan")
        ).toBeNull();
      });
    });

    it("says which plan the latest run ran when it is not the application's", () => {
      mockState.migration = view({
        planRun: { id: "4", name: "Run #4: Java lift and shift" },
        planRunPlan: { id: "3", name: "Java lift and shift" },
        runPhase: "Failed",
      });
      mockState.planRun = run("Failed", []);
      renderTab();
      expect(
        screen.getByText("agentic.execution.latestRunOtherPlan")
      ).toBeInTheDocument();
    });

    it("says nothing about the run's plan when it is the application's, or unknown", () => {
      mockState.migration = view({
        planRun: runRef,
        planRunPlan: { id: "1", name: "Java EE to Quarkus" },
        runPhase: "Running",
      });
      mockState.planRun = run("Running", []);
      const { unmount } = renderTab();
      expect(
        screen.queryByText("agentic.execution.latestRunOtherPlan")
      ).toBeNull();
      unmount();
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      renderTab();
      expect(
        screen.queryByText("agentic.execution.latestRunOtherPlan")
      ).toBeNull();
    });

    it("names the target profile this application ran on in its latest run, linked", () => {
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      mockState.planRun = {
        ...run("Running", []),
        targetProfiles: [
          {
            application: { id: 1, name: "Customer Management" },
            targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
            archetype: { id: 4, name: "Java EE Application" },
          },
          {
            application: { id: 2, name: "Policy Administration" },
            targetProfile: { id: 11, name: "Quarkus 3.x" },
            archetype: { id: 4, name: "Java EE Application" },
          },
        ],
      };
      renderTab();
      const ranOn = fact("agentic.execution.runTargetProfile");
      expect(ranOn).toHaveTextContent("OpenJDK 21 on OpenShift");
      expect(
        within(ranOn).getByRole("link", { name: "OpenJDK 21 on OpenShift" })
      ).toHaveAttribute(
        "href",
        "/archetypes/4/target-profiles#target-profile-12"
      );
    });

    it("says None when the latest run used no target profile, and a profile without an archetype as text", () => {
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      mockState.planRun = {
        ...run("Running", []),
        targetProfiles: [
          {
            application: { id: 1, name: "Customer Management" },
            targetProfile: null,
          },
        ],
      };
      const { unmount } = renderTab();
      expect(fact("agentic.execution.runTargetProfile")).toHaveTextContent(
        "agentic.execution.none"
      );
      unmount();
      mockState.planRun = {
        ...run("Running", []),
        targetProfiles: [
          {
            application: { id: 1, name: "Customer Management" },
            targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
          },
        ],
      };
      renderTab();
      const ranOn = fact("agentic.execution.runTargetProfile");
      expect(ranOn).toHaveTextContent("OpenJDK 21 on OpenShift");
      expect(within(ranOn).queryByRole("link")).toBeNull();
    });

    it("adds no run target profile fact when the run does not report this application's", () => {
      mockState.migration = view({ planRun: runRef, runPhase: "Running" });
      mockState.planRun = run("Running", []);
      const { unmount } = renderTab();
      expect(
        screen.queryByText("agentic.execution.runTargetProfile")
      ).toBeNull();
      unmount();
      mockState.planRun = {
        ...run("Running", []),
        targetProfiles: [
          {
            application: { id: 2, name: "Policy Administration" },
            targetProfile: { id: 11, name: "Quarkus 3.x" },
            archetype: { id: 4, name: "Java EE Application" },
          },
        ],
      };
      renderTab();
      expect(
        screen.queryByText("agentic.execution.runTargetProfile")
      ).toBeNull();
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
          targetBranch: "konveyor/agentic-migration",
          branchUrl: "https://git.example.com/tree/konveyor",
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
      ).toHaveAttribute("href", "https://git.example.com/tree/konveyor");
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

  describe("skills by stage", () => {
    // The run's snapshot: one Every stage group per application of the run.
    const snapshot: SkillsByStage = {
      stages: skillsByStage.stages,
      everyStage: [
        ...skillsByStage.everyStage,
        {
          application: { id: 2, name: "Policy Administration" },
          skills: [
            {
              skill: { id: "9", name: "Other application's skill" },
              loadPolicy: "skill",
              from: [
                {
                  kind: "application",
                  application: { id: 2, name: "Policy Administration" },
                },
              ],
              excluded: false,
            },
          ],
        },
      ],
    };
    const withRun = (skills: SkillsByStage | undefined) => {
      mockState.migration = view({
        planRun: runRef,
        runPhase: "Succeeded",
        // The next run's preview is not this section's: never read.
        skills: { stages: [], everyStage: [] },
      });
      mockState.planRun = { ...run("Succeeded", []), skills };
    };

    it("comes last and lists what each stage got in the latest run, for this application", () => {
      withRun(snapshot);
      renderTab();
      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(headings[headings.length - 1]).toBe("agentic.stageSkills.title");
      expect(
        screen.getByText("agentic.execution.skillsByStageLatestRun")
      ).toBeInTheDocument();
      const table = screen.getByRole("grid", {
        name: "agentic.stageSkills.title",
      });
      expect(
        within(table).getByText("API compatibility checklist")
      ).toBeInTheDocument();
      // The application's own skill reads "This application".
      expect(
        within(table).getByText("agentic.stageSkills.origin.thisApplication")
      ).toBeInTheDocument();
      expect(
        within(table).getByText("agentic.stageSkills.everyStageSubtitle")
      ).toBeInTheDocument();
      // Another application of the same run keeps its own group.
      expect(within(table).queryByText("Other application's skill")).toBeNull();
    });

    it("names a target profile's archetype only when it is not the application's", () => {
      const profileSkill = (archetypeId: number): SkillsByStage => ({
        stages: skillsByStage.stages,
        everyStage: [
          {
            application: { id: 1, name: "Customer Management" },
            skills: [
              {
                skill: { id: "7", name: "OpenShift deployment conventions" },
                loadPolicy: "skill",
                from: [
                  {
                    kind: "targetProfile",
                    targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
                    archetype: { id: archetypeId, name: "Some archetype" },
                  },
                ],
                excluded: false,
              },
            ],
          },
        ],
      });
      // No default path, one archetype: it is the context.
      mockState.migration = view({
        archetype: undefined,
        targetProfile: undefined,
        planRun: runRef,
        runPhase: "Succeeded",
      });
      mockState.planRun = { ...run("Succeeded", []), skills: profileSkill(4) };
      const { unmount } = renderTab(
        application([{ id: 4, name: "Java EE Application" }])
      );
      const table = () =>
        screen.getByRole("grid", { name: "agentic.stageSkills.title" });
      expect(
        within(table()).getByText("agentic.stageSkills.origin.targetProfile")
      ).toBeInTheDocument();
      unmount();

      mockState.planRun = { ...run("Succeeded", []), skills: profileSkill(9) };
      renderTab(application([{ id: 4, name: "Java EE Application" }]));
      expect(
        within(table()).getByText(
          "agentic.stageSkills.origin.targetProfileWithArchetype"
        )
      ).toBeInTheDocument();
    });

    it("before any run, says skills are resolved when a plan runs, with no second Run button", () => {
      mockState.migration = view();
      renderTab();
      const section = screen.getByRole("region", {
        name: "agentic.stageSkills.title",
      });
      expect(
        within(section).getByText("agentic.execution.skillsByStageNoRun")
      ).toBeInTheDocument();
      expect(within(section).queryByRole("grid")).toBeNull();
      expect(within(section).queryByRole("button")).toBeNull();
      // The Stages section keeps the one way to start.
      expect(
        screen.getAllByRole("button", {
          name: "agentic.execution.startMigration",
        })
      ).toHaveLength(1);
      // Not the next run's preview from the migration view.
      expect(screen.queryByText("API compatibility checklist")).toBeNull();
    });

    it("says Unavailable, never none, when the run has no snapshot", () => {
      withRun(undefined);
      renderTab();
      const section = screen.getByRole("region", {
        name: "agentic.stageSkills.title",
      });
      expect(
        within(section).getByText("agentic.common.unavailable")
      ).toBeInTheDocument();
      expect(
        within(section).getByText("agentic.execution.skillsByStageUnavailable")
      ).toBeInTheDocument();
      expect(
        within(section).queryByText("agentic.execution.skillsByStageLatestRun")
      ).toBeNull();
      expect(
        within(section).queryByText("agentic.execution.skillsByStageNoRun")
      ).toBeNull();
    });

    it("says Unavailable with the reason when the run cannot be read", () => {
      mockState.migration = view({ planRun: runRef, runPhase: "Succeeded" });
      mockState.runError = new Error("503");
      renderTab();
      const section = screen.getByRole("region", {
        name: "agentic.stageSkills.title",
      });
      expect(
        within(section).getByText("agentic.common.unavailable")
      ).toBeInTheDocument();
      expect(
        within(section).getByText("agentic.execution.skillsByStageRunError")
      ).toBeInTheDocument();
    });

    it("keeps the latest run's skills when no plan resolves for the next run", () => {
      mockState.migration = view({
        configured: false,
        plan: undefined,
        planRun: runRef,
        runPhase: "Succeeded",
      });
      mockState.planRun = { ...run("Succeeded", []), skills: snapshot };
      renderTab(application([{ id: 4, name: "Java EE Application" }]));
      expect(
        screen.getByRole("heading", {
          name: "agentic.execution.noMigrationPathTitle",
        })
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByRole("grid", { name: "agentic.stageSkills.title" })
        ).getByText("API compatibility checklist")
      ).toBeInTheDocument();
      expect(fact("agentic.execution.targetBranch")).toHaveTextContent(
        "konveyor/agentic-migration"
      );
    });

    it("takes focus when the tab opens at its section", async () => {
      mockState.migration = view();
      renderTab(
        application(),
        createMockNotifications(),
        "/applications/1?tab=migration#skills-by-stage"
      );
      const heading = screen.getByRole("heading", {
        name: "agentic.stageSkills.title",
      });
      expect(heading).toHaveAttribute("id", "skills-by-stage-heading");
      await waitFor(() => expect(heading).toHaveFocus());
    });

    it("takes focus once per navigation, not again after a refetch", async () => {
      mockState.migration = view();
      const history = createMemoryHistory({
        initialEntries: ["/applications/1?tab=migration#skills-by-stage"],
      });
      const tree = () => (
        <NotificationsContext.Provider value={createMockNotifications()}>
          <Router history={history}>
            <MigrationTab
              application={application()}
              applicationId={1}
              linkCrumbs={[]}
            />
          </Router>
        </NotificationsContext.Provider>
      );
      const { rerender } = render(tree());
      const heading = () =>
        screen.getByRole("heading", { name: "agentic.stageSkills.title" });
      await waitFor(() => expect(heading()).toHaveFocus());
      heading().blur();
      // A refetch shows the placeholder, then the content again.
      mockState.migrationsLoading = true;
      rerender(tree());
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      mockState.migrationsLoading = undefined;
      rerender(tree());
      await waitFor(() => expect(heading()).toBeInTheDocument());
      expect(heading()).not.toHaveFocus();
    });

    it("leaves focus alone without the hash", () => {
      mockState.migration = view();
      renderTab();
      expect(
        screen.getByRole("heading", { name: "agentic.stageSkills.title" })
      ).not.toHaveFocus();
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

    it("has no start without the run write scope", () => {
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
