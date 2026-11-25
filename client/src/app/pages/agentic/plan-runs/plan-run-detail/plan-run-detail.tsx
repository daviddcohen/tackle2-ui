import * as React from "react";
import { LocationDescriptor } from "history";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import { Button, List, ListItem, PageSection } from "@patternfly/react-core";
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
import { targetProfilePath } from "@app/pages/agentic/entity-paths";
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
  MAX_LABELS,
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

/**
 * The run's applications, each with the target profile it ran on
 * (`PlanRun.targetProfiles`): "Claims Processing (Quarkus 3.x)", the
 * profile linked to its archetype's target profiles page when the
 * archetype is known. An application the run does not report a profile
 * for is its link alone.
 */
const ApplicationsOnProfiles: React.FC<{
  planRun: PlanRun;
  targetProfiles: NonNullable<PlanRun["targetProfiles"]>;
  applicationTo: (applicationId: number) => LocationDescriptor;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ planRun, targetProfiles, applicationTo, linkTo }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const byApplication = new Map(
    targetProfiles.map((entry) => [entry.application.id, entry])
  );
  // The first few, then "{n} more", like the labels of other set facts.
  const hidden = planRun.applications.length - MAX_LABELS;
  const shown =
    isExpanded || hidden <= 0
      ? planRun.applications
      : planRun.applications.slice(0, MAX_LABELS);
  return (
    <List isPlain>
      {shown.map((application) => {
        const applicationLink = (
          <Link to={applicationTo(application.id)}>{application.name}</Link>
        );
        const entry = byApplication.get(application.id);
        const { targetProfile, archetype } = entry ?? {};
        return (
          <ListItem key={application.id}>
            {entry == null ? (
              applicationLink
            ) : targetProfile == null ? (
              <Trans
                i18nKey="agentic.planRun.applicationNoProfile"
                values={{ application: application.name }}
                components={{ applicationLink }}
              />
            ) : (
              <Trans
                i18nKey="agentic.planRun.applicationOnProfile"
                values={{
                  application: application.name,
                  profile: targetProfile.name,
                }}
                components={{
                  applicationLink,
                  profileLink:
                    archetype != null ? (
                      <Link
                        to={linkTo(
                          targetProfilePath(archetype.id, targetProfile.id)
                        )}
                      />
                    ) : (
                      <span />
                    ),
                }}
              />
            )}
          </ListItem>
        );
      })}
      {hidden > 0 && (
        <ListItem>
          <Button
            variant="link"
            isInline
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded
              ? t("terms.showLess")
              : t("terms.moreCount", { count: hidden })}
          </Button>
        </ListItem>
      )}
    </List>
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

  // The run's own exclusions: a fact, and the label of their rows. Every
  // other excluded row of the snapshot is the plan's.
  const runExcluded = planRun?.excludedSkills ?? [];
  const runExcludedIds = new Set(runExcluded.map((skill) => skill.id));

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
  const applicationLink = (applicationId: number) =>
    runLink(
      generatePath(DevPaths.applicationDetails, {
        applicationId: String(applicationId),
      })
    );
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
      planRun.applications.length === 0 ? (
        <EmptyTextMessage message={t("terms.none")} />
      ) : planRun.targetProfiles != null ? (
        <ApplicationsOnProfiles
          key="applications"
          planRun={planRun}
          targetProfiles={planRun.targetProfiles}
          applicationTo={applicationLink}
          linkTo={(pathname) => runLink(pathname)}
        />
      ) : (
        <LinkLabels
          items={planRun.applications.map((application) => ({
            id: application.id,
            name: application.name,
            to: applicationLink(application.id),
          }))}
        />
      ),
    ],
    [
      t("agentic.planRun.targetBranch"),
      <span key="branch" className={textStyles.fontFamilyMonospace}>
        {planRun.targetBranch}
      </span>,
    ],
    // Only with a snapshot: without one the server does not say what the
    // run left out (Skills by stage reads "Unavailable").
    ...(planRun.skills != null
      ? [
          [
            t("agentic.runSkills.excludedForRun"),
            runExcluded.length > 0 ? (
              <LinkLabels
                key="excluded"
                items={runExcluded.map((skill) => ({
                  id: skill.id,
                  name: skill.name,
                  to: runLink(
                    generatePath(DevPaths.skillDetails, {
                      skillId: skill.id,
                    }),
                    `?from=run-${runId}`
                  ),
                }))}
              />
            ) : (
              <EmptyTextMessage key="excluded" message={t("terms.none")} />
            ),
          ] as [string, React.ReactNode],
        ]
      : []),
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
            // Who left each excluded row out: the run, or its plan.
            excludedLabel={({ skill }) => ({
              text: runExcludedIds.has(skill.id)
                ? t("agentic.runSkills.excludedForRun")
                : t("agentic.runSkills.excludedByPlan"),
            })}
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
