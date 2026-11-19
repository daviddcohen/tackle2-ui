import { PlanRun, StageRun } from "@app/agentic";

import { getCurrentStage } from "./agentic";

const stage = (
  order: number,
  name: string,
  status: StageRun["status"]
): StageRun => ({
  stageId: String(order),
  name,
  agent: { id: "1", name: "Agent" },
  instructions: "",
  requiresApproval: false,
  order,
  status,
});

const run = (status: PlanRun["status"], stageRuns: StageRun[]): PlanRun => ({
  id: "1",
  name: "Run #1: Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [],
  status,
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns,
});

describe("getCurrentStage", () => {
  it("names the stage awaiting approval, with its position in stage order", () => {
    expect(
      getCurrentStage(
        run("AwaitingApproval", [
          stage(2, "Migrate", "Pending"),
          stage(1, "Prepare proposal", "AwaitingApproval"),
          stage(3, "Validate", "Pending"),
        ])
      )
    ).toEqual({
      stageRun: expect.objectContaining({ name: "Prepare proposal" }),
      position: 1,
      total: 3,
    });
  });

  it("names the running stage", () => {
    expect(
      getCurrentStage(
        run("Running", [
          stage(1, "Prepare proposal", "Succeeded"),
          stage(2, "Migrate", "Running"),
          stage(3, "Validate", "Pending"),
        ])
      )
    ).toMatchObject({ stageRun: { name: "Migrate" }, position: 2, total: 3 });
  });

  it("names the failed stage of a failed run", () => {
    expect(
      getCurrentStage(
        run("Failed", [
          stage(1, "Prepare proposal", "Succeeded"),
          stage(2, "Migrate", "Failed"),
          stage(3, "Validate", "Pending"),
        ])
      )
    ).toMatchObject({ stageRun: { name: "Migrate" }, position: 2, total: 3 });
  });

  it("has no current stage before or after the run", () => {
    expect(
      getCurrentStage(run("Pending", [stage(1, "Migrate", "Pending")]))
    ).toBeUndefined();
    expect(
      getCurrentStage(run("Succeeded", [stage(1, "Migrate", "Succeeded")]))
    ).toBeUndefined();
    expect(getCurrentStage(run("Failed", []))).toBeUndefined();
  });
});
