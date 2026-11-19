/**
 * Run observability: what one stage's agent run did, while it runs and after
 * its pod is gone (agentic-controller#341).
 *
 * On the real backend a plan run stage is one AgentRun
 * (`AgentWorkflowRun.status.stages[].agentRunName`): one sandbox pod, one ACP
 * session. A retry is a new AgentRun. So "per agent run" is "per stage".
 *
 * Shapes follow the real backend: usage uses the ADR 0021 field names
 * (agentic-controller PR 282), transcript entries are folded from recorded
 * ACP frames, logs are read incrementally by byte offset like the observability
 * hub branch endpoint. docs/agentic-handoff.md (section 4) maps every field to its
 * source and says which sources are merged, proposed or hub branch only.
 */
import { ControllerRunPhase, EntityId } from "./types";

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

/** The AgentRun behind one plan run stage. */
export interface StageAgentRun {
  /** AgentRun `metadata.name`. Opaque: never parse it. */
  name: string;
  /** Plan run id. */
  runId: EntityId;
  stageId: EntityId;
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
