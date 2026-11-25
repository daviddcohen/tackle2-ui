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
  resolveRunSkills,
  runPhases,
  seedPicksFor,
  startApplicationMigrations,
} from "./execution";
import { mockMigrationPlans } from "./fixtures";
import { defaultPathOf, pathsUsingPlan } from "./skill-resolution";

const portfolioApplication = (id: number) =>
  portfolioApplications().find((application) => application.id === id)!;

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
    "gives every application of a seeded run (%s) exactly one target profile that uses that run's plan",
    (scenario) => {
      setScenario(scenario);
      listPlanRuns().forEach((run) => {
        expect(
          run.applications.map(
            (ref) =>
              pathsUsingPlan(portfolioApplication(ref.id), run.planId).length
          )
        ).toEqual(run.applications.map(() => 1));
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
            run.applications.map((a) => a.id),
            { targetProfileIds: seedPicksFor(plan.id, run.applications) }
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

  it.each(["configured", "running"])(
    "snapshots Run #4 (Java lift and shift on Partner Portal) with OpenJDK 21 on OpenShift, not Quarkus 3.x (%s)",
    (scenario) => {
      setScenario(scenario);
      const run = getPlanRun("4");
      expect(run.name).toBe("Run #4: Java lift and shift");
      const profileOrigins = run.skills!.everyStage[0].skills.flatMap(
        ({ skill, from }) =>
          from.flatMap((origin) =>
            origin.kind === "targetProfile"
              ? [[skill.name, origin.targetProfile.id]]
              : []
          )
      );
      expect(profileOrigins).toEqual([
        ["OpenShift deployment conventions", 12],
      ]);
    }
  );

  it.each(["configured", "running", "failed"])(
    "records the target profile each application of a seeded run ran on, the one its snapshot resolves with (%s)",
    (scenario) => {
      setScenario(scenario);
      listPlanRuns().forEach((run) => {
        const picks = seedPicksFor(run.planId, run.applications);
        expect(run.targetProfiles?.map((entry) => entry.application)).toEqual(
          run.applications
        );
        run.targetProfiles?.forEach((entry, index) => {
          expect(entry.targetProfile?.id ?? null).toBe(
            picks.get(entry.application.id)
          );
          // Every Every stage target profile skill comes from that profile.
          run.skills!.everyStage[index].skills.forEach(({ from }) =>
            from.forEach((origin) => {
              if (origin.kind === "targetProfile") {
                expect(origin.targetProfile.id).toBe(entry.targetProfile?.id);
              }
            })
          );
        });
      });
    }
  );

  it("records Run #4 (Java lift and shift on Partner Portal) on OpenJDK 21 on OpenShift", () => {
    expect(getPlanRun("4").targetProfiles).toEqual([
      {
        application: { id: 7, name: "Partner Portal" },
        targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
        archetype: { id: 1, name: "Java EE Application" },
      },
    ]);
  });

  it("records the picked target profile on a started run, none for a null pick or a plan no target profile of the application uses", () => {
    const {
      planRuns: [picked],
    } = startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
      targetProfiles: [{ application: { id: 1 }, targetProfile: { id: 12 } }],
    });
    expect(getPlanRun(picked.id).targetProfiles).toEqual([
      {
        application: { id: 1, name: "Customer Management" },
        targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
        archetype: { id: 1, name: "Java EE Application" },
      },
    ]);
    // One plan for all: Java EE to Quarkus on a .NET application uses no
    // target profile; an explicit null pick is recorded as none too.
    const {
      planRuns: [single],
    } = startApplicationMigrations({
      applicationIds: [2, 15],
      planSelection: "single",
      planId: "1",
      targetBranch: "main",
      targetProfiles: [{ application: { id: 2 }, targetProfile: null }],
    });
    expect(
      getPlanRun(single.id).targetProfiles?.map((entry) => [
        entry.application.id,
        entry.targetProfile,
        entry.archetype,
      ])
    ).toEqual([
      [2, null, undefined],
      [15, null, undefined],
    ]);
  });

  it("asks for a target profile when a Java EE application starts on its own plan, then runs the picked path", () => {
    expect(() =>
      startApplicationMigrations({
        applicationIds: [1],
        planSelection: "recommended",
        targetBranch: "main",
      })
    ).toThrow(
      "Customer Management has several target profiles with a migration plan (Quarkus 3.x, OpenJDK 21 on OpenShift). Pick the target profile it runs on."
    );
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1],
      planSelection: "recommended",
      targetBranch: "main",
      targetProfiles: [{ application: { id: 1 }, targetProfile: { id: 12 } }],
    });
    expect(getPlanRun(ref.id).planName).toBe("Java lift and shift");
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
      planSelection: "single",
      planId: "1",
      targetBranch: "main",
    });
    expect(listPlanRuns()).toHaveLength(8);
    setScenario("completed");
    expect(listPlanRuns()).toHaveLength(7);
  });
});

