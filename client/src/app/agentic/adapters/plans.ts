/**
 * Migration Plan (domain) <-> AgentWorkflow (konveyor.io/v1alpha1,
 * `/hub/agentic/workflows`).
 */
import type * as Crd from "@app/api/agentic/contract";
import { isOperatorManaged } from "@app/utils/agentic";

import { MigrationPlan, MigrationPlanRequest, PlanStage } from "../types";

import { toEntityId, toEntityRef, toResourceName } from "./common";

const toStage = (stage: Crd.AgentWorkflowStage, index: number): PlanStage => ({
  id: stage.name,
  name: stage.name,
  agent: toEntityRef(stage.agentRef),
  instructions: stage.instructions ?? "",
  requiresApproval: stage.execution?.mode === "approve",
  order: index + 1,
});

/**
 * AgentWorkflow -> Migration Plan. A stage's id and name are both the CRD
 * stage `name`; `requiresApproval` is `execution.mode === "approve"`, which
 * gates every tool call of the stage, not the stage as a whole. Pass `runs`
 * (every AgentWorkflowRun) to count `runCount` client-side. No backend source
 * (documented defaults): `description` "" (`spec.guide` is guidance for the
 * agents, not a description), `migrationPath`, `effectiveSkills`,
 * `applicationImpact` and `updateTime` undefined. `operatorManaged` marks the
 * operator's built-in workflows.
 */
export const toMigrationPlan = (
  workflow: Crd.AgentWorkflow,
  runs?: readonly Crd.AgentWorkflowRun[]
): MigrationPlan => {
  const id = toEntityId(workflow.metadata);
  return {
    id,
    name: id,
    description: "",
    stages: workflow.spec.stages.map(toStage),
    migrationPath: undefined,
    effectiveSkills: undefined,
    applicationImpact: undefined,
    runCount: runs?.filter((run) => run.spec.workflowRef === id).length,
    operatorManaged: isOperatorManaged(workflow),
    createTime: workflow.metadata.creationTimestamp,
    updateTime: undefined,
  };
};

/**
 * Approval on: `approve`. Approval off: the existing mode unless it was
 * `approve`, so the stage falls back to the default (`auto`).
 */
const toStageMode = (
  requiresApproval: boolean,
  current: Crd.ExecutionMode | undefined
): Crd.ExecutionMode | undefined => {
  if (requiresApproval) return "approve";
  return current === "approve" ? undefined : current;
};

const uniqueName = (text: string, taken: Set<string>) => {
  const base = toResourceName(text, 60) || "stage";
  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) name = `${base}-${suffix}`;
  taken.add(name);
  return name;
};

/**
 * MigrationPlanRequest -> AgentWorkflow spec, spread over `base`. An existing
 * stage keeps its id as the CRD stage name; a new stage gets a name derived
 * from its display name (unique within the workflow; the CRD pattern is
 * `^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$`, at most 63 characters), so the display
 * name does not survive a round trip as typed. On update pass the current
 * `workflow.spec` as `base`: the Hub replaces the whole spec, so `guide`,
 * `params`, each kept stage's own fields (execution limits, `askUser`) and any
 * field this contract does not know yet come from it. `name` (the resource
 * name, immutable: see `assertNotRenamed`), `description` and
 * `migrationPath` have no spec field and are dropped.
 */
export const toWorkflowSpec = (
  request: MigrationPlanRequest,
  base?: Crd.AgentWorkflowSpec
): Crd.AgentWorkflowSpec => {
  const baseStages = new Map(
    (base?.stages ?? []).map((stage) => [stage.name, stage])
  );
  const taken = new Set(
    request.stages.flatMap(({ id }) => (id != null ? [id] : []))
  );
  return {
    ...base,
    stages: request.stages.map((stage) => {
      const name = stage.id ?? uniqueName(stage.name, taken);
      const current = baseStages.get(name);
      const { mode, ...limits } = current?.execution ?? {};
      const execution: Crd.ExecutionSpec = {
        ...limits,
        mode: toStageMode(stage.requiresApproval, mode),
      };
      const hasExecution = Object.values(execution).some((v) => v != null);
      return {
        ...current,
        name,
        agentRef: stage.agent.id,
        instructions: stage.instructions || undefined,
        execution: hasExecution ? execution : undefined,
      };
    }),
  };
};
