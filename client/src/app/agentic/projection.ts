import { universalComparator } from "@app/utils/utils";

import {
  Agent,
  ApplicationMigrationDisplayStatus,
  ApplicationMigrationView,
  ConfigurationCheck,
  ControllerRunPhase,
  HubRef,
  MigrationPlan,
  ModelProjection,
  PlanRun,
  PlanStage,
  StageRun,
  TERMINAL_RUN_PHASES,
} from "./types";

/**
 * The migration of an application the aggregate does not list: no Plan
 * resolves for it. A backend may omit unconfigured applications.
 */
export const UNCONFIGURED_MIGRATION: ApplicationMigrationView = {
  configured: false,
  intervention: "none",
  stages: [],
};

/** True for a run phase that will not change any more. */
export const isTerminalRunPhase = (phase: ControllerRunPhase | undefined) =>
  phase != null && TERMINAL_RUN_PHASES.includes(phase);

/** True while a run can still change (used to decide whether to poll). */
export const isActivePlanRun = (run: PlanRun | undefined) =>
  run != null && !isTerminalRunPhase(run.status);

/** The stage definition a stage run was started with (the run's snapshot). */
export const getStageDefinition = (stageRun: StageRun): PlanStage => ({
  id: stageRun.stageId,
  name: stageRun.name,
  agent: stageRun.agent,
  instructions: stageRun.instructions,
  requiresApproval: stageRun.requiresApproval,
  order: stageRun.order,
});

/** Stage runs in execution order. */
export const getOrderedStageRuns = (run: PlanRun): StageRun[] =>
  [...run.stageRuns].sort((a, b) => a.order - b.order);

/**
 * Display status of an application's migration. Precedence is a product rule:
 * configuration first, then a pending human decision, then the run phase, then
 * the preflight outcome.
 */
export const getMigrationDisplayStatus = (
  migration: ApplicationMigrationView
): ApplicationMigrationDisplayStatus => {
  if (!migration.configured) return "notConfigured";
  if (migration.intervention === "actionRequired") return "actionRequired";
  if (migration.runPhase === "Pending") return "pending";
  if (migration.runPhase === "Running") return "running";
  if (migration.runPhase === "Failed") return "failed";
  if (migration.runPhase === "Succeeded") return "succeeded";
  if (migration.preflight === "blocked") return "preflightBlocked";
  if (migration.preflight === "reviewRequired") return "reviewRequired";
  return "preflightReady";
};

/** A stage whose agent's model cannot be used yet, with what it resolved to. */
export interface StageWithUnverifiedModel {
  stage: PlanStage;
  /** Undefined when the stage's agent no longer exists. */
  agent?: Agent;
  /** Undefined when the agent's model no longer exists. */
  model?: ModelProjection;
}

/**
 * Stages of `plan`, in order, whose agent's model is not verified (or whose
 * agent or model is missing): agents can use a model only after it is
 * verified. The Models check and the plan's configuration alert both read it.
 */
export const getStagesWithUnverifiedModel = (
  plan: MigrationPlan,
  agents: Agent[],
  models: ModelProjection[]
): StageWithUnverifiedModel[] =>
  [...plan.stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const agent = agents.find((candidate) => candidate.id === stage.agent.id);
      const model = models.find(
        (candidate) => candidate.id === agent?.model.id
      );
      return { stage, agent, model };
    })
    .filter(({ model }) => model?.verificationStatus !== "verified");

/**
 * Configuration checks of a Plan: its stages have agents, and their models
 * are verified. A plan without a migration path is not a configuration
 * problem (it runs when someone picks it), so there is no path check.
 * Pass `undefined` for `agents` or `models`
 * while they are loading or failed to load: the Model check is then not
 * evaluated rather than reported as an issue.
 */
export const getPlanConfigurationChecks = (
  plan: MigrationPlan,
  agents: Agent[] | undefined,
  models: ModelProjection[] | undefined
): ConfigurationCheck[] => {
  const unavailableStages =
    agents != null && models != null
      ? getStagesWithUnverifiedModel(plan, agents, models)
      : undefined;
  return [
    {
      id: "stages",
      labelKey: "agentic.plan.configurationCheck.stages.label",
      status: plan.stages.length > 0 ? "passed" : "issue",
      detailKey:
        plan.stages.length > 0
          ? "agentic.plan.configurationCheck.stages.assigned"
          : "agentic.plan.configurationCheck.stages.empty",
      detailValues:
        plan.stages.length > 0 ? { count: plan.stages.length } : undefined,
    },
    unavailableStages == null
      ? {
          id: "models",
          labelKey: "agentic.plan.configurationCheck.models.label",
          status: "notEvaluated",
          detailKey: "agentic.plan.configurationCheck.models.notEvaluated",
        }
      : {
          id: "models",
          labelKey: "agentic.plan.configurationCheck.models.label",
          status: unavailableStages.length === 0 ? "passed" : "issue",
          detailKey:
            unavailableStages.length === 0
              ? "agentic.plan.configurationCheck.models.available"
              : "agentic.plan.configurationCheck.models.unavailable",
          detailValues:
            unavailableStages.length > 0
              ? { count: unavailableStages.length }
              : undefined,
        },
  ];
};

/**
 * One archetype + target profile migration path, as the plan pages present
 * it: "Quarkus 3.x (Java EE Application)".
 */
export interface PlanTargetProfile {
  archetype: HubRef;
  targetProfile: HubRef;
}

/**
 * Every archetype + target profile pair of the plan's migration path, by
 * archetype name, then profile name. Today derived from `migrationPath` (one
 * archetype); when the plan reference moves onto the target profile (profiles
 * of several archetypes), only this derivation changes.
 */
export const getPlanTargetProfiles = (
  plan: MigrationPlan
): PlanTargetProfile[] => {
  const path = plan.migrationPath;
  if (path == null) return [];
  return path.targetProfiles
    .map((targetProfile) => ({ archetype: path.archetype, targetProfile }))
    .sort(
      (a, b) =>
        universalComparator(a.archetype.name, b.archetype.name) ||
        universalComparator(a.targetProfile.name, b.targetProfile.name)
    );
};

/**
 * The pairs whose target profile uses the plan (its path is the default):
 * the profiles whose applications are migrated with it. Empty otherwise.
 */
export const getAssignedTargetProfiles = (
  plan: MigrationPlan
): PlanTargetProfile[] =>
  plan.migrationPath?.isDefault === true ? getPlanTargetProfiles(plan) : [];
