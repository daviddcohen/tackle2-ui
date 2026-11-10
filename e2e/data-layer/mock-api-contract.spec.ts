/**
 * The MSW agentic mock behaves like a REST backend: 400 on invalid bodies,
 * 404 on unknown ids, 409 on conflicts and referential integrity, 204 on PUT,
 * the URL id wins over the body id, and server-computed fields are filled in.
 * These are the semantics the UI relies on from the real Hub API (mock server:
 * client/src/mocks/stub-new-work/agentic/).
 */
import type { Page } from "@playwright/test";

import {
  type Named,
  agenticGet,
  agenticRequest,
  bootMockApi,
  expect,
  test,
} from "../support";

interface Ref {
  id: string;
}
interface Agent extends Named {
  description: string;
  model: Ref;
  skills: Ref[];
  skillCollections?: Ref[];
  prompt: string;
  capabilities: string[];
  parameters: unknown[];
}
interface Model extends Named {
  isOrganizationDefault: boolean;
}
interface Stage extends Named {
  agent: Ref;
  instructions: string;
  requiresApproval: boolean;
}
interface Plan extends Named {
  stages: Stage[];
  effectiveSkills: unknown[];
  migrationPath: {
    archetype: { id: number };
    targetProfiles: { id: number }[];
  };
}
interface PlanRun extends Named {
  status: string;
  targetBranch: string;
  stageRuns: { stageId: string; status: string }[];
}

const list = <T>(page: Page, path: string) => agenticGet<T[]>(page, path);

test("400: empty POST bodies are rejected and nothing is stored", async ({
  page,
}) => {
  await bootMockApi(page);
  for (const path of [
    "/skills",
    "/plans",
    "/models",
    "/agents",
    "/skill-collections",
    "/providers",
  ]) {
    const before = (await list(page, path)).length;
    const response = await agenticRequest<{ message: unknown }>(
      page,
      "POST",
      path,
      {}
    );
    expect(response.status, path).toBe(400);
    expect(typeof response.body.message, path).toBe("string");
    expect((await list(page, path)).length, path).toBe(before);
  }
});

test("409: duplicate names are rejected", async ({ page }) => {
  await bootMockApi(page);
  const [source] = await list<Agent>(page, "/agents");
  const duplicate = await agenticRequest(page, "POST", "/agents", {
    name: source.name,
    description: "",
    model: { id: source.model.id },
    skills: [],
    skillCollections: [],
    prompt: "",
    capabilities: [],
    parameters: [],
  });
  expect(duplicate.status).toBe(409);
  const after = await list<Agent>(page, "/agents");
  expect(after.filter((agent) => agent.name === source.name)).toHaveLength(1);
});

test("PUT uses the URL id, not the body id, and returns 204", async ({
  page,
}) => {
  await bootMockApi(page);
  const [a, b] = await list<Named>(page, "/skills");
  const response = await agenticRequest(page, "PUT", `/skills/${a.id}`, {
    ...b,
    name: "X renamed",
    associations: [],
  });
  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
  const after = await list<Named>(page, "/skills");
  expect(after.filter((skill) => skill.id === b.id)).toHaveLength(1);
  expect(after.find((skill) => skill.id === a.id)?.name).toBe("X renamed");
  expect(after.find((skill) => skill.id === b.id)?.name).toBe(b.name);
});

test("PUT /agents/:id with an id-only body returns 204 No Content", async ({
  page,
}) => {
  await bootMockApi(page);
  const [agent] = await list<Agent>(page, "/agents");
  const response = await agenticRequest(page, "PUT", `/agents/${agent.id}`, {
    name: agent.name,
    description: agent.description,
    model: { id: agent.model.id },
    skills: agent.skills.map((skill) => ({ id: skill.id })),
    skillCollections: (agent.skillCollections ?? []).map((collection) => ({
      id: collection.id,
    })),
    prompt: agent.prompt,
    capabilities: agent.capabilities,
    parameters: agent.parameters,
  });
  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
});

