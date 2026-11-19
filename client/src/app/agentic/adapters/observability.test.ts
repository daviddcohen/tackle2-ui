/**
 * Observability adapters: recorded transcript -> entries and usage, and
 * AgentRun (+ Gateway) -> stage agent run.
 *
 * `__fixtures__/recorded-transcript/migrate-stage.jsonl` is a recorded
 * transcript in the observability hub branch recorder's line format (`{t, frame}` and
 * `{gap}`). It is assembled from the frame shapes the harness tests and
 * goose v1.55.0 use (`harness/internal/acp/session_test.go`,
 * `crates/goose-sdk-types/src/custom_notifications.rs`), not captured from a
 * cluster: no recording has been published upstream yet. It ends with a
 * request frame the recorder never keeps and a torn last line.
 */
import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

import type * as Crd from "@app/api/agentic/contract";

import {
  RecordedTranscriptLine,
  foldTranscript,
  frameToUpdate,
  parseRecordedTranscript,
  toAgentRunUsage,
  toStageAgentRun,
} from "./index";

const fixture = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, "__fixtures__", ...parts), "utf8");

const recorded = fixture("recorded-transcript", "migrate-stage.jsonl");

const gateway = yaml.load(
  fixture("agentic-controller-369070c6", "samples", "gateway_anthropic.yaml")
) as Crd.Gateway;

const goose = (
  update: Record<string, unknown>,
  t = "2026-11-06T10:00:00Z"
) => ({
  t,
  frame: {
    jsonrpc: "2.0",
    method: "_goose/unstable/session/update",
    params: { sessionId: "s1", update },
  },
});

const acp = (update: Record<string, unknown>, t = "2026-11-06T10:00:00Z") => ({
  t,
  frame: {
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId: "s1", update },
  },
});

describe("parseRecordedTranscript", () => {
  it("keeps frame and gap lines and drops torn, blank and malformed lines", () => {
    const lines = parseRecordedTranscript(recorded);
    expect(lines).toHaveLength(28);
    expect(lines.filter((line) => "gap" in line)).toHaveLength(1);
    expect(
      parseRecordedTranscript('\n{"t":1,"frame":{}}\nnot json\n{"gap":{}}\n')
    ).toEqual([]);
  });
});

describe("frameToUpdate", () => {
  it("accepts both update methods and nothing else", () => {
    expect(
      frameToUpdate(acp({ sessionUpdate: "plan", entries: [] }).frame)
    ).toEqual({ sessionUpdate: "plan", entries: [] });
    expect(
      frameToUpdate(goose({ sessionUpdate: "usage_update" }).frame)
    ).toEqual({ sessionUpdate: "usage_update" });
    expect(
      frameToUpdate({ method: "session/request_permission", params: {} })
    ).toBeUndefined();
    expect(
      frameToUpdate({ method: "session/update", params: { update: {} } })
    ).toBeUndefined();
    expect(frameToUpdate("nope")).toBeUndefined();
  });
});

