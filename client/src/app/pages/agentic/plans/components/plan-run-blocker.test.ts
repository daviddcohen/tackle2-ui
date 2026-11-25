import { TFunction } from "i18next";

import { MigrationPlan } from "@app/agentic";

import { getRunBlocker, preflightPlanOf } from "./plan-run-blocker";

const t = ((key: string, values?: Record<string, unknown>) =>
  values == null ? key : `${key} ${JSON.stringify(values)}`) as TFunction;

const plan: MigrationPlan = {
  id: "1",
  name: "Java EE to Quarkus",
  description: "",
  stages: [
    {
      id: "s1",
      name: "Migrate",
      agent: { id: "7", name: "Code Migrator" },
      instructions: "",
      requiresApproval: false,
      order: 1,
    },
  ],
  migrationPaths: [
    {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfile: { id: 11, name: "Quarkus 3.x" },
    },
  ],
  applicationImpact: {
    matching: 1,
    applications: [{ id: 1, name: "Customer Management" }],
  },
  runCount: 0,
};

describe("getRunBlocker", () => {
  it("lets a plan with target profiles, stages and applications run", () => {
    expect(getRunBlocker(plan, true, t)).toBeUndefined();
    expect(getRunBlocker(plan, false, t)).toBeUndefined();
  });

  it("names a plan no target profile uses first, whatever else is wrong", () => {
    expect(
      getRunBlocker(
        {
          ...plan,
          migrationPaths: [],
          stages: [],
          applicationImpact: undefined,
        },
        true,
        t
      )
    ).toBe("agentic.plan.runBlocked.notAssigned");
  });

  it("never reads target profiles the server does not report as not assigned", () => {
    // The real backend: no paths and no applications reported.
    expect(
      getRunBlocker(
        { ...plan, migrationPaths: undefined, applicationImpact: undefined },
        true,
        t
      )
    ).toBe("agentic.plan.runBlocked.unavailable");
    // Applications reported: the plan can run.
    expect(
      getRunBlocker({ ...plan, migrationPaths: undefined }, true, t)
    ).toBeUndefined();
  });

  it("names a plan without stages before its applications, with the edit fix only for editors", () => {
    const noStages = {
      ...plan,
      stages: [],
      applicationImpact: { matching: 0 },
    };
    expect(getRunBlocker(noStages, true, t)).toBe(
      "agentic.plan.runBlocked.noStagesEdit"
    );
    expect(getRunBlocker(noStages, false, t)).toBe(
      "agentic.plan.runBlocked.noStages"
    );
    // Edit is off for a plan managed by Konveyor.
    expect(getRunBlocker({ ...noStages, operatorManaged: true }, true, t)).toBe(
      "agentic.plan.runBlocked.noStages"
    );
  });

  it("says so when no application can run the plan", () => {
    const noApplications = "agentic.plan.runBlocked.noApplications";
    expect(
      getRunBlocker(
        { ...plan, applicationImpact: { matching: 0, applications: [] } },
        true,
        t
      )
    ).toBe(noApplications);
    // A server that only counts: zero is still known.
    expect(
      getRunBlocker({ ...plan, applicationImpact: { matching: 0 } }, true, t)
    ).toBe(noApplications);
  });

  it("says the applications could not be loaded when the server lists none", () => {
    expect(
      getRunBlocker({ ...plan, applicationImpact: undefined }, true, t)
    ).toBe("agentic.plan.runBlocked.unavailable");
    expect(
      getRunBlocker({ ...plan, applicationImpact: { matching: 2 } }, true, t)
    ).toBe("agentic.plan.runBlocked.unavailable");
  });
});

describe("preflightPlanOf", () => {
  it("names the plan, and its target profile only when exactly one uses it", () => {
    expect(preflightPlanOf(plan)).toEqual({
      id: "1",
      name: "Java EE to Quarkus",
      targetProfile: "Quarkus 3.x",
    });
    expect(
      preflightPlanOf({ ...plan, migrationPaths: undefined }).targetProfile
    ).toBeUndefined();
    expect(
      preflightPlanOf({
        ...plan,
        migrationPaths: [
          ...plan.migrationPaths!,
          {
            archetype: { id: 2, name: "Spring Boot Application" },
            targetProfile: { id: 21, name: "Spring Boot 3" },
          },
        ],
      }).targetProfile
    ).toBeUndefined();
  });
});
