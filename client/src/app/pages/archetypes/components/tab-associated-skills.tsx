import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
} from "@app/pages/agentic/components/skills-table";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";
import { skillsWriteScopes } from "@app/scopes";

/** Skills associated with the archetype and with its target profiles. */
export const TabAssociatedSkills: React.FC<{ archetype: Archetype }> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  // Associations are edited on each skill.
  const canEditSkills = useHasSomeScopes(skillsWriteScopes);
  const { to } = useEntityBreadcrumbs(archetype.name, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]);
  const SkillsLink = useLinkComponent(to(DevPaths.skills));
  const { skills, isLoading, fetchError } = useFetchSkills();
  if (isLoading) {
    return (
      <DrawerTabContent>
        <AppPlaceholder />
      </DrawerTabContent>
    );
  }
  // A failed query is not "no skills".
  if (fetchError) {
    return (
      <DrawerTabContent>
        <StateError />
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
        <Stack hasGutter className={spacing.mtMd}>
          <StackItem>
            <Content component="p" className={textStyles.textColorSubtle}>
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
          titleText={t("agentic.archetype.noSkillsTitle")}
          variant="sm"
        >
          <EmptyStateBody>{t("agentic.archetype.noSkillsBody")}</EmptyStateBody>
          {canEditSkills && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" component={SkillsLink}>
                  {t("agentic.archetype.goToSkills")}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      )}
    </DrawerTabContent>
  );
};
