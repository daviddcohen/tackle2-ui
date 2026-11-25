import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Button } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import i18n from "@app/i18n";
import {
  AttachedSkill,
  attachedSkillsFor,
  useLoadPolicyMarker,
} from "@app/pages/agentic/components/attached-skills-list";
import {
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
 * Archetypes as a list of the current language ("A, B and C"), each name a
 * link: every element part of `Intl.ListFormat` is the next archetype.
 */
const ArchetypeLinks: React.FC<{
  archetypes: Ref[];
  to: (archetype: Ref) => ReturnType<typeof linkToPath>;
}> = ({ archetypes, to }) => {
  let next = 0;
  return (
    <>
      {new Intl.ListFormat(i18n.language ?? "en", { type: "conjunction" })
        .formatToParts(archetypes.map((archetype) => archetype.name))
        .map((part, index) => {
          if (part.type !== "element") {
            return <React.Fragment key={index}>{part.value}</React.Fragment>;
          }
          const archetype = archetypes[next++];
          return (
            <Link key={index} to={to(archetype)}>
              {archetype.name}
            </Link>
          );
        })}
    </>
  );
};

/**
 * The skills this application has before any run: its own, editable with
 * Manage skills, then the ones it inherits from its archetypes, read-only,
 * one label group like the section above, whose sentence links each
 * archetype where they are edited. Each section states its scope once. A
 * target profile is not listed: it is picked when a migration plan runs, so
 * its skills belong to the run (the plan run page's Skills by stage).
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

  const skillLabels = (attached: AttachedSkill[], groupName: string) => (
    <LinkLabels
      aria-label={groupName}
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
  const archetypeLinks = (
    <ArchetypeLinks
      archetypes={sortedArchetypes}
      to={(archetype) => linkToPath(linkTo, archetypePath(archetype.id))}
    />
  );
  // A skill on two archetypes is listed and counted once. Its load policy is
  // the skill's own, the same on every archetype.
  const inheritedSkills = sortedArchetypes
    .flatMap((archetype) =>
      attachedSkillsFor(skills, "archetype", archetype.id)
    )
    .filter(
      (attached, index, all) =>
        all.findIndex((other) => other.skill.id === attached.skill.id) === index
    );

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
          skillLabels(
            applicationSkills,
            t("agentic.skill.skillsOf", { name: applicationName })
          )
        ) : (
          <SectionEmpty>
            {t("agentic.attachedSkills.applicationEmpty")}
          </SectionEmpty>
        )}
      </DetailSection>

      <DetailSection
        headingId={archetypeSkillsHeadingId}
        title={
          inheritedSkills.length > 0
            ? t("agentic.attachedSkills.archetypesWithCount", {
                count: inheritedSkills.length,
              })
            : t("agentic.attachedSkills.archetypes")
        }
        description={
          // Without inherited skills the content names the archetypes.
          inheritedSkills.length > 0 ? (
            <Trans
              i18nKey="agentic.attachedSkills.inherited"
              components={{ archetypes: archetypeLinks }}
            />
          ) : undefined
        }
      >
        {archetypes.length === 0 ? (
          <SectionEmpty
            action={
              <Button variant="link" isInline component={GoToArchetypesLink}>
                {t("agentic.execution.goToArchetypes")}
              </Button>
            }
          >
            {t("agentic.attachedSkills.noArchetype")}
          </SectionEmpty>
        ) : inheritedSkills.length > 0 ? (
          skillLabels(
            inheritedSkills,
            t("agentic.attachedSkills.inheritedLabel")
          )
        ) : (
          <SectionEmpty>
            <Trans
              i18nKey="agentic.attachedSkills.archetypesEmpty"
              components={{ archetypes: archetypeLinks }}
            />
          </SectionEmpty>
        )}
      </DetailSection>
    </DetailSections>
  );
};
