/**
 * Recorded ACP transcript -> transcript entries and usage.
 *
 * Input: the lines of a recorded transcript, as the observability hub branch recorder
 * writes them (`transcript.jsonl`, served by GET
 * `/hub/agentic/agentruns/{name}/transcript` as NDJSON; on the observability hub
 * branch `agentic-observability`, proposed upstream in agentic-controller#341):
 * `{"t": <receive time>, "frame": <raw ACP JSON-RPC notification>}` or
 * `{"gap": {"from", "to"}}` where recording was interrupted.
 *
 * The fold is a port of the transcript model of the hub UI prototype
 * (branch agentic-observability, `transcript-model.ts`
 * `reduceUpdate` and `mergeUsage`), with these changes: entries carry the
 * recorded time `t` instead of the time of the fold, a streamed message
 * ends when goose starts a new message id, usage follows ADR 0021
 * (compactions, peak, model; a zero is "not reported"), and tool calls
 * follow the ACP update semantics: a `tool_call_update` that carries
 * `content` replaces the call's content (output and diffs) instead of
 * appending to it, and a `tool_call` without an id is a call of its own.
 *
 * The same folder can take live frames from an ACP session (`acp.ts`
 * `onUpdate`), so a live view and a recorded one show the same entries.
 */
import type { SessionUpdate } from "@app/api/agentic/acp";
import { GOOSE_UPDATE_METHOD, PLAN_META_KEY } from "@app/api/agentic/acp";

import {
  AgentRunUsage,
  TranscriptDiff,
  TranscriptEntry,
  TranscriptPlanEntryStatus,
  TranscriptToolCallStatus,
} from "../observability";

/** One line of a recorded transcript. */
export type RecordedTranscriptLine =
  | { t: string; frame: unknown }
  | { gap: { from: string; to: string } };

