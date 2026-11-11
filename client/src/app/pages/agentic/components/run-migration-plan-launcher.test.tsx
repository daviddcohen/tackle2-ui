import { ApplicationMigrationView, PlanRun } from "@app/agentic";

import { rerunInitialValues } from "./run-migration-plan-launcher";

const run = {
  id: "4",
  name: "Run #4 — Java EE lift and shift",
  planId: "3",
  planName: "Java EE lift and shift",
  applications: [
    { id: 2, name: "Policy Administration" },
    { id: 4, name: "Order Service" },
  ],
  status: "Failed",
  targetBranch: "mta/lift-and-shift",
  startedAt: "2026-11-09T16:30:00Z",
  stageRuns: [],
} as PlanRun;

const view = (planId: string): ApplicationMigrationView => ({
  configured: true,
  plan: { id: planId, name: `Plan ${planId}` },
  intervention: "none",
  stages: [],
});

describe("rerunInitialValues", () => {
  it("keeps each application's own plan when it is the run's plan", () => {
    expect(
      rerunInitialValues(run, run.applications, { 2: view("3"), 4: view("3") })
    ).toEqual({
      planSelection: "recommended",
      targetBranch: "mta/lift-and-shift",
    });
  });

  it("uses the run's plan for all when an application now resolves elsewhere", () => {
    expect(
      rerunInitialValues(run, run.applications, { 2: view("3"), 4: view("1") })
    ).toEqual({
      planSelection: "single",
      planId: "3",
      targetBranch: "mta/lift-and-shift",
    });
  });

  it("reads only the applications being launched", () => {
    // The application Migration tab launches its own application from a
    // run of several, holding only that application's view.
    const ownApplication = [run.applications[0]];
    expect(rerunInitialValues(run, ownApplication, { 2: view("3") })).toEqual({
      planSelection: "recommended",
      targetBranch: "mta/lift-and-shift",
    });
    expect(
      rerunInitialValues(run, ownApplication, { 2: view("1") })
    ).toMatchObject({ planSelection: "single", planId: "3" });
  });

  it("uses the run's plan while the views are unknown", () => {
    expect(rerunInitialValues(run, run.applications, undefined)).toMatchObject({
      planSelection: "single",
      planId: "3",
    });
    expect(
      rerunInitialValues(run, run.applications, { 2: view("3") })
    ).toMatchObject({
      planSelection: "single",
    });
    expect(rerunInitialValues(run, [], {})).toMatchObject({
      planSelection: "single",
    });
  });
});
