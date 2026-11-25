/**
 * The agentic mock server must behave like a REST backend. These tests drive
 * it through the real REST client (`@app/api/rest/agentic`) over MSW, so they
 * also pin the client contract (typed data, 201/204, URL ids).
 */
import axios, { AxiosError, isAxiosError } from "axios";

import { MigrationPlan, MigrationPlanRequest } from "@app/agentic";
import {
  AGENTIC_ENDPOINTS,
  approveStageRun,
  assignPlanToTargetProfile,
  createAgent,
  createMigrationPlan,
  createSkill,
  createSkillCollection,
  deleteAgent,
  deleteMigrationPlan,
  deleteModel,
  deleteProvider,
  deleteSkill,
  deleteSkillCollection,
  getAgentById,
  getAgentTestRuns,
  getAgents,
  getApplicationMigrations,
  getMigrationPlanById,
  getMigrationPlans,
  getModels,
  getPlanRunById,
  getPlanRuns,
  getSkillById,
  getSkillCollectionById,
  getSkillPlans,
  getSkills,
  resolvePlanSkills,
  startAgentTestRun,
  startApplicationMigrations,
  updateAgent,
  updateMigrationPlan,
  updateModel,
  updateProvider,
  updateSkill,
} from "@app/api/rest/agentic";
import { server } from "@mocks/server";

import { db, resetAgenticDb } from "./db";
import { resetExecutionWorld } from "./execution";
import handlers from "./handlers";

const statusOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (isAxiosError(error)) return error.response?.status;
    throw error;
  }
};

const messageOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "";
  } catch (error) {
    const data = (error as AxiosError<{ message?: string }>).response?.data;
    return data?.message ?? "";
  }
};

const setScenario = (scenario: string, stage = 1) =>
  window.history.replaceState(
    {},
    "",
    `/?protoScenario=${scenario}&protoStage=${stage}`
  );

beforeEach(() => {
  server.use(...handlers);
  resetAgenticDb();
  resetExecutionWorld();
  setScenario("configured");
});

