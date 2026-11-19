import { Ref } from "@app/api/models";

/**
 * Opaque identifier of an agentic entity (Skill, Skill collection, Model,
 * Provider, Agent, Plan, Plan run, Agent test run, Plan stage).
 *
 * The UI must treat it as an opaque string: never parse it, never do math on
 * it, never mint one. The server assigns ids on create.
 *
 * Prototype fixtures use numeric-looking values ("1", "2", ...) so existing
 * URLs keep working. The real agentic backend addresses resources by
 * Kubernetes `metadata.name` (DNS-1123, e.g. `java-ee-to-quarkus`); the
 * integration adapter maps `metadata.name` to `id` and a display name to
 * `name`.
 */
export type EntityId = string;

/** Reference to another agentic entity. The server owns `name` (it follows renames). */
export interface EntityRef {
  id: EntityId;
  name: string;
}

/**
 * Reference used in request payloads: id only. The server resolves names, so a
 * client can never write a stale name into a relationship.
 */
export interface IdRef<T extends EntityId | number = EntityId> {
  id: T;
}

/**
 * Reference to a Hub entity (application, archetype, target profile, identity).
 * These keep Hub's numeric ids.
 */
export type HubRef = Ref;

/** Server-owned connection verification state of a Model or Provider. */
export type VerificationStatus = "verified" | "unreachable" | "pending";

/** Request body for a create or update: the user-editable fields only. */
export type WithId<T> = T & { id: EntityId };

// ---------------------------------------------------------------------------
// Skills and Skill collections
// ---------------------------------------------------------------------------

export type SkillSourceType = "inline" | "git" | "oci";

/**
 * How an agent loads a Skill (SkillCard `spec.type`): `rule` is pasted into
 * every prompt ("Always followed"); `skill` is offered by name and
 * description and the agent opens it when relevant ("Available when
 * needed"). Absent means `skill`, the CRD default.
 */
export type SkillLoadPolicy = "rule" | "skill";

export type SkillAssociationScope =
  | "agent"
  | "archetype"
  | "targetProfile"
  | "application";

/** Hub-owned scopes reference Hub entities (numeric ids). */
export type HubSkillAssociationScope = Exclude<SkillAssociationScope, "agent">;

export type SkillAssociation =
  | { scope: "agent"; resource: EntityRef }
  | { scope: HubSkillAssociationScope; resource: HubRef };

export type HubSkillAssociation = Extract<
  SkillAssociation,
  { scope: HubSkillAssociationScope }
>;

export type SkillAssociationRequest =
  | { scope: "agent"; resource: IdRef }
  | { scope: HubSkillAssociationScope; resource: IdRef<number> };

export interface Skill {
  id: EntityId;
  name: string;
  description: string;
  sourceType: SkillSourceType;
  content?: string;
  repoUrl?: string;
  repoBranch?: string;
  repoPath?: string;
  imageRef?: string;
  /** Absent means `skill` (the CRD default). */
  loadPolicy?: SkillLoadPolicy;
  associations?: SkillAssociation[];
  /**
   * Server-owned. True for a built-in object the agentic operator installs
   * and reconciles (label `app.kubernetes.io/managed-by:
   * agentic-controller-defaults`): it reverts edits and recreates deletes, so
   * render it read-only. The prototype API never sets it.
   */
  operatorManaged?: boolean;
  /** Server-owned. */
  createTime?: string;
  /** Server-owned. */
  updateTime?: string;
}

export interface SkillRequest {
  name: string;
  description: string;
  sourceType: SkillSourceType;
  content?: string;
  repoUrl?: string;
  repoBranch?: string;
  repoPath?: string;
  imageRef?: string;
  /** Absent means `skill` (the CRD default). */
  loadPolicy?: SkillLoadPolicy;
  associations?: SkillAssociationRequest[];
}

export interface SkillCollection {
  id: EntityId;
  name: string;
  description: string;
  skills: EntityRef[];
  /**
   * Server-owned. True for a built-in object the agentic operator installs
   * and reconciles (label `app.kubernetes.io/managed-by:
   * agentic-controller-defaults`): it reverts edits and recreates deletes, so
   * render it read-only. The prototype API never sets it.
   */
  operatorManaged?: boolean;
}

export interface SkillCollectionRequest {
  name: string;
  description: string;
  skills: IdRef[];
}

// ---------------------------------------------------------------------------
// Models (controller Gateway) and Providers
// ---------------------------------------------------------------------------

export interface Gateway {
  id: EntityId;
  name: string;
  description?: string;
  provider: EntityRef;
  /** Provider model identifier, e.g. `claude-sonnet-4-6`. */
  model: string;
  endpoint?: string;
  credential?: HubRef;
  /** Server-owned. */
  verificationStatus: VerificationStatus;
  /** Server-owned. */
  lastVerified?: string;
  /** Server-owned. */
  statusReason?: string;
}

