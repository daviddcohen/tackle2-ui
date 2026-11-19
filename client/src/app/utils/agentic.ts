import { AxiosError } from "axios";
import type { TooltipProps } from "@patternfly/react-core";

import {
  ControllerRunPhase,
  PlanRun,
  StageRun,
  TERMINAL_RUN_PHASES,
  getOrderedStageRuns,
} from "@app/agentic";
import type {
  AgentResource,
  AgentWorkflow,
  AgentWorkflowRun,
} from "@app/api/agentic/contract";
import {
  APPLICATION_LABEL,
  MANAGED_BY_LABEL,
  OPERATOR_DEFAULTS_MANAGER,
  invalidTargetBranchReason,
} from "@app/api/agentic/contract";
import type { Application } from "@app/api/models";
import { getAxiosErrorMessage } from "@app/utils/utils";

/**
 * True for the operator's curated default content. The operator owns these
 * objects and reverts any change on its next reconcile, so the UI offers no
 * edit or delete for them — users create their own instead.
 */
export function isOperatorManaged(resource: {
  metadata: { labels?: Record<string, string> };
}): boolean {
  return (
    resource.metadata.labels?.[MANAGED_BY_LABEL] === OPERATOR_DEFAULTS_MANAGER
  );
}

export interface DisabledActionProps {
  isAriaDisabled?: boolean;
  tooltipProps?: { content: string; position?: TooltipProps["position"] };
}

/**
 * Spread into a row kebab or detail Actions menu item: aria-disabled with
 * `reason` as its tooltip when a reason is given, enabled otherwise. A row
 * kebab's Delete passes `position: "left"` so the tooltip does not cover
 * Edit.
 */
export function disabledActionProps(
  reason?: string,
  position?: TooltipProps["position"]
): DisabledActionProps {
  return reason != null
    ? {
        isAriaDisabled: true,
        tooltipProps:
          position != null
            ? { content: reason, position }
            : { content: reason },
      }
    : {};
}

/**
 * Spread into a row kebab's Delete: disabled with `reason` as its tooltip on
 * the left, and danger only while it is enabled. Callers pass
 * the managed reason first, then the usage blocker
 * (`managedReason ?? usageReason`).
 */
export function deleteActionProps(
  reason?: string
): DisabledActionProps & { isDanger: boolean } {
  return { isDanger: reason == null, ...disabledActionProps(reason, "left") };
}

/**
 * `disabledActionProps` for an Edit or Delete action of an operator-managed
 * object: disabled with `tooltip` saying why. Domain objects pass their
 * `operatorManaged` flag.
 */
export function managedActionProps(
  isManaged: boolean | undefined,
  tooltip: string,
  position?: TooltipProps["position"]
): DisabledActionProps {
  return disabledActionProps(isManaged ? tooltip : undefined, position);
}

