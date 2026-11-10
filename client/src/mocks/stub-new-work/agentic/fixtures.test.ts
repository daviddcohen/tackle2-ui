import { mockApplicationArray } from "@mocks/stub-new-work/applications";
import { mockArchetypes } from "@mocks/stub-new-work/archetypes";
import {
  mockAnalysisProfiles,
  mockBusinessServices,
  mockGenerators,
  mockIdentities,
} from "@mocks/stub-new-work/prototype-support";

import { resetAgenticDb } from "./db";
import { getApplicationMigration, resolvePlanFor } from "./execution";
import {
  mockAgentTestRuns,
  mockAgents,
  mockGateways,
  mockMigrationPlans,
  mockPlanRuns,
  mockProviders,
  mockSkillCollections,
  mockSkills,
} from "./fixtures";
import { PORTFOLIO_APPLICATION_IDS, selectPortfolio } from "./portfolio";

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

  it("connects every Plan to one valid migration path and valid Agents", () => {
    const agentIds = ids(mockAgents);
    const assignedTargetProfileIds = new Set<number>();

    mockMigrationPlans.forEach((plan) => {
      expect(plan.migrationPath).toBeDefined();
      const archetype = mockArchetypes[plan.migrationPath!.archetype.id];
      expect(archetype?.name).toBe(plan.migrationPath!.archetype.name);
      expect(plan.migrationPath!.targetProfiles.length).toBeGreaterThan(0);
      plan.migrationPath!.targetProfiles.forEach((profileRef) => {
        const profile = archetype.profiles?.find(
          (candidate) => candidate.id === profileRef.id
        );
        expect(profile?.name).toBe(profileRef.name);
        expect(assignedTargetProfileIds.has(profileRef.id)).toBe(false);
        assignedTargetProfileIds.add(profileRef.id);
      });
      expect(plan.migrationPath!.isDefault).toBe(true);
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

    expect(
      targetProfiles
        .filter((profile) => !assignedTargetProfileIds.has(profile.id))
        .map((profile) => profile.id)
    ).toEqual([32]);
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

    targetProfiles.forEach((profile) => {
      expect(profile.analysisProfile).toBeDefined();
      expect(analysisProfileIds.has(profile.analysisProfile!.id)).toBe(true);
      profile.generators.forEach((generator) => {
        expect(generatorIds.has(generator.id)).toBe(true);
        expect(
          mockGenerators.find((candidate) => candidate.id === generator.id)
            ?.name
        ).toBe(generator.name);
      });
    });
  });

  it("resolves each portfolio Application to a Plan for its own Archetype", () => {
    resetAgenticDb();
    selectPortfolio(mockApplicationArray).forEach((application) => {
      const plan = resolvePlanFor(application);
      expect(plan).toBeDefined();
      expect(plan!.migrationPath!.archetype.id).toBe(
        application.archetypes![0].id
      );
      const migration = getApplicationMigration(application);
      expect(migration.configured).toBe(true);
      expect(migration.plan).toBeDefined();
    });
  });

  it("shows every Archetype in the 12-application portfolio", () => {
    const portfolio = selectPortfolio(mockApplicationArray);
    expect(portfolio).toHaveLength(12);
    expect(
      new Set(portfolio.map((application) => application.archetypes![0].id))
    ).toEqual(ids(archetypes));
  });
});
