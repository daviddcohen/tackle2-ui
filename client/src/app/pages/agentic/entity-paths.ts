import { generatePath } from "react-router-dom";

import { TablePersistenceKeyPrefix } from "@app/Constants";
import { DevPaths } from "@app/Paths";
import { SkillAssociation } from "@app/agentic";
import { Archetype } from "@app/api/models";

export const archetypePath = (id: number) =>
  `${DevPaths.archetypes}?${new URLSearchParams({ [`${TablePersistenceKeyPrefix.archetypes}:activeItem`]: String(id) })}`;

export const targetProfilePath = (archetypeId: number, profileId: number) =>
  `${generatePath(DevPaths.archetypeTargetProfiles, { archetypeId: String(archetypeId) })}#target-profile-${profileId}`;

/** Target profiles are owned by archetypes, so their route must include that owner. */
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
    case "targetProfile": {
      const id = association.resource.id;
      const owner = archetypes.find((archetype) =>
        archetype.profiles?.some((profile) => profile.id === id)
      );
      return owner ? targetProfilePath(owner.id, id) : undefined;
    }
  }
};
