import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  PageSection,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";

import { PageHeader } from "@app/components/PageHeader";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import { DetailTabPanel } from "@app/pages/agentic/entity-detail";

import { SkillCollectionsTab } from "./components/skill-collections-tab";
import { SkillsTab } from "./components/skills-tab";

const SKILLS_PAGE_TABS = ["skills", "collections"] as const;
type SkillsPageTab = (typeof SKILLS_PAGE_TABS)[number];
const TAB_PREFIX = "skills-page";

/** `/skills`: skills and skill collections, one tab each (`?tab=`, guide 7.5). */
const SkillsPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useUrlTab<SkillsPageTab>(
    SKILLS_PAGE_TABS,
    "skills"
  );
  const panelId = (tab: SkillsPageTab) => tabPanelId(TAB_PREFIX, tab);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("agentic.skill.title")}
          description={
            <Content component="p">{t("agentic.skill.description")}</Content>
          }
          breadcrumbs={[]}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs activeKey={activeTab} onSelect={(_e, key) => setActiveTab(key)}>
          <Tab
            eventKey="skills"
            id={panelId("skills")}
            tabContentId={panelId("skills")}
            title={<TabTitleText>{t("agentic.skill.title")}</TabTitleText>}
          />
          <Tab
            eventKey="collections"
            id={panelId("collections")}
            tabContentId={panelId("collections")}
            title={
              <TabTitleText>{t("agentic.skillCollection.title")}</TabTitleText>
            }
          />
        </Tabs>
      </PageSection>
      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="skills"
        activeKey={activeTab}
      >
        <SkillsTab />
      </DetailTabPanel>
      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="collections"
        activeKey={activeTab}
      >
        <SkillCollectionsTab />
      </DetailTabPanel>
    </>
  );
};

export default SkillsPage;
