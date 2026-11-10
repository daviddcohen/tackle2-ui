/**
 * Reference only: NOT imported by app code. The starting point for wiring the
 * agentic UI to the real Hub (docs/agentic-handoff.md, wiring checklist).
 *
 * Each function has the same name and signature as its counterpart in
 * `./agentic.ts` (the prototype REST module the hooks call; a type test in
 * `agentic-hub.test.ts` enforces it), but calls the Hub's CRD API
 * (`./agent-runs.ts`, `/hub/agentic/*`) and maps through the adapters in
 * `@app/agentic/adapters`. To wire a group, move its functions into
 * `./agentic.ts` (or re-export them from there); hooks and pages do not change.
 *
 * Covered: the groups the Hub serves (Skills, Skill collections, Models
 * except create, Agents except create, Agent test runs, Plans, Plan runs, and
 * starting migrations with one selected Plan).
 *
 * Not covered, because the backend has no contract or the UI does not collect
 * what the CRD requires (hand-off doc, "Design questions blocking backend
 * integration" and section 7):
 * - `createModel` (Gateway `credentialRef` Secret and `model.contextWindow`)
 *   and `createAgent` (`spec.image`);
 * - `approveStageRun`, `resolveApplicationMigrationRequest` (ACP permission
 *   answers inside a live session);
 * - Providers, available models, `setDefaultModel`, execution policy,
 *   `assignPlanToTargetProfile`, `getApplicationMigrations`, and "recommended
 *   Plan" starts.
 *
 * Known limits, to settle when wiring:
 * - Run applications are named `#<id>`: pass an `ApplicationNameIndex` built
 *   from `useFetchApplications` (join in the hook, not here, so polling does
 *   not refetch every application).
 * - Lists are whole-namespace and unfiltered (the Hub has no selectors), so a
 *   polled list refetches everything it joins.
 * - Writes are read-modify-write: the Hub replaces the whole spec on PUT and
 *   has no optimistic concurrency, so the last write wins.
 * - Hub errors other than NotFound (AlreadyExists, CRD validation, RBAC)
 *   arrive as 500 with the Kubernetes message.
 */
import { RESOURCE_NAME_PATTERN } from "@app/api/agentic/contract";
import type * as Crd from "@app/api/agentic/contract";
import { parseSkillFrontmatter } from "@app/utils/skills";

import {
  AgentRequest,
  AgentTestRunRequest,
  EntityId,
  MigrationPlanRequest,
  ModelRequest,
  SkillCollectionRequest,
  SkillRequest,
  StartApplicationMigrationsRequest,
  WithId,
} from "../../agentic";
import {
  assertNotRenamed,
  controllerOwnedSkills,
  isAgentTestRun,
  toAgent,
  toAgentSpec,
  toAgentTestRun,
  toCreateRunInput,
  toGatewaySpec,
  toMigrationPlan,
  toModel,
  toNameIndex,
  toNewResourceName,
  toPlanRun,
  toSkill,
  toSkillCardSpec,
  toSkillCollection,
  toSkillCollectionSpec,
  toStartResponse,
  toWorkflowRunInputs,
  toWorkflowSpec,
} from "../../agentic/adapters";

import * as hub from "./agent-runs";

const skillNameIndex = async () =>
  toNameIndex((await hub.getSkillCards()).map((card) => toSkill(card)));

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const getSkills = async () => {
  const [cards, agents] = await Promise.all([
    hub.getSkillCards(),
    hub.getAgents(),
  ]);
  return cards.map((card) => toSkill(card, agents));
};

export const getSkillById = async (skillId: EntityId) => {
  const [card, agents] = await Promise.all([
    hub.getSkillCard(skillId),
    hub.getAgents(),
  ]);
  return toSkill(card, agents);
};

/**
 * The card's resource name: the SKILL.md frontmatter `name` of inline content
 * when it is a valid resource name (so card and skill share a name), else the
 * display name slugged.
 */
