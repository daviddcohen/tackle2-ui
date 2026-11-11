import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { AgentTestRun, EntityId, PlanRun, StageRun } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { RunStatus } from "@app/pages/agentic/components/agentic-status";
import { formatDuration, stageRunDurationSeconds } from "@app/utils/agentic";
import { formatTableDate } from "@app/utils/utils";

import {
  DetailSection,
  DetailSections,
  SectionEmpty,
} from "../../components/detail-section";

/** One stage this agent runs in one plan run. */
interface AgentStageRow {
  id: string;
  run: PlanRun;
  stageRun: StageRun;
}

/** Started descending with the not-started rows first (7.2, as PlanRunsTable). */
const startedSortValue = (status: string, startedAt?: string) =>
  status === "Pending"
    ? Number.MAX_SAFE_INTEGER
    : startedAt
      ? Date.parse(startedAt)
      : 0;

/** The words for empty cells (4.11): never started, or a failed read. */
const useEmptyValues = () => {
  const { t } = useTranslation();
  return {
    notStarted: <EmptyTextMessage message={t("terms.notStarted")} />,
    unavailable: <EmptyTextMessage message={t("agentic.common.unavailable")} />,
  };
};

const StageRunsSection: React.FC<{
  agentId: EntityId;
  planRuns: PlanRun[];
  isLoading: boolean;
  fetchError: unknown;
  linkCrumbs: BreadcrumbEntry[];
}> = ({ agentId, planRuns, isLoading, fetchError, linkCrumbs }) => {
  const { t } = useTranslation();
  const { notStarted, unavailable } = useEmptyValues();
  const rows = React.useMemo<AgentStageRow[]>(
    () =>
      planRuns.flatMap((run) =>
        run.stageRuns
          .filter((stageRun) => stageRun.agent.id === agentId)
          .map((stageRun) => ({
            id: `${run.id}-${stageRun.stageId}`,
            run,
            stageRun,
          }))
      ),
    [planRuns, agentId]
  );

  const tableControls = useLocalTableControls({
    tableName: "agent-stage-runs-table",
    idProperty: "id",
    items: rows,
    columnNames: {
      run: t("agentic.agentDetail.planRun"),
      stage: t("agentic.agentDetail.stage"),
      status: t("terms.status"),
      started: t("terms.started"),
      duration: t("agentic.stageRunsTable.duration"),
    },
    isSortEnabled: true,
    sortableColumns: ["started"],
    initialSort: { columnKey: "started", direction: "desc" },
    getSortValues: ({ stageRun }) => ({
      started: startedSortValue(stageRun.status, stageRun.startedAt),
    }),
    isPaginationEnabled: true,
    initialItemsPerPage: 10,
    isLoading,
  });
  const {
    currentPageItems,
    numRenderedColumns,
    propHelpers: {
      paginationProps,
      tableProps,
      getThProps,
      getTrProps,
      getTdProps,
    },
  } = tableControls;

  const isKnown = !isLoading && fetchError == null;
  return (
    <DetailSection
      title={
        isKnown && rows.length > 0
          ? t("agentic.agentDetail.planStagesTitleCount", {
              count: rows.length,
            })
          : t("agentic.agentDetail.planStagesTitle")
      }
      description={t("agentic.agentDetail.planStagesDescription")}
    >
      {isKnown && rows.length === 0 ? (
        <SectionEmpty>{t("agentic.agentDetail.planStagesEmpty")}</SectionEmpty>
      ) : (
        <>
          <Table
            {...tableProps}
            variant="compact"
            aria-label={t("agentic.agentDetail.planStagesTitle")}
          >
            <Thead>
              <Tr>
                <TableHeaderContentWithControls {...tableControls}>
                  <Th {...getThProps({ columnKey: "run" })} />
                  <Th {...getThProps({ columnKey: "stage" })} />
                  <Th
                    {...getThProps({ columnKey: "status" })}
                    modifier="fitContent"
                  />
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
            {/* The runs are a second query: spinner or error, never a false empty (X6). */}
            <ConditionalTableBody
              isLoading={isLoading}
              isError={fetchError != null}
              numRenderedColumns={numRenderedColumns}
            >
              <Tbody>
                {currentPageItems.map((row, rowIndex) => {
                  const { run, stageRun } = row;
                  const isPending = stageRun.status === "Pending";
                  const duration = stageRunDurationSeconds(stageRun);
                  return (
                    <Tr key={row.id} {...getTrProps({ item: row })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={row}
                        rowIndex={rowIndex}
                      >
                        <Td {...getTdProps({ columnKey: "run" })}>
                          <Link
                            to={breadcrumbTo(
                              generatePath(DevPaths.planRunDetails, {
                                runId: run.id,
                              }),
                              `?from=agent-${agentId}`,
                              linkCrumbs
                            )}
                          >
                            {run.name}
                          </Link>
                        </Td>
                        <Td {...getTdProps({ columnKey: "stage" })}>
                          <Link
                            to={breadcrumbTo(
                              generatePath(DevPaths.stageRunDetails, {
                                runId: run.id,
                                stageId: stageRun.stageId,
                              }),
                              `?from=agent-${agentId}`,
                              linkCrumbs
                            )}
                          >
                            {stageRun.name}
                          </Link>
                        </Td>
                        <Td
                          modifier="nowrap"
                          {...getTdProps({ columnKey: "status" })}
                        >
                          <RunStatus status={stageRun.status} />
                        </Td>
                        <Td
                          modifier="nowrap"
                          {...getTdProps({ columnKey: "started" })}
                        >
                          {isPending
                            ? notStarted
                            : stageRun.startedAt
                              ? formatTableDate(new Date(stageRun.startedAt))
                              : unavailable}
                        </Td>
                        <Td
                          modifier="nowrap"
                          {...getTdProps({ columnKey: "duration" })}
                        >
                          {duration != null
                            ? formatDuration(duration)
                            : isPending
                              ? notStarted
                              : unavailable}
                        </Td>
                      </TableRowContentWithControls>
                    </Tr>
                  );
                })}
              </Tbody>
            </ConditionalTableBody>
          </Table>
          {rows.length > 10 && (
            <SimplePagination
              idPrefix="agent-stage-runs-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          )}
        </>
      )}
    </DetailSection>
  );
};

const TestRunsSection: React.FC<{
  testRuns: AgentTestRun[];
  isLoading: boolean;
  fetchError: unknown;
  canTestAgent: boolean;
  linkCrumbs: BreadcrumbEntry[];
}> = ({ testRuns, isLoading, fetchError, canTestAgent, linkCrumbs }) => {
  const { t } = useTranslation();
  const { notStarted } = useEmptyValues();

  const tableControls = useLocalTableControls({
    tableName: "agent-test-runs-table",
    idProperty: "id",
    items: testRuns,
    columnNames: {
      application: t("terms.application"),
      task: t("terms.task"),
      status: t("terms.status"),
      started: t("terms.started"),
    },
    isSortEnabled: true,
    sortableColumns: ["started"],
    initialSort: { columnKey: "started", direction: "desc" },
    getSortValues: (run) => ({
      started: startedSortValue(run.phase, run.startedAt),
    }),
    isPaginationEnabled: true,
    initialItemsPerPage: 10,
    isLoading,
  });
  const {
    currentPageItems,
    numRenderedColumns,
    propHelpers: {
      paginationProps,
      tableProps,
      getThProps,
      getTrProps,
      getTdProps,
    },
  } = tableControls;

  const isKnown = !isLoading && fetchError == null;
  return (
    <DetailSection
      title={
        isKnown && testRuns.length > 0
          ? t("agentic.agentDetail.testRunsTitleCount", {
              count: testRuns.length,
            })
          : t("agentic.agentDetail.testRunsTitle")
      }
      description={t("agentic.agentDetail.testRunsDescription")}
    >
      {isKnown && testRuns.length === 0 ? (
        <SectionEmpty>
          {canTestAgent
            ? t("agentic.agentDetail.testRunsEmpty")
            : t("agentic.agentDetail.testRunsEmptyReadOnly")}
        </SectionEmpty>
      ) : (
        <>
          <Table
            {...tableProps}
            variant="compact"
            aria-label={t("agentic.agentDetail.testRunsTitle")}
          >
            <Thead>
              <Tr>
                <TableHeaderContentWithControls {...tableControls}>
                  <Th
                    {...getThProps({ columnKey: "application" })}
                    width={20}
                  />
                  <Th {...getThProps({ columnKey: "task" })} />
                  <Th
                    {...getThProps({ columnKey: "status" })}
                    modifier="fitContent"
                  />
                  <Th
                    {...getThProps({ columnKey: "started" })}
                    modifier="fitContent"
                  />
                </TableHeaderContentWithControls>
              </Tr>
            </Thead>
            <ConditionalTableBody
              isLoading={isLoading}
              isError={fetchError != null}
              numRenderedColumns={numRenderedColumns}
            >
              <Tbody>
                {currentPageItems.map((run, rowIndex) => (
                  <Tr key={run.id} {...getTrProps({ item: run })}>
                    <TableRowContentWithControls
                      {...tableControls}
                      item={run}
                      rowIndex={rowIndex}
                    >
                      <Td {...getTdProps({ columnKey: "application" })}>
                        <Link
                          to={breadcrumbTo(
                            generatePath(DevPaths.applicationDetails, {
                              applicationId: String(run.application.id),
                            }),
                            "",
                            linkCrumbs
                          )}
                        >
                          {run.application.name}
                        </Link>
                      </Td>
                      <Td
                        modifier="truncate"
                        tooltip={run.task}
                        {...getTdProps({ columnKey: "task" })}
                      >
                        {run.task}
                      </Td>
                      <Td
                        modifier="nowrap"
                        {...getTdProps({ columnKey: "status" })}
                      >
                        <RunStatus status={run.phase} />
                      </Td>
                      <Td
                        modifier="nowrap"
                        {...getTdProps({ columnKey: "started" })}
                      >
                        {run.phase === "Pending"
                          ? notStarted
                          : formatTableDate(new Date(run.startedAt))}
                      </Td>
                    </TableRowContentWithControls>
                  </Tr>
                ))}
              </Tbody>
            </ConditionalTableBody>
          </Table>
          {testRuns.length > 10 && (
            <SimplePagination
              idPrefix="agent-test-runs-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          )}
        </>
      )}
    </DetailSection>
  );
};

export interface AgentRunsTabProps {
  agentId: EntityId;
  planRuns: PlanRun[];
  isLoadingPlanRuns: boolean;
  planRunsError: unknown;
  testRuns: AgentTestRun[];
  isLoadingTestRuns: boolean;
  testRunsError: unknown;
  /** With the agent run scope: the empty test runs say how to start one (A3). */
  canTestAgent: boolean;
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The Runs tab (7.2, agents amendments 2 and 4): the stages this agent
 * runs in plan runs, and its test runs, as two sections. No toolbar; each
 * table paginates only above 10 rows (A4).
 */
export const AgentRunsTab: React.FC<AgentRunsTabProps> = ({
  agentId,
  planRuns,
  isLoadingPlanRuns,
  planRunsError,
  testRuns,
  isLoadingTestRuns,
  testRunsError,
  canTestAgent,
  linkCrumbs,
}) => (
  <DetailSections>
    <StageRunsSection
      agentId={agentId}
      planRuns={planRuns}
      isLoading={isLoadingPlanRuns}
      fetchError={planRunsError}
      linkCrumbs={linkCrumbs}
    />
    <TestRunsSection
      testRuns={testRuns}
      isLoading={isLoadingTestRuns}
      fetchError={testRunsError}
      canTestAgent={canTestAgent}
      linkCrumbs={linkCrumbs}
    />
  </DetailSections>
);
