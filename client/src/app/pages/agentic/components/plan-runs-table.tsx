import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { PlanRun } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterToolbar } from "@app/components/FilterToolbar";
import { FilterCategory } from "@app/components/FilterToolbar/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import {
  formatDuration,
  getCurrentStage,
  planRunDurationSeconds,
} from "@app/utils/agentic";
import { formatTableDate } from "@app/utils/utils";

import { RunStatus } from "./agentic-status";
import { CountLink } from "./count-link";

const PlanRunStatus: React.FC<{ run: PlanRun }> = ({ run }) => {
  const { t } = useTranslation();
  // A failed run gets no second line here: its status says enough in a list.
  const current = getCurrentStage(run);
  const status = current?.stageRun.status;
  return (
    <RunStatus
      status={run.status}
      supportingText={
        current == null
          ? undefined
          : status === "AwaitingApproval"
            ? t("agentic.planRunsTable.approvalNeeded", {
                stage: current.stageRun.name,
              })
            : status === "Running"
              ? t("agentic.common.stagePosition", {
                  position: current.position,
                  total: current.total,
                  stage: current.stageRun.name,
                })
              : undefined
      }
    />
  );
};

/**
 * Two modes, set by `filterCategories`. The list (`/plan-runs`) passes it and
 * gets the toolbar, URL state and top pagination; it also passes `isLoading`,
 * `fetchError` and `emptyState`, which render inside the table. A detail tab
 * (a plan's or an application's runs) passes none of these four: it renders
 * its own loading, error and empty section outside the table, because a
 * section with nothing to list has no table header (kit-tables).
 */
export interface PlanRunsTableProps {
  runs: PlanRun[];
  /** List mode only: a spinner row while the runs load. */
  isLoading?: boolean;
  /** List mode only: the error row when the runs failed to load. */
  fetchError?: unknown;
  /** False on a migration plan's Runs tab, where the page names the plan. */
  showPlan?: boolean;
  /**
   * The `/plan-runs` toolbar: these filters, URL state and top pagination.
   * Without it (detail tabs) the rows are the caller's, and pagination shows
   * only above 10 rows.
   */
  filterCategories?: FilterCategory<PlanRun, string>[];
  /** List mode only: shown when there are no runs at all; it says where runs come from. */
  emptyState?: React.ReactNode;
  /** Builds a link with the caller's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  /** `?from=` origin of the caller's page, added to every link (legacy shared URLs). */
  origin?: string;
  /** The application whose page shows the table: its name is text, not a link to the same page. */
  currentApplicationId?: number;
}

/**
 * The one plan runs table (guide 4.9, kit-tables): Run · Migration plan ·
 * Status (with the active stage) · Applications · Started · Duration. Used on
 * `/plan-runs`, a migration plan's Runs tab and an application's Plan runs
 * tab. Run names are rendered verbatim: they are opaque (7.4, addenda X14).
 */
