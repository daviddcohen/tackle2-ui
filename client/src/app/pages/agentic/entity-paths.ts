import { generatePath } from "react-router-dom";

import { TablePersistenceKeyPrefix } from "@app/Constants";
import { DevPaths } from "@app/Paths";
import { SkillAssociation } from "@app/agentic";
import { Archetype } from "@app/api/models";

export const archetypePath = (id: number) =>
  `${DevPaths.archetypes}?${new URLSearchParams({ [`${TablePersistenceKeyPrefix.archetypes}:activeItem`]: String(id) })}`;

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
      return generatePath(DevPaths.applicationDetails, {
        applicationId: String(association.resource.id),
      });
    case "archetype":
      return archetypePath(association.resource.id);
    case "targetProfile":
      return targetProfileOwnerPath(association.resource.id, archetypes);
  }
};
