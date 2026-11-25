import { SkillsByStage } from "@app/agentic";
import { mockArchetypes } from "@mocks/stub-new-work/archetypes";

import {
  assignPlanToTargetProfile,
  createPlan,
  getPlan,
  updatePlan,
} from "./catalog";
import { db, resetAgenticDb } from "./db";
import {
  PENDING_MS,
  STAGE_MS,
  approveStage,
  getApplicationMigrations,
  getPlanRun,
  listPlanRuns,
  planImpact,
  portfolioApplications,
  resetExecutionWorld,
  resolvePlanFor,
  resolveRunSkills,
  runPhases,
  startApplicationMigrations,
} from "./execution";
import { SINGLE_PLAN_RUN_IDS, mockMigrationPlans } from "./fixtures";

/** Every entry of `skillId` in a resolution, stage groups first. */
const entriesOf = (skills: SkillsByStage | undefined, skillId: string) =>
  [
    ...(skills?.stages ?? []).flatMap((group) => group.skills),
    ...(skills?.everyStage ?? []).flatMap((group) => group.skills),
  ].filter(({ skill }) => skill.id === skillId);

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

  it("covers the 13-app portfolio exactly once in execution worlds", () => {
    setScenario("running");
    const ids = listPlanRuns().flatMap((run) =>
      run.applications.map((a) => a.id)
    );
    expect(ids).toHaveLength(13);
    expect(new Set(ids).size).toBe(13);
  });

  it.each(["configured", "queued", "running", "actionRequired", "completed"])(
    "puts every application of a seeded run (%s) on that run's plan, except the one single-plan run",
    (scenario) => {
      setScenario(scenario);
      expect(SINGLE_PLAN_RUN_IDS.size).toBeLessThanOrEqual(1);
      listPlanRuns().forEach((run) => {
        const resolved = run.applications.map(
          (ref) =>
            resolvePlanFor(
              portfolioApplications().find((a) => a.id === ref.id)!
            )?.id
        );
        expect(resolved).toEqual(
          run.applications.map(() =>
            SINGLE_PLAN_RUN_IDS.has(run.id)
              ? expect.not.stringMatching(`^${run.planId}$`)
              : run.planId
          )
        );
      });
    }
  );

  it.each(["configured", "running", "failed"])(
    "computes every seeded run's skills snapshot with the resolver (%s)",
    (scenario) => {
      setScenario(scenario);
      listPlanRuns().forEach((run) => {
        const plan = mockMigrationPlans.find((p) => p.id === run.planId)!;
        expect(run.skills).toEqual(
          resolveRunSkills(
            plan,
            run.applications.map((a) => a.id)
          )
        );
        expect(run.skills?.everyStage.map((g) => g.application)).toEqual(
          run.applications
        );
        expect(run.skills?.stages.map((g) => g.stageId)).toEqual(
          run.stageRuns.map((stageRun) => stageRun.stageId)
        );
      });
    }
  );

  it("keeps Run #1 on two applications, Claims Processing with its own skill", () => {
    const run = getPlanRun("1");
    expect(run.applications.map((a) => a.id)).toEqual([3, 8]);
    const [claims, underwriting] = run.skills!.everyStage;
    const ejb = claims.skills.find((e) => e.skill.id === "2");
    expect(ejb?.from).toContainEqual({
      kind: "application",
      application: { id: 3, name: "Claims Processing" },
    });
    expect(
      underwriting.skills
        .find((e) => e.skill.id === "2")
        ?.from.some((origin) => origin.kind === "application")
    ).toBe(false);
  });

  it("gives each application of a run its own commits, a run on one application none named", () => {
    const run = getPlanRun("1");
    const migrate = run.stageRuns.find((stage) => stage.stageId === "2");
    const commits = migrate?.commits ?? [];
    // Two seeded commits, one each per application, the first keeps its hash.
    expect(commits.map((commit) => commit.application?.id)).toEqual([
      3, 3, 8, 8,
    ]);
    expect(commits[0].hash).toBe("b2c3d4e5f6a1");
    expect(new Set(commits.map((commit) => commit.hash)).size).toBe(4);
    expect(
      getPlanRun("2")
        .stageRuns.flatMap((stage) => stage.commits ?? [])
        .every((commit) => commit.application == null)
    ).toBe(true);
    // An application's view lists only its own commits.
    setScenario("completed");
    const completed = getPlanRun("1");
    const views = getApplicationMigrations(
      completed.applications.map((application) => application.id)
    );
    for (const application of completed.applications) {
      const own = views[application.id].result?.commits ?? [];
      expect(own.length).toBeGreaterThan(0);
      expect(
        own.every((commit) => commit.application?.id === application.id)
      ).toBe(true);
    }
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

  it("gives each application its own commits in a started run on several applications", () => {
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1, 2],
      planSelection: "recommended",
      targetBranch: "main",
    });
    expect(getPlanRun(ref.id).applications.map((a) => a.id)).toEqual([1, 2]);
    // Interactive: the first stage stops for approval with its proposal
    // commit, one per application.
    advanceTime(PENDING_MS + STAGE_MS);
    const waiting = getPlanRun(ref.id);
    expect(waiting.stageRuns[0].status).toBe("AwaitingApproval");
    const owners = (index: number) =>
      (getPlanRun(ref.id).stageRuns[index].commits ?? []).map(
        (commit) => commit.application?.id
      );
    expect(owners(0)).toEqual([1, 2]);
    // After the approval, the next stage finishes with one commit each.
    approveStage(ref.id, waiting.stageRuns[0].stageId);
    advanceTime(STAGE_MS);
    expect(getPlanRun(ref.id).stageRuns[1].status).toBe("Succeeded");
    expect(owners(1)).toEqual([1, 2]);
    const hashes = (getPlanRun(ref.id).stageRuns[1].commits ?? []).map(
      (commit) => commit.hash
    );
    expect(new Set(hashes).size).toBe(2);
  });

  it("gives each application its own commits after approving a seeded run", () => {
    setScenario("actionRequired");
    const run = getPlanRun("1");
    expect(run.applications.length).toBeGreaterThan(1);
    const waiting = run.stageRuns.find(
      (stage) => stage.status === "AwaitingApproval"
    );
    expect(waiting).toBeDefined();
    approveStage("1", waiting!.stageId);
    advanceTime(STAGE_MS);
    const after = getPlanRun("1");
    const next = after.stageRuns.find(
      (stage) => stage.order === waiting!.order + 1
    );
    expect(next?.status).not.toBe("Running");
    expect(next?.status).not.toBe("Pending");
    expect(
      (next?.commits ?? []).map((commit) => commit.application?.id)
    ).toEqual(run.applications.map((application) => application.id));
  });

  it("snapshots one every-stage group per application, each with only its own skills", () => {
    db.skills
      .find((skill) => skill.id === "6")!
      .associations.push({
        scope: "application",
        resource: { id: 1, name: "Customer Management" },
      });
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1, 2],
      planSelection: "recommended",
      targetBranch: "main",
    });
    const run = getPlanRun(ref.id);
    expect(run.applications.map((a) => a.id)).toEqual([1, 2]);
    const [first, second] = run.skills!.everyStage;
    expect([first.application?.id, second.application?.id]).toEqual([1, 2]);
    expect(first.skills.find((e) => e.skill.id === "6")?.from).toEqual([
      {
        kind: "application",
        application: { id: 1, name: "Customer Management" },
      },
    ]);
    expect(second.skills.some((e) => e.skill.id === "6")).toBe(false);
    expect(run.skills?.stages.map((group) => group.stageId)).toEqual(
      run.stageRuns.map((stageRun) => stageRun.stageId)
    );
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
    // Applications 1 (Java EE) and 4 (Spring Boot) are in different archetypes.
    expect(recommendedPlan(1)?.id).not.toBe(recommendedPlan(4)?.id);
    const plan = db.plans.find((p) => p.id === recommendedPlan(1)?.id)!;
    expect(plan.migrationPath?.isDefault).toBe(true);
    // Applications of one archetype share its target profile, so its plan.
    expect(recommendedPlan(2)).toEqual(recommendedPlan(1));
  });

  it("uses the archetype's target profile, whatever the latest run used", () => {
    portfolioApplications().forEach((application) => {
      const view = getApplicationMigrations([application.id])[application.id];
      const archetype = mockArchetypes[application.archetypes![0].id];
      const profile = archetype.profiles![0];
      expect(view.targetProfile).toEqual({
        id: profile.id,
        name: profile.name,
      });
      expect(view.archetype).toEqual({
        id: archetype.id,
        name: archetype.name,
      });
      expect(view.plan?.id).toBe(resolvePlanFor(application)?.id);
      const plan = db.plans.find((p) => p.id === view.plan?.id)!;
      expect(plan.migrationPath?.archetype.id).toBe(archetype.id);
      expect(
        plan.migrationPath?.targetProfiles.some((tp) => tp.id === profile.id)
      ).toBe(true);
    });
  });

  it("reports the latest run's plan beside the plan the next run uses", () => {
    const view = getApplicationMigrations([3])[3];
    const latest = listPlanRuns()
      .filter((run) => run.applications.some((a) => a.id === 3))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    expect(view.planRun).toEqual({ id: latest.id, name: latest.name });
    expect(view.planRunPlan).toEqual({
      id: latest.planId,
      name: latest.planName,
    });
    expect(view.plan?.id).toBe("1");
  });

  it("counts applications by the plan they resolve to (plan impact)", () => {
    const portfolio = portfolioApplications();
    db.plans.forEach((plan) => {
      expect(planImpact(plan.id)).toBe(
        portfolio.filter(
          (application) => resolvePlanFor(application)?.id === plan.id
        ).length
      );
    });
    expect(
      db.plans.reduce((total, plan) => total + planImpact(plan.id), 0)
    ).toBe(portfolio.length);
  });

  it("starts each application on its own plan with recommended plans", () => {
    const { planRuns } = startApplicationMigrations({
      applicationIds: [1, 4],
      planSelection: "recommended",
      targetBranch: "main",
    });
    expect(planRuns).toHaveLength(2);
    const runs = planRuns.map((ref) => getPlanRun(ref.id));
    expect(
      runs.map((run) => [run.planId, run.applications.map((a) => a.id)])
    ).toEqual([
      [
        resolvePlanFor(portfolioApplications().find((a) => a.id === 1)!)!.id,
        [1],
      ],
      [
        resolvePlanFor(portfolioApplications().find((a) => a.id === 4)!)!.id,
        [4],
      ],
    ]);
    runs.forEach((run) => {
      expect(run.name).toBe(`Run #${run.id}: ${run.planName}`);
    });
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

  it("resolves runs and application views with the one resolver", () => {
    const plan = db.plans.find((p) => p.id === PLAN_ID)!;
    const expected = resolveRunSkills(plan, [APPLICATION_ID]);
    expect(view().plan?.id).toBe(PLAN_ID);
    expect(view().skills).toEqual(expected);
    const run = startRun();
    expect(run.skills).toEqual(expected);
    expect(run.skills?.stages.map((group) => group.stageId)).toEqual(
      run.stageRuns.map((stageRun) => stageRun.stageId)
    );
    expect(run.skills?.everyStage.map((group) => group.application)).toEqual([
      { id: APPLICATION_ID, name: "Branch Operations" },
    ]);
    // The plan excludes nothing: no entry of any group is excluded.
    const entries = [
      ...(run.skills?.stages ?? []),
      ...(run.skills?.everyStage ?? []),
    ].flatMap((group) => group.skills);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((entry) => entry.excluded)).toEqual([]);
  });

  it("marks excluded skills in a started run's snapshot and keeps it", () => {
    excludeOnPlan(["9"]);
    const run = startRun();
    const entries = entriesOf(run.skills, "9");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(({ excluded }) => excluded)).toBe(true);
    const others = entriesOf(run.skills, "14");
    expect(others.length).toBeGreaterThan(0);
    expect(others.some(({ excluded }) => excluded)).toBe(false);
    // Java runtime modernization reaches plan 5 through the archetype and
    // the target profile, no longer through a general agent.
    expect(
      entries.flatMap(({ from }) => from.map((origin) => origin.kind))
    ).toEqual(["archetype", "targetProfile"]);

    // The run keeps its snapshot when the Plan's exclusions change later.
    excludeOnPlan([]);
    expect(getPlanRun(run.id).skills).toEqual(run.skills);
    expect(entriesOf(getPlanRun(run.id).skills, "9")[0].excluded).toBe(true);
  });

  it("marks only the excluded skills in the application view, in every group", () => {
    const before = view().skills!;
    excludeOnPlan(["9", "3"]);
    const after = view().skills!;
    const isExcluded = (skillId: string) => ["9", "3"].includes(skillId);
    const mark = (groups: { skills: SkillsByStage["stages"][0]["skills"] }[]) =>
      groups.map((group) =>
        group.skills.map((entry) => ({
          ...entry,
          excluded: isExcluded(entry.skill.id),
        }))
      );
    expect(after.stages.map((group) => group.skills)).toEqual(
      mark(before.stages)
    );
    expect(after.everyStage.map((group) => group.skills)).toEqual(
      mark(before.everyStage)
    );
    expect(entriesOf(after, "3").flatMap(({ from }) => from)).toContainEqual({
      kind: "collection",
      agent: { id: "9", name: "Java Code Migrator" },
      collection: {
        id: "1",
        name: "Java modernization foundation",
      },
    });
  });

  it("never excludes a skill attached to the application itself", () => {
    // Spring Boot 3 upgrade reaches the application through its archetype
    // and directly; the plan excludes it.
    const skill = db.skills.find((s) => s.id === "16")!;
    skill.associations.push(
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
      { scope: "application", resource: { id: 13, name: "Branch Operations" } }
    );
    excludeOnPlan(["16"]);
    const entry = view().skills?.everyStage[0].skills.find(
      (e) => e.skill.id === "16"
    );
    expect(entry?.excluded).toBe(false);
    expect(entry?.from.map((origin) => origin.kind)).toEqual([
      "archetype",
      "application",
    ]);
    expect(entry?.from).toContainEqual({
      kind: "application",
      application: { id: 13, name: "Branch Operations" },
    });

    // Attached through the archetype only, the exclusion applies.
    skill.associations = skill.associations.filter(
      (association) => association.scope !== "application"
    );
    expect(
      entriesOf(view().skills, "16").map(({ excluded, from }) => [
        excluded,
        from.map((origin) => origin.kind),
      ])
    ).toEqual([[true, ["archetype"]]]);
    const run = startRun();
    const runEntries = entriesOf(run.skills, "16");
    expect(runEntries.length).toBeGreaterThan(0);
    expect(runEntries.every(({ excluded }) => excluded)).toBe(true);
    // Only the excluded skill is marked, in every group.
    const excludedIds = [
      ...(run.skills?.stages ?? []),
      ...(run.skills?.everyStage ?? []),
    ]
      .flatMap((group) => group.skills)
      .filter((entry) => entry.excluded)
      .map((entry) => entry.skill.id);
    expect([...new Set(excludedIds)]).toEqual(["16"]);
  });
});

