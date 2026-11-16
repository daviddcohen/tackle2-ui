import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  EmptyState,
  EmptyStateBody,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { DrawerTabContent } from "@app/components/detail-drawer";
import {
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
} from "@app/pages/agentic/components/skills-table";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";

/** Skills associated with the archetype and with its target profiles (guide 2.3, sources 3 and 4). */
export const TabAssociatedSkills: React.FC<{ archetype: Archetype }> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  const { to } = useEntityBreadcrumbs(archetype.name, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]);
  const { skills, isLoading } = useFetchSkills();
  if (isLoading) {
    return (
      <DrawerTabContent>
        <AppPlaceholder />
      </DrawerTabContent>
    );
  }
  const profileIds = new Set(
    (archetype.profiles ?? []).map((profile) => profile.id)
  );
  const rows = groupSkillSources(
    skillAssociationSources(
      skills,
      (association) =>
        (association.scope === "archetype" &&
          association.resource.id === archetype.id) ||
        (association.scope === "targetProfile" &&
          profileIds.has(association.resource.id))
    )
  );
  return (
    <DrawerTabContent>
      {rows.length ? (
        <Stack hasGutter className={spacing.mtLg}>
          <StackItem>
            <Content component="p">
              {t("agentic.archetype.skillsDescription")}
            </Content>
          </StackItem>
          <StackItem>
            <SkillsTable rows={rows} linkTo={(pathname) => to(pathname)} />
          </StackItem>
        </Stack>
      ) : (
        <EmptyState
          headingLevel="h3"
          icon={CubesIcon}
          titleText={t("agentic.skill.noArchetypeSkills")}
          variant="sm"
        >
          <EmptyStateBody>
            {t("agentic.skill.noArchetypeSkillsDescription")}
          </EmptyStateBody>
        </EmptyState>
      )}
    </DrawerTabContent>
  );
};
