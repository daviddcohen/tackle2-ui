import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import {
  EmptyState,
  EmptyStateBody,
  PageSection,
} from "@patternfly/react-core";

import { AgentTestRunDetailsRoute, DevPaths } from "@app/Paths";
import { testRunAgentRun } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchAgentTestRuns } from "@app/queries/agentic";
import { formatDate } from "@app/utils/utils";

import { AgentRunTranscript } from "../../components/agent-run/agent-run-transcript";
import { useFillHeight } from "../../components/agent-run/use-fill-height";
import { DetailFacts, LinkLabels } from "../../components/detail-section";
import { RunStatusLine } from "../../plan-runs/components/run-page-layout";

/**
 * The transcript reaches the bottom of the page (480 px at least), as on the
 * stage run page; it mounts once the height is known.
 */
const FullHeightView: React.FC<{
  children: (height: number) => React.ReactNode;
}> = ({ children }) => {
  const [ref, height] = useFillHeight<HTMLDivElement>();
  return <div ref={ref}>{height != null && children(height)}</div>;
};

/**
 * One agent test run, read only, in one view: its status, what it ran on,
 * then what the agent did. A test run is an AgentRun named by its id, so the
 * transcript reads it as the stage run page reads a stage's.
 */
const TestRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { agentId, runId } = useParams<AgentTestRunDetailsRoute>();
  const { agentTestRuns, isLoading, fetchError } =
    useFetchAgentTestRuns(agentId);
  const run = agentTestRuns.find((candidate) => candidate.id === runId);

  // The agent's Runs tab lists its test runs.
  const agentRunsPath = `${generatePath(DevPaths.agentDetails, { agentId })}?tab=runs`;
  const { breadcrumbs, linkCrumbs } = useEntityBreadcrumbs(
    run?.name ?? t("agentic.testRun.title"),
    [
      { title: t("sidebar.agents"), path: DevPaths.agents },
      // While the run loads or is missing, the agent is not named.
      ...(run != null ? [{ title: run.agent.name, path: agentRunsPath }] : []),
    ]
  );

  if (run == null) {
    if (isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={fetchError == null}
        notFoundTitle={t("agentic.testRun.notFoundTitle")}
        notFoundBody={t("agentic.testRun.notFoundBody")}
        backLabel={t("agentic.testRun.goToTestRuns")}
        backPath={agentRunsPath}
      />
    );
  }

  const isStarted = run.phase !== "Pending";
  const addedSkills = run.addedSkills ?? [];
  const facts: [string, React.ReactNode][] = [
    [
      t("terms.application"),
      run.application.id !== 0 ? (
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
      ) : (
        <EmptyTextMessage message={t("agentic.common.unavailable")} />
      ),
    ],
    [t("terms.task"), run.task],
    [
      t("agentic.agentDetail.addedSkills"),
      addedSkills.length > 0 ? (
        <LinkLabels
          items={addedSkills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            to: breadcrumbTo(
              generatePath(DevPaths.skillDetails, { skillId: skill.id }),
              "",
              linkCrumbs
            ),
          }))}
        />
      ) : (
        <EmptyTextMessage message={t("terms.none")} />
      ),
    ],
  ];

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={run.name}
          breadcrumbs={breadcrumbs}
          description={
            <RunStatusLine status={run.phase}>
              {isStarted && run.startedAt !== ""
                ? t("agentic.planRun.startedAt", {
                    started: formatDate(new Date(run.startedAt)),
                  })
                : undefined}
            </RunStatusLine>
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <DetailFacts facts={facts} />
      </PageSection>

      <PageSection hasBodyWrapper={false} isFilled>
        {isStarted ? (
          <FullHeightView>
            {(height) => (
              <AgentRunTranscript
                agentRun={testRunAgentRun(run)}
                agentName={run.agent.name}
                phase={run.phase}
                height={height}
              />
            )}
          </FullHeightView>
        ) : (
          <EmptyState variant="xs">
            <EmptyStateBody>
              {t("agentic.testRun.transcriptNotStarted")}
            </EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>
    </>
  );
};

export default TestRunDetail;