describe("REST semantics", () => {
  it("returns 404 for unknown ids on every detail route", async () => {
    expect(await statusOf(getSkillById("9999"))).toBe(404);
    expect(await statusOf(getAgentById("9999"))).toBe(404);
    expect(await statusOf(getSkillCollectionById("9999"))).toBe(404);
    expect(await statusOf(getMigrationPlanById("9999"))).toBe(404);
    expect(await statusOf(getPlanRunById("9999"))).toBe(404);
    expect(
      await statusOf(
        updateSkill({
          id: "9999",
          name: "Nope",
          description: "",
          sourceType: "inline",
        })
      )
    ).toBe(404);
    expect(await statusOf(deleteAgent("9999"))).toBe(404);
  });

  it("assigns ids on create (string ids) and answers 201 with the entity", async () => {
    const skill = await createSkill({
      name: "Brand new skill",
      description: "",
      sourceType: "inline",
      content: "# Hi",
    });
    expect(typeof skill.id).toBe("string");
    expect(skill.createTime).toBeDefined();
    expect((await getSkillById(skill.id)).name).toBe("Brand new skill");
  });

  it("accepts and validates a skill's load policy", async () => {
    const base = {
      description: "",
      sourceType: "inline" as const,
      content: "# Hi",
    };
    const rule = await createSkill({
      ...base,
      name: "House rule",
      loadPolicy: "rule",
    });
    expect((await getSkillById(rule.id)).loadPolicy).toBe("rule");
    // Absent on create: "skill", the CRD default.
    const plain = await createSkill({ ...base, name: "Plain skill" });
    expect((await getSkillById(plain.id)).loadPolicy).toBe("skill");
    // Absent on update keeps the stored policy; a value replaces it.
    await updateSkill({ ...base, id: rule.id, name: "House rule" });
    expect((await getSkillById(rule.id)).loadPolicy).toBe("rule");
    await updateSkill({
      ...base,
      id: rule.id,
      name: "House rule",
      loadPolicy: "skill",
    });
    expect((await getSkillById(rule.id)).loadPolicy).toBe("skill");
    const before = await getSkills();
    expect(
      await messageOf(
        axios.post(AGENTIC_ENDPOINTS.skills, {
          ...base,
          name: "Bad policy",
          loadPolicy: "always",
        })
      )
    ).toBe('loadPolicy must be "rule" or "skill".');
    expect(
      await statusOf(
        axios.put(`${AGENTIC_ENDPOINTS.skills}/${rule.id}`, {
          ...base,
          name: "House rule",
          loadPolicy: 1,
        })
      )
    ).toBe(400);
    expect(await getSkills()).toEqual(before);
  });

  it("uses the URL id, never a body id", async () => {
    const before = await getSkills();
    // A client bug sending another entity's id in the body must not matter.
    await axios.put(`${AGENTIC_ENDPOINTS.skills}/1`, {
      id: "2",
      name: "Renamed skill one",
      description: "",
      sourceType: "inline",
    });
    const after = await getSkills();
    expect(after).toHaveLength(before.length);
    expect(after.find((s) => s.id === "1")?.name).toBe("Renamed skill one");
    expect(after.find((s) => s.id === "2")?.name).toBe(
      before.find((s) => s.id === "2")?.name
    );
  });

  it("rejects invalid payloads with 400 and saves nothing", async () => {
    const skillsBefore = (await getSkills()).length;
    const agentsBefore = (await getAgents()).length;
    expect(
      await statusOf(createSkill({} as Parameters<typeof createSkill>[0]))
    ).toBe(400);
    expect(
      await statusOf(createAgent({} as Parameters<typeof createAgent>[0]))
    ).toBe(400);
    // Valid except for one unknown Skill reference: nothing is stored.
    expect(
      await statusOf(
        createAgent({
          name: "Half valid agent",
          description: "",
          model: { id: "1" },
          skills: [{ id: "1" }, { id: "9999" }],
          skillCollections: [],
          prompt: "",
          capabilities: [],
          parameters: [],
        })
      )
    ).toBe(400);
    expect(await getSkills()).toHaveLength(skillsBefore);
    expect(await getAgents()).toHaveLength(agentsBefore);
    expect(
      await statusOf(
        startApplicationMigrations({
          applicationIds: [],
          planSelection: "single",
          targetBranch: "main",
        })
      )
    ).toBe(400);
  });

  it("rejects duplicate names with 409", async () => {
    const message = await messageOf(
      createSkillCollection({
        name: "security AND compliance",
        description: "",
        skills: [{ id: "1" }],
      })
    );
    expect(message).toMatch(/already exists/);
  });
});

describe("referential integrity", () => {
  it("409s deletes of entities that are still referenced", async () => {
    // Agent 1 is used by Plan stages.
    expect(await messageOf(deleteAgent("1"))).toMatch(/used by \d+ Plan/);
    // Skill 15 is used by agent Build Validator.
    expect(await statusOf(deleteSkill("15"))).toBe(409);
    // Model 4 (Llama) is used by agents.
    expect(await messageOf(deleteModel("4"))).toMatch(/used by \d+ Agent/);
    // Provider 1 is used by models.
    expect(await messageOf(deleteProvider("1"))).toMatch(/used by \d+ Model/);
    // Plan 1 is used by plan runs.
    expect(await messageOf(deleteMigrationPlan("1"))).toMatch(/plan run/);
  });

  it("409s deleting a Skill that is a collection member", async () => {
    const skill = await createSkill({
      name: "Collected skill",
      description: "",
      sourceType: "inline",
    });
    await createSkillCollection({
      name: "Holds one",
      description: "",
      skills: [{ id: skill.id }],
    });
    expect(await messageOf(deleteSkill(skill.id))).toMatch(/collection/);
  });

  it("cascades allowed deletes without leaving dangling references", async () => {
    // Test Runner (agent 4) is not used by any Plan; its skill links go with it.
    await deleteAgent("4");
    const skill6 = await getSkillById("6");
    expect(
      skill6.associations?.some(
        (a) => a.scope === "agent" && a.resource.id === "4"
      )
    ).toBe(false);
    // Deleting a collection removes it from the agents that used it.
    await deleteSkillCollection("1");
    const agents = await getAgents();
    expect(
      agents.some((agent) =>
        (agent.skillCollections ?? []).some((c) => c.id === "1")
      )
    ).toBe(false);
  });
});