test("409: a referenced Agent or Model cannot be deleted", async ({ page }) => {
  await bootMockApi(page);
  const [plan] = await list<Plan>(page, "/plans");
  const usedAgentId = plan.stages[0].agent.id;
  const deleteAgent = await agenticRequest<{ message: string }>(
    page,
    "DELETE",
    `/agents/${usedAgentId}`
  );
  expect(deleteAgent.status).toBe(409);
  expect(deleteAgent.body.message).toMatch(/Plan/);
  expect(
    (await agenticRequest(page, "GET", `/agents/${usedAgentId}`)).status
  ).toBe(200);

  const agents = await list<Agent>(page, "/agents");
  const models = await list<Model>(page, "/models");
  const usedModel = models.find(
    (model) =>
      !model.isOrganizationDefault &&
      agents.some((agent) => agent.model.id === model.id)
  );
  expect(usedModel).toBeDefined();
  expect(
    (await agenticRequest(page, "DELETE", `/models/${usedModel!.id}`)).status
  ).toBe(409);
});

test("ids are opaque strings; unknown ids are 404", async ({ page }) => {
  await bootMockApi(page);
  const [skill] = await list<Named>(page, "/skills");
  expect(typeof skill.id).toBe("string");
  for (const path of ["/skills/abc", "/plans/NaN", "/plans/0"])
    expect((await agenticRequest(page, "GET", path)).status, path).toBe(404);
});

test("202: starting migrations returns the created plan runs", async ({
  page,
}) => {
  await bootMockApi(page);
  const response = await agenticRequest<{ planRuns: Named[] }>(
    page,
    "POST",
    "/application-migrations",
    { applicationIds: [1], planSelection: "recommended", targetBranch: "x" }
  );
  expect(response.status).toBe(202);
  expect(response.body.planRuns).toHaveLength(1);
  const run = await agenticGet<PlanRun>(
    page,
    `/plan-runs/${response.body.planRuns[0].id}`
  );
  expect(run.targetBranch).toBe("x");
});

test("400: starting migrations without applications or without a Plan", async ({
  page,
}) => {
  await bootMockApi(page);
  const empty = await agenticRequest(page, "POST", "/application-migrations", {
    applicationIds: [],
    planSelection: "single",
    targetBranch: "",
  });
  expect(empty.status).toBe(400);
  const noPlan = await agenticRequest(page, "POST", "/application-migrations", {
    applicationIds: [1],
    planSelection: "single",
    targetBranch: "main",
  });
  expect(noPlan.status).toBe(400);
});

test("409: approving a stage that is not awaiting approval", async ({
  page,
}) => {
  await bootMockApi(page);
  const runs = await list<PlanRun>(page, "/plan-runs");
  const done = runs.find((run) => run.status === "Succeeded");
  expect(done).toBeDefined();
  const response = await agenticRequest(
    page,
    "POST",
    `/plan-runs/${done!.id}/stages/${done!.stageRuns[0].stageId}/approve`
  );
  expect(response.status).toBe(409);
  const after = await agenticGet<PlanRun>(page, `/plan-runs/${done!.id}`);
  expect(after.stageRuns[0].status).toBe("Succeeded");
});

test("201: a created plan gets server-computed effectiveSkills", async ({
  page,
}) => {
  await bootMockApi(page);
  const [source] = await list<Plan>(page, "/plans");
  expect(source.effectiveSkills.length).toBeGreaterThan(0);
  const created = await agenticRequest<Named>(page, "POST", "/plans", {
    name: "copy",
    description: "",
    stages: source.stages.map((stage) => ({
      name: stage.name,
      agent: { id: stage.agent.id },
      instructions: stage.instructions,
      requiresApproval: stage.requiresApproval,
    })),
    migrationPath: {
      archetype: { id: source.migrationPath.archetype.id },
      targetProfiles: source.migrationPath.targetProfiles.map((profile) => ({
        id: profile.id,
      })),
      isDefault: false,
    },
    effectiveSkills: [],
  });
  expect(created.status).toBe(201);
  const plan = await agenticGet<Plan>(page, `/plans/${created.body.id}`);
  expect(plan.effectiveSkills.length).toBeGreaterThan(0);
});

test("503: the apiError scenario fails every agentic endpoint alike", async ({
  page,
}) => {
  await bootMockApi(page, "apiError");
  for (const path of [
    "/skills",
    "/agents",
    "/plans",
    "/models",
    "/plan-runs",
    "/skill-collections",
    "/skill-collections/1",
    "/providers",
    "/execution-policy",
    "/agent-runs",
  ])
    expect((await agenticRequest(page, "GET", path)).status, path).toBe(503);
});
