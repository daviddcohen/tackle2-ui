/**
 * Run observability: what one stage's agent run did, while it runs and after
 * its pod is gone (agentic-controller#341).
 *
 * On the real backend a stage of one application's AgentWorkflowRun is one
 * AgentRun (`AgentWorkflowRun.status.stages[].agentRunName`): one sandbox
 * pod, one ACP session. A retry is a new AgentRun. A plan run on several
 * applications is one AgentWorkflowRun per application, so a stage has one
 * agent run per application (`StageAgentRun.application`), and the UI
 * groups them by stage (`stageAgentRunsOf`).
 *
 * Shapes follow the real backend: usage uses the ADR 0021 field names
 * (agentic-controller PR 282), transcript entries are folded from recorded
 * ACP frames, logs are read incrementally by byte offset like the observability
 * hub branch endpoint. docs/agentic-handoff.md (section 4) maps every field to its
 * source and says which sources are merged, proposed or hub branch only.
 */
import { AgentTestRun, ControllerRunPhase, EntityId, HubRef } from "./types";

/**
 * State of an agent run's transcript recording (the hub branch recorder's
 * `X-Transcript-Status`; issue 341 proposes it as `status.recording`).
 * - `recording`: the run is live and frames are being saved;
 * - `complete`: the run finished and nothing was lost;
 * - `incomplete`: the run finished but recording was interrupted (gaps);
 * - `skipped`: never recorded by design (approve mode or askUser runs);
 * - `none`: no recording exists.
 */
export type AgentRunRecordingStatus =
  | "recording"
  | "complete"
  | "incomplete"
  | "skipped"
  | "none";

/**
 * Why the recorder skips a run (`X-Transcript-Skip-Reason`, observability hub branch
 * `record/gate.go`): recording must not change the fail-fast semantics of
 * runs a human answers.
 */
export const RECORDING_SKIP_REASONS = {
  approve: "approve mode",
  askUser: "askUser enabled",
} as const;

/** Where a log is read from: the live pod, or the copy saved after it ended. */
export type AgentRunLogSource = "live" | "saved";

/**
 * Token and context usage of one agent run. ADR 0021 field names. Every field
 * is optional: absent means "not reported", never zero. A provider that does
 * not meter context (goose on Bedrock reports `used: 0`) leaves
 * `contextUsed` absent.
 */
export interface AgentRunUsage {
  /** Tokens in the context window now (last `usage_update.used`). */
  contextUsed?: number;
  /** Context window size (`usage_update.contextLimit`, Gateway `spec.model.contextWindow`). */
  contextSize?: number;
  /** Highest context occupancy seen during the run. */
  peakContextUsed?: number;
  /** Times the runtime compacted the context. */
  compactions?: number;
  /** Accumulated over the session. */
  inputTokens?: number;
  outputTokens?: number;
  turnsUsed?: number;
  /** Turn budget (`spec.execution.maxTurns`). */
  maxTurns?: number;
  /** Cumulative cost as the runtime reported it (not computed by the platform). */
  cost?: number;
  /** ISO 4217 code of `cost`. */
  currency?: string;
  /** Model the run used. */
  model?: string;
}

/** The AgentRun behind one plan run stage, for one application of the run. */
export interface StageAgentRun {
  /** AgentRun `metadata.name`. Opaque: never parse it. */
  name: string;
  /** Plan run id. */
  runId: EntityId;
  stageId: EntityId;
  /**
   * The application this agent run works on (label
   * `konveyor.io/application`, else env `APP_ID`). Absent when the AgentRun
   * names none.
   */
  application?: HubRef;
  /** This agent run's own phase (the stage's status is the aggregate). */
  phase: ControllerRunPhase;
  /** Sandbox pod (`status.sandboxName`). */
  podName?: string;
  /** Pod containers with a log, in start order (`["skill-loader", "agent"]`). */
  containers: string[];
  startedAt?: string;
  completedAt?: string;
  usage?: AgentRunUsage;
  logSource?: AgentRunLogSource;
}

/**
 * Containers of an AgentRun pod with a log, in start order: the init
 * container that assembles the skills, then the harness with goose
 * (agentic-controller `internal/controller/agentrun_controller.go`).
 */
export const AGENT_RUN_CONTAINERS = ["skill-loader", "agent"] as const;

/**
 * The AgentRun behind an agent test run, for the agent run views (transcript,
 * logs). A test run is an AgentRun started directly: its id is the AgentRun
 * `metadata.name` (`toAgentTestRun`), so the name-based reads serve it as
 * they serve a stage's. It belongs to no plan run, so `runId` and `stageId`
 * are empty; the pod name, usage and log source are not known from the test
 * run (the views read the log source from the log itself).
 */
export const testRunAgentRun = (run: AgentTestRun): StageAgentRun => ({
  name: run.id,
  runId: "",
  stageId: "",
  ...(run.application.id !== 0 ? { application: run.application } : {}),
  phase: run.phase,
  containers: [...AGENT_RUN_CONTAINERS],
  ...(run.startedAt !== "" ? { startedAt: run.startedAt } : {}),
});

