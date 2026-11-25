/**
 * The run observability mock: derived from the execution world (read-only),
 * deterministic, growing while a stage runs, complete once it finished.
 * Module functions are called directly (fake clock); the last block drives
 * the handlers through the REST client like mock-server.test.ts.
 */
import { isAxiosError } from "axios";

import {
  AgentRunTranscript,
  AgentRunUsage,
  PlanRun,
  TranscriptEntry,
} from "@app/agentic";
import {
  foldTranscript,
  parseRecordedTranscript,
  toResourceName,
} from "@app/agentic/adapters";
import {
  getAgentRunLog as fetchAgentRunLog,
  getAgentRunResource as fetchAgentRunResource,
  getAgentRunTranscript as fetchAgentRunTranscript,
  getPlanRunAgentRuns,
} from "@app/api/rest/agentic";
import { server } from "@mocks/server";

import { listAgentTestRuns, startAgentTestRun, updatePlan } from "./catalog";
import { db, findApplication, resetAgenticDb } from "./db";
import {
  PENDING_MS,
  STAGE_MS,
  approveStage,
  getPlanRun,
  resetExecutionWorld,
  resolveApplicationRequest,
  startApplicationMigrations,
} from "./execution";
import handlers from "./handlers";
import {
  LONG_LOG_LINES,
  OBSERVABILITY_SCRIPT_MS,
  getAgentRunLog,
  getAgentRunResource,
  getAgentRunTranscript as readRecordedTranscript,
  listPlanRunAgentRuns,
  utf8Length,
} from "./observability";

const START = Date.parse("2026-11-17T09:00:00Z");

const setScenario = (scenario: string, stage = 1) =>
  window.history.replaceState(
    {},
    "",
    `/?protoScenario=${scenario}&protoStage=${stage}`
  );

const seed = (scenario: string, stage = 1) => {
  setScenario(scenario, stage);
  resetAgenticDb();
  resetExecutionWorld();
  // The first read seeds the world at the current (fake) time.
  getPlanRun("1");
};

const agentRunOf = (runId: string, stageId: string) => {
  const found = listPlanRunAgentRuns(runId).find(
    (run) => run.stageId === stageId
  );
  if (found == null) throw new Error(`no agent run for ${runId}/${stageId}`);
  return found;
};

const fraction = (usage: AgentRunUsage | undefined) =>
  (usage?.contextUsed ?? 0) / (usage?.contextSize ?? 1);

const texts = (entries: TranscriptEntry[]) =>
  entries.flatMap((entry) => (entry.kind === "message" ? [entry.text] : []));

/** The whole recorded transcript, folded as the UI shows it (a 404 is `none`). */
const getAgentRunTranscript = (name: string): AgentRunTranscript => {
  const { httpStatus, status, skipReason, ndjson } =
    readRecordedTranscript(name);
  if (httpStatus === 404) return { status: "none", entries: [] };
  return {
    status,
    ...(skipReason != null ? { skipReason } : {}),
    entries: foldTranscript(parseRecordedTranscript(ndjson)).entries,
  };
};

const lineCount = (text: string) => text.split("\n").length - 1;

