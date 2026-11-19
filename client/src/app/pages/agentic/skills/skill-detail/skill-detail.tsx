import * as React from "react";
import { AxiosError } from "axios";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { Components } from "react-markdown";
import { useHistory, useLocation, useParams } from "react-router-dom";
import {
  ButtonVariant,
  ClipboardCopy,
  Content,
  FlexItem,
  PageSection,
  Panel,
  PanelMain,
  PanelMainBody,
  Skeleton,
  Tab,
  TabTitleText,
  Tabs,
  Title,
  TitleProps,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths, SkillDetailsRoute } from "@app/Paths";
import { Skill, SkillCollection } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { ExternalLink } from "@app/components/ExternalLink";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { markdownPFComponents } from "@app/components/markdownPFComponents";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  DetailTabPanel,
  EntityDetailActions,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteSkillMutation,
  useFetchAgents,
  useFetchSkillById,
  useFetchSkillCollections,
  useFetchSkillPlans,
} from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { skillsWriteScopes } from "@app/scopes";
import { formatDate, getAxiosErrorMessage } from "@app/utils/utils";

import { CountLink } from "../../components/count-link";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
} from "../../components/detail-section";
import { SkillModal } from "../components/skill-form";
import {
  getCollectionsContainingSkill,
  getSkillDeleteBlockedReason,
  getSkillUsageParts,
} from "../skill-usage";

import { SkillUsageTab } from "./skill-usage-tab";

const SKILL_DETAIL_TABS = ["details", "usage"] as const;
type SkillDetailTab = (typeof SKILL_DETAIL_TABS)[number];
const TAB_PREFIX = "skill-detail";
/** The Usage tab's old name: links saved before the rename still open it. */
const LEGACY_USAGE_TAB = "associations";

/**
 * The skill's Markdown headings sit below the page structure: its `# h1`
 * would otherwise be a second page title (h1) next to the skill name, and
 * its sections would outrank the "Content" section (h2). They are also no
 * larger than that section heading (h2 lg): h1 is lg, the rest md.
 */
type HeadingProps = { children?: React.ReactNode };
const ContentHeading: React.FC<
  HeadingProps & Pick<TitleProps, "headingLevel" | "size">
> = ({ headingLevel, size, children }) => (
  <Title headingLevel={headingLevel} size={size}>
    {children}
  </Title>
);
const skillContentComponents: Components = {
  ...markdownPFComponents,
  h1: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h3" size="lg">
      {children}
    </ContentHeading>
  ),
  h2: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h4" size="md">
      {children}
    </ContentHeading>
  ),
  h3: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h5" size="md">
      {children}
    </ContentHeading>
  ),
  h4: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h6" size="md">
      {children}
    </ContentHeading>
  ),
  h5: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h6" size="md">
      {children}
    </ContentHeading>
  ),
  h6: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h6" size="md">
      {children}
    </ContentHeading>
  ),
};

/** A Git repository opens in a new tab only when it is a web URL. */
const isWebUrl = (value: string) => /^https?:\/\//i.test(value);