export interface ModelProjection extends Gateway {
  /** Server-owned. Change it with `PUT /models/:id/default`. */
  isOrganizationDefault: boolean;
}

export interface ModelRequest {
  name: string;
  description?: string;
  provider: IdRef;
  model: string;
  endpoint?: string;
  credential?: IdRef<number>;
}

export type ProviderType =
  | "anthropic"
  | "azure_openai"
  | "vertex"
  | "ollama"
  | "openai"
  | "other";

export interface Provider {
  id: EntityId;
  name: string;
  description?: string;
  providerType: ProviderType;
  endpoint: string;
  credential?: HubRef;
  /** Server-owned. */
  verificationStatus: VerificationStatus;
  /** Server-owned. */
  lastVerified?: string;
  /** Server-owned. */
  statusReason?: string;
}

export interface ProviderRequest {
  name: string;
  description?: string;
  providerType: ProviderType;
  endpoint: string;
  credential?: IdRef<number>;
}

export interface AvailableModel {
  id: string;
  displayName: string;
}

export interface ExecutionPolicy {
  interactionMode: "unattended" | "interactive";
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface AgentParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  defaultValue?: string;
}

export interface Agent {
  id: EntityId;
  name: string;
  description: string;
  model: EntityRef;
  skills: EntityRef[];
  skillCollections?: EntityRef[];
  prompt: string;
  capabilities: string[];
  parameters: AgentParameter[];
  /**
   * Server-owned. True for a built-in object the agentic operator installs
   * and reconciles (label `app.kubernetes.io/managed-by:
   * agentic-controller-defaults`): it reverts edits and recreates deletes, so
   * render it read-only. The prototype API never sets it.
   */
  operatorManaged?: boolean;
  /** Server-owned. */
  createTime?: string;
  /** Server-owned. */
  updateTime?: string;
}

export interface AgentRequest {
  name: string;
  description: string;
  model: IdRef;
  skills: IdRef[];
  skillCollections: IdRef[];
  prompt: string;
  capabilities: string[];
  parameters: AgentParameter[];
}

export interface AgentTestRunRequest {
  agentId: EntityId;
  applicationId: number;
  task: string;
  /**
   * The Model (controller Gateway) to run on: AgentRun `spec.gateway`. The
   * controller defaults it only when the Agent declares exactly one Gateway;
   * otherwise a run without it fails validation. Not collected by the UI yet
   * (the prototype API ignores it).
   */
  modelId?: EntityId;
  /**
   * Branch the agent pushes to: env `TARGET_BRANCH`, which the migration
   * harness requires. Not collected by the UI yet (the prototype API ignores
   * it).
   */
  targetBranch?: string;
  /**
   * Agent parameter values by parameter name: AgentRun `spec.params`.
   * Required Agent parameters must be present. Not collected by the UI yet
   * (the prototype API ignores it).
   */
  params?: Record<string, string>;
}

