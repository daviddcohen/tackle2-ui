import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  Flex,
  FlexItem,
  Popover,
  Skeleton,
} from "@patternfly/react-core";
import { RhUiQuestionMarkCircleIcon } from "@patternfly/react-icons";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import {
  attachedSkillsFor,
  useLoadPolicyMarker,
} from "@app/pages/agentic/components/attached-skills-list";
import { LinkLabels } from "@app/pages/agentic/components/detail-section";
import {
  ManageSkillsTarget,
  manageSkillsButtonId,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import { targetProfilesPath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";
import { universalComparator } from "@app/utils/utils";

const useArchetypeLinks = (archetype: Archetype) => {
  const { t } = useTranslation();
  return useEntityBreadcrumbs(archetype.name, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]).to;
};

/**
 * The help on the Skills term: archetype skills reach every migration path,
 * and each target profile adds its own skills only when a run uses it, so
 * the drawer does not list them.
 */
export const ArchetypeSkillsHelp: React.FC<{ archetype: Archetype }> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  const to = useArchetypeLinks(archetype);
  return (
    <Popover
      headerContent={t("agentic.archetype.skills")}
      bodyContent={
        <Trans
          i18nKey="agentic.attachedSkills.archetypeHelp"
          components={{
            targetProfilesLink: (
              <Link to={to(targetProfilesPath(archetype.id))} />
            ),
          }}
        />
      }
      closeBtnAriaLabel={t("actions.close")}
    >
      <Button
        variant="plain"
        hasNoPadding
        aria-label={t("agentic.attachedSkills.archetypeHelpLabel")}
        icon={<RhUiQuestionMarkCircleIcon />}
      />
    </Popover>
  );
};

export interface ArchetypeSkillsProps {
  archetype: Archetype;
  /** Opens the page's Manage skills modal for the archetype. */
  onManageSkills: (target: ManageSkillsTarget) => void;
}

/**
 * The Skills fact of the archetype drawer's Details tab: the skills attached
 * to the archetype, which every application in it inherits, as link labels
 * like the tags above it, with Manage skills for those who can edit them.
 * Target profile skills are not listed: they belong to one migration path
 * each (`ArchetypeSkillsHelp`).
 */
export const ArchetypeSkills: React.FC<ArchetypeSkillsProps> = ({
  archetype,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const canManageSkills = useCanManageSkills();
  const to = useArchetypeLinks(archetype);
  const markerOf = useLoadPolicyMarker();
  const { skills, isLoading, fetchError } = useFetchSkills();

  if (isLoading) {
    return (
      <Skeleton
        width="40%"
        screenreaderText={t("agentic.plan.loadingSkillsShort")}
      />
    );
  }
  if (fetchError) {
    // A failed query is not "no skills".
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }

  const target: ManageSkillsTarget = {
    scope: "archetype",
    id: archetype.id,
    name: archetype.name,
  };
  const attached = attachedSkillsFor(skills, "archetype", archetype.id).sort(
    (a, b) => universalComparator(a.skill.name, b.skill.name)
  );

  return (
    <Flex
      spaceItems={{ default: "spaceItemsMd" }}
      alignItems={{ default: "alignItemsCenter" }}
    >
      <FlexItem>
        {attached.length > 0 ? (
          <LinkLabels
            aria-label={t("agentic.skill.skillsOf", { name: archetype.name })}
            items={attached.map(({ skill, loadPolicy }) => ({
              id: skill.id,
              name: skill.name,
              marker: markerOf(loadPolicy),
              to: to(
                generatePath(DevPaths.skillDetails, { skillId: skill.id })
              ),
            }))}
          />
        ) : (
          <EmptyTextMessage message={t("terms.none")} />
        )}
      </FlexItem>
      {canManageSkills && (
        <FlexItem>
          <Button
            id={manageSkillsButtonId(target)}
            variant="link"
            isInline
            aria-label={t("agentic.skill.manageSkills.titleFor", {
              name: archetype.name,
            })}
            onClick={() => onManageSkills(target)}
          >
            {t("agentic.skill.manageSkills.title")}
          </Button>
        </FlexItem>
      )}
    </Flex>
  );
};
