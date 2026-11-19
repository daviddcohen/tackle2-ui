import { generatePath } from "react-router-dom";

import { TablePersistenceKeyPrefix } from "@app/Constants";
import { DevPaths } from "@app/Paths";
import { SkillAssociation } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { ArchetypeDrawerTab } from "@app/pages/archetypes/components/archetype-drawer-tabs";

/**
 * An archetype, open in the drawer of the archetypes table; with "skills",
 * on its Skills tab (every archetype link from a skills surface).
 */
export const archetypePath = (id: number, tab?: "skills") => {
  const prefix = TablePersistenceKeyPrefix.archetypes;
  return `${DevPaths.archetypes}?${new URLSearchParams({
    [`${prefix}:activeItem`]: String(id),
    ...(tab === "skills"
      ? { [`${prefix}:tab`]: String(ArchetypeDrawerTab.Skills) }
      : {}),
  })}`;
};

/** An application's Skills tab, where its own skills are attached. */
export const applicationSkillsPath = (applicationId: number) =>
  `${generatePath(DevPaths.applicationDetails, {
    applicationId: String(applicationId),
  })}?tab=skills`;

/** An archetype's target profiles page, where a migration plan is assigned to a profile. */
export const targetProfilesPath = (archetypeId: number) =>
  generatePath(DevPaths.archetypeTargetProfiles, {
    archetypeId: String(archetypeId),
  });

export const targetProfilePath = (archetypeId: number, profileId: number) =>
  `${targetProfilesPath(archetypeId)}#target-profile-${profileId}`;

/**
 * Target profiles are owned by archetypes, so their route must include that
 * owner. Undefined while the owner is unknown.
 */
export const targetProfileOwnerPath = (
  profileId: number,
  archetypes: Archetype[]
) => {
  const owner = archetypes.find((archetype) =>
    archetype.profiles?.some((profile) => profile.id === profileId)
  );
  return owner ? targetProfilePath(owner.id, profileId) : undefined;
};

/**
 * Where a skill's attachment is edited: the agent page, the archetype
 * drawer's Skills tab, the target profile on its archetype's page, the
 * application's Skills tab.
 */
export const skillAssociationPath = (
  association: SkillAssociation,
  archetypes: Archetype[]
) => {
  switch (association.scope) {
    case "agent":
      return generatePath(DevPaths.agentDetails, {
        agentId: association.resource.id,
      });
    case "application":
      return applicationSkillsPath(association.resource.id);
    case "archetype":
      return archetypePath(association.resource.id, "skills");
    case "targetProfile":
      return targetProfileOwnerPath(association.resource.id, archetypes);
  }
};
