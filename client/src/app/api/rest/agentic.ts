/**
 * REST client for the agentic migration UI.
 *
 * Every function returns typed data (never the AxiosResponse). Creates take a
 * request type without server-owned fields and resolve to the created entity;
 * updates and deletes resolve to `void` (the Hub answers PUT and DELETE with
 * 204 No Content). The client never mints ids.
 *
 * All paths live in `AGENTIC_ENDPOINTS`. Today they point at the prototype
 * contract (`/hub/prototype/agentic/*`, served by MSW in development). Each
 * function group notes its real backend equivalent, using the legend from the
 * backend integration map:
 *   - exists:  the Hub serves it; only the shape differs (needs an adapter)
 *   - partial: an equivalent exists with different semantics or transport
 *   - missing: no Hub endpoint yet; a contract has to be designed
 *
 * To integrate a real backend, replace the functions of a group with calls to
 * the Hub endpoint plus an adapter that maps the Hub shape to the domain types
 * in `@app/agentic`. Hooks in `@app/queries/agentic` keep their signatures.
 * `./agentic-hub.ts` does this for the groups the Hub serves and is the
 * starting point; docs/agentic-handoff.md has the full inventory (the status
 * notes below match its section 3).
 */
import axios from "axios";

import {
  Agent,
  AgentRequest,
  AgentTestRun,
  AgentTestRunRequest,
  ApplicationMigrationMap,
  ApplicationMigrationView,
  AvailableModel,
  EntityId,
  ExecutionPolicy,
  MigrationPlan,
  MigrationPlanRequest,
  ModelProjection,
  ModelRequest,
  PlanRun,
  Provider,
  ProviderRequest,
  Skill,
  SkillCollection,
  SkillCollectionRequest,
  SkillRequest,
  StartApplicationMigrationsRequest,
  StartApplicationMigrationsResponse,
  WithId,
} from "../../agentic";
import { hub } from "../rest";

const PROTOTYPE_BASE = hub`/prototype/agentic`;

const id = (value: EntityId) => encodeURIComponent(value);

/** The single place to change agentic endpoint paths. */
export const AGENTIC_ENDPOINTS = {
  skills: `${PROTOTYPE_BASE}/skills`,
  skillCollections: `${PROTOTYPE_BASE}/skill-collections`,
  models: `${PROTOTYPE_BASE}/models`,
  providers: `${PROTOTYPE_BASE}/providers`,
  agents: `${PROTOTYPE_BASE}/agents`,
  agentRuns: `${PROTOTYPE_BASE}/agent-runs`,
  plans: `${PROTOTYPE_BASE}/plans`,
  archetypes: `${PROTOTYPE_BASE}/archetypes`,
  planRuns: `${PROTOTYPE_BASE}/plan-runs`,
  applicationMigrations: `${PROTOTYPE_BASE}/application-migrations`,
  executionPolicy: `${PROTOTYPE_BASE}/execution-policy`,
} as const;

const {
  skills: SKILLS,
  skillCollections: SKILL_COLLECTIONS,
  models: MODELS,
  providers: PROVIDERS,
  agents: AGENTS,
  agentRuns: AGENT_RUNS,
  plans: PLANS,
  archetypes: ARCHETYPES,
  planRuns: PLAN_RUNS,
  applicationMigrations: APPLICATION_MIGRATIONS,
  executionPolicy: EXECUTION_POLICY,
} = AGENTIC_ENDPOINTS;

// ---------------------------------------------------------------------------
// Skills. Real backend: exists. `/hub/agentic/skills[/:name]` (SkillCard CRD).
// Source type is implicit in the CRD (`spec.inline` | `spec.source` |
// `spec.image`). Associations: the `agent` scope is the reverse of
// `Agent.spec.skillCards`; archetype, target profile and application scopes
// are missing (Hub-owned relationship, needs a contract).
// ---------------------------------------------------------------------------