export interface FoldedTranscript {
  entries: TranscriptEntry[];
  /** Usage folded from `usage_update`, `message_usage` and plan frames; `{}` when none. */
  usage: AgentRunUsage;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** A positive finite number, else undefined: a zero is "not reported". */
const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

/** A non-negative integer, else undefined (turn counters may be 0). */
const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

const max = (a: number | undefined, b: number | undefined) =>
  a == null ? b : b == null ? a : Math.max(a, b);

/** Recorded times carry nanoseconds; entries use millisecond ISO strings. */
const toIsoTime = (time: string): string => {
  const ms = Date.parse(time);
  return Number.isNaN(ms) ? time : new Date(ms).toISOString();
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const isRecordedLine = (value: unknown): value is RecordedTranscriptLine => {
  if (!isRecord(value)) return false;
  if (isRecord(value.gap)) {
    return (
      typeof value.gap.from === "string" && typeof value.gap.to === "string"
    );
  }
  return typeof value.t === "string" && "frame" in value;
};

/**
 * Splits an NDJSON transcript into lines. Blank, malformed and torn lines
 * (a partial last line while recording) are dropped.
 */
export const parseRecordedTranscript = (
  ndjson: string
): RecordedTranscriptLine[] =>
  ndjson.split("\n").flatMap((line) => {
    if (line.trim() === "") return [];
    try {
      const value: unknown = JSON.parse(line);
      return isRecordedLine(value) ? [value] : [];
    } catch {
      return [];
    }
  });

/**
 * The `session/update` payload of a recorded frame, by the rules of
 * `AcpSession.handleNotification`: either update method, with an update
 * that names its kind.
 */
export const frameToUpdate = (frame: unknown): SessionUpdate | undefined => {
  if (!isRecord(frame)) return undefined;
  if (frame.method !== "session/update" && frame.method !== GOOSE_UPDATE_METHOD)
    return undefined;
  const update = isRecord(frame.params) ? frame.params.update : undefined;
  return isRecord(update) && typeof update.sessionUpdate === "string"
    ? (update as SessionUpdate)
    : undefined;
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** Running usage counters, plus the per-response cost sum used as a fallback. */
export interface UsageFold {
  usage: AgentRunUsage;
  /** Sum of `message_usage.usage.cost`, for runtimes that report no total. */
  summedCost?: number;
}

/**
 * Folds one usage frame into the counters (`mergeUsage` in the hub UI prototype).
 *
 * - goose `usage_update` (custom channel): `used`, `contextLimit`,
 *   `accumulatedInputTokens`, `accumulatedOutputTokens`, `accumulatedCost`;
 *   the standard ACP `usage_update`: `used`, `size`, `cost.{amount,currency}`.
 *   Both are session-cumulative snapshots: the latest non-zero value wins.
 *   goose reports cost in USD, so its cost defaults the currency to USD (the
 *   goose adapter rule of ADR 0021).
 * - goose `message_usage` (one per model call): counts compactions
 *   (`usage.isCompaction`), feeds the peak context (`usage.inputTokens` is
 *   the context sent with that call) and sums `usage.cost`.
 *
 * A zero is "not reported" (goose on Bedrock reports `used: 0`).
 */
export const mergeUsage = (
  fold: UsageFold,
  update: SessionUpdate
): UsageFold => {
  const { usage } = fold;
  if (update.sessionUpdate === "message_usage") {
    const data = isRecord(update.usage) ? update.usage : {};
    const cost = positive(data.cost);
    return {
      usage: {
        ...usage,
        compactions:
          (usage.compactions ?? 0) + (data.isCompaction === true ? 1 : 0),
        peakContextUsed: max(usage.peakContextUsed, positive(data.inputTokens)),
      },
      summedCost:
        cost == null ? fold.summedCost : (fold.summedCost ?? 0) + cost,
    };
  }
  if (update.sessionUpdate !== "usage_update") return fold;
  const standardCost = isRecord(update.cost) ? update.cost : undefined;
  const gooseCost = positive(update.accumulatedCost);
  const used = positive(update.used);
  return {
    ...fold,
    usage: {
      ...usage,
      contextUsed: used ?? usage.contextUsed,
      contextSize:
        positive(update.contextLimit) ??
        positive(update.size) ??
        usage.contextSize,
      peakContextUsed: max(usage.peakContextUsed, used),
      inputTokens: positive(update.accumulatedInputTokens) ?? usage.inputTokens,
      outputTokens:
        positive(update.accumulatedOutputTokens) ?? usage.outputTokens,
      cost: gooseCost ?? positive(standardCost?.amount) ?? usage.cost,
      currency:
        str(standardCost?.currency) ||
        usage.currency ||
        (gooseCost != null ? "USD" : undefined),
    },
  };
};

/** Turns, turn budget and model from the harness plan ladder (`_meta["konveyor.io/plan"]`). */
const mergePlanUsage = (
  usage: AgentRunUsage,
  update: SessionUpdate
): AgentRunUsage => {
  if (!Array.isArray(update.entries)) return usage;
  let next = usage;
  update.entries.forEach((entry) => {
    const meta =
      isRecord(entry) && isRecord(entry._meta)
        ? entry._meta[PLAN_META_KEY]
        : undefined;
    if (!isRecord(meta)) return;
    next = {
      ...next,
      turnsUsed: count(meta.turnsUsed) ?? next.turnsUsed,
      maxTurns: positive(meta.maxTurns) ?? next.maxTurns,
      model: str(meta.model) || next.model,
    };
  });
  return next;
};

const finalUsage = ({ usage, summedCost }: UsageFold): AgentRunUsage => {
  const cost = usage.cost ?? summedCost;
  const result: AgentRunUsage = {
    ...usage,
    cost,
    currency: usage.currency ?? (cost != null ? "USD" : undefined),
  };
  (Object.keys(result) as (keyof AgentRunUsage)[]).forEach((key) => {
    if (result[key] === undefined) delete result[key];
  });
  return result;
};

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const TOOL_STATUSES: Record<string, TranscriptToolCallStatus> = {
  pending: "pending",
  in_progress: "inProgress",
  completed: "completed",
  failed: "failed",
};

const PLAN_STATUSES: Record<string, TranscriptPlanEntryStatus> = {
  pending: "pending",
  in_progress: "inProgress",
  completed: "completed",
};

/** Text of an ACP content block (`{type: "text", text}`). */
const contentText = (content: unknown): string =>
  isRecord(content) && content.type === "text" ? str(content.text) : "";

/** goose's vendor metadata on an update (`_meta.goose`). */
const gooseMeta = (update: SessionUpdate): JsonRecord =>
  isRecord(update._meta) && isRecord(update._meta.goose)
    ? update._meta.goose
    : {};

const messageIdOf = (update: SessionUpdate): string =>
  str(gooseMeta(update).messageId) || str(update.messageId);

/** Text in tool call content: `[{type: "content", content: {type: "text"}}]`. */
const toolOutput = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .map((block) =>
          isRecord(block) && block.type === "content"
            ? contentText(block.content)
            : ""
        )
        .filter((text) => text !== "")
        .join("\n")
    : "";

/** Diffs in tool call content: `[{type: "diff", path, oldText, newText}]`. */
const toolDiffs = (content: unknown): TranscriptDiff[] =>
  Array.isArray(content)
    ? content.flatMap((block) =>
        isRecord(block) &&
        block.type === "diff" &&
        typeof block.path === "string" &&
        typeof block.newText === "string"
          ? [
              {
                path: block.path,
                ...(typeof block.oldText === "string"
                  ? { oldText: block.oldText }
                  : {}),
                newText: block.newText,
              },
            ]
          : []
      )
    : [];

/**
 * Folds ACP updates into transcript entries and usage, in order. Entry ids
 * are positions in the fold, so folding the same frames again (a refetch
 * that returns more of the same transcript) keeps every id.
 */
export class TranscriptFolder {
  private readonly items: TranscriptEntry[] = [];
  private usageFold: UsageFold = { usage: {} };
  private nextId = 0;
  /** goose message id of the streamed message the last entry belongs to. */
  private streamMessageId = "";

  /** Applies one update recorded (or received) at `at`. */
  apply(update: SessionUpdate, at: string): void {
    const time = toIsoTime(at);
    switch (update.sessionUpdate) {
      case "usage_update":
      case "message_usage":
        this.usageFold = mergeUsage(this.usageFold, update);
        return;
      case "agent_message_chunk":
      case "agent_thought_chunk":
        this.appendChunk(update, time);
        return;
      case "user_message_chunk":
        // Only a mid-turn steer is transcript material; other user chunks
        // replay the prompt the harness sent.
        if (gooseMeta(update).steer === true) this.appendChunk(update, time);
        return;
      case "plan":
        this.applyPlan(update, time);
        return;
      case "tool_call":
      case "tool_call_update":
        this.applyToolCall(update, time);
        return;
      case "status_message": {
        // Notices are transcript material (goose's, and the harness's stage
        // outcome); progress lines are transient.
        const status = isRecord(update.status) ? update.status : {};
        const text = str(status.message);
        if (status.type === "notice" && text !== "") {
          this.push({ kind: "status", id: "", at: time, text });
        }
        return;
      }
      default:
        return;
    }
  }

  /** Marks where recording was interrupted. */
  gap(from: string, to: string): void {
    this.push({
      kind: "gap",
      id: "",
      from: toIsoTime(from),
      to: toIsoTime(to),
    });
  }

  entries(): TranscriptEntry[] {
    return [...this.items];
  }

  result(): FoldedTranscript {
    return {
      entries: this.entries(),
      usage: finalUsage(this.usageFold),
    };
  }

  private push(entry: TranscriptEntry) {
    this.items.push({ ...entry, id: String(this.nextId++) });
    this.streamMessageId = "";
  }

  private appendChunk(update: SessionUpdate, at: string) {
    const text = contentText(update.content);
    if (text === "") return;
    const messageId = messageIdOf(update);
    const kind =
      update.sessionUpdate === "agent_thought_chunk" ? "thought" : "message";
    const role =
      update.sessionUpdate === "user_message_chunk" ? "user" : "agent";
    const last = this.items[this.items.length - 1];
    const continues =
      last != null &&
      last.kind === kind &&
      (last.kind !== "message" || last.role === role) &&
      (messageId === "" ||
        this.streamMessageId === "" ||
        messageId === this.streamMessageId);
    if (continues && (last.kind === "message" || last.kind === "thought")) {
      this.items[this.items.length - 1] = { ...last, text: last.text + text };
    } else {
      this.push(
        kind === "thought"
          ? { kind, id: "", at, text }
          : { kind, id: "", at, role, text }
      );
    }
    if (messageId !== "") this.streamMessageId = messageId;
  }

  private applyPlan(update: SessionUpdate, at: string) {
    this.usageFold = {
      ...this.usageFold,
      usage: mergePlanUsage(this.usageFold.usage, update),
    };
    const entries = Array.isArray(update.entries)
      ? update.entries.filter(isRecord).flatMap((entry) => {
          const content = str(entry.content);
          return content === ""
            ? []
            : [
                {
                  content,
                  status: PLAN_STATUSES[str(entry.status)] ?? "pending",
                },
              ];
        })
      : [];
    if (entries.length === 0) return;
    // Each plan carries the whole ladder: replace the previous one in place.
    const index = this.items.findIndex((item) => item.kind === "plan");
    const previous = this.items[index];
    if (previous?.kind === "plan") {
      this.items[index] = { ...previous, entries };
      return;
    }
    this.push({ kind: "plan", id: "", at, entries });
  }

  private applyToolCall(update: SessionUpdate, at: string) {
    const toolCallId = str(update.toolCallId);
    const status = TOOL_STATUSES[str(update.status)];
    const output = toolOutput(update.content);
    const diffs = toolDiffs(update.content);
    // A call without an id cannot be updated later: a `tool_call` without
    // one starts its own entry instead of merging into the previous one.
    const isNewIdlessCall =
      update.sessionUpdate !== "tool_call_update" && toolCallId === "";
    let index = -1;
    for (let i = this.items.length - 1; i >= 0 && !isNewIdlessCall; i--) {
      const item = this.items[i];
      if (item.kind === "toolCall" && item.toolCallId === toolCallId) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      // An update for a call this transcript never saw announced is dropped.
      if (update.sessionUpdate === "tool_call_update") return;
      this.push({
        kind: "toolCall",
        id: "",
        at,
        toolCallId,
        title: str(update.title),
        ...(str(update.kind) !== "" ? { toolKind: str(update.kind) } : {}),
        status: status ?? "pending",
        ...(output !== "" ? { output } : {}),
        ...(diffs.length > 0 ? { diffs } : {}),
      });
      return;
    }
    const call = this.items[index];
    if (call.kind !== "toolCall") return;
    // ACP: `content` on an update replaces the call's content collection;
    // an update without it keeps what the call has.
    const { output: _output, diffs: _diffs, ...rest } = call;
    const content = Array.isArray(update.content)
      ? {
          ...(output !== "" ? { output } : {}),
          ...(diffs.length > 0 ? { diffs } : {}),
        }
      : {
          ...(call.output != null ? { output: call.output } : {}),
          ...(call.diffs != null ? { diffs: call.diffs } : {}),
        };
    this.items[index] = {
      ...rest,
      title: str(update.title) || call.title,
      ...(str(update.kind) !== "" ? { toolKind: str(update.kind) } : {}),
      status: status ?? call.status,
      ...content,
    };
  }
}

/** Folds recorded transcript lines into entries (with gaps) and usage. */
export const foldTranscript = (
  lines: readonly RecordedTranscriptLine[]
): FoldedTranscript => {
  const folder = new TranscriptFolder();
  lines.forEach((line) => {
    if ("gap" in line) {
      folder.gap(line.gap.from, line.gap.to);
      return;
    }
    const update = frameToUpdate(line.frame);
    if (update != null) folder.apply(update, line.t);
  });
  return folder.result();
};