describe("rename cascades (names are resolved by the server)", () => {
  it("reflects a Skill rename on agents and collections", async () => {
    // Build validation standards: on Build Validator and in a collection.
    const skill = await getSkillById("15");
    await updateSkill({
      id: "15",
      name: "Build validation RENAMED",
      description: skill.description,
      sourceType: skill.sourceType,
      imageRef: skill.imageRef,
      associations: skill.associations?.map((a) =>
        a.scope === "agent"
          ? { scope: a.scope, resource: { id: a.resource.id } }
          : { scope: a.scope, resource: { id: a.resource.id } }
      ),
    });
    const collection = await getSkillCollectionById("2");
    expect(collection.skills.map((s) => s.name)).toContain(
      "Build validation RENAMED"
    );
    const agent = await getAgentById("3");
    expect(agent.skills.map((s) => s.name)).toContain(
      "Build validation RENAMED"
    );
  });

  it("reflects Model, Provider and Agent renames everywhere", async () => {
    const llama = (await getModels()).find((m) => m.id === "4")!;
    await updateModel({
      id: "4",
      name: "Llama renamed",
      provider: { id: llama.provider.id },
      model: llama.model,
      credential: llama.credential ? { id: llama.credential.id } : undefined,
    });
    expect((await getAgentById("5")).model.name).toBe("Llama renamed");

    await updateProvider({
      id: "4",
      name: "Ollama renamed",
      providerType: "ollama",
      endpoint: "https://models.apps.example.com/v1",
    });
    expect((await getModels()).find((m) => m.id === "4")?.provider.name).toBe(
      "Ollama renamed"
    );

    const agent = await getAgentById("1");
    await updateAgent({
      id: "1",
      name: "Proposal Agent renamed",
      description: agent.description,
      model: { id: agent.model.id },
      skills: agent.skills.map(({ id }) => ({ id })),
      skillCollections: (agent.skillCollections ?? []).map(({ id }) => ({
        id,
      })),
      prompt: agent.prompt,
      capabilities: agent.capabilities,
      parameters: agent.parameters,
    });
    const plan = await getMigrationPlanById("1");
    expect(plan.stages[0].agent.name).toBe("Proposal Agent renamed");
    const run = await getPlanRunById("1");
    expect(run.stageRuns[0].agent.name).toBe("Proposal Agent renamed");
  });

  it("keeps an agent's skills when an unrelated field changes after a rename", async () => {
    const before = await getAgentById("2");
    await updateSkill({
      id: before.skills[0].id,
      name: "Some renamed skill",
      description: "",
      sourceType: "inline",
      associations: [{ scope: "agent", resource: { id: "2" } }],
    });
    const agent = await getAgentById("2");
    await updateAgent({
      id: "2",
      name: agent.name,
      description: "Unrelated change",
      model: { id: agent.model.id },
      skills: agent.skills.map(({ id }) => ({ id })),
      skillCollections: [],
      prompt: agent.prompt,
      capabilities: agent.capabilities,
      parameters: agent.parameters,
    });
    expect((await getAgentById("2")).skills).toHaveLength(before.skills.length);
  });
});

describe("agent test runs", () => {
  const request = {
    agentId: "2",
    applicationId: 5,
    task: "Apply the conversion patterns.",
  };

  it("stores added skills once each, with names resolved on read", async () => {
    const run = await startAgentTestRun({
      ...request,
      addedSkills: [{ id: "16" }, { id: "4" }, { id: "16" }],
    });
    expect(run.addedSkills).toEqual([
      { id: "16", name: "Spring Boot 3 upgrade" },
      { id: "4", name: "Quarkus best practices" },
    ]);
    await updateSkill({
      id: "16",
      name: "Spring Boot 3.x upgrade",
      description: "",
      sourceType: "inline",
    });
    const listed = (await getAgentTestRuns("2")).find((r) => r.id === run.id);
    expect(listed?.addedSkills?.[0]).toEqual({
      id: "16",
      name: "Spring Boot 3.x upgrade",
    });
    // Nothing is saved on the agent.
    expect((await getAgentById("2")).skills.map((s) => s.id)).toEqual(["14"]);
  });

  it("leaves addedSkills out when none are added", async () => {
    const run = await startAgentTestRun({ ...request, addedSkills: [] });
    expect(run).not.toHaveProperty("addedSkills");
    const plain = await startAgentTestRun(request);
    expect(plain).not.toHaveProperty("addedSkills");
  });

  it("400s malformed or unknown added skills", async () => {
    const start = (addedSkills: unknown) =>
      messageOf(
        startAgentTestRun({
          ...request,
          addedSkills,
        } as unknown as Parameters<typeof startAgentTestRun>[0])
      );
    expect(await start("16")).toBe("addedSkills must be an array.");
    expect(await start([{ id: 16 }])).toBe(
      "addedSkills must reference an entity by id."
    );
    expect(await start([{ id: "9999" }])).toBe('Skill "9999" does not exist.');
    expect(
      await statusOf(
        startAgentTestRun({ ...request, addedSkills: [{ id: "9999" }] })
      )
    ).toBe(400);
  });
});