describe("observability mock", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("a running stage", () => {
    beforeEach(() => seed("running", 2));

    it("lists started stages only, with the plan run's statuses", () => {
      const run = getPlanRun("1");
      const agentRuns = listPlanRunAgentRuns("1");
      // One per started stage per application (run 1 has three).
      expect(agentRuns.map((agentRun) => agentRun.stageId)).toEqual([
        "1",
        "1",
        "1",
        "2",
        "2",
        "2",
      ]);
      agentRuns.forEach((agentRun) => {
        const stage = run.stageRuns.find((s) => s.stageId === agentRun.stageId);
        expect(agentRun.phase).toBe(stage?.status);
      });
      expect(agentRunOf("1", "2")).toMatchObject({
        name: "run-1-migrate",
        podName: "run-1-migrate",
        containers: ["skill-loader", "agent"],
        logSource: "live",
      });
      expect(() => getAgentRunResource("run-1-validate")).toThrow(
        expect.objectContaining({ status: 404 })
      );
    });

    it("grows every few seconds, then plateaus", () => {
      const sample = () => ({
        entries: getAgentRunTranscript("run-1-migrate").entries.length,
        log: getAgentRunLog("run-1-migrate", "agent", null).nextOffset,
        usage: agentRunOf("1", "2").usage,
      });
      const samples = [sample()];
      for (let s = 5; s <= 180; s += 5) {
        jest.setSystemTime(START + s * 1000);
        samples.push(sample());
      }
      // Something changes in every 5 s window while the script runs.
      for (let i = 1; i < OBSERVABILITY_SCRIPT_MS / 5000 - 1; i++) {
        const [before, after] = [samples[i - 1], samples[i]];
        expect(after.log).toBeGreaterThan(before.log);
      }
      expect(samples[6].entries).toBeGreaterThan(samples[0].entries);
      // Context climbs through the warning threshold, then compacts once.
      const peak = Math.max(...samples.map((s) => fraction(s.usage)));
      expect(peak).toBeGreaterThanOrEqual(0.8);
      const last = samples[samples.length - 1];
      expect(last.usage?.compactions).toBe(1);
      expect(fraction(last.usage)).toBeLessThan(peak);
      // Plateau: nothing changes after the script ends.
      jest.setSystemTime(START + 10 * 60 * 1000);
      expect(sample()).toEqual(last);
      expect(getAgentRunTranscript("run-1-migrate").status).toBe("recording");
      expect(getAgentRunLog("run-1-migrate", "agent", null).complete).toBe(
        false
      );
    });

    it("includes the stage's live progress messages in the transcript", () => {
      jest.setSystemTime(START + 15000);
      const stage = getPlanRun("1").stageRuns[1];
      const messages = stage.messages ?? [];
      expect(messages.length).toBeGreaterThan(1);
      const transcript = texts(getAgentRunTranscript("run-1-migrate").entries);
      messages.forEach((message) =>
        expect(transcript).toContain(message.content)
      );
    });

    it("never puts a progress message inside an agent message", () => {
      // The script's agent messages are whole sentences, sent in chunks.
      for (let ms = 0; ms <= 60000; ms += 1000) {
        jest.setSystemTime(START + ms);
        const progress = new Set(
          (getPlanRun("1").stageRuns[1].messages ?? []).map((m) => m.content)
        );
        const { entries } = getAgentRunTranscript("run-1-migrate");
        entries.forEach((entry, index) => {
          const previous = entries[index - 1];
          if (entry.kind !== "message" || !progress.has(entry.text)) return;
          if (previous?.kind !== "message" || progress.has(previous.text))
            return;
          expect(previous.text.trim()).toMatch(/[.:!?]$/);
        });
      }
    });

    it("reports ACPReady once the sandbox listens", () => {
      const acpReady = () =>
        getAgentRunResource("run-1-migrate").status?.conditions?.find(
          (condition) => condition.type === "ACPReady"
        );
      expect(acpReady()).toMatchObject({
        status: "False",
        reason: "NotListening",
      });
      jest.setSystemTime(START + 4000);
      expect(acpReady()).toMatchObject({ status: "True", reason: "Listening" });
      const resource = getAgentRunResource("run-1-migrate");
      expect(resource.status).toMatchObject({
        phase: "Running",
        sandboxName: "run-1-migrate",
      });
      expect(resource.status?.terminationData).toBeUndefined();
      expect(resource.spec.execution).toEqual({ mode: "auto", maxTurns: 150 });
    });

    it("is deterministic and never changes the world", () => {
      jest.setSystemTime(START + 30000);
      const before = JSON.stringify(getPlanRun("1"));
      const first = [
        listPlanRunAgentRuns("1"),
        getAgentRunResource("run-1-migrate"),
        getAgentRunTranscript("run-1-migrate"),
        getAgentRunLog("run-1-migrate", "agent", null),
      ];
      const second = [
        listPlanRunAgentRuns("1"),
        getAgentRunResource("run-1-migrate"),
        getAgentRunTranscript("run-1-migrate"),
        getAgentRunLog("run-1-migrate", "agent", null),
      ];
      expect(second).toEqual(first);
      expect(JSON.stringify(getPlanRun("1"))).toBe(before);
    });
  });

  describe("finished stages", () => {
    beforeEach(() => seed("configured"));

    it("returns everything, complete, with saved logs and final usage", () => {
      const agentRun = agentRunOf("1", "3");
      expect(agentRun).toMatchObject({
        phase: "Succeeded",
        logSource: "saved",
      });
      expect(getAgentRunTranscript(agentRun.name).status).toBe("complete");
      const log = getAgentRunLog(agentRun.name, "agent", null);
      expect(log).toMatchObject({ source: "saved", complete: true });
      expect(
        getAgentRunLog(agentRun.name, "agent", String(log.nextOffset))
      ).toMatchObject({ text: "", nextOffset: log.nextOffset });
      const resource = getAgentRunResource(agentRun.name);
      expect(resource.status?.terminationData).toMatchObject({
        exitCode: 0,
        outcome: "succeeded",
        usage: { contextSize: 128000 },
      });
      expect(resource.status?.terminationData?.usage?.cost).toBeUndefined();
    });

    it("ends stage 3 near the window after two compactions (danger)", () => {
      const { usage } = agentRunOf("1", "3");
      expect(fraction(usage)).toBeGreaterThanOrEqual(0.95);
      expect(usage?.compactions).toBe(2);
      expect(usage).toMatchObject({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        cost: expect.any(Number),
        currency: "USD",
        turnsUsed: expect.any(Number),
        maxTurns: 150,
      });
    });

    it("gives stage 2 a very long log and an incomplete transcript with a gap", () => {
      const agentRun = agentRunOf("1", "2");
      const transcript = getAgentRunTranscript(agentRun.name);
      expect(transcript.status).toBe("incomplete");
      expect(
        transcript.entries.filter((entry) => entry.kind === "gap")
      ).toHaveLength(1);
      const log = getAgentRunLog(agentRun.name, "agent", null);
      expect(lineCount(log.text)).toBeGreaterThan(LONG_LOG_LINES);
      expect(lineCount(log.text)).toBeLessThan(LONG_LOG_LINES + 500);
      expect(lineCount(log.text)).toBeGreaterThanOrEqual(20000);
      // Cheap: about 4 MB, generated once and cached.
      expect(log.text.length).toBeLessThan(5_000_000);
    });

    it("skips the transcript of approve mode stages", () => {
      const agentRun = agentRunOf("1", "1");
      expect(getAgentRunTranscript(agentRun.name)).toEqual({
        status: "skipped",
        skipReason: "approve mode",
        entries: [],
      });
      expect(getAgentRunResource(agentRun.name).spec.execution?.mode).toBe(
        "approve"
      );
      expect(agentRun.usage?.contextUsed).toBeGreaterThan(0);
    });

    it("keeps the stage's messages in the transcript of a recorded stage", () => {
      const stage = getPlanRun("1").stageRuns[2];
      const transcript = texts(getAgentRunTranscript("run-1-validate").entries);
      (stage.messages ?? []).forEach((message) =>
        expect(transcript).toContain(message.content)
      );
    });

    it("reports no context for the self-hosted model (not reported)", () => {
      const { usage } = agentRunOf("6", "27");
      expect(usage?.contextUsed).toBeUndefined();
      expect(usage?.peakContextUsed).toBeUndefined();
      expect(usage?.inputTokens).toBeUndefined();
      expect(usage?.contextSize).toBe(131072);
    });

    it("puts a failed stage's output in terminationData.stopReason", () => {
      const run = getPlanRun("3");
      const failed = run.stageRuns.find((stage) => stage.status === "Failed");
      expect(failed?.output).toBeDefined();
      const agentRun = agentRunOf("3", failed?.stageId ?? "");
      expect(agentRun.phase).toBe("Failed");
      expect(
        getAgentRunResource(agentRun.name).status?.terminationData
      ).toMatchObject({ exitCode: 1, stopReason: failed?.output });
    });

    it("writes ASCII logs with accessible ANSI colors only", () => {
      const agent = getAgentRunLog("run-1-validate", "agent", null).text;
      const loader = getAgentRunLog("run-1-validate", "skill-loader", null);
      // eslint-disable-next-line no-control-regex
      const ascii = /^[\x00-\x7f]*$/;
      expect(ascii.test(agent)).toBe(true);
      expect(ascii.test(loader.text)).toBe(true);
      expect(agent).toContain("\u001b[36mINFO\u001b[0m");
      ["\u001b[31m", "\u001b[34m", "\u001b[1;31m", "\u001b[1;34m"].forEach(
        (lowContrast) => expect(agent).not.toContain(lowContrast)
      );
      expect(lineCount(loader.text)).toBeLessThan(20);
      expect(agent.split("\n")[0]).toMatch(
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\t/
      );
    });

    it("rejects an unknown container and a malformed offset", () => {
      expect(() => getAgentRunLog("run-1-validate", "sidecar", null)).toThrow(
        expect.objectContaining({ status: 404 })
      );
      expect(() => getAgentRunLog("run-1-validate", "agent", "-1")).toThrow(
        expect.objectContaining({ status: 400 })
      );
      expect(() => getAgentRunLog("run-1-validate", "agent", "1.5")).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });

    it("answers no text for an offset past the end, as the hub does", () => {
      expect(
        getAgentRunLog("run-1-validate", "agent", "999999999")
      ).toMatchObject({ text: "", offset: 999999999, nextOffset: 999999999 });
    });

    it("counts offsets in UTF-8 bytes", () => {
      expect(utf8Length("a\u00e9\u20ac\u{1F600}")).toBe(1 + 2 + 3 + 4);
      const log = getAgentRunLog("run-1-validate", "agent", null);
      expect(log.nextOffset).toBe(utf8Length(log.text));
      const firstLine = log.text.slice(0, log.text.indexOf("\n") + 1);
      expect(
        getAgentRunLog("run-1-validate", "agent", String(utf8Length(firstLine)))
          .text
      ).toBe(log.text.slice(firstLine.length));
    });
  });

  it("keeps an awaiting stage live: recording skipped, pod still running", () => {
    seed("actionRequired", 1);
    const agentRun = agentRunOf("1", "1");
    expect(agentRun).toMatchObject({
      phase: "AwaitingApproval",
      logSource: "live",
    });
    expect(getAgentRunTranscript(agentRun.name).status).toBe("skipped");
    expect(getAgentRunResource(agentRun.name).status?.phase).toBe("Running");
    expect(getAgentRunLog(agentRun.name, "agent", null).complete).toBe(false);
  });

  it("records an awaiting stage outside approve mode as complete", () => {
    // The scenario gates stage 2, whose plan does not require approval.
    seed("actionRequired", 2);
    const agentRun = agentRunOf("1", "2");
    expect(agentRun).toMatchObject({
      phase: "AwaitingApproval",
      logSource: "live",
    });
    const transcript = getAgentRunTranscript(agentRun.name);
    expect(transcript.status).toBe("complete");
    expect(transcript.entries.length).toBeGreaterThan(0);
    expect(getAgentRunLog(agentRun.name, "agent", null)).toMatchObject({
      source: "live",
      complete: false,
    });
  });
  it("stages what this stage gets, each skill once, with its load policy, never an excluded one", () => {
    seed("configured");
    db.executionPolicy = { interactionMode: "unattended" };
    // Application 13 resolves to plan 5; skill 8 reaches it through the
    // archetype (and plan 5's Containerize stage), and the plan excludes it.
    const plan = db.plans.find((candidate) => candidate.id === "5")!;
    updatePlan("5", {
      name: plan.name,
      description: plan.description,
      stages: plan.stages.map((stage) => ({ ...stage })),
      excludedSkills: [{ id: "8" }],
    });
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [13],
      planSelection: "single",
      planId: "5",
      targetBranch: "main",
    });
    const run = getPlanRun(ref.id);
    jest.advanceTimersByTime(PENDING_MS + 3000);

    // The first stage's own group plus the application's every-stage group.
    const rows = [
      ...run.skills!.stages[0].skills,
      ...run.skills!.everyStage[0].skills,
    ];
    const expected = new Map(
      rows
        .filter(({ excluded }) => !excluded)
        .map(({ skill, loadPolicy }) => [
          toResourceName(skill.name),
          loadPolicy,
        ])
    );

    const [first] = listPlanRunAgentRuns(ref.id);
    const loader = getAgentRunLog(first.name, "skill-loader", null).text;
    const stagedLines = loader
      .split("\n")
      .filter((line) => / \((skill|rule)\) from /.test(line));
    const staged = stagedLines.map((line) => line.split(" ")[0]);
    expect(loader).toContain(`sources: ${expected.size} declared`);
    expect(loader).toContain(`${expected.size} skill(s) valid`);
    expect(new Set(staged).size).toBe(staged.length);
    expect([...staged].sort()).toEqual([...expected.keys()].sort());
    expect(staged).not.toContain("containerization-standards");
    // Skills of other stages are not staged here: Java Code Migrator's
    // collection skill, Build Validator's collection skill.
    expect(staged).not.toContain("jakarta-ee-namespace-migration");
    expect(staged).not.toContain("database-migration-patterns");
    stagedLines.forEach((line) => {
      const [name, type] = /^(\S+) \((skill|rule)\)/.exec(line)!.slice(1);
      expect(type).toBe(expected.get(name));
    });
    expect(stagedLines.some((line) => line.includes("(rule)"))).toBe(true);

    const discovered = getAgentRunLog(first.name, "agent", null)
      .text.split("\n")
      .filter((line) => line.includes("discovered skill: "));
    // The agent discovers exactly what the loader staged, by full name.
    expect(
      discovered.map((line) => line.split("discovered skill: ")[1]).sort()
    ).toEqual([...staged].sort());
  });

  describe("a stage that finishes while it is watched", () => {
    /**
     * A run started now, its first recorded stage (not approve mode) live
     * for 3 s of its 4 s.
     */
    const watchRecordedStage = () => {
      seed("configured");
      db.executionPolicy = { interactionMode: "unattended" };
      const {
        planRuns: [ref],
      } = startApplicationMigrations({
        applicationIds: [1],
        planSelection: "single",
        planId: "1",
        targetBranch: "main",
      });
      const index = getPlanRun(ref.id).stageRuns.findIndex(
        (stage) => !stage.requiresApproval
      );
      jest.advanceTimersByTime(PENDING_MS + index * STAGE_MS + 3000);
      const live = agentRunOf(
        ref.id,
        getPlanRun(ref.id).stageRuns[index].stageId
      );
      expect(live.phase).toBe("Running");
      return { runId: ref.id, name: live.name, stageId: live.stageId };
    };

    it("keeps its log append-only: the live text is the start of the saved one", () => {
      const { runId, name, stageId } = watchRecordedStage();
      const live = getAgentRunLog(name, "agent", null);
      expect(live.text).not.toBe("");

      jest.advanceTimersByTime(STAGE_MS);
      expect(agentRunOf(runId, stageId).phase).toBe("Succeeded");
      const saved = getAgentRunLog(name, "agent", null);
      expect(saved.complete).toBe(true);
      expect(saved.text.startsWith(live.text)).toBe(true);
      // Reading on from the live offset gives exactly the rest.
      const rest = getAgentRunLog(name, "agent", String(live.nextOffset));
      expect(live.text + rest.text).toBe(saved.text);
    });

    it("answers 404 (none) until the sandbox is ready, then the recorded lines", () => {
      seed("configured");
      db.executionPolicy = { interactionMode: "unattended" };
      const {
        planRuns: [ref],
      } = startApplicationMigrations({
        applicationIds: [1],
        planSelection: "single",
        planId: "1",
        targetBranch: "main",
      });
      const index = getPlanRun(ref.id).stageRuns.findIndex(
        (stage) => !stage.requiresApproval
      );
      jest.advanceTimersByTime(PENDING_MS + index * STAGE_MS + 1000);
      const { name, phase } = agentRunOf(
        ref.id,
        getPlanRun(ref.id).stageRuns[index].stageId
      );
      expect(phase).toBe("Running");
      expect(readRecordedTranscript(name)).toEqual({
        httpStatus: 404,
        status: "none",
        ndjson: "",
      });
      jest.advanceTimersByTime(2000);
      const reply = readRecordedTranscript(name);
      expect(reply).toMatchObject({ httpStatus: 200, status: "recording" });
      expect(lineCount(reply.ndjson)).toBeGreaterThan(0);
    });

    it("keeps its transcript append-only: reading on from the lines read live gives exactly the rest", () => {
      const { runId, name, stageId } = watchRecordedStage();
      jest.advanceTimersByTime(900);
      const live = readRecordedTranscript(name).ndjson;
      expect(live).not.toBe("");

      jest.advanceTimersByTime(STAGE_MS);
      expect(agentRunOf(runId, stageId).phase).toBe("Succeeded");
      const saved = readRecordedTranscript(name);
      expect(saved.status).toBe("complete");
      expect(saved.ndjson.startsWith(live)).toBe(true);
      const rest = readRecordedTranscript(name, String(lineCount(live)));
      expect(live + rest.ndjson).toBe(saved.ndjson);
      // The final messages are recorded too.
      const stage = getPlanRun(runId).stageRuns.find(
        (candidate) => candidate.stageId === stageId
      );
      const shown = texts(getAgentRunTranscript(name).entries);
      (stage?.messages ?? []).forEach((message) =>
        expect(shown).toContain(message.content)
      );
    });

    it("reads no line past the end, and a malformed offset is a 400", () => {
      const { name } = watchRecordedStage();
      const all = readRecordedTranscript(name).ndjson;
      expect(
        readRecordedTranscript(name, String(lineCount(all) + 5)).ndjson
      ).toBe("");
      expect(() => readRecordedTranscript(name, "-1")).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });

    it("keeps the times of the frames shown, and ends with the outcome at the stage's end", () => {
      const { runId, name, stageId } = watchRecordedStage();
      // The stage's own messages come from the run (progress messages while
      // it runs, its final messages after), so only the frames are compared.
      const framed = (entries: TranscriptEntry[]) =>
        entries.flatMap((entry) =>
          entry.kind === "gap" || entry.kind === "message"
            ? []
            : [`${entry.kind}@${entry.at}`]
        );
      const live = framed(getAgentRunTranscript(name).entries);
      expect(live.length).toBeGreaterThan(0);

      jest.advanceTimersByTime(STAGE_MS);
      const stage = getPlanRun(runId).stageRuns.find(
        (candidate) => candidate.stageId === stageId
      );
      const saved = getAgentRunTranscript(name).entries;
      expect(framed(saved).slice(0, live.length)).toEqual(live);
      const last = saved[saved.length - 1];
      expect(last).toMatchObject({
        kind: "status",
        at: new Date(Date.parse(stage?.completedAt ?? "")).toISOString(),
      });
    });
  });
});

