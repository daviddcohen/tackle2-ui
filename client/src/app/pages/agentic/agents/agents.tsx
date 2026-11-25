import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Content,
  PageSection,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import {
  ActionsColumn,
  IAction,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { Agent, MigrationPlan } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
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
  useFetchGateways,
  useFetchMigrationPlans,
} from "@app/queries/agentic";
import { agenticAgentRunsWriteScopes, agentsWriteScopes } from "@app/scopes";
import { deleteActionProps, disabledActionProps } from "@app/utils/agentic";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { CountLink } from "../components/count-link";

import { useAgentSkillsSummary } from "./agent-skills-summary";
import { getPlansUsingAgent, useAgentDeleteBlockedReason } from "./agent-usage";
import { AgentFormModal } from "./components/agent-form-modal";
import { AgentModel } from "./components/agent-model";
import { AgentTestModal } from "./components/agent-test-modal";

type LinkTo = (pathname: string, search?: string) => LocationDescriptor;

/**
 * One skill and no collection is the skill's name; otherwise the count
 * summary opens the agent, whose Details tab lists them.
 */
const AgentSkillsCell: React.FC<{ agent: Agent; to: LinkTo }> = ({
  agent,
  to,
}) => {
  const { t } = useTranslation();
  const skillsSummary = useAgentSkillsSummary();
  const summary = skillsSummary(agent);
  if (summary == null) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  if (agent.skills.length === 1 && !agent.skillCollections?.length) {
    const [skill] = agent.skills;
    return (
      <Link to={to(generatePath(DevPaths.skillDetails, { skillId: skill.id }))}>
        {skill.name}
      </Link>
    );
  }
  return (
    <CountLink
      to={to(generatePath(DevPaths.agentDetails, { agentId: agent.id }))}
    >
      {summary}
    </CountLink>
  );
};

/**
 * Where the agent is used: one plan is its name, more are a count opening
 * the agent (its Details tab lists them). The plans come from a second
 * query, so the cell never says "None" before it has them.
 */