const newSkillCardName = (request: SkillRequest) => {
  if (request.sourceType === "inline" && request.content != null) {
    const parsed = parseSkillFrontmatter(request.content);
    const name = parsed.ok ? parsed.frontmatter.name : undefined;
    if (name != null && RESOURCE_NAME_PATTERN.test(name)) return name;
  }
  return toNewResourceName(request.name);
};

/**
 * Writes the `agent`-scope associations of a Skill: they live on
 * `Agent.spec.skillCards`, so every Agent whose membership changes gets its
 * own PUT (not atomic). Archetype, target profile and application scopes have
 * no backend: they are refused rather than silently dropped.
 */
const writeAgentAssociations = async (
  cardName: string,
  associations: SkillRequest["associations"]
) => {
  if (associations == null) return;
  if (associations.some(({ scope }) => scope !== "agent")) {
    throw new Error(
      "Archetype, target profile and application Skill associations have no Hub backend."
    );
  }
  const wanted = new Set(associations.map(({ resource }) => resource.id));
  const agents = await hub.getAgents();
  for (const agent of agents) {
    const name = agent.metadata.name ?? "";
    const cards = agent.spec.skillCards ?? [];
    const has = cards.some(({ ref }) => ref === cardName);
    if (has === wanted.has(name)) continue;
    const skillCards: Crd.AgentResourceSpec["skillCards"] = has
      ? cards.filter(({ ref }) => ref !== cardName)
      : [...cards, { ref: cardName }];
    await hub.updateAgent(name, { ...agent.spec, skillCards });
  }
};

export const createSkill = async (request: SkillRequest) => {
  const card = await hub.createSkillCard(
    newSkillCardName(request),
    toSkillCardSpec(request)
  );
  await writeAgentAssociations(card.metadata.name ?? "", request.associations);
  return toSkill(card);
};

export const updateSkill = async ({
  id: skillId,
  ...request
}: WithId<SkillRequest>) => {
  const current = await hub.getSkillCard(skillId);
  await hub.updateSkillCard(skillId, toSkillCardSpec(request, current.spec));
  await writeAgentAssociations(skillId, request.associations);
  return undefined;
};

export const deleteSkill = (skillId: EntityId) =>
  hub.deleteSkillCard(skillId).then(() => undefined);

// ---------------------------------------------------------------------------
// Skill collections
// ---------------------------------------------------------------------------

export const getSkillCollections = async () => {
  const [collections, names] = await Promise.all([
    hub.getSkillCollections(),
    skillNameIndex(),
  ]);
  return collections.map((collection) => toSkillCollection(collection, names));
};

export const getSkillCollectionById = async (collectionId: EntityId) => {
  const [collection, names] = await Promise.all([
    hub.getSkillCollection(collectionId),
    skillNameIndex(),
  ]);
  return toSkillCollection(collection, names);
};

export const createSkillCollection = async (request: SkillCollectionRequest) =>
  toSkillCollection(
    await hub.createSkillCollection(
      toNewResourceName(request.name),
      toSkillCollectionSpec(request)
    )
  );

export const updateSkillCollection = async ({
  id: collectionId,
  ...request
}: WithId<SkillCollectionRequest>) => {
  assertNotRenamed(collectionId, request.name);
  const current = await hub.getSkillCollection(collectionId);
  await hub.updateSkillCollection(
    collectionId,
    toSkillCollectionSpec(request, current.spec, controllerOwnedSkills(current))
  );
  return undefined;
};

export const deleteSkillCollection = (collectionId: EntityId) =>
  hub.deleteSkillCollection(collectionId).then(() => undefined);

// ---------------------------------------------------------------------------
// Models (Gateways)
// ---------------------------------------------------------------------------

export const getModels = async () => (await hub.getGateways()).map(toModel);

export const getModelById = async (modelId: EntityId) =>
  toModel(await hub.getGateway(modelId));

export const updateModel = async ({
  id: modelId,
  ...request
}: WithId<ModelRequest>) => {
  assertNotRenamed(modelId, request.name);
  const current = await hub.getGateway(modelId);
  await hub.updateGateway(modelId, toGatewaySpec(request, current.spec));
  return undefined;
};

