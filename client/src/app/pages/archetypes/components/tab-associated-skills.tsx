import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Split,
  SplitItem,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  MANAGE_SKILLS_BUTTON_ID,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import {
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
} from "@app/pages/agentic/components/skills-table";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";

export interface TabAssociatedSkillsProps {
  archetype: Archetype;
  /** Opens the page's Manage skills modal for this archetype. */
  onManageSkills: () => void;
}

/** Skills associated with the archetype and with its target profiles. */
export const TabAssociatedSkills: React.FC<TabAssociatedSkillsProps> = ({
  archetype,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  const canManageSkills = useCanManageSkills();
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
  // With no skill to pick, the way on is to create one (the empty state's
  // link). When the read failed, the modal shows why.
  const hasManageButton =
    canManageSkills && (fetchError != null || skills.length > 0);
  let content: React.ReactNode;
  if (fetchError) {
    // A failed query is not "no skills".
    content = <StateError />;
  } else if (rows.length) {
    content = <SkillsTable rows={rows} linkTo={(pathname) => to(pathname)} />;
  } else {
    content = (
      <EmptyState
        headingLevel="h3"
        titleText={t("agentic.archetype.noSkillsTitle")}
        variant="sm"
      >
        <EmptyStateBody>{t("agentic.archetype.noSkillsBody")}</EmptyStateBody>
        {canManageSkills && !hasManageButton && (
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" component={SkillsLink}>
                {t("agentic.archetype.goToSkills")}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        )}
      </EmptyState>
    );
  }
  const hasDescription = rows.length > 0 && !fetchError;
  // Without a description or a button the heading line would only add a gap,
  // so the empty and error states keep their plain look.
  if (!hasDescription && !hasManageButton) {
    return <DrawerTabContent>{content}</DrawerTabContent>;
  }
  // One Manage skills button on the heading line whatever the content, so it
  // is still mounted, and gets focus back, when a save turns the empty state
  // into the table.
  return (
    <DrawerTabContent>
      <Stack hasGutter className={spacing.mtMd}>
        <StackItem>
          <Split hasGutter>
            <SplitItem isFilled>
              {hasDescription && (
                <Content component="p" className={textStyles.textColorSubtle}>
                  {t("agentic.archetype.skillsDescription")}
                </Content>
              )}
            </SplitItem>
            {hasManageButton && (
              <SplitItem>
                <Button
                  id={MANAGE_SKILLS_BUTTON_ID}
                  variant="link"
                  isInline
                  className={textStyles.textNowrap}
                  onClick={onManageSkills}
                >
                  {t("agentic.skill.manageSkills.title")}
                </Button>
              </SplitItem>
            )}
          </Split>
        </StackItem>
        <StackItem>{content}</StackItem>
      </Stack>
    </DrawerTabContent>
  );
};
