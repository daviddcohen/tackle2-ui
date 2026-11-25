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
import { archetypePath } from "@app/pages/agentic/entity-paths";
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
 * The skills this application has before any run, laid out like the Tags
 * tab: its own group first, editable with Manage skills; then one read-only
 * group per archetype, by name, whose skills it inherits. Each group says
 * how far its skills reach. A target profile is not listed: it is one of
 * its archetype's migration paths, picked when a migration plan runs, so
 * its skills belong to the run with the agents' own skills and the plan's
 * exclusions. The intro says where those are shown.
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

  // What is added when a migration plan runs (each stage's agent skills,
  // the skills of the target profile the run uses) is not attached here.
  // The intro says so and points where it is shown: the latest run's
  // snapshot on the Migration tab, or, before any run, the Run migration
  // plan dialog. While the view loads or fails, only the first sentence.
  const migrationTab = new URLSearchParams(location.search);
  migrationTab.set("tab", "migration");
  const hasRun = migration?.planRun != null;
  const hasNoRun =
    !isLoadingMigration && migrationError == null && migration?.planRun == null;
  const intro = (
    <>
      {t("agentic.applicationDetail.skillsIntro")}
      {hasRun && (
        <>
          {" "}
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
      )}
      {hasNoRun && <> {t("agentic.applicationDetail.skillsIntroNoRun")}</>}
    </>
  );

  return (
    <AttachedSkillsList
      groups={[applicationGroup, ...archetypeGroups]}
      headingLevel="h2"
      intro={intro}
      linkTo={(pathname) => linkTo(pathname)}
    />
  );
};
