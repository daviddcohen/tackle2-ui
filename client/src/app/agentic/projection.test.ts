import {
  Agent,
  ApplicationMigrationDisplayStatus,
  ApplicationMigrationView,
  MigrationPlan,
  ModelProjection,
  PlanRun,
  getApplicationPlans,
  getMigrationDisplayStatus,
  getOrderedStageRuns,
  getPlanConfigurationChecks,
  getStageDefinition,
  getStagesWithUnverifiedModel,
  isActivePlanRun,
  isTerminalRunPhase,
} from "@app/agentic";

const plan: MigrationPlan = {
  id: "1",
  name: "Java migration",
  description: "A reusable Plan.",
  stages: [
    {
      id: "1",
      name: "Migrate",
      agent: { id: "1", name: "Code Migrator" },
      instructions: "Apply the migration.",
      requiresApproval: false,
      order: 1,
    },
  ],
  migrationPaths: [
    {
      archetype: { id: 1, name: "Java EE" },
      targetProfile: { id: 2, name: "Quarkus" },
    },
  ],
};

const agent: Agent = {
  id: "1",
  name: "Code Migrator",
  description: "Migrates code.",
  model: { id: "1", name: "Approved Model" },
  skills: [],
  prompt: "Migrate the application.",
  capabilities: ["Code migration"],
  parameters: [],
};

const model: ModelProjection = {
  id: "1",
  name: "Approved Model",
  provider: { id: "1", name: "Provider" },
  model: "model-id",
  verificationStatus: "verified",
  isOrganizationDefault: true,
};

const view = (
  overrides: Partial<ApplicationMigrationView>
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  ...overrides,
});

describe("getPlanConfigurationChecks", () => {
  it("derives Model configuration checks from Agent relationships", () => {
    const connectedChecks = getPlanConfigurationChecks(plan, [agent], [model]);
    expect(connectedChecks.find((check) => check.id === "models")?.status).toBe(
      "passed"
    );

    const disconnectedChecks = getPlanConfigurationChecks(
      plan,
      [agent],
      [{ ...model, verificationStatus: "unreachable" }]
    );
    expect(
      disconnectedChecks.find((check) => check.id === "models")?.status
    ).toBe("issue");
  });

  it("does not evaluate Models while Agents or Models are not loaded", () => {
    const checks = getPlanConfigurationChecks(plan, undefined, [model]);
    expect(checks.find((c) => c.id === "models")?.status).toBe("notEvaluated");
  });

  it("flags a Plan without stages", () => {
    const checks = getPlanConfigurationChecks({ ...plan, stages: [] }, [], []);
    expect(checks.find((c) => c.id === "stages")?.status).toBe("issue");
  });

  it("checks only stages and models: no target profile or skills check", () => {
    // A plan no target profile uses is run when someone picks it, so it is
    // not a configuration problem; "Skills found" could never warn.
    const checks = getPlanConfigurationChecks(
      { ...plan, migrationPaths: [] },
      [agent],
      [model]
    );
    expect(checks.map((check) => check.id)).toEqual(["stages", "models"]);
    expect(checks.every((check) => check.status === "passed")).toBe(true);
  });
});

describe("getStagesWithUnverifiedModel", () => {
  const stage = (id: string, order: number, agentId: string) => ({
    ...plan.stages[0],
    id,
    name: `Stage ${id}`,
    order,
    agent: { id: agentId, name: `Agent ${agentId}` },
  });
  const pending: ModelProjection = {
    ...model,
    id: "2",
    name: "Pending Model",
    verificationStatus: "pending",
  };
  const pendingAgent: Agent = {
    ...agent,
    id: "2",
    model: { id: "2", name: "Pending Model" },
  };

  it("lists the stages, in order, whose agent's model is not verified", () => {
    const affected = getStagesWithUnverifiedModel(
      {
        ...plan,
        stages: [stage("b", 3, "2"), stage("a", 1, "1"), stage("c", 2, "2")],
      },
      [agent, pendingAgent],
      [model, pending]
    );
    expect(affected.map((item) => item.stage.id)).toEqual(["c", "b"]);
    expect(affected[0].agent).toBe(pendingAgent);
    expect(affected[0].model).toBe(pending);
  });

  it("counts a stage whose agent or model is missing", () => {
    const affected = getStagesWithUnverifiedModel(
      { ...plan, stages: [stage("a", 1, "9"), stage("b", 2, "2")] },
      [agent, pendingAgent],
      [model]
    );
    expect(affected).toEqual([
      expect.objectContaining({ agent: undefined, model: undefined }),
      expect.objectContaining({ agent: pendingAgent, model: undefined }),
    ]);
  });

  it("gives the Models check its count", () => {
    const checks = getPlanConfigurationChecks(
      { ...plan, stages: [stage("a", 1, "2"), stage("b", 2, "2")] },
      [pendingAgent],
      [pending]
    );
    expect(checks.find((check) => check.id === "models")).toMatchObject({
      status: "issue",
      detailValues: { count: 2 },
    });
  });
});

