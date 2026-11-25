/**
 * Configuration side of the agentic mock server: Skills, Skill collections,
 * Models, Providers, Agents, Plans and Agent test runs.
 *
 * Every write validates the whole request first (400 for invalid payloads,
 * 409 for duplicate names), then mutates. Deletes of an entity that is still
 * referenced fail with 409 and a message; allowed deletes cascade so no
 * dangling reference is left behind. Ref names are resolved on read.
 */
import {
  Agent,
  AgentParameter,
  AgentTestRun,
  EntityId,
  ExecutionPolicy,
  HubSkillAssociationScope,
  MigrationPathAssociation,
  MigrationPlan,
  ModelProjection,
  PlanStage,
  Provider,
  ProviderType,
  ResolvePlanSkillsResponse,
  Skill,
  SkillCollection,
  SkillLoadPolicy,
  SkillPlansResponse,
  SkillSourceType,
} from "@app/agentic";

import {
  Body,
  StoredPlan,
  StoredSkill,
  agentsUsingSkill,
  asBody,
  assertExists,
  assertUniqueName,
  badRequest,
  collectionsContainingSkill,
  conflict,
  db,
  entityIdOf,
  findApplication,
  findArchetype,
  findHubResourceName,
  findOr404,
  findTargetProfile,
  hubIdOf,
  isSeeded,
  listNames,
  nextId,
  notFound,
  nowIso,
  observeVerification,
  optionalArray,
  optionalString,
  requiredArray,
  requiredString,
  resolveAgentRef,
  resolveCollectionRef,
  resolveCredential,
  resolveModelRef,
  resolveProviderRef,
  resolveSkillRef,
  skillAssociations,
  startVerification,
} from "./db";
import { planApplications, planImpact, runsUsingPlan } from "./execution";
import {
  ResolutionContext,
  excludedSkillIdsOf,
  placementsOf,
  planContextOf,
  resolveSkillsByStage,
  resolvedSkillIds,
  stagesOfPlan,
  targetProfilePickOf,
} from "./skill-resolution";

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

const name = (body: Body, label: string) => {
  const value = requiredString(body, "name", `${label} name`);
  if (value.length > NAME_MAX) {
    throw badRequest(`${label} name must be at most ${NAME_MAX} characters.`);
  }
  return value;
};

const description = (body: Body, label: string) => {
  const value = optionalString(body, "description") ?? "";
  if (value.length > DESCRIPTION_MAX) {
    throw badRequest(
      `${label} description must be at most ${DESCRIPTION_MAX} characters.`
    );
  }
  return value;
};

const entityIds = (
  values: unknown[],
  field: string,
  items: { id: EntityId }[],
  label: string
): EntityId[] => {
  const ids = values.map((value) => entityIdOf(value, field));
  ids.forEach((id) => assertExists(items, id, label));
  return [...new Set(ids)];
};

const isValidUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const SOURCE_TYPES: SkillSourceType[] = ["inline", "git", "oci"];
const LOAD_POLICIES: SkillLoadPolicy[] = ["rule", "skill"];
const HUB_SCOPES: HubSkillAssociationScope[] = [
  "archetype",
  "targetProfile",
  "application",
];

export const presentSkill = (skill: StoredSkill): Skill => ({
  ...skill,
  associations: skillAssociations(skill),
});

export const listSkills = () => db.skills.map(presentSkill);

export const getSkill = (id: EntityId) =>
  presentSkill(findOr404(db.skills, id, "Skill"));

interface ParsedSkill {
  fields: Omit<StoredSkill, "id" | "createTime" | "updateTime">;
  agentIds: EntityId[];
}

const parseSkill = (input: unknown, selfId?: EntityId): ParsedSkill => {
  const body = asBody(input);
  const skillName = name(body, "Skill");
  assertUniqueName(db.skills, skillName, "Skill", selfId);
  const sourceType = body.sourceType as SkillSourceType;
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw badRequest('sourceType must be "inline", "git" or "oci".');
  }
  const repoUrl = optionalString(body, "repoUrl");
  const imageRef = optionalString(body, "imageRef");
  if (sourceType === "git" && (repoUrl == null || repoUrl.trim() === "")) {
    throw badRequest("repoUrl is required for a git Skill.");
  }
  if (sourceType === "oci" && (imageRef == null || imageRef.trim() === "")) {
    throw badRequest("imageRef is required for an OCI Skill.");
  }
  const loadPolicy = body.loadPolicy as SkillLoadPolicy | undefined;
  if (loadPolicy != null && !LOAD_POLICIES.includes(loadPolicy)) {
    throw badRequest('loadPolicy must be "rule" or "skill".');
  }
  const agentIds: EntityId[] = [];
  const associations: StoredSkill["associations"] = [];
  optionalArray(body, "associations").forEach((value, index) => {
    const association = asBody(value);
    const field = `associations[${index}].resource`;
    if (association.scope === "agent") {
      const agentId = entityIdOf(association.resource, field);
      assertExists(db.agents, agentId, "Agent");
      agentIds.push(agentId);
      return;
    }
    const scope = association.scope as HubSkillAssociationScope;
    if (!HUB_SCOPES.includes(scope)) {
      throw badRequest(`associations[${index}].scope is not a valid scope.`);
    }
    const id = hubIdOf(association.resource, field);
    const resourceName = findHubResourceName(scope, id);
    if (resourceName == null) {
      throw badRequest(`${field}: ${scope} "${id}" does not exist.`);
    }
    if (!associations.some((a) => a.scope === scope && a.resource.id === id)) {
      associations.push({ scope, resource: { id, name: resourceName } });
    }
  });
  return {
    fields: {
      name: skillName,
      description: description(body, "Skill"),
      sourceType,
      content:
        sourceType === "inline" ? optionalString(body, "content") : undefined,
      repoUrl: sourceType === "git" ? repoUrl : undefined,
      repoBranch:
        sourceType === "git" ? optionalString(body, "repoBranch") : undefined,
      repoPath:
        sourceType === "git" ? optionalString(body, "repoPath") : undefined,
      imageRef: sourceType === "oci" ? imageRef : undefined,
      ...(loadPolicy != null ? { loadPolicy } : {}),
      associations,
    },
    agentIds: [...new Set(agentIds)],
  };
};

