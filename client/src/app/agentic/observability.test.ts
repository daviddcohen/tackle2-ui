/**
 * Picking a stage's agent run in a run on several applications: one agent
 * run per stage per application, grouped by stage.
 */
import {
  StageAgentRun,
  defaultStageAgentRun,
  stageAgentRunFor,
  stageAgentRunsOf,
  stageAttentionApplications,
} from "./observability";
import { ControllerRunPhase, HubRef } from "./types";

const claims: HubRef = { id: 3, name: "Claims Processing" };
const inventory: HubRef = { id: 8, name: "Inventory Service" };
const billing: HubRef = { id: 1, name: "Billing" };

const agentRun = (
  stageId: string,
  application: HubRef | undefined,
  phase: ControllerRunPhase
): StageAgentRun => ({
  name: `run-1-${stageId}-${application?.id ?? "none"}`,
  runId: "1",
  stageId,
  ...(application != null ? { application } : {}),
  phase,
  containers: ["skill-loader", "agent"],
});

describe("stageAgentRunsOf", () => {
  it("keeps one stage's agent runs, in list order", () => {
    const list = [
      agentRun("1", claims, "Succeeded"),
      agentRun("1", inventory, "Succeeded"),
      agentRun("2", claims, "Running"),
      agentRun("2", inventory, "Running"),
    ];
    expect(stageAgentRunsOf(list, "2")).toEqual([list[2], list[3]]);
    expect(stageAgentRunsOf(list, "9")).toEqual([]);
  });
});

describe("stageAgentRunFor", () => {
  const list = [
    agentRun("2", claims, "Running"),
    agentRun("2", inventory, "Running"),
  ];

  it("finds the application's agent run", () => {
    expect(stageAgentRunFor(list, 8)).toBe(list[1]);
  });

  it("finds nothing for an unknown or absent application", () => {
    expect(stageAgentRunFor(list, 99)).toBeUndefined();
    expect(stageAgentRunFor(list, undefined)).toBeUndefined();
  });
});

describe("defaultStageAgentRun", () => {
  const order = [claims, inventory, billing];

  it("picks the first one waiting for a decision over a failed one", () => {
    const list = [
      agentRun("2", claims, "Failed"),
      agentRun("2", inventory, "AwaitingApproval"),
      agentRun("2", billing, "AwaitingApproval"),
    ];
    expect(defaultStageAgentRun(list, order)).toBe(list[1]);
  });

  it("then the first failed one", () => {
    const list = [
      agentRun("2", claims, "Succeeded"),
      agentRun("2", inventory, "Running"),
      agentRun("2", billing, "Failed"),
    ];
    expect(defaultStageAgentRun(list, order)).toBe(list[2]);
  });

  it("then the first in the run's application order, whatever the list order", () => {
    const list = [
      agentRun("2", billing, "Running"),
      agentRun("2", inventory, "Running"),
      agentRun("2", claims, "Running"),
    ];
    expect(defaultStageAgentRun(list, order)).toBe(list[2]);
    // Ties in phase follow the run's order too.
    const failed = [
      agentRun("2", inventory, "Failed"),
      agentRun("2", claims, "Failed"),
    ];
    expect(defaultStageAgentRun(failed, order)).toBe(failed[1]);
  });

  it("uses the list order without the run's applications", () => {
    const list = [
      agentRun("2", inventory, "Succeeded"),
      agentRun("2", claims, "Succeeded"),
    ];
    expect(defaultStageAgentRun(list)).toBe(list[0]);
  });

  it("puts agent runs of unknown applications, or of none, last", () => {
    const list = [
      agentRun("2", undefined, "Running"),
      agentRun("2", { id: 77, name: "#77" }, "Running"),
      agentRun("2", inventory, "Running"),
    ];
    expect(defaultStageAgentRun(list, order)).toBe(list[2]);
  });

  it("is undefined for a stage without agent runs", () => {
    expect(defaultStageAgentRun([], order)).toBeUndefined();
  });
});

describe("stageAttentionApplications", () => {
  const order = [claims, inventory, billing];

  it("lists the applications that wait in a stage awaiting approval, in the run's order", () => {
    const list = [
      agentRun("2", billing, "AwaitingApproval"),
      agentRun("2", claims, "AwaitingApproval"),
      agentRun("2", inventory, "Succeeded"),
    ];
    expect(stageAttentionApplications(list, "AwaitingApproval", order)).toEqual(
      [claims, billing]
    );
  });

  it("lists the failed ones in a failed stage, and none otherwise", () => {
    const list = [
      agentRun("2", claims, "Succeeded"),
      agentRun("2", inventory, "Failed"),
      agentRun("2", undefined, "Failed"),
    ];
    expect(stageAttentionApplications(list, "Failed", order)).toEqual([
      inventory,
    ]);
    expect(stageAttentionApplications(list, "Running", order)).toEqual([]);
    expect(stageAttentionApplications(list, undefined, order)).toEqual([]);
  });
});
