import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import {
  ActionsColumn,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { SkillCollection } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  useDeleteSkillCollectionMutation,
  useFetchAgents,
  useFetchSkillCollections,
} from "@app/queries/agentic";
import { skillCollectionsWriteScopes } from "@app/scopes";
import { disabledActionProps, managedActionProps } from "@app/utils/agentic";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import {
  USED_BY_AGENTS_ID,
  getAgentsUsingCollection,
  getCollectionDeleteBlockedReason,
} from "../skill-usage";

import { CountLink } from "./count-link";
import { SkillCollectionForm } from "./skill-collection-form";

/** The Skill collections tab of the Skills page (guide 7.5, collections-list). */
export const SkillCollectionsTab: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("sidebar.skills"), []);
  const canManageCollections = useHasSomeScopes(skillCollectionsWriteScopes);
  const { pushNotification } = React.useContext(NotificationsContext);

  const { skillCollections, isFetching, fetchError, refetch } =
    useFetchSkillCollections();
  const {
    agents,
    isLoading: isLoadingAgents,
    fetchError: agentsError,
  } = useFetchAgents();
  // The Agents cell and the delete blocker wait for the agents query (X6).
  const knownAgents =
    isLoadingAgents || agentsError != null ? undefined : agents;

  const [formModalState, setFormModalState, formKey] = useFormModalState<
    "create" | SkillCollection
  >();
  const closeFormModal = () => {
    setFormModalState(null);
    refetch();
  };
  const [collectionToDelete, setCollectionToDelete] =
    React.useState<SkillCollection>();

  const { mutate: deleteCollection } = useDeleteSkillCollectionMutation(
    () => {
      pushNotification({
        title: t("agentic.skillCollection.deleted"),
        variant: "success",
      });
      refetch();
    },
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );

  const collectionPath = (collection: SkillCollection) =>
    generatePath(DevPaths.skillCollectionDetails, {
      collectionId: String(collection.id),
    });

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "skill-collections",
    tableName: "skill-collections-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: skillCollections,
    columnNames: {
      name: t("terms.name"),
      description: t("terms.description"),
      skills: t("agentic.skillCollection.members"),
      agents: t("agentic.skillCollection.agents"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: canManageCollections,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.skill.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({ name: item?.name || "" }),
    isLoading: isFetching,
  });

  const {
    currentPageItems,
    numRenderedColumns,
    propHelpers: {
      toolbarProps,
      filterToolbarProps,
      paginationToolbarItemProps,
      paginationProps,
      tableProps,
      getThProps,
      getTrProps,
      getTdProps,
    },
  } = tableControls;

  const createButton = (
    <Button
      type="button"
      id="create-skill-collection"
      variant={ButtonVariant.primary}
      onClick={() => setFormModalState("create")}
    >
      {t("agentic.skillCollection.create")}
    </Button>
  );

  const managedTooltip = t("agentic.common.managedByKonveyor");

  const skillsCell = (collection: SkillCollection) => {
    const [onlySkill] = collection.skills;
    if (collection.skills.length === 0) {
      return <EmptyTextMessage message={t("terms.none")} />;
    }
    // One object in a cell is its name (guide 4.10, C1).
    if (collection.skills.length === 1) {
      return (
        <Link
          to={to(
            generatePath(DevPaths.skillDetails, {
              skillId: String(onlySkill.id),
            })
          )}
        >
          {onlySkill.name}
        </Link>
      );
    }
    return (
      <CountLink to={to(collectionPath(collection))}>
        {t("agentic.skillCollection.skillCount", {
          count: collection.skills.length,
        })}
      </CountLink>
    );
  };

  const agentsCell = (collection: SkillCollection) => {
    if (isLoadingAgents) {
      return <Skeleton screenreaderText={t("terms.loading")} />;
    }
    if (knownAgents == null) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    const using = getAgentsUsingCollection(collection.id, knownAgents);
    if (using.length === 0) {
      return <EmptyTextMessage message={t("terms.none")} />;
    }
    if (using.length === 1) {
      return (
        <Link
          to={to(
            generatePath(DevPaths.agentDetails, {
              agentId: String(using[0].id),
            })
          )}
        >
          {using[0].name}
        </Link>
      );
    }
    return (
      <CountLink to={to(collectionPath(collection), `#${USED_BY_AGENTS_ID}`)}>
        {t("agentic.skillCollection.agentCount", { count: using.length })}
      </CountLink>
    );
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <ConditionalRender
        when={isFetching && !(skillCollections.length || fetchError)}
        then={<AppPlaceholder />}
      >
        {/* The list wrapper of archetypes-page.tsx, kept for parity (guide 4.1). */}
        <div
          style={{
            backgroundColor:
              "var(--pf-t--global--background--color--primary--default)",
          }}
        >
          <Toolbar {...toolbarProps}>
            <ToolbarContent>
              {/* Filters stay expanded down to 1024 wide (kit-list@1024). */}
              <FilterToolbar {...filterToolbarProps} breakpoint="lg" />
              {canManageCollections && (
                <ToolbarGroup variant="action-group">
                  <ToolbarItem>{createButton}</ToolbarItem>
                </ToolbarGroup>
              )}
              <ToolbarItem {...paginationToolbarItemProps}>
                <SimplePagination
                  idPrefix="skill-collections-table"
                  isTop
                  paginationProps={paginationProps}
                />
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
          <Table
            {...tableProps}
            aria-label={t("agentic.skillCollection.title")}
          >
            <Thead>
              <Tr>
                <TableHeaderContentWithControls {...tableControls}>
                  <Th {...getThProps({ columnKey: "name" })} width={20} />
                  <Th
                    {...getThProps({ columnKey: "description" })}
                    width={30}
                  />
                  <Th
                    {...getThProps({ columnKey: "skills" })}
                    modifier="fitContent"
                  />
                  <Th
                    {...getThProps({ columnKey: "agents" })}
                    modifier="fitContent"
                  />
                </TableHeaderContentWithControls>
              </Tr>
            </Thead>
            <ConditionalTableBody
              isLoading={isFetching}
              isError={!!fetchError}
              isNoData={currentPageItems.length === 0}
              noDataEmptyState={
                skillCollections.length > 0 ? (
                  <NoDataEmptyState
                    title={t("message.noResultsFoundTitle")}
                    description={t("message.noResultsFoundBody")}
                  />
                ) : (
                  <NoDataEmptyState
                    title={t("agentic.skillCollection.emptyTitle")}
                    description={
                      canManageCollections
                        ? t("agentic.skillCollection.emptyDescription")
                        : t("agentic.skillCollection.emptyDescriptionReadOnly")
                    }
                    actions={canManageCollections && createButton}
                  />
                )
              }
              numRenderedColumns={numRenderedColumns}
            >
              <Tbody>
                {currentPageItems.map((collection, rowIndex) => {
                  const deleteBlockedReason = getCollectionDeleteBlockedReason(
                    t,
                    collection.id,
                    knownAgents
                  );
                  return (
                    <Tr
                      key={collection.id}
                      {...getTrProps({ item: collection })}
                    >
                      <TableRowContentWithControls
                        {...tableControls}
                        item={collection}
                        rowIndex={rowIndex}
                      >
                        <Td {...getTdProps({ columnKey: "name" })}>
                          <Link to={to(collectionPath(collection))}>
                            {collection.name}
                          </Link>
                        </Td>
                        <Td
                          {...getTdProps({ columnKey: "description" })}
                          modifier="truncate"
                          tooltip={collection.description || undefined}
                        >
                          {collection.description}
                        </Td>
                        <Td
                          {...getTdProps({ columnKey: "skills" })}
                          modifier="nowrap"
                        >
                          {skillsCell(collection)}
                        </Td>
                        <Td
                          {...getTdProps({ columnKey: "agents" })}
                          modifier="nowrap"
                        >
                          {agentsCell(collection)}
                        </Td>
                        {canManageCollections && (
                          <Td isActionCell>
                            <ActionsColumn
                              items={[
                                {
                                  title: t("actions.edit"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      setFormModalState(collection)
                                    ),
                                  ...managedActionProps(
                                    collection.operatorManaged,
                                    managedTooltip
                                  ),
                                },
                                { isSeparator: true },
                                {
                                  title: t("actions.delete"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      setCollectionToDelete(collection)
                                    ),
                                  ...(collection.operatorManaged
                                    ? managedActionProps(
                                        true,
                                        managedTooltip,
                                        "left"
                                      )
                                    : disabledActionProps(
                                        deleteBlockedReason,
                                        "left"
                                      )),
                                  isDanger:
                                    !collection.operatorManaged &&
                                    deleteBlockedReason == null,
                                },
                              ]}
                            />
                          </Td>
                        )}
                      </TableRowContentWithControls>
                    </Tr>
                  );
                })}
              </Tbody>
            </ConditionalTableBody>
          </Table>
          <SimplePagination
            idPrefix="skill-collections-table"
            isTop={false}
            paginationProps={paginationProps}
          />
        </div>
      </ConditionalRender>

      <Modal
        id="create-edit-skill-collection-modal"
        variant="medium"
        isOpen={formModalState !== null}
        onClose={closeFormModal}
      >
        <ModalHeader
          title={
            formModalState !== "create"
              ? t("agentic.skillCollection.edit")
              : t("agentic.skillCollection.create")
          }
        />
        <ModalBody>
          <SkillCollectionForm
            key={formKey}
            collection={formModalState !== "create" ? formModalState : null}
            onClose={closeFormModal}
          />
        </ModalBody>
      </Modal>

      {collectionToDelete != null && (
        <ConfirmDialog
          title={t("agentic.skillCollection.deleteTitle")}
          message={t("agentic.skillCollection.deleteDescription", {
            name: collectionToDelete.name,
          })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setCollectionToDelete(undefined)}
          onClose={() => setCollectionToDelete(undefined)}
          onConfirm={() => {
            deleteCollection(collectionToDelete.id);
            setCollectionToDelete(undefined);
          }}
        />
      )}
    </PageSection>
  );
};
