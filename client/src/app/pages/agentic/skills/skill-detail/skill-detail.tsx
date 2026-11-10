import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useHistory, useParams } from "react-router-dom";
import {
  ButtonVariant,
  Card,
  CardBody,
  CodeBlock,
  CodeBlockCode,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths, SkillDetailsRoute } from "@app/Paths";
import { SkillAssociationScope, SkillSourceType } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  DetailTabPanel,
  EntityDetailActions,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { skillAssociationPath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteSkillMutation,
  useFetchAgents,
  useFetchMigrationPlans,
  useFetchSkillById,
  useFetchSkillCollections,
} from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { skillsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { SkillForm } from "../components/skill-form";
import {
  getCollectionsContainingSkill,
  getSkillDeleteBlocker,
} from "../skill-usage";

const sourceTypeColor: Record<SkillSourceType, "blue" | "green" | "orange"> = {
  inline: "blue",
  git: "green",
  oci: "orange",
};

const scopeColor: Record<
  SkillAssociationScope,
  "blue" | "orange" | "green" | "grey"
> = {
  agent: "blue",
  archetype: "orange",
  targetProfile: "green",
  application: "grey",
};

const SKILL_DETAIL_TABS = ["details", "associations"] as const;
type SkillDetailTab = (typeof SKILL_DETAIL_TABS)[number];
const TAB_PREFIX = "skill-detail";

const SkillDetail: React.FC = () => {
  const { t } = useTranslation();
  const { skillId } = useParams<SkillDetailsRoute>();
  const history = useHistory();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageSkills = useHasSomeScopes(skillsWriteScopes);

  const { skill, isLoading, fetchError, isNotFound, refetch } =
    useFetchSkillById(skillId);
  const { archetypes } = useFetchArchetypes();
  const { agents } = useFetchAgents();
  const { skillCollections } = useFetchSkillCollections();
  const { migrationPlans } = useFetchMigrationPlans();

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

  const directAssociations = React.useMemo(
    () => skill?.associations ?? [],
    [skill]
  );

  const directAssociationCount = directAssociations.length;

  const collectionsContainingSkill = React.useMemo(
    () => getCollectionsContainingSkill({ id: skillId }, skillCollections),
    [skillCollections, skillId]
  );

  const plansResolvingSkill = React.useMemo(
    () =>
      migrationPlans
        .filter((plan) =>
          (plan.effectiveSkills ?? []).some((es) => es.skill.id === skillId)
        )
        .map((plan) => ({
          plan,
          entries: (plan.effectiveSkills ?? []).filter(
            (es) => es.skill.id === skillId
          ),
        })),
    [migrationPlans, skillId]
  );

  const { breadcrumbs, linkCrumbs: childLinkCrumbs } = useEntityBreadcrumbs(
    skill?.name ?? skillId,
    [{ title: t("agentic.skill.title"), path: DevPaths.skills }]
  );

  const scopeLabel = (scope: SkillAssociationScope): string =>
    t(`agentic.plan.skillScopes.${scope}`);

  if (skill == null) {
    if (isLoading) {
      return <AppPlaceholder />;
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

  const deleteBlocker = getSkillDeleteBlocker(
    skill,
    agents,
    migrationPlans,
    skillCollections
  );
  const panelId = (tab: SkillDetailTab) => tabPanelId(TAB_PREFIX, tab);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={skill.name}
          breadcrumbs={breadcrumbs}
          btnActions={
            canManageSkills && (
              <EntityDetailActions
                onEdit={() => setEditModal(true)}
                onDelete={() => setIsDeleteOpen(true)}
                deleteDisabledReason={
                  deleteBlocker === "associations"
                    ? t("agentic.skill.deleteInUse")
                    : deleteBlocker === "collections"
                      ? t("agentic.skill.deleteInCollection")
                      : undefined
                }
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
                <Flex
                  spaceItems={{ default: "spaceItemsXs" }}
                  alignItems={{ default: "alignItemsCenter" }}
                >
                  <FlexItem>
                    {t("agentic.skillDetail.tabAssociations")}
                  </FlexItem>
                  {directAssociationCount > 0 && (
                    <FlexItem>
                      <Label isCompact color="blue">
                        {directAssociationCount}
                      </Label>
                    </FlexItem>
                  )}
                </Flex>
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
          <Card>
            <CardBody>
              <DescriptionList isHorizontal>
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {t("terms.description")}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    {skill.description || "—"}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {t("agentic.skill.sourceType")}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <Label color={sourceTypeColor[skill.sourceType]}>
                      {t(`agentic.skill.sourceTypes.${skill.sourceType}`)}
                    </Label>
                  </DescriptionListDescription>
                </DescriptionListGroup>

                {skill.sourceType === "git" && (
                  <>
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        {t("agentic.skill.repository")}
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        {skill.repoUrl || "—"}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    {skill.repoBranch && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.skill.branch")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          {skill.repoBranch}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                    {skill.repoPath && skill.repoPath !== "/" && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.skill.path")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          {skill.repoPath}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                  </>
                )}

                {skill.sourceType === "oci" && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("agentic.skill.imageReference")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {skill.imageRef || "—"}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}

                {skill.sourceType === "inline" && skill.content && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("agentic.skill.content")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      <CodeBlock>
                        <CodeBlockCode>{skill.content}</CodeBlockCode>
                      </CodeBlock>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}

                {skill.createTime && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("agentic.skillDetail.createdAt")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {new Date(skill.createTime).toLocaleString()}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
              </DescriptionList>
            </CardBody>
          </Card>
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="associations"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <Stack hasGutter>
            {/* Section A: Direct associations */}
            <StackItem>
              <Stack hasGutter>
                <StackItem>
                  <Content component="h3">
                    {t("agentic.skillDetail.directAssociations")}
                  </Content>
                </StackItem>
                <StackItem>
                  {directAssociations.length === 0 ? (
                    <EmptyState
                      headingLevel="h4"
                      icon={CubesIcon}
                      titleText={t("agentic.skillDetail.noAssociationsTitle")}
                      variant="xs"
                    >
                      <EmptyStateBody>
                        {t("agentic.skillDetail.noAssociationsDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  ) : (
                    <Stack>
                      {directAssociations.map((assoc, idx) => {
                        const destination = skillAssociationPath(
                          assoc,
                          archetypes
                        );
                        return (
                          <StackItem
                            key={`${assoc.scope}-${assoc.resource.id}-${idx}`}
                          >
                            <Flex
                              spaceItems={{ default: "spaceItemsSm" }}
                              alignItems={{ default: "alignItemsCenter" }}
                              style={{
                                padding: "var(--pf-t--global--spacer--sm) 0",
                                borderBottom:
                                  "1px solid var(--pf-t--global--border--color--subtle)",
                              }}
                            >
                              <FlexItem>
                                <Label
                                  isCompact
                                  color={scopeColor[assoc.scope]}
                                >
                                  {scopeLabel(assoc.scope)}
                                </Label>
                              </FlexItem>
                              <FlexItem>
                                {destination != null ? (
                                  <Link
                                    to={breadcrumbTo(
                                      destination,
                                      "",
                                      childLinkCrumbs
                                    )}
                                  >
                                    {assoc.resource.name}
                                  </Link>
                                ) : (
                                  assoc.resource.name
                                )}
                              </FlexItem>
                            </Flex>
                          </StackItem>
                        );
                      })}
                    </Stack>
                  )}
                </StackItem>
              </Stack>
            </StackItem>

            <StackItem>
              <Divider />
            </StackItem>

            {/* Section B: Active in migration plans */}
            <StackItem>
              <Stack hasGutter>
                <StackItem>
                  <Content component="h3">
                    {t("agentic.skillDetail.resolvedInPlans")}
                  </Content>
                  <Content
                    component="p"
                    style={{
                      color: "var(--pf-t--global--text--color--subtle)",
                    }}
                  >
                    {t("agentic.skillDetail.resolvedInPlansHelp")}
                  </Content>
                </StackItem>
                <StackItem>
                  {plansResolvingSkill.length === 0 ? (
                    <Content
                      component="p"
                      style={{
                        color: "var(--pf-t--global--text--color--subtle)",
                      }}
                    >
                      {t("agentic.skillDetail.noPlansResolved")}
                    </Content>
                  ) : (
                    <Table
                      aria-label={t("agentic.skillDetail.resolvedInPlansTable")}
                      variant="compact"
                    >
                      <Thead>
                        <Tr>
                          <Th>{t("terms.name")}</Th>
                          <Th>{t("agentic.skillDetail.resolvedFromColumn")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {plansResolvingSkill.map(({ plan, entries }) => (
                          <Tr key={plan.id}>
                            <Td dataLabel={t("terms.name")}>
                              <Link
                                to={breadcrumbTo(
                                  generatePath(DevPaths.migrationPlanDetails, {
                                    planId: String(plan.id),
                                  }),
                                  `?from=skill-${skillId}`,
                                  childLinkCrumbs
                                )}
                              >
                                {plan.name}
                              </Link>
                            </Td>
                            <Td
                              dataLabel={t(
                                "agentic.skillDetail.resolvedFromColumn"
                              )}
                            >
                              <Stack hasGutter>
                                {entries.map((es, i) => (
                                  <StackItem key={i}>
                                    <Flex
                                      spaceItems={{
                                        default: "spaceItemsSm",
                                      }}
                                      alignItems={{
                                        default: "alignItemsCenter",
                                      }}
                                    >
                                      <FlexItem>
                                        <Label
                                          isCompact
                                          color={scopeColor[es.scope]}
                                        >
                                          {scopeLabel(es.scope)}
                                        </Label>
                                      </FlexItem>
                                      <FlexItem>{es.scopeName}</FlexItem>
                                    </Flex>
                                  </StackItem>
                                ))}
                              </Stack>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </StackItem>
              </Stack>
            </StackItem>

            <StackItem>
              <Divider />
            </StackItem>

            {/* Section C: In collections */}
            <StackItem>
              <Stack hasGutter>
                <StackItem>
                  <Content component="h3">
                    {t("agentic.skillDetail.inCollections")}
                  </Content>
                </StackItem>
                <StackItem>
                  {collectionsContainingSkill.length === 0 ? (
                    <Content
                      component="p"
                      style={{
                        color: "var(--pf-t--global--text--color--subtle)",
                      }}
                    >
                      {t("agentic.skillDetail.notInAnyCollection")}
                    </Content>
                  ) : (
                    <Table
                      aria-label={t("agentic.skillDetail.inCollectionsTable")}
                      variant="compact"
                    >
                      <Thead>
                        <Tr>
                          <Th>{t("terms.name")}</Th>
                          <Th>{t("agentic.skillDetail.skillCountColumn")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {collectionsContainingSkill.map((collection) => (
                          <Tr key={collection.id}>
                            <Td dataLabel={t("terms.name")}>
                              <Link
                                to={breadcrumbTo(
                                  generatePath(
                                    DevPaths.skillCollectionDetails,
                                    {
                                      collectionId: String(collection.id),
                                    }
                                  ),
                                  `?from=skill-${skillId}`,
                                  childLinkCrumbs
                                )}
                              >
                                {collection.name}
                              </Link>
                            </Td>
                            <Td
                              dataLabel={t(
                                "agentic.skillDetail.skillCountColumn"
                              )}
                            >
                              {collection.skills.length}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </StackItem>
              </Stack>
            </StackItem>
          </Stack>
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
          title={t("agentic.skill.deleteTitle", { skill: skill.name })}
          titleIconVariant="warning"
          message={t("agentic.skill.deleteDescription")}
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

export default SkillDetail;
