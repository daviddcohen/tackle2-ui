import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { Components } from "react-markdown";
import {
  Link,
  generatePath,
  useHistory,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ButtonVariant,
  ClipboardCopy,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FlexItem,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Panel,
  PanelMain,
  PanelMainBody,
  Tab,
  TabTitleText,
  Tabs,
  Title,
  TitleProps,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths, SkillDetailsRoute } from "@app/Paths";
import { Skill } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { ExternalLink } from "@app/components/ExternalLink";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { ConditionalTableBody } from "@app/components/TableControls";
import { markdownPFComponents } from "@app/components/markdownPFComponents";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  SkillSources,
  groupSkillSources,
} from "@app/pages/agentic/components/skills-table";
import {
  DetailTabPanel,
  EntityDetailActions,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { skillAssociationPath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteSkillMutation,
  useFetchMigrationPlans,
  useFetchSkillById,
  useFetchSkillCollections,
} from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { skillsWriteScopes } from "@app/scopes";
import { formatDate, getAxiosErrorMessage } from "@app/utils/utils";

import { CountLink } from "../components/count-link";
import { Section, Sections, XsEmptyState } from "../components/section";
import { SkillForm } from "../components/skill-form";
import {
  getCollectionsContainingSkill,
  getSkillAssociationRows,
  getSkillDeleteBlockedReason,
} from "../skill-usage";

const SKILL_DETAIL_TABS = ["details", "associations"] as const;
type SkillDetailTab = (typeof SKILL_DETAIL_TABS)[number];
const TAB_PREFIX = "skill-detail";

/**
 * The skill's Markdown headings keep their look but sit below the page
 * structure: its `# h1` would otherwise be a second page title (h1) next to
 * the skill name, and its sections would outrank the "Content" section (h2).
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
    <ContentHeading headingLevel="h3" size="2xl">
      {children}
    </ContentHeading>
  ),
  h2: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h4" size="xl">
      {children}
    </ContentHeading>
  ),
  h3: ({ children }: HeadingProps) => (
    <ContentHeading headingLevel="h5" size="lg">
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

/** A Git repository opens in a new tab only when it is a web URL (S9). */
const isWebUrl = (value: string) => /^https?:\/\//i.test(value);

const Fact: React.FC<{ term: string; children: React.ReactNode }> = ({
  term,
  children,
}) => (
  <DescriptionListGroup>
    <DescriptionListTerm>{term}</DescriptionListTerm>
    <DescriptionListDescription>{children}</DescriptionListDescription>
  </DescriptionListGroup>
);

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
    skillCollections,
    isLoading: isLoadingCollections,
    fetchError: collectionsError,
  } = useFetchSkillCollections();
  const {
    migrationPlans,
    isLoading: isLoadingPlans,
    fetchError: plansError,
  } = useFetchMigrationPlans();

  const [activeTab, setActiveTab] = useUrlTab<SkillDetailTab>(
    SKILL_DETAIL_TABS,
    "details"
  );
  const [editModal, setEditModal, editFormKey] = useFormModalState<true>();
  const isEditOpen = editModal !== null;
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const onDeleteSuccess = () => {
    pushNotification({
      title: t("agentic.skill.deleted"),
      variant: "success",
    });
    history.push(DevPaths.skills);
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

  // The real adapter leaves `effectiveSkills` undefined: unknown, not empty
  // (X6), so the section says "Unavailable" instead of "no plan".
  const isPlanUsageUnknown = migrationPlans.some(
    (plan) => plan.effectiveSkills === undefined
  );
  // Rows come from the plans' `effectiveSkills` only: never add sources here
  // (guide 2.3, residual Q1).
  const plansResolvingSkill = React.useMemo(
    () =>
      migrationPlans
        .filter((plan) =>
          (plan.effectiveSkills ?? []).some((es) => es.skill.id === skillId)
        )
        .map((plan) => ({
          plan,
          sources:
            groupSkillSources(
              (plan.effectiveSkills ?? []).filter(
                (es) => es.skill.id === skillId
              )
            )[0]?.sources ?? [],
        }))
        .sort((a, b) => a.plan.name.localeCompare(b.plan.name)),
    [migrationPlans, skillId]
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

  const childLink = (path: string) =>
    breadcrumbTo(path, `?from=skill-${skillId}`, childLinkCrumbs);

  const arePlansLoaded = !isLoadingPlans && plansError == null;
  // Undefined until the plans loaded with a known `effectiveSkills` (X6).
  const planCount =
    arePlansLoaded && !isPlanUsageUnknown
      ? plansResolvingSkill.length
      : undefined;

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
                onEdit={() => setEditModal(true)}
                onDelete={() => setIsDeleteOpen(true)}
                managedReason={managedReason}
                deleteDisabledReason={deleteBlockedReason}
              />
            )
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs activeKey={activeTab} onSelect={(_e, key) => setActiveTab(key)}>
          <Tab
            eventKey="details"
            id={panelId("details")}
            tabContentId={panelId("details")}
            title={
              <TabTitleText>{t("agentic.skillDetail.tabDetails")}</TabTitleText>
            }
          />
          <Tab
            eventKey="associations"
            id={panelId("associations")}
            tabContentId={panelId("associations")}
            title={
              <TabTitleText>
                {t("agentic.skillDetail.tabAssociations")}
              </TabTitleText>
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
          <Sections>
            <FlexItem>
              <SkillFacts skill={skill} />
            </FlexItem>
            {skill.sourceType === "inline" && skill.content && (
              <FlexItem>
                <Section
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
                </Section>
              </FlexItem>
            )}
          </Sections>
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="associations"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <Sections>
            <FlexItem>
              <AssociatedWithSection
                skill={skill}
                archetypes={archetypes}
                isLoadingArchetypes={isLoadingArchetypes}
                linkTo={(path) => breadcrumbTo(path, "", childLinkCrumbs)}
              />
            </FlexItem>

            <FlexItem>
              <Section
                title={
                  planCount
                    ? t("agentic.skillDetail.usedInPlansTitle", {
                        count: planCount,
                      })
                    : t("agentic.skillDetail.usedInPlans")
                }
                description={t("agentic.skillDetail.usedInPlansDescription")}
              >
                {arePlansLoaded && isPlanUsageUnknown ? (
                  <EmptyTextMessage message={t("agentic.common.unavailable")} />
                ) : planCount === 0 ? (
                  <XsEmptyState text={t("agentic.skillDetail.noPlans")} />
                ) : (
                  <Table
                    aria-label={t("agentic.skillDetail.usedInPlans")}
                    variant="compact"
                  >
                    <Thead>
                      <Tr>
                        <Th width={30}>{t("agentic.entity.migrationPlan")}</Th>
                        <Th>{t("terms.source")}</Th>
                      </Tr>
                    </Thead>
                    <ConditionalTableBody
                      isLoading={isLoadingPlans}
                      isError={plansError != null}
                      numRenderedColumns={2}
                    >
                      <Tbody>
                        {plansResolvingSkill.map(({ plan, sources }) => (
                          <Tr key={plan.id}>
                            <Td dataLabel={t("agentic.entity.migrationPlan")}>
                              <Link
                                to={childLink(
                                  generatePath(DevPaths.migrationPlanDetails, {
                                    planId: String(plan.id),
                                  })
                                )}
                              >
                                {plan.name}
                              </Link>
                            </Td>
                            <Td dataLabel={t("terms.source")}>
                              <SkillSources sources={sources} />
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </ConditionalTableBody>
                  </Table>
                )}
              </Section>
            </FlexItem>

            <FlexItem>
              <Section
                title={
                  knownCollections != null &&
                  collectionsContainingSkill.length > 0
                    ? t("agentic.skillDetail.inCollectionsTitle", {
                        count: collectionsContainingSkill.length,
                      })
                    : t("agentic.skillDetail.inCollections")
                }
                description={t("agentic.skillDetail.inCollectionsDescription")}
              >
                {knownCollections != null &&
                collectionsContainingSkill.length === 0 ? (
                  <XsEmptyState
                    text={t("agentic.skillDetail.notInAnyCollection")}
                  />
                ) : (
                  <Table
                    aria-label={t("agentic.skillDetail.inCollections")}
                    variant="compact"
                  >
                    <Thead>
                      <Tr>
                        <Th width={30}>
                          {t("agentic.entity.skillCollection")}
                        </Th>
                        <Th>{t("agentic.skillCollection.members")}</Th>
                      </Tr>
                    </Thead>
                    <ConditionalTableBody
                      isLoading={isLoadingCollections}
                      isError={collectionsError != null}
                      numRenderedColumns={2}
                    >
                      <Tbody>
                        {collectionsContainingSkill.map((collection) => (
                          <Tr key={collection.id}>
                            <Td dataLabel={t("agentic.entity.skillCollection")}>
                              <Link
                                to={childLink(
                                  generatePath(
                                    DevPaths.skillCollectionDetails,
                                    { collectionId: String(collection.id) }
                                  )
                                )}
                              >
                                {collection.name}
                              </Link>
                            </Td>
                            <Td
                              dataLabel={t("agentic.skillCollection.members")}
                            >
                              {/* One member is this skill: its name (C1). */}
                              {collection.skills.length === 1
                                ? collection.skills[0].name
                                : t("agentic.skillCollection.skillCount", {
                                    count: collection.skills.length,
                                  })}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </ConditionalTableBody>
                  </Table>
                )}
              </Section>
            </FlexItem>
          </Sections>
        </PageSection>
      </DetailTabPanel>

      <Modal
        id="edit-skill-modal"
        variant="medium"
        isOpen={isEditOpen}
        onClose={() => setEditModal(null)}
      >
        <ModalHeader title={t("agentic.skill.edit")} />
        <ModalBody>
          <SkillForm
            key={editFormKey}
            skill={skill}
            onClose={() => {
              setEditModal(null);
              refetch();
            }}
          />
        </ModalBody>
      </Modal>

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
 * The Associations tab of this page, as a link that keeps the rest of the
 * query (`?from=`) and the breadcrumb trail in history state (guide 3.5).
 */
const useAssociationsTabLink = () => {
  const { pathname, search, state } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "associations");
  return { pathname, search: `?${params}`, state };
};

/** The Details tab facts: source, where it loads from, usage, dates. */
const SkillFacts: React.FC<{ skill: Skill }> = ({ skill }) => {
  const { t } = useTranslation();
  const associationCount = skill.associations?.length;
  const associationsTab = useAssociationsTabLink();
  const monospace = (value: string) => (
    <span className={textStyles.fontFamilyMonospace}>{value}</span>
  );

  return (
    <DescriptionList
      isHorizontal
      isCompact
      horizontalTermWidthModifier={{ default: "18ch" }}
    >
      <Fact term={t("terms.source")}>
        {t(`agentic.skill.sourceTypes.${skill.sourceType}`)}
      </Fact>

      {skill.sourceType === "git" && (
        <>
          <Fact term={t("agentic.skill.repository")}>
            {!skill.repoUrl ? (
              <EmptyTextMessage message={t("terms.none")} />
            ) : isWebUrl(skill.repoUrl) ? (
              <ExternalLink href={skill.repoUrl} isInline>
                {skill.repoUrl}
              </ExternalLink>
            ) : (
              <ClipboardCopy isReadOnly variant="inline-compact">
                {skill.repoUrl}
              </ClipboardCopy>
            )}
          </Fact>
          {skill.repoBranch && (
            <Fact term={t("agentic.skill.branch")}>
              {monospace(skill.repoBranch)}
            </Fact>
          )}
          {skill.repoPath && skill.repoPath !== "/" && (
            <Fact term={t("agentic.skill.path")}>
              {monospace(skill.repoPath)}
            </Fact>
          )}
        </>
      )}

      {skill.sourceType === "oci" && (
        <Fact term={t("agentic.skill.image")}>
          {skill.imageRef ? (
            <ClipboardCopy isReadOnly variant="inline-compact">
              {skill.imageRef}
            </ClipboardCopy>
          ) : (
            <EmptyTextMessage message={t("terms.none")} />
          )}
        </Fact>
      )}

      <Fact term={t("agentic.skill.associations")}>
        {associationCount == null ? (
          <EmptyTextMessage message={t("agentic.common.unavailable")} />
        ) : associationCount === 0 ? (
          <EmptyTextMessage message={t("terms.none")} />
        ) : (
          <CountLink to={associationsTab}>
            {t("agentic.skill.associationCount", { count: associationCount })}
          </CountLink>
        )}
      </Fact>

      {skill.createTime && (
        <Fact term={t("agentic.skillDetail.createdAt")}>
          {formatDate(new Date(skill.createTime))}
        </Fact>
      )}
      {skill.updateTime && (
        <Fact term={t("agentic.skillDetail.updatedAt")}>
          {formatDate(new Date(skill.updateTime))}
        </Fact>
      )}
    </DescriptionList>
  );
};

interface AssociatedWithSectionProps {
  skill: Skill;
  archetypes: ReturnType<typeof useFetchArchetypes>["archetypes"];
  isLoadingArchetypes: boolean;
  /** Association paths carry their own query or hash, so no `?from=`. */
  linkTo: (path: string) => ReturnType<typeof breadcrumbTo>;
}

/**
 * "Associated with (n)": Type · Name (C12 exception), the skill's own
 * associations. Target profiles need the archetypes for their name and link,
 * so the rows wait for that query when a target profile is present (X6); if
 * it fails, they show the bare name without a link.
 */
const AssociatedWithSection: React.FC<AssociatedWithSectionProps> = ({
  skill,
  archetypes,
  isLoadingArchetypes,
  linkTo,
}) => {
  const { t } = useTranslation();
  const associations = skill.associations;
  const count = associations?.length ?? 0;
  const rows = getSkillAssociationRows(t, associations ?? [], archetypes);
  const needsArchetypes = rows.some(
    (row) => row.association.scope === "targetProfile"
  );

  let content: React.ReactNode;
  if (associations == null) {
    content = <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  } else if (count === 0) {
    content = <XsEmptyState text={t("agentic.skillDetail.noAssociations")} />;
  } else {
    content = (
      <Table
        aria-label={t("agentic.skillDetail.associatedWith")}
        variant="compact"
      >
        <Thead>
          <Tr>
            <Th width={30}>{t("terms.type")}</Th>
            <Th>{t("terms.name")}</Th>
          </Tr>
        </Thead>
        <ConditionalTableBody
          isLoading={needsArchetypes && isLoadingArchetypes}
          numRenderedColumns={2}
        >
          <Tbody>
            {rows.map(({ association, name }, index) => {
              // A target profile without its archetype has no page to open.
              const destination = skillAssociationPath(association, archetypes);
              return (
                <Tr
                  key={`${association.scope}-${association.resource.id}-${index}`}
                >
                  <Td dataLabel={t("terms.type")}>
                    {t(`agentic.skillsTable.scope.${association.scope}`)}
                  </Td>
                  <Td dataLabel={t("terms.name")}>
                    {destination != null ? (
                      <Link to={linkTo(destination)}>{name}</Link>
                    ) : (
                      name
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </ConditionalTableBody>
      </Table>
    );
  }

  return (
    <Section
      title={
        count > 0
          ? t("agentic.skillDetail.associatedWithTitle", { count })
          : t("agentic.skillDetail.associatedWith")
      }
      description={t("agentic.skillDetail.associatedWithDescription")}
    >
      {content}
    </Section>
  );
};

export default SkillDetail;
