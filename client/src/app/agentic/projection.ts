import {
  Agent,
  ApplicationMigrationDisplayStatus,
  ApplicationMigrationView,
  ConfigurationCheck,
  ControllerRunPhase,
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

export const getNextActionKey = (
  status: ApplicationMigrationDisplayStatus
): string => {
  switch (status) {
    case "notConfigured":
      return "configure";
    case "preflightReady":
      return "start";
    case "preflightBlocked":
    case "reviewRequired":
      return "resolve";
    case "actionRequired":
      return "review";
    case "failed":
      return "correct";
    case "succeeded":
      return "reviewResults";
    default:
      return "monitor";
  }
};

/**
 * Configuration checks of a Plan. Pass `undefined` for `agents` or `models`
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
      ? plan.stages.filter((stage) => {
          const agent = agents.find(
            (candidate) => candidate.id === stage.agent.id
          );
          return !models.some(
            (model) =>
              model.id === agent?.model.id &&
              model.verificationStatus === "verified"
          );
        })
      : undefined;
  return [
    {
      id: "path",
      labelKey: "agentic.plan.configurationCheck.path.label",
      status: plan.migrationPath ? "passed" : "issue",
      detailKey: plan.migrationPath
        ? "agentic.plan.configurationCheck.path.assigned"
        : "agentic.plan.configurationCheck.path.unassigned",
      detailValues: plan.migrationPath
        ? {
            archetype: plan.migrationPath.archetype.name,
            target: plan.migrationPath.targetProfiles
              .map((profile) => profile.name)
              .join(", "),
          }
        : undefined,
    },
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
    {
      id: "skills",
      labelKey: "agentic.plan.configurationCheck.skills.label",
      status: plan.effectiveSkills?.length ? "passed" : "notEvaluated",
      detailKey: plan.effectiveSkills?.length
        ? "agentic.plan.configurationCheck.skills.resolved"
        : "agentic.plan.configurationCheck.skills.notEvaluated",
      detailValues: plan.effectiveSkills?.length
        ? { count: plan.effectiveSkills.length }
        : undefined,
    },
  ];
};
