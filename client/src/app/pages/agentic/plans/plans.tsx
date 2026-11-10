import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Content,
  EmptyState,
  EmptyStateBody,
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
import { MigrationPlan } from "@app/agentic";
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
import {
  useDeleteMigrationPlanMutation,
  useFetchMigrationPlans,
} from "@app/queries/agentic";
import { plansWriteScopes } from "@app/scopes";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { PlanWizard } from "./plan-wizard/plan-wizard";

const MigrationPlansPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("agentic.plan.plansBreadcrumb"), []);
  const hasManagePlansScope = useHasSomeScopes(plansWriteScopes);
  const canManagePlans = hasManagePlansScope;
  const { pushNotification } = React.useContext(NotificationsContext);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
    React.useState<boolean>(false);
  const [planToDelete, setPlanToDelete] = React.useState<MigrationPlan>();

  const [isWizardOpen, setIsWizardOpen] = React.useState(false);
  const [planToEdit, setPlanToEdit] = React.useState<MigrationPlan | null>(
    null
  );

  const onDeleteSuccess = () => {
    pushNotification({
      title: t("agentic.plan.deleted"),
      variant: "success",
    });
  };

  const onDeleteError = (error: AxiosError) => {
    pushNotification({
      title: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: deletePlan } = useDeleteMigrationPlanMutation(
    onDeleteSuccess,
    onDeleteError
  );

  const { migrationPlans, isFetching, fetchError, refetch } =
    useFetchMigrationPlans();

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "plans",
    tableName: "migration-plans-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: migrationPlans,
    columnNames: {
      name: t("terms.name"),
      description: t("terms.description"),
      archetype: t("agentic.plan.archetype"),
      stagesCount: t("agentic.plan.stages"),
      targetProfile: t("agentic.plan.target"),
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
        placeholderText: t("agentic.plan.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item?.name || "",
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

  /** Why the Plan cannot be deleted, or undefined when it can. */
  const getDeleteBlocker = (plan: MigrationPlan) => {
    if ((plan.runCount ?? 0) > 0) {
      return t("agentic.plan.deleteUsedByRuns", { count: plan.runCount });
    }
    if (
      (plan.applicationImpact?.matching ?? 0) > 0 ||
      plan.migrationPath?.isDefault === true
    ) {
      return t("agentic.plan.deleteInUse");
    }
    return undefined;
  };

  const deleteRow = (row: MigrationPlan) => {
    setPlanToDelete(row);
    setIsConfirmDialogOpen(true);
  };

  const closeWizard = () => {
    setIsWizardOpen(false);
    setPlanToEdit(null);
    refetch();
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Content>
          <Content component="h1">{t("agentic.plan.plansTitle")}</Content>
          <Content component="p">{t("agentic.plan.plansDescription")}</Content>
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(migrationPlans || fetchError)}
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
                  {canManagePlans && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-migration-plan"
                        aria-label={t("agentic.plan.createTitle")}
                        variant={ButtonVariant.primary}
                        onClick={() => {
                          setPlanToEdit(null);
                          setIsWizardOpen(true);
                        }}
                      >
                        {t("agentic.plan.createTitle")}
                      </Button>
                    </ToolbarItem>
                  )}
                </ToolbarGroup>
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="migration-plans-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table {...tableProps} aria-label={t("agentic.plan.tableLabel")}>
              <Thead>
                <Tr>
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th {...getThProps({ columnKey: "description" })} />
                    <Th {...getThProps({ columnKey: "archetype" })} />
                    <Th {...getThProps({ columnKey: "stagesCount" })} />
                    <Th {...getThProps({ columnKey: "targetProfile" })} />
                    <Th screenReaderText={t("actions.rowActions")} />
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isFetching}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  migrationPlans.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <EmptyState
                      headingLevel="h2"
                      icon={CubesIcon}
                      titleText={t("agentic.plan.emptyTitle")}
                      variant="sm"
                    >
                      <EmptyStateBody>
                        {t("agentic.plan.emptyDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems?.map((plan, rowIndex) => (
                  <Tbody key={plan.id} isExpanded={isCellExpanded(plan)}>
                    <Tr {...getTrProps({ item: plan })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={plan}
                        rowIndex={rowIndex}
                      >
                        <Td width={20} {...getTdProps({ columnKey: "name" })}>
                          <Link
                            to={to(
                              DevPaths.migrationPlanDetails.replace(
                                ":planId",
                                plan.id.toString()
                              )
                            )}
                          >
                            {plan.name}
                          </Link>
                        </Td>
                        <Td
                          width={25}
                          {...getTdProps({ columnKey: "description" })}
                        >
                          {plan.description}
                        </Td>
                        <Td
                          width={15}
                          {...getTdProps({ columnKey: "archetype" })}
                        >
                          {plan.migrationPath?.archetype.name ||
                            t("agentic.plan.notConfigured")}
                        </Td>
                        <Td
                          width={10}
                          {...getTdProps({ columnKey: "stagesCount" })}
                        >
                          {plan.stages?.length || 0}
                        </Td>
                        <Td
                          width={15}
                          {...getTdProps({ columnKey: "targetProfile" })}
                        >
                          {plan.migrationPath?.targetProfiles
                            .map((profile) => profile.name)
                            .join(", ") || t("agentic.plan.notConfigured")}
                        </Td>
                        <Td isActionCell>
                          {canManagePlans && (
                            <ActionsColumn
                              items={[
                                {
                                  title: t("actions.edit"),
                                  onClick: () => {
                                    openModalAfterMenuClose(() => {
                                      setPlanToEdit(plan);
                                      setIsWizardOpen(true);
                                    });
                                  },
                                },
                                { isSeparator: true },
                                {
                                  title: t("actions.delete"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      deleteRow(plan)
                                    ),
                                  isDanger: true,
                                  isAriaDisabled:
                                    getDeleteBlocker(plan) != null,
                                  tooltipProps:
                                    getDeleteBlocker(plan) != null
                                      ? {
                                          content: getDeleteBlocker(plan),
                                        }
                                      : undefined,
                                },
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
              idPrefix="migration-plans-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>

      <PlanWizard
        isOpen={isWizardOpen}
        plan={planToEdit}
        onClose={closeWizard}
      />

      {isConfirmDialogOpen && (
        <ConfirmDialog
          title={t("agentic.plan.deleteTitle", {
            plan: planToDelete?.name,
          })}
          titleIconVariant="warning"
          message={t("agentic.plan.deleteDescription")}
          isOpen={true}
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsConfirmDialogOpen(false)}
          onClose={() => setIsConfirmDialogOpen(false)}
          onConfirm={() => {
            if (planToDelete) {
              deletePlan(planToDelete.id);
              setPlanToDelete(undefined);
            }
            setIsConfirmDialogOpen(false);
          }}
        />
      )}
    </>
  );
};

export default MigrationPlansPage;