export const deleteModel = (modelId: EntityId) =>
  hub.deleteGateway(modelId).then(() => undefined);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const getAgents = async () => {
  const [agents, names] = await Promise.all([
    hub.getAgents(),
    skillNameIndex(),
  ]);
  return agents.map((agent) => toAgent(agent, names));
};

export const getAgentById = async (agentId: EntityId) => {
  const [agent, names] = await Promise.all([
    hub.getAgent(agentId),
    skillNameIndex(),
  ]);
  return toAgent(agent, names);
};

export const updateAgent = async ({
  id: agentId,
  ...request
}: WithId<AgentRequest>) => {
  assertNotRenamed(agentId, request.name);
  const current = await hub.getAgent(agentId);
  await hub.updateAgent(agentId, toAgentSpec(request, current.spec));
  return undefined;
};

export const deleteAgent = (agentId: EntityId) =>
  hub.deleteAgent(agentId).then(() => undefined);

// ---------------------------------------------------------------------------
// Agent test runs
// ---------------------------------------------------------------------------

export const getAgentTestRuns = async (agentId?: EntityId) =>
  (await hub.getAgentRuns())
    .filter(isAgentTestRun)
    .filter((run) => agentId == null || run.spec.agentRef === agentId)
    .map((run) => toAgentTestRun(run));

export const startAgentTestRun = async (request: AgentTestRunRequest) =>
  toAgentTestRun(await hub.createAgentRun(toCreateRunInput(request)));

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const getMigrationPlans = async () => {
  const [workflows, runs] = await Promise.all([
    hub.getWorkflows(),
    hub.getWorkflowRuns(),
  ]);
  return workflows.map((workflow) => toMigrationPlan(workflow, runs));
};

export const getMigrationPlanById = async (planId: EntityId) => {
  const [workflow, runs] = await Promise.all([
    hub.getWorkflow(planId),
    hub.getWorkflowRuns(),
  ]);
  return toMigrationPlan(workflow, runs);
};

/** `migrationPath` and `description` have no backend and are not stored. */
export const createMigrationPlan = async (request: MigrationPlanRequest) =>
  toMigrationPlan(
    await hub.createWorkflow(
      toNewResourceName(request.name),
      toWorkflowSpec(request)
    )
  );

export const updateMigrationPlan = async ({
  id: planId,
  ...request
}: WithId<MigrationPlanRequest>) => {
  assertNotRenamed(planId, request.name);
  const current = await hub.getWorkflow(planId);
  await hub.updateWorkflow(planId, toWorkflowSpec(request, current.spec));
  return undefined;
};

export const deleteMigrationPlan = (planId: EntityId) =>
  hub.deleteWorkflow(planId).then(() => undefined);

// ---------------------------------------------------------------------------
// Plan runs
// ---------------------------------------------------------------------------

export const getPlanRuns = async (planId?: EntityId) => {
  const [runs, agentRuns] = await Promise.all([
    hub.getWorkflowRuns(),
    hub.getAgentRuns(),
  ]);
  return runs
    .filter((run) => planId == null || run.spec.workflowRef === planId)
    .map((run) => toPlanRun(run, { agentRuns }));
};

export const getPlanRunById = async (runId: EntityId) => {
  const run = await hub.getWorkflowRun(runId);
  const agentRuns = await Promise.all(
    (run.status?.stages ?? []).flatMap(({ agentRunName }) =>
      agentRunName != null ? [hub.getAgentRun(agentRunName)] : []
    )
  );
  return toPlanRun(run, { agentRuns });
};

// ---------------------------------------------------------------------------
// Starting migrations
// ---------------------------------------------------------------------------

/**
 * One AgentWorkflowRun per application, created one after the other. Only
 * `planSelection: "single"` works ("recommended" needs the Hub's Plan
 * resolution). A failure stops at that application and rejects; the runs
 * already created keep running (decide the partial-failure behavior when
 * wiring).
 */
export const startApplicationMigrations = async (
  request: StartApplicationMigrationsRequest
) => {
  const created: Crd.AgentWorkflowRun[] = [];
  for (const input of toWorkflowRunInputs(request)) {
    created.push(await hub.createWorkflowRun(input));
  }
  return toStartResponse(created);
};