describe("foldTranscript", () => {
  const folded = foldTranscript(parseRecordedTranscript(recorded));

  it("folds the recorded frames into ordered entries", () => {
    expect(folded.entries.map((entry) => entry.kind)).toEqual([
      "plan",
      "thought",
      "message",
      "toolCall",
      "toolCall",
      "gap",
      "status",
      "message",
      "message",
      "message",
      "toolCall",
      "status",
    ]);
    expect(folded.entries.map((entry) => entry.id)).toEqual(
      folded.entries.map((_, index) => String(index))
    );
  });

  it("stamps entries with the recorded time, not the time of the fold", () => {
    const [plan, thought] = folded.entries;
    expect(plan).toMatchObject({ at: "2026-11-06T10:00:00.120Z" });
    expect(thought).toMatchObject({ at: "2026-11-06T10:00:07.011Z" });
  });

  it("joins streamed chunks of one message and splits on a new message id", () => {
    expect(folded.entries[1]).toMatchObject({
      kind: "thought",
      text: "The analysis found 42 incidents. Start with the persistence layer.",
    });
    expect(folded.entries[2]).toMatchObject({
      kind: "message",
      role: "agent",
      text: "I will replace the `javax.persistence` imports first, then build.",
    });
    expect(folded.entries[8]).toMatchObject({
      text: "Understood, the timers stay.",
    });
    expect(folded.entries[9]).toMatchObject({ text: "The build now passes." });
  });

  it("shows a steer as a user message and drops the replayed prompt", () => {
    const users = folded.entries.filter(
      (entry) => entry.kind === "message" && entry.role === "user"
    );
    expect(users).toEqual([
      expect.objectContaining({ text: "Keep the EJB timers for now." }),
    ]);
  });

  it("merges tool call updates into their call, with output and diffs", () => {
    expect(folded.entries[3]).toEqual({
      kind: "toolCall",
      id: "3",
      at: "2026-11-06T10:00:09.004Z",
      toolCallId: "toolu_01RdX",
      title:
        "developer__text_editor · src/main/java/com/example/coolstore/model/Product.java",
      toolKind: "edit",
      status: "completed",
      output: "The file has been edited.",
      diffs: [
        {
          path: "src/main/java/com/example/coolstore/model/Product.java",
          oldText: "import javax.persistence.Entity;",
          newText: "import jakarta.persistence.Entity;",
        },
      ],
    });
    expect(folded.entries[4]).toMatchObject({
      toolCallId: "toolu_02Mvn",
      toolKind: "execute",
      status: "failed",
      output: expect.stringContaining("package javax.ejb does not exist"),
    });
    expect(folded.entries[10]).toMatchObject({
      toolCallId: "harness-push-1",
      status: "completed",
    });
    expect(folded.entries[10]).not.toHaveProperty("output");
  });

  it("replaces a tool call's content with each update that carries content (ACP)", () => {
    const { entries } = foldTranscript([
      acp({
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "Build",
        kind: "execute",
        status: "pending",
      }),
      acp({
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "in_progress",
        content: [
          { type: "content", content: { type: "text", text: "Compiling" } },
          { type: "diff", path: "a.txt", oldText: "a", newText: "b" },
        ],
      }),
      acp({
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "completed",
        content: [
          { type: "content", content: { type: "text", text: "Build passed" } },
          { type: "diff", path: "a.txt", oldText: "a", newText: "c" },
        ],
      }),
      // No content: the call keeps what it has.
      acp({
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        title: "Build all",
      }),
    ]);
    expect(entries).toEqual([
      expect.objectContaining({
        toolCallId: "t1",
        title: "Build all",
        status: "completed",
        output: "Build passed",
        diffs: [{ path: "a.txt", oldText: "a", newText: "c" }],
      }),
    ]);

    // An empty content collection clears it.
    const cleared = foldTranscript([
      acp({
        sessionUpdate: "tool_call",
        toolCallId: "t2",
        title: "Read",
        content: [{ type: "content", content: { type: "text", text: "x" } }],
      }),
      acp({ sessionUpdate: "tool_call_update", toolCallId: "t2", content: [] }),
    ]);
    expect(cleared.entries[0]).not.toHaveProperty("output");
  });

  it("starts a new entry for every tool call without an id", () => {
    const { entries } = foldTranscript([
      acp({ sessionUpdate: "tool_call", title: "First", status: "completed" }),
      acp({ sessionUpdate: "tool_call", title: "Second", status: "pending" }),
    ]);
    expect(entries).toEqual([
      expect.objectContaining({ title: "First", status: "completed" }),
      expect.objectContaining({ title: "Second", status: "pending" }),
    ]);
  });

  it("keeps one plan, in place, with the latest ladder", () => {
    const plans = folded.entries.filter((entry) => entry.kind === "plan");
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      entries: [
        { status: "completed" },
        {
          content:
            "Migrate: Replace javax with jakarta namespaces (31 of 150 turns)",
          status: "completed",
        },
        { status: "completed" },
      ],
    });
  });

  it("keeps notices, drops progress lines, and marks the gap", () => {
    expect(
      folded.entries
        .filter((entry) => entry.kind === "status")
        .map((entry) => (entry.kind === "status" ? entry.text : ""))
    ).toEqual([
      "Context compacted to stay within the model's window.",
      "Stage succeeded: results pushed to konveyor/migration-1730887200.",
    ]);
    expect(folded.entries[5]).toEqual({
      kind: "gap",
      id: "5",
      from: "2026-11-06T10:00:14.000Z",
      to: "2026-11-06T10:02:44.000Z",
    });
  });

  it("folds usage: latest snapshot, peak, compactions, tokens, cost, turns", () => {
    expect(folded.usage).toEqual({
      contextUsed: 41003,
      contextSize: 200000,
      peakContextUsed: 164310,
      compactions: 1,
      inputTokens: 402833,
      outputTokens: 9840,
      cost: 1.41,
      currency: "USD",
      turnsUsed: 31,
      maxTurns: 150,
      model: "Claude Sonnet 4.5",
    });
  });

  it("treats a zero as not reported (goose on Bedrock)", () => {
    const lines: RecordedTranscriptLine[] = [
      goose({
        sessionUpdate: "usage_update",
        used: 0,
        contextLimit: 200000,
        accumulatedInputTokens: 0,
        accumulatedOutputTokens: 0,
      }),
    ];
    expect(foldTranscript(lines).usage).toEqual({ contextSize: 200000 });
  });

  it("defaults goose costs to USD and falls back to summed response costs", () => {
    expect(
      foldTranscript([
        goose({
          sessionUpdate: "usage_update",
          used: 10,
          accumulatedCost: 0.5,
        }),
      ]).usage
    ).toMatchObject({ cost: 0.5, currency: "USD" });
    expect(
      foldTranscript([
        goose({ sessionUpdate: "message_usage", usage: { cost: 0.25 } }),
        goose({ sessionUpdate: "message_usage", usage: { cost: 0.5 } }),
      ]).usage
    ).toEqual({ compactions: 0, cost: 0.75, currency: "USD" });
  });

  it("returns no entries and empty usage for an empty recording", () => {
    expect(foldTranscript([])).toEqual({ entries: [], usage: {} });
  });

  it("keeps ids stable when the same transcript grows", () => {
    const lines = parseRecordedTranscript(recorded);
    const shorter = foldTranscript(lines.slice(0, 12)).entries;
    const longer = foldTranscript(lines).entries;
    shorter.forEach((entry, index) => {
      expect(longer[index].id).toBe(entry.id);
      expect(longer[index].kind).toBe(entry.kind);
    });
  });
});

