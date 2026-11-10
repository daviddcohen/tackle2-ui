import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Content,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  PageSection,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { PlanRun } from "@app/agentic";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFetchPlanRuns } from "@app/queries/agentic";

import { RunStatusLabel } from "../components/run-status-label";

const PlanRunsPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("agentic.planRun.title"), []);

  const { planRuns, isFetching, isLoading, fetchError } = useFetchPlanRuns();

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "planRuns",
    tableName: "plan-runs-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: planRuns,
    columnNames: {
      name: t("terms.name"),
      plan: t("agentic.planRun.plan"),
      status: t("agentic.planRun.status"),
      applications: t("agentic.planRun.applications"),
      targetBranch: t("agentic.planRun.targetBranch"),
      started: t("agentic.planRun.started"),
      completed: t("agentic.planRun.completed"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.agent.filterByName"),
        getItemValue: (item) => item.name,
      },
      {
        categoryKey: "status",
        title: t("agentic.planRun.status"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.planRun.filterByStatus"),
        selectOptions: [
          { value: "Pending", label: t("agentic.runStatus.pending") },
          { value: "Running", label: t("agentic.runStatus.running") },
          {
            value: "AwaitingApproval",
            label: t("agentic.runStatus.awaitingApproval"),
          },
          { value: "Succeeded", label: t("agentic.runStatus.succeeded") },
          { value: "Failed", label: t("agentic.runStatus.failed") },
        ],
        matcher: (filter: string, item: PlanRun) => item.status === filter,
      },
      {
        categoryKey: "plan",
        title: t("agentic.planRun.plan"),
        type: FilterType.search,
        placeholderText: t("agentic.planRun.filterByPlan"),
        getItemValue: (item) => item.planName,
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "plan", "status", "started"],
    initialSort: { columnKey: "started", direction: "desc" },
    getSortValues: (item) => ({
      name: item.name,
      plan: item.planName,
      status: item.status,
      started: item.startedAt,
    }),
    isLoading,
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

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Content>
          <Content component="h1">{t("agentic.planRun.title")}</Content>
          <Content component="p">{t("agentic.planRun.description")}</Content>
        </Content>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(planRuns.length || fetchError)}
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
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="plan-runs-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table {...tableProps} aria-label={t("agentic.planRun.tableLabel")}>
              <Thead>
                <Tr>
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th {...getThProps({ columnKey: "plan" })} />
                    <Th {...getThProps({ columnKey: "status" })} />
                    <Th {...getThProps({ columnKey: "applications" })} />
                    <Th {...getThProps({ columnKey: "targetBranch" })} />
                    <Th
                      {...getThProps({ columnKey: "started" })}
                      modifier="wrap"
                    />
                    <Th
                      {...getThProps({ columnKey: "completed" })}
                      modifier="wrap"
                    />
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isLoading}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  planRuns.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <EmptyState
                      headingLevel="h2"
                      icon={CubesIcon}
                      titleText={t("agentic.planRun.emptyTitle")}
                      variant="sm"
                    >
                      <EmptyStateBody>
                        {t("agentic.planRun.emptyDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems.map((run, rowIndex) => (
                  <Tbody key={run.id}>
                    <Tr {...getTrProps({ item: run })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={run}
                        rowIndex={rowIndex}
                      >
                        <Td width={20} {...getTdProps({ columnKey: "name" })}>
                          <Link
                            to={to(
                              DevPaths.planRunDetails.replace(
                                ":runId",
                                run.id.toString()
                              )
                            )}
                          >
                            {run.name}
                          </Link>
                        </Td>
                        <Td width={15} {...getTdProps({ columnKey: "plan" })}>
                          <Link
                            to={to(
                              `${DevPaths.migrationPlanDetails.replace(
                                ":planId",
                                run.planId.toString()
                              )}?tab=runs`
                            )}
                          >
                            {run.planName}
                          </Link>
                        </Td>
                        <Td width={10} {...getTdProps({ columnKey: "status" })}>
                          <RunStatusLabel status={run.status} />
                        </Td>
                        <Td
                          width={20}
                          {...getTdProps({ columnKey: "applications" })}
                        >
                          <LabelGroup numLabels={3}>
                            {run.applications.map((app) => (
                              <Label key={app.id} isCompact>
                                <Link
                                  to={to(
                                    DevPaths.applicationDetails.replace(
                                      ":applicationId",
                                      String(app.id)
                                    )
                                  )}
                                >
                                  {app.name}
                                </Link>
                              </Label>
                            ))}
                          </LabelGroup>
                        </Td>
                        <Td
                          width={15}
                          {...getTdProps({ columnKey: "targetBranch" })}
                        >
                          <Label isCompact color="blue">
                            {run.targetBranch}
                          </Label>
                        </Td>
                        <Td
                          width={10}
                          {...getTdProps({ columnKey: "started" })}
                        >
                          {new Date(run.startedAt).toLocaleString()}
                        </Td>
                        <Td
                          width={10}
                          {...getTdProps({ columnKey: "completed" })}
                        >
                          {run.completedAt
                            ? new Date(run.completedAt).toLocaleString()
                            : "—"}
                        </Td>
                      </TableRowContentWithControls>
                    </Tr>
                  </Tbody>
                ))}
              </ConditionalTableBody>
            </Table>
            <SimplePagination
              idPrefix="plan-runs-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>
    </>
  );
};

export default PlanRunsPage;
