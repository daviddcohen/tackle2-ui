import {
  Agent,
  ApplicationMigrationDisplayStatus,
  ApplicationMigrationView,
  MigrationPlan,
  ModelProjection,
  PlanRun,
  getMigrationDisplayStatus,
  getNextActionKey,
  getOrderedStageRuns,
  getPlanConfigurationChecks,
  getStageDefinition,
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
  migrationPath: {
    archetype: { id: 1, name: "Java EE" },
    targetProfiles: [{ id: 2, name: "Quarkus" }],
    isDefault: true,
  },
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

  it("flags a Plan without a migration path or stages", () => {
    const checks = getPlanConfigurationChecks(
      { ...plan, migrationPath: undefined, stages: [] },
      [],
      []
    );
    expect(checks.find((c) => c.id === "path")?.status).toBe("issue");
    expect(checks.find((c) => c.id === "stages")?.status).toBe("issue");
    expect(checks.find((c) => c.id === "skills")?.status).toBe("notEvaluated");
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

describe("getNextActionKey", () => {
  it.each<[ApplicationMigrationDisplayStatus, string]>([
    ["notConfigured", "configure"],
    ["preflightReady", "start"],
    ["preflightBlocked", "resolve"],
    ["reviewRequired", "resolve"],
    ["pending", "monitor"],
    ["running", "monitor"],
    ["actionRequired", "review"],
    ["failed", "correct"],
    ["succeeded", "reviewResults"],
  ])("%s -> %s", (status, expected) => {
    expect(getNextActionKey(status)).toBe(expected);
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