describe("plans", () => {
  it("keeps stage ids across edits and assigns new ids to new stages", async () => {
    const plan = await getMigrationPlanById("2");
    const ids = plan.stages.map((s) => s.id);
    await updateMigrationPlan({
      id: "2",
      name: plan.name,
      description: plan.description,
      stages: [
        ...plan.stages.map((s) => ({
          id: s.id,
          name: s.name,
          agent: { id: s.agent.id },
          instructions: s.instructions,
          requiresApproval: s.requiresApproval,
        })),
        {
          name: "Extra stage",
          agent: { id: "3" },
          instructions: "",
          requiresApproval: false,
        },
      ],
    });
    const after = await getMigrationPlanById("2");
    expect(after.stages.slice(0, 3).map((s) => s.id)).toEqual(ids);
    expect(ids).not.toContain(after.stages[3].id);
    // Existing runs keep their snapshot: same stages, same names.
    const run = await getPlanRunById("2");
    expect(run.stageRuns.map((s) => s.stageId)).toEqual(ids);
  });

  it("recomputes effective skills on the server", async () => {
    const created = await createMigrationPlan({
      name: "Copy of Java EE to Quarkus",
      description: "",
      stages: [
        {
          name: "Migrate",
          agent: { id: "2" },
          instructions: "",
          requiresApproval: false,
        },
      ],
      migrationPath: {
        archetype: { id: 1 },
        targetProfiles: [{ id: 11 }],
        isDefault: false,
      },
    });
    expect(created.runCount).toBe(0);
    // The saved plan resolves: the target profile reaches every stage.
    const { everyStage } = await resolvePlanSkills({
      stages: created.stages.map(({ agent }) => ({ agent: { id: agent.id } })),
      migrationPath: created.migrationPath && {
        archetype: { id: created.migrationPath.archetype.id },
        targetProfiles: created.migrationPath.targetProfiles,
      },
    });
    expect(everyStage[0].skills.length).toBeGreaterThan(0);
  });

  it("assigns a Plan to a target profile atomically", async () => {
    await assignPlanToTargetProfile({
      archetypeId: 1,
      targetProfileId: 11,
      planId: "3",
    });
    const plans = await getMigrationPlans();
    const holders = plans.filter((p) =>
      p.migrationPath?.targetProfiles.some((tp) => tp.id === 11)
    );
    // Plan 3 becomes the default; Plan 1 keeps its path as a non-default Plan.
    expect(holders.map((p) => [p.id, p.migrationPath?.isDefault])).toEqual([
      ["1", false],
      ["3", true],
    ]);
  });
});