describe("observability mock: agent test runs", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    seed("configured");
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // What the agent said and thought, in order.
  const said = (name: string) =>
    getAgentRunTranscript(name)
      .entries.flatMap((entry) =>
        entry.kind === "message" || entry.kind === "thought" ? [entry.text] : []
      )
      .join("\n");

  it("serves a seeded test run by its id: the task, no push, complete", () => {
    const transcript = getAgentRunTranscript("9001");
    expect(transcript.status).toBe("complete");
    expect(said("9001")).toContain(
      "The task asks me to analyze the application"
    );
    expect(said("9001")).toContain("Nothing is pushed.");
    expect(said("9001")).not.toContain("Pushing the branch");
    const resource = getAgentRunResource("9001");
    expect(resource.metadata.labels).not.toHaveProperty(
      "konveyor.io/agentworkflowrun"
    );
    expect(resource.spec.instructions).toMatch(/^Analyze the application/);
  });

  it("tells a run with added skills from the same task without them", () => {
    const without = said("9002");
    const withSkills = said("9003");
    expect(without).toContain("I could not finish the task.");
    expect(without).not.toContain("adds the skills");
    expect(withSkills).toContain(
      "This test run adds the skills spring-boot-3-upgrade, quarkus-best-practices"
    );
    expect(withSkills).toContain("Followed the added skills");
    expect(getAgentRunLog("9003", "skill-loader", null).text).toContain(
      "quarkus-best-practices"
    );
    expect(getAgentRunLog("9002", "skill-loader", null).text).not.toContain(
      "quarkus-best-practices"
    );
  });

  it("serves a test run started in the prototype, live, then finished", () => {
    const [run] = listAgentTestRuns("2");
    const started = startAgentTestRun({
      agentId: run.agent.id,
      applicationId: run.application.id,
      task: "Upgrade the service layer.",
    });
    // Numbered after the three seeded test runs.
    expect(started.name).toBe("Test run #4");
    // As on the hub, a running agent run has no transcript until its
    // sandbox is ready.
    expect(getAgentRunTranscript(started.id).status).toBe("none");
    expect(getAgentRunLog(started.id, "agent", null).complete).toBe(false);
    jest.advanceTimersByTime(5000);
    const transcript = getAgentRunTranscript(started.id);
    expect(transcript.status).toBe("complete");
    expect(texts(transcript.entries).join("\n")).toContain("Test run finished");
  });
});