export const getSkills = () =>
  axios.get<Skill[]>(SKILLS).then(({ data }) => data);

export const getSkillById = (skillId: EntityId) =>
  axios.get<Skill>(`${SKILLS}/${id(skillId)}`).then(({ data }) => data);

export const createSkill = (request: SkillRequest) =>
  axios.post<Skill>(SKILLS, request).then(({ data }) => data);

export const updateSkill = ({
  id: skillId,
  ...request
}: WithId<SkillRequest>) =>
  axios.put<void>(`${SKILLS}/${id(skillId)}`, request).then(() => undefined);

export const deleteSkill = (skillId: EntityId) =>
  axios.delete<void>(`${SKILLS}/${id(skillId)}`).then(() => undefined);

// ---------------------------------------------------------------------------
// Skill collections. Real backend: exists. `/hub/agentic/skillcollections`.
// Members are `spec.skills[].skillCardRef`; `description` has no CRD field.
// ---------------------------------------------------------------------------

export const getSkillCollections = () =>
  axios.get<SkillCollection[]>(SKILL_COLLECTIONS).then(({ data }) => data);

export const getSkillCollectionById = (collectionId: EntityId) =>
  axios
    .get<SkillCollection>(`${SKILL_COLLECTIONS}/${id(collectionId)}`)
    .then(({ data }) => data);

export const createSkillCollection = (request: SkillCollectionRequest) =>
  axios
    .post<SkillCollection>(SKILL_COLLECTIONS, request)
    .then(({ data }) => data);

export const updateSkillCollection = ({
  id: collectionId,
  ...request
}: WithId<SkillCollectionRequest>) =>
  axios
    .put<void>(`${SKILL_COLLECTIONS}/${id(collectionId)}`, request)
    .then(() => undefined);

export const deleteSkillCollection = (collectionId: EntityId) =>
  axios
    .delete<void>(`${SKILL_COLLECTIONS}/${id(collectionId)}`)
    .then(() => undefined);

// ---------------------------------------------------------------------------
// Models. Real backend: exists for reads, update and delete; create is
// partial. `/hub/agentic/gateways` (Gateway CRD): `model` maps to
// `spec.model.name`, `credential` to `spec.credentialRef` (a k8s Secret, not
// a Hub identity; the CRD also requires `spec.model.contextWindow`, which the
// form lacks), verification to the Ready condition (`toVerificationStatus`).
// The organization default (`isOrganizationDefault`, PUT `/default`) is
// missing.
// ---------------------------------------------------------------------------

export const getModels = () =>
  axios.get<ModelProjection[]>(MODELS).then(({ data }) => data);

export const getModelById = (modelId: EntityId) =>
  axios
    .get<ModelProjection>(`${MODELS}/${id(modelId)}`)
    .then(({ data }) => data);

export const createModel = (request: ModelRequest) =>
  axios.post<ModelProjection>(MODELS, request).then(({ data }) => data);

export const updateModel = ({
  id: modelId,
  ...request
}: WithId<ModelRequest>) =>
  axios.put<void>(`${MODELS}/${id(modelId)}`, request).then(() => undefined);

export const setDefaultModel = (modelId: EntityId) =>
  axios
    .put<ModelProjection>(`${MODELS}/${id(modelId)}/default`)
    .then(({ data }) => data);

export const deleteModel = (modelId: EntityId) =>
  axios.delete<void>(`${MODELS}/${id(modelId)}`).then(() => undefined);

// ---------------------------------------------------------------------------
// Providers and available models. Real backend: missing. There is no Provider
// resource; `Gateway.spec.provider` is a free string.
// ---------------------------------------------------------------------------

export const getProviders = () =>
  axios.get<Provider[]>(PROVIDERS).then(({ data }) => data);

export const getProviderById = (providerId: EntityId) =>
  axios
    .get<Provider>(`${PROVIDERS}/${id(providerId)}`)
    .then(({ data }) => data);

