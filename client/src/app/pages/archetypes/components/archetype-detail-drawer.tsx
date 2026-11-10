import "./archetype-detail-drawer.css";
import * as React from "react";
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
}) => {
  const { t } = useTranslation();
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
          {archetype && (
            <StackItem>
              <BreadCrumbPath breadcrumbs={breadcrumbs} />
            </StackItem>
          )}
          <StackItem>
            <Content>
              <Content component="small" className={spacing.mb_0}>
                {t("titles.archetypeDrawer")}
              </Content>
              <Title headingLevel="h2" size="lg" className={spacing.mtXs}>
                {archetype ? archetype.name : "No archetype selected"}
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
                title={<TabTitleText>{t("agentic.skill.title")}</TabTitleText>}
              >
                <TabAssociatedSkills archetype={archetype} />
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