/**
 * The agent runs of one stage, in the order given (the list endpoint answers
 * stage order, then the run's application order).
 */
export const stageAgentRunsOf = (
  agentRuns: readonly StageAgentRun[],
  stageId: EntityId
): StageAgentRun[] =>
  agentRuns.filter((agentRun) => agentRun.stageId === stageId);

/** The agent run of one application among a stage's agent runs. */
export const stageAgentRunFor = (
  stageAgentRuns: readonly StageAgentRun[],
  applicationId: number | undefined
): StageAgentRun | undefined =>
  applicationId != null
    ? stageAgentRuns.find(
        (agentRun) => agentRun.application?.id === applicationId
      )
    : undefined;

/**
 * The agent run a stage page shows when no application is chosen: the first
 * one waiting for a decision (AwaitingApproval), else the first Failed one,
 * else the first in the run's application order (`applications`; agent runs
 * of other applications, or without one, follow in list order).
 */
export const defaultStageAgentRun = (
  stageAgentRuns: readonly StageAgentRun[],
  applications: readonly HubRef[] = []
): StageAgentRun | undefined => {
  const position = (agentRun: StageAgentRun) => {
    const index = applications.findIndex(
      (application) => application.id === agentRun.application?.id
    );
    return index === -1 ? applications.length : index;
  };
  const ordered = stageAgentRuns
    .map((agentRun, order) => ({ agentRun, order }))
    .sort(
      (a, b) => position(a.agentRun) - position(b.agentRun) || a.order - b.order
    )
    .map(({ agentRun }) => agentRun);
  return (
    ordered.find((agentRun) => agentRun.phase === "AwaitingApproval") ??
    ordered.find((agentRun) => agentRun.phase === "Failed") ??
    ordered[0]
  );
};

/**
 * The applications whose agent run for a stage needs a person: in a stage
 * that waits for approval, those waiting; in a failed stage, those that
 * failed. In the run's application order; empty for any other stage status
 * or when the agent runs name no application.
 */
export const stageAttentionApplications = (
  stageAgentRuns: readonly StageAgentRun[],
  stageStatus: ControllerRunPhase | undefined,
  applications: readonly HubRef[]
): HubRef[] =>
  stageStatus === "AwaitingApproval" || stageStatus === "Failed"
    ? applications.filter((application) =>
        stageAgentRuns.some(
          (agentRun) =>
            agentRun.phase === stageStatus &&
            agentRun.application?.id === application.id
        )
      )
    : [];

export type TranscriptToolCallStatus =
  | "pending"
  | "inProgress"
  | "completed"
  | "failed";

export type TranscriptPlanEntryStatus = "pending" | "inProgress" | "completed";

/** A file change a tool call made (ACP diff content; no `oldText` = new file). */
export interface TranscriptDiff {
  path: string;
  oldText?: string;
  newText: string;
}

/**
 * One entry of an agent run transcript, folded from ACP `session/update`
 * frames (streamed chunks become one message, tool call updates merge into
 * their call, each plan replaces the previous one). `at` is when the frame
 * was recorded.
 */
export type TranscriptEntry =
  | {
      kind: "message";
      id: string;
      at: string;
      /** `user` only for a human steer picked up mid-turn. */
      role: "agent" | "user";
      text: string;
    }
  | { kind: "thought"; id: string; at: string; text: string }
  | {
      kind: "toolCall";
      id: string;
      at: string;
      toolCallId: string;
      title: string;
      /** ACP tool kind (`read`, `edit`, `execute`, ...). */
      toolKind?: string;
      status: TranscriptToolCallStatus;
      output?: string;
      diffs?: TranscriptDiff[];
    }
  | {
      kind: "plan";
      id: string;
      at: string;
      entries: { content: string; status: TranscriptPlanEntryStatus }[];
    }
  /** A runtime or harness notice ("Context compacted", the stage outcome). */
  | { kind: "status"; id: string; at: string; text: string }
  /** Recording was interrupted between `from` and `to`. */
  | { kind: "gap"; id: string; from: string; to: string };

export interface AgentRunTranscript {
  status: AgentRunRecordingStatus;
  skipReason?: string;
  entries: TranscriptEntry[];
}

/**
 * An incremental read of a recorded transcript (NDJSON `{t, frame}` and gap
 * lines). Offsets count lines, as on the hub branch (ADR 0024, proposed).
 */
export interface AgentRunTranscriptChunk {
  /** `X-Transcript-Status`. */
  status: AgentRunRecordingStatus;
  /** `X-Transcript-Skip-Reason`, when the run is skipped. */
  skipReason?: string;
  /** The complete lines read (each was ended by a newline), unparsed. */
  lines: string[];
  /** Pass back as `?offset=` to get only new lines. */
  nextOffset: number;
}

/** An incremental log read. Offsets count bytes, as on the hub branch. */
export interface AgentRunLogChunk {
  container: string;
  source: AgentRunLogSource;
  /** Offset this chunk starts at. */
  offset: number;
  /** Pass back as `?offset=` to get only new text. */
  nextOffset: number;
  text: string;
  /** No more text will come: the run finished and its log is fully saved. */
  complete: boolean;
}