const SkillDetail: React.FC = () => {
  const { t } = useTranslation();
  const { skillId } = useParams<SkillDetailsRoute>();
  const history = useHistory();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageSkills = useHasSomeScopes(skillsWriteScopes);

  const { skill, isLoading, fetchError, isNotFound, refetch } =
    useFetchSkillById(skillId);
  const { archetypes, isFetching: isLoadingArchetypes } = useFetchArchetypes();
  const {
    agents,
    isLoading: isLoadingAgents,
    fetchError: agentsError,
  } = useFetchAgents();
  const {
    skillCollections,
    isLoading: isLoadingCollections,
    fetchError: collectionsError,
  } = useFetchSkillCollections();
  const {
    skillPlans,
    isLoading: isLoadingPlans,
    fetchError: plansError,
  } = useFetchSkillPlans(skillId);

  const location = useLocation();
  const isLegacyUsageTab =
    new URLSearchParams(location.search).get("tab") === LEGACY_USAGE_TAB;
  // Rewrites `?tab=associations` once, keeping the other parameters and the
  // breadcrumb trail in history state.
  React.useEffect(() => {
    if (!isLegacyUsageTab) return;
    const params = new URLSearchParams(location.search);
    params.set("tab", "usage");
    history.replace({ ...location, search: `?${params}` });
  }, [history, isLegacyUsageTab, location]);
  const [urlTab, setActiveTab] = useUrlTab<SkillDetailTab>(
    SKILL_DETAIL_TABS,
    "details"
  );
  const activeTab = isLegacyUsageTab ? "usage" : urlTab;
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const onDeleteSuccess = () => {
    pushNotification({
      title: t("agentic.skill.deleted"),
      variant: "success",
    });
    // Leave before the invalidated queries re-render this page, which would
    // refetch the deleted skill and log a 404.
    flushSync(() => history.push(DevPaths.skills));
  };
  const onDeleteError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };
  const { mutate: deleteSkill } = useDeleteSkillMutation(
    onDeleteSuccess,
    onDeleteError
  );

  const collectionsContainingSkill = React.useMemo(
    () =>
      [
        ...getCollectionsContainingSkill({ id: skillId }, skillCollections),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [skillCollections, skillId]
  );

  const { breadcrumbs, linkCrumbs: childLinkCrumbs } = useEntityBreadcrumbs(
    skill?.name ?? t("agentic.entity.skill"),
    [{ title: t("sidebar.skills"), path: DevPaths.skills }]
  );

  if (skill == null) {
    if (isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound || fetchError == null}
        notFoundTitle={t("agentic.skill.notFoundTitle")}
        notFoundBody={t("agentic.skill.notFoundBody")}
        backLabel={t("agentic.skill.backToSkills")}
        backPath={DevPaths.skills}
      />
    );
  }

  const childLink = (path: string, hash = "") =>
    breadcrumbTo(path, `?from=skill-${skillId}${hash}`, childLinkCrumbs);

  const knownCollections =
    isLoadingCollections || collectionsError != null
      ? undefined
      : skillCollections;
  const deleteBlockedReason = getSkillDeleteBlockedReason(
    t,
    skill,
    knownCollections
  );
  const managedReason = skill.operatorManaged
    ? t("agentic.common.managedByKonveyor")
    : undefined;
  const panelId = (tab: SkillDetailTab) => tabPanelId(TAB_PREFIX, tab);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={skill.name}
          description={
            skill.description ? (
              <Content component="p">{skill.description}</Content>
            ) : undefined
          }
          breadcrumbs={breadcrumbs}
          btnActions={
            canManageSkills && (
              <EntityDetailActions
                onEdit={() => setIsEditOpen(true)}
                onDelete={() => setIsDeleteOpen(true)}
                managedReason={managedReason}
                deleteDisabledReason={deleteBlockedReason}
              />
            )
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs
          activeKey={activeTab}
          onSelect={(_e, key) => setActiveTab(key)}
          tabListAriaLabel={t("agentic.skillDetail.tabsLabel")}
        >
          <Tab
            eventKey="details"
            id={panelId("details")}
            tabContentId={panelId("details")}
            title={
              <TabTitleText>{t("agentic.skillDetail.tabDetails")}</TabTitleText>
            }
          />
          <Tab
            eventKey="usage"
            id={panelId("usage")}
            tabContentId={panelId("usage")}
            title={
              <TabTitleText>{t("agentic.skillDetail.tabUsage")}</TabTitleText>
            }
          />
        </Tabs>
      </PageSection>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="details"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <DetailSections>
            <FlexItem>
              <SkillFacts
                skill={skill}
                collections={knownCollections}
                isLoadingCollections={isLoadingCollections}
              />
            </FlexItem>
            {skill.sourceType === "inline" && skill.content && (
              <FlexItem>
                <DetailSection
                  title={t("agentic.skill.content")}
                  description={t("agentic.skillDetail.contentDescription")}
                >
                  <Panel variant="bordered">
                    <PanelMain>
                      <PanelMainBody>
                        <Content>
                          <ReactMarkdown components={skillContentComponents}>
                            {skill.content}
                          </ReactMarkdown>
                        </Content>
                      </PanelMainBody>
                    </PanelMain>
                  </Panel>
                </DetailSection>
              </FlexItem>
            )}
          </DetailSections>
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="usage"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <SkillUsageTab
            skill={skill}
            archetypes={archetypes}
            isLoadingArchetypes={isLoadingArchetypes}
            collections={knownCollections && collectionsContainingSkill}
            isLoadingCollections={isLoadingCollections}
            isCollectionsError={collectionsError != null}
            agents={isLoadingAgents || agentsError != null ? undefined : agents}
            plans={skillPlans}
            isLoadingPlans={isLoadingPlans}
            plansError={plansError}
            linkTo={(pathname, search) =>
              breadcrumbTo(pathname, search, childLinkCrumbs)
            }
            childLinkTo={childLink}
          />
        </PageSection>
      </DetailTabPanel>

      <SkillModal
        isOpen={isEditOpen}
        skill={skill}
        onClose={() => {
          setIsEditOpen(false);
          refetch();
        }}
      />

      {isDeleteOpen && (
        <ConfirmDialog
          title={t("agentic.skill.deleteTitle")}
          message={t("agentic.skill.deleteDescription", { name: skill.name })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsDeleteOpen(false)}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={() => {
            deleteSkill(skill.id);
            setIsDeleteOpen(false);
          }}
        />
      )}
    </>
  );
};