export const createProvider = (request: ProviderRequest) =>
  axios.post<Provider>(PROVIDERS, request).then(({ data }) => data);

export const updateProvider = ({
  id: providerId,
  ...request
}: WithId<ProviderRequest>) =>
  axios
    .put<void>(`${PROVIDERS}/${id(providerId)}`, request)
    .then(() => undefined);

export const deleteProvider = (providerId: EntityId) =>
  axios.delete<void>(`${PROVIDERS}/${id(providerId)}`).then(() => undefined);

export const getAvailableModels = (providerId: EntityId) =>
  axios
    .get<AvailableModel[]>(`${PROVIDERS}/${id(providerId)}/available-models`)
    .then(({ data }) => data);

// ---------------------------------------------------------------------------
// Agents. Real backend: exists for reads, update and delete; create is
// partial. `/hub/agentic/agents` (Agent CRD): `model` maps to
// `spec.gateways[]`, `skills` to `spec.skillCards[]`; the CRD requires
// `spec.image`, which the form has no field for; `description` and
// `capabilities` have no CRD field.
// ---------------------------------------------------------------------------

export const getAgents = () =>
  axios.get<Agent[]>(AGENTS).then(({ data }) => data);

export const getAgentById = (agentId: EntityId) =>
  axios.get<Agent>(`${AGENTS}/${id(agentId)}`).then(({ data }) => data);

export const createAgent = (request: AgentRequest) =>
  axios.post<Agent>(AGENTS, request).then(({ data }) => data);

export const updateAgent = ({
  id: agentId,
  ...request
}: WithId<AgentRequest>) =>
  axios.put<void>(`${AGENTS}/${id(agentId)}`, request).then(() => undefined);

export const deleteAgent = (agentId: EntityId) =>
  axios.delete<void>(`${AGENTS}/${id(agentId)}`).then(() => undefined);

// ---------------------------------------------------------------------------
// Agent test runs. Real backend: partial. `/hub/agentic/agentruns` (AgentRun
// CRD): `agentId` maps to `spec.agentRef`, the application to the
// `konveyor.io/application` label and `APP_ID` env, `task` to
// `spec.instructions`; the optional `modelId`, `targetBranch` and `params` to
// `spec.gateway`, env `TARGET_BRANCH` and `spec.params` (the prototype API
// ignores them). There is no query parameter filter; filter client-side.
// ---------------------------------------------------------------------------

export const getAgentTestRuns = (agentId?: EntityId) =>
  axios
    .get<AgentTestRun[]>(AGENT_RUNS, {
      params: agentId != null ? { agentId } : undefined,
    })
    .then(({ data }) => data);

export const startAgentTestRun = (request: AgentTestRunRequest) =>
  axios.post<AgentTestRun>(AGENT_RUNS, request).then(({ data }) => data);

// ---------------------------------------------------------------------------
// Plans. Real backend: exists for reads and delete; create and update are
// partial. `/hub/agentic/workflows` (AgentWorkflow CRD):
// stage identity is the stage `name`; `requiresApproval` maps to
// `execution.mode: approve` (per tool call, not per stage). The migration path
// (archetype + target profiles), `effectiveSkills`, `applicationImpact` and
// `runCount` are missing (Hub product vocabulary / Hub-computed views;
// `runCount` can be counted client-side).
// ---------------------------------------------------------------------------

export const getMigrationPlans = () =>
  axios.get<MigrationPlan[]>(PLANS).then(({ data }) => data);

export const getMigrationPlanById = (planId: EntityId) =>
  axios.get<MigrationPlan>(`${PLANS}/${id(planId)}`).then(({ data }) => data);

export const createMigrationPlan = (request: MigrationPlanRequest) =>
  axios.post<MigrationPlan>(PLANS, request).then(({ data }) => data);

export const updateMigrationPlan = ({
  id: planId,
  ...request
}: WithId<MigrationPlanRequest>) =>
  axios.put<void>(`${PLANS}/${id(planId)}`, request).then(() => undefined);