export interface AgentTestRun {
  id: EntityId;
  agent: EntityRef;
  application: HubRef;
  task: string;
  phase: ControllerRunPhase;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanStage {
  /** Server-assigned and stable across Plan edits. */
  id: EntityId;
  name: string;
  agent: EntityRef;
  instructions: string;
  requiresApproval: boolean;
  /** 1-based position. Server-owned: derived from the request array order. */
  order: number;
}

export interface PlanStageRequest {
  /** Id of an existing stage to keep; omit for a new stage. */
  id?: EntityId;
  name: string;
  agent: IdRef;
  instructions: string;
  requiresApproval: boolean;
}

export interface MigrationPathAssociation {
  archetype: HubRef;
  targetProfiles: HubRef[];
  isDefault: boolean;
}

export interface MigrationPathRequest {
  archetype: IdRef<number>;
  targetProfiles: IdRef<number>[];
  isDefault: boolean;
}

/** Where one skill a stage gets comes from. Refs only; the UI writes the words. */
export type SkillOrigin =
  | { kind: "agent"; agent: EntityRef }
  | { kind: "collection"; agent: EntityRef; collection: EntityRef }
  | { kind: "archetype"; archetype: HubRef }
  | { kind: "targetProfile"; targetProfile: HubRef; archetype: HubRef }
  | { kind: "application"; application: HubRef };

/** One Skill a stage (or every stage) gets. */
export interface StageSkill {
  skill: EntityRef;
  loadPolicy: SkillLoadPolicy;
  /**
   * Every way it reaches this group, deduplicated, ordered agent, collection,
   * archetype, target profile, application.
   */
  from: SkillOrigin[];
  /** The plan excludes it. Never true when one origin is the application itself. */
  excluded: boolean;
}

/** What one stage's agent gets: its own skills and its collections' skills. */
export interface StageSkillsGroup {
  /** 1-based. */
  order: number;
  /** The stage name. */
  name: string;
  agent: EntityRef;
  /** Set in run snapshots: the stage run's `stageId`. */
  stageId?: EntityId;
  /** The stage agent's own skills and its collections' skills. */
  skills: StageSkill[];
}

/** Context skills: every stage gets them. */
export interface EveryStageSkillsGroup {
  /**
   * The application these belong to. Absent in a plan preview: then they
   * come from the plan's archetype and target profiles.
   */
  application?: HubRef;
  /** Archetype, target profile and application skills. */
  skills: StageSkill[];
}

/** What each stage gets, per stage, plus the skills every stage gets. */
export interface SkillsByStage {
  stages: StageSkillsGroup[];
  everyStage: EveryStageSkillsGroup[];
}

/**
 * A draft plan to resolve skills for: the parts of a `MigrationPlanRequest`
 * that decide its skills, so a full request is a valid body. Stages without
 * an agent are left out by the client.
 */
export interface ResolvePlanSkillsRequest {
  /** In stage order; `name` labels the stage group (absent: ""). */
  stages: { agent: IdRef; name?: string }[];
  migrationPath?: {
    archetype: IdRef<number>;
    targetProfiles: IdRef<number>[];
  };
  excludedSkills?: IdRef[];
  /**
   * Resolve for these applications: one `everyStage` group per application,
   * from its own archetypes, target profile and attachments. Absent: the plan
   * preview (one `everyStage` group from `migrationPath`).
   */
  applications?: IdRef<number>[];
}

/** The per-stage resolution of a draft plan. */
export type ResolvePlanSkillsResponse = SkillsByStage;

/** Where one Skill sits in a plan's resolution. */
export interface SkillPlacement {
  /** The stage that gets it; absent means every stage. */
  stage?: { order: number; name: string };
  from: SkillOrigin[];
  excluded: boolean;
}

/**
 * A migration plan whose resolution (the plan preview, without
 * applications) includes one Skill.
 */
export interface SkillPlan {
  plan: EntityRef;
  /** One per stage that gets the Skill, plus one for every stage. */
  placements: SkillPlacement[];
}

export interface SkillPlansResponse {
  /**
   * One entry per migration plan whose plan preview resolves the Skill, in
   * plan name order. Application skills are not included: they are added
   * per application when a plan runs.
   */
  plans: SkillPlan[];
}

export interface PlanApplicationImpact {
  matching: number;
  /**
   * Server-derived: the applications counted in `matching`, in name order.
   * Absent on a server that only counts them.
   */
  applications?: HubRef[];
}

export interface MigrationPlan {
  id: EntityId;
  name: string;
  description: string;
  stages: PlanStage[];
  migrationPath?: MigrationPathAssociation;
  /**
   * Skills this Plan turns off: no stage of its runs gets them, whatever
   * source they come through. Absent when the Plan excludes nothing (and on a
   * backend without exclusions).
   */
  excludedSkills?: EntityRef[];
  /** Server-derived: applications whose migration resolves to this Plan. */
  applicationImpact?: PlanApplicationImpact;
  /** Server-derived: number of plan runs that use this Plan. */
  runCount?: number;
  /**
   * Server-owned. True for a built-in object the agentic operator installs
   * and reconciles (label `app.kubernetes.io/managed-by:
   * agentic-controller-defaults`): it reverts edits and recreates deletes, so
   * render it read-only. The prototype API never sets it.
   */
  operatorManaged?: boolean;
  /** Server-owned. */
  createTime?: string;
  /** Server-owned. */
  updateTime?: string;
}

export interface MigrationPlanRequest {
  name: string;
  description: string;
  stages: PlanStageRequest[];
  migrationPath?: MigrationPathRequest;
  /** Skills to turn off for every stage. Absent or empty: none. */
  excludedSkills?: IdRef[];
}

export type ConfigurationCheckStatus = "passed" | "issue" | "notEvaluated";

export interface ConfigurationCheck {
  id: string;
  labelKey: string;
  status: ConfigurationCheckStatus;
  detailKey: string;
  detailValues?: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type ApplicationPreflightStatus = "ready" | "blocked" | "reviewRequired";

/**
 * Run phase. `AwaitingApproval` is a prototype simplification: the controller
 * phase is only Pending, Running, Succeeded or Failed and a pending approval is
 * an ACP permission request on the running stage (see backend-integration map).
 */
export type ControllerRunPhase =
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "AwaitingApproval";

export const TERMINAL_RUN_PHASES: readonly ControllerRunPhase[] = [
  "Succeeded",
  "Failed",
];

export type HumanInterventionState = "none" | "actionRequired";

export interface ApplicationMigrationStageExecution {
  stageName: string;
  phase: ControllerRunPhase;
  summary?: string;
  evidence?: string[];
  completedAt?: string;
}

export interface ApplicationMigrationAction {
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  requestedAction: string;
}

export interface ApplicationMigrationCommit {
  hash: string;
  message: string;
  stageName: string;
  url?: string;
  /**
   * The application whose agent run made the commit, in a run on several
   * applications (each application's agent run commits to its own
   * repository). Absent in a run on one application.
   */
  application?: HubRef;
}

/** A commit belongs to an application when it names it or names none. */
export const isCommitOf = (
  commit: ApplicationMigrationCommit,
  applicationId: number | undefined
) =>
  commit.application == null ||
  applicationId == null ||
  commit.application.id === applicationId;

export interface ApplicationMigrationResult {
  repositoryName: string;
  targetBranch: string;
  branchUrl?: string;
  commits: ApplicationMigrationCommit[];
}

export interface StartApplicationMigrationsRequest {
  applicationIds: number[];
  planSelection: "recommended" | "single";
  /** Required when `planSelection` is `single`. */
  planId?: EntityId;
  targetBranch: string;
  /**
   * The Model (controller Gateway) every run uses: AgentWorkflowRun
   * `spec.gateway`, which feeds each stage. Required by the controller when a
   * stage Agent declares no Gateway or several (the shipped defaults declare
   * none). Not collected by the UI yet (the prototype API ignores it).
   */
  modelId?: EntityId;
  /**
   * Workflow parameter values by name: AgentWorkflowRun `spec.params`. Not
   * collected by the UI yet (the prototype API ignores it).
   */
  params?: Record<string, string>;
}

export interface StartApplicationMigrationsResponse {
  /** The plan runs the server created: one per resolved Plan. */
  planRuns: EntityRef[];
}

export interface ApplicationMigrationView {
  configured: boolean;
  /** The application's own target profile: its archetype's. */
  targetProfile?: HubRef;
  /** The archetype `targetProfile` belongs to. */
  archetype?: HubRef;
  /**
   * The plan the next run uses: the default plan of the application's
   * archetype and target profile. Never the latest run's plan.
   */
  plan?: EntityRef;
  /** The application's latest plan run, if it has one. */
  planRun?: EntityRef;
  /** The plan `planRun` used (it can differ from `plan`). */
  planRunPlan?: EntityRef;
  preflight?: ApplicationPreflightStatus;
  preflightReason?: string;
  runPhase?: ControllerRunPhase;
  currentStage?: string;
  intervention: HumanInterventionState;
  action?: ApplicationMigrationAction;
  /**
   * What each stage of `plan` gets for this application, with one
   * `everyStage` group for this application. Without a plan, `stages` is
   * empty and only the context skills are listed.
   */
  skills?: SkillsByStage;
  result?: ApplicationMigrationResult;
  stages: ApplicationMigrationStageExecution[];
  startedAt?: string;
  updatedAt?: string;
}

/** Keyed by Hub application id. */
export type ApplicationMigrationMap = Record<number, ApplicationMigrationView>;

export interface StageMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

/**
 * One stage of a plan run. The stage definition (name, agent, instructions,
 * approval gate) is a snapshot taken when the run started, so later Plan edits
 * never change or break an existing run.
 */
export interface StageRun {
  stageId: EntityId;
  name: string;
  agent: EntityRef;
  instructions: string;
  requiresApproval: boolean;
  order: number;
  status: ControllerRunPhase;
  startedAt?: string;
  completedAt?: string;
  approvedAt?: string;
  output?: string;
  messages?: StageMessage[];
  commits?: ApplicationMigrationCommit[];
}

export interface PlanRun {
  id: EntityId;
  name: string;
  planId: EntityId;
  planName: string;
  applications: HubRef[];
  status: ControllerRunPhase;
  targetBranch: string;
  startedAt: string;
  completedAt?: string;
  stageRuns: StageRun[];
  /**
   * Snapshot at start, computed by the server's skill resolver: what each
   * stage got (`stageId` set) and one `everyStage` group per application.
   */
  skills?: SkillsByStage;
}

export type ApplicationMigrationDisplayStatus =
  | "notConfigured"
  | "preflightReady"
  | "preflightBlocked"
  | "reviewRequired"
  | "pending"
  | "running"
  | "actionRequired"
  | "succeeded"
  | "failed";
