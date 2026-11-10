import {
  Agent,
  EffectiveSkillAssociation,
  MigrationPlan,
  Skill,
  SkillCollection,
} from "@app/agentic";

/**
 * Where a Skill is associated: its server-maintained `associations`, or (for a
 * payload without them) the Agents that list it plus the Plans that resolve it.
 * Deduplicated by scope and name.
 */
export const getSkillAssociations = (
  skill: Skill,
  agents: Agent[],
  plans: MigrationPlan[]
): EffectiveSkillAssociation[] => {
  if (skill.associations) {
    return skill.associations.map((association) => ({
      skill: { id: skill.id, name: skill.name },
      scope: association.scope,
      scopeName: association.resource.name,
    }));
  }

  const associations: EffectiveSkillAssociation[] = [
    ...agents
      .filter((agent) =>
        agent.skills?.some((agentSkill) => agentSkill.id === skill.id)
      )
      .map((agent) => ({
        skill: { id: skill.id, name: skill.name },
        scope: "agent" as const,
        scopeName: agent.name,
      })),
    ...plans.flatMap((plan) =>
      (plan.effectiveSkills || []).filter(
        (association) => association.skill.id === skill.id
      )
    ),
  ];

  return associations.filter(
    (association, index) =>
      associations.findIndex(
        (candidate) =>
          candidate.scope === association.scope &&
          candidate.scopeName === association.scopeName
      ) === index
  );
};

export const getCollectionsContainingSkill = (
  skill: Pick<Skill, "id">,
  collections: SkillCollection[]
): SkillCollection[] =>
  collections.filter((collection) =>
    collection.skills.some((member) => member.id === skill.id)
  );

/**
 * Why the Skill cannot be deleted yet, or `undefined` when it can. A Skill
 * with associations or Skill collection memberships is in use; the server
 * refuses those deletes with 409.
 */
export type SkillDeleteBlocker = "associations" | "collections" | undefined;

export const getSkillDeleteBlocker = (
  skill: Skill,
  agents: Agent[],
  plans: MigrationPlan[],
  collections: SkillCollection[]
): SkillDeleteBlocker => {
  if (getSkillAssociations(skill, agents, plans).length > 0) {
    return "associations";
  }
  if (getCollectionsContainingSkill(skill, collections).length > 0) {
    return "collections";
  }
  return undefined;
};
