/**
 * Plan run (domain) <-> AgentWorkflowRun (konveyor.io/v1alpha1,
 * `/hub/agentic/workflowruns`), with stage timing from the stage AgentRuns.
 */
import type * as Crd from "@app/api/agentic/contract";
import { runHubCoordinates } from "@app/api/agentic/contract";

import {
  EntityId,
  PlanRun,
  StageRun,
  StartApplicationMigrationsRequest,
  StartApplicationMigrationsResponse,
} from "../types";

import {
  ApplicationNameIndex,
  NameIndex,
  toEntityId,
  toEntityRef,
  toRunApplication,
} from "./common";

export interface PlanRunContext {
  /** Plan names by id (only needed if Plans get display names). */
  planNames?: NameIndex;
  applicationNames?: ApplicationNameIndex;
  /** The stage AgentRuns, for stage start/completion times and output. */
  agentRuns?: readonly Crd.AgentRun[];
}

const toStageRun = (
  stage: Crd.AgentWorkflowRunStageStatus,
  index: number,
  agentRuns: ReadonlyMap<string, Crd.AgentRun>
): StageRun => {
  const agentRun =
    stage.agentRunName != null ? agentRuns.get(stage.agentRunName) : undefined;
  return {
    stageId: stage.name,
    name: stage.name,
    agent: toEntityRef(stage.agentRef ?? agentRun?.spec.agentRef ?? ""),
    instructions: stage.instructions ?? "",
    requiresApproval: stage.execution?.mode === "approve",
    order: index + 1,
    status: stage.phase ?? "Pending",
    startedAt: agentRun?.status?.startTime,
    completedAt: agentRun?.status?.completionTime,
    approvedAt: undefined,
    output: agentRun?.status?.terminationData?.stopReason,
    messages: undefined,
    commits: undefined,
  };
};

/**
 * AgentWorkflowRun -> Plan run. Stages come from `status.stages`, the
 * controller's snapshot of the workflow at run start. The run has one
 * application (label `konveyor.io/application`, else env `APP_ID`).
 * `status` is never `AwaitingApproval`: a pending approval is an ACP
 * permission request on the running stage's AgentRun and has to be overlaid
 * from the ACP session. No backend source (documented defaults): stage
 * `approvedAt`, `messages` (ACP transcript) and `commits`, and the run's
 * `resolvedSkills`, are undefined.
 */
export const toPlanRun = (
  run: Crd.AgentWorkflowRun,
  { planNames, applicationNames, agentRuns = [] }: PlanRunContext = {}
): PlanRun => {
  const runsByName = new Map(
    agentRuns.map((agentRun) => [toEntityId(agentRun.metadata), agentRun])
  );
  const application = toRunApplication(
    run.metadata,
    run.spec.env,
    applicationNames
  );
  const plan = toEntityRef(run.spec.workflowRef, planNames);
  return {
    id: toEntityId(run.metadata),
    name: toEntityId(run.metadata),
    planId: plan.id,
    planName: plan.name,
    applications: application != null ? [application] : [],
    status: run.status?.phase ?? "Pending",
    targetBranch: runHubCoordinates(run.spec.env).targetBranch ?? "",
    startedAt: run.status?.startTime ?? run.metadata.creationTimestamp ?? "",
    completedAt: run.status?.completionTime,
    stageRuns: (run.status?.stages ?? []).map((stage, index) =>
      toStageRun(stage, index, runsByName)
    ),
    resolvedSkills: undefined,
  };
};

/**
 * Start request -> one `createWorkflowRun` input (`api/rest/agent-runs`) per
 * application (the controller runs one AgentWorkflowRun per application).
 * `modelId` becomes `spec.gateway` and `params` `spec.params` on every run;
 * each is omitted when the request leaves it out. "Use recommended Plan"
 * needs the Hub's application-to-Plan resolution, which does not exist yet:
 * pass `recommendedPlanId` to supply it. Throws for an application with no
 * Plan.
 */
export const toWorkflowRunInputs = (
  request: StartApplicationMigrationsRequest,
  recommendedPlanId?: (applicationId: number) => EntityId | undefined
): Crd.CreateWorkflowRunInput[] =>
  request.applicationIds.map((applicationId) => {
    const workflowRef =
      request.planSelection === "single"
        ? request.planId
        : recommendedPlanId?.(applicationId);
    if (workflowRef == null || workflowRef === "") {
      throw new Error(`No Plan selected for application ${applicationId}.`);
    }
    return {
      workflowRef,
      applicationRef: String(applicationId),
      targetBranch: request.targetBranch,
      gateway: request.modelId || undefined,
      params: request.params,
    };
  });

/** Created AgentWorkflowRuns -> the start response the UI navigates with. */
export const toStartResponse = (
  runs: readonly Crd.AgentWorkflowRun[]
): StartApplicationMigrationsResponse => ({
  planRuns: runs.map((run) => toEntityRef(toEntityId(run.metadata))),
});
