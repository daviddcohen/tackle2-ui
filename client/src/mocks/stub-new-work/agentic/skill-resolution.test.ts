import { Application } from "@app/api/models";
import { mockApplicationArray } from "@mocks/stub-new-work/applications";
import { mockArchetypes } from "@mocks/stub-new-work/archetypes";

import { StoredSkill, db, resetAgenticDb } from "./db";
import {
  defaultPathOf,
  migrationPathsOf,
  pathsUsingPlan,
  placementsOf,
  resolveSkillsByStage,
  targetProfilePickOf,
  targetProfilesOf,
} from "./skill-resolution";

/**
 * Test entities on top of the fixtures, so the rules are checked on data
 * whose every attachment the test knows. Archetype 1 (Java EE Application,
 * target profiles 11 Quarkus 3.x and 12 OpenJDK 21 on OpenShift) and
 * applications 1 (Customer Management) and 3 (Claims Processing) are fixture
 * Hub entities. OpenJDK 21 on OpenShift uses no plan here (see `beforeEach`),
 * so Quarkus 3.x is the default path of Java EE applications.
 */
const skill = (
  id: string,
  associations: StoredSkill["associations"] = [],
  loadPolicy?: StoredSkill["loadPolicy"]
): StoredSkill => ({
  id,
  name: `Skill ${id}`,
  description: "",
  sourceType: "inline",
  associations,
  ...(loadPolicy ? { loadPolicy } : {}),
});

const ARCHETYPE = { id: 1, name: "Java EE Application" };
const PROFILE = { id: 11, name: "Quarkus 3.x" };
const OPENJDK = 12;
const CLAIMS = { id: 3, name: "Claims Processing" };
const CUSTOMERS = { id: 1, name: "Customer Management" };

const AGENT = { id: "t-agent", name: "Test agent" };
const EMPTY_AGENT = { id: "t-empty", name: "Empty agent" };
const COLLECTION = { id: "t-collection", name: "Test collection" };

const TEST_IDS = [
  "t-own",
  "t-collected",
  "t-both",
  "t-archetype",
  "t-profile",
  "t-application",
  "t-archetype-and-application",
  "t-other-profile",
];

const isTestSkill = ({ skill: ref }: { skill: { id: string } }) =>
  TEST_IDS.includes(ref.id);

const ids = (entries: { skill: { id: string } }[]) =>
  entries.filter(isTestSkill).map(({ skill: ref }) => ref.id);

beforeEach(() => {
  resetAgenticDb();
  // The fixtures give Java EE applications a second path with a plan (Java
  // lift and shift), so no default path; these tests need one.
  delete db.targetProfilePlans[OPENJDK];
  db.skills.push(
    skill("t-own", [], "rule"),
    skill("t-collected"),
    skill("t-both"),
    skill("t-archetype", [{ scope: "archetype", resource: ARCHETYPE }]),
    skill("t-profile", [{ scope: "targetProfile", resource: PROFILE }]),
    skill("t-application", [{ scope: "application", resource: CLAIMS }]),
    skill("t-archetype-and-application", [
      { scope: "application", resource: CLAIMS },
      { scope: "archetype", resource: ARCHETYPE },
    ]),
    skill("t-other-profile", [
      { scope: "targetProfile", resource: { id: 21, name: "Quarkus 3.x" } },
    ])
  );
  db.skillCollections.push({
    ...COLLECTION,
    description: "",
    skills: [
      { id: "t-collected", name: "" },
      { id: "t-both", name: "" },
      { id: "missing-skill", name: "" },
    ],
  });
  db.agents.push(
    {
      ...AGENT,
      description: "",
      model: { id: "1", name: "" },
      skills: [
        { id: "t-own", name: "" },
        { id: "t-both", name: "" },
        { id: "missing-skill", name: "" },
      ],
      // Listed twice and once unknown: each origin still shows once.
      skillCollections: [
        { id: COLLECTION.id, name: "" },
        { id: COLLECTION.id, name: "" },
        { id: "missing-collection", name: "" },
      ],
      prompt: "",
      capabilities: [],
      parameters: [],
    },
    {
      ...EMPTY_AGENT,
      description: "",
      model: { id: "1", name: "" },
      skills: [],
      prompt: "",
      capabilities: [],
      parameters: [],
    }
  );
});