// Started with "Use one migration plan for all" (Java EE to Quarkus): Java
// EE applications have two paths with a plan, so a recommended start would
// need a pick.
describe("timed progression of started runs", () => {
  it("goes Pending -> Running through every stage -> Succeeded (unattended)", () => {
    db.executionPolicy = { interactionMode: "unattended" };
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1],
      planSelection: "single",
      planId: "1",
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
      planSelection: "single",
      planId: "1",
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
      planSelection: "single",
      planId: "1",
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
      planSelection: "single",
      planId: "1",
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
      planSelection: "single",
      planId: "1",
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

  it("resolves through the target profile to the Plan it uses", () => {
    // Applications 4 (Spring Boot) and 15 (.NET) are in different archetypes.
    expect(recommendedPlan(4)?.id).toBe(db.targetProfilePlans[21]);
    expect(recommendedPlan(15)?.id).toBe(db.targetProfilePlans[41]);
    // Applications of one archetype share its target profiles, so its plan.
    expect(recommendedPlan(5)).toEqual(recommendedPlan(4));
    // Java EE and Legacy Java applications have two paths with a plan (Java
    // lift and shift on the second): no default.
    expect(recommendedPlan(1)).toBeUndefined();
    expect(recommendedPlan(13)).toBeUndefined();
  });

  it("takes target profile, archetype and plan from the default path only, whatever the latest run used", () => {
    portfolioApplications().forEach((application) => {
      const view = getApplicationMigrations([application.id])[application.id];
      const defaultPath = defaultPathOf(application);
      if (defaultPath == null) {
        expect(view.targetProfile).toBeUndefined();
        expect(view.archetype).toBeUndefined();
        expect(view.plan).toBeUndefined();
        return;
      }
      const archetype = mockArchetypes[defaultPath.archetypeId];
      expect(view.targetProfile).toEqual({
        id: defaultPath.profile.id,
        name: defaultPath.profile.name,
      });
      expect(view.archetype).toEqual({
        id: archetype.id,
        name: archetype.name,
      });
      expect(view.plan?.id).toBe(defaultPath.plan?.id);
    });
  });

  it("is configured with at least one path that has a plan, the default only with one (0, 1, 2 runnable paths)", () => {
    // Customer Management (Java EE): Quarkus 3.x uses Java EE to Quarkus,
    // OpenJDK 21 on OpenShift Java lift and shift.
    const view = () => getApplicationMigrations([1])[1];
    expect(view()).toMatchObject({ configured: true, preflight: "ready" });
    expect(view().plan).toBeUndefined();
    expect(view().targetProfile).toBeUndefined();
    expect(
      view().migrationPaths?.map(({ targetProfile, plan }) => [
        targetProfile.id,
        plan?.id,
      ])
    ).toEqual([
      [11, "1"],
      [12, "3"],
    ]);
    // One path with a plan: the default, wherever it sits.
    delete db.targetProfilePlans[11];
    expect(view()).toMatchObject({
      configured: true,
      targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
      archetype: { id: 1, name: "Java EE Application" },
      plan: { id: "3", name: "Java lift and shift" },
    });
    // No path with a plan: not configured, and the reason names no profile.
    delete db.targetProfilePlans[12];
    expect(view()).toMatchObject({
      configured: false,
      preflightReason:
        "No target profile of this application's archetypes has a migration plan.",
    });
    expect(view().plan).toBeUndefined();
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
    // Two of its paths have a plan: no default, whatever its latest run.
    expect(view.plan).toBeUndefined();
  });

  it("counts applications by any path's plan (plan impact)", () => {
    const portfolio = portfolioApplications();
    db.plans.forEach((plan) => {
      expect(planImpact(plan.id)).toBe(
        portfolio.filter(
          (application) => pathsUsingPlan(application, plan.id).length > 0
        ).length
      );
    });
    const ofArchetype = (archetypeId: number) =>
      portfolio.filter((application) =>
        application.archetypes?.some(
          (archetype) => archetype.id === archetypeId
        )
      ).length;
    // Java lift and shift: every Java EE and Legacy Java application, though
    // none has it as its default.
    expect(planImpact("3")).toBe(ofArchetype(1) + ofArchetype(3));
    expect(planImpact("1")).toBe(ofArchetype(1));
    // .NET Framework to .NET 8 on Quarkus 3.x: the Java EE applications move
    // from Java EE to Quarkus to it.
    const before = planImpact("6");
    assignPlanToTargetProfile(1, 11, { planId: "6" });
    expect(planImpact("6")).toBe(before + ofArchetype(1));
    expect(planImpact("1")).toBe(0);
  });

  it("starts each application on its own plan with recommended plans", () => {
    const { planRuns } = startApplicationMigrations({
      applicationIds: [4, 15],
      planSelection: "recommended",
      targetBranch: "main",
    });
    expect(planRuns).toHaveLength(2);
    const runs = planRuns.map((ref) => getPlanRun(ref.id));
    expect(
      runs.map((run) => [run.planId, run.applications.map((a) => a.id)])
    ).toEqual([
      [defaultPathOf(portfolioApplication(4))!.plan!.id, [4]],
      [defaultPathOf(portfolioApplication(15))!.plan!.id, [15]],
    ]);
    runs.forEach((run) => {
      expect(run.name).toBe(`Run #${run.id}: ${run.planName}`);
    });
  });

  it("ignores a new Plan until a target profile uses it", () => {
    const before = recommendedPlan(4);
    createPlan({
      name: "Draft plan",
      description: "",
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });
    expect(recommendedPlan(4)).toEqual(before);
  });

  it("follows the target profile's plan when it changes, touching no other profile", () => {
    const before = recommendedPlan(4)!;
    const references = { ...db.targetProfilePlans };
    const draft = createPlan({
      name: "Draft plan",
      description: "",
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });
    assignPlanToTargetProfile(2, 21, { planId: draft.id });
    expect(recommendedPlan(4)?.id).toBe(draft.id);
    expect(db.targetProfilePlans).toEqual({ ...references, 21: draft.id });
    expect(getPlan(before.id).migrationPaths).toEqual([]);
    expect(getPlan(draft.id).migrationPaths).toEqual([
      {
        archetype: { id: 2, name: "Spring Boot Application" },
        targetProfile: { id: 21, name: "Quarkus 3.x" },
      },
    ]);
  });

  it("ignores a migration path a plan write still sends", () => {
    const references = { ...db.targetProfilePlans };
    const created = createPlan({
      name: "Old client plan",
      description: "",
      migrationPath: {
        archetype: { id: 1 },
        targetProfiles: [{ id: 11 }],
        isDefault: true,
      },
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });
    expect(created.migrationPaths).toEqual([]);
    expect(created).not.toHaveProperty("migrationPath");
    expect(db.plans.find((p) => p.id === created.id)).not.toHaveProperty(
      "migrationPath"
    );
    expect(db.targetProfilePlans).toEqual(references);
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
          .filter((application) =>
            views[application.id]?.migrationPaths?.some(
              (path) => path.plan?.id === stored.id
            )
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
  // Application 13 resolves to Plan 5 (Legacy Java runtime modernization):
  // its second path (Java 8 on OpenShift, Java lift and shift) is cleared,
  // so Java 17 on OpenShift is its default path.
  const APPLICATION_ID = 13;
  const PLAN_ID = "5";
  beforeEach(() => {
    delete db.targetProfilePlans[32];
  });

  const excludeOnPlan = (skillIds: string[]) => {
    const plan = db.plans.find((p) => p.id === PLAN_ID)!;
    updatePlan(PLAN_ID, {
      name: plan.name,
      description: plan.description,
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
  /**
   * Java EE Application (archetype 1) gets a third target profile. OpenJDK 21
   * on OpenShift (12) uses no plan here, so Quarkus 3.x is the default path
   * until a test gives the third profile a plan.
   */
  const SECOND = { id: 19, name: "Java 25 on OpenShift" };
  const JAVA_EE = mockArchetypes[1];
  let profiles: typeof JAVA_EE.profiles;
  beforeEach(() => {
    delete db.targetProfilePlans[12];
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

  /** A plan the second profile uses. */
  const assignSecondPlan = () => {
    const plan = createPlan({
      name: "Java EE to OpenJDK 21",
      description: "",
      stages: [{ name: "Only", agent: { id: db.agents[0].id } }],
    });
    assignPlanToTargetProfile(1, SECOND.id, { planId: plan.id });
    return plan;
  };

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
        targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
      },
      {
        archetype: { id: 1, name: JAVA_EE.name },
        targetProfile: SECOND,
      },
    ]);
    const plan = assignSecondPlan();
    const view = getApplicationMigrations([1])[1];
    expect(view.migrationPaths?.[2].plan).toEqual({
      id: plan.id,
      name: plan.name,
    });
    // Two paths have a plan: no default path, still configured.
    expect(view.configured).toBe(true);
    expect(view.targetProfile).toBeUndefined();
    expect(view.archetype).toBeUndefined();
    expect(view.plan).toBeUndefined();
  });

  it("refuses a recommended start without a pick when several paths have a plan", () => {
    assignSecondPlan();
    expect(statusOf(() => start({}))).toBe(409);
    expect(() => start({})).toThrow(
      /Customer Management has several target profiles with a migration plan .*Pick the target profile it runs on/
    );
    // A pick settles it.
    const {
      planRuns: [ref],
    } = start({
      targetProfiles: [{ application: { id: 1 }, targetProfile: { id: 11 } }],
    });
    expect(getPlanRun(ref.id).planId).toBe("1");
  });

  it("runs one plan for all on the only path that uses it, none without one, and needs a pick with several", () => {
    // Plan 1 without a pick: Quarkus 3.x, the only profile that uses it.
    const {
      planRuns: [onPath],
    } = start({ planSelection: "single", planId: "1" });
    expect(profileSkillIds(onPath.id)).toContain("4");
    // Plan 3 (no profile uses it): no target profile.
    const {
      planRuns: [none],
    } = start({ applicationIds: [2], planSelection: "single", planId: "3" });
    expect(profileSkillIds(none.id)).toEqual([]);
    // Both profiles use plan 1: a pick is needed. (A fresh world: the run
    // above keeps Customer Management busy.)
    resetExecutionWorld();
    assignPlanToTargetProfile(1, SECOND.id, { planId: "1" });
    expect(
      statusOf(() => start({ planSelection: "single", planId: "1" }))
    ).toBe(409);
    expect(() => start({ planSelection: "single", planId: "1" })).toThrow(
      /Customer Management has several target profiles that use Java EE to Quarkus/
    );
    const {
      planRuns: [picked],
    } = start({
      planSelection: "single",
      planId: "1",
      targetProfiles: [
        { application: { id: 1 }, targetProfile: { id: SECOND.id } },
      ],
    });
    expect(profileSkillIds(picked.id)).toEqual(["t-second"]);
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