describe("plan skill review", () => {
  /** A saved Plan as the request the wizard would send for it. */
  const requestFor = (plan: MigrationPlan): MigrationPlanRequest => ({
    name: plan.name,
    description: plan.description,
    stages: plan.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      agent: { id: stage.agent.id },
      instructions: stage.instructions,
      requiresApproval: stage.requiresApproval,
    })),
    migrationPath: plan.migrationPath && {
      archetype: { id: plan.migrationPath.archetype.id },
      targetProfiles: plan.migrationPath.targetProfiles.map(({ id }) => ({
        id,
      })),
      isDefault: plan.migrationPath.isDefault,
    },
  });

  it("resolves a draft's skills per stage and for every stage", async () => {
    // A full MigrationPlanRequest is a valid resolve body.
    const plan = await getMigrationPlanById("5");
    const { stages, everyStage } = await resolvePlanSkills(requestFor(plan));
    const idsOf = (entries: { skill: { id: string } }[]) =>
      entries.map(({ skill }) => skill.id);
    // Each stage: its agent's skills, then its collections' skills.
    expect(
      stages.map((group) => [group.name, group.agent.name, idsOf(group.skills)])
    ).toEqual([
      ["Assess runtime", "Migration Proposal Agent", ["13"]],
      ["Upgrade Java", "Java Code Migrator", ["14", "1", "2", "3"]],
      ["Containerize", "Containerization Agent", ["8"]],
      ["Validate", "Build Validator", ["15", "6"]],
    ]);
    expect(stages[3].skills[0].from).toEqual([
      { kind: "agent", agent: { id: "3", name: "Build Validator" } },
      {
        kind: "collection",
        agent: { id: "3", name: "Build Validator" },
        collection: { id: "2", name: "OpenShift delivery checks" },
      },
    ]);
    // Every stage: the plan's archetype, then its target profile.
    expect(everyStage).toHaveLength(1);
    expect(idsOf(everyStage[0].skills)).toEqual(["8", "9", "14", "15", "7"]);
    expect(everyStage[0].skills.find((e) => e.skill.id === "9")?.from).toEqual([
      {
        kind: "archetype",
        archetype: { id: 3, name: "Legacy Java Application" },
      },
      {
        kind: "targetProfile",
        targetProfile: { id: 31, name: "Java 17 on OpenShift" },
        archetype: { id: 3, name: "Legacy Java Application" },
      },
    ]);

    // A collection skill names the agent and the collection.
    expect(
      stages[1].skills.find(({ skill }) => skill.id === "3")?.from
    ).toEqual([
      {
        kind: "collection",
        agent: { id: "9", name: "Java Code Migrator" },
        collection: { id: "1", name: "Java modernization foundation" },
      },
    ]);
    // The plan excludes nothing, and each group lists a skill once.
    [...stages, ...everyStage].forEach((group) => {
      const ids = idsOf(group.skills);
      expect(new Set(ids).size).toBe(ids.length);
      expect(group.skills.every(({ excluded }) => !excluded)).toBe(true);
    });
  });

  it("lists each origin once in a stage, and each stage on its own", async () => {
    const { stages } = await resolvePlanSkills({
      stages: [
        { agent: { id: "2" }, name: "First" },
        { agent: { id: "2" }, name: "Second" },
      ],
    });
    const migration = stages[0].skills.find(({ skill }) => skill.id === "14");
    expect(migration?.from).toEqual([
      { kind: "agent", agent: { id: "2", name: "Code Migrator" } },
    ]);
    expect(stages.map(({ order, name }) => [order, name])).toEqual([
      [1, "First"],
      [2, "Second"],
    ]);
    expect(stages[0].skills).toEqual(stages[1].skills);
  });

  it("is the resolution the application views read", async () => {
    // An application view resolves its plan's stages the same way, with
    // its own context instead of the plan's.
    const migrations = await getApplicationMigrations([1]);
    const view = migrations[1];
    const plan = await getMigrationPlanById(view.plan!.id);
    const forApplication = await resolvePlanSkills({
      ...requestFor(plan),
      applications: [{ id: 1 }],
    });
    expect(view.skills?.stages).toEqual(
      forApplication.stages.map((group, index) => ({
        ...group,
        stageId: plan.stages[index].id,
      }))
    );
    expect(view.skills?.everyStage).toEqual(forApplication.everyStage);
  });

  it("resolves each application with the target profile its entry picks", async () => {
    const plan = await getMigrationPlanById("1");
    const profileSkills = async (
      targetProfile?: { id: number } | null
    ): Promise<string[]> => {
      const { everyStage } = await resolvePlanSkills({
        ...requestFor(plan),
        applications: [
          { id: 1, ...(targetProfile !== undefined ? { targetProfile } : {}) },
        ],
      });
      return everyStage[0].skills
        .filter(({ from }) =>
          from.some((origin) => origin.kind === "targetProfile")
        )
        .map(({ skill }) => skill.id);
    };
    // Absent: the default profile (Quarkus 3.x); the same profile picked
    // explicitly answers the same; null: none.
    const byDefault = await profileSkills();
    expect(byDefault.length).toBeGreaterThan(0);
    expect(await profileSkills({ id: 11 })).toEqual(byDefault);
    expect(await profileSkills(null)).toEqual([]);
    // Spring Boot Application's profile is not one of Customer Management's.
    expect(
      await statusOf(
        resolvePlanSkills({
          stages: [],
          applications: [{ id: 1, targetProfile: { id: 21 } }],
        })
      )
    ).toBe(400);
  });

  it("flags excluded skills and ignores ids that reference nothing", async () => {
    const draft = requestFor(await getMigrationPlanById("5"));
    const excludedDraft = await resolvePlanSkills({
      ...draft,
      excludedSkills: [{ id: "9" }, { id: "9" }, { id: "9999" }],
    });
    const entries = [
      ...excludedDraft.stages.flatMap((group) => group.skills),
      ...excludedDraft.everyStage.flatMap((group) => group.skills),
    ];
    expect([
      ...new Set(
        entries.filter(({ excluded }) => excluded).map(({ skill }) => skill.id)
      ),
    ]).toEqual(["9"]);

    const plain = await resolvePlanSkills(draft);
    const withUnknown = await resolvePlanSkills({
      stages: [...draft.stages, { agent: { id: "9999" }, name: "Unknown" }],
      migrationPath: {
        archetype: draft.migrationPath!.archetype,
        targetProfiles: [...draft.migrationPath!.targetProfiles, { id: 9999 }],
      },
    });
    // The unknown agent's stage is listed, with nothing in it.
    expect(withUnknown).toEqual({
      ...plain,
      stages: [
        ...plain.stages,
        {
          order: plain.stages.length + 1,
          name: "Unknown",
          agent: { id: "9999", name: "9999" },
          skills: [],
        },
      ],
    });
    expect(
      await resolvePlanSkills({
        stages: [],
        migrationPath: { archetype: { id: 9999 }, targetProfiles: [] },
        applications: undefined,
      })
    ).toEqual({ stages: [], everyStage: [{ skills: [] }] });
    expect(
      await resolvePlanSkills({ stages: [], applications: [{ id: 9999 }] })
    ).toEqual({ stages: [], everyStage: [] });
    // No applications is the plan preview; a stage without a name is named
    // after its position.
    const unnamed = await resolvePlanSkills({
      stages: [{ agent: { id: "2" } }],
      applications: [],
    });
    expect(unnamed.stages.map(({ name }) => name)).toEqual(["Stage 1"]);
    expect(unnamed.everyStage).toEqual([{ skills: [] }]);
  });

  it("rejects a malformed body with 400", async () => {
    const post = (body: unknown) =>
      statusOf(axios.post(AGENTIC_ENDPOINTS.planSkillsResolve, body));
    expect(await post({})).toBe(400);
    expect(await post({ stages: [{ agent: "2" }] })).toBe(400);
    expect(
      await post({ stages: [], migrationPath: { archetype: { id: "3" } } })
    ).toBe(400);
    expect(await post({ stages: [], excludedSkills: ["9"] })).toBe(400);
    expect(await post({ stages: [], applications: [{ id: "1" }] })).toBe(400);
    expect(await post({ stages: [], applications: {} })).toBe(400);
  });

  it("follows the apiError scenario like every read", async () => {
    setScenario("apiError");
    expect(await statusOf(resolvePlanSkills({ stages: [] }))).toBe(503);
  });

  it("lists the plans that resolve a skill, with the resolution's placements", async () => {
    // Skill 3 reaches plan 5 only through an agent's skill collection.
    const draft = requestFor(await getMigrationPlanById("5"));
    await updateMigrationPlan({
      ...draft,
      id: "5",
      excludedSkills: [{ id: "3" }],
    });

    const { plans } = await getSkillPlans("3");
    const names = plans.map(({ plan }) => plan.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const plan5 = plans.find(({ plan }) => plan.id === "5");
    const preview = await resolvePlanSkills({
      ...draft,
      excludedSkills: [{ id: "3" }],
    });
    expect(plan5).toEqual({
      plan: { id: "5", name: draft.name },
      placements: preview.stages
        .filter((group) => group.skills.some(({ skill }) => skill.id === "3"))
        .map((group) => {
          const entry = group.skills.find(({ skill }) => skill.id === "3")!;
          return {
            stage: { order: group.order, name: group.name },
            from: entry.from,
            excluded: entry.excluded,
          };
        }),
    });
    expect(plan5?.placements.length).toBeGreaterThan(0);
    expect(
      plan5?.placements.every(
        ({ stage, excluded }) => stage != null && excluded
      )
    ).toBe(true);
    expect(
      plan5?.placements.every(({ from }) =>
        from.every((origin) => origin.kind === "collection")
      )
    ).toBe(true);

    // Every plan, the same as resolving it.
    for (const plan of db.plans) {
      const { stages, everyStage } = await resolvePlanSkills({
        ...requestFor(await getMigrationPlanById(plan.id)),
        excludedSkills: plan.excludedSkills?.map(({ id }) => ({ id })),
      });
      // The plan preview has one every-stage group.
      const contextEntry = everyStage[0]?.skills.find(
        ({ skill }) => skill.id === "3"
      );
      const placements = [
        ...stages.flatMap((group) =>
          group.skills
            .filter(({ skill }) => skill.id === "3")
            .map(({ from, excluded }) => ({
              stage: { order: group.order, name: group.name },
              from,
              excluded,
            }))
        ),
        ...(contextEntry
          ? [{ from: contextEntry.from, excluded: contextEntry.excluded }]
          : []),
      ];
      expect(plans.find((candidate) => candidate.plan.id === plan.id)).toEqual(
        placements.length > 0
          ? { plan: { id: plan.id, name: plan.name }, placements }
          : undefined
      );
    }
  });

  it("answers 404 for an unknown skill's plans and follows the scenarios", async () => {
    expect(await statusOf(getSkillPlans("9999"))).toBe(404);
    setScenario("apiError");
    expect(await statusOf(getSkillPlans("3"))).toBe(503);
    // `initial` hides the fixtures: a seeded skill is not found.
    setScenario("initial");
    expect(await statusOf(getSkillPlans("3"))).toBe(404);
  });

  it("stores excludedSkills on create and update, ignores ids that are not skills, and omits them when there are none", async () => {
    const seeded = await getMigrationPlanById("5");
    expect(seeded).not.toHaveProperty("excludedSkills");

    const created = await createMigrationPlan({
      ...requestFor(seeded),
      name: "Plan with an exclusion",
      migrationPath: { ...requestFor(seeded).migrationPath!, isDefault: false },
      excludedSkills: [{ id: "9" }, { id: "9" }, { id: "9999" }, { id: "3" }],
    });
    const excluded = [
      { id: "9", name: "Java runtime modernization" },
      { id: "3", name: expect.any(String) },
    ];
    expect(created.excludedSkills).toEqual(excluded);
    expect((await getMigrationPlanById(created.id)).excludedSkills).toEqual(
      excluded
    );

    // A malformed value is a 400 and keeps what was stored.
    const request = requestFor(created);
    expect(
      await statusOf(
        updateMigrationPlan({
          ...request,
          id: created.id,
          excludedSkills: ["9"] as unknown as { id: string }[],
        })
      )
    ).toBe(400);
    expect((await getMigrationPlanById(created.id)).excludedSkills).toEqual(
      excluded
    );

    // An id that is not a skill is ignored, as the resolver ignores it.
    await updateMigrationPlan({
      ...request,
      id: created.id,
      excludedSkills: [{ id: "9999" }, { id: "13" }],
    });
    expect((await getMigrationPlanById(created.id)).excludedSkills).toEqual([
      { id: "13", name: "API compatibility checklist" },
    ]);

    await updateMigrationPlan({
      ...request,
      id: created.id,
      excludedSkills: [{ id: "9999" }],
    });
    expect(await getMigrationPlanById(created.id)).not.toHaveProperty(
      "excludedSkills"
    );

    await updateMigrationPlan({
      ...request,
      id: created.id,
      excludedSkills: [{ id: "13" }],
    });
    await updateMigrationPlan({ ...request, id: created.id });
    expect(await getMigrationPlanById(created.id)).not.toHaveProperty(
      "excludedSkills"
    );
  });
});