describe("observability mock: runs on several applications", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /** The skill-loader's staged skill names of an agent run. */
  const stagedOf = (name: string) =>
    getAgentRunLog(name, "skill-loader", null)
      .text.split("\n")
      .filter((line) => / \((skill|rule)\) from /.test(line))
      .map((line) => line.split(" ")[0])
      .sort();

  /** The stage's group plus the application's every-stage group, minus excluded. */
  const expectedStaged = (
    run: PlanRun,
    stageId: string,
    applicationId: number
  ) =>
    [
      ...new Set(
        [
          ...(run.skills?.stages.find((group) => group.stageId === stageId)
            ?.skills ?? []),
          ...(run.skills?.everyStage.find(
            (group) => group.application?.id === applicationId
          )?.skills ?? []),
        ]
          .filter((row) => !row.excluded)
          .map((row) => toResourceName(row.skill.name))
      ),
    ].sort();

  describe("a running run on three applications", () => {
    beforeEach(() => seed("running", 2));

    it("has one agent run per started stage per application, each named and labelled for it", () => {
      const run = getPlanRun("1");
      expect(run.applications.map((application) => application.id)).toEqual([
        1, 3, 8,
      ]);
      const agentRuns = listPlanRunAgentRuns("1");
      const names = agentRuns.map((agentRun) => agentRun.name);
      expect(new Set(names).size).toBe(names.length);
      ["1", "2"].forEach((stageId) => {
        const forStage = agentRuns.filter(
          (agentRun) => agentRun.stageId === stageId
        );
        expect(forStage.map((agentRun) => agentRun.application)).toEqual(
          run.applications
        );
        // The first application keeps the stage's name; the others add
        // their application id.
        const [first, ...others] = forStage;
        expect(first.name).not.toContain("-app-");
        others.forEach((agentRun) =>
          expect(agentRun.name).toBe(
            `${first.name}-app-${agentRun.application?.id}`
          )
        );
      });
      agentRuns.forEach((agentRun) => {
        const resource = getAgentRunResource(agentRun.name);
        const id = String(agentRun.application?.id);
        expect(resource.metadata.labels?.["konveyor.io/application"]).toBe(id);
        expect(resource.spec.env).toContainEqual({ name: "APP_ID", value: id });
      });
    });

    it("gives every application its own phase: all follow a running or succeeded stage", () => {
      const run = getPlanRun("1");
      listPlanRunAgentRuns("1").forEach((agentRun) =>
        expect(agentRun.phase).toBe(
          run.stageRuns.find((stage) => stage.stageId === agentRun.stageId)
            ?.status
        )
      );
    });

    it("stages the stage's skills plus that application's every-stage skills only", () => {
      const run = getPlanRun("1");
      const agentRuns = listPlanRunAgentRuns("1");
      agentRuns.forEach((agentRun) =>
        expect(stagedOf(agentRun.name)).toEqual(
          expectedStaged(run, agentRun.stageId, agentRun.application!.id)
        )
      );
      // An application's own skill reaches its own agent runs, never the
      // other applications'.
      const forStage = agentRuns.filter((agentRun) => agentRun.stageId === "2");
      const lists = forStage.map((agentRun) => stagedOf(agentRun.name));
      const ownSkills = lists.flatMap((list, index) =>
        list.filter((skill) =>
          lists.every((other, j) => j === index || !other.includes(skill))
        )
      );
      expect(ownSkills.length).toBeGreaterThan(0);
    });

    it("clones and names each application in its own transcript and log", () => {
      jest.setSystemTime(START + 30000);
      listPlanRunAgentRuns("1")
        .filter((agentRun) => agentRun.stageId === "2")
        .forEach((agentRun) => {
          const name = findApplication(agentRun.application!.id)!.name;
          const repo = toResourceName(name);
          expect(getAgentRunLog(agentRun.name, "agent", null).text).toContain(
            `cloning ${repo}...`
          );
          const plan = getAgentRunTranscript(agentRun.name).entries.find(
            (entry) => entry.kind === "plan"
          );
          expect(JSON.stringify(plan)).toContain(`clone ${repo} on`);
        });
    });

    it("keeps the stage's messages on the first application's transcript only", () => {
      jest.setSystemTime(START + 15000);
      const messages = getPlanRun("1").stageRuns[1].messages ?? [];
      expect(messages.length).toBeGreaterThan(0);
      const [first, ...others] = listPlanRunAgentRuns("1").filter(
        (agentRun) => agentRun.stageId === "2"
      );
      const shown = texts(getAgentRunTranscript(first.name).entries);
      messages.forEach((message) => expect(shown).toContain(message.content));
      others.forEach((agentRun) => {
        const other = texts(getAgentRunTranscript(agentRun.name).entries);
        messages.forEach((message) =>
          expect(other).not.toContain(message.content)
        );
      });
    });
  });

  it("names its application in the transcript, also where the instructions say the application", () => {
    seed("configured");
    db.executionPolicy = { interactionMode: "unattended" };
    // Record plan 1's first stage ("Analyze the application ..."): no
    // approve mode.
    const plan = db.plans.find((candidate) => candidate.id === "1")!;
    updatePlan("1", {
      name: plan.name,
      description: plan.description,
      stages: plan.stages.map((stage) => ({
        ...stage,
        requiresApproval: false,
      })),
      excludedSkills: plan.excludedSkills,
    });
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1, 13],
      planSelection: "single",
      planId: "1",
      targetBranch: "main",
    });
    jest.advanceTimersByTime(PENDING_MS + 3000);
    const run = getPlanRun(ref.id);
    const stage = run.stageRuns[0];
    expect(stage.instructions).toMatch(/the application/);
    const forStage = listPlanRunAgentRuns(ref.id).filter(
      (agentRun) => agentRun.stageId === stage.stageId
    );
    expect(forStage).toHaveLength(2);
    forStage.forEach((agentRun, index) => {
      const name = findApplication(agentRun.application!.id)!.name;
      const thoughts = getAgentRunTranscript(agentRun.name)
        .entries.flatMap((entry) =>
          entry.kind === "thought" ? [entry.text] : []
        )
        .join(" ");
      expect(thoughts).toContain(
        `I work on ${name} (application ${index + 1} of 2 in this run).`
      );
      expect(thoughts).toContain(`the ${name} application`);
    });
  });

  it("varies context usage between the applications of a stage", () => {
    seed("completed");
    const forStage = listPlanRunAgentRuns("1").filter(
      (agentRun) => agentRun.stageId === "2"
    );
    const used = forStage.map((agentRun) => agentRun.usage?.contextUsed);
    expect(new Set(used).size).toBe(used.length);
    const input = forStage.map((agentRun) => agentRun.usage?.inputTokens);
    expect(new Set(input).size).toBe(input.length);
  });

  it("fails a failed stage for the first application only; the others succeeded", () => {
    seed("failed", 2);
    const run = getPlanRun("1");
    const stage = run.stageRuns[1];
    expect(stage.status).toBe("Failed");
    const [first, ...others] = listPlanRunAgentRuns("1").filter(
      (agentRun) => agentRun.stageId === stage.stageId
    );
    expect(first).toMatchObject({
      application: run.applications[0],
      phase: "Failed",
      completedAt: stage.completedAt,
    });
    expect(
      getAgentRunResource(first.name).status?.terminationData
    ).toMatchObject({ exitCode: 1, stopReason: stage.output });
    expect(getAgentRunLog(first.name, "agent", null).text).toContain(
      "stage failed: "
    );
    expect(others).toHaveLength(2);
    others.forEach((agentRun) => {
      expect(agentRun).toMatchObject({
        phase: "Succeeded",
        completedAt: stage.completedAt,
        logSource: "saved",
      });
      const resource = getAgentRunResource(agentRun.name);
      expect(resource.status).toMatchObject({ phase: "Succeeded" });
      expect(resource.status?.terminationData).toMatchObject({
        exitCode: 0,
        outcome: "succeeded",
        stopReason: "end_turn",
      });
      const log = getAgentRunLog(agentRun.name, "agent", null).text;
      expect(log).not.toContain("stage failed: ");
      expect(log).toContain(`[ok] ${stage.name} succeeded`);
    });
  });

  it("waits for approval on the first application only; the others finished when the proposal was ready", () => {
    seed("actionRequired", 2);
    const stage = getPlanRun("1").stageRuns[1];
    expect(stage.status).toBe("AwaitingApproval");
    const readyAt = stage.messages?.[stage.messages.length - 1]?.timestamp;
    const [first, ...others] = listPlanRunAgentRuns("1").filter(
      (agentRun) => agentRun.stageId === stage.stageId
    );
    expect(first).toMatchObject({
      phase: "AwaitingApproval",
      logSource: "live",
    });
    expect(first).not.toHaveProperty("completedAt");
    expect(others).toHaveLength(2);
    others.forEach((agentRun) => {
      expect(agentRun).toMatchObject({
        phase: "Succeeded",
        completedAt: readyAt,
        logSource: "saved",
      });
      // Finished: not recording any more (stage 2 has the demo gap).
      expect(getAgentRunTranscript(agentRun.name).status).toMatch(
        /^(complete|incomplete)$/
      );
      expect(getAgentRunLog(agentRun.name, "agent", null).complete).toBe(true);
    });
  });

  it("labels each application's agent runs with its own workflow run", () => {
    seed("running", 2);
    listPlanRunAgentRuns("1").forEach((agentRun, index) => {
      const label = getAgentRunResource(agentRun.name).metadata.labels?.[
        "konveyor.io/agentworkflowrun"
      ];
      expect(label).toBe(
        index % 3 === 0 ? "run-1" : `run-1-app-${agentRun.application?.id}`
      );
    });
  });

  it("keeps names unique and short for long, near-identical stage names", () => {
    seed("configured");
    db.executionPolicy = { interactionMode: "unattended" };
    const long =
      "Migrate the customer facing order management service and its batch jobs";
    const plan = db.plans.find((candidate) => candidate.id === "1")!;
    updatePlan("1", {
      name: plan.name,
      description: plan.description,
      stages: plan.stages.map((stage, index) => ({
        ...stage,
        name: index < 2 ? `${long} ${index + 1}` : stage.name,
      })),
      excludedSkills: plan.excludedSkills,
    });
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [1, 13],
      planSelection: "single",
      planId: "1",
      targetBranch: "main",
    });
    jest.advanceTimersByTime(PENDING_MS + STAGE_MS + 1000);
    const agentRuns = listPlanRunAgentRuns(ref.id);
    expect(agentRuns).toHaveLength(4);
    const names = agentRuns.map((agentRun) => agentRun.name);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((name) => {
      expect(name.length).toBeLessThanOrEqual(63);
      expect(name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      // Every name finds its own agent run.
      expect(getAgentRunResource(name).metadata.name).toBe(name);
    });
    expect(names.filter((name) => name.endsWith("-app-13"))).toHaveLength(2);
  });

  it.each([
    ["approve", "Succeeded"],
    ["reject", "Failed"],
  ])(
    "never moves the other applications' finished runs when the proposal is decided (%s)",
    (decision, decided) => {
      seed("actionRequired", 2);
      const stageId = getPlanRun("1").stageRuns[1].stageId;
      const others = () =>
        listPlanRunAgentRuns("1")
          .filter((agentRun) => agentRun.stageId === stageId)
          .slice(1)
          .map((agentRun) => ({
            agentRun,
            log: getAgentRunLog(agentRun.name, "agent", null).text,
          }));
      const before = others();
      expect(before).toHaveLength(2);
      jest.setSystemTime(START + 10 * 60 * 1000);
      if (decision === "approve") {
        approveStage("1", stageId);
      } else {
        resolveApplicationRequest(getPlanRun("1").applications[0].id, {
          decision: "reject",
        });
      }
      const stage = getPlanRun("1").stageRuns[1];
      expect(stage.status).toBe(decided);
      expect(stage.completedAt).toBe(new Date(START + 600000).toISOString());
      const [first] = listPlanRunAgentRuns("1").filter(
        (agentRun) => agentRun.stageId === stageId
      );
      expect(first).toMatchObject({
        phase: decided,
        completedAt: stage.completedAt,
      });
      expect(others()).toEqual(before);
    }
  );

  it.each([
    ["running", 2],
    ["failed", 2],
    ["actionRequired", 2],
    ["completed", 1],
  ])("leaves a run on one application unchanged (%s)", (scenario, stage) => {
    seed(scenario, stage);
    const run = getPlanRun("3");
    expect(run.applications).toHaveLength(1);
    const agentRuns = listPlanRunAgentRuns("3");
    const started = run.stageRuns.filter(
      (stageRun) => stageRun.status !== "Pending"
    );
    expect(agentRuns.map((agentRun) => agentRun.stageId)).toEqual(
      started.map((stageRun) => stageRun.stageId)
    );
    agentRuns.forEach((agentRun, index) => {
      expect(agentRun.name).toBe(
        toResourceName(`run-3-${started[index].name}`, 58)
      );
      expect(agentRun.application).toEqual(run.applications[0]);
      expect(agentRun.phase).toBe(started[index].status);
      expect(stagedOf(agentRun.name)).toEqual(
        expectedStaged(run, agentRun.stageId, run.applications[0].id)
      );
    });
  });

  it("keeps one agent run per stage in the configured world's runs on one application", () => {
    seed("configured");
    const run = getPlanRun("3");
    const agentRuns = listPlanRunAgentRuns("3");
    expect(
      agentRuns.every((agentRun) => !agentRun.name.includes("-app-"))
    ).toBe(true);
    expect(new Set(agentRuns.map((agentRun) => agentRun.stageId)).size).toBe(
      agentRuns.length
    );
    expect(run.stageRuns.some((stage) => stage.status === "Failed")).toBe(true);
  });
});