const stages = [
  { agentId: AGENT.id, name: "Plan" },
  { agentId: EMPTY_AGENT.id, name: "Check" },
];

describe("per stage", () => {
  it("gives each stage its agent's skills and its collections' skills, and nothing pooled", () => {
    const resolution = resolveSkillsByStage({
      stages,
      context: { kind: "plan", targetProfileIds: [] },
    });
    expect(
      resolution.stages.map(({ order, name, agent }) => [order, name, agent])
    ).toEqual([
      [1, "Plan", AGENT],
      [2, "Check", EMPTY_AGENT],
    ]);
    expect(ids(resolution.stages[0].skills)).toEqual([
      "t-own",
      "t-both",
      "t-collected",
    ]);
    // The second stage's agent has nothing: it gets nothing from the first.
    expect(resolution.stages[1].skills).toEqual([]);
    // Context skills never sit in a stage group.
    expect(ids(resolution.stages[0].skills)).not.toContain("t-archetype");
  });

  it("deduplicates origins and orders them agent, then collection", () => {
    const [group] = resolveSkillsByStage({
      stages: stages.slice(0, 1),
      context: { kind: "plan", targetProfileIds: [] },
    }).stages;
    expect(group.skills.find((e) => e.skill.id === "t-both")).toEqual({
      skill: { id: "t-both", name: "Skill t-both" },
      loadPolicy: "skill",
      from: [
        { kind: "agent", agent: AGENT },
        { kind: "collection", agent: AGENT, collection: COLLECTION },
      ],
      excluded: false,
    });
    expect(
      group.skills.find((e) => e.skill.id === "t-collected")?.from
    ).toEqual([{ kind: "collection", agent: AGENT, collection: COLLECTION }]);
  });

  it("reports each skill's load policy, defaulting to skill", () => {
    const [group] = resolveSkillsByStage({
      stages: stages.slice(0, 1),
      context: { kind: "plan", targetProfileIds: [] },
    }).stages;
    expect(
      group.skills
        .filter(isTestSkill)
        .map((entry) => [entry.skill.id, entry.loadPolicy])
    ).toEqual([
      ["t-own", "rule"],
      ["t-both", "skill"],
      ["t-collected", "skill"],
    ]);
  });

  it("sets the stage id when given (run snapshots)", () => {
    const [group] = resolveSkillsByStage({
      stages: [{ ...stages[0], stageId: "42" }],
      context: { kind: "plan", targetProfileIds: [] },
    }).stages;
    expect(group.stageId).toBe("42");
  });
});