describe("execution: one source of truth", () => {
  it("shows the same run status in the list, the detail and the inventory", async () => {
    for (const scenario of [
      "running",
      "failed",
      "completed",
      "actionRequired",
    ]) {
      setScenario(scenario);
      const list = await getPlanRuns();
      const detail = await getPlanRunById("2");
      expect(list.find((r) => r.id === "2")?.status).toBe(detail.status);
      const migrations = await getApplicationMigrations(
        detail.applications.map((a) => a.id)
      );
      detail.applications.forEach((application) => {
        const view = migrations[application.id];
        expect(view.planRun?.id).toBe("2");
        expect(view.planRunPlan?.name).toBe(detail.planName);
        if (detail.status === "AwaitingApproval") {
          expect(view.intervention).toBe("actionRequired");
        } else {
          expect(view.runPhase).toBe(detail.status);
        }
      });
    }
  });

  it("puts every application of every run in the portfolio", async () => {
    for (const scenario of ["configured", "running"]) {
      setScenario(scenario);
      const runs = await getPlanRuns();
      const ids = [
        ...new Set(runs.flatMap((r) => r.applications.map((a) => a.id))),
      ];
      const migrations = await getApplicationMigrations(ids);
      const byNumber = (a: number, b: number) => a - b;
      expect(Object.keys(migrations).map(Number).sort(byNumber)).toEqual(
        ids.sort(byNumber)
      );
    }
  });

  it("approving the awaiting stage advances, and the last approval completes the run", async () => {
    setScenario("actionRequired", 1);
    const advanced = await approveStageRun({ runId: "2", stageId: "4" });
    expect(advanced.stageRuns[0].status).toBe("Succeeded");
    expect(advanced.stageRuns[1].status).toBe("Running");
    expect(await statusOf(approveStageRun({ runId: "2", stageId: "4" }))).toBe(
      409
    );

    setScenario("actionRequired", 3);
    const completed = await approveStageRun({ runId: "2", stageId: "6" });
    expect(completed.status).toBe("Succeeded");
    expect((await getPlanRunById("2")).status).toBe("Succeeded");
  });

  it("starts one run per resolved Plan and returns the created runs", async () => {
    const { planRuns } = await startApplicationMigrations({
      applicationIds: [1, 4],
      planSelection: "recommended",
      targetBranch: "feature/x",
    });
    expect(planRuns).toHaveLength(2);
    const migrations = await getApplicationMigrations([1, 4]);
    for (const ref of planRuns) {
      const run = await getPlanRunById(ref.id);
      expect(run.targetBranch).toBe("feature/x");
      run.applications.forEach((application) => {
        expect(migrations[application.id].planRun?.id).toBe(run.id);
        expect(migrations[application.id].plan?.id).toBe(run.planId);
      });
    }
    // The started applications are no longer startable: no duplicate runs.
    expect(migrations[1].preflight).toBe("blocked");
    expect(
      await statusOf(
        startApplicationMigrations({
          applicationIds: [1],
          planSelection: "recommended",
          targetBranch: "main",
        })
      )
    ).toBe(409);
  });

  it("marks applications with an active or succeeded run as not startable", async () => {
    setScenario("running");
    const running = await getApplicationMigrations([1]);
    expect(running[1].preflight).toBe("blocked");
    setScenario("completed");
    const completed = await getApplicationMigrations([1]);
    expect(completed[1].preflight).toBe("blocked");
    setScenario("failed");
    const failed = await getApplicationMigrations([1]);
    expect(failed[1].preflight).toBe("ready");
  });

  it("surfaces action required in the inventory for the actionRequired scenario", async () => {
    setScenario("actionRequired");
    const migrations = await getApplicationMigrations([1, 2, 3, 4, 5]);
    expect(
      Object.values(migrations).some((m) => m.intervention === "actionRequired")
    ).toBe(true);
  });
});

describe("prototype scenarios", () => {
  it("answers every read with 503 under apiError", async () => {
    setScenario("apiError");
    expect(await statusOf(getSkills())).toBe(503);
    expect(await statusOf(getSkillCollectionById("1"))).toBe(503);
    expect(await statusOf(getPlanRunById("1"))).toBe(503);
  });

  it("hides fixture entities in the initial scenario (lists and details agree)", async () => {
    setScenario("initial");
    expect(await getAgents()).toEqual([]);
    expect(await statusOf(getAgentById("1"))).toBe(404);
    expect(await getPlanRuns()).toEqual([]);
  });
});
