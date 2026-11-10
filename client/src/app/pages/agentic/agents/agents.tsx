import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Content,
  ContentVariants,
  EmptyState,
  EmptyStateBody,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
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
import { Agent } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
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
  useDeleteAgentMutation,
  useFetchAgents,
  useFetchMigrationPlans,
} from "@app/queries/agentic";
import { agenticAgentRunsWriteScopes, agentsWriteScopes } from "@app/scopes";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { getPlansUsingAgent } from "./agent-usage";
import { AgentForm } from "./components/agent-form";
import { AgentTestModal } from "./components/agent-test-modal";

export const AgentsPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("sidebar.agents"), []);
  const hasManageAgentsScope = useHasSomeScopes(agentsWriteScopes);
  const canTestAgents = useHasSomeScopes(agenticAgentRunsWriteScopes);
  const canManageAgents = hasManageAgentsScope;
  const { pushNotification } = React.useContext(NotificationsContext);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
    React.useState<boolean>(false);

  const [agentToDelete, setAgentToDelete] = React.useState<Agent>();
  const [agentToTest, setAgentToTest] = React.useState<Agent | null>(null);
  const [agentSkillsToInspect, setAgentSkillsToInspect] =
    React.useState<Agent | null>(null);

  const [createUpdateModalState, setCreateUpdateModalState, formKey] =
    useFormModalState<"create" | Agent>();
  const isCreateUpdateModalOpen = createUpdateModalState !== null;
  const agentToUpdate =
    createUpdateModalState !== "create" ? createUpdateModalState : null;

  const onDeleteSuccess = () => {
    pushNotification({
      title: t("agentic.agent.deleted"),
      variant: "success",
    });
  };

  const onDeleteError = (error: AxiosError) => {
    pushNotification({
      title: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: deleteAgent } = useDeleteAgentMutation(
    onDeleteSuccess,
    onDeleteError
  );

  const { agents, isFetching, fetchError, refetch } = useFetchAgents();
  const { migrationPlans } = useFetchMigrationPlans();

  const getAgentPlanCount = (agent: Agent) =>
    getPlansUsingAgent(agent.id, migrationPlans).length;

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "agents",
    tableName: "agents-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: agents,
    columnNames: {
      name: t("terms.name"),
      description: t("terms.description"),
      model: t("agentic.agent.model"),
      skillsCount: t("agentic.skill.title"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: true,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.agent.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "description"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item?.name || "",
      description: item?.description || "",
    }),
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
    expansionDerivedState: { isCellExpanded },
  } = tableControls;

  const deleteRow = (row: Agent) => {
    setAgentToDelete(row);
    setIsConfirmDialogOpen(true);
  };

  const closeCreateUpdateModal = () => {
    setCreateUpdateModalState(null);
    refetch();
  };

  return (
    <>
      <PageSection>
        <Content component={ContentVariants.h1}>
          {t("agentic.agent.title")}
        </Content>
        <Content component={ContentVariants.p}>
          {t("agentic.agent.description")}
        </Content>
      </PageSection>
      <PageSection>
        <ConditionalRender
          when={isFetching && !(agents || fetchError)}
          then={<AppPlaceholder />}
        >
          <div
            style={{
              backgroundColor:
                "var(--pf-t--global--background--color--primary--default)",
            }}
          >
            <Toolbar {...toolbarProps}>
              <ToolbarContent>
                <FilterToolbar {...filterToolbarProps} />
                <ToolbarGroup variant="action-group">
                  {canManageAgents && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-agent"
                        aria-label={t("agentic.agent.create")}
                        variant={ButtonVariant.primary}
                        onClick={() => setCreateUpdateModalState("create")}
                      >
                        {t("agentic.agent.create")}
                      </Button>
                    </ToolbarItem>
                  )}
                </ToolbarGroup>
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="agents-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table {...tableProps} aria-label={t("agentic.agent.tableLabel")}>
              <Thead>
                <Tr>
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th {...getThProps({ columnKey: "description" })} />
                    <Th {...getThProps({ columnKey: "model" })} />
                    <Th {...getThProps({ columnKey: "skillsCount" })} />
                    <Th screenReaderText={t("actions.rowActions")} />
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isFetching}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  agents.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <EmptyState
                      headingLevel="h2"
                      icon={CubesIcon}
                      titleText={t("agentic.agent.emptyTitle")}
                      variant="sm"
                    >
                      <EmptyStateBody>
                        {t("agentic.agent.emptyDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems?.map((agent, rowIndex) => (
                  <Tbody key={agent.id} isExpanded={isCellExpanded(agent)}>
                    <Tr {...getTrProps({ item: agent })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={agent}
                        rowIndex={rowIndex}
                      >
                        <Td width={25} {...getTdProps({ columnKey: "name" })}>
                          <Link
                            to={to(
                              DevPaths.agentDetails.replace(
                                ":agentId",
                                agent.id.toString()
                              )
                            )}
                          >
                            {agent.name}
                          </Link>
                        </Td>
                        <Td
                          width={35}
                          {...getTdProps({ columnKey: "description" })}
                        >
                          {agent.description}
                        </Td>
                        <Td width={20} {...getTdProps({ columnKey: "model" })}>
                          {agent.model.name}
                        </Td>
                        <Td
                          width={10}
                          {...getTdProps({ columnKey: "skillsCount" })}
                        >
                          {agent.skills?.length ? (
                            <Button
                              variant="link"
                              isInline
                              aria-label={t("agentic.agent.inspectSkills", {
                                agent: agent.name,
                              })}
                              onClick={() => setAgentSkillsToInspect(agent)}
                            >
                              {agent.skills.length}
                            </Button>
                          ) : (
                            0
                          )}
                        </Td>
                        <Td isActionCell>
                          {(canManageAgents || canTestAgents) && (
                            <ActionsColumn
                              items={[
                                ...(canTestAgents
                                  ? [
                                      {
                                        title: t("agentic.agent.test"),
                                        onClick: () =>
                                          openModalAfterMenuClose(() =>
                                            setAgentToTest(agent)
                                          ),
                                      },
                                    ]
                                  : []),
                                ...(canManageAgents
                                  ? [
                                      {
                                        title: t("actions.edit"),
                                        onClick: () =>
                                          openModalAfterMenuClose(() =>
                                            setCreateUpdateModalState(agent)
                                          ),
                                      },
                                      { isSeparator: true },
                                      {
                                        title: t("actions.delete"),
                                        onClick: () =>
                                          openModalAfterMenuClose(() =>
                                            deleteRow(agent)
                                          ),
                                        isDanger: true,
                                        isAriaDisabled:
                                          getAgentPlanCount(agent) > 0,
                                        tooltipProps:
                                          getAgentPlanCount(agent) > 0
                                            ? {
                                                content: t(
                                                  "agentic.agent.deleteInUse",
                                                  {
                                                    count:
                                                      getAgentPlanCount(agent),
                                                  }
                                                ),
                                              }
                                            : undefined,
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          )}
                        </Td>
                      </TableRowContentWithControls>
                    </Tr>
                  </Tbody>
                ))}
              </ConditionalTableBody>
            </Table>
            <SimplePagination
              idPrefix="agents-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>

      <Modal
        id="create-edit-agent-modal"
        variant="medium"
        isOpen={isCreateUpdateModalOpen}
        onClose={closeCreateUpdateModal}
      >
        <ModalHeader
          title={
            agentToUpdate ? t("agentic.agent.edit") : t("agentic.agent.create")
          }
        />
        <ModalBody>
          <AgentForm
            key={formKey}
            agent={agentToUpdate}
            onClose={closeCreateUpdateModal}
          />
        </ModalBody>
      </Modal>
      <AgentTestModal
        agent={agentToTest}
        onClose={() => setAgentToTest(null)}
      />
      <Modal
        isOpen={agentSkillsToInspect != null}
        onClose={() => setAgentSkillsToInspect(null)}
        variant="small"
      >
        <ModalHeader
          title={t("agentic.agent.associatedSkillsTitle", {
            agent: agentSkillsToInspect?.name,
          })}
          description={t("agentic.agent.associatedSkillsDescription")}
        />
        <ModalBody>
          <Content component="ul">
            {agentSkillsToInspect?.skills.map((skill) => (
              <Content component="li" key={skill.id}>
                <Link
                  to={to(
                    generatePath(DevPaths.skillDetails, {
                      skillId: String(skill.id),
                    })
                  )}
                  onClick={() => setAgentSkillsToInspect(null)}
                >
                  {skill.name}
                </Link>
              </Content>
            ))}
          </Content>
        </ModalBody>
      </Modal>
      {isConfirmDialogOpen && (
        <ConfirmDialog
          title={t("agentic.agent.deleteTitle", {
            agent: agentToDelete?.name,
          })}
          titleIconVariant={"warning"}
          message={t("agentic.agent.deleteDescription")}
          isOpen={true}
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsConfirmDialogOpen(false)}
          onClose={() => setIsConfirmDialogOpen(false)}
          onConfirm={() => {
            if (agentToDelete) {
              deleteAgent(agentToDelete.id);
              setAgentToDelete(undefined);
            }
            setIsConfirmDialogOpen(false);
          }}
        />
      )}
    </>
  );
};

export default AgentsPage;