describe("every stage", () => {
  it("in a plan preview, comes from the target profiles and their archetypes, without an application", () => {
    const { everyStage } = resolveSkillsByStage({
      stages,
      context: {
        kind: "plan",
        targetProfileIds: [PROFILE.id],
      },
    });
    expect(everyStage).toHaveLength(1);
    expect(everyStage[0]).not.toHaveProperty("application");
    expect(ids(everyStage[0].skills)).toEqual([
      "t-archetype",
      "t-archetype-and-application",
      "t-profile",
    ]);
    expect(
      everyStage[0].skills.find((e) => e.skill.id === "t-profile")?.from
    ).toEqual([
      { kind: "targetProfile", targetProfile: PROFILE, archetype: ARCHETYPE },
    ]);
  });

  it("in a plan preview, adds the archetype of several target profiles once", () => {
    const { everyStage } = resolveSkillsByStage({
      stages: [],
      context: { kind: "plan", targetProfileIds: [PROFILE.id, 21, PROFILE.id] },
    });
    const skills = everyStage[0].skills;
    expect(skills.find((e) => e.skill.id === "t-archetype")?.from).toEqual([
      { kind: "archetype", archetype: ARCHETYPE },
    ]);
    // Spring Boot Application (the archetype of profile 21) adds its own.
    expect(
      skills.some((e) =>
        e.from.some(
          (origin) => origin.kind === "archetype" && origin.archetype.id === 2
        )
      )
    ).toBe(true);
  });

  it("for an application, comes from its archetype, its default path's target profile and itself", () => {
    const { everyStage } = resolveSkillsByStage({
      stages,
      context: { kind: "applications", applicationIds: [CLAIMS.id] },
    });
    expect(everyStage).toHaveLength(1);
    expect(everyStage[0].application).toEqual(CLAIMS);
    expect(ids(everyStage[0].skills)).toEqual([
      "t-archetype",
      "t-archetype-and-application",
      "t-profile",
      "t-application",
    ]);
    expect(
      everyStage[0].skills.find(
        (e) => e.skill.id === "t-archetype-and-application"
      )?.from
    ).toEqual([
      { kind: "archetype", archetype: ARCHETYPE },
      { kind: "application", application: CLAIMS },
    ]);
  });

  it("counts only the default path's target profile", () => {
    const archetype = mockArchetypes[ARCHETYPE.id];
    const profiles = archetype.profiles;
    archetype.profiles = [
      ...(profiles ?? []),
      { id: 19, name: "Second profile", generators: [] },
    ];
    try {
      db.skills
        .find((s) => s.id === "t-other-profile")!
        .associations.push({
          scope: "targetProfile",
          resource: { id: 19, name: "Second profile" },
        });
      const application = mockApplicationArray.find((a) => a.id === CLAIMS.id)!;
      // Profile 19 uses no plan, so Quarkus 3.x is the default path.
      expect(defaultPathOf(application)?.profile.id).toBe(PROFILE.id);
      const forApplication = resolveSkillsByStage({
        stages: [],
        context: { kind: "applications", applicationIds: [CLAIMS.id] },
      });
      expect(ids(forApplication.everyStage[0].skills)).not.toContain(
        "t-other-profile"
      );
      // A plan preview counts every profile of the plan's path.
      const preview = resolveSkillsByStage({
        stages: [],
        context: {
          kind: "plan",
          targetProfileIds: [PROFILE.id, 19],
        },
      });
      expect(ids(preview.everyStage[0].skills)).toContain("t-other-profile");
    } finally {
      archetype.profiles = profiles;
    }
  });

  it("merges every archetype of an application in several", () => {
    const application: Application = {
      id: 990,
      name: "Two archetypes",
      migrationWave: null,
      archetypes: [{ id: 3, name: "Legacy Java Application" }, ARCHETYPE],
    };
    db.skills.push(
      skill("t-legacy", [
        {
          scope: "archetype",
          resource: { id: 3, name: "Legacy Java Application" },
        },
      ])
    );
    mockApplicationArray.push(application);
    try {
      const { everyStage } = resolveSkillsByStage({
        stages: [],
        context: { kind: "applications", applicationIds: [990] },
      });
      const found = everyStage[0].skills.map(({ skill: ref }) => ref.id);
      expect(found).toContain("t-legacy");
      expect(found).toContain("t-archetype");
      // Two of its paths have a plan (31 and 11): no default path, so no
      // target profile skills without a pick.
      expect(defaultPathOf(application)).toBeUndefined();
      expect(found).not.toContain("t-profile");
    } finally {
      mockApplicationArray.splice(mockApplicationArray.indexOf(application), 1);
    }
  });
});

