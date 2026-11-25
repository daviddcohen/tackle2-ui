/**
 * AgentRun (konveyor.io/v1alpha1, `/hub/agentic/agentruns/{name}`) -> the
 * stage agent run the observability views show.
 *
 * A plan run stage is one AgentRun per application: each application's
 * AgentWorkflowRun names its stage's AgentRun in
 * `status.stages[].agentRunName`, and the AgentRun carries the application
 * (label `konveyor.io/application`, else env `APP_ID`). Usage comes from, in order:
 * 1. `status.usage`, the typed usage ADR 0021 proposes (PR 282, not merged);
 * 2. `status.terminationData.usage`, what the harness writes at the end of
 *    the run today (merged: `turnsUsed`, `contextUsed`, `contextSize`, and a
 *    `cost` the harness never fills);
 * 3. live usage the caller folded from the transcript or the ACP session
 *    (`foldTranscript`), which is all there is while the run is live.
 * Values from 1 or 2 win; 3 fills what they leave out. The Gateway, when
 * given, fills the window size a run did not report, and names the model
 * unless 1 does (its id, over the plan ladder's display name in 3).
 */
import type * as Crd from "@app/api/agentic/contract";
import { isTerminalPhase } from "@app/api/agentic/contract";

import {
  AGENT_RUN_CONTAINERS,
  AgentRunLogSource,
  AgentRunUsage,
  StageAgentRun,
} from "../observability";
import { ControllerRunPhase, EntityId } from "../types";

import { ApplicationNameIndex, toEntityId, toRunApplication } from "./common";

/** Defined with the agent run type; kept here for the adapters' callers. */
export { AGENT_RUN_CONTAINERS };

export interface StageAgentRunContext {
  runId: EntityId;
  stageId: EntityId;
  /**
   * The stage phase from the workflow run (in the prototype it can be
   * `AwaitingApproval`, which an AgentRun never is). Default: the AgentRun
   * phase.
   */
  phase?: ControllerRunPhase;
  /** The run's Gateway (`spec.gateway`), for `contextWindow` and model name. */
  gateway?: Crd.Gateway;
  /** Usage folded from the transcript or the live ACP session. */
  liveUsage?: AgentRunUsage;
  /** From the logs endpoint (`X-Log-Source`). Default: saved once the run ended. */
  logSource?: AgentRunLogSource;
  /** Hub application names, for `application.name` (else `#{id}`). */
  applicationNames?: ApplicationNameIndex;
}

/** Drops undefined fields, so a spread never erases a value. */
const defined = (usage: AgentRunUsage): AgentRunUsage =>
  Object.fromEntries(
    Object.entries(usage).filter(([, value]) => value !== undefined)
  ) as AgentRunUsage;

/** A context occupancy or size: a zero is "not reported", never a reading. */
const tokens = (value: number | undefined) =>
  value != null && Number.isFinite(value) && value > 0 ? value : undefined;

const finite = (value: number | undefined) =>
  value != null && Number.isFinite(value) ? value : undefined;

const parseCost = (cost: string | undefined) => {
  if (cost == null || cost.trim() === "") return undefined;
  const value = Number(cost);
  return Number.isFinite(value) ? value : undefined;
};

/** ADR 0021 `status.usage`: every field optional, a reported zero count stays. */
const fromTypedUsage = (usage: Crd.RunUsage): AgentRunUsage =>
  defined({
    contextUsed: tokens(usage.contextUsed),
    contextSize: tokens(usage.contextSize),
    peakContextUsed: tokens(usage.peakContextUsed),
    compactions: finite(usage.compactions),
    inputTokens: finite(usage.inputTokens),
    outputTokens: finite(usage.outputTokens),
    turnsUsed: finite(usage.turnsUsed),
    cost: parseCost(usage.cost),
    currency: usage.currency || undefined,
    model: usage.model || undefined,
  });

/** Merged `terminationData.usage` (fields are omitempty: absent may be zero). */
const fromTerminationUsage = (
  usage: NonNullable<Crd.HarnessTerminationData["usage"]>
): AgentRunUsage =>
  defined({
    contextUsed: tokens(usage.contextUsed),
    contextSize: tokens(usage.contextSize),
    turnsUsed: finite(usage.turnsUsed),
    cost: tokens(usage.cost),
  });

/**
 * The usage of an AgentRun (see the module comment for the sources).
 * Undefined when nothing at all is reported.
 */
export const toAgentRunUsage = (
  run: Crd.AgentRun,
  {
    gateway,
    liveUsage,
  }: Pick<StageAgentRunContext, "gateway" | "liveUsage"> = {}
): AgentRunUsage | undefined => {
  const typed = run.status?.usage;
  const termination = run.status?.terminationData?.usage;
  const reported =
    typed != null
      ? fromTypedUsage(typed)
      : termination != null
        ? fromTerminationUsage(termination)
        : {};
  const usage = defined({
    ...defined(liveUsage ?? {}),
    ...reported,
  });
  if (usage.maxTurns == null && finite(run.spec.execution?.maxTurns) != null) {
    usage.maxTurns = run.spec.execution?.maxTurns;
  }
  if (usage.contextSize == null) {
    const window = tokens(gateway?.spec.model.contextWindow);
    if (window != null) usage.contextSize = window;
  }
  // The model id from the Gateway is known from the start, so it wins over
  // the plan ladder's display name, which arrives with the first rung: the
  // model never changes name mid-run. A run's own `status.usage.model` wins.
  if (reported.model == null && gateway?.spec.model.name) {
    usage.model = gateway.spec.model.name;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
};

/** AgentRun (+ optional Gateway and live usage) -> stage agent run. */
export const toStageAgentRun = (
  run: Crd.AgentRun,
  context: StageAgentRunContext
): StageAgentRun => {
  const { status } = run;
  const usage = toAgentRunUsage(run, context);
  const started = status?.startTime != null;
  const application = toRunApplication(
    run.metadata,
    run.spec.env,
    context.applicationNames
  );
  const logSource =
    context.logSource ??
    (isTerminalPhase(status?.phase) ? "saved" : started ? "live" : undefined);
  return {
    name: toEntityId(run.metadata),
    runId: context.runId,
    stageId: context.stageId,
    ...(application != null ? { application } : {}),
    phase: context.phase ?? status?.phase ?? "Pending",
    ...(status?.sandboxName ? { podName: status.sandboxName } : {}),
    containers: [...AGENT_RUN_CONTAINERS],
    ...(status?.startTime != null ? { startedAt: status.startTime } : {}),
    ...(status?.completionTime != null
      ? { completedAt: status.completionTime }
      : {}),
    ...(usage != null ? { usage } : {}),
    ...(logSource != null ? { logSource } : {}),
  };
};
