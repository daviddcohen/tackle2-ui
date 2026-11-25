import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import { Content, PageSection } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths, PlanRunDetailsRoute } from "@app/Paths";
import {
  PlanRun,
  getOrderedStageRuns,
  isTerminalRunPhase,
  stageAgentRunsOf,
  stageAttentionApplications,
} from "@app/agentic";
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
} from "../../components/detail-section";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import { searchWithFrom } from "../../components/skill-origin";
import {
  StageAttentionAlert,
  getStageAttention,
} from "../../components/stage-attention-alert";
import { StageRunsTable } from "../../components/stage-runs-table";
import {
  EVERY_STAGE_COLLAPSE_AFTER,
  StageSkillsTable,
} from "../../components/stage-skills-table";
import { RunPageBody, RunStatusLine } from "../components/run-page-layout";
import { useApproveStage } from "../components/use-approve-stage";
import { APPLICATION_PARAM } from "../components/use-selected-application";

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

  const { approve, isApproving } = useApproveStage(runId);

  const { breadcrumbs, linkCrumbs: runChildCrumbs } = useEntityBreadcrumbs(
    planRun?.name ?? t("agentic.entity.planRun"),
    [{ title: t("sidebar.planRuns"), path: DevPaths.planRuns }]
  );

  // The run's own exclusions, said apart from the plan's: "in addition"
  // only when the snapshot also excludes a skill the run did not.
  const runExcluded = planRun?.excludedSkills ?? [];
  const runExcludedIds = new Set(runExcluded.map((skill) => skill.id));
  const isPlanExcluding =
    planRun?.skills != null &&
    [...planRun.skills.stages, ...planRun.skills.everyStage].some((group) =>
      group.skills.some(
        ({ skill, excluded }) => excluded && !runExcludedIds.has(skill.id)
      )
    );
  const runExclusionsText =
    planRun?.skills != null && runExcluded.length > 0
      ? t(
          isPlanExcluding
            ? "agentic.runSkills.runExcluded"
            : "agentic.runSkills.runExcludedOnly",
          { skills: runExcluded.map((skill) => skill.name) }
        )
      : undefined;

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
  // In a run on several applications, the applications whose agent run
  // waits or failed at the stage that needs attention: the alert names the
  // one and "Review stage" opens its agent run.
  const attentionStage = getStageAttention(planRun);
  const attentionApplications =
    planRun.applications.length > 1 &&
    attentionStage != null &&
    attentionStage.kind !== "pending" &&
    attentionStage.stageRun != null
      ? stageAttentionApplications(
          stageAgentRunsOf(agentRuns, attentionStage.stageRun.stageId),
          attentionStage.stageRun.status,
          planRun.applications
        )
      : [];
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
        {attentionStage != null && (
          <StageAttentionAlert
            surface="run"
            planRun={planRun}
            applicationName={
              attentionApplications.length === 1
                ? attentionApplications[0].name
                : undefined
            }
            reviewStageTo={(stageRun) => {
              const search = new URLSearchParams();
              // A failure is read in the saved log.
              if (stageRun.status === "Failed") search.set("tab", "logs");
              if (attentionApplications.length > 0) {
                search.set(
                  APPLICATION_PARAM,
                  String(attentionApplications[0].id)
                );
              }
              const query = search.toString();
              return runLink(
                generatePath(DevPaths.stageRunDetails, {
                  runId: planRun.id,
                  stageId: stageRun.stageId,
                }),
                query !== "" ? `?${query}` : ""
              );
            }}
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
              applicationCount: planRun.applications.length,
            }}
          />
        </DetailSection>

        {/* The run's snapshot, rendered as given: undefined is not
            reported, never "no skills". */}
        <DetailSection
          title={t("agentic.stageSkills.title")}
          description={
            // Not reported: "Unavailable" and its reason say it all.
            planRun.skills == null
              ? undefined
              : planRun.applications.length > 1
                ? `${t("agentic.planRun.skillsByStageDescription")} ${t(
                    "agentic.stageSkills.everyStagePerApplication"
                  )}`
                : t("agentic.planRun.skillsByStageDescription")
          }
        >
          {/* What the run left out on its own; its rows carry the Excluded
              label like the plan's. */}
          {runExclusionsText != null && (
            <Content component="p">{runExclusionsText}</Content>
          )}
          <StageSkillsTable
            skills={planRun.skills}
            context="run"
            linkTo={(pathname, search) =>
              runLink(pathname, searchWithFrom(search, `run-${runId}`))
            }
            // Many applications: their Every stage groups start collapsed,
            // the stages stay open.
            defaultExpanded={
              planRun.applications.length > EVERY_STAGE_COLLAPSE_AFTER
                ? "stages"
                : "all"
            }
            unavailableText={t("agentic.planRun.skillsUnavailable")}
            aria-label={t("agentic.stageSkills.title")}
          />
        </DetailSection>
      </RunPageBody>

      {runMigrationPlan.modal}
    </>
  );
};

export default PlanRunDetail;
