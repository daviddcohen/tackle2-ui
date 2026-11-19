import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Content } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  ApplicationMigrationStageExecution,
  EntityId,
  StageAgentRun,
  StageRun,
  isTerminalRunPhase,
} from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { formatDuration, stageRunDurationSeconds } from "@app/utils/agentic";
import { formatTableDate } from "@app/utils/utils";

import { ContextUsageCell } from "./agent-run/context-usage";
import { RunStatus } from "./agentic-status";

/** The agent runs behind the stages, for the Context column. */
export interface StageAgentRunsState {
  agentRuns: StageAgentRun[];
  isLoading: boolean;
  /** The agent runs could not be read. */
  isUnavailable: boolean;
}

interface PlanRunStagesProps {
  /** The run's stage snapshot; rendered in stage order. */
  stageRuns: StageRun[];
  runId: EntityId;
  /** Builds a link with the caller's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  /** `?from=` origin added to the agent links (stages are children of the run). */
  origin?: string;
  /** The stages' agent runs: with them, the table adds the Context column. */
  agentRuns?: StageAgentRunsState;
  stages?: never;
}

interface ApplicationStagesProps {
  /**
   * An application's stage executions. They carry no stage id or agent, so
   * stage names are text, never links by name.
   */
  stages: ApplicationMigrationStageExecution[];
  stageRuns?: never;
}

export type StageRunsTableProps = PlanRunStagesProps | ApplicationStagesProps;

/**
 * The one stages table of a run. On a plan run:
 * # · Stage (link to the stage page) · Agent · Status · Started · Duration,
 * and Context when the caller passes the agent runs.
 * On an application's Migration tab: # · Stage (with the server's `summary`
 * as a subtle line) · Status · Completed.
 */
export const StageRunsTable: React.FC<StageRunsTableProps> = (props) => {
  const { t } = useTranslation();
  const notStarted = <EmptyTextMessage message={t("terms.notStarted")} />;
  // A value that cannot be derived is unknown, never "Not available" (4.11).
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );
  // A stage still going whose clock cannot be read yet has not finished.
  const notFinished = (
    <EmptyTextMessage message={t("agentic.stageRunsTable.notFinished")} />
  );
  const columns = {
    order: t("agentic.stageRunsTable.order"),
    stage: t("agentic.entity.stage"),
    agent: t("agentic.entity.agent"),
    status: t("terms.status"),
    started: t("terms.started"),
    duration: t("agentic.stageRunsTable.duration"),
    context: t("agentic.planRun.context"),
    completed: t("terms.completed"),
  };

  if (props.stages != null) {
    return (
      <Table aria-label={t("agentic.stageRunsTable.label")} variant="compact">
        <Thead>
          <Tr>
            <Th modifier="fitContent">{columns.order}</Th>
            <Th>{columns.stage}</Th>
            <Th modifier="fitContent">{columns.status}</Th>
            <Th modifier="fitContent">{columns.completed}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {props.stages.map((stage, index) => (
            <Tr key={`${index}-${stage.stageName}`}>
              <Td dataLabel={columns.order}>{index + 1}</Td>
              <Td dataLabel={columns.stage}>
                {stage.stageName}
                {stage.summary && (
                  <Content
                    component="small"
                    className={textStyles.textColorSubtle}
                  >
                    {stage.summary}
                  </Content>
                )}
              </Td>
              <Td dataLabel={columns.status} modifier="nowrap">
                <RunStatus status={stage.phase} />
              </Td>
              <Td dataLabel={columns.completed} modifier="nowrap">
                {stage.completedAt
                  ? formatTableDate(new Date(stage.completedAt))
                  : stage.phase === "Pending"
                    ? notStarted
                    : stage.phase === "Running" ||
                        stage.phase === "AwaitingApproval"
                      ? notFinished
                      : unavailable}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    );
  }

  const { stageRuns, runId, linkTo, origin = "", agentRuns } = props;
  return (
    <Table aria-label={t("agentic.stageRunsTable.label")} variant="compact">
      <Thead>
        <Tr>
          <Th modifier="fitContent">{columns.order}</Th>
          <Th width={25}>{columns.stage}</Th>
          <Th width={25}>{columns.agent}</Th>
          <Th modifier="fitContent">{columns.status}</Th>
          <Th modifier="fitContent">{columns.started}</Th>
          <Th modifier="fitContent">{columns.duration}</Th>
          {agentRuns != null && (
            <Th
              width={15}
              modifier="nowrap"
              info={{
                popover: t("agentic.planRun.contextHelp"),
                ariaLabel: t("agentic.planRun.contextHelpLabel"),
                popoverProps: {
                  "aria-label": t("agentic.agentRun.context.title"),
                  closeBtnAriaLabel: t("actions.close"),
                },
              }}
            >
              {columns.context}
            </Th>
          )}
        </Tr>
      </Thead>
      <Tbody>
        {[...stageRuns]
          .sort((a, b) => a.order - b.order)
          .map((stageRun) => {
            const duration = stageRunDurationSeconds(stageRun);
            const agentRun = agentRuns?.agentRuns.find(
              (candidate) => candidate.stageId === stageRun.stageId
            );
            return (
              <Tr key={stageRun.stageId}>
                <Td dataLabel={columns.order}>{stageRun.order}</Td>
                <Td dataLabel={columns.stage}>
                  <Link
                    to={linkTo(
                      generatePath(DevPaths.stageRunDetails, {
                        runId,
                        stageId: stageRun.stageId,
                      })
                    )}
                  >
                    {stageRun.name}
                  </Link>
                </Td>
                <Td dataLabel={columns.agent}>
                  <Link
                    to={linkTo(
                      generatePath(DevPaths.agentDetails, {
                        agentId: stageRun.agent.id,
                      }),
                      origin
                    )}
                  >
                    {stageRun.agent.name}
                  </Link>
                </Td>
                <Td dataLabel={columns.status} modifier="nowrap">
                  <RunStatus status={stageRun.status} />
                </Td>
                <Td dataLabel={columns.started} modifier="nowrap">
                  {stageRun.startedAt
                    ? formatTableDate(new Date(stageRun.startedAt))
                    : notStarted}
                </Td>
                <Td dataLabel={columns.duration} modifier="nowrap">
                  {duration != null
                    ? formatDuration(duration)
                    : stageRun.status === "Pending"
                      ? notStarted
                      : isTerminalRunPhase(stageRun.status)
                        ? unavailable
                        : notFinished}
                </Td>
                {agentRuns != null && (
                  // One line, like Started: the cell turns from "Not
                  // reported yet" into a bar without changing the row height.
                  <Td dataLabel={columns.context} modifier="nowrap">
                    <ContextUsageCell
                      stageName={stageRun.name}
                      phase={stageRun.status}
                      usage={agentRun?.usage}
                      isLoading={agentRuns.isLoading}
                      isUnavailable={agentRuns.isUnavailable}
                    />
                  </Td>
                )}
              </Tr>
            );
          })}
      </Tbody>
    </Table>
  );
};
