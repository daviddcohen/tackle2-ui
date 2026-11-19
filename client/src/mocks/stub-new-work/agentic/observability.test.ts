/**
 * The run observability mock: derived from the execution world (read-only),
 * deterministic, growing while a stage runs, complete once it finished.
 * Module functions are called directly (fake clock); the last block drives
 * the handlers through the REST client like mock-server.test.ts.
 */
import { isAxiosError } from "axios";

import { AgentRunUsage, TranscriptEntry } from "@app/agentic";
import {
  getAgentRunLog as fetchAgentRunLog,
  getAgentRunResource as fetchAgentRunResource,
  getAgentRunTranscript as fetchAgentRunTranscript,
  getPlanRunAgentRuns,
} from "@app/api/rest/agentic";
import { server } from "@mocks/server";

import { updatePlan } from "./catalog";
import { db, resetAgenticDb } from "./db";
import {
  PENDING_MS,
  STAGE_MS,
  getPlanRun,
  resetExecutionWorld,
  startApplicationMigrations,
} from "./execution";
import handlers from "./handlers";
import {
  LONG_LOG_LINES,
  OBSERVABILITY_SCRIPT_MS,
  getAgentRunLog,
  getAgentRunResource,
  getAgentRunTranscript,
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
      expect(agentRuns.map((agentRun) => agentRun.stageId)).toEqual(["1", "2"]);
      agentRuns.forEach((agentRun) => {
        const stage = run.stageRuns.find((s) => s.stageId === agentRun.stageId);
        expect(agentRun.phase).toBe(stage?.status);
      });
      expect(agentRuns[1]).toMatchObject({
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
  it("stages each skill once and never a skill the plan excluded", () => {
    seed("configured");
    db.executionPolicy = { interactionMode: "unattended" };
    // Application 13 resolves to plan 5; skill 8 reaches it through an agent
    // and the archetype, skill 9 through several sources too.
    const plan = db.plans.find((candidate) => candidate.id === "5")!;
    updatePlan("5", {
      name: plan.name,
      description: plan.description,
      migrationPath: plan.migrationPath && {
        archetype: { id: plan.migrationPath.archetype.id },
        targetProfiles: plan.migrationPath.targetProfiles,
        isDefault: plan.migrationPath.isDefault,
      },
      stages: plan.stages.map((stage) => ({ ...stage })),
      excludedSkills: [{ id: "8" }],
    });
    const {
      planRuns: [ref],
    } = startApplicationMigrations({
      applicationIds: [13],
      planSelection: "recommended",
      targetBranch: "main",
    });
    const run = getPlanRun(ref.id);
    const distinct = new Set(run.resolvedSkills?.map(({ skill }) => skill.id));
    expect(run.resolvedSkills!.length).toBeGreaterThan(distinct.size);
    expect(new Set(run.excludedSkills?.map(({ skill }) => skill.id))).toEqual(
      new Set(["8"])
    );
    jest.advanceTimersByTime(PENDING_MS + 3000);

    const [first] = listPlanRunAgentRuns(ref.id);
    const loader = getAgentRunLog(first.name, "skill-loader", null).text;
    const staged = loader
      .split("\n")
      .filter((line) => / \((skill|rule)\) from /.test(line))
      .map((line) => line.split(" ")[0]);
    expect(loader).toContain(`sources: ${distinct.size} declared`);
    expect(loader).toContain(`${distinct.size} skill(s) valid`);
    expect(new Set(staged).size).toBe(staged.length);
    expect(staged).toHaveLength(distinct.size);
    expect(staged).not.toContain("containerization-standards");

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
        planSelection: "recommended",
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
      "run-1-migrate",
      "run-1-validate",
    ]);
    expect((await fetchAgentRunResource("run-1-validate")).kind).toBe(
      "AgentRun"
    );
    expect((await fetchAgentRunTranscript("run-1-validate")).status).toBe(
      "complete"
    );
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
    expect(await statusOf(fetchAgentRunResource("9001"))).toBe(404);
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