describe("run choices: target profile picks and run exclusions", () => {
  /** Java EE Application (archetype 1) gets a second target profile. */
  const SECOND = { id: 19, name: "OpenJDK 21 on OpenShift" };
  const JAVA_EE = mockArchetypes[1];
  let profiles: typeof JAVA_EE.profiles;
  beforeEach(() => {
    profiles = JAVA_EE.profiles;
    JAVA_EE.profiles = [...(profiles ?? []), { ...SECOND, generators: [] }];
    db.skills.push({
      id: "t-second",
      name: "Second profile skill",
      description: "",
      sourceType: "inline",
      associations: [{ scope: "targetProfile", resource: SECOND }],
    });
  });
  afterEach(() => {
    JAVA_EE.profiles = profiles;
  });

  /** A plan assigned to the second profile. */
  const assignSecondPlan = () =>
    createPlan({
      name: "Java EE to OpenJDK 21",
      description: "",
      migrationPath: {
        archetype: { id: 1 },
        targetProfiles: [{ id: SECOND.id }],
        isDefault: true,
      },
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });

  const start = (overrides: Record<string, unknown>) =>
    startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
      ...overrides,
    });
  const statusOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as { status?: number }).status;
    }
    return undefined;
  };
  const profileSkillIds = (runId: string) =>
    getPlanRun(runId)
      .skills!.everyStage[0].skills.filter((entry) =>
        entry.from.some((origin) => origin.kind === "targetProfile")
      )
      .map((entry) => entry.skill.id);

  it("lists every target profile of the application's archetypes with its assigned plan", () => {
    const own = getApplicationMigrations([1])[1];
    expect(own.migrationPaths).toEqual([
      {
        archetype: { id: 1, name: JAVA_EE.name },
        targetProfile: { id: 11, name: "Quarkus 3.x" },
        plan: own.plan,
      },
      {
        archetype: { id: 1, name: JAVA_EE.name },
        targetProfile: SECOND,
      },
    ]);
    const plan = assignSecondPlan();
    expect(getApplicationMigrations([1])[1].migrationPaths?.[1].plan).toEqual({
      id: plan.id,
      name: plan.name,
    });
    // The default stays the archetype's first profile.
    expect(getApplicationMigrations([1])[1].targetProfile?.id).toBe(11);
  });

  it("runs the plan assigned to the picked profile, resolved with that profile", () => {
    const plan = assignSecondPlan();
    const {
      planRuns: [ref],
    } = start({
      targetProfiles: [
        { application: { id: 1 }, targetProfile: { id: SECOND.id } },
      ],
    });
    expect(getPlanRun(ref.id).planId).toBe(plan.id);
    expect(profileSkillIds(ref.id)).toEqual(["t-second"]);
  });

  it("resolves no target profile skills for a null pick with one plan for all", () => {
    const {
      planRuns: [ref],
    } = start({
      planSelection: "single",
      planId: "3",
      targetProfiles: [{ application: { id: 1 }, targetProfile: null }],
    });
    expect(profileSkillIds(ref.id)).toEqual([]);
    // Without a pick, the default profile as before.
    const {
      planRuns: [again],
    } = start({ applicationIds: [2], planSelection: "single", planId: "3" });
    expect(profileSkillIds(again.id)).toContain("4");
  });

  it("refuses picks the application cannot run on", () => {
    const pick = (targetProfile: unknown, application = { id: 1 }) => ({
      targetProfiles: [{ application, targetProfile }],
    });
    // No plan is assigned to the second profile yet.
    expect(statusOf(() => start(pick({ id: SECOND.id })))).toBe(409);
    // Quarkus 3.x of Spring Boot Application: not one of its archetypes.
    expect(statusOf(() => start(pick({ id: 21 })))).toBe(400);
    expect(statusOf(() => start(pick(null)))).toBe(400);
    expect(statusOf(() => start(pick({ id: 11 }, { id: 2 })))).toBe(400);
    expect(
      statusOf(() =>
        start({
          targetProfiles: [
            { application: { id: 1 }, targetProfile: { id: 11 } },
            { application: { id: 1 }, targetProfile: { id: 11 } },
          ],
        })
      )
    ).toBe(400);
    expect(
      statusOf(() => start({ targetProfiles: [{ application: { id: 1 } }] }))
    ).toBe(400);
    expect(listPlanRuns()).toHaveLength(7);
  });

  it("excludes a run's skills for every origin and records the ones its snapshot lists", () => {
    db.skills
      .find((skill) => skill.id === "6")!
      .associations.push({
        scope: "application",
        resource: { id: 1, name: "Customer Management" },
      });
    const planId = getApplicationMigrations([1])[1].plan!.id;
    // An exclusion for a plan the request does not run.
    expect(
      statusOf(() =>
        start({ excludedSkills: [{ plan: { id: "6" }, skills: [] }] })
      )
    ).toBe(400);
    const {
      planRuns: [ref],
    } = start({
      excludedSkills: [
        // An application's own skill, a profile skill, an unknown id and a
        // skill the run does not resolve.
        { plan: { id: planId }, skills: [{ id: "6" }, { id: "4" }] },
        { plan: { id: planId }, skills: [{ id: "missing" }, { id: "16" }] },
      ],
    });
    const run = getPlanRun(ref.id);
    expect(run.excludedSkills).toEqual(
      [
        { id: "6", name: db.skills.find((skill) => skill.id === "6")!.name },
        { id: "4", name: "Quarkus best practices" },
      ].sort((a, b) => a.name.localeCompare(b.name))
    );
    expect(entriesOf(run.skills, "6").every((entry) => entry.excluded)).toBe(
      true
    );
    expect(entriesOf(run.skills, "4").every((entry) => entry.excluded)).toBe(
      true
    );
    // A run without exclusions reports none, as before.
    const {
      planRuns: [plain],
    } = start({ applicationIds: [2] });
    expect(getPlanRun(plain.id)).not.toHaveProperty("excludedSkills");
  });
});