describe("getMigrationDisplayStatus", () => {
  it.each<
    [Partial<ApplicationMigrationView>, ApplicationMigrationDisplayStatus]
  >([
    [{ configured: false }, "notConfigured"],
    [{ runPhase: "Running", intervention: "actionRequired" }, "actionRequired"],
    [{ runPhase: "Pending", preflight: "blocked" }, "pending"],
    [{ runPhase: "Running" }, "running"],
    [{ runPhase: "Failed", preflight: "ready" }, "failed"],
    [{ runPhase: "Succeeded", preflight: "blocked" }, "succeeded"],
    [{ preflight: "blocked" }, "preflightBlocked"],
    [{ preflight: "reviewRequired" }, "reviewRequired"],
    [{ preflight: "ready" }, "preflightReady"],
  ])("%j -> %s", (overrides, expected) => {
    expect(getMigrationDisplayStatus(view(overrides))).toBe(expected);
  });
});

describe("run helpers", () => {
  const run: PlanRun = {
    id: "9",
    name: "Run #9",
    planId: "1",
    planName: "Java migration",
    applications: [{ id: 1, name: "App" }],
    status: "Running",
    targetBranch: "main",
    startedAt: "2026-09-01T00:00:00Z",
    stageRuns: [
      {
        stageId: "b",
        name: "Second",
        agent: { id: "1", name: "Code Migrator" },
        instructions: "",
        requiresApproval: false,
        order: 2,
        status: "Pending",
      },
      {
        stageId: "a",
        name: "First",
        agent: { id: "1", name: "Code Migrator" },
        instructions: "Do it",
        requiresApproval: true,
        order: 1,
        status: "Running",
      },
    ],
  };

  it("classifies terminal phases", () => {
    expect(isTerminalRunPhase("Succeeded")).toBe(true);
    expect(isTerminalRunPhase("Failed")).toBe(true);
    expect(isTerminalRunPhase("AwaitingApproval")).toBe(false);
    expect(isTerminalRunPhase(undefined)).toBe(false);
    expect(isActivePlanRun(run)).toBe(true);
    expect(isActivePlanRun({ ...run, status: "Succeeded" })).toBe(false);
    expect(isActivePlanRun(undefined)).toBe(false);
  });

  it("orders stage runs and exposes the run's stage snapshot", () => {
    expect(getOrderedStageRuns(run).map((s) => s.stageId)).toEqual(["a", "b"]);
    expect(getStageDefinition(run.stageRuns[1])).toEqual({
      id: "a",
      name: "First",
      agent: { id: "1", name: "Code Migrator" },
      instructions: "Do it",
      requiresApproval: true,
      order: 1,
    });
  });
});

describe("getApplicationPlans", () => {
  const javaEE = { id: 1, name: "Java EE Application" };
  const quarkusPlan = { id: "1", name: "Java EE to Quarkus" };
  const liftPlan = { id: "3", name: "Java lift and shift" };
  const base: ApplicationMigrationView = {
    configured: true,
    intervention: "none",
    stages: [],
  };

  it("lists the plan of each migration path once, in path order", () => {
    expect(
      getApplicationPlans({
        ...base,
        migrationPaths: [
          {
            archetype: javaEE,
            targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
            plan: liftPlan,
          },
          { archetype: javaEE, targetProfile: { id: 13, name: "Payara 6" } },
          {
            archetype: javaEE,
            targetProfile: { id: 11, name: "Quarkus 3.x" },
            plan: quarkusPlan,
          },
          {
            archetype: { id: 3, name: "Legacy Java Application" },
            targetProfile: { id: 32, name: "Java 8 on OpenShift" },
            plan: liftPlan,
          },
        ],
      })
    ).toEqual([liftPlan, quarkusPlan]);
  });

  it("falls back to the default plan when the paths are not reported", () => {
    expect(getApplicationPlans({ ...base, plan: quarkusPlan })).toEqual([
      quarkusPlan,
    ]);
    expect(getApplicationPlans(base)).toEqual([]);
    // Reported paths win, even without a plan on any of them.
    expect(
      getApplicationPlans({ ...base, plan: quarkusPlan, migrationPaths: [] })
    ).toEqual([]);
  });
});
