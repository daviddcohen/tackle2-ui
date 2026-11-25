import * as React from "react";
import { useTranslation } from "react-i18next";
import { RhUiThumbtackIcon } from "@patternfly/react-icons";

import {
  EntityRef,
  Skill,
  SkillAssociationScope,
  SkillLoadPolicy,
} from "@app/agentic";

import { LinkLabelItem } from "./detail-section";

/** One skill attached to an owner. */
export interface AttachedSkill {
  skill: EntityRef;
  loadPolicy?: SkillLoadPolicy;
}

/**
 * The marker of a skill label: a pin with "Always followed" for a rule,
 * nothing for a skill agents open when needed (the usual case).
 */
export const useLoadPolicyMarker = () => {
  const { t } = useTranslation();
  return (loadPolicy?: SkillLoadPolicy): LinkLabelItem["marker"] =>
    loadPolicy === "rule"
      ? {
          icon: <RhUiThumbtackIcon />,
          text: t("agentic.skill.loadPolicy.rule"),
        }
      : undefined;
};

/**
 * The skills attached directly to one owner (an archetype, a target profile
 * or an application), from `Skill.associations`.
 */
export const attachedSkillsFor = (
  skills: Skill[],
  scope: SkillAssociationScope,
  id: number | string
): AttachedSkill[] =>
  skills
    .filter((skill) =>
      skill.associations?.some(
        (association) =>
          association.scope === scope &&
          String(association.resource.id) === String(id)
      )
    )
    .map((skill) => ({
      skill: { id: skill.id, name: skill.name },
      loadPolicy: skill.loadPolicy,
    }));