describe("exclusions", () => {
  const excludedSkillIds = new Set([
    "t-own",
    "t-archetype",
    "t-application",
    "t-archetype-and-application",
  ]);

  it("mark excluded skills and keep them listed", () => {
    const resolution = resolveSkillsByStage({
      stages,
      context: {
        kind: "plan",
        targetProfileIds: [PROFILE.id],
      },
      excludedSkillIds,
    });
    const own = resolution.stages[0].skills.find((e) => e.skill.id === "t-own");
    expect(own?.excluded).toBe(true);
    const preview = resolution.everyStage[0].skills;
    expect(preview.find((e) => e.skill.id === "t-archetype")?.excluded).toBe(
      true
    );
    // Without the application in the context, nothing keeps it.
    expect(
      preview.find((e) => e.skill.id === "t-archetype-and-application")
        ?.excluded
    ).toBe(true);
    expect(preview.find((e) => e.skill.id === "t-profile")?.excluded).toBe(
      false
    );
  });

  it("never apply to a skill attached to the application itself", () => {
    const [group] = resolveSkillsByStage({
      stages,
      context: { kind: "applications", applicationIds: [CLAIMS.id] },
      excludedSkillIds,
    }).everyStage;
    const excluded = (id: string) =>
      group.skills.find((e) => e.skill.id === id)?.excluded;
    expect(excluded("t-application")).toBe(false);
    expect(excluded("t-archetype-and-application")).toBe(false);
    expect(excluded("t-archetype")).toBe(true);
  });

  it("from a run apply to every origin, the application's own included, on top of the plan's", () => {
    const resolution = resolveSkillsByStage({
      stages,
      context: { kind: "applications", applicationIds: [CLAIMS.id] },
      excludedSkillIds: new Set(["t-archetype"]),
      runExcludedSkillIds: new Set(["t-application", "t-own", "t-profile"]),
    });
    const excludedIds = [
      ...resolution.stages.flatMap((group) => group.skills),
      ...resolution.everyStage.flatMap((group) => group.skills),
    ]
      .filter((entry) => isTestSkill(entry) && entry.excluded)
      .map(({ skill: ref }) => ref.id);
    expect(new Set(excludedIds)).toEqual(
      new Set(["t-own", "t-archetype", "t-profile", "t-application"])
    );
    // The plan's exclusion still spares the application's own attachment.
    expect(
      resolution.everyStage[0].skills.find(
        (e) => e.skill.id === "t-archetype-and-application"
      )?.excluded
    ).toBe(false);
  });
});

describe("an application's default path", () => {
  const SECOND = { id: 19, name: "Second profile" };
  const archetype = mockArchetypes[ARCHETYPE.id];
  let profiles: typeof archetype.profiles;
  beforeEach(() => {
    profiles = archetype.profiles;
    archetype.profiles = [...(profiles ?? []), { ...SECOND, generators: [] }];
  });
  afterEach(() => {
    archetype.profiles = profiles;
  });
  const claims = () => mockApplicationArray.find((a) => a.id === CLAIMS.id)!;

  it("is the only path whose target profile uses a plan, whatever its position", () => {
    // Quarkus 3.x uses plan 1; the second profile none.
    expect(
      migrationPathsOf(claims()).map(({ profile, plan }) => [
        profile.id,
        plan?.id,
      ])
    ).toEqual([
      [PROFILE.id, "1"],
      [OPENJDK, undefined],
      [SECOND.id, undefined],
    ]);
    expect(defaultPathOf(claims())?.profile.id).toBe(PROFILE.id);
    // Only the second profile uses a plan: it is the default, though last.
    delete db.targetProfilePlans[PROFILE.id];
    db.targetProfilePlans[SECOND.id] = "3";
    expect(defaultPathOf(claims())?.profile.id).toBe(SECOND.id);
  });

  it("is absent with no path that uses a plan, or with several", () => {
    delete db.targetProfilePlans[PROFILE.id];
    expect(defaultPathOf(claims())).toBeUndefined();
    db.targetProfilePlans[PROFILE.id] = "1";
    db.targetProfilePlans[SECOND.id] = "3";
    expect(defaultPathOf(claims())).toBeUndefined();
    // Then the application view resolves no target profile skills.
    expect(
      resolveSkillsByStage({
        stages: [],
        context: { kind: "applications", applicationIds: [CLAIMS.id] },
      })
        .everyStage[0].skills.flatMap(({ from }) => from)
        .filter((origin) => origin.kind === "targetProfile")
    ).toEqual([]);
  });

  it("lists the paths whose profile uses a given plan", () => {
    db.targetProfilePlans[SECOND.id] = "1";
    expect(
      pathsUsingPlan(claims(), "1").map(({ profile }) => profile.id)
    ).toEqual([PROFILE.id, SECOND.id]);
    expect(pathsUsingPlan(claims(), "3")).toEqual([]);
  });
});

