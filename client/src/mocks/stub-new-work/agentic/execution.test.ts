import {
  assignPlanToTargetProfile,
  createPlan,
  getPlan,
  updatePlan,
} from "./catalog";
import {
  applicationSkills,
  collectionSkillsForAgents,
  db,
  effectiveSkillsForPlan,
  resetAgenticDb,
  uniqueEffectiveSkills,
} from "./db";
import {
  PENDING_MS,
  STAGE_MS,
  approveStage,
  getApplicationMigrations,
  getPlanRun,
  listPlanRuns,
  portfolioApplications,
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

  it("lists each plan's applications: the ones it counts, in name order", () => {
    for (const scenario of ["configured", "running", "actionRequired"]) {
      setScenario(scenario);
      resetExecutionWorld();
      const views = getApplicationMigrations(
        portfolioApplications().map((application) => application.id)
      );
      for (const stored of db.plans) {
        const { applicationImpact } = getPlan(stored.id);
        const expected = portfolioApplications()
          .filter(
            (application) => views[application.id]?.plan?.id === stored.id
          )
          .map((application) => application.name)
          .sort((a, b) => a.localeCompare(b));
        expect(
          applicationImpact?.applications?.map(
            (application) => application.name
          )
        ).toEqual(expected);
        expect(applicationImpact?.matching).toBe(expected.length);
      }
    }
  });

  it("rejects a Plan without stages", () => {
    expect(() =>
      createPlan({ name: "Empty", description: "", stages: [] })
    ).toThrow(/at least one stage/);
  });
});

describe("skill exclusions", () => {
  // Application 13 resolves to Plan 5 (Legacy Java runtime modernization).
  const APPLICATION_ID = 13;
  const PLAN_ID = "5";

  const excludeOnPlan = (skillIds: string[]) => {
    const plan = db.plans.find((p) => p.id === PLAN_ID)!;
    updatePlan(PLAN_ID, {
      name: plan.name,
      description: plan.description,
      migrationPath: plan.migrationPath && {
        archetype: { id: plan.migrationPath.archetype.id },
        targetProfiles: plan.migrationPath.targetProfiles,
        isDefault: plan.migrationPath.isDefault,
      },
      stages: plan.stages.map((stage) => ({ ...stage })),
      excludedSkills: skillIds.map((id) => ({ id })),
    });
  };

  const startRun = () => {
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [APPLICATION_ID],
      planSelection: "recommended",
      targetBranch: "main",
    });
    return getPlanRun(ref.id);
  };

  const view = () => getApplicationMigrations([APPLICATION_ID])[APPLICATION_ID];

  it("keeps runs and application views as they were when nothing is excluded", () => {
    const plan = db.plans.find((p) => p.id === PLAN_ID)!;
    const expected = (applicationIds: number[]) =>
      uniqueEffectiveSkills([
        ...effectiveSkillsForPlan(plan),
        ...collectionSkillsForAgents(plan.stages.map((s) => s.agent.id)),
        ...applicationIds.flatMap(applicationSkills),
      ]);
    expect(view().plan?.id).toBe(PLAN_ID);
    expect(view()).not.toHaveProperty("excludedSkills");
    expect(JSON.stringify(view().effectiveSkills)).toBe(
      JSON.stringify(expected([APPLICATION_ID]))
    );
    const run = startRun();
    expect(run).not.toHaveProperty("excludedSkills");
    expect(JSON.stringify(run.resolvedSkills)).toBe(
      JSON.stringify(expected([APPLICATION_ID]))
    );
  });

  it("leaves excluded skills out of a started run and records them with their sources", () => {
    excludeOnPlan(["9"]);
    const run = startRun();
    expect(run.resolvedSkills?.some((e) => e.skill.id === "9")).toBe(false);
    expect(run.resolvedSkills?.some((e) => e.skill.id === "14")).toBe(true);
    expect(run.excludedSkills).toEqual([
      {
        skill: { id: "9", name: "Java runtime modernization" },
        scope: "archetype",
        scopeName: "Legacy Java Application",
      },
      {
        skill: { id: "9", name: "Java runtime modernization" },
        scope: "targetProfile",
        scopeName: "Java 17 on OpenShift",
      },
      {
        skill: { id: "9", name: "Java runtime modernization" },
        scope: "agent",
        scopeName: "Code Migrator",
      },
    ]);

    // The run keeps its snapshot when the Plan's exclusions change later.
    excludeOnPlan([]);
    expect(getPlanRun(run.id).excludedSkills).toEqual(run.excludedSkills);
  });

  it("splits the application view into skills used and skills excluded", () => {
    const before = view().effectiveSkills ?? [];
    excludeOnPlan(["9", "3"]);
    const after = view();
    const isExcluded = (skillId: string) => ["9", "3"].includes(skillId);
    expect(after.effectiveSkills).toEqual(
      before.filter((entry) => !isExcluded(entry.skill.id))
    );
    expect(after.excludedSkills).toEqual(
      before.filter((entry) => isExcluded(entry.skill.id))
    );
    expect(after.excludedSkills?.map((e) => e.scopeName)).toContain(
      "Code Migrator via Java modernization foundation"
    );
  });

  it("applies an exclusion only while the plan still resolves the skill", () => {
    // Spring Boot 3 upgrade reaches the plan through its archetype and the
    // application directly; the plan excludes it.
    const skill = db.skills.find((s) => s.id === "16")!;
    skill.associations.push(
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
      { scope: "application", resource: { id: 13, name: "Branch Operations" } }
    );
    excludeOnPlan(["16"]);
    expect(view().excludedSkills?.map((e) => e.scope)).toEqual([
      "archetype",
      "application",
    ]);

    // Without the archetype association the plan no longer resolves it, so
    // the stored exclusion does not apply to the application skill, as the
    // plan page shows.
    skill.associations = skill.associations.filter(
      (association) => association.scope !== "archetype"
    );
    expect(view()).not.toHaveProperty("excludedSkills");
    expect(view().effectiveSkills).toContainEqual({
      skill: { id: "16", name: "Spring Boot 3 upgrade" },
      scope: "application",
      scopeName: "Branch Operations",
    });
    const run = startRun();
    expect(run).not.toHaveProperty("excludedSkills");
    expect(run.resolvedSkills?.some((e) => e.skill.id === "16")).toBe(true);
  });
});
