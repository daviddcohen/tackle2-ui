import { TFunction } from "i18next";

import { MigrationPlan } from "@app/agentic";

import { getPlanDeleteBlocker } from "./plan-delete";

const t = ((key: string, values?: Record<string, unknown>) =>
  values == null ? key : `${key} ${JSON.stringify(values)}`) as TFunction;

const plan: MigrationPlan = {
  id: "1",
  name: "Java EE to Quarkus",
  description: "",
  stages: [],
  migrationPath: {
    archetype: { id: 1, name: "Java EE Application" },
    targetProfiles: [
      { id: 11, name: "Quarkus 3.x" },
      { id: 12, name: "OpenShift" },
    ],
    isDefault: false,
  },
  applicationImpact: { matching: 0 },
  runCount: 0,
};

describe("getPlanDeleteBlocker", () => {
  it("allows deleting an unused, unassigned plan", () => {
    expect(getPlanDeleteBlocker(plan, t)).toBeUndefined();
  });

  it("blocks while the server did not report the usage", () => {
    expect(
      getPlanDeleteBlocker({ ...plan, applicationImpact: undefined }, t)
    ).toBe("agentic.common.usageUnchecked");
    expect(getPlanDeleteBlocker({ ...plan, runCount: undefined }, t)).toBe(
      "agentic.common.usageUnchecked"
    );
  });

  it("names runs first, then matching applications, then the assignment", () => {
    expect(
      getPlanDeleteBlocker(
        { ...plan, runCount: 2, applicationImpact: { matching: 3 } },
        t
      )
    ).toBe('agentic.plan.deleteUsedByRuns {"count":2}');
    expect(
      getPlanDeleteBlocker({ ...plan, applicationImpact: { matching: 3 } }, t)
    ).toBe(
      'agentic.plan.deleteMatchingApplications {"count":3,"profile":"Quarkus 3.x, OpenShift"}'
    );
    expect(
      getPlanDeleteBlocker(
        {
          ...plan,
          migrationPath: { ...plan.migrationPath!, isDefault: true },
        },
        t
      )
    ).toBe(
      'agentic.plan.deleteAssigned {"archetype":"Java EE Application","profile":"Quarkus 3.x, OpenShift"}'
    );
  });
});