/** kubectl-style compact age: 45s, 12m, 3h, 2d. */
export function formatAge(creationTimestamp?: string): string {
  if (!creationTimestamp) return "-";
  const ms = Date.now() - new Date(creationTimestamp).getTime();
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function formatDuration(seconds?: number): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Workflow-run status has no duration field — derive it from timestamps. */
export function workflowRunDuration(run: AgentWorkflowRun): number | undefined {
  const start = run.status?.startTime;
  if (!start) return undefined;
  const end = run.status?.completionTime;
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
  return ms >= 0 ? Math.round(ms / 1000) : undefined;
}

/**
 * When a stage awaiting approval stopped: its agent's last message. A
 * `StageRun` has no completion time until it is approved, but the waiting
 * is not the agent's work, so its clock stops there.
 */
const awaitingSince = (stageRun?: Pick<StageRun, "messages">) => {
  const times = (stageRun?.messages ?? [])
    .filter((message) => message.role === "agent")
    .map((message) => Date.parse(message.timestamp));
  return times.length > 0 ? Math.max(...times) : Number.NaN;
};

/** Seconds from `startedAt` to `end`, or undefined when either is unknown. */
const secondsBetween = (startedAt: string | undefined, end: number) => {
  if (!startedAt) return undefined;
  const seconds = Math.round((end - Date.parse(startedAt)) / 1000);
  return seconds >= 0 ? seconds : undefined;
};

/**
 * The end of a run's or stage's clock: its completion, now while it is
 * running, or `awaiting()` while it waits for approval. NaN for a finished
 * one without a completion time.
 */
const clockEnd = (
  { status, completedAt }: { status: ControllerRunPhase; completedAt?: string },
  awaiting: () => number,
  now: number
) =>
  completedAt
    ? Date.parse(completedAt)
    : status === "AwaitingApproval"
      ? awaiting()
      : TERMINAL_RUN_PHASES.includes(status)
        ? Number.NaN
        : now;

/**
 * Seconds a stage has taken: from start to completion, or to
 * now while it is running. A stage awaiting approval stops at its agent's
 * last message. Undefined while Pending, for a finished stage without a
 * completion time and for an awaiting stage without messages. `StageRun`
 * carries no duration field; this is the one place it is derived.
 */
export function stageRunDurationSeconds(
  stageRun: Pick<StageRun, "status" | "startedAt" | "completedAt" | "messages">,
  now: number = Date.now()
): number | undefined {
  if (stageRun.status === "Pending") return undefined;
  return secondsBetween(
    stageRun.startedAt,
    clockEnd(stageRun, () => awaitingSince(stageRun), now)
  );
}

/**
 * Seconds a plan run has taken: from start to completion, or to
 * now while it is running. A run awaiting approval stops where its awaiting
 * stage stopped, so the wait for a decision does not count. Undefined while
 * Pending (a pending run's `startedAt` is not a start; see
 * docs/agentic-handoff.md), for a finished run without a completion time and
 * for an awaiting run whose stage has no messages. `PlanRun` carries no
 * duration field; this is the one place it is derived.
 */
export function planRunDurationSeconds(
  planRun: Pick<PlanRun, "status" | "startedAt" | "completedAt"> & {
    stageRuns: Pick<StageRun, "status" | "messages">[];
  },
  now: number = Date.now()
): number | undefined {
  if (planRun.status === "Pending") return undefined;
  return secondsBetween(
    planRun.startedAt,
    clockEnd(
      planRun,
      () =>
        awaitingSince(
          planRun.stageRuns.find((s) => s.status === "AwaitingApproval")
        ),
      now
    )
  );
}

/** Where a plan run is: one of its stages and that stage's place in the run. */
export interface CurrentStage {
  stageRun: StageRun;
  /** 1-based position in stage order. */
  position: number;
  total: number;
}

/**
 * The stage a plan run is at, for the run status line ("Stage n of m:
 * {stage}") and the runs table: the stage awaiting
 * approval, else the running one, else the failed one. Undefined while no
 * stage is in one of these states (a pending or succeeded run).
 */
export function getCurrentStage(planRun: PlanRun): CurrentStage | undefined {
  const stageRuns = getOrderedStageRuns(planRun);
  for (const status of ["AwaitingApproval", "Running", "Failed"] as const) {
    const index = stageRuns.findIndex((stageRun) => stageRun.status === status);
    if (index >= 0) {
      return {
        stageRun: stageRuns[index],
        position: index + 1,
        total: stageRuns.length,
      };
    }
  }
  return undefined;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

// ------------------------------------------- application <-> run label

/** The label value runs carry: hub application id as a string. */
export const applicationLabelValue = (app: Application): string =>
  String(app.id);

/** True when `run` belongs to `app` via the konveyor.io/application label. */
export const runBelongsToApplication = (
  run: { metadata: { labels?: Record<string, string> } },
  appId: number
): boolean => run.metadata.labels?.[APPLICATION_LABEL] === String(appId);

/**
 * Display name for the application a run is labeled with: the application's
 * name, `#<id>` when the id no longer resolves in the inventory, "" when the
 * run carries no application label (pre-label runs, workflow stage runs).
 */
export const runApplicationDisplayName = (
  run: { metadata: { labels?: Record<string, string> } },
  applicationsById: Map<string, Application>
): string => {
  const id = run.metadata.labels?.[APPLICATION_LABEL];
  if (!id) return "";
  return applicationsById.get(id)?.name ?? `#${id}`;
};

// ------------------------------------------------- run eligibility

/**
 * The subset of an application these checks need. Kept structural (rather
 * than importing `Application` directly) so this module's run-eligibility
 * helpers stay decoupled from the hub model shape.
 */
export interface RunnableApplication {
  name?: string;
  repository?: { url?: string; branch?: string };
}

/**
 * Why a run cannot be created for an application. Structural rather than a
 * message so callers own their own wording — a modal renders one of these
 * inline, while a bulk caller lists them as exclusions.
 */
export type RunBlocker =
  | { kind: "noRepository" }
  | { kind: "branchInvalid"; detail: string }
  | { kind: "branchMatchesSource"; branch: string };

/**
 * Why no run can target this application, regardless of agent or branch. The
 * harness clones from the Hub record, so an application with no repository
 * URL dooms every stage before it starts.
 */
export function applicationRunBlocker(
  app: RunnableApplication
): RunBlocker | undefined {
  return app.repository?.url ? undefined : { kind: "noRepository" };
}

/**
 * Why `branch` cannot be this application's target branch. Mirrors what the
 * shim re-validates on create: a valid git refname that differs from the
 * source branch (the harness refuses to push onto the source branch).
 */
export function targetBranchBlocker(
  app: RunnableApplication,
  branch: string
): RunBlocker | undefined {
  const detail = invalidTargetBranchReason(branch);
  if (detail) return { kind: "branchInvalid", detail };
  const source = app.repository?.branch;
  if (source && branch.trim() === source)
    return { kind: "branchMatchesSource", branch: source };
  return undefined;
}

/** Both checks; the branch check is skipped when no branch is chosen yet. */
export function runBlocker(
  app: RunnableApplication,
  branch?: string
): RunBlocker | undefined {
  return (
    applicationRunBlocker(app) ??
    (branch === undefined ? undefined : targetBranchBlocker(app, branch))
  );
}

// ------------------------------------------------- workflow stage preflight

/** One stage of a workflow that would fail as launched. */
export interface StagePreflightFailure {
  stage: string;
  agent: string;
  /** Required, defaultless params the launch does not supply. */
  missingParams?: string[];
  /** The stage's agentRef resolves to no Agent (name refs fail at run). */
  agentMissing?: boolean;
}

/**
 * Predict the failures a run of `workflow` hits on arrival, given the param
 * names the caller will supply. A required param with no default that nobody
 * supplies dies as InvalidParams the moment its stage starts, and a dangling
 * agentRef never starts at all — for a bulk launch (which supplies no
 * params) either one dooms every run in the batch, so the modal must count
 * it before claiming applications are eligible.
 *
 * Callers fail open: only invoke this once the agents list has genuinely
 * loaded — an empty list mid-fetch is not evidence of dangling refs.
 */
export function workflowStagePreflight(
  workflow: AgentWorkflow,
  agents: AgentResource[],
  suppliedParams: ReadonlySet<string> = new Set()
): StagePreflightFailure[] {
  const agentsByName = new Map(agents.map((a) => [a.metadata.name ?? "", a]));
  const failures: StagePreflightFailure[] = [];
  for (const stage of workflow.spec.stages ?? []) {
    const agent = agentsByName.get(stage.agentRef);
    if (!agent) {
      failures.push({
        stage: stage.name,
        agent: stage.agentRef,
        agentMissing: true,
      });
      continue;
    }
    const missingParams = (agent.spec.params ?? [])
      .filter(
        (p) => p.required && p.default == null && !suppliedParams.has(p.name)
      )
      .map((p) => p.name);
    if (missingParams.length > 0)
      failures.push({
        stage: stage.name,
        agent: stage.agentRef,
        missingParams,
      });
  }
  return failures;
}

/**
 * True when the application has a source-role credential assigned. Every
 * stage ends by pushing the target branch to the application's repository,
 * so a run against an application without one does all its work and then
 * dies at the push — callers surface this at launch rather than block on
 * it (a global default identity may still cover the app).
 */
export function hasSourceCredential(
  app: Pick<Application, "identities">
): boolean {
  return app.identities?.some((i) => i.role === "source") ?? false;
}

/**
 * Split a selection into the applications a run can be created for and those
 * it cannot, so a caller can act on the eligible subset and report the rest
 * instead of blocking the whole batch on one bad application.
 */
export function partitionByRunEligibility<T extends RunnableApplication>(
  applications: T[],
  branchFor?: (app: T) => string
): { eligible: T[]; excluded: { application: T; blocker: RunBlocker }[] } {
  const eligible: T[] = [];
  const excluded: { application: T; blocker: RunBlocker }[] = [];
  for (const application of applications) {
    const blocker = runBlocker(application, branchFor?.(application));
    if (blocker) excluded.push({ application, blocker });
    else eligible.push(application);
  }
  return { eligible, excluded };
}

// ------------------------------------------------------------ fetch errors

/**
 * True when a Hub `/hub/agentic/*` request failed because the Hub's own
 * ServiceAccount was denied by Kubernetes RBAC. The Hub reads agentic CRs from
 * its own namespace only, so this fires when the resources (or the Role that
 * grants `konveyor.io` access) were created somewhere else — the message looks
 * like `agents.konveyor.io is forbidden: User "system:serviceaccount:...:tackle-hub"
 * cannot list resource "agents" in API group "konveyor.io" in the namespace "..."`.
 */
export function isAgenticRbacError(error: unknown): boolean {
  if (!(error instanceof AxiosError)) return false;
  const status = error.response?.status;
  if (status !== 500 && status !== 403) return false;
  const message = getAxiosErrorMessage(error);
  return /forbidden/i.test(message) && /konveyor\.io/.test(message);
}
