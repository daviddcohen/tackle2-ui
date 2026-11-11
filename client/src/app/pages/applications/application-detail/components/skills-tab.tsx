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
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
} from "@app/pages/agentic/components/skills-table";
import {
  useFetchApplicationMigrations,
  useFetchSkills,
} from "@app/queries/agentic";

import { TabSection, TabSections } from "./tab-sections";

interface SkillsTabProps {
  linkCrumbs: BreadcrumbEntry[];
  applicationId: number;
  archetypes: Ref[];
}

/**
 * The skills the agents use for this application (guide 2.3, sources 1-5),
 * from its migration view. Without a migration plan there are no agents yet,
 * so the table shows the skills associated with the application and its
 * archetypes.
 */
export const SkillsTab: React.FC<SkillsTabProps> = ({
  applicationId,
  linkCrumbs,
  archetypes,
}) => {
  const { t } = useTranslation();
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
    fetchError: skillsError,
  } = useFetchSkills({ enabled: !isLoadingMigrations && !hasPlan });

  const rows = React.useMemo(() => {
    if (hasPlan) {
      // The server did not say which skills apply: unknown, not none (X6).
      return migration?.effectiveSkills != null
        ? groupSkillSources(migration.effectiveSkills)
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

  if (isLoadingMigrations || (!hasPlan && isLoadingSkills)) {
    return <AppPlaceholder />;
  }

  if (migrationsError != null || (!hasPlan && skillsError != null)) {
    return <StateError />;
  }

  return (
    <TabSections>
      {rows == null ? (
        <TabSection title={t("agentic.applicationDetail.tabSkills")}>
          <EmptyTextMessage message={t("agentic.common.unavailable")} />
        </TabSection>
      ) : rows.length === 0 ? (
        <TabSection title={t("agentic.applicationDetail.tabSkills")}>
          <EmptyState variant="xs">
            <EmptyStateBody>
              {t("agentic.applicationDetail.skillsEmpty")}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" component={skillsLink}>
                  {t("agentic.applicationDetail.goToSkills")}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        </TabSection>
      ) : (
        <TabSection
          title={t("agentic.applicationDetail.skillsTitle", {
            count: rows.length,
          })}
          description={
            hasPlan
              ? t("agentic.applicationDetail.skillsDescription")
              : t("agentic.applicationDetail.skillsAssociatedDescription")
          }
        >
          <SkillsTable rows={rows} linkTo={linkTo} />
        </TabSection>
      )}
    </TabSections>
  );
};
