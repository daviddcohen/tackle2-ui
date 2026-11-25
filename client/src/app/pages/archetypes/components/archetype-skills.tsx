import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  DescriptionListTermHelpText,
  Popover,
  Skeleton,
  Split,
  SplitItem,
} from "@patternfly/react-core";
import { RhUiQuestionMarkCircleIcon } from "@patternfly/react-icons";
import flex from "@patternfly/react-styles/css/utilities/Flex/flex";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

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
const ArchetypeSkillsHelp: React.FC<{ archetype: Archetype }> = ({
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

export interface ArchetypeSkillsTermProps {
  archetype: Archetype;
  /** Opens the page's Manage skills modal for the archetype. */
  onManageSkills: (target: ManageSkillsTarget) => void;
}

/**
 * The Skills term of the archetype drawer's Details tab: "Skills" with its
 * help, and Manage skills at the end of the line for those who can edit
 * them, as a section heading carries its actions (`DetailSection`).
 * PatternFly's term has no actions slot, and `DescriptionListTerm` wraps its
 * children in an inline text span, so a Split in it cannot stretch.
 * `DescriptionListTermHelpText` (the term with help, as this one has)
 * renders its children straight in the `dt`, so the Split grows to the
 * term's full width. A unit test pins that structure.
 */
export const ArchetypeSkillsTerm: React.FC<ArchetypeSkillsTermProps> = ({
  archetype,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const canManageSkills = useCanManageSkills();
  const target: ManageSkillsTarget = {
    scope: "archetype",
    id: archetype.id,
    name: archetype.name,
  };
  return (
    <DescriptionListTermHelpText>
      <Split hasGutter className={flex.flexGrow_1}>
        <SplitItem isFilled>
          {t("agentic.archetype.skills")}{" "}
          <ArchetypeSkillsHelp archetype={archetype} />
        </SplitItem>
        {canManageSkills && (
          // The term is bold; the action reads as a link, as elsewhere.
          <SplitItem className={textStyles.fontWeightNormal}>
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
          </SplitItem>
        )}
      </Split>
    </DescriptionListTermHelpText>
  );
};

/**
 * The Skills value of the archetype drawer's Details tab: the skills attached
 * to the archetype, which every application in it inherits, as link labels
 * like the tags below it. Target profile skills are not listed: they belong
 * to one migration path each (`ArchetypeSkillsHelp`).
 */
export const ArchetypeSkills: React.FC<{ archetype: Archetype }> = ({
  archetype,
}) => {
  const { t } = useTranslation();
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

  const attached = attachedSkillsFor(skills, "archetype", archetype.id).sort(
    (a, b) => universalComparator(a.skill.name, b.skill.name)
  );

  return attached.length > 0 ? (
    <LinkLabels
      aria-label={t("agentic.skill.skillsOf", { name: archetype.name })}
      items={attached.map(({ skill, loadPolicy }) => ({
        id: skill.id,
        name: skill.name,
        marker: markerOf(loadPolicy),
        to: to(generatePath(DevPaths.skillDetails, { skillId: skill.id })),
      }))}
    />
  ) : (
    <EmptyTextMessage message={t("terms.none")} />
  );
};
