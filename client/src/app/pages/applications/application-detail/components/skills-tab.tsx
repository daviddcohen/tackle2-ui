import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Button } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  AttachedSkill,
  attachedSkillsFor,
  useLoadPolicyMarker,
} from "@app/pages/agentic/components/attached-skills-list";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  LinkLabels,
  SectionEmpty,
} from "@app/pages/agentic/components/detail-section";
import {
  manageSkillsButtonId,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import { linkToPath } from "@app/pages/agentic/components/skill-origin";
import { archetypePath } from "@app/pages/agentic/entity-paths";
import { useFetchSkills } from "@app/queries/agentic";
import { universalComparator } from "@app/utils/utils";

interface SkillsTabProps {
  linkCrumbs: BreadcrumbEntry[];
  applicationId: number;
  applicationName: string;
  archetypes: Ref[];
  /** Opens the page's Manage skills modal for this application. */
  onManageSkills: () => void;
}

const applicationSkillsHeadingId = "application-skills-heading";
const archetypeSkillsHeadingId = "archetype-skills-heading";

const byName = (a: AttachedSkill, b: AttachedSkill) =>
  universalComparator(a.skill.name, b.skill.name);

/**
 * The skills this application has before any run: its own, editable with
 * Manage skills, then the ones it inherits from its archetypes, read-only,
 * one term per archetype (by name) that links where they are edited. Each
 * section states its scope once. A target profile is not listed: it is
 * picked when a migration plan runs, so its skills belong to the run (the
 * Migration tab's Skills by stage).
 */
export const SkillsTab: React.FC<SkillsTabProps> = ({
  applicationId,
  applicationName,
  linkCrumbs,
  archetypes,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const markerOf = useLoadPolicyMarker();
  const canManageSkills = useCanManageSkills();
  const linkTo = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, linkCrumbs);
  const GoToArchetypesLink = useLinkComponent(linkTo(DevPaths.archetypes));
  const {
    skills,
    isLoading: isLoadingSkills,
    fetchError: skillsError,
  } = useFetchSkills();

  // Both sections read the skills list: without it, both would be wrong.
  if (isLoadingSkills) return <AppPlaceholder />;
  if (skillsError != null) return <StateError />;

  const skillLabels = (attached: AttachedSkill[], ownerName: string) => (
    <LinkLabels
      aria-label={t("agentic.skill.skillsOf", { name: ownerName })}
      items={[...attached].sort(byName).map(({ skill, loadPolicy }) => ({
        id: skill.id,
        name: skill.name,
        marker: markerOf(loadPolicy),
        to: linkTo(generatePath(DevPaths.skillDetails, { skillId: skill.id })),
      }))}
    />
  );

  const applicationSkills = attachedSkillsFor(
    skills,
    "application",
    applicationId
  );

  const sortedArchetypes = [...archetypes].sort((a, b) =>
    universalComparator(a.name, b.name)
  );
  const archetypeSkills = sortedArchetypes.map((archetype) => ({
    archetype,
    skills: attachedSkillsFor(skills, "archetype", archetype.id),
  }));
  // A skill on two archetypes counts once.
  const inheritedCount = new Set(
    archetypeSkills.flatMap((entry) => entry.skills.map((s) => s.skill.id))
  ).size;

  return (
    <DetailSections>
      <DetailSection
        headingId={applicationSkillsHeadingId}
        title={
          applicationSkills.length > 0
            ? t("agentic.attachedSkills.applicationWithCount", {
                count: applicationSkills.length,
              })
            : t("agentic.attachedSkills.application")
        }
        description={t("agentic.skill.scopeSentence.application")}
        actions={
          canManageSkills ? (
            <Button
              id={manageSkillsButtonId({
                scope: "application",
                id: applicationId,
              })}
              variant="link"
              isInline
              aria-label={t("agentic.skill.manageSkills.titleFor", {
                name: applicationName,
              })}
              onClick={onManageSkills}
            >
              {t("agentic.skill.manageSkills.title")}
            </Button>
          ) : undefined
        }
      >
        {applicationSkills.length > 0 ? (
          skillLabels(applicationSkills, applicationName)
        ) : (
          <SectionEmpty>
            {t("agentic.attachedSkills.applicationEmpty")}
          </SectionEmpty>
        )}
      </DetailSection>

      <DetailSection
        headingId={archetypeSkillsHeadingId}
        title={
          inheritedCount > 0
            ? t("agentic.attachedSkills.archetypesWithCount", {
                count: inheritedCount,
              })
            : t("agentic.attachedSkills.archetypes")
        }
        description={
          archetypes.length > 0
            ? t("agentic.attachedSkills.inherited")
            : undefined
        }
      >
        {archetypes.length > 0 ? (
          <DetailFacts
            facts={archetypeSkills.map(({ archetype, skills: attached }) => [
              <Link
                key={archetype.id}
                to={linkToPath(linkTo, archetypePath(archetype.id))}
              >
                {archetype.name}
              </Link>,
              attached.length > 0 ? (
                skillLabels(attached, archetype.name)
              ) : (
                <EmptyTextMessage message={t("terms.none")} />
              ),
              { key: archetype.id },
            ])}
          />
        ) : (
          <SectionEmpty
            action={
              <Button variant="link" isInline component={GoToArchetypesLink}>
                {t("agentic.execution.goToArchetypes")}
              </Button>
            }
          >
            {t("agentic.attachedSkills.noArchetype")}
          </SectionEmpty>
        )}
      </DetailSection>
    </DetailSections>
  );
};
