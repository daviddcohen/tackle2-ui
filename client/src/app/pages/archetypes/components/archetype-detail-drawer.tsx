import * as React from "react";
import { parsePath } from "history";
import { useTranslation } from "react-i18next";
import {
  Content,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { isAgenticEnabled } from "@app/Constants";
import { Paths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { BreadCrumbPath } from "@app/components/BreadCrumbPath";
import { PageDrawerContent } from "@app/components/PageDrawerContext";
import {
  DrawerTabContent,
  DrawerTabsContainer,
  NoEntitySelected,
} from "@app/components/detail-drawer";
import { ReviewFields } from "@app/components/detail-drawer/review-fields";
import { BreadcrumbEntry } from "@app/hooks/useBreadcrumbs";
import { useUrlParams } from "@app/hooks/useUrlParams";

import { TabAssociatedSkills } from "./tab-associated-skills";
import { TabDetailsContent } from "./tab-details-content";
import { TabTargetProfiles } from "./tab-target-profiles";

interface IArchetypeDetailDrawerProps {
  breadcrumbs: BreadcrumbEntry[];
  onCloseClick: () => void;
  archetype: Archetype | null;
  /** Opens the page's Manage skills modal for the archetype. */
  onManageSkills: (archetype: Archetype) => void;
}

enum TabKey {
  Details = 0,
  TargetProfiles,
  Skills,
  Reviews,
}

const ArchetypeDetailDrawer: React.FC<IArchetypeDetailDrawerProps> = ({
  breadcrumbs,
  onCloseClick,
  archetype,
  onManageSkills,
}) => {
  const { t } = useTranslation();
  // The title is the leaf, so the trail shows ancestors only, and none when
  // the only ancestor is the Archetypes list behind the drawer.
  const ancestors = breadcrumbs
    .slice(0, -1)
    .filter(
      (crumb): crumb is BreadcrumbEntry & { path: string } => !!crumb.path
    );
  const showAncestors = !(
    ancestors.length === 0 ||
    (ancestors.length === 1 &&
      parsePath(ancestors[0].path).pathname === Paths.archetypes)
  );
  const [activeTabKey, setActiveTabKey] = useUrlParams<TabKey, "ar", "tab">({
    persistenceKeyPrefix: "ar",
    keys: ["tab"],
    defaultValue: TabKey.Details,
    serialize: (tab) => ({ tab: String(tab) }),
    deserialize: ({ tab }) => {
      const value = Number(tab);
      return [
        TabKey.Details,
        TabKey.TargetProfiles,
        ...(isAgenticEnabled ? [TabKey.Skills] : []),
        TabKey.Reviews,
      ].includes(value)
        ? value
        : TabKey.Details;
    },
  });

  return (
    <PageDrawerContent
      isExpanded={!!archetype}
      onCloseClick={onCloseClick}
      pageKey="archetype-details"
      header={
        <Stack hasGutter>
          {archetype && showAncestors && (
            <StackItem>
              <BreadCrumbPath breadcrumbs={ancestors} ancestorsOnly />
            </StackItem>
          )}
          <StackItem>
            <Content>
              <Content component="small" className={spacing.mb_0}>
                {t("titles.archetypeDrawer")}
              </Content>
              <Title headingLevel="h2" size="lg" className={spacing.mtXs}>
                {archetype
                  ? archetype.name
                  : t("agentic.archetype.noneSelected")}
              </Title>
            </Content>
          </StackItem>
        </Stack>
      }
    >
      {archetype ? (
        <DrawerTabsContainer>
          <Tabs
            activeKey={activeTabKey}
            onSelect={(_event, tabKey) => setActiveTabKey(tabKey as TabKey)}
          >
            <Tab
              eventKey={TabKey.Details}
              title={<TabTitleText>{t("terms.details")}</TabTitleText>}
            >
              <TabDetailsContent archetype={archetype} />
            </Tab>
            <Tab
              eventKey={TabKey.TargetProfiles}
              title={<TabTitleText>{t("terms.targetProfiles")}</TabTitleText>}
            >
              <TabTargetProfiles archetype={archetype} />
            </Tab>
            {isAgenticEnabled && (
              <Tab
                eventKey={TabKey.Skills}
                title={
                  <TabTitleText>{t("agentic.archetype.skills")}</TabTitleText>
                }
              >
                <TabAssociatedSkills
                  archetype={archetype}
                  onManageSkills={() => onManageSkills(archetype)}
                />
              </Tab>
            )}
            <Tab
              eventKey={TabKey.Reviews}
              title={<TabTitleText>{t("terms.review")}</TabTitleText>}
            >
              <DrawerTabContent>
                <ReviewFields archetype={archetype} />
              </DrawerTabContent>
            </Tab>
          </Tabs>
        </DrawerTabsContainer>
      ) : (
        <NoEntitySelected entityName={t("terms.archetype").toLowerCase()} />
      )}
    </PageDrawerContent>
  );
};

export default ArchetypeDetailDrawer;