const AgentPlansCell: React.FC<{
  agent: Agent;
  plans: MigrationPlan[];
  isLoading: boolean;
  isError: boolean;
  to: LinkTo;
}> = ({ agent, plans, isLoading, isError, to }) => {
  const { t } = useTranslation();
  if (isLoading) {
    return <Skeleton screenreaderText={t("terms.loading")} />;
  }
  if (isError) {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  if (plans.length === 0) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  if (plans.length === 1) {
    const [plan] = plans;
    return (
      <Link
        to={to(
          generatePath(DevPaths.migrationPlanDetails, { planId: plan.id })
        )}
      >
        {plan.name}
      </Link>
    );
  }
  return (
    <CountLink
      to={to(generatePath(DevPaths.agentDetails, { agentId: agent.id }))}
    >
      {t("agentic.agent.planCount", { count: plans.length })}
    </CountLink>
  );
};

export const AgentsPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("sidebar.agents"), []);
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);
  const canTestAgents = useHasSomeScopes(agenticAgentRunsWriteScopes);
  const { pushNotification } = React.useContext(NotificationsContext);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
    React.useState<boolean>(false);

  const [agentToDelete, setAgentToDelete] = React.useState<Agent>();
  const [agentToTest, setAgentToTest] = React.useState<Agent | null>(null);

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
  const {
    migrationPlans,
    isLoading: isLoadingPlans,
    isSuccess: hasPlans,
  } = useFetchMigrationPlans();
  const {
    gateways,
    isLoading: isLoadingGateways,
    fetchError: gatewaysError,
  } = useFetchGateways();
  const isGatewayUnavailable = gatewaysError != null && gateways.length === 0;

  const deleteBlockedReason = useAgentDeleteBlockedReason();
  const hasRowActions = canManageAgents || canTestAgents;

  /** Edit, Test agent, separator, Delete, each with its own scope. */
  const rowActions = (agent: Agent): IAction[] => {
    const managedReason = agent.operatorManaged
      ? t("agentic.common.managedByKonveyor")
      : undefined;
    const edit: IAction[] = canManageAgents
      ? [
          {
            title: t("actions.edit"),
            onClick: () =>
              openModalAfterMenuClose(() => setCreateUpdateModalState(agent)),
            ...disabledActionProps(
              managedReason,
              undefined,
              `agents-table-row-${agent.id}-edit`
            ),
          },
        ]
      : [];
    const test: IAction[] = canTestAgents
      ? [
          {
            title: t("agentic.agent.test"),
            onClick: () => openModalAfterMenuClose(() => setAgentToTest(agent)),
          },
        ]
      : [];
    if (!canManageAgents) {
      return test;
    }
    return [
      ...edit,
      ...test,
      { isSeparator: true },
      {
        title: t("actions.delete"),
        onClick: () => openModalAfterMenuClose(() => deleteRow(agent)),
        ...deleteActionProps(
          managedReason ??
            deleteBlockedReason(
              hasPlans
                ? getPlansUsingAgent(agent.id, migrationPlans).length
                : undefined
            ),
          `agents-table-row-${agent.id}-delete`
        ),
      },
    ];
  };

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
      skills: t("agentic.agent.skills"),
      plans: t("agentic.agent.migrationPlans"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: hasRowActions,
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
    sortableColumns: ["name", "model"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item.name,
      model: item.model.name,
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
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("agentic.agent.title")}
          description={
            <Content component="p">{t("agentic.agent.description")}</Content>
          }
          breadcrumbs={[]}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>
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
                <FilterToolbar {...filterToolbarProps} breakpoint="lg" />
                <ToolbarGroup variant="action-group">
                  {canManageAgents && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-agent"
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
                    <Th {...getThProps({ columnKey: "name" })} width={20} />
                    <Th
                      {...getThProps({ columnKey: "description" })}
                      width={30}
                    />
                    <Th {...getThProps({ columnKey: "model" })} />
                    <Th {...getThProps({ columnKey: "skills" })} />
                    {/* Wraps rather than truncates when the table is narrow. */}
                    <Th
                      {...getThProps({ columnKey: "plans" })}
                      modifier="wrap"
                    />
                    {hasRowActions && (
                      <Th screenReaderText={t("actions.rowActions")} />
                    )}
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
                    <NoDataEmptyState
                      title={t("agentic.agent.emptyTitle")}
                      description={
                        canManageAgents
                          ? t("agentic.agent.emptyDescription")
                          : t("agentic.agent.emptyDescriptionReadOnly")
                      }
                      actions={
                        canManageAgents && (
                          <Button
                            variant={ButtonVariant.primary}
                            onClick={() => setCreateUpdateModalState("create")}
                          >
                            {t("agentic.agent.create")}
                          </Button>
                        )
                      }
                    />
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
                        <Td {...getTdProps({ columnKey: "name" })}>
                          <Link
                            to={to(
                              generatePath(DevPaths.agentDetails, {
                                agentId: agent.id,
                              })
                            )}
                          >
                            {agent.name}
                          </Link>
                        </Td>
                        <Td
                          modifier="truncate"
                          tooltip={agent.description}
                          {...getTdProps({ columnKey: "description" })}
                        >
                          {agent.description || (
                            <EmptyTextMessage message={t("terms.none")} />
                          )}
                        </Td>
                        <Td
                          modifier="nowrap"
                          {...getTdProps({ columnKey: "model" })}
                        >
                          <AgentModel
                            model={agent.model}
                            gateway={gateways.find(
                              (gateway) => gateway.id === agent.model.id
                            )}
                            isGatewayUnavailable={isGatewayUnavailable}
                            isGatewayLoading={isLoadingGateways}
                          />
                        </Td>
                        <Td {...getTdProps({ columnKey: "skills" })}>
                          <AgentSkillsCell agent={agent} to={to} />
                        </Td>
                        <Td {...getTdProps({ columnKey: "plans" })}>
                          <AgentPlansCell
                            agent={agent}
                            plans={getPlansUsingAgent(agent.id, migrationPlans)}
                            isLoading={isLoadingPlans}
                            isError={!hasPlans && !isLoadingPlans}
                            to={to}
                          />
                        </Td>
                        {hasRowActions && (
                          <Td isActionCell>
                            <ActionsColumn items={rowActions(agent)} />
                          </Td>
                        )}
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

      <AgentFormModal
        agent={agentToUpdate}
        isOpen={isCreateUpdateModalOpen}
        formKey={formKey}
        onClose={closeCreateUpdateModal}
      />
      <AgentTestModal
        target={agentToTest != null ? { agent: agentToTest } : null}
        onClose={() => setAgentToTest(null)}
      />
      {isConfirmDialogOpen && (
        <ConfirmDialog
          title={t("agentic.agent.deleteTitle")}
          message={t("agentic.agent.deleteDescription", {
            agent: agentToDelete?.name,
          })}
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
