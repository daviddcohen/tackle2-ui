import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Content } from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { DrawerTabContent } from "@app/components/detail-drawer";
import {
  AttachedSkillsGroup,
  AttachedSkillsList,
  attachedSkillsFor,
} from "@app/pages/agentic/components/attached-skills-list";
import {
  ManageSkillsTarget,
  manageSkillsButtonId,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import { targetProfilesPath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";

export interface TabSkillsProps {
  archetype: Archetype;
  /** Opens the page's Manage skills modal for the archetype. */
  onManageSkills: (target: ManageSkillsTarget) => void;
}

/**
 * The archetype drawer's Skills tab: the skills attached to the archetype,
 * which every application in it inherits. Target profile skills are not
 * listed: a target profile is one of the archetype's migration paths, and
 * its skills reach agents only when a migration plan runs on it. One
 * sentence after the group says so and links to the target profiles page,
 * where each profile's skills are.
 */
export const TabSkills: React.FC<TabSkillsProps> = ({
  archetype,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const canManageSkills = useCanManageSkills();
  const { to } = useEntityBreadcrumbs(archetype.name, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]);
  const { skills, isLoading, fetchError } = useFetchSkills();

  if (isLoading) {
    return (
      <DrawerTabContent>
        <AppPlaceholder />
      </DrawerTabContent>
    );
  }
  if (fetchError) {
    // A failed query is not "no skills".
    return (
      <DrawerTabContent>
        <StateError />
      </DrawerTabContent>
    );
  }

  const target: ManageSkillsTarget = {
    scope: "archetype",
    id: archetype.id,
    name: archetype.name,
  };
  const group: AttachedSkillsGroup = {
    key: `archetype-${archetype.id}`,
    heading: t("agentic.attachedSkills.archetypeOwn"),
    // Nothing comes before it in the drawer: no "also".
    description: t("agentic.skill.scopeSentence.archetypeStandalone"),
    skills: attachedSkillsFor(skills, "archetype", archetype.id),
    emptyText: t("agentic.attachedSkills.archetypeEmpty"),
    manage: canManageSkills
      ? {
          onClick: () => onManageSkills(target),
          buttonId: manageSkillsButtonId(target),
          ariaLabel: t("agentic.skill.manageSkills.titleFor", {
            name: archetype.name,
          }),
        }
      : undefined,
  };
  const hasProfiles = (archetype.profiles ?? []).length > 0;

  return (
    <DrawerTabContent>
      <div className={spacing.mtMd}>
        <AttachedSkillsList groups={[group]} headingLevel="h3" linkTo={to} />
        <Content component="p" className={spacing.mtXl}>
          <Trans
            i18nKey={
              hasProfiles
                ? "agentic.attachedSkills.targetProfilesPointer"
                : "agentic.attachedSkills.targetProfilesPointerNone"
            }
            components={{
              targetProfilesLink: (
                <Link to={to(targetProfilesPath(archetype.id))} />
              ),
            }}
          />
        </Content>
      </div>
    </DrawerTabContent>
  );
};
