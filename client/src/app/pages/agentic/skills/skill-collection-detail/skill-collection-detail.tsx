import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useHistory, useParams } from "react-router-dom";
import {
  ButtonVariant,
  Card,
  CardBody,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths, SkillCollectionDetailsRoute } from "@app/Paths";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  EntityDetailActions,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteSkillCollectionMutation,
  useFetchAgents,
  useFetchSkillCollectionById,
} from "@app/queries/agentic";
import { skillCollectionsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { SkillCollectionForm } from "../components/skill-collection-form";

const SkillCollectionDetail: React.FC = () => {
  const { t } = useTranslation();
  const { collectionId } = useParams<SkillCollectionDetailsRoute>();
  const history = useHistory();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageCollections = useHasSomeScopes(skillCollectionsWriteScopes);

  const { skillCollection, isLoading, fetchError, isNotFound, refetch } =
    useFetchSkillCollectionById(collectionId);
  const { agents } = useFetchAgents();

  const [editModal, setEditModal, editFormKey] = useFormModalState<true>();
  const isEditOpen = editModal !== null;
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const onDeleteSuccess = () => {
    pushNotification({
      title: t("agentic.skillCollection.deleted"),
      variant: "success",
    });
    history.push(DevPaths.skills);
  };
  const onDeleteError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };
  const { mutate: deleteCollection } = useDeleteSkillCollectionMutation(
    onDeleteSuccess,
    onDeleteError
  );

  const agentsUsingCollection = React.useMemo(
    () =>
      agents.filter((agent) =>
        (agent.skillCollections ?? []).some((c) => c.id === collectionId)
      ),
    [agents, collectionId]
  );

  const { breadcrumbs, linkCrumbs: collectionChildCrumbs } =
    useEntityBreadcrumbs(skillCollection?.name ?? collectionId, [
      { title: t("agentic.skill.title"), path: DevPaths.skills },
    ]);

  if (skillCollection == null) {
    if (isLoading) {
      return <AppPlaceholder />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound || fetchError == null}
        notFoundTitle={t("agentic.skillCollection.notFoundTitle")}
        notFoundBody={t("agentic.skillCollection.notFoundBody")}
        backLabel={t("agentic.skill.backToSkills")}
        backPath={DevPaths.skills}
      />
    );
  }

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={skillCollection.name}
          breadcrumbs={breadcrumbs}
          btnActions={
            canManageCollections && (
              <EntityDetailActions
                onEdit={() => setEditModal(true)}
                onDelete={() => setIsDeleteOpen(true)}
              />
            )
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          {/* Overview */}
          <StackItem>
            <Card>
              <CardBody>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("terms.description")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {skillCollection.description || "—"}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("agentic.skillCollection.members")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label isCompact>
                        {t("agentic.skillCollectionDetail.skillCount", {
                          count: skillCollection.skills.length,
                        })}
                      </Label>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </StackItem>

          {/* Member skills */}
          <StackItem>
            <Content component="h3">
              {t("agentic.skillCollectionDetail.memberSkills")}
            </Content>
            {skillCollection.skills.length === 0 ? (
              <EmptyState
                headingLevel="h4"
                icon={CubesIcon}
                titleText={t("agentic.skillCollectionDetail.noSkillsTitle")}
                variant="xs"
              >
                <EmptyStateBody>
                  {t("agentic.skillCollectionDetail.noSkillsDescription")}
                </EmptyStateBody>
              </EmptyState>
            ) : (
              <Table
                aria-label={t("agentic.skillCollectionDetail.skillsTable")}
                variant="compact"
              >
                <Thead>
                  <Tr>
                    <Th>{t("terms.name")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {skillCollection.skills.map((skill) => (
                    <Tr key={skill.id}>
                      <Td>
                        <Link
                          to={breadcrumbTo(
                            generatePath(DevPaths.skillDetails, {
                              skillId: String(skill.id),
                            }),
                            `?from=collection-${collectionId}`,
                            collectionChildCrumbs
                          )}
                        >
                          {skill.name}
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </StackItem>

          {/* Agents using this collection */}
          <StackItem>
            <Content component="h3">
              {t("agentic.skillCollectionDetail.usedByAgents")}
            </Content>
            {agentsUsingCollection.length === 0 ? (
              <Content component="small">
                {t("agentic.skillCollectionDetail.noAgents")}
              </Content>
            ) : (
              <Table
                aria-label={t("agentic.skillCollectionDetail.agentsTable")}
                variant="compact"
              >
                <Thead>
                  <Tr>
                    <Th>{t("terms.name")}</Th>
                    <Th>{t("terms.description")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {agentsUsingCollection.map((agent) => (
                    <Tr key={agent.id}>
                      <Td>
                        <Link
                          to={breadcrumbTo(
                            generatePath(DevPaths.agentDetails, {
                              agentId: String(agent.id),
                            }),
                            `?from=collection-${collectionId}`,
                            collectionChildCrumbs
                          )}
                        >
                          {agent.name}
                        </Link>
                      </Td>
                      <Td>{agent.description || "—"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </StackItem>
        </Stack>
      </PageSection>

      <Modal
        id="edit-skill-collection-modal"
        variant="medium"
        isOpen={isEditOpen}
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
          title={t("agentic.skillCollection.deleteTitle", {
            collection: skillCollection.name,
          })}
          titleIconVariant="warning"
          message={t("agentic.skillCollection.deleteDescription")}
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