describe("observability handlers", () => {
  const statusOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return 200;
    } catch (error) {
      if (isAxiosError(error)) return error.response?.status;
      throw error;
    }
  };

  beforeEach(() => {
    server.use(...handlers);
    resetAgenticDb();
    resetExecutionWorld();
    setScenario("configured");
  });

  it("serves the four routes through the REST client", async () => {
    const agentRuns = await getPlanRunAgentRuns("1");
    expect(agentRuns.map((agentRun) => agentRun.name)).toEqual([
      "run-1-prepare-proposal",
      "run-1-prepare-proposal-app-8",
      "run-1-migrate",
      "run-1-migrate-app-8",
      "run-1-validate",
      "run-1-validate-app-8",
    ]);
    expect(agentRuns.map((agentRun) => agentRun.application?.id)).toEqual([
      3, 8, 3, 8, 3, 8,
    ]);
    expect((await fetchAgentRunResource("run-1-validate")).kind).toBe(
      "AgentRun"
    );
    const transcript = await fetchAgentRunTranscript("run-1-validate");
    expect(transcript.status).toBe("complete");
    expect(transcript.nextOffset).toBe(transcript.lines.length);
    expect(transcript.lines.length).toBeGreaterThan(2);
    const tail = await fetchAgentRunTranscript(
      "run-1-validate",
      transcript.nextOffset - 2
    );
    expect(tail).toEqual({
      status: "complete",
      lines: transcript.lines.slice(-2),
      nextOffset: transcript.nextOffset,
    });
    expect(await fetchAgentRunTranscript("run-1-prepare-proposal")).toEqual({
      status: "skipped",
      skipReason: "approve mode",
      lines: [],
      nextOffset: 0,
    });
    const chunk = await fetchAgentRunLog({
      name: "run-1-validate",
      container: "skill-loader",
    });
    expect(chunk).toMatchObject({ container: "skill-loader", offset: 0 });
    const rest = await fetchAgentRunLog({
      name: "run-1-validate",
      container: "skill-loader",
      offset: chunk.nextOffset,
    });
    expect(rest).toMatchObject({ text: "", offset: chunk.nextOffset });
  });

  it("answers 404 for unknown runs, names and containers, 400 for malformed offsets", async () => {
    expect(await statusOf(getPlanRunAgentRuns("9999"))).toBe(404);
    expect(await statusOf(fetchAgentRunResource("9999"))).toBe(404);
    expect(await statusOf(fetchAgentRunTranscript("nope"))).toBe(404);
    expect(
      await statusOf(
        fetchAgentRunLog({ name: "run-1-validate", container: "sidecar" })
      )
    ).toBe(404);
    expect(
      await statusOf(
        fetchAgentRunLog({
          name: "run-1-validate",
          container: "agent",
          offset: -1,
        })
      )
    ).toBe(400);
  });

  it("applies the apiError scenario", async () => {
    setScenario("apiError");
    expect(await statusOf(getPlanRunAgentRuns("1"))).toBe(503);
    expect(await statusOf(fetchAgentRunResource("run-1-validate"))).toBe(503);
  });

  it("applies the initial scenario like the plan runs: no seeded run, so no agent runs", async () => {
    setScenario("initial");
    resetExecutionWorld();
    expect(await statusOf(getPlanRunAgentRuns("1"))).toBe(404);
    expect(await statusOf(fetchAgentRunResource("run-1-validate"))).toBe(404);
    expect(await statusOf(fetchAgentRunTranscript("run-1-validate"))).toBe(404);
    expect(
      await statusOf(
        fetchAgentRunLog({ name: "run-1-validate", container: "agent" })
      )
    ).toBe(404);
  });
});