/**
 * The Usage tab of this page, as a link that keeps the rest of the query
 * (`?from=`) and the breadcrumb trail in history state.
 */
const useUsageTabLink = () => {
  const { pathname, search, state } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "usage");
  return { pathname, search: `?${params}`, state };
};

/**
 * The Details tab facts: source, how agents use it, where it loads from,
 * usage, dates.
 */
const SkillFacts: React.FC<{
  skill: Skill;
  /** Undefined while unknown: the usage then leaves collections out. */
  collections: SkillCollection[] | undefined;
  isLoadingCollections: boolean;
}> = ({ skill, collections, isLoadingCollections }) => {
  const { t } = useTranslation();
  const usageParts = getSkillUsageParts(
    t,
    skill,
    collections &&
      getCollectionsContainingSkill({ id: skill.id }, collections).length
  );
  const usageTab = useUsageTabLink();
  const monospace = (value: string) => (
    <span className={textStyles.fontFamilyMonospace}>{value}</span>
  );

  const facts: [string, React.ReactNode][] = [
    [t("terms.source"), t(`agentic.skill.sourceTypes.${skill.sourceType}`)],
    [
      t("agentic.skill.loadPolicy.label"),
      t(`agentic.skill.loadPolicy.${skill.loadPolicy ?? "skill"}`),
    ],
    ...(skill.sourceType === "git"
      ? ([
          [
            t("agentic.skill.repository"),
            !skill.repoUrl ? (
              <EmptyTextMessage key="repo" message={t("terms.none")} />
            ) : isWebUrl(skill.repoUrl) ? (
              <ExternalLink key="repo" href={skill.repoUrl} isInline>
                {skill.repoUrl}
              </ExternalLink>
            ) : (
              <ClipboardCopy key="repo" isReadOnly variant="inline-compact">
                {skill.repoUrl}
              </ClipboardCopy>
            ),
          ],
          ...(skill.repoBranch
            ? [[t("agentic.skill.branch"), monospace(skill.repoBranch)]]
            : []),
          ...(skill.repoPath && skill.repoPath !== "/"
            ? [[t("agentic.skill.path"), monospace(skill.repoPath)]]
            : []),
        ] as [string, React.ReactNode][])
      : []),
    ...(skill.sourceType === "oci"
      ? ([
          [
            t("agentic.skill.image"),
            skill.imageRef ? (
              <ClipboardCopy key="image" isReadOnly variant="inline-compact">
                {skill.imageRef}
              </ClipboardCopy>
            ) : (
              <EmptyTextMessage key="image" message={t("terms.none")} />
            ),
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      t("agentic.skill.usage"),
      usageParts == null ? (
        <EmptyTextMessage
          key="usage"
          message={t("agentic.common.unavailable")}
        />
      ) : usageParts.length === 0 && isLoadingCollections ? (
        <Skeleton
          key="usage"
          width="6rem"
          screenreaderText={t("terms.loading")}
        />
      ) : usageParts.length === 0 ? (
        // Not "None" while the collections are unknown.
        <EmptyTextMessage
          key="usage"
          message={
            collections == null
              ? t("agentic.common.unavailable")
              : t("terms.none")
          }
        />
      ) : (
        <CountLink key="usage" to={usageTab}>
          {usageParts.join(", ")}
        </CountLink>
      ),
    ],
    ...(skill.createTime
      ? ([
          [
            t("agentic.skillDetail.createdAt"),
            formatDate(new Date(skill.createTime)),
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(skill.updateTime
      ? ([
          [
            t("agentic.skillDetail.updatedAt"),
            formatDate(new Date(skill.updateTime)),
          ],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return <DetailFacts facts={facts} />;
};

export default SkillDetail;
