import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  EmptyState,
  EmptyStateBody,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
} from "@app/pages/agentic/components/skills-table";
import {
  useFetchApplicationMigrations,
  useFetchSkills,
} from "@app/queries/agentic";

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
    if (hasPlan) return groupSkillSources(migration?.effectiveSkills ?? []);
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

  if (rows.length === 0) {
    return (
      <EmptyState
        headingLevel="h3"
        icon={CubesIcon}
        titleText={t("agentic.applicationDetail.skillsEmptyTitle")}
        variant="sm"
      >
        <EmptyStateBody>
          {t("agentic.applicationDetail.skillsEmptyDescription")}
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h2" size="lg">
          {t("agentic.applicationDetail.skillsTitle", { count: rows.length })}
        </Title>
        <Content component="p">
          {hasPlan
            ? t("agentic.applicationDetail.skillsDescription")
            : t("agentic.applicationDetail.skillsAssociatedDescription")}
        </Content>
      </StackItem>
      <StackItem>
        <SkillsTable
          rows={rows}
          linkTo={(pathname) => breadcrumbTo(pathname, "", linkCrumbs)}
        />
      </StackItem>
    </Stack>
  );
};