describe("a run's target profile pick", () => {
  const SECOND = { id: 19, name: "Second profile" };
  const withSecondProfile = (check: () => void) => {
    const archetype = mockArchetypes[ARCHETYPE.id];
    const profiles = archetype.profiles;
    archetype.profiles = [...(profiles ?? []), { ...SECOND, generators: [] }];
    db.skills
      .find((s) => s.id === "t-other-profile")!
      .associations.push({ scope: "targetProfile", resource: SECOND });
    try {
      check();
    } finally {
      archetype.profiles = profiles;
    }
  };
  const everyStageIds = (targetProfileIds: Map<number, number | null>) =>
    ids(
      resolveSkillsByStage({
        stages: [],
        context: {
          kind: "applications",
          applicationIds: [CLAIMS.id, CUSTOMERS.id],
          targetProfileIds,
        },
      }).everyStage[0].skills
    );

  it("replaces the application's default profile, or removes it with null", () =>
    withSecondProfile(() => {
      expect(everyStageIds(new Map([[CLAIMS.id, SECOND.id]]))).toEqual([
        "t-archetype",
        "t-archetype-and-application",
        "t-other-profile",
        "t-application",
      ]);
      expect(everyStageIds(new Map([[CLAIMS.id, null]]))).toEqual([
        "t-archetype",
        "t-archetype-and-application",
        "t-application",
      ]);
      // Another application's pick changes nothing here: the default stays.
      expect(everyStageIds(new Map([[CUSTOMERS.id, SECOND.id]]))).toContain(
        "t-profile"
      );
    }));

  it("lists every profile of the application's archetypes as a choice", () =>
    withSecondProfile(() => {
      const application = mockApplicationArray.find((a) => a.id === CLAIMS.id)!;
      expect(
        targetProfilesOf(application).map(({ archetypeId, profile }) => [
          archetypeId,
          profile.id,
        ])
      ).toEqual([
        [ARCHETYPE.id, PROFILE.id],
        [ARCHETYPE.id, OPENJDK],
        [ARCHETYPE.id, SECOND.id],
      ]);
      expect(targetProfilePickOf({ id: SECOND.id }, application, "f")).toBe(
        SECOND.id
      );
      expect(targetProfilePickOf(null, application, "f")).toBeNull();
      expect(targetProfilePickOf(undefined, application, "f")).toBeUndefined();
      // Quarkus 3.x of Spring Boot Application: not one of its archetypes.
      expect(() => targetProfilePickOf({ id: 21 }, application, "f")).toThrow(
        /does not belong to an archetype of Claims Processing/
      );
    }));
});

describe("a skill both on the stage agent and in the context", () => {
  it("is in the stage group and the every-stage group; only the application keeps it from the exclusion", () => {
    db.skills.push(
      skill("t-agent-app", [{ scope: "application", resource: CLAIMS }]),
      skill("t-agent-archetype", [{ scope: "archetype", resource: ARCHETYPE }])
    );
    db.agents
      .find((agent) => agent.id === AGENT.id)!
      .skills.push(
        { id: "t-agent-app", name: "" },
        { id: "t-agent-archetype", name: "" }
      );
    const resolve = (excluded: string[]) =>
      resolveSkillsByStage({
        stages: stages.slice(0, 1),
        context: { kind: "applications", applicationIds: [CLAIMS.id] },
        excludedSkillIds: new Set(excluded),
      });
    const rows = (excluded: string[], id: string) => {
      const resolution = resolve(excluded);
      return {
        stage: resolution.stages[0].skills.find((e) => e.skill.id === id),
        every: resolution.everyStage[0].skills.find((e) => e.skill.id === id),
      };
    };

    // Each row carries its own origins: the agent in the stage group, the
    // context in the every-stage group.
    const app = rows([], "t-agent-app");
    expect(app.stage?.from).toEqual([{ kind: "agent", agent: AGENT }]);
    expect(app.every?.from).toEqual([
      { kind: "application", application: CLAIMS },
    ]);
    const archetype = rows([], "t-agent-archetype");
    expect(archetype.stage?.from).toEqual([{ kind: "agent", agent: AGENT }]);
    expect(archetype.every?.from).toEqual([
      { kind: "archetype", archetype: ARCHETYPE },
    ]);

    // Excluded: the stage row is excluded; the application row is not.
    const appExcluded = rows(["t-agent-app"], "t-agent-app");
    expect(appExcluded.stage?.excluded).toBe(true);
    expect(appExcluded.every?.excluded).toBe(false);
    // Attached to the archetype only: both rows are excluded.
    const archetypeExcluded = rows(["t-agent-archetype"], "t-agent-archetype");
    expect(archetypeExcluded.stage?.excluded).toBe(true);
    expect(archetypeExcluded.every?.excluded).toBe(true);
  });

  it("names a stage whose agent is gone after its stored agent", () => {
    const [group] = resolveSkillsByStage({
      stages: [{ agentId: "gone", agentName: "Removed agent", name: "Old" }],
      context: { kind: "plan", targetProfileIds: [] },
    }).stages;
    expect(group.agent).toEqual({ id: "gone", name: "Removed agent" });
  });
});

