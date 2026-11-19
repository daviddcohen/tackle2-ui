import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import { PageSection } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths, PlanRunDetailsRoute } from "@app/Paths";
import { PlanRun, getOrderedStageRuns, isTerminalRunPhase } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchPlanRun } from "@app/queries/agentic";
import { useFetchPlanRunAgentRuns } from "@app/queries/agentic-observability";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import {
  formatDuration,
  getCurrentStage,
  planRunDurationSeconds,
} from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import {
  DetailFacts,
  DetailSection,
  LinkLabels,
  SectionEmpty,
} from "../../components/detail-section";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import {
  SkillsTable,
  groupSkillSources,
  skillRowCounts,
} from "../../components/skills-table";
import {
  StageAttentionAlert,
  getStageAttention,
} from "../../components/stage-attention-alert";
import { StageRunsTable } from "../../components/stage-runs-table";
import { RunPageBody, RunStatusLine } from "../components/run-page-layout";
import { useApproveStage } from "../components/use-approve-stage";

/**
 * Where the run is: a pending run waits for its
 * first stage, a succeeded one says when it started and completed, any
 * other names its current stage and its start. A pending run's `startedAt`
 * is not a start (docs/agentic-handoff.md), so it is not shown.
 */
const PlanRunStatusLine: React.FC<{ planRun: PlanRun }> = ({ planRun }) => {
  const { t } = useTranslation();
  const started = formatDate(new Date(planRun.startedAt));
  if (planRun.status === "Pending") {
    const first = getOrderedStageRuns(planRun)[0];
    return (
      <RunStatusLine status={planRun.status}>
        {first != null
          ? t("agentic.planRun.waitingToStart", { stage: first.name })
          : undefined}
      </RunStatusLine>
    );
  }
  if (planRun.status === "Succeeded" && planRun.completedAt) {
    return (
      <RunStatusLine status={planRun.status}>
        {t("agentic.planRun.startedAndCompleted", {
          started,
          completed: formatDate(new Date(planRun.completedAt)),
        })}
      </RunStatusLine>
    );
  }
  const current = getCurrentStage(planRun);
  return (
    <RunStatusLine status={planRun.status}>
      {current != null
        ? t("agentic.planRun.stageAndStarted", {
            stage: t("agentic.common.stagePosition", {
              position: current.position,
              total: current.total,
              stage: current.stageRun.name,
            }),
            started,
          })
        : t("agentic.planRun.startedAt", { started })}
    </RunStatusLine>
  );
};

const PlanRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId } = useParams<PlanRunDetailsRoute>();

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);
  const {
    agentRuns,
    isLoading: isLoadingAgentRuns,
    fetchError: agentRunsError,
  } = useFetchPlanRunAgentRuns(runId, planRun?.status);
  // The run's snapshot of skills: render what the server returns, never
  // more. Undefined is unknown, not "no skills". Skills the
  // plan excluded stay in the table, marked.
  const skillRows =
    planRun?.resolvedSkills != null
      ? groupSkillSources(planRun.resolvedSkills, planRun.excludedSkills)
      : undefined;
  const { used: usedSkillCount, total: skillCount } = skillRowCounts(skillRows);

  const { approve, isApproving } = useApproveStage(runId);

  const { breadcrumbs, linkCrumbs: runChildCrumbs } = useEntityBreadcrumbs(
    planRun?.name ?? t("agentic.entity.planRun"),
    [{ title: t("sidebar.planRuns"), path: DevPaths.planRuns }]
  );

  const runMigrationPlan = useRunMigrationPlanLauncher({
    rerunOf: planRun,
    linkCrumbs: runChildCrumbs,
  });

  if (!planRun) {
    if (isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound || fetchError == null}
        notFoundTitle={t("agentic.planRun.notFoundTitle")}
        notFoundBody={t("agentic.planRun.notFoundBody")}
        backLabel={t("agentic.planRun.backToPlanRuns")}
        backPath={DevPaths.planRuns}
      />
    );
  }

  const duration = planRunDurationSeconds(planRun);
  const commitCount = planRun.stageRuns.reduce(
    (count, stageRun) => count + (stageRun.commits?.length ?? 0),
    0
  );
  const runLink = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, runChildCrumbs);
  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.entity.migrationPlan"),
      <Link
        key="plan"
        to={runLink(
          generatePath(DevPaths.migrationPlanDetails, {
            planId: planRun.planId,
          }),
          `?from=run-${runId}`
        )}
      >
        {planRun.planName}
      </Link>,
    ],
    [
      t("agentic.planRun.applications"),
      planRun.applications.length > 0 ? (
        <LinkLabels
          items={planRun.applications.map((application) => ({
            id: application.id,
            name: application.name,
            to: runLink(
              generatePath(DevPaths.applicationDetails, {
                applicationId: String(application.id),
              })
            ),
          }))}
        />
      ) : (
        <EmptyTextMessage message={t("terms.none")} />
      ),
    ],
    [
      t("agentic.planRun.targetBranch"),
      <span key="branch" className={textStyles.fontFamilyMonospace}>
        {planRun.targetBranch}
      </span>,
    ],
    [
      t("agentic.planRun.duration"),
      duration != null ? (
        formatDuration(duration)
      ) : (
        <EmptyTextMessage
          message={
            planRun.status === "Pending"
              ? t("terms.notStarted")
              : isTerminalRunPhase(planRun.status)
                ? t("agentic.common.unavailable")
                : t("agentic.stageRunsTable.notFinished")
          }
        />
      ),
    ],
    [
      t("agentic.planRun.commits"),
      commitCount > 0 ? (
        commitCount
      ) : (
        <EmptyTextMessage message={t("terms.none")} />
      ),
    ],
  ];

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={planRun.name}
          breadcrumbs={breadcrumbs}
          description={<PlanRunStatusLine planRun={planRun} />}
        />
      </PageSection>

      <RunPageBody>
        {getStageAttention(planRun) != null && (
          <StageAttentionAlert
            surface="run"
            planRun={planRun}
            reviewStageTo={(stageRun) =>
              runLink(
                generatePath(DevPaths.stageRunDetails, {
                  runId: planRun.id,
                  stageId: stageRun.stageId,
                }),
                // A failure is read in the saved log.
                stageRun.status === "Failed" ? "?tab=logs" : ""
              )
            }
            onApprove={canManageRun ? approve : undefined}
            isDeciding={isApproving}
            onRunMigrationPlan={runMigrationPlan.open}
          />
        )}

        <DetailFacts facts={facts} isTwoColumn />

        <DetailSection title={t("agentic.planRun.stages")}>
          <StageRunsTable
            stageRuns={planRun.stageRuns}
            runId={planRun.id}
            linkTo={runLink}
            origin={`?from=run-${runId}`}
            agentRuns={{
              agentRuns,
              isLoading: isLoadingAgentRuns,
              isUnavailable: agentRunsError != null && agentRuns.length === 0,
            }}
          />
        </DetailSection>

        <DetailSection
          title={
            !skillRows?.length
              ? t("agentic.planRun.skillsTitleEmpty")
              : usedSkillCount < skillCount
                ? t("agentic.planRun.skillsTitleUsed", {
                    used: usedSkillCount,
                    count: skillCount,
                  })
                : t("agentic.planRun.skillsTitle", { count: skillCount })
          }
          description={
            !skillRows?.length
              ? undefined
              : usedSkillCount < skillCount
                ? t("agentic.planRun.skillsDescriptionExcluded")
                : t("agentic.planRun.skillsDescription")
          }
        >
          {skillRows == null ? (
            <EmptyTextMessage message={t("agentic.common.unavailable")} />
          ) : skillRows.length > 0 ? (
            <SkillsTable
              rows={skillRows}
              linkTo={(pathname) => runLink(pathname, `?from=run-${runId}`)}
            />
          ) : (
            <SectionEmpty>{t("agentic.planRun.skillsEmpty")}</SectionEmpty>
          )}
        </DetailSection>
      </RunPageBody>

      {runMigrationPlan.modal}
    </>
  );
};

export default PlanRunDetail;
