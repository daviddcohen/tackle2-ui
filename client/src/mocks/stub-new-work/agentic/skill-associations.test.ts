/**
 * Associations edited from the other side (PUT .../skills, PUT
 * /skills/:id/collections, PUT /skill-collections/:id/agents). Driven through
 * the real REST client over MSW: each write must show up in the reads the
 * existing pages use (skills, collections, agents, plans, application
 * migrations) and must leave unrelated rows alone.
 */
import axios, { AxiosError, isAxiosError } from "axios";

import { MigrationPlan, Skill, SkillCollection } from "@app/agentic";
import {
  AGENTIC_ENDPOINTS,
  createSkill,
  getAgents,
  getApplicationMigrations,
  getMigrationPlanById,
  getSkillById,
  getSkillCollections,
  getSkills,
  resolvePlanSkills,
  updateApplicationSkills,
  updateArchetypeSkills,
  updateSkill,
  updateSkillCollectionAgents,
  updateSkillCollectionMemberships,
  updateTargetProfileSkills,
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

/** The skills a saved plan's preview gives every stage. */
const everyStageOf = async (plan: MigrationPlan) =>
  (
    await resolvePlanSkills({
      stages: plan.stages.map(({ agent }) => ({ agent: { id: agent.id } })),
      migrationPath: plan.migrationPath && {
        archetype: { id: plan.migrationPath.archetype.id },
        targetProfiles: plan.migrationPath.targetProfiles.map(({ id }) => ({
          id,
        })),
      },
    })
  ).everyStage.flatMap((group) => group.skills);

const hasAssociation = (skill: Skill, scope: string, id: number | string) =>
  (skill.associations ?? []).some(
    (a) => a.scope === scope && a.resource.id === id
  );

const skillIdsFor = (skills: Skill[], scope: string, id: number) =>
  skills
    .filter((skill) => hasAssociation(skill, scope, id))
    .map((skill) => skill.id)
    .sort();

/** Every association except the ones of one scope and resource. */
const otherAssociations = (skills: Skill[], scope: string, id: number) =>
  skills.map((skill) => ({
    id: skill.id,
    associations: (skill.associations ?? []).filter(
      (a) => !(a.scope === scope && a.resource.id === id)
    ),
  }));

beforeEach(() => {
  server.use(...handlers);
  resetAgenticDb();
  resetExecutionWorld();
  window.history.replaceState({}, "", "/?protoScenario=configured");
});

describe("PUT /archetypes/:id/skills", () => {
  it("replaces the archetype's set and the skill side shows it", async () => {
    const before = await getSkills();
    const current = skillIdsFor(before, "archetype", 1);
    expect(current.length).toBeGreaterThan(0);
    const added = before.find(
      (skill) => !hasAssociation(skill, "archetype", 1)
    )!;
    const kept = current[0];

    await updateArchetypeSkills({
      archetypeId: 1,
      skills: [{ id: kept }, { id: added.id }, { id: added.id }],
    });

    const after = await getSkills();
    expect(skillIdsFor(after, "archetype", 1)).toEqual([kept, added.id].sort());
    expect(
      (await getSkillById(added.id)).associations?.find(
        (a) => a.scope === "archetype" && a.resource.id === 1
      )?.resource.name
    ).toBe("Java EE Application");
    // Rows of other scopes and other archetypes are untouched.
    expect(otherAssociations(after, "archetype", 1)).toEqual(
      otherAssociations(before, "archetype", 1)
    );
  });

  it("feeds the plan's server-derived skills for every stage", async () => {
    const plan = await getMigrationPlanById("1");
    expect(plan.migrationPath?.archetype.id).toBe(1);
    const before = await everyStageOf(plan);
    const added = (await getSkills()).find(
      (skill) => !before.some((entry) => entry.skill.id === skill.id)
    )!;
    await updateArchetypeSkills({ archetypeId: 1, skills: [{ id: added.id }] });
    const after = await everyStageOf(plan);
    const fromArchetype = after.filter((entry) =>
      entry.from.some((origin) => origin.kind === "archetype")
    );
    expect(fromArchetype.map((entry) => entry.skill)).toEqual([
      { id: added.id, name: added.name },
    ]);
    expect(fromArchetype[0].from).toContainEqual({
      kind: "archetype",
      archetype: { id: 1, name: "Java EE Application" },
    });
  });

  it("clears the set with an empty list", async () => {
    await updateArchetypeSkills({ archetypeId: 1, skills: [] });
    expect(skillIdsFor(await getSkills(), "archetype", 1)).toEqual([]);
  });

  it("stays consistent with the skill form's PUT /skills/:id", async () => {
    const skill = (await getSkills()).find(
      (candidate) => !hasAssociation(candidate, "archetype", 1)
    )!;
    await updateArchetypeSkills({
      archetypeId: 1,
      skills: [{ id: skill.id }],
    });
    // The skill form sends back what it read: the association survives.
    const read = await getSkillById(skill.id);
    await updateSkill({
      id: skill.id,
      name: read.name,
      description: read.description,
      sourceType: read.sourceType,
      content: read.content,
      repoUrl: read.repoUrl,
      imageRef: read.imageRef,
      associations: read.associations?.map((a) =>
        a.scope === "agent"
          ? { scope: a.scope, resource: { id: a.resource.id } }
          : { scope: a.scope, resource: { id: a.resource.id } }
      ),
    });
    expect(skillIdsFor(await getSkills(), "archetype", 1)).toEqual([skill.id]);
  });

  it("answers 404 for an unknown archetype and 400 for a bad body", async () => {
    const before = await getSkills();
    expect(
      await statusOf(updateArchetypeSkills({ archetypeId: 999, skills: [] }))
    ).toBe(404);
    expect(
      await statusOf(axios.put(`${AGENTIC_ENDPOINTS.archetypes}/abc/skills`))
    ).toBe(404);
    expect(
      await statusOf(axios.put(`${AGENTIC_ENDPOINTS.archetypes}/1/skills`, {}))
    ).toBe(400);
    expect(
      await statusOf(
        axios.put(`${AGENTIC_ENDPOINTS.archetypes}/1/skills`, { skills: "1" })
      )
    ).toBe(400);
    expect(
      await statusOf(
        axios.put(`${AGENTIC_ENDPOINTS.archetypes}/1/skills`, {
          skills: [{ id: 1 }],
        })
      )
    ).toBe(400);
    expect(
      await messageOf(
        updateArchetypeSkills({
          archetypeId: 1,
          skills: [{ id: before[0].id }, { id: "9999" }],
        })
      )
    ).toBe('Skill "9999" does not exist.');
    // Nothing was saved by the rejected writes.
    expect(await getSkills()).toEqual(before);
  });
});

describe("PUT .../skills in the initial scenario", () => {
  it("leaves the hidden fixture skills alone and refuses to reference them", async () => {
    const seededRows = (scope: string, id: number) =>
      skillIdsFor(db.skills as Skill[], scope, id);
    const archetypeRows = seededRows("archetype", 1);
    const profileRows = seededRows("targetProfile", 11);
    const applicationRows = seededRows("application", 1);
    expect(archetypeRows.length).toBeGreaterThan(0);
    window.history.replaceState({}, "", "/?protoScenario=initial");
    expect(await getSkills()).toEqual([]);
    const created = await createSkill({
      name: "User skill",
      description: "",
      sourceType: "inline",
      content: "# Hi",
    });

    await updateArchetypeSkills({
      archetypeId: 1,
      skills: [{ id: created.id }],
    });
    await updateTargetProfileSkills({
      archetypeId: 1,
      targetProfileId: 11,
      skills: [{ id: created.id }],
    });
    await updateApplicationSkills({
      applicationId: 1,
      skills: [{ id: created.id }],
    });
    expect(
      await messageOf(
        updateArchetypeSkills({
          archetypeId: 1,
          skills: [{ id: archetypeRows[0] }],
        })
      )
    ).toBe(`Skill "${archetypeRows[0]}" does not exist.`);

    window.history.replaceState({}, "", "/?protoScenario=configured");
    const after = await getSkills();
    expect(skillIdsFor(after, "archetype", 1)).toEqual(
      [...archetypeRows, created.id].sort()
    );
    expect(skillIdsFor(after, "targetProfile", 11)).toEqual(
      [...profileRows, created.id].sort()
    );
    expect(skillIdsFor(after, "application", 1)).toEqual(
      [...applicationRows, created.id].sort()
    );
  });
});

describe("PUT /archetypes/:id/target-profiles/:profileId/skills", () => {
  it("replaces the target profile's set only", async () => {
    const before = await getSkills();
    const added = before.find(
      (skill) => !hasAssociation(skill, "targetProfile", 11)
    )!;
    await updateTargetProfileSkills({
      archetypeId: 1,
      targetProfileId: 11,
      skills: [{ id: added.id }],
    });
    const after = await getSkills();
    expect(skillIdsFor(after, "targetProfile", 11)).toEqual([added.id]);
    expect(otherAssociations(after, "targetProfile", 11)).toEqual(
      otherAssociations(before, "targetProfile", 11)
    );
    const plan = await getMigrationPlanById("1");
    const fromProfile = (await everyStageOf(plan)).filter((entry) =>
      entry.from.some((origin) => origin.kind === "targetProfile")
    );
    expect(fromProfile.map((entry) => entry.skill)).toEqual([
      { id: added.id, name: added.name },
    ]);
    expect(fromProfile[0].from).toContainEqual({
      kind: "targetProfile",
      targetProfile: { id: 11, name: "Quarkus 3.x" },
      archetype: { id: 1, name: "Java EE Application" },
    });
  });

  it("answers 404 for a profile of another archetype or an unknown one", async () => {
    // Profile 21 belongs to archetype 2.
    expect(
      await messageOf(
        updateTargetProfileSkills({
          archetypeId: 1,
          targetProfileId: 21,
          skills: [],
        })
      )
    ).toMatch(/Target profile "21" not found/);
    expect(
      await statusOf(
        updateTargetProfileSkills({
          archetypeId: 999,
          targetProfileId: 11,
          skills: [],
        })
      )
    ).toBe(404);
  });
});

describe("PUT /applications/:id/skills", () => {
  it("replaces the application's set and its migration view shows it", async () => {
    const before = await getSkills();
    const current = skillIdsFor(before, "application", 1);
    const added = before.find(
      (skill) => !hasAssociation(skill, "application", 1)
    )!;
    await updateApplicationSkills({
      applicationId: 1,
      skills: [{ id: added.id }],
    });
    const after = await getSkills();
    expect(skillIdsFor(after, "application", 1)).toEqual([added.id]);
    expect(otherAssociations(after, "application", 1)).toEqual(
      otherAssociations(before, "application", 1)
    );
    const migrations = await getApplicationMigrations([1]);
    const sources = migrations[1].skills?.everyStage
      .flatMap((group) => group.skills)
      .filter((entry) =>
        entry.from.some((origin) => origin.kind === "application")
      );
    expect(sources?.map((entry) => entry.skill.id)).toEqual([added.id]);
    current.forEach((id) =>
      expect(sources?.some((entry) => entry.skill.id === id)).toBe(false)
    );
  });

  it("answers 404 for an unknown application", async () => {
    expect(
      await statusOf(
        updateApplicationSkills({ applicationId: 999, skills: [] })
      )
    ).toBe(404);
  });
});

describe("PUT /skills/:id/collections", () => {
  it("adds and removes the skill in each collection", async () => {
    const collections = await getSkillCollections();
    const member = collections[0].skills[0].id;
    const others = collections.filter(
      (c) => !c.skills.some((s) => s.id === member)
    );
    expect(others.length).toBeGreaterThan(0);
    // Keep the first collection, leave the rest, join one it was not in.
    await updateSkillCollectionMemberships({
      skillId: member,
      collections: [{ id: collections[0].id }, { id: others[0].id }],
    });
    const after = await getSkillCollections();
    after.forEach((collection) => {
      const before = collections.find((c) => c.id === collection.id)!;
      const wanted = [collections[0].id, others[0].id].includes(collection.id);
      expect(collection.skills.some((s) => s.id === member)).toBe(wanted);
      // Other members keep their position.
      expect(
        collection.skills.filter((s) => s.id !== member).map((s) => s.id)
      ).toEqual(before.skills.filter((s) => s.id !== member).map((s) => s.id));
    });
    const skill = await getSkillById(member);
    expect(after.find((c) => c.id === others[0].id)?.skills).toContainEqual({
      id: member,
      name: skill.name,
    });
  });

  it("refuses to empty a collection and to change an operator-managed one", async () => {
    const skill = await getSkills().then((skills) => skills[0]);
    // A one-member collection, built through the existing endpoint.
    await axios.post(AGENTIC_ENDPOINTS.skillCollections, {
      name: "Single member",
      description: "",
      skills: [{ id: skill.id }],
    });
    const before = await getSkillCollections();
    const single = before.find((c) => c.name === "Single member")!;
    const keep = before
      .filter((c) => c.id !== single.id)
      .filter((c) => c.skills.some((s) => s.id === skill.id))
      .map((c) => ({ id: c.id }));
    const target = before.find(
      (c) => !c.skills.some((s) => s.id === skill.id)
    )!;
    // Joining `target` is valid, leaving "Single member" is not: 400, and
    // the whole request is refused.
    const emptying = updateSkillCollectionMemberships({
      skillId: skill.id,
      collections: [...keep, { id: target.id }],
    });
    expect(await statusOf(emptying)).toBe(400);
    expect(
      await messageOf(
        updateSkillCollectionMemberships({
          skillId: skill.id,
          collections: [...keep, { id: target.id }],
        })
      )
    ).toBe(
      `${skill.name} is the only skill in Single member. A skill collection needs at least one skill.`
    );
    const members = (list: SkillCollection[]) =>
      list.map((c) => [c.id, c.skills]);
    expect(members(await getSkillCollections())).toEqual(members(before));

    db.skillCollections.find((c) => c.id === target.id)!.operatorManaged = true;
    expect(
      await statusOf(
        updateSkillCollectionMemberships({
          skillId: skill.id,
          collections: [...keep, { id: single.id }, { id: target.id }],
        })
      )
    ).toBe(409);
    expect(members(await getSkillCollections())).toEqual(members(before));
  });

  it("answers 404 for an unknown skill and 400 for unknown collections", async () => {
    expect(
      await statusOf(
        updateSkillCollectionMemberships({ skillId: "9999", collections: [] })
      )
    ).toBe(404);
    expect(
      await statusOf(
        updateSkillCollectionMemberships({
          skillId: "1",
          collections: [{ id: "9999" }],
        })
      )
    ).toBe(400);
    expect(
      await statusOf(axios.put(`${AGENTIC_ENDPOINTS.skills}/1/collections`, {}))
    ).toBe(400);
  });
});

describe("PUT /skill-collections/:id/agents", () => {
  it("adds and removes the collection on each agent", async () => {
    const agents = await getAgents();
    const users = agents
      .filter((a) => (a.skillCollections ?? []).some((c) => c.id === "1"))
      .map((a) => a.id);
    expect(users.length).toBeGreaterThan(0);
    const newcomer = agents.find((a) => !users.includes(a.id))!;

    await updateSkillCollectionAgents({
      collectionId: "1",
      agents: [{ id: newcomer.id }],
    });

    const after = await getAgents();
    after.forEach((agent) => {
      const before = agents.find((a) => a.id === agent.id)!;
      const refs = agent.skillCollections ?? [];
      expect(refs.some((c) => c.id === "1")).toBe(agent.id === newcomer.id);
      // Other collections and the direct skills are untouched.
      expect(refs.filter((c) => c.id !== "1")).toEqual(
        (before.skillCollections ?? []).filter((c) => c.id !== "1")
      );
      expect(agent.skills).toEqual(before.skills);
    });
    expect(
      after.find((a) => a.id === newcomer.id)?.skillCollections
    ).toContainEqual({ id: "1", name: "Java modernization foundation" });
  });

  it("refuses to change an operator-managed agent, and saves nothing", async () => {
    const before = await getAgents();
    const target = before.find(
      (a) => !(a.skillCollections ?? []).some((c) => c.id === "1")
    )!;
    db.agents.find((a) => a.id === target.id)!.operatorManaged = true;
    expect(
      await messageOf(
        updateSkillCollectionAgents({
          collectionId: "1",
          agents: [{ id: target.id }],
        })
      )
    ).toBe(`${target.name} is managed by Konveyor and cannot be changed here.`);
    expect(
      (await getAgents()).map((a) => [a.id, a.skillCollections ?? []])
    ).toEqual(before.map((a) => [a.id, a.skillCollections ?? []]));
  });

  it("answers 404 for an unknown collection and 400 for unknown agents", async () => {
    expect(
      await statusOf(
        updateSkillCollectionAgents({ collectionId: "9999", agents: [] })
      )
    ).toBe(404);
    expect(
      await statusOf(
        updateSkillCollectionAgents({
          collectionId: "1",
          agents: [{ id: "9999" }],
        })
      )
    ).toBe(400);
    expect(
      await statusOf(
        axios.put(`${AGENTIC_ENDPOINTS.skillCollections}/1/agents`, {
          agents: null,
        })
      )
    ).toBe(400);
  });
});