/** Agents are the source of truth for agent-scope links: make them match. */
const linkSkillToAgents = (skill: StoredSkill, agentIds: EntityId[]) => {
  db.agents.forEach((agent) => {
    const has = agent.skills.some((s) => s.id === skill.id);
    const wants = agentIds.includes(agent.id);
    if (wants && !has) {
      agent.skills.push({ id: skill.id, name: skill.name });
    } else if (!wants && has) {
      agent.skills = agent.skills.filter((s) => s.id !== skill.id);
    }
  });
};

export const createSkill = (input: unknown) => {
  const { fields, agentIds } = parseSkill(input);
  const time = nowIso();
  const skill: StoredSkill = {
    id: nextId("skills"),
    // Absent means "skill" (the CRD default); reads always carry it.
    loadPolicy: "skill",
    ...fields,
    createTime: time,
    updateTime: time,
  };
  db.skills.push(skill);
  linkSkillToAgents(skill, agentIds);
  return presentSkill(skill);
};

export const updateSkill = (id: EntityId, input: unknown) => {
  const skill = findOr404(db.skills, id, "Skill");
  // A body without loadPolicy keeps the stored one (forms that do not edit
  // it yet must not reset it).
  const { fields, agentIds } = parseSkill(input, id);
  Object.assign(skill, fields, { updateTime: nowIso() });
  linkSkillToAgents(skill, agentIds);
};

export const deleteSkill = (id: EntityId) => {
  const skill = findOr404(db.skills, id, "Skill");
  const agents = agentsUsingSkill(id);
  if (agents.length > 0) {
    throw conflict(
      `Skill "${skill.name}" is used by ${agents.length} Agent(s): ${listNames(agents.map((a) => a.name))}. Remove it from those Agents first.`
    );
  }
  const collections = collectionsContainingSkill(id);
  if (collections.length > 0) {
    throw conflict(
      `Skill "${skill.name}" is a member of ${collections.length} Skill collection(s): ${listNames(collections.map((c) => c.name))}. Remove it from those collections first.`
    );
  }
  db.skills = db.skills.filter((candidate) => candidate.id !== id);
};

// ---------------------------------------------------------------------------
// Skill collections
// ---------------------------------------------------------------------------

export const presentCollection = (
  collection: SkillCollection
): SkillCollection => ({
  ...collection,
  skills: collection.skills.map(resolveSkillRef),
});

export const listSkillCollections = () =>
  db.skillCollections.map(presentCollection);

export const getSkillCollection = (id: EntityId) =>
  presentCollection(findOr404(db.skillCollections, id, "Skill collection"));

const parseCollection = (input: unknown, selfId?: EntityId) => {
  const body = asBody(input);
  const collectionName = name(body, "Skill collection");
  assertUniqueName(
    db.skillCollections,
    collectionName,
    "Skill collection",
    selfId
  );
  const skillIds = entityIds(
    requiredArray(body, "skills"),
    "skills",
    db.skills,
    "Skill"
  );
  return {
    name: collectionName,
    description: description(body, "Skill collection"),
    skills: skillIds.map((skillId) =>
      resolveSkillRef({ id: skillId, name: "" })
    ),
  };
};

export const createSkillCollection = (input: unknown) => {
  const collection: SkillCollection = {
    id: nextId("skillCollections"),
    ...parseCollection(input),
  };
  db.skillCollections.push(collection);
  return presentCollection(collection);
};

export const updateSkillCollection = (id: EntityId, input: unknown) => {
  const collection = findOr404(db.skillCollections, id, "Skill collection");
  Object.assign(collection, parseCollection(input, id));
};

/** Agents keep working without the collection: remove it from them. */
export const deleteSkillCollection = (id: EntityId) => {
  findOr404(db.skillCollections, id, "Skill collection");
  db.agents.forEach((agent) => {
    agent.skillCollections = (agent.skillCollections ?? []).filter(
      (ref) => ref.id !== id
    );
  });
  db.skillCollections = db.skillCollections.filter((c) => c.id !== id);
};

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const presentModel = (model: ModelProjection): ModelProjection => ({
  ...observeVerification("models", model),
  provider: resolveProviderRef(model.provider),
});

export const listModels = () => db.models.map(presentModel);

export const getModel = (id: EntityId) =>
  presentModel(findOr404(db.models, id, "Model"));