describe("several applications", () => {
  it("gives each application its own every-stage group, in request order, never another's", () => {
    const { everyStage } = resolveSkillsByStage({
      stages,
      context: {
        kind: "applications",
        applicationIds: [CLAIMS.id, CUSTOMERS.id, CLAIMS.id],
      },
    });
    expect(everyStage.map((group) => group.application)).toEqual([
      CLAIMS,
      CUSTOMERS,
    ]);
    expect(ids(everyStage[0].skills)).toContain("t-application");
    expect(ids(everyStage[1].skills)).not.toContain("t-application");
    // Both share the archetype's skills, each under its own application.
    expect(ids(everyStage[1].skills)).toContain("t-archetype");
  });
});

describe("unknown references", () => {
  it("add nothing", () => {
    const resolution = resolveSkillsByStage({
      stages: [{ agentId: "missing-agent", name: "Lost" }],
      context: {
        kind: "plan",
        targetProfileIds: [998],
      },
    });
    expect(resolution).toEqual({
      stages: [
        {
          order: 1,
          name: "Lost",
          agent: { id: "missing-agent", name: "missing-agent" },
          skills: [],
        },
      ],
      everyStage: [{ skills: [] }],
    });
    expect(
      resolveSkillsByStage({
        stages: [],
        context: { kind: "applications", applicationIds: [999] },
      })
    ).toEqual({ stages: [], everyStage: [] });
    // Unknown skills and collections on a known agent are skipped.
    const [group] = resolveSkillsByStage({
      stages: stages.slice(0, 1),
      context: { kind: "plan", targetProfileIds: [] },
    }).stages;
    expect(group.skills.map(({ skill: ref }) => ref.id)).not.toContain(
      "missing-skill"
    );
  });
});

describe("derived shapes", () => {
  const resolution = () =>
    resolveSkillsByStage({
      stages: [stages[0], { agentId: AGENT.id, name: "Again" }],
      context: { kind: "applications", applicationIds: [CLAIMS.id] },
      excludedSkillIds: new Set(["t-own", "t-archetype-and-application"]),
    });

  it("places a skill per stage and once for every stage", () => {
    expect(placementsOf(resolution(), "t-own")).toEqual([
      {
        stage: { order: 1, name: "Plan" },
        from: [{ kind: "agent", agent: AGENT }],
        excluded: true,
      },
      {
        stage: { order: 2, name: "Again" },
        from: [{ kind: "agent", agent: AGENT }],
        excluded: true,
      },
    ]);
    expect(placementsOf(resolution(), "t-archetype-and-application")).toEqual([
      {
        from: [
          { kind: "archetype", archetype: ARCHETYPE },
          { kind: "application", application: CLAIMS },
        ],
        excluded: false,
      },
    ]);
    expect(placementsOf(resolution(), "not-there")).toEqual([]);
  });
});