export const PlanRunsTable: React.FC<PlanRunsTableProps> = ({
  runs,
  isLoading = false,
  fetchError,
  showPlan = true,
  filterCategories,
  emptyState,
  linkTo,
  origin = "",
  currentApplicationId,
}) => {
  const { t } = useTranslation();
  const hasToolbar = filterCategories != null;
  const columnNames = {
    name: t("agentic.planRunsTable.run"),
    plan: t("agentic.entity.migrationPlan"),
    status: t("terms.status"),
    applications: t("terms.applications"),
    started: t("terms.started"),
    duration: t("agentic.planRunsTable.duration"),
  };

  const tableControls = useLocalTableControls({
    // Only the list keeps its view in the URL; a tab's table is its own.
    persistTo: hasToolbar ? "urlParams" : "state",
    persistenceKeyPrefix: hasToolbar ? "planRuns" : undefined,
    tableName: "plan-runs-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: runs,
    columnNames,
    forceNumRenderedColumns:
      Object.keys(columnNames).length - (showPlan ? 0 : 1),
    isFilterEnabled: true,
    filterCategories: filterCategories ?? [],
    isSortEnabled: true,
    sortableColumns: ["name", "plan", "status", "started"],
    initialSort: { columnKey: "started", direction: "desc" },
    getSortValues: (run) => ({
      name: run.name,
      plan: run.planName,
      status: run.status,
      // A pending run has not started: it sorts as the newest.
      started:
        run.status === "Pending"
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(run.startedAt),
    }),
    isPaginationEnabled: true,
    initialItemsPerPage: 10,
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

  const showPagination = hasToolbar || runs.length > 10;
  const notStarted = <EmptyTextMessage message={t("terms.notStarted")} />;
  // A value that cannot be derived is unknown, never "Not available" (4.11).
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );

  return (
    <>
      {hasToolbar && (
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
      )}
      <Table {...tableProps} aria-label={t("agentic.planRunsTable.label")}>
        <Thead>
          <Tr>
            <TableHeaderContentWithControls {...tableControls}>
              <Th {...getThProps({ columnKey: "name" })} />
              {showPlan && (
                <Th {...getThProps({ columnKey: "plan" })} modifier="wrap" />
              )}
              <Th
                {...getThProps({ columnKey: "status" })}
                modifier="fitContent"
              />
              <Th {...getThProps({ columnKey: "applications" })} />
              <Th
                {...getThProps({ columnKey: "started" })}
                modifier="fitContent"
              />
              <Th
                {...getThProps({ columnKey: "duration" })}
                modifier="fitContent"
              />
            </TableHeaderContentWithControls>
          </Tr>
        </Thead>
        <ConditionalTableBody
          isLoading={isLoading}
          isError={fetchError != null}
          isNoData={currentPageItems.length === 0}
          noDataEmptyState={
            runs.length > 0 ? (
              <NoDataEmptyState
                title={t("message.noResultsFoundTitle")}
                description={t("message.noResultsFoundBody")}
              />
            ) : (
              emptyState
            )
          }
          numRenderedColumns={numRenderedColumns}
        >
          {currentPageItems.map((run, rowIndex) => {
            const duration = planRunDurationSeconds(run);
            return (
              <Tbody key={run.id}>
                <Tr {...getTrProps({ item: run })}>
                  <TableRowContentWithControls
                    {...tableControls}
                    item={run}
                    rowIndex={rowIndex}
                  >
                    <Td {...getTdProps({ columnKey: "name" })}>
                      <Link
                        to={linkTo(
                          generatePath(DevPaths.planRunDetails, {
                            runId: run.id,
                          }),
                          origin
                        )}
                      >
                        {run.name}
                      </Link>
                    </Td>
                    {showPlan && (
                      <Td {...getTdProps({ columnKey: "plan" })}>
                        <Link
                          to={linkTo(
                            generatePath(DevPaths.migrationPlanDetails, {
                              planId: run.planId,
                            }),
                            origin
                          )}
                        >
                          {run.planName}
                        </Link>
                      </Td>
                    )}
                    <Td
                      modifier="nowrap"
                      {...getTdProps({ columnKey: "status" })}
                    >
                      <PlanRunStatus run={run} />
                    </Td>
                    <Td
                      modifier="nowrap"
                      {...getTdProps({ columnKey: "applications" })}
                    >
                      {run.applications.length === 1 &&
                      run.applications[0].id === currentApplicationId ? (
                        run.applications[0].name
                      ) : run.applications.length === 1 ? (
                        <Link
                          to={linkTo(
                            generatePath(DevPaths.applicationDetails, {
                              applicationId: String(run.applications[0].id),
                            }),
                            origin
                          )}
                        >
                          {run.applications[0].name}
                        </Link>
                      ) : run.applications.length > 1 ? (
                        // "{n} applications" opens the run, whose page
                        // lists them (addenda X14).
                        <CountLink
                          to={linkTo(
                            generatePath(DevPaths.planRunDetails, {
                              runId: run.id,
                            }),
                            origin
                          )}
                        >
                          {t("agentic.planRunsTable.applicationCount", {
                            count: run.applications.length,
                          })}
                        </CountLink>
                      ) : (
                        <EmptyTextMessage message={t("terms.none")} />
                      )}
                    </Td>
                    <Td
                      modifier="nowrap"
                      {...getTdProps({ columnKey: "started" })}
                    >
                      {run.status === "Pending"
                        ? notStarted
                        : formatTableDate(new Date(run.startedAt))}
                    </Td>
                    <Td
                      modifier="nowrap"
                      {...getTdProps({ columnKey: "duration" })}
                    >
                      {duration != null
                        ? formatDuration(duration)
                        : run.status === "Pending"
                          ? notStarted
                          : unavailable}
                    </Td>
                  </TableRowContentWithControls>
                </Tr>
              </Tbody>
            );
          })}
        </ConditionalTableBody>
      </Table>
      {showPagination && (
        <SimplePagination
          idPrefix="plan-runs-table"
          isTop={false}
          paginationProps={paginationProps}
        />
      )}
    </>
  );
};
