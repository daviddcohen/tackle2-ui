/**
 * In-memory state of the agentic mock server plus the helpers every resource
 * module shares: HTTP errors, request validation, id assignment, name lookups
 * and server-derived relationships.
 *
 * Design rules (they mirror what a real REST backend guarantees):
 * - The store holds ids for relationships. Names in refs are resolved on read,
 *   so a rename is reflected everywhere and a client can never write a stale
 *   name.
 * - Ids are assigned here (opaque numeric-looking strings), never by clients.
 * - Validation runs completely before any mutation: no partial saves.
 */
import {
  Agent,
  AgentTestRun,
  EffectiveSkillAssociation,
  EntityId,
  EntityRef,
  ExecutionPolicy,
  HubRef,
  HubSkillAssociation,
  HubSkillAssociationScope,
  MigrationPlan,
  ModelProjection,
  Provider,
  Skill,
  SkillAssociation,
  SkillCollection,
} from "@app/agentic";
import { Application } from "@app/api/models";
import { mockApplicationArray } from "@mocks/stub-new-work/applications";
import { mockArchetypes } from "@mocks/stub-new-work/archetypes";
import { mockIdentities } from "@mocks/stub-new-work/prototype-support";

import {
  mockAgentTestRuns,
  mockAgents,
  mockExecutionPolicy,
  mockGateways,
  mockMigrationPlans,
  mockProviders,
  mockSkillCollections,
  mockSkills,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MockHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new MockHttpError(400, message);
export const notFound = (message: string) => new MockHttpError(404, message);
export const conflict = (message: string) => new MockHttpError(409, message);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A Skill as stored: only Hub-scoped associations; agent links live on agents. */
export type StoredSkill = Omit<Skill, "associations"> & {
  associations: HubSkillAssociation[];
};

/** A Plan as stored: server-derived fields are computed on read. */
export type StoredPlan = Omit<
  MigrationPlan,
  "effectiveSkills" | "applicationImpact" | "runCount"
>;

export type EntityKind =
  | "skills"
  | "skillCollections"
  | "models"
  | "providers"
  | "agents"
  | "plans"
  | "agentTestRuns"
  | "stages";

interface AgenticDb {
  skills: StoredSkill[];
  skillCollections: SkillCollection[];
  models: ModelProjection[];
  providers: Provider[];
  agents: Agent[];
  plans: StoredPlan[];
  agentTestRuns: AgentTestRun[];
  executionPolicy: ExecutionPolicy;
  /** Ids that came from fixtures (used by the `initial` scenario). */
  seeded: Record<EntityKind, Set<EntityId>>;
  /** Last id handed out per kind. */
  counters: Record<EntityKind, number>;
  /** When a verification started, per `kind:id`. */
  verificationStartedAt: Map<string, number>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const maxNumericId = (ids: EntityId[]) =>
  ids.reduce((max, id) => {
    const value = Number(id);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

const toStoredSkill = (skill: Skill): StoredSkill => ({
  ...skill,
  associations: (skill.associations ?? []).filter(
    (association): association is HubSkillAssociation =>
      association.scope !== "agent"
  ),
});

const toStoredPlan = (plan: MigrationPlan): StoredPlan => {
  const stored: MigrationPlan = { ...plan };
  delete stored.effectiveSkills;
  delete stored.applicationImpact;
  delete stored.runCount;
  return stored;
};

const createDb = (): AgenticDb => {
  const skills = clone(mockSkills).map(toStoredSkill);
  const skillCollections = clone(mockSkillCollections);
  const models = clone(mockGateways);
  const providers = clone(mockProviders);
  const agents = clone(mockAgents);
  const plans = clone(mockMigrationPlans).map(toStoredPlan);
  const agentTestRuns = clone(mockAgentTestRuns);
  const stageIds = plans.flatMap((plan) => plan.stages.map((s) => s.id));
  const ids = (items: { id: EntityId }[]) => items.map((item) => item.id);
  return {
    skills,
    skillCollections,
    models,
    providers,
    agents,
    plans,
    agentTestRuns,
    executionPolicy: clone(mockExecutionPolicy),
    seeded: {
      skills: new Set(ids(skills)),
      skillCollections: new Set(ids(skillCollections)),
      models: new Set(ids(models)),
      providers: new Set(ids(providers)),
      agents: new Set(ids(agents)),
      plans: new Set(ids(plans)),
      agentTestRuns: new Set(ids(agentTestRuns)),
      stages: new Set(stageIds),
    },
    counters: {
      skills: maxNumericId(ids(skills)),
      skillCollections: maxNumericId(ids(skillCollections)),
      models: maxNumericId(ids(models)),
      providers: maxNumericId(ids(providers)),
      agents: maxNumericId(ids(agents)),
      plans: maxNumericId(ids(plans)),
      agentTestRuns: maxNumericId(ids(agentTestRuns)),
      stages: maxNumericId(stageIds),
    },
    verificationStartedAt: new Map(),
  };
};

export let db: AgenticDb = createDb();

/** Restores every collection to the fixtures (used by unit tests). */
export const resetAgenticDb = () => {
  db = createDb();
};

export const nextId = (kind: EntityKind): EntityId => {
  db.counters[kind] += 1;
  return String(db.counters[kind]);
};

export const isSeeded = (kind: EntityKind, id: EntityId) =>
  db.seeded[kind].has(id);

export const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

export type Body = Record<string, unknown>;

export const asBody = (value: unknown): Body => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("The request body must be a JSON object.");
  }
  return value as Body;
};

export const requiredString = (body: Body, field: string, label = field) => {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`${label} is required.`);
  }
  return value.trim();
};