const agentRun = (
  status: Crd.AgentRunStatus,
  execution: Crd.ExecutionSpec = { mode: "auto", maxTurns: 150 }
): Crd.AgentRun => ({
  apiVersion: "konveyor.io/v1alpha1",
  kind: "AgentRun",
  metadata: { name: "run-1-migrate" },
  spec: { agentRef: "code-migrator", gateway: "anthropic", execution },
  status,
});

const running = agentRun({
  phase: "Running",
  sandboxName: "run-1-migrate",
  startTime: "2026-11-06T10:00:00Z",
});

const succeeded = agentRun({
  phase: "Succeeded",
  sandboxName: "run-1-migrate",
  startTime: "2026-11-06T10:00:00Z",
  completionTime: "2026-11-06T10:45:00Z",
  terminationData: {
    exitCode: 0,
    outcome: "succeeded",
    stopReason: "end_turn",
    usage: { turnsUsed: 166, contextUsed: 121000, contextSize: 200000 },
  },
});

describe("toAgentRunUsage", () => {
  it("uses live usage while running, with the turn budget and the Gateway window", () => {
    expect(
      toAgentRunUsage(running, {
        gateway,
        liveUsage: { contextUsed: 50000, inputTokens: 80000 },
      })
    ).toEqual({
      contextUsed: 50000,
      inputTokens: 80000,
      maxTurns: 150,
      contextSize: 200000,
      model: "claude-sonnet-4-5-20250929",
    });
  });

  it("names the model by the Gateway's id, not the plan ladder's display name", () => {
    expect(
      toAgentRunUsage(running, {
        gateway,
        liveUsage: { contextUsed: 50000, model: "Claude Sonnet 4.5" },
      })?.model
    ).toBe("claude-sonnet-4-5-20250929");
    // Without a Gateway, the ladder's name is all there is.
    expect(
      toAgentRunUsage(running, {
        liveUsage: { model: "Claude Sonnet 4.5" },
      })?.model
    ).toBe("Claude Sonnet 4.5");
  });

  it("prefers terminationData.usage and keeps live fields it lacks", () => {
    expect(
      toAgentRunUsage(succeeded, {
        liveUsage: { contextUsed: 99, inputTokens: 1290000 },
      })
    ).toEqual({
      contextUsed: 121000,
      contextSize: 200000,
      turnsUsed: 166,
      inputTokens: 1290000,
      maxTurns: 150,
    });
  });

  it("prefers ADR 0021 status.usage: cost parsed, zero count kept, zero context dropped", () => {
    const typed = agentRun({
      ...succeeded.status,
      usage: {
        inputTokens: 1290000,
        outputTokens: 61000,
        peakContextUsed: 194000,
        compactions: 0,
        contextUsed: 0,
        contextSize: 200000,
        turnsUsed: 166,
        cost: "4.59",
        currency: "USD",
        model: "claude-sonnet-4-5",
      },
    });
    expect(toAgentRunUsage(typed, { gateway })).toEqual({
      inputTokens: 1290000,
      outputTokens: 61000,
      peakContextUsed: 194000,
      compactions: 0,
      contextSize: 200000,
      turnsUsed: 166,
      cost: 4.59,
      currency: "USD",
      model: "claude-sonnet-4-5",
      maxTurns: 150,
    });
  });

  it("is undefined when nothing is reported", () => {
    expect(toAgentRunUsage(agentRun({ phase: "Pending" }, {}))).toBeUndefined();
  });
});

