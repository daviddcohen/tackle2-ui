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

/** "Attached to" order: agent, archetype, target profile, application. */
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
 * The attachments of a skill: ordered by type, then by
 * name. A target profile reads "{profile} ({archetype})"; its
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

/** The usage summary's count keys, in origin order. */
const usageScopeKeys: [SkillAssociationScope, string][] = [
  ["agent", "agents"],
  ["archetype", "archetypes"],
  ["targetProfile", "targetProfiles"],
  ["application", "applications"],
];

/**
 * What a skill is attached to, one count per type, zero types left out:
 * ["2 agents", "1 archetype"]. Collections are not attachments.
 */
export const getSkillAttachmentParts = (
  t: TFunction,
  associations: SkillAssociation[]
): string[] =>
  usageScopeKeys.flatMap(([scope, key]) => {
    const count = associations.filter((a) => a.scope === scope).length;
    return count > 0 ? [t(`agentic.skill.usageSummary.${key}`, { count })] : [];
  });

/**
 * The usage summary of a skill: its attachments and its skill
 * collections, in origin order (agents, collections, archetypes, target
 * profiles, applications), zero types left out. Undefined when the
 * attachments are unknown; without `collectionCount` (not loaded) the
 * collections are left out.
 */
export const getSkillUsageParts = (
  t: TFunction,
  skill: Pick<Skill, "associations">,
  collectionCount: number | undefined
): string[] | undefined => {
  if (skill.associations == null) return undefined;
  const [agents, ...others] = usageScopeKeys.map(([scope, key]) => {
    const count = skill.associations!.filter((a) => a.scope === scope).length;
    return count > 0 ? t(`agentic.skill.usageSummary.${key}`, { count }) : "";
  });
  const collections =
    collectionCount != null && collectionCount > 0
      ? t("agentic.skill.usageSummary.collections", { count: collectionCount })
      : "";
  return [agents, collections, ...others].filter((part) => part !== "");
};

/**
 * Why the Skill cannot be deleted yet, or `undefined` when it can. A Skill
 * attached to something or in a skill collection is in use; the server
 * refuses those deletes with 409. The attachments are the server's
 * `skill.associations`: when they are missing, usage is
 * unknown. `collections` is undefined while the collections query has not
 * succeeded. Either unknown blocks the delete.
 */
export const getSkillDeleteBlockedReason = (
  t: TFunction,
  skill: Skill,
  collections: SkillCollection[] | undefined
): string | undefined => {
  if (skill.associations == null || collections == null) {
    return t("agentic.common.usageUnchecked");
  }
  const attachments = getSkillAttachmentParts(t, skill.associations);
  const collectionCount = getCollectionsContainingSkill(
    skill,
    collections
  ).length;
  if (attachments.length > 0 && collectionCount > 0) {
    return t("agentic.skill.deleteBlockedBoth", {
      attachments,
      collections: t("agentic.skill.collectionCount", {
        count: collectionCount,
      }),
    });
  }
  if (attachments.length > 0) {
    // One attachment names the thing to remove it from; several are "them".
    const attached = skill.associations.filter((association) =>
      usageScopeKeys.some(([scope]) => scope === association.scope)
    );
    return attached.length === 1
      ? t(`agentic.skill.deleteBlockedAttachedOne.${attached[0].scope}`, {
          attachments,
        })
      : t("agentic.skill.deleteBlockedAttached", { attachments });
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
 * succeeded.
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
