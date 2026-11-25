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
  migrationPaths: [],
  applicationImpact: { matching: 0 },
  runCount: 0,
};

describe("getPlanDeleteBlocker", () => {
  it("allows deleting a plan without runs that no target profile uses", () => {
    expect(getPlanDeleteBlocker(plan, t)).toBeUndefined();
  });

  it("blocks while the server did not report the usage", () => {
    expect(
      getPlanDeleteBlocker({ ...plan, applicationImpact: undefined }, t)
    ).toBe("agentic.common.usageUnchecked");
    expect(getPlanDeleteBlocker({ ...plan, runCount: undefined }, t)).toBe(
      "agentic.common.usageUnchecked"
    );
    // Target profiles not reported: they may use it.
    expect(
      getPlanDeleteBlocker({ ...plan, migrationPaths: undefined }, t)
    ).toBe("agentic.common.usageUnchecked");
  });

  it("names runs first, then the target profiles that use the plan", () => {
    const shared: MigrationPlan = {
      ...plan,
      migrationPaths: [
        {
          archetype: { id: 1, name: "Java EE Application" },
          targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
        },
        {
          archetype: { id: 3, name: "Legacy Java Application" },
          targetProfile: { id: 32, name: "Java 8 on OpenShift" },
        },
      ],
    };
    const profiles = [
      'agentic.skill.targetProfileOption {"profile":"OpenJDK 21 on OpenShift","archetype":"Java EE Application"}',
      'agentic.skill.targetProfileOption {"profile":"Java 8 on OpenShift","archetype":"Legacy Java Application"}',
    ];
    expect(
      getPlanDeleteBlocker(
        { ...shared, runCount: 2, applicationImpact: { matching: 3 } },
        t
      )
    ).toBe('agentic.plan.deleteUsedByRuns {"count":2}');
    expect(
      getPlanDeleteBlocker({ ...shared, applicationImpact: { matching: 3 } }, t)
    ).toBe(
      `agentic.plan.deleteMatchingApplications ${JSON.stringify({ count: 3, profiles })}`
    );
    // Target profiles whose archetypes have no applications still block.
    expect(getPlanDeleteBlocker(shared, t)).toBe(
      `agentic.plan.deleteAssigned ${JSON.stringify({ count: 2, profiles })}`
    );
  });
});
