import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { generatePath } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import type { Skill } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { useLoadPolicyMarker } from "@app/pages/agentic/components/attached-skills-list";
import { LinkLabels } from "@app/pages/agentic/components/detail-section";
import { universalComparator } from "@app/utils/utils";

export interface TargetProfileSkillsProps {
  /** Skills attached to this profile. */
  skills: Skill[];
  /** The profile's name, for the labels' accessible name. */
  profileName: string;
  isError: boolean;
  linkTo: (pathname: string) => LocationDescriptor;
}

/**
 * The skills attached to a target profile in a table cell, as link labels
 * by name like the generators beside them; "None" when there are none.
 * The column header's help says when agents use them.
 */
export const TargetProfileSkills: React.FC<TargetProfileSkillsProps> = ({
  skills,
  profileName,
  isError,
  linkTo,
}) => {
  const { t } = useTranslation();
  const markerOf = useLoadPolicyMarker();
  if (isError)
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  if (skills.length === 0)
    return <EmptyTextMessage message={t("terms.none")} />;

  return (
    <LinkLabels
      aria-label={t("agentic.skill.skillsOf", { name: profileName })}
      items={[...skills]
        .sort((a, b) => universalComparator(a.name, b.name))
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          marker: markerOf(skill.loadPolicy),
          to: linkTo(
            generatePath(DevPaths.skillDetails, { skillId: String(skill.id) })
          ),
        }))}
    />
  );
};
