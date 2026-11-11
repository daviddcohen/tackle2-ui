import { TFunction } from "i18next";

import {
  Agent,
  EntityId,
  Skill,
  SkillAssociation,
  SkillAssociationScope,
  SkillCollection,
} from "@app/agentic";
import { Archetype } from "@app/api/models";

/** "Associated with" row order: agent, archetype, target profile, application. */
const associationScopeOrder: SkillAssociationScope[] = [
  "agent",
  "archetype",
  "targetProfile",
  "application",
];

export interface SkillAssociationRow {
  association: SkillAssociation;
  /** The name shown: a target profile adds its archetype to tell profiles apart. */
  name: string;
}

/**
 * The "Associated with" rows of a skill (skills amendment 6): ordered by type,
 * then by name. A target profile reads "{profile} ({archetype})"; its
 * archetype is found by profile id, and the name stays bare when the
 * archetypes are not known.
 */
export const getSkillAssociationRows = (
  t: TFunction,
  associations: SkillAssociation[],
  archetypes: Archetype[]
): SkillAssociationRow[] =>
  associations
    .map((association) => {
      if (association.scope !== "targetProfile") {
        return { association, name: association.resource.name };
      }
      const owner = archetypes.find((archetype) =>
        archetype.profiles?.some(
          (profile) => profile.id === association.resource.id
        )
      );
      return {
        association,
        name: owner
          ? t("agentic.skill.targetProfileOption", {
              profile: association.resource.name,
              archetype: owner.name,
            })
          : association.resource.name,
      };
    })
    .sort(
      (a, b) =>
        associationScopeOrder.indexOf(a.association.scope) -
          associationScopeOrder.indexOf(b.association.scope) ||
        a.name.localeCompare(b.name)
    );

export const getCollectionsContainingSkill = (
  skill: Pick<Skill, "id">,
  collections: SkillCollection[]
): SkillCollection[] =>
  collections.filter((collection) =>
    collection.skills.some((member) => member.id === skill.id)
  );

/** Anchor of the "Used by agents" section on the collection page. */
export const USED_BY_AGENTS_ID = "used-by-agents";

/** The agents that list the collection in their skill collections. */
export const getAgentsUsingCollection = (
  collectionId: EntityId,
  agents: Agent[]
): Agent[] =>
  agents.filter((agent) =>
    (agent.skillCollections ?? []).some((c) => c.id === collectionId)
  );

/**
 * Why the Skill cannot be deleted yet, or `undefined` when it can. A Skill
 * with associations or skill collection memberships is in use; the server
 * refuses those deletes with 409. The association count is the server's
 * `skill.associations` (addenda S1): when it is missing, usage is unknown.
 * `collections` is undefined while the collections query has not succeeded
 * (addenda X6). Either unknown blocks the delete.
 */
export const getSkillDeleteBlockedReason = (
  t: TFunction,
  skill: Skill,
  collections: SkillCollection[] | undefined
): string | undefined => {
  const associationCount = skill.associations?.length;
  if (associationCount == null || collections == null) {
    return t("agentic.common.usageUnchecked");
  }
  const collectionCount = getCollectionsContainingSkill(
    skill,
    collections
  ).length;
  if (associationCount > 0 && collectionCount > 0) {
    return t("agentic.skill.deleteBlockedBoth", {
      associations: t("agentic.skill.associationCount", {
        count: associationCount,
      }),
      collections: t("agentic.skill.collectionCount", {
        count: collectionCount,
      }),
    });
  }
  if (associationCount > 0) {
    return t("agentic.skill.deleteBlockedAssociations", {
      count: associationCount,
    });
  }
  if (collectionCount > 0) {
    return t("agentic.skill.deleteBlockedCollections", {
      count: collectionCount,
    });
  }
  return undefined;
};

/**
 * Why the skill collection cannot be deleted yet, or `undefined` when it can:
 * agents still use it. `agents` is undefined while the agents query has not
 * succeeded (addenda X6).
 */
export const getCollectionDeleteBlockedReason = (
  t: TFunction,
  collectionId: EntityId,
  agents: Agent[] | undefined
): string | undefined => {
  if (agents == null) {
    return t("agentic.common.usageUnchecked");
  }
  const count = getAgentsUsingCollection(collectionId, agents).length;
  return count > 0
    ? t("agentic.skillCollection.deleteBlocked", { count })
    : undefined;
};
