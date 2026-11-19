import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  DetailSection,
  DetailSections,
} from "@app/pages/agentic/components/detail-section";
import {
  MANAGE_SKILLS_BUTTON_ID,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import {
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
  skillRowCounts,
} from "@app/pages/agentic/components/skills-table";
import {
  useFetchApplicationMigrations,
  useFetchSkills,
} from "@app/queries/agentic";

interface SkillsTabProps {
  linkCrumbs: BreadcrumbEntry[];
  applicationId: number;
  archetypes: Ref[];
  /** Opens the page's Manage skills modal for this application. */
  onManageSkills: () => void;
}

/**
 * The skills the agents use for this application,
 * from its migration view. Without a migration plan there are no agents yet,
 * so the table shows the skills associated with the application and its
 * archetypes.
 */
export const SkillsTab: React.FC<SkillsTabProps> = ({
  applicationId,
  linkCrumbs,
  archetypes,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const canManageSkills = useCanManageSkills();
  const linkTo = (pathname: string) => breadcrumbTo(pathname, "", linkCrumbs);
  const skillsLink = useLinkComponent(linkTo(DevPaths.skills));
  const {
    migrations,
    isLoading: isLoadingMigrations,
    fetchError: migrationsError,
  } = useFetchApplicationMigrations([applicationId]);
  const migration = migrations[applicationId];
  const hasPlan = migration?.plan != null;
  const {
    skills,
    isLoading: isLoadingSkills,
    isSuccess: isSkillsSuccess,
    fetchError: skillsError,
  } = useFetchSkills({
    // With a plan the rows come from the migration view; the list is still
    // read for a manager, to know whether any skill exists to associate.
    enabled: !isLoadingMigrations && (!hasPlan || canManageSkills),
  });

  const rows = React.useMemo(() => {
    if (hasPlan) {
      // The server did not say which skills apply: unknown, not none.
      // Skills its migration plan excludes stay in the table, marked.
      return migration?.effectiveSkills != null
        ? groupSkillSources(migration.effectiveSkills, migration.excludedSkills)
        : undefined;
    }
    const archetypeIds = new Set(archetypes.map((archetype) => archetype.id));
    return groupSkillSources(
      skillAssociationSources(
        skills,
        (association) =>
          (association.scope === "application" &&
            association.resource.id === applicationId) ||
          (association.scope === "archetype" &&
            archetypeIds.has(association.resource.id))
      )
    );
  }, [hasPlan, migration, skills, archetypes, applicationId]);

  const { used, total } = skillRowCounts(rows);

  if (isLoadingMigrations || (!hasPlan && isLoadingSkills)) {
    return <AppPlaceholder />;
  }

  // With no skill to pick, the way on is to create one (the empty state's
  // link). The direct skills do not depend on the effective set, so the
  // action is offered whatever the server says applies, and when a read
  // failed the modal says why.
  const hasManageButton =
    canManageSkills && !(isSkillsSuccess && skills.length === 0);

  let title = t("agentic.applicationDetail.tabSkills");
  let description: string | undefined;
  let content: React.ReactNode;
  if (migrationsError != null || (!hasPlan && skillsError != null)) {
    // Without the button there is nothing to put on a section heading.
    if (!hasManageButton) return <StateError />;
    content = <StateError />;
  } else if (rows == null) {
    content = <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  } else if (rows.length === 0) {
    content = (
      <EmptyState variant="xs">
        <EmptyStateBody>
          {t("agentic.applicationDetail.skillsEmpty")}
        </EmptyStateBody>
        {!hasManageButton && (
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" component={skillsLink}>
                {t("agentic.applicationDetail.goToSkills")}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        )}
      </EmptyState>
    );
  } else {
    title =
      used < total
        ? t("agentic.applicationDetail.skillsTitleUsed", {
            used,
            count: total,
          })
        : t("agentic.applicationDetail.skillsTitle", { count: total });
    description = !hasPlan
      ? t("agentic.applicationDetail.skillsAssociatedDescription")
      : used < total
        ? t("agentic.applicationDetail.skillsDescriptionExcluded")
        : t("agentic.applicationDetail.skillsDescription");
    content = <SkillsTable rows={rows} linkTo={linkTo} />;
  }

  // One section and one Manage skills button whatever the content, so the
  // button is still mounted, and gets focus back, when a save turns the
  // empty state into the table.
  return (
    <DetailSections>
      <DetailSection
        title={title}
        description={description}
        actions={
          hasManageButton ? (
            <Button
              id={MANAGE_SKILLS_BUTTON_ID}
              variant="link"
              isInline
              onClick={onManageSkills}
            >
              {t("agentic.skill.manageSkills.title")}
            </Button>
          ) : undefined
        }
      >
        {content}
      </DetailSection>
    </DetailSections>
  );
};
