import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
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
import { linkToPath } from "@app/pages/agentic/components/skill-origin";
import {
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";
import { archetypesWriteScopes } from "@app/scopes";

export interface TabSkillsProps {
  archetype: Archetype;
  /** Opens the page's Manage skills modal for the archetype or one of its target profiles. */
  onManageSkills: (target: ManageSkillsTarget) => void;
}

/**
 * The archetype drawer's Skills tab: the skills attached to the
 * archetype, then one group per target profile, each with its own Manage
 * skills. A target profile after the first is legacy data: applications use
 * the first, so the group says its skills do not reach the agents.
 */
export const TabSkills: React.FC<TabSkillsProps> = ({
  archetype,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const canManageSkills = useCanManageSkills();
  const canManageProfiles = useHasSomeScopes(archetypesWriteScopes);
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

  const manage = (target: ManageSkillsTarget): AttachedSkillsGroup["manage"] =>
    canManageSkills
      ? {
          onClick: () => onManageSkills(target),
          buttonId: manageSkillsButtonId(target),
          ariaLabel: t("agentic.skill.manageSkills.titleFor", {
            name: target.name,
          }),
        }
      : undefined;

  const ownHeading = t("agentic.attachedSkills.archetypeOwn");
  const groups: AttachedSkillsGroup[] = [
    {
      key: `archetype-${archetype.id}`,
      heading: ownHeading,
      // Nothing comes before it in the drawer: no "also".
      description: t("agentic.skill.scopeSentence.archetypeStandalone"),
      skills: attachedSkillsFor(skills, "archetype", archetype.id),
      emptyText: t("agentic.attachedSkills.archetypeEmpty"),
      manage: manage({
        scope: "archetype",
        id: archetype.id,
        name: archetype.name,
      }),
    },
  ];

  const profiles = archetype.profiles ?? [];
  profiles.forEach((profile, index) => {
    groups.push({
      key: `targetProfile-${profile.id}`,
      heading: (
        <Trans
          i18nKey="agentic.attachedSkills.targetProfile"
          values={{ name: profile.name }}
          components={{
            nameLink: (
              <Link
                to={linkToPath(to, targetProfilePath(archetype.id, profile.id))}
              />
            ),
          }}
        />
      ),
      description:
        index === 0
          ? t("agentic.skill.scopeSentence.targetProfileStandalone", {
              archetype: archetype.name,
            })
          : t("agentic.archetype.profileNotUsed", {
              archetype: archetype.name,
              first: profiles[0].name,
            }),
      skills: attachedSkillsFor(skills, "targetProfile", profile.id),
      emptyText: t("agentic.attachedSkills.targetProfileEmpty"),
      manage: manage({
        scope: "targetProfile",
        id: profile.id,
        name: profile.name,
        archetype: { id: archetype.id, name: archetype.name },
      }),
    });
  });
  if (profiles.length === 0) {
    const heading = t("agentic.attachedSkills.targetProfileNone");
    groups.push({
      key: "targetProfile-none",
      heading,
      skills: [],
      emptyText: t("agentic.archetype.noTargetProfileForSkills"),
      emptyAction: canManageProfiles
        ? {
            label: t("actions.manageTargetProfiles"),
            to: to(targetProfilesPath(archetype.id)),
          }
        : undefined,
    });
  }

  return (
    <DrawerTabContent>
      <div className={spacing.mtMd}>
        <AttachedSkillsList groups={groups} headingLevel="h3" linkTo={to} />
      </div>
    </DrawerTabContent>
  );
};