export const deleteMigrationPlan = (planId: EntityId) =>
  axios.delete<void>(`${PLANS}/${id(planId)}`).then(() => undefined);

/**
 * Makes `planId` the default Plan for one target profile of an archetype, in
 * one atomic server-side write (the previous default Plan loses the profile).
 * Real backend: missing (Hub product vocabulary: migration path resolution).
 */
export const assignPlanToTargetProfile = ({
  archetypeId,
  targetProfileId,
  planId,
}: {
  archetypeId: number;
  targetProfileId: number;
  planId: EntityId;
}) =>
  axios
    .put<void>(
      `${ARCHETYPES}/${archetypeId}/target-profiles/${targetProfileId}/plan`,
      { planId }
    )
    .then(() => undefined);

// ---------------------------------------------------------------------------
// Plan runs. Real backend: partial. `/hub/agentic/workflowruns`
// (AgentWorkflowRun CRD, one run per application; no PUT). Stage runs map to
// `status.stages[]` plus the referenced AgentRun; messages come from the ACP
// transcript (WebSocket). The per-stage approve endpoint is missing: approval
// is an ACP `session/request_permission` response, per tool call, inside a
// live session; with nobody attached the harness denies it.
// ---------------------------------------------------------------------------

export const getPlanRuns = (planId?: EntityId) =>
  axios
    .get<PlanRun[]>(PLAN_RUNS, {
      params: planId != null ? { planId } : undefined,
    })
    .then(({ data }) => data);

export const getPlanRunById = (runId: EntityId) =>
  axios.get<PlanRun>(`${PLAN_RUNS}/${id(runId)}`).then(({ data }) => data);

export const approveStageRun = ({
  runId,
  stageId,
}: {
  runId: EntityId;
  stageId: EntityId;
}) =>
  axios
    .post<PlanRun>(`${PLAN_RUNS}/${id(runId)}/stages/${id(stageId)}/approve`)
    .then(({ data }) => data);

// ---------------------------------------------------------------------------
// Application migrations. Real backend: missing. A Hub aggregate per
// application (resolved Plan, preflight, latest run, intervention, effective
// skills). Bulk start maps to one `POST /hub/agentic/workflowruns` per
// application (optional `modelId` and `params` become `spec.gateway` and
// `spec.params`; the prototype API ignores them), but "recommended Plan"
// resolution and preflight are Hub logic. Approve/reject is an ACP permission
// answer inside a live session (see the approve note above).
// ---------------------------------------------------------------------------

export const getApplicationMigrations = (applicationIds: number[]) =>
  axios
    .get<ApplicationMigrationMap>(APPLICATION_MIGRATIONS, {
      params: { applicationIds: applicationIds.join(",") },
    })
    .then(({ data }) => data);

export const startApplicationMigrations = (
  request: StartApplicationMigrationsRequest
) =>
  axios
    .post<StartApplicationMigrationsResponse>(APPLICATION_MIGRATIONS, request)
    .then(({ data }) => data);

export const resolveApplicationMigrationRequest = ({
  applicationId,
  decision,
}: {
  applicationId: number;
  decision: "approve" | "reject";
}) =>
  axios
    .post<ApplicationMigrationView>(
      `${APPLICATION_MIGRATIONS}/${applicationId}/requests/current`,
      { decision }
    )
    .then(({ data }) => data);

// ---------------------------------------------------------------------------
// Execution policy. Real backend: missing. No org-wide policy object; the
// controller has a per-stage / per-run `execution.mode: auto | approve`. No
// hook or page uses these two functions.
// ---------------------------------------------------------------------------

export const getExecutionPolicy = () =>
  axios.get<ExecutionPolicy>(EXECUTION_POLICY).then(({ data }) => data);

export const updateExecutionPolicy = (policy: ExecutionPolicy) =>
  axios.put<ExecutionPolicy>(EXECUTION_POLICY, policy).then(({ data }) => data);