const parseModel = (input: unknown, selfId?: EntityId) => {
  const body = asBody(input);
  const modelName = name(body, "Model");
  assertUniqueName(db.models, modelName, "Model", selfId);
  const providerId = entityIdOf(body.provider, "provider");
  assertExists(db.providers, providerId, "Provider");
  const endpoint = optionalString(body, "endpoint");
  if (endpoint != null && endpoint !== "" && !isValidUrl(endpoint)) {
    throw badRequest("endpoint must be an http(s) URL.");
  }
  return {
    name: modelName,
    description: description(body, "Model"),
    provider: resolveProviderRef({ id: providerId, name: "" }),
    model: requiredString(body, "model", "Model ID"),
    endpoint: endpoint || undefined,
    credential:
      body.credential != null
        ? resolveCredential(hubIdOf(body.credential, "credential"))
        : undefined,
  };
};

export const createModel = (input: unknown) => {
  const fields = parseModel(input);
  const model: ModelProjection = {
    id: nextId("models"),
    ...fields,
    verificationStatus: "pending",
    isOrganizationDefault: db.models.length === 0,
  };
  startVerification("models", model);
  db.models.push(model);
  return presentModel(model);
};

export const updateModel = (id: EntityId, input: unknown) => {
  const model = findOr404(db.models, id, "Model");
  Object.assign(model, parseModel(input, id));
  startVerification("models", model);
};

export const setDefaultModel = (id: EntityId) => {
  const model = findOr404(db.models, id, "Model");
  db.models.forEach((candidate) => {
    candidate.isOrganizationDefault = candidate.id === id;
  });
  return presentModel(model);
};

