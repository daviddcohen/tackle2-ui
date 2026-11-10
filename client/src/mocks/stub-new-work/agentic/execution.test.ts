import { assignPlanToTargetProfile, createPlan } from "./catalog";
import { db, resetAgenticDb } from "./db";
import {
  PENDING_MS,
  STAGE_MS,
  approveStage,
  getApplicationMigrations,
  getPlanRun,
  listPlanRuns,
  resetExecutionWorld,
  runPhases,
  startApplicationMigrations,
} from "./execution";

const setScenario = (scenario: string, stage = 1) =>
  window.history.replaceState(
    {},
    "",
    `/?protoScenario=${scenario}&protoStage=${stage}`
  );

let now = 1_800_000_000_000;
const advanceTime = (ms: number) => {
  now += ms;
};

beforeEach(() => {
  jest.spyOn(Date, "now").mockImplementation(() => now);
  resetAgenticDb();
  resetExecutionWorld();
  setScenario("configured");
});

afterEach(() => jest.restoreAllMocks());

describe("seeded worlds", () => {
  it("has nothing running in the configured world", () => {
    expect(Object.values(runPhases())).not.toContain("Running");
    expect(Object.values(runPhases())).not.toContain("Pending");
    expect(runPhases()["1"]).toBe("Succeeded");
  });

  it.each([
    ["queued", "Pending"],
    ["running", "Running"],
    ["failed", "Failed"],
    ["completed", "Succeeded"],
  ])("projects every run of the %s world to %s", (scenario, phase) => {
    setScenario(scenario);
    expect(new Set(Object.values(runPhases()))).toEqual(new Set([phase]));
  });

  it("covers the 12-app portfolio exactly once in execution worlds", () => {
    setScenario("running");
    const ids = listPlanRuns().flatMap((run) =>
      run.applications.map((a) => a.id)
    );
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it("keeps seeded runs frozen (no progression without a user action)", () => {
    setScenario("running", 2);
    const before = getPlanRun("1");
    advanceTime(10 * STAGE_MS);
    const after = getPlanRun("1");
    expect(after.status).toBe("Running");
    expect(after.stageRuns.map((s) => s.status)).toEqual(
      before.stageRuns.map((s) => s.status)
    );
  });

  it("re-seeds when the scenario changes", () => {
    startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
    });
    expect(listPlanRuns()).toHaveLength(8);
    setScenario("completed");
    expect(listPlanRuns()).toHaveLength(7);
  });
});

describe("timed progression of started runs", () => {
  it("goes Pending -> Running through every stage -> Succeeded (unattended)", () => {
    db.executionPolicy = { interactionMode: "unattended" };
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
    });
    expect(getPlanRun(ref.id).status).toBe("Pending");
    expect(getApplicationMigrations([1])[1].runPhase).toBe("Pending");

    advanceTime(PENDING_MS);
    const running = getPlanRun(ref.id);
    expect(running.status).toBe("Running");
    expect(running.stageRuns[0].status).toBe("Running");

    advanceTime(STAGE_MS);
    expect(getPlanRun(ref.id).stageRuns[0].status).toBe("Succeeded");
    expect(getPlanRun(ref.id).stageRuns[1].status).toBe("Running");

    advanceTime(STAGE_MS * running.stageRuns.length);
    const done = getPlanRun(ref.id);
    expect(done.status).toBe("Succeeded");
    expect(done.completedAt).toBeDefined();
    expect(done.stageRuns.every((s) => s.status === "Succeeded")).toBe(true);
    expect(getApplicationMigrations([1])[1].runPhase).toBe("Succeeded");
    expect(getApplicationMigrations([1])[1].result?.commits.length).toBe(
      done.stageRuns.length
    );
  });

  it("stops at stages that require approval under the default (interactive) policy", () => {
    expect(db.executionPolicy.interactionMode).toBe("interactive");
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
    });
    advanceTime(PENDING_MS + STAGE_MS);
    const waiting = getPlanRun(ref.id);
    expect(waiting.status).toBe("AwaitingApproval");
    expect(waiting.stageRuns[0].status).toBe("AwaitingApproval");
    expect(getApplicationMigrations([1])[1].intervention).toBe(
      "actionRequired"
    );

    advanceTime(10 * STAGE_MS);
    expect(getPlanRun(ref.id).status).toBe("AwaitingApproval");

    approveStage(ref.id, waiting.stageRuns[0].stageId);
    expect(getPlanRun(ref.id).stageRuns[1].status).toBe("Running");
  });

  it("snapshots the Plan's stages, so later Plan edits do not change the run", () => {
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
    });
    const run = getPlanRun(ref.id);
    const plan = db.plans.find((p) => p.id === run.planId)!;
    plan.stages = plan.stages.slice(0, 1);
    expect(getPlanRun(ref.id).stageRuns).toHaveLength(run.stageRuns.length);
  });
});

describe("Plan resolution", () => {
  const recommendedPlan = (applicationId: number) =>
    getApplicationMigrations([applicationId])[applicationId].plan;

  it("resolves through the target profile to its default Plan", () => {
    // Applications 1 and 2 share archetype 1 and migrate to different profiles.
    expect(recommendedPlan(1)?.id).not.toBe(recommendedPlan(2)?.id);
    const plan = db.plans.find((p) => p.id === recommendedPlan(1)?.id)!;
    expect(plan.migrationPath?.isDefault).toBe(true);
  });

  it("ignores a new non-default Plan on the same path", () => {
    const before = recommendedPlan(1);
    const profiles = db.plans.find((p) => p.id === before?.id)!.migrationPath!;
    createPlan({
      name: "Draft plan",
      description: "",
      migrationPath: { ...profiles, isDefault: false },
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });
    expect(recommendedPlan(1)).toEqual(before);
  });

  it("follows the default when it moves, without removing the previous Plan's path", () => {
    const before = db.plans.find((p) => p.id === recommendedPlan(1)?.id)!;
    const path = before.migrationPath!;
    const draft = createPlan({
      name: "Draft plan",
      description: "",
      migrationPath: { ...path, isDefault: false },
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });
    assignPlanToTargetProfile(path.archetype.id, path.targetProfiles[0].id, {
      planId: draft.id,
    });
    expect(recommendedPlan(1)?.id).toBe(draft.id);
    const previous = db.plans.find((p) => p.id === before.id)!;
    expect(previous.migrationPath?.targetProfiles).toEqual(path.targetProfiles);
    expect(previous.migrationPath?.isDefault).toBe(false);
  });

  it("rejects a second default Plan for a target profile", () => {
    const path = db.plans.find(
      (p) => p.id === recommendedPlan(1)?.id
    )!.migrationPath!;
    expect(() =>
      createPlan({
        name: "Second default",
        description: "",
        migrationPath: { ...path, isDefault: true },
        stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
      })
    ).toThrow(/already the default Plan/);
  });

  it("rejects a Plan without stages", () => {
    expect(() =>
      createPlan({ name: "Empty", description: "", stages: [] })
    ).toThrow(/at least one stage/);
  });
});
