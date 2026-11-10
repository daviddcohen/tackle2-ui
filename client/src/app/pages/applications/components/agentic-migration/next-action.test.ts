import { ApplicationMigrationView } from "@app/agentic";

import { getMigrationNextAction } from "./next-action";

const base: ApplicationMigrationView = {
  configured: true,
  plan: { id: "1", name: "Java EE to Quarkus" },
  intervention: "none",
  stages: [],
};

const run = { id: "7", name: "Run #7 — Java EE to Quarkus" };

describe("getMigrationNextAction", () => {
  it("sends an unconfigured application to the migration path configuration", () => {
    expect(
      getMigrationNextAction({ ...base, configured: false, plan: undefined })
    ).toEqual({ key: "configure", target: "configure" });
  });

  it("opens preflight for a ready application", () => {
    expect(getMigrationNextAction({ ...base, preflight: "ready" })).toEqual({
      key: "start",
      target: "preflight",
    });
  });

  it.each(["blocked", "reviewRequired"] as const)(
    "sends a %s preflight to the Migration tab to resolve it",
    (preflight) => {
      expect(getMigrationNextAction({ ...base, preflight })).toEqual({
        key: "resolve",
        target: "migrationTab",
      });
    }
  );

  it("sends a pending decision to the Migration tab, even with a run", () => {
    expect(
      getMigrationNextAction({
        ...base,
        planRun: run,
        runPhase: "Running",
        intervention: "actionRequired",
      })
    ).toEqual({ key: "review", target: "migrationTab" });
  });

  it("sends a failed run to the Migration tab for its evidence and recovery", () => {
    expect(
      getMigrationNextAction({ ...base, planRun: run, runPhase: "Failed" })
    ).toEqual({ key: "correct", target: "migrationTab" });
  });

  it.each(["Pending", "Running"] as const)(
    "monitors a %s run on its plan run page",
    (runPhase) => {
      expect(
        getMigrationNextAction({ ...base, planRun: run, runPhase })
      ).toEqual({ key: "monitor", target: "planRun", planRunId: "7" });
    }
  );

  it("reviews the results of a succeeded run on its plan run page", () => {
    expect(
      getMigrationNextAction({ ...base, planRun: run, runPhase: "Succeeded" })
    ).toEqual({ key: "reviewResults", target: "planRun", planRunId: "7" });
  });

  it("falls back to the Migration tab when a run reference is missing", () => {
    expect(getMigrationNextAction({ ...base, runPhase: "Running" })).toEqual({
      key: "monitor",
      target: "migrationTab",
    });
  });
});
