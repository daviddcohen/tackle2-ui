/**
 * The agentic mock server must behave like a REST backend. These tests drive
 * it through the real REST client (`@app/api/rest/agentic`) over MSW, so they
 * also pin the client contract (typed data, 201/204, URL ids).
 */
import axios, { AxiosError, isAxiosError } from "axios";

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
  getAgents,
  getApplicationMigrations,
  getMigrationPlanById,
  getMigrationPlans,
  getModels,
  getPlanRunById,
  getPlanRuns,
  getSkillById,
  getSkillCollectionById,
  getSkills,
  startApplicationMigrations,
  updateAgent,
  updateMigrationPlan,
  updateModel,
  updateProvider,
  updateSkill,
} from "@app/api/rest/agentic";
import { server } from "@mocks/server";

import { resetAgenticDb } from "./db";
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
    const skill = await getSkillById("1");
    await updateSkill({
      id: "1",
      name: "Spring Boot to Quarkus RENAMED",
      description: skill.description,
      sourceType: skill.sourceType,
      content: skill.content,
      associations: skill.associations?.map((a) =>
        a.scope === "agent"
          ? { scope: a.scope, resource: { id: a.resource.id } }
          : { scope: a.scope, resource: { id: a.resource.id } }
      ),
    });
    const collection = await getSkillCollectionById("1");
    expect(collection.skills.map((s) => s.name)).toContain(
      "Spring Boot to Quarkus RENAMED"
    );
    const agent = await getAgentById("2");
    expect(agent.skills.map((s) => s.name)).toContain(
      "Spring Boot to Quarkus RENAMED"
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
    expect(created.effectiveSkills?.length).toBeGreaterThan(0);
    expect(created.runCount).toBe(0);
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
        expect(view.plan?.name).toBe(detail.planName);
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