export const deleteModel = (id: EntityId) => {
  const model = findOr404(db.models, id, "Model");
  if (model.isOrganizationDefault) {
    throw conflict("Choose another default Model first.");
  }
  const agents = db.agents.filter((agent) => agent.model.id === id);
  if (agents.length > 0) {
    throw conflict(
      `Model "${model.name}" is used by ${agents.length} Agent(s): ${listNames(agents.map((a) => a.name))}. Assign those Agents another Model first.`
    );
  }
  db.models = db.models.filter((candidate) => candidate.id !== id);
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const PROVIDER_TYPES: ProviderType[] = [
  "anthropic",
  "azure_openai",
  "vertex",
  "ollama",
  "openai",
  "other",
];

export const presentProvider = (provider: Provider): Provider =>
  observeVerification("providers", provider);

export const listProviders = () => db.providers.map(presentProvider);

export const getProvider = (id: EntityId) =>
  presentProvider(findOr404(db.providers, id, "Provider"));

const parseProvider = (input: unknown, selfId?: EntityId) => {
  const body = asBody(input);
  const providerName = name(body, "Provider");
  assertUniqueName(db.providers, providerName, "Provider", selfId);
  const providerType = body.providerType as ProviderType;
  if (!PROVIDER_TYPES.includes(providerType)) {
    throw badRequest("providerType is not a supported provider type.");
  }
  const endpoint = requiredString(body, "endpoint", "Endpoint");
  if (!isValidUrl(endpoint)) {
    throw badRequest("endpoint must be an http(s) URL.");
  }
  return {
    name: providerName,
    description: description(body, "Provider"),
    providerType,
    endpoint,
    credential:
      body.credential != null
        ? resolveCredential(hubIdOf(body.credential, "credential"))
        : undefined,
  };
};

export const createProvider = (input: unknown) => {
  const provider: Provider = {
    id: nextId("providers"),
    ...parseProvider(input),
    verificationStatus: "pending",
  };
  startVerification("providers", provider);
  db.providers.push(provider);
  return presentProvider(provider);
};

export const updateProvider = (id: EntityId, input: unknown) => {
  const provider = findOr404(db.providers, id, "Provider");
  Object.assign(provider, parseProvider(input, id));
  delete provider.lastVerified;
  startVerification("providers", provider);
};

export const deleteProvider = (id: EntityId) => {
  const provider = findOr404(db.providers, id, "Provider");
  const models = db.models.filter((model) => model.provider.id === id);
  if (models.length > 0) {
    throw conflict(
      `Provider "${provider.name}" is used by ${models.length} Model(s): ${listNames(models.map((m) => m.name))}. Delete or reassign those Models first.`
    );
  }
  db.providers = db.providers.filter((candidate) => candidate.id !== id);
};

export const getAvailableModels = (
  id: EntityId,
  catalog: Record<ProviderType, { id: string; displayName: string }[]>
) => catalog[findOr404(db.providers, id, "Provider").providerType] ?? [];

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const presentAgent = (agent: Agent): Agent => ({
  ...agent,
  model: resolveModelRef(agent.model),
  skills: agent.skills.map(resolveSkillRef),
  skillCollections: (agent.skillCollections ?? []).map(resolveCollectionRef),
});

export const listAgents = () => db.agents.map(presentAgent);

export const getAgent = (id: EntityId) =>
  presentAgent(findOr404(db.agents, id, "Agent"));

const PARAMETER_TYPES: AgentParameter["type"][] = [
  "string",
  "number",
  "boolean",
];

const parseParameters = (values: unknown[]): AgentParameter[] => {
  const parameters = values.map((value, index) => {
    const body = asBody(value);
    const parameterName = requiredString(
      body,
      "name",
      `parameters[${index}].name`
    );
    const type = body.type as AgentParameter["type"];
    if (!PARAMETER_TYPES.includes(type)) {
      throw badRequest(`parameters[${index}].type is not a valid type.`);
    }
    const defaultValue = optionalString(body, "defaultValue");
    if (
      defaultValue != null &&
      defaultValue !== "" &&
      ((type === "number" && !Number.isFinite(Number(defaultValue))) ||
        (type === "boolean" && !["true", "false"].includes(defaultValue)))
    ) {
      throw badRequest(
        `parameters[${index}].defaultValue is not a valid ${type}.`
      );
    }
    return {
      name: parameterName,
      type,
      description: optionalString(body, "description") ?? "",
      ...(defaultValue != null && defaultValue !== "" ? { defaultValue } : {}),
    };
  });
  const names = parameters.map((parameter) => parameter.name);
  const duplicate = names.find((n, index) => names.indexOf(n) !== index);
  if (duplicate != null) {
    throw badRequest(`Parameter "${duplicate}" is defined more than once.`);
  }
  return parameters;
};

const parseAgent = (input: unknown, selfId?: EntityId) => {
  const body = asBody(input);
  const agentName = name(body, "Agent");
  assertUniqueName(db.agents, agentName, "Agent", selfId);
  const modelId = entityIdOf(body.model, "model");
  assertExists(db.models, modelId, "Model");
  const skillIds = entityIds(
    optionalArray(body, "skills"),
    "skills",
    db.skills,
    "Skill"
  );
  const collectionIds = entityIds(
    optionalArray(body, "skillCollections"),
    "skillCollections",
    db.skillCollections,
    "Skill collection"
  );
  const capabilities = optionalArray(body, "capabilities");
  if (!capabilities.every((c): c is string => typeof c === "string")) {
    throw badRequest("capabilities must be strings.");
  }
  return {
    name: agentName,
    description: description(body, "Agent"),
    model: resolveModelRef({ id: modelId, name: "" }),
    skills: skillIds.map((id) => resolveSkillRef({ id, name: "" })),
    skillCollections: collectionIds.map((id) =>
      resolveCollectionRef({ id, name: "" })
    ),
    prompt: optionalString(body, "prompt") ?? "",
    capabilities,
    parameters: parseParameters(optionalArray(body, "parameters")),
  };
};

export const createAgent = (input: unknown) => {
  const time = nowIso();
  const agent: Agent = {
    id: nextId("agents"),
    ...parseAgent(input),
    createTime: time,
    updateTime: time,
  };
  db.agents.push(agent);
  return presentAgent(agent);
};

export const updateAgent = (id: EntityId, input: unknown) => {
  const agent = findOr404(db.agents, id, "Agent");
  Object.assign(agent, parseAgent(input, id), { updateTime: nowIso() });
};

/**
 * 409 while a Plan stage uses the Agent. Otherwise the Agent's Skill links go
 * with it (they live on the Agent), so no Skill keeps a dangling association.
 */
export const deleteAgent = (id: EntityId) => {
  const agent = findOr404(db.agents, id, "Agent");
  const plans = db.plans.filter((plan) =>
    plan.stages.some((stage) => stage.agent.id === id)
  );
  if (plans.length > 0) {
    throw conflict(
      `Agent "${agent.name}" is used by ${plans.length} Plan(s): ${listNames(plans.map((p) => p.name))}. Remove it from those Plans first.`
    );
  }
  db.agents = db.agents.filter((candidate) => candidate.id !== id);
};

// ---------------------------------------------------------------------------
// Agent test runs (Running for 3 s, then Succeeded)
// ---------------------------------------------------------------------------

const TEST_RUN_MS = 3000;

const presentTestRun = (run: AgentTestRun): AgentTestRun => {
  if (
    run.phase === "Running" &&
    Date.now() - Date.parse(run.startedAt) >= TEST_RUN_MS
  ) {
    run.phase = "Succeeded";
  }
  return {
    ...run,
    agent: resolveAgentRef(run.agent),
    ...(run.addedSkills != null && {
      addedSkills: run.addedSkills.map(resolveSkillRef),
    }),
  };
};

export const listAgentTestRuns = (agentId?: EntityId | null) =>
  db.agentTestRuns
    .filter((run) => agentId == null || run.agent.id === agentId)
    .map(presentTestRun);

export const startAgentTestRun = (input: unknown) => {
  const body = asBody(input);
  const agentId = body.agentId;
  if (typeof agentId !== "string" || agentId === "") {
    throw badRequest("agentId is required.");
  }
  const applicationId = body.applicationId;
  if (typeof applicationId !== "number") {
    throw badRequest("applicationId is required.");
  }
  const task = requiredString(body, "task", "Task");
  const agent = db.agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw badRequest(`Agent "${agentId}" does not exist.`);
  const application = findApplication(applicationId);
  if (!application) {
    throw badRequest(`Application "${applicationId}" does not exist.`);
  }
  // Added for this run only: the Agent keeps its own skills.
  const addedSkillIds = entityIds(
    optionalArray(body, "addedSkills"),
    "addedSkills",
    db.skills,
    "Skill"
  );
  const run: AgentTestRun = {
    id: nextId("agentTestRuns"),
    agent: { id: agent.id, name: agent.name },
    application: { id: application.id, name: application.name },
    task,
    phase: "Running",
    startedAt: nowIso(),
    ...(addedSkillIds.length > 0 && {
      addedSkills: addedSkillIds.map((id) => resolveSkillRef({ id, name: "" })),
    }),
  };
  db.agentTestRuns.push(run);
  return presentTestRun(run);
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/**
 * PUT /archetypes/:archetypeId/target-profiles/:profileId/plan. Atomically
 * makes the Plan the default for the target profile: the previous default Plan
 * loses the profile, the selected Plan gains it (and the archetype).
 */
export const assignPlanToTargetProfile = (
  archetypeId: number,
  targetProfileId: number,
  input: unknown
) => {
  const body = asBody(input);
  const planId = body.planId;
  if (typeof planId !== "string" || planId === "") {
    throw badRequest("planId is required.");
  }
  const archetype = findArchetype(archetypeId);
  if (!archetype) throw notFound(`Archetype "${archetypeId}" not found.`);
  const profile = archetype.profiles?.find((p) => p.id === targetProfileId);
  if (!profile) {
    throw notFound(
      `Target profile "${targetProfileId}" not found in archetype "${archetype.name}".`
    );
  }
  const selected = db.plans.find((plan) => plan.id === planId);
  if (!selected) throw badRequest(`Plan "${planId}" does not exist.`);

  const time = nowIso();
  db.plans.forEach((plan) => {
    if (
      plan.id !== selected.id &&
      plan.migrationPath?.archetype.id === archetypeId &&
      plan.migrationPath.isDefault &&
      plan.migrationPath.targetProfiles.some((p) => p.id === targetProfileId)
    ) {
      // The previous default gives up this profile but keeps its migration
      // path: it stays the default for its other profiles, or, when this was
      // its only profile, stays associated with it as a non-default Plan.
      const remaining = plan.migrationPath.targetProfiles.filter(
        (p) => p.id !== targetProfileId
      );
      plan.migrationPath =
        remaining.length > 0
          ? { ...plan.migrationPath, targetProfiles: remaining }
          : { ...plan.migrationPath, isDefault: false };
      plan.updateTime = time;
    }
  });
  const keep =
    selected.migrationPath?.archetype.id === archetypeId
      ? selected.migrationPath.targetProfiles.filter(
          (p) => p.id !== targetProfileId
        )
      : [];
  selected.migrationPath = {
    archetype: { id: archetype.id, name: archetype.name },
    targetProfiles: [...keep, { id: profile.id, name: profile.name }],
    isDefault: true,
  };
  selected.updateTime = time;
};

/** Excluded Skills that still exist, with current names. */
const presentExcludedSkills = (plan: StoredPlan) => {
  const refs = (plan.excludedSkills ?? [])
    .filter((ref) => db.skills.some((skill) => skill.id === ref.id))
    .map(resolveSkillRef);
  return refs.length > 0 ? { excludedSkills: refs } : {};
};

const withoutExcludedSkills = ({
  excludedSkills: _excludedSkills,
  ...plan
}: StoredPlan) => plan;

/** A saved Plan's preview resolution (no applications). */
const planPreview = (plan: StoredPlan) =>
  resolveSkillsByStage({
    stages: stagesOfPlan(plan),
    context: planContextOf(plan),
    excludedSkillIds: excludedSkillIdsOf(plan),
  });

export const presentPlan = (plan: StoredPlan): MigrationPlan => ({
  ...withoutExcludedSkills(plan),
  stages: plan.stages.map((stage) => ({
    ...stage,
    agent: resolveAgentRef(stage.agent),
  })),
  migrationPath: plan.migrationPath
    ? {
        ...plan.migrationPath,
        archetype: {
          id: plan.migrationPath.archetype.id,
          name:
            findArchetype(plan.migrationPath.archetype.id)?.name ??
            plan.migrationPath.archetype.name,
        },
        // Profiles deleted from the archetype (a Hub write) drop out.
        targetProfiles: plan.migrationPath.targetProfiles.flatMap((profile) => {
          const current = findTargetProfile(profile.id);
          return current
            ? [{ id: profile.id, name: current.profile.name }]
            : [];
        }),
      }
    : undefined,
  ...presentExcludedSkills(plan),
  applicationImpact: {
    matching: planImpact(plan.id),
    applications: planApplications(plan.id),
  },
  runCount: runsUsingPlan(plan.id).length,
});

export const listPlans = () => db.plans.map(presentPlan);

export const getPlan = (id: EntityId) =>
  presentPlan(findOr404(db.plans, id, "Plan"));

const parseMigrationPath = (value: unknown): MigrationPathAssociation => {
  const body = asBody(value);
  const archetypeId = hubIdOf(body.archetype, "migrationPath.archetype");
  const archetype = findArchetype(archetypeId);
  if (!archetype) {
    throw badRequest(`Archetype "${archetypeId}" does not exist.`);
  }
  const requestedProfiles = requiredArray(body, "targetProfiles");
  if (requestedProfiles.length === 0) {
    throw badRequest("migrationPath.targetProfiles must not be empty.");
  }
  const profiles = requestedProfiles.map((profile) => {
    const id = hubIdOf(profile, "migrationPath.targetProfiles");
    const match = archetype.profiles?.find((candidate) => candidate.id === id);
    if (!match) {
      throw badRequest(
        `Target profile "${id}" does not belong to archetype "${archetype.name}".`
      );
    }
    return { id: match.id, name: match.name };
  });
  return {
    archetype: { id: archetype.id, name: archetype.name },
    targetProfiles: profiles,
    isDefault: body.isDefault === true,
  };
};

/**
 * One default Plan per target profile: a default path may not cover a profile
 * that another Plan already defaults. Moving the default is an explicit
 * action (`assignPlanToTargetProfile`).
 */
const assertSingleDefault = (
  path: MigrationPathAssociation,
  planId?: EntityId
) => {
  if (!path.isDefault) return;
  path.targetProfiles.forEach((profile) => {
    const owner = db.plans.find(
      (plan) =>
        plan.id !== planId &&
        plan.migrationPath?.isDefault === true &&
        plan.migrationPath.archetype.id === path.archetype.id &&
        plan.migrationPath.targetProfiles.some((p) => p.id === profile.id)
    );
    if (owner) {
      throw conflict(
        `Plan "${owner.name}" is already the default Plan for target profile "${profile.name}". Assign the Plan to the target profile to change its default.`
      );
    }
  });
};

/** Ids of the request's `excludedSkills` (shape only), deduplicated. */
const excludedSkillIds = (body: Body): EntityId[] => [
  ...new Set(
    optionalArray(body, "excludedSkills").map((value, index) =>
      entityIdOf(value, `excludedSkills[${index}]`)
    )
  ),
];

const parsePlan = (input: unknown, existing?: StoredPlan) => {
  const body = asBody(input);
  const planName = name(body, "Plan");
  assertUniqueName(db.plans, planName, "Plan", existing?.id);
  const requestedStages = requiredArray(body, "stages");
  if (requestedStages.length === 0) {
    throw badRequest("A Plan needs at least one stage.");
  }
  const stages = requestedStages.map((value, index) => {
    const stage = asBody(value);
    const agentId = entityIdOf(stage.agent, `stages[${index}].agent`);
    assertExists(db.agents, agentId, "Agent");
    return {
      requestedId: typeof stage.id === "string" ? stage.id : undefined,
      name: requiredString(stage, "name", `stages[${index}].name`),
      agentId,
      instructions: optionalString(stage, "instructions") ?? "",
      requiresApproval: stage.requiresApproval === true,
    };
  });
  const migrationPath =
    body.migrationPath != null
      ? parseMigrationPath(body.migrationPath)
      : undefined;
  if (migrationPath) assertSingleDefault(migrationPath, existing?.id);
  // An id that is not a Skill matches nothing, so it is dropped, as the
  // resolver and the reads do (a skill deleted after the wizard resolved).
  const excludedSkills = excludedSkillIds(body)
    .filter((skillId) => db.skills.some((skill) => skill.id === skillId))
    .map((skillId) => resolveSkillRef({ id: skillId, name: "" }));
  return {
    name: planName,
    description: description(body, "Plan"),
    migrationPath,
    stages,
    excludedSkills,
  };
};

/**
 * Stage ids are server-owned and stable: a stage sent with the id of one of
 * this Plan's stages keeps it; any other stage gets a new id.
 */
const buildStages = (
  parsed: ReturnType<typeof parsePlan>["stages"],
  existing?: StoredPlan
): PlanStage[] => {
  const kept = new Set<EntityId>();
  return parsed.map((stage, index) => {
    const reuse =
      stage.requestedId != null &&
      !kept.has(stage.requestedId) &&
      existing?.stages.some((s) => s.id === stage.requestedId);
    const id =
      reuse && stage.requestedId != null ? stage.requestedId : nextId("stages");
    kept.add(id);
    return {
      id,
      name: stage.name,
      agent: resolveAgentRef({ id: stage.agentId, name: "" }),
      instructions: stage.instructions,
      requiresApproval: stage.requiresApproval,
      order: index + 1,
    };
  });
};

export const createPlan = (input: unknown) => {
  const parsed = parsePlan(input);
  const time = nowIso();
  const plan: StoredPlan = {
    id: nextId("plans"),
    name: parsed.name,
    description: parsed.description,
    migrationPath: parsed.migrationPath,
    stages: buildStages(parsed.stages),
    ...(parsed.excludedSkills.length > 0
      ? { excludedSkills: parsed.excludedSkills }
      : {}),
    createTime: time,
    updateTime: time,
  };
  db.plans.push(plan);
  return presentPlan(plan);
};

export const updatePlan = (id: EntityId, input: unknown) => {
  const plan = findOr404(db.plans, id, "Plan");
  const parsed = parsePlan(input, plan);
  Object.assign(plan, {
    name: parsed.name,
    description: parsed.description,
    migrationPath: parsed.migrationPath,
    stages: buildStages(parsed.stages, plan),
    updateTime: nowIso(),
  });
  if (parsed.excludedSkills.length > 0) {
    plan.excludedSkills = parsed.excludedSkills;
  } else {
    delete plan.excludedSkills;
  }
};

/**
 * POST /plans/skills/resolve: what each stage of a draft Plan gets
 * (`resolveSkillsByStage`), for the plan wizard and plan pages. Without
 * `applications` it is the plan preview (context from the draft's
 * migration path); with them, one `everyStage` group per application from
 * its own context, with the target profile each application's entry picks
 * (`targetProfile`: absent, its default; null, none). Malformed bodies are a
 * 400, and so is a pick that is not a profile of the application's
 * archetypes; ids that reference nothing (an agent, archetype, target
 * profile, application or Skill deleted meanwhile, or a draft still being
 * edited) add nothing, unlike a save, which rejects unknown agents.
 */
export const resolvePlanSkills = (
  input: unknown
): ResolvePlanSkillsResponse => {
  const body = asBody(input);
  const stages = requiredArray(body, "stages").map((value, index) => {
    const stage = asBody(value);
    return {
      agentId: entityIdOf(stage.agent, `stages[${index}].agent`),
      name: optionalString(stage, "name") || `Stage ${index + 1}`,
    };
  });
  let context: ResolutionContext = { kind: "plan", targetProfileIds: [] };
  if (body.migrationPath != null) {
    const path = asBody(body.migrationPath);
    context = {
      kind: "plan",
      archetypeId: hubIdOf(path.archetype, "migrationPath.archetype"),
      targetProfileIds: optionalArray(path, "targetProfiles").map((profile) =>
        hubIdOf(profile, "migrationPath.targetProfiles")
      ),
    };
  }
  // An empty list is the same as none: the plan preview.
  const applications = optionalArray(body, "applications");
  if (applications.length > 0) {
    const targetProfileIds = new Map<number, number | null>();
    const applicationIdsSeen = new Set<number>();
    const applicationIds = applications.map((value, index) => {
      const applicationId = hubIdOf(value, `applications[${index}]`);
      // An unknown application adds nothing, so its pick is not checked.
      const application = findApplication(applicationId);
      const pick =
        application != null
          ? targetProfilePickOf(
              asBody(value).targetProfile,
              application,
              `applications[${index}].targetProfile`
            )
          : undefined;
      // A repeated application keeps its first entry's pick.
      if (pick !== undefined && !applicationIdsSeen.has(applicationId)) {
        targetProfileIds.set(applicationId, pick);
      }
      applicationIdsSeen.add(applicationId);
      return applicationId;
    });
    context = { kind: "applications", applicationIds, targetProfileIds };
  }
  const resolution = resolveSkillsByStage({
    stages,
    context,
    excludedSkillIds: new Set(excludedSkillIds(body)),
  });
  return resolution;
};

/**
 * GET /skills/:id/plans: every saved Plan whose preview resolution (the same
 * resolver as POST /plans/skills/resolve, without applications) lists the
 * Skill, with where it sits (`placements`: per stage, and every stage), in
 * plan name order. 404 for an unknown
 * Skill. `hideSeeded` (the `initial` scenario) treats fixture Skills and
 * Plans as absent, as the list and detail reads do.
 */
export const listSkillPlans = (
  skillId: EntityId,
  { hideSeeded = false }: { hideSeeded?: boolean } = {}
): SkillPlansResponse => {
  const skill = findOr404(db.skills, skillId, "Skill");
  if (hideSeeded && isSeeded("skills", skill.id)) {
    throw notFound("Not found.");
  }
  return {
    plans: db.plans
      .filter((plan) => !(hideSeeded && isSeeded("plans", plan.id)))
      .flatMap((plan) => {
        const resolution = planPreview(plan);
        if (!resolvedSkillIds(resolution).has(skill.id)) return [];
        return [
          {
            plan: { id: plan.id, name: plan.name },
            placements: placementsOf(resolution, skill.id),
          },
        ];
      })
      .sort((a, b) => a.plan.name.localeCompare(b.plan.name)),
  };
};

export const deletePlan = (id: EntityId) => {
  const plan = findOr404(db.plans, id, "Plan");
  const runs = runsUsingPlan(id);
  if (runs.length > 0) {
    throw conflict(
      `Plan "${plan.name}" is used by ${runs.length} plan run(s). Plans with runs cannot be deleted.`
    );
  }
  db.plans = db.plans.filter((candidate) => candidate.id !== id);
};

// ---------------------------------------------------------------------------
// Associations edited from the other side
//
// Each PUT replaces one entity's set and edits the rows the existing
// endpoints read: Hub-scope rows on `StoredSkill.associations`, members on
// `SkillCollection.skills`, collections on `Agent.skillCollections`. So the
// next GET of skills, collections, agents, plans or application migrations
// shows the change. Validation runs completely before any mutation.
// ---------------------------------------------------------------------------

/**
 * Which Skills a caller can see. The handlers pass the same rule their GET
 * /skills applies (the `initial` scenario hides fixture Skills), so a write
 * can neither reference nor change a Skill that the read does not return.
 */
type SkillVisibility = (skillId: EntityId) => boolean;

/** Makes `skillIds` exactly the visible Skills associated with one Hub entity. */
const replaceHubScopeSkills = (
  scope: HubSkillAssociationScope,
  resourceId: number,
  input: unknown,
  isVisible: SkillVisibility
) => {
  const visibleSkills = db.skills.filter((skill) => isVisible(skill.id));
  const skillIds = entityIds(
    requiredArray(asBody(input), "skills"),
    "skills",
    visibleSkills,
    "Skill"
  );
  const resourceName = findHubResourceName(scope, resourceId) ?? "";
  visibleSkills.forEach((skill) => {
    const has = skill.associations.some(
      (a) => a.scope === scope && a.resource.id === resourceId
    );
    const wants = skillIds.includes(skill.id);
    if (wants && !has) {
      skill.associations.push({
        scope,
        resource: { id: resourceId, name: resourceName },
      });
    } else if (!wants && has) {
      skill.associations = skill.associations.filter(
        (a) => !(a.scope === scope && a.resource.id === resourceId)
      );
    }
  });
};

/** PUT /archetypes/:archetypeId/skills */
export const updateArchetypeSkills = (
  archetypeId: number,
  input: unknown,
  isVisible: SkillVisibility
) => {
  if (!findArchetype(archetypeId)) {
    throw notFound(`Archetype "${archetypeId}" not found.`);
  }
  replaceHubScopeSkills("archetype", archetypeId, input, isVisible);
};

/** PUT /archetypes/:archetypeId/target-profiles/:profileId/skills */
export const updateTargetProfileSkills = (
  archetypeId: number,
  targetProfileId: number,
  input: unknown,
  isVisible: SkillVisibility
) => {
  const archetype = findArchetype(archetypeId);
  if (!archetype) throw notFound(`Archetype "${archetypeId}" not found.`);
  if (!archetype.profiles?.some((p) => p.id === targetProfileId)) {
    throw notFound(
      `Target profile "${targetProfileId}" not found in archetype "${archetype.name}".`
    );
  }
  replaceHubScopeSkills("targetProfile", targetProfileId, input, isVisible);
};

/** PUT /applications/:applicationId/skills */
export const updateApplicationSkills = (
  applicationId: number,
  input: unknown,
  isVisible: SkillVisibility
) => {
  if (!findApplication(applicationId)) {
    throw notFound(`Application "${applicationId}" not found.`);
  }
  replaceHubScopeSkills("application", applicationId, input, isVisible);
};

/**
 * PUT /skills/:id/collections. Adds the Skill to every listed collection and
 * removes it from every other one. The whole request is refused, with no
 * partial change: 409 when a collection that would change is operator-managed
 * (the operator reverts it), 400 when a collection would lose its last member
 * (the SkillCollection CRD needs at least one `spec.skills` entry).
 */
export const updateSkillCollectionMemberships = (
  skillId: EntityId,
  input: unknown
) => {
  const skill = findOr404(db.skills, skillId, "Skill");
  const collectionIds = entityIds(
    requiredArray(asBody(input), "collections"),
    "collections",
    db.skillCollections,
    "Skill collection"
  );
  const changes = db.skillCollections.flatMap((collection) => {
    const has = collection.skills.some((s) => s.id === skillId);
    const wants = collectionIds.includes(collection.id);
    if (has === wants) return [];
    if (collection.operatorManaged) {
      throw conflict(
        `${collection.name} is managed by Konveyor and cannot be changed here.`
      );
    }
    if (has && collection.skills.length === 1) {
      throw badRequest(
        `${skill.name} is the only skill in ${collection.name}. A skill collection needs at least one skill.`
      );
    }
    return [{ collection, wants }];
  });
  changes.forEach(({ collection, wants }) => {
    collection.skills = wants
      ? [...collection.skills, resolveSkillRef({ id: skillId, name: "" })]
      : collection.skills.filter((s) => s.id !== skillId);
  });
};

/**
 * PUT /skill-collections/:id/agents. Adds the collection to every listed
 * Agent and removes it from every other one. 409 when an Agent that would
 * change is operator-managed (the operator reverts it).
 */
export const updateSkillCollectionAgents = (
  collectionId: EntityId,
  input: unknown
) => {
  findOr404(db.skillCollections, collectionId, "Skill collection");
  const agentIds = entityIds(
    requiredArray(asBody(input), "agents"),
    "agents",
    db.agents,
    "Agent"
  );
  const changes = db.agents.flatMap((agent) => {
    const has = (agent.skillCollections ?? []).some(
      (c) => c.id === collectionId
    );
    const wants = agentIds.includes(agent.id);
    if (has === wants) return [];
    if (agent.operatorManaged) {
      throw conflict(
        `${agent.name} is managed by Konveyor and cannot be changed here.`
      );
    }
    return [{ agent, wants }];
  });
  changes.forEach(({ agent, wants }) => {
    const current = agent.skillCollections ?? [];
    agent.skillCollections = wants
      ? [...current, resolveCollectionRef({ id: collectionId, name: "" })]
      : current.filter((c) => c.id !== collectionId);
  });
};

// ---------------------------------------------------------------------------
// Execution policy
// ---------------------------------------------------------------------------

export const getExecutionPolicy = (): ExecutionPolicy => ({
  ...db.executionPolicy,
});

export const updateExecutionPolicy = (input: unknown): ExecutionPolicy => {
  const body = asBody(input);
  const mode = body.interactionMode;
  if (mode !== "unattended" && mode !== "interactive") {
    throw badRequest('interactionMode must be "unattended" or "interactive".');
  }
  db.executionPolicy = { interactionMode: mode };
  return getExecutionPolicy();
};

export { notFound };
