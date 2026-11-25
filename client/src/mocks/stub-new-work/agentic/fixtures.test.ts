import { mockApplicationArray } from "@mocks/stub-new-work/applications";
import { mockArchetypes } from "@mocks/stub-new-work/archetypes";
import {
  mockAnalysisProfiles,
  mockBusinessServices,
  mockGenerators,
  mockIdentities,
} from "@mocks/stub-new-work/prototype-support";

import { resetAgenticDb } from "./db";
import { getApplicationMigration } from "./execution";
import {
  mockAgentTestRuns,
  mockAgents,
  mockGateways,
  mockMigrationPlans,
  mockPlanRuns,
  mockProviders,
  mockSkillCollections,
  mockSkills,
  mockTargetProfilePlans,
} from "./fixtures";
import { PORTFOLIO_APPLICATION_IDS, selectPortfolio } from "./portfolio";
import { migrationPathsOf } from "./skill-resolution";

const ids = <T extends { id: number | string }>(items: T[]) =>
  new Set<number | string>(items.map((item) => item.id));

describe("agentic prototype fixtures", () => {
  const archetypes = Object.values(mockArchetypes);
  const targetProfiles = archetypes.flatMap(
    (archetype) => archetype.profiles ?? []
  );

  it("uses opaque string ids for agentic entities", () => {
    [
      ...mockGateways,
      ...mockProviders,
      ...mockSkills,
      ...mockSkillCollections,
      ...mockAgents,
      ...mockMigrationPlans,
      ...mockPlanRuns,
      ...mockAgentTestRuns,
    ].forEach((entity) => expect(typeof entity.id).toBe("string"));
    const stageIds = mockMigrationPlans.flatMap((plan) =>
      plan.stages.map((stage) => stage.id)
    );
    expect(new Set(stageIds).size).toBe(stageIds.length);
  });

  it("connects every Model to an existing Provider", () => {
    mockGateways.forEach((model) => {
      const provider = mockProviders.find((p) => p.id === model.provider.id);
      expect(provider?.name).toBe(model.provider.name);
    });
  });

  it("has one verified organization default Model", () => {
    const defaults = mockGateways.filter(
      (gateway) => gateway.isOrganizationDefault
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].verificationStatus).toBe("verified");
  });

  it("connects every Agent to existing Models and bidirectional Skills", () => {
    const modelIds = ids(mockGateways);
    const skillsById = new Map(mockSkills.map((skill) => [skill.id, skill]));

    mockAgents.forEach((agent) => {
      const model = mockGateways.find(
        (candidate) => candidate.id === agent.model.id
      );
      expect(modelIds.has(agent.model.id)).toBe(true);
      expect(model?.name).toBe(agent.model.name);
      agent.skills.forEach((skillRef) => {
        const skill = skillsById.get(skillRef.id);
        expect(skill?.name).toBe(skillRef.name);
        expect(
          skill?.associations?.some(
            (association) =>
              association.scope === "agent" &&
              association.resource.id === agent.id
          )
        ).toBe(true);
      });
    });

    mockSkills.forEach((skill) => {
      skill.associations
        ?.filter((association) => association.scope === "agent")
        .forEach((association) => {
          const agent = mockAgents.find(
            (candidate) => candidate.id === association.resource.id
          );
          expect(agent?.name).toBe(association.resource.name);
          expect(
            agent?.skills.some((skillRef) => skillRef.id === skill.id)
          ).toBe(true);
        });
    });
  });

  it("adds only existing Skills the test run's Agent does not have", () => {
    const skillsById = new Map(mockSkills.map((skill) => [skill.id, skill]));
    const withAddedSkills = mockAgentTestRuns.filter(
      (run) => (run.addedSkills ?? []).length > 0
    );
    expect(withAddedSkills.length).toBeGreaterThan(0);
    withAddedSkills.forEach((run) => {
      const agent = mockAgents.find(
        (candidate) => candidate.id === run.agent.id
      );
      expect(agent?.name).toBe(run.agent.name);
      // Its own skills and its skill collections' skills.
      const agentSkillIds = [
        ...(agent?.skills ?? []),
        ...mockSkillCollections
          .filter((collection) =>
            (agent?.skillCollections ?? []).some((c) => c.id === collection.id)
          )
          .flatMap((collection) => collection.skills),
      ].map((skill) => skill.id);
      run.addedSkills?.forEach((skillRef) => {
        expect(skillsById.get(skillRef.id)?.name).toBe(skillRef.name);
        expect(agentSkillIds).not.toContain(skillRef.id);
      });
    });
  });

  it("gives every archetype a target profile, and the Java archetypes two", () => {
    expect(
      archetypes.map((archetype) => [
        archetype.name,
        (archetype.profiles ?? []).map((profile) => profile.name),
      ])
    ).toEqual([
      ["Java EE Application", ["Quarkus 3.x", "OpenJDK 21 on OpenShift"]],
      ["Spring Boot Application", ["Quarkus 3.x"]],
      [
        "Legacy Java Application",
        ["Java 17 on OpenShift", "Java 8 on OpenShift"],
      ],
      [".NET Framework Application", [".NET 8 on OpenShift"]],
      ["Node.js Service", ["Node.js 22 on OpenShift"]],
    ]);
    // Target profile ids are unique across archetypes.
    expect(ids(targetProfiles).size).toBe(targetProfiles.length);
  });

  it("shares Java lift and shift between profiles of two archetypes", () => {
    expect(
      Object.entries(mockTargetProfilePlans)
        .filter(([, planId]) => planId === "3")
        .map(([profileId]) => Number(profileId))
    ).toEqual([12, 32]);
    expect(mockMigrationPlans.find((plan) => plan.id === "3")?.name).toBe(
      "Java lift and shift"
    );
  });

  it("connects every Plan to valid Agents and every target profile to an existing Plan", () => {
    const agentIds = ids(mockAgents);
    mockMigrationPlans.forEach((plan) => {
      // A plan's migration paths are server-derived, never seeded.
      expect(plan).not.toHaveProperty("migrationPaths");
      expect(plan.stages.map((stage) => stage.order)).toEqual(
        plan.stages.map((_, index) => index + 1)
      );
      plan.stages.forEach((stage) => {
        expect(agentIds.has(stage.agent.id)).toBe(true);
        expect(
          mockAgents.find((agent) => agent.id === stage.agent.id)?.name
        ).toBe(stage.agent.name);
      });
    });

    const planIds = ids(mockMigrationPlans);
    const profileIds = ids(targetProfiles);
    Object.entries(mockTargetProfilePlans).forEach(([profileId, planId]) => {
      expect(profileIds.has(Number(profileId))).toBe(true);
      expect(planIds.has(planId)).toBe(true);
    });
    // Every target profile uses a plan.
    expect(
      targetProfiles
        .filter((profile) => mockTargetProfilePlans[profile.id] == null)
        .map((profile) => profile.id)
    ).toEqual([]);
    // The alternatives a user picks with "Use one migration plan for all
    // applications": no target profile uses them.
    const used = new Set(Object.values(mockTargetProfilePlans));
    expect(
      mockMigrationPlans
        .filter((plan) => !used.has(plan.id))
        .map((plan) => plan.name)
    ).toEqual(["Spring Boot 3 modernization", ".NET lift and shift"]);
  });

  it("sets a load policy on every Skill: rules for process and house rules", () => {
    mockSkills.forEach((skill) =>
      expect(["rule", "skill"]).toContain(skill.loadPolicy)
    );
    expect(
      mockSkills
        .filter((skill) => skill.loadPolicy === "rule")
        .map((skill) => skill.name)
    ).toEqual(
      expect.arrayContaining([
        "Corporate coding standards",
        "Platform security baseline",
        "Build validation standards",
        "Incremental transformation workflow",
      ])
    );
  });

  it("keeps Java skills off the general agents and gives every collection an agent", () => {
    const general = mockAgents.filter((agent) =>
      ["Migration Proposal Agent", "Code Migrator"].includes(agent.name)
    );
    expect(general).toHaveLength(2);
    const javaSkillIds = ["1", "2", "3", "9"];
    general.forEach((agent) => {
      expect(agent.skillCollections ?? []).toEqual([]);
      agent.skills.forEach((skill) =>
        expect(javaSkillIds).not.toContain(skill.id)
      );
    });
    const javaMigrator = mockAgents.find(
      (agent) => agent.name === "Java Code Migrator"
    )!;
    expect(javaMigrator.skillCollections).toEqual([
      { id: "1", name: "Java modernization foundation" },
    ]);
    // The Migrate stage of the Java plans uses it.
    ["1", "2", "5"].forEach((planId) =>
      expect(
        mockMigrationPlans
          .find((plan) => plan.id === planId)
          ?.stages.map((stage) => stage.agent.id)
      ).toContain(javaMigrator.id)
    );
    mockSkillCollections.forEach((collection) =>
      expect(
        mockAgents.some((agent) =>
          (agent.skillCollections ?? []).some((c) => c.id === collection.id)
        )
      ).toBe(true)
    );
  });

  it("resolves every Skill association to a real resource", () => {
    const agentIds = ids(mockAgents);
    const archetypeIds = ids(archetypes);
    const targetProfileIds = ids(targetProfiles);
    const applicationIds = ids(mockApplicationArray);

    mockSkills.forEach((skill) => {
      skill.associations?.forEach((association) => {
        const resourceIds = {
          agent: agentIds,
          archetype: archetypeIds,
          targetProfile: targetProfileIds,
          application: applicationIds,
        }[association.scope];
        expect(resourceIds.has(association.resource.id)).toBe(true);
      });
    });
  });

  it("links every seeded plan run to its Plan's stages and portfolio applications", () => {
    mockPlanRuns.forEach((run) => {
      const plan = mockMigrationPlans.find(
        (candidate) => candidate.id === run.planId
      );
      expect(plan?.name).toBe(run.planName);
      run.stageRuns.forEach((stageRun) => {
        expect(plan?.stages.map((stage) => stage.id)).toContain(
          stageRun.stageId
        );
      });
      run.applications.forEach((application) => {
        expect(PORTFOLIO_APPLICATION_IDS).toContain(application.id);
      });
    });
  });

  it("labels every referenced Application with its canonical entity name", () => {
    const references = [
      ...mockPlanRuns.flatMap((run) => run.applications),
      ...mockAgentTestRuns.map((run) => run.application),
      ...mockSkills.flatMap((skill) =>
        (skill.associations ?? [])
          .filter((association) => association.scope === "application")
          .map((association) => association.resource)
      ),
    ];
    references.forEach((reference) => {
      expect(
        mockApplicationArray.find(
          (application) => application.id === reference.id
        )?.name
      ).toBe(reference.name);
    });
  });

  it("keeps Application and Archetype membership bidirectional", () => {
    const services = ids(mockBusinessServices);
    const identities = ids(mockIdentities);

    mockApplicationArray.forEach((application) => {
      expect(application.businessService).toBeDefined();
      expect(services.has(application.businessService!.id)).toBe(true);
      application.identities?.forEach((identity) => {
        expect(identities.has(identity.id)).toBe(true);
      });
      expect(application.archetypes).toHaveLength(1);
      const archetype = mockArchetypes[application.archetypes![0].id];
      expect(archetype?.name).toBe(application.archetypes![0].name);
      expect(
        archetype.applications?.some(
          (applicationRef) => applicationRef.id === application.id
        )
      ).toBe(true);
    });

    archetypes.forEach((archetype) => {
      archetype.applications?.forEach((applicationRef) => {
        const application = mockApplicationArray.find(
          (candidate) => candidate.id === applicationRef.id
        );
        expect(application?.name).toBe(applicationRef.name);
        expect(application?.archetypes?.[0].id).toBe(archetype.id);
      });
    });
  });

  it("connects Target Profiles to existing support fixtures", () => {
    const generatorIds = ids(mockGenerators);
    const analysisProfileIds = ids(mockAnalysisProfiles);

    // Java 8 on OpenShift has none: the "Not assigned" analysis profile.
    expect(
      targetProfiles
        .filter((profile) => profile.analysisProfile == null)
        .map((profile) => profile.id)
    ).toEqual([32]);
    targetProfiles.forEach((profile) => {
      if (profile.analysisProfile != null) {
        expect(analysisProfileIds.has(profile.analysisProfile.id)).toBe(true);
        expect(
          mockAnalysisProfiles.find(
            (candidate) => candidate.id === profile.analysisProfile!.id
          )?.name
        ).toBe(profile.analysisProfile.name);
      }
      profile.generators.forEach((generator) => {
        expect(generatorIds.has(generator.id)).toBe(true);
        expect(
          mockGenerators.find((candidate) => candidate.id === generator.id)
            ?.name
        ).toBe(generator.name);
      });
    });
  });

  it("configures every portfolio Application: a target profile of its Archetype uses a Plan", () => {
    resetAgenticDb();
    selectPortfolio(mockApplicationArray).forEach((application) => {
      const runnable = migrationPathsOf(application).filter(
        (path) => path.plan != null
      );
      expect(runnable.length).toBeGreaterThan(0);
      runnable.forEach((path) =>
        expect(path.archetypeId).toBe(application.archetypes![0].id)
      );
      expect(getApplicationMigration(application).configured).toBe(true);
    });
  });

  it("shows every Archetype in the 13-application portfolio", () => {
    const portfolio = selectPortfolio(mockApplicationArray);
    expect(portfolio).toHaveLength(13);
    expect(
      new Set(portfolio.map((application) => application.archetypes![0].id))
    ).toEqual(ids(archetypes));
  });
});
