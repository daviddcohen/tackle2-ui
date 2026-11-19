import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  AttachedSkillsGroup,
  AttachedSkillsList,
  attachedSkillsFor,
} from "@app/pages/agentic/components/attached-skills-list";
import {
  manageSkillsButtonId,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import { linkToPath } from "@app/pages/agentic/components/skill-origin";
import {
  archetypePath,
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import {
  useFetchApplicationMigrations,
  useFetchSkills,
} from "@app/queries/agentic";
import { universalComparator } from "@app/utils/utils";

import { SKILLS_BY_STAGE_HASH } from "./skills-by-stage-anchor";

interface SkillsTabProps {
  linkCrumbs: BreadcrumbEntry[];
  applicationId: number;
  applicationName: string;
  archetypes: Ref[];
  /** Opens the page's Manage skills modal for this application. */
  onManageSkills: () => void;
}

/**
 * The skills attached to this application and to its context,
 * laid out like the Tags tab: the application's
 * own group first, editable with Manage skills; then one read-only group
 * per archetype, by name; then its target profile's group. Each group says
 * how far its skills reach. What each stage gets, with the agents' own
 * skills and the plan's exclusions, is the Migration tab's Skills by stage
 * section, which the intro links to once a plan exists.
 */
export const SkillsTab: React.FC<SkillsTabProps> = ({
  applicationId,
  applicationName,
  linkCrumbs,
  archetypes,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const canManageSkills = useCanManageSkills();
  const linkTo = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, linkCrumbs);
  const {
    migrations,
    isLoading: isLoadingMigration,
    fetchError: migrationError,
  } = useFetchApplicationMigrations([applicationId]);
  const migration = migrations[applicationId];
  const {
    skills,
    isLoading: isLoadingSkills,
    fetchError: skillsError,
  } = useFetchSkills();

  // Every group reads the skills list: without it, all of them would be wrong.
  if (isLoadingSkills) return <AppPlaceholder />;
  if (skillsError != null) return <StateError />;

  const ownerLink = (path: string) => <Link to={linkToPath(linkTo, path)} />;

  const applicationGroup: AttachedSkillsGroup = {
    key: `application-${applicationId}`,
    heading: t("agentic.attachedSkills.application"),
    headingText: t("agentic.attachedSkills.application"),
    description: t("agentic.skill.scopeSentence.application"),
    skills: attachedSkillsFor(skills, "application", applicationId),
    emptyText: t("agentic.attachedSkills.applicationEmpty"),
    ...(canManageSkills
      ? {
          manage: {
            onClick: onManageSkills,
            buttonId: manageSkillsButtonId({
              scope: "application",
              id: applicationId,
            }),
            ariaLabel: t("agentic.skill.manageSkills.titleFor", {
              name: applicationName,
            }),
          },
        }
      : {}),
  };

  const sortedArchetypes = [...archetypes].sort((a, b) =>
    universalComparator(a.name, b.name)
  );
  const archetypeGroups: AttachedSkillsGroup[] =
    sortedArchetypes.length > 0
      ? sortedArchetypes.map((archetype) => ({
          key: `archetype-${archetype.id}`,
          heading: (
            <Trans
              i18nKey="agentic.attachedSkills.archetype"
              values={{ name: archetype.name }}
              components={{
                nameLink: ownerLink(archetypePath(archetype.id, "skills")),
              }}
            />
          ),
          description: t("agentic.skill.scopeSentence.archetype"),
          skills: attachedSkillsFor(skills, "archetype", archetype.id),
          emptyText: t("agentic.attachedSkills.archetypeEmpty"),
        }))
      : [
          {
            key: "archetype-none",
            heading: t("agentic.attachedSkills.archetypeOwn"),
            skills: [],
            emptyText: t("agentic.attachedSkills.noArchetype"),
            emptyAction: {
              label: t("agentic.execution.goToArchetypes"),
              to: linkTo(DevPaths.archetypes),
            },
          },
        ];

  // An application gets only its own target profile's skills: its
  // archetype's. Without an archetype there is none to show.
  const profile = migration?.targetProfile;
  const profileArchetype = migration?.archetype;
  const targetProfileNone = t("agentic.attachedSkills.targetProfileNone");
  let targetProfileGroup: AttachedSkillsGroup | undefined;
  if (sortedArchetypes.length === 0) {
    targetProfileGroup = undefined;
  } else if (isLoadingMigration) {
    targetProfileGroup = {
      key: "targetProfile-loading",
      heading: targetProfileNone,
      skills: [],
      emptyText: "",
      isLoading: true,
    };
  } else if (migrationError != null) {
    targetProfileGroup = {
      key: "targetProfile-unavailable",
      heading: targetProfileNone,
      skills: [],
      emptyText: "",
      isUnavailable: true,
    };
  } else if (profile != null && profileArchetype != null) {
    targetProfileGroup = {
      key: `targetProfile-${profile.id}`,
      heading: (
        <Trans
          i18nKey="agentic.attachedSkills.targetProfile"
          values={{ name: profile.name }}
          components={{
            nameLink: ownerLink(
              targetProfilePath(profileArchetype.id, profile.id)
            ),
          }}
        />
      ),
      description: t("agentic.skill.scopeSentence.targetProfile", {
        archetype: profileArchetype.name,
      }),
      skills: attachedSkillsFor(skills, "targetProfile", profile.id),
      emptyText: t("agentic.attachedSkills.targetProfileEmpty"),
    };
  } else {
    const archetype = profileArchetype ?? sortedArchetypes[0];
    targetProfileGroup = {
      key: "targetProfile-none",
      heading: targetProfileNone,
      skills: [],
      emptyText: t("agentic.attachedSkills.noTargetProfile", {
        archetype: archetype.name,
      }),
      emptyAction: {
        label: t("agentic.execution.viewTargetProfiles"),
        to: linkTo(targetProfilesPath(archetype.id)),
      },
    };
  }

  // The Migration tab of this same page, at its Skills by stage section,
  // keeping the breadcrumb trail. Only a plan has stages to show.
  const migrationTab = new URLSearchParams(location.search);
  migrationTab.set("tab", "migration");
  const intro =
    migration?.plan != null ? (
      <>
        {t("agentic.applicationDetail.skillsIntro")}{" "}
        <Link
          to={{
            pathname: location.pathname,
            search: `?${migrationTab.toString()}`,
            hash: SKILLS_BY_STAGE_HASH,
            state: location.state,
          }}
        >
          {t("agentic.applicationDetail.seeSkillsByStage")}
        </Link>
      </>
    ) : undefined;

  return (
    <AttachedSkillsList
      groups={[
        applicationGroup,
        ...archetypeGroups,
        ...(targetProfileGroup != null ? [targetProfileGroup] : []),
      ]}
      headingLevel="h2"
      intro={intro}
      linkTo={(pathname) => linkTo(pathname)}
    />
  );
};
