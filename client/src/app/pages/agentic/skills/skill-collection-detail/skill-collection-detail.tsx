import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import {
  Link,
  generatePath,
  useHistory,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ButtonVariant,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Skeleton,
  Title,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths, SkillCollectionDetailsRoute } from "@app/Paths";
import { Agent } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { ConditionalTableBody } from "@app/components/TableControls";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  EntityDetailActions,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteSkillCollectionMutation,
  useFetchAgents,
  useFetchGateways,
  useFetchSkillCollectionById,
  useFetchSkills,
} from "@app/queries/agentic";
import { skillCollectionsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { SkillCollectionForm } from "../components/skill-collection-form";
import {
  USED_BY_AGENTS_ID,
  getAgentsUsingCollection,
  getCollectionDeleteBlockedReason,
} from "../skill-usage";

/** The Skill collections tab of the Skills page: the list a collection lives on (S8). */
const COLLECTIONS_LIST_PATH = `${DevPaths.skills}?tab=collections`;

interface SectionProps {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** Title h2 lg, an optional subtle sentence, then the content (guide 4.2). */
const Section: React.FC<SectionProps> = ({
  id,
  title,
  description,
  children,
}) => (
  <Flex
    id={id}
    direction={{ default: "column" }}
    gap={{ default: "gapMd" }}
    flexWrap={{ default: "nowrap" }}
  >
    <FlexItem>
      <Title headingLevel="h2" size="lg">
        {title}
      </Title>
      {description && (
        <Content
          component="p"
          className={`${textStyles.textColorSubtle} ${spacing.mtXs}`}
        >
          {description}
        </Content>
      )}
    </FlexItem>
    <FlexItem>{children}</FlexItem>
  </Flex>
);

const XsEmptyState: React.FC<{ text: string }> = ({ text }) => (
  <EmptyState variant="xs">
    <EmptyStateBody>{text}</EmptyStateBody>
  </EmptyState>
);

const SkillCollectionDetail: React.FC = () => {
  const { t } = useTranslation();
  const { collectionId } = useParams<SkillCollectionDetailsRoute>();
  const history = useHistory();
  const { hash } = useLocation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageCollections = useHasSomeScopes(skillCollectionsWriteScopes);

  const { skillCollection, isLoading, fetchError, isNotFound, refetch } =
    useFetchSkillCollectionById(collectionId);
  const {
    agents,
    isLoading: isLoadingAgents,
    fetchError: agentsError,
  } = useFetchAgents();
  const {
    skills,
    isLoading: isLoadingSkills,
    fetchError: skillsError,
  } = useFetchSkills();
  const { gateways } = useFetchGateways();

  const [editModal, setEditModal, editFormKey] = useFormModalState<true>();
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const { mutate: deleteCollection } = useDeleteSkillCollectionMutation(
    () => {
      pushNotification({
        title: t("agentic.skillCollection.deleted"),
        variant: "success",
      });
      history.push(COLLECTIONS_LIST_PATH);
    },
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );

  // Agents and the delete blocker wait for the agents query (X6).
  const knownAgents =
    isLoadingAgents || agentsError != null ? undefined : agents;
  const agentsUsingCollection = React.useMemo(
    () =>
      [...getAgentsUsingCollection(collectionId, agents)].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [agents, collectionId]
  );
  const skillById = React.useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills]
  );
  const providerOf = (agent: Agent) =>
    gateways.find((gateway) => gateway.id === agent.model.id)?.provider.name;

  const { breadcrumbs, linkCrumbs } = useEntityBreadcrumbs(
    skillCollection?.name ?? t("agentic.entity.skillCollection"),
    [{ title: t("sidebar.skills"), path: COLLECTIONS_LIST_PATH }]
  );

  // The Agents count on the list links to this section (`#used-by-agents`).
  const isAgentsSectionReady = skillCollection != null && !isLoadingAgents;
  React.useEffect(() => {
    if (hash === `#${USED_BY_AGENTS_ID}` && isAgentsSectionReady) {
      document
        .getElementById(USED_BY_AGENTS_ID)
        ?.scrollIntoView({ block: "start" });
    }
  }, [hash, isAgentsSectionReady]);

  if (skillCollection == null) {
    if (isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound || fetchError == null}
        notFoundTitle={t("agentic.skillCollection.notFoundTitle")}
        notFoundBody={t("agentic.skillCollection.notFoundBody")}
        backLabel={t("agentic.skill.backToSkills")}
        backPath={COLLECTIONS_LIST_PATH}
      />
    );
  }

  const childLink = (path: string, crumbs: BreadcrumbEntry[] = linkCrumbs) =>
    breadcrumbTo(path, `?from=collection-${collectionId}`, crumbs);

  const memberCount = skillCollection.skills.length;
  // Same order as the Skills list (by name).
  const sortedMembers = [...skillCollection.skills].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const agentCount = agentsUsingCollection.length;
  const managedReason = skillCollection.operatorManaged
    ? t("agentic.common.managedByKonveyor")
    : undefined;

  const skillCell = (render: () => React.ReactNode) => {
    if (isLoadingSkills) {
      return <Skeleton screenreaderText={t("terms.loading")} />;
    }
    if (skillsError != null) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    return render();
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={skillCollection.name}
          description={
            skillCollection.description ? (
              <Content component="p">{skillCollection.description}</Content>
            ) : undefined
          }
          breadcrumbs={breadcrumbs}
          btnActions={
            canManageCollections && (
              <EntityDetailActions
                onEdit={() => setEditModal(true)}
                onDelete={() => setIsDeleteOpen(true)}
                managedReason={managedReason}
                deleteDisabledReason={getCollectionDeleteBlockedReason(
                  t,
                  skillCollection.id,
                  knownAgents
                )}
              />
            )
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Flex
          direction={{ default: "column" }}
          gap={{ default: "gapXl" }}
          flexWrap={{ default: "nowrap" }}
        >
          <FlexItem>
            <Section
              title={
                memberCount > 0
                  ? t("agentic.skillCollectionDetail.skillsTitle", {
                      count: memberCount,
                    })
                  : t("agentic.skillCollection.members")
              }
            >
              {memberCount === 0 ? (
                <XsEmptyState
                  text={t("agentic.skillCollectionDetail.noSkills")}
                />
              ) : (
                <Table
                  aria-label={t("agentic.skillCollection.members")}
                  variant="compact"
                >
                  <Thead>
                    <Tr>
                      <Th width={30}>{t("agentic.entity.skill")}</Th>
                      <Th>{t("terms.description")}</Th>
                      <Th modifier="fitContent">{t("terms.source")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sortedMembers.map((member) => {
                      const skill = skillById.get(member.id);
                      return (
                        <Tr key={member.id}>
                          <Td dataLabel={t("agentic.entity.skill")}>
                            <Link
                              to={childLink(
                                generatePath(DevPaths.skillDetails, {
                                  skillId: String(member.id),
                                })
                              )}
                            >
                              {member.name}
                            </Link>
                          </Td>
                          <Td
                            dataLabel={t("terms.description")}
                            modifier="truncate"
                            tooltip={skill?.description || undefined}
                          >
                            {skillCell(() => skill?.description)}
                          </Td>
                          <Td dataLabel={t("terms.source")} modifier="nowrap">
                            {skillCell(() =>
                              skill ? (
                                t(
                                  `agentic.skill.sourceTypes.${skill.sourceType}`
                                )
                              ) : (
                                <EmptyTextMessage
                                  message={t("agentic.common.unavailable")}
                                />
                              )
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              )}
            </Section>
          </FlexItem>

          <FlexItem>
            <Section
              id={USED_BY_AGENTS_ID}
              title={
                knownAgents != null && agentCount > 0
                  ? t("agentic.skillCollectionDetail.usedByAgentsTitle", {
                      count: agentCount,
                    })
                  : t("agentic.skillCollectionDetail.usedByAgents")
              }
              description={t(
                "agentic.skillCollectionDetail.usedByAgentsDescription"
              )}
            >
              {knownAgents != null && agentCount === 0 ? (
                <XsEmptyState
                  text={t("agentic.skillCollectionDetail.noAgents")}
                />
              ) : (
                <Table
                  aria-label={t("agentic.skillCollectionDetail.usedByAgents")}
                  variant="compact"
                >
                  <Thead>
                    <Tr>
                      <Th width={30}>{t("agentic.entity.agent")}</Th>
                      <Th>{t("agentic.skillCollectionDetail.model")}</Th>
                    </Tr>
                  </Thead>
                  <ConditionalTableBody
                    isLoading={isLoadingAgents}
                    isError={agentsError != null}
                    numRenderedColumns={2}
                  >
                    <Tbody>
                      {agentsUsingCollection.map((agent) => {
                        const provider = providerOf(agent);
                        return (
                          <Tr key={agent.id}>
                            <Td dataLabel={t("agentic.entity.agent")}>
                              <Link
                                to={childLink(
                                  generatePath(DevPaths.agentDetails, {
                                    agentId: String(agent.id),
                                  })
                                )}
                              >
                                {agent.name}
                              </Link>
                            </Td>
                            <Td
                              dataLabel={t(
                                "agentic.skillCollectionDetail.model"
                              )}
                            >
                              <div>{agent.model.name}</div>
                              {provider && (
                                <Content
                                  component="small"
                                  className={textStyles.textColorSubtle}
                                >
                                  {provider}
                                </Content>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </ConditionalTableBody>
                </Table>
              )}
            </Section>
          </FlexItem>
        </Flex>
      </PageSection>

      <Modal
        id="edit-skill-collection-modal"
        variant="medium"
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
      >
        <ModalHeader title={t("agentic.skillCollection.edit")} />
        <ModalBody>
          <SkillCollectionForm
            key={editFormKey}
            collection={skillCollection}
            onClose={() => {
              setEditModal(null);
              refetch();
            }}
          />
        </ModalBody>
      </Modal>

      {isDeleteOpen && (
        <ConfirmDialog
          title={t("agentic.skillCollection.deleteTitle")}
          message={t("agentic.skillCollection.deleteDescription", {
            name: skillCollection.name,
          })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsDeleteOpen(false)}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={() => {
            deleteCollection(skillCollection.id);
            setIsDeleteOpen(false);
          }}
        />
      )}
    </>
  );
};

export default SkillCollectionDetail;