describe("toStageAgentRun", () => {
  it("maps a running AgentRun", () => {
    expect(
      toStageAgentRun(running, {
        runId: "1",
        stageId: "2",
        gateway,
        liveUsage: { contextUsed: 50000 },
      })
    ).toEqual({
      name: "run-1-migrate",
      runId: "1",
      stageId: "2",
      phase: "Running",
      podName: "run-1-migrate",
      containers: ["skill-loader", "agent"],
      startedAt: "2026-11-06T10:00:00Z",
      usage: {
        contextUsed: 50000,
        contextSize: 200000,
        maxTurns: 150,
        model: "claude-sonnet-4-5-20250929",
      },
      logSource: "live",
    });
  });

  it("maps a finished AgentRun with saved logs", () => {
    expect(
      toStageAgentRun(succeeded, { runId: "1", stageId: "2" })
    ).toMatchObject({
      phase: "Succeeded",
      completedAt: "2026-11-06T10:45:00Z",
      logSource: "saved",
    });
  });

  it("lets the stage phase and the log source from the endpoints win", () => {
    expect(
      toStageAgentRun(succeeded, {
        runId: "1",
        stageId: "2",
        phase: "Failed",
        logSource: "live",
      })
    ).toMatchObject({
      phase: "Failed",
      logSource: "live",
    });
  });

  it("has no pod, start, usage or log source before the pod exists", () => {
    const pending = toStageAgentRun(agentRun({ phase: "Pending" }, {}), {
      runId: "1",
      stageId: "2",
    });
    expect(pending).toEqual({
      name: "run-1-migrate",
      runId: "1",
      stageId: "2",
      phase: "Pending",
      containers: ["skill-loader", "agent"],
    });
  });
});