export const optionalString = (body: Body, field: string) => {
  const value = body[field];
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string.`);
  }
  return value;
};

export const optionalArray = (body: Body, field: string): unknown[] => {
  const value = body[field];
  if (value == null) return [];
  if (!Array.isArray(value)) throw badRequest(`${field} must be an array.`);
  return value;
};

export const requiredArray = (body: Body, field: string): unknown[] => {
  if (!Array.isArray(body[field])) {
    throw badRequest(`${field} is required and must be an array.`);
  }
  return body[field] as unknown[];
};

/** Reads `{ id: string }` and returns the id. */
export const entityIdOf = (value: unknown, field: string): EntityId => {
  const id =
    value != null && typeof value === "object"
      ? (value as { id?: unknown }).id
      : undefined;
  if (typeof id !== "string" || id.trim() === "") {
    throw badRequest(`${field} must reference an entity by id.`);
  }
  return id;
};

/** Reads `{ id: number }` (a Hub reference) and returns the id. */
export const hubIdOf = (value: unknown, field: string): number => {
  const id =
    value != null && typeof value === "object"
      ? (value as { id?: unknown }).id
      : undefined;
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw badRequest(`${field} must reference a Hub entity by numeric id.`);
  }
  return id;
};

/** 409 when another entity of the same kind already uses the name. */
export const assertUniqueName = (
  items: { id: EntityId; name: string }[],
  name: string,
  label: string,
  selfId?: EntityId
) => {
  const taken = items.some(
    (item) =>
      item.id !== selfId && item.name.toLowerCase() === name.toLowerCase()
  );
  if (taken) throw conflict(`A ${label} named "${name}" already exists.`);
};

export const findOr404 = <T extends { id: EntityId }>(
  items: T[],
  id: EntityId,
  label: string
): T => {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw notFound(`${label} "${id}" not found.`);
  return item;
};

export const assertExists = (
  items: { id: EntityId }[],
  id: EntityId,
  label: string
) => {
  if (!items.some((item) => item.id === id)) {
    throw badRequest(`${label} "${id}" does not exist.`);
  }
};

export const listNames = (names: string[]) =>
  names.length <= 3
    ? names.join(", ")
    : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

// ---------------------------------------------------------------------------
// Name lookups (refs are resolved on read)
// ---------------------------------------------------------------------------

const lookup =
  (items: () => { id: EntityId; name: string }[]) =>
  (ref: EntityRef): EntityRef => {
    const current = items().find((item) => item.id === ref.id);
    return current ? { id: ref.id, name: current.name } : ref;
  };

export const resolveSkillRef = lookup(() => db.skills);
export const resolveCollectionRef = lookup(() => db.skillCollections);
export const resolveModelRef = lookup(() => db.models);
export const resolveProviderRef = lookup(() => db.providers);
export const resolveAgentRef = lookup(() => db.agents);
export const resolvePlanRef = lookup(() => db.plans);

export const findApplication = (id: number): Application | undefined =>
  mockApplicationArray.find((application) => application.id === id);

export const findArchetype = (id: number) => mockArchetypes[id];

/** The archetype that owns a target profile (profiles are owned by archetypes). */
export const findTargetProfile = (id: number) => {
  for (const archetype of Object.values(mockArchetypes)) {
    const profile = archetype.profiles?.find(
      (candidate) => candidate.id === id
    );
    if (profile) return { archetype, profile };
  }
  return undefined;
};

/** Hub reference name for a Skill association scope, or undefined if unknown. */
export const findHubResourceName = (
  scope: HubSkillAssociationScope,
  id: number
): string | undefined => {
  switch (scope) {
    case "archetype":
      return findArchetype(id)?.name;
    case "targetProfile":
      return findTargetProfile(id)?.profile.name;
    case "application":
      return findApplication(id)?.name;
  }
};

const credentialNames = (): Map<number, string> => {
  const names = new Map<number, string>();
  mockIdentities.forEach((identity) => names.set(identity.id, identity.name));
  [...mockGateways, ...mockProviders, ...db.models, ...db.providers].forEach(
    (item) => {
      if (item.credential) names.set(item.credential.id, item.credential.name);
    }
  );
  return names;
};

export const resolveCredential = (id: number): HubRef => {
  const name = credentialNames().get(id);
  if (name == null) throw badRequest(`Credential "${id}" does not exist.`);
  return { id, name };
};

// ---------------------------------------------------------------------------
// Server-derived relationships
// ---------------------------------------------------------------------------

/** Agents that list the Skill (the source of truth for agent-scope links). */
export const agentsUsingSkill = (skillId: EntityId) =>
  db.agents.filter((agent) => agent.skills.some((s) => s.id === skillId));

export const collectionsContainingSkill = (skillId: EntityId) =>
  db.skillCollections.filter((collection) =>
    collection.skills.some((s) => s.id === skillId)
  );

export const skillAssociations = (skill: StoredSkill): SkillAssociation[] => [
  ...skill.associations.map((association) => ({
    ...association,
    resource: {
      id: association.resource.id,
      name:
        findHubResourceName(association.scope, association.resource.id) ??
        association.resource.name,
    },
  })),
  ...agentsUsingSkill(skill.id).map(
    (agent): SkillAssociation => ({
      scope: "agent",
      resource: { id: agent.id, name: agent.name },
    })
  ),
];

/**
 * Skills that apply to a Plan: Skills associated to an agent of one of its
 * stages, to its archetype, or to one of its target profiles. Application
 * scoped Skills apply per application (see the application migration view).
 */
export const effectiveSkillsForPlan = (
  plan: Pick<StoredPlan, "stages" | "migrationPath">
): EffectiveSkillAssociation[] => {
  const result: EffectiveSkillAssociation[] = [];
  const add = (
    skill: StoredSkill,
    scope: EffectiveSkillAssociation["scope"],
    scopeName: string
  ) => {
    if (
      !result.some(
        (entry) =>
          entry.skill.id === skill.id &&
          entry.scope === scope &&
          entry.scopeName === scopeName
      )
    ) {
      result.push({
        skill: { id: skill.id, name: skill.name },
        scope,
        scopeName,
      });
    }
  };
  db.skills.forEach((skill) => {
    skill.associations.forEach((association) => {
      if (
        association.scope === "archetype" &&
        plan.migrationPath?.archetype.id === association.resource.id
      ) {
        add(
          skill,
          "archetype",
          findArchetype(association.resource.id)?.name ??
            association.resource.name
        );
      }
      if (
        association.scope === "targetProfile" &&
        plan.migrationPath?.targetProfiles.some(
          (profile) => profile.id === association.resource.id
        )
      ) {
        add(
          skill,
          "targetProfile",
          findTargetProfile(association.resource.id)?.profile.name ??
            association.resource.name
        );
      }
    });
  });
  plan.stages.forEach((stage) => {
    const agent = db.agents.find(
      (candidate) => candidate.id === stage.agent.id
    );
    agent?.skills.forEach((ref) => {
      const skill = db.skills.find((candidate) => candidate.id === ref.id);
      if (skill) add(skill, "agent", agent.name);
    });
  });
  return result;
};

/** Skills an agent brings through its skill collections. */
export const collectionSkillsForAgents = (
  agentIds: EntityId[]
): EffectiveSkillAssociation[] =>
  agentIds.flatMap((agentId) => {
    const agent = db.agents.find((candidate) => candidate.id === agentId);
    if (!agent) return [];
    return (agent.skillCollections ?? []).flatMap((collectionRef) => {
      const collection = db.skillCollections.find(
        (candidate) => candidate.id === collectionRef.id
      );
      if (!collection) return [];
      return collection.skills.map((skillRef) => ({
        skill: resolveSkillRef(skillRef),
        scope: "agent" as const,
        scopeName: `${agent.name} via ${collection.name}`,
      }));
    });
  });

/** Skills associated directly to an application. */
export const applicationSkills = (
  applicationId: number
): EffectiveSkillAssociation[] =>
  db.skills
    .filter((skill) =>
      skill.associations.some(
        (association) =>
          association.scope === "application" &&
          association.resource.id === applicationId
      )
    )
    .map((skill) => ({
      skill: { id: skill.id, name: skill.name },
      scope: "application" as const,
      scopeName: findApplication(applicationId)?.name ?? String(applicationId),
    }));

export const uniqueEffectiveSkills = (
  entries: EffectiveSkillAssociation[]
): EffectiveSkillAssociation[] =>
  entries.filter(
    (entry, index) =>
      entries.findIndex(
        (candidate) =>
          candidate.skill.id === entry.skill.id &&
          candidate.scope === entry.scope &&
          candidate.scopeName === entry.scopeName
      ) === index
  );

// ---------------------------------------------------------------------------
// Verification (Models and Providers verify 2.5 s after a write)
// ---------------------------------------------------------------------------

const VERIFICATION_MS = 2500;

export const startVerification = (
  kind: "models" | "providers",
  item: ModelProjection | Provider
) => {
  item.verificationStatus = "pending";
  item.statusReason = "Connection verification is in progress.";
  db.verificationStartedAt.set(`${kind}:${item.id}`, Date.now());
};

/** Completes a pending verification once its time has passed (tick on read). */
export const observeVerification = <T extends ModelProjection | Provider>(
  kind: "models" | "providers",
  item: T
): T => {
  const key = `${kind}:${item.id}`;
  const startedAt = db.verificationStartedAt.get(key);
  if (startedAt != null && Date.now() - startedAt >= VERIFICATION_MS) {
    item.verificationStatus = "verified";
    item.lastVerified = nowIso();
    delete item.statusReason;
    db.verificationStartedAt.delete(key);
  }
  return item;
};
