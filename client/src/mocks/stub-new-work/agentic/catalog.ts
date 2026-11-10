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
  Skill,
  SkillCollection,
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
  effectiveSkillsForPlan,
  entityIdOf,
  findApplication,
  findArchetype,
  findHubResourceName,
  findOr404,
  findTargetProfile,
  hubIdOf,
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
import { planImpact, runsUsingPlan } from "./execution";

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
  return { ...run, agent: resolveAgentRef(run.agent) };
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
  const run: AgentTestRun = {
    id: nextId("agentTestRuns"),
    agent: { id: agent.id, name: agent.name },
    application: { id: application.id, name: application.name },
    task,
    phase: "Running",
    startedAt: nowIso(),
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

export const presentPlan = (plan: StoredPlan): MigrationPlan => ({
  ...plan,
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
  effectiveSkills: effectiveSkillsForPlan(plan),
  applicationImpact: { matching: planImpact(plan.id) },
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
  return {
    name: planName,
    description: description(body, "Plan"),
    migrationPath,
    stages,
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
