import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import {
  Card,
  CardBody,
  CardTitle,
  Content,
  ExpandableSection,
  Label,
  LabelGroup,
  PageSection,
  Title,
} from "@patternfly/react-core";

import { DevPaths, StageRunDetailsRoute } from "@app/Paths";
import { getOrderedStageRuns, getStageDefinition } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchAgentById, useFetchPlanRun } from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { formatDuration, stageRunDurationSeconds } from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import {
  StageAttentionAlert,
  getStageAttention,
} from "../../components/stage-attention-alert";
import {
  RunPageBody,
  RunPageFacts,
  RunPageSection,
  RunStatusLine,
} from "../components/run-page-layout";
import { StageActivity, StageCommits } from "../components/stage-run-content";
import { useApproveStage } from "../components/use-approve-stage";

const StageRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId, stageId } = useParams<StageRunDetailsRoute>();

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);

  // The stage definition comes from the run's snapshot, not the current Plan.
  const stageRun = planRun?.stageRuns.find((sr) => sr.stageId === stageId);
  const stage = stageRun ? getStageDefinition(stageRun) : undefined;

  const { agent } = useFetchAgentById(stage?.agent.id);

  const { approve, isApproving } = useApproveStage(runId);

  // The run itself is missing (addenda R3): the page is the run's not found.
  const isRunMissing =
    planRun == null && !isLoading && (isNotFound || fetchError == null);
  const { breadcrumbs, linkCrumbs: stageChildCrumbs } = useEntityBreadcrumbs(
    isRunMissing
      ? t("agentic.entity.planRun")
      : (stage?.name ?? t("agentic.entity.stage")),
    [
      { title: t("sidebar.planRuns"), path: DevPaths.planRuns },
      // While the run loads or fails, its crumb is the noun (guide 3.5 rule 2).
      ...(isRunMissing
        ? []
        : [
            {
              title: planRun?.name ?? t("agentic.entity.planRun"),
              path: generatePath(DevPaths.planRunDetails, { runId }),
            },
          ]),
    ]
  );

  const runMigrationPlan = useRunMigrationPlanLauncher({
    rerunOf: planRun,
    linkCrumbs: stageChildCrumbs,
  });

  if (!planRun || !stageRun || !stage) {
    if (planRun == null && isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    if (planRun == null) {
      // A missing run is the run's not found; any other failure is the
      // error branch under the full trail (addenda X7).
      return (
        <EntityDetailUnavailable
          breadcrumbs={breadcrumbs}
          isNotFound={isRunMissing}
          notFoundTitle={t("agentic.planRun.notFoundTitle")}
          notFoundBody={t("agentic.planRun.notFoundBody")}
          backLabel={t("agentic.planRun.backToPlanRuns")}
          backPath={DevPaths.planRuns}
        />
      );
    }
    // A missing stage of a known run goes back to that run.
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound
        notFoundTitle={t("agentic.stageRun.notFoundTitle")}
        notFoundBody={t("agentic.stageRun.notFoundBody")}
        backLabel={t("agentic.stageRun.backToRun", { run: planRun.name })}
        backPath={generatePath(DevPaths.planRunDetails, { runId })}
      />
    );
  }

  const ordered = getOrderedStageRuns(planRun);
  const position = {
    position: ordered.findIndex((s) => s.stageId === stageRun.stageId) + 1,
    total: ordered.length,
    run: planRun.name,
  };
  const duration = stageRunDurationSeconds(stageRun);
  // The way back to the run, also on a trail that does not pass through it
  // (Agents > agent > stage, addenda R1).
  const runLink = (
    <Link
      to={breadcrumbTo(
        generatePath(DevPaths.planRunDetails, { runId: planRun.id }),
        "",
        stageChildCrumbs
      )}
    />
  );
  // The approval gate is still ahead of a gated stage until it succeeds; one
  // that succeeded without an approval record went on without one (for
  // example in an unattended run).
  const isGateAhead = stage.requiresApproval && stageRun.status !== "Succeeded";
  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.entity.agent"),
      <Link
        key="agent"
        to={breadcrumbTo(
          generatePath(DevPaths.agentDetails, { agentId: stage.agent.id }),
          `?from=run-${runId}`,
          stageChildCrumbs
        )}
      >
        {stage.agent.name}
      </Link>,
    ],
    [
      t("agentic.planRun.duration"),
      duration != null ? (
        formatDuration(duration)
      ) : (
        <EmptyTextMessage
          message={
            stageRun.status === "Pending"
              ? t("terms.notStarted")
              : t("agentic.common.unavailable")
          }
        />
      ),
    ],
    [
      t("agentic.stageRun.approval"),
      stage.requiresApproval && stageRun.approvedAt ? (
        t("agentic.stageRun.approvedOn", {
          date: formatDate(new Date(stageRun.approvedAt)),
        })
      ) : isGateAhead ? (
        t("agentic.stageRun.approvalRequired")
      ) : (
        <EmptyTextMessage message={t("agentic.stageRun.approvalNotRequired")} />
      ),
    ],
  ];
  // Instructions are prose: one paragraph per blank-line-separated block.
  const paragraphs = stage.instructions
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={stage.name}
          breadcrumbs={breadcrumbs}
          description={
            <RunStatusLine status={stageRun.status}>
              {stageRun.startedAt ? (
                <Trans
                  i18nKey="agentic.stageRun.statusLineStarted"
                  values={{
                    ...position,
                    started: formatDate(new Date(stageRun.startedAt)),
                  }}
                  components={{ runLink }}
                />
              ) : (
                <Trans
                  i18nKey="agentic.stageRun.statusLine"
                  values={position}
                  components={{ runLink }}
                />
              )}
            </RunStatusLine>
          }
        />
      </PageSection>

      <RunPageBody>
        {getStageAttention(planRun, stageRun) != null && (
          <StageAttentionAlert
            surface="stage"
            planRun={planRun}
            stageRun={stageRun}
            onApprove={canManageRun ? approve : undefined}
            isDeciding={isApproving}
            onRunMigrationPlan={runMigrationPlan.open}
          />
        )}

        <RunPageFacts facts={facts} />

        {paragraphs.length > 0 && (
          <RunPageSection title={t("agentic.stageRun.instructions")}>
            {/* Long instructions show their first lines (guide 4.11); the
                toggle appears only when the text is cut. */}
            <ExpandableSection
              variant="truncate"
              truncateMaxLines={8}
              toggleTextCollapsed={t("terms.showMore")}
              toggleTextExpanded={t("terms.showLess")}
            >
              <Content>
                {paragraphs.map((paragraph, index) => (
                  <Content component="p" key={index}>
                    {paragraph}
                  </Content>
                ))}
              </Content>
            </ExpandableSection>
          </RunPageSection>
        )}

        {/* A pending stage has done nothing yet; its alert says when it starts. */}
        {stageRun.status !== "Pending" && <StageActivity stageRun={stageRun} />}
        {stageRun.status !== "Pending" && <StageCommits stageRun={stageRun} />}
      </RunPageBody>

      {/* Agent skills */}
      {agent && agent.skills.length > 0 && (
        <PageSection hasBodyWrapper={false}>
          <Card>
            <CardTitle>
              <Title headingLevel="h2" size="md">
                {t("agentic.stageRun.agentSkills")}
              </Title>
            </CardTitle>
            <CardBody>
              <LabelGroup numLabels={10}>
                {agent.skills.map((skill) => (
                  <Label
                    key={skill.id}
                    isCompact
                    variant="outline"
                    render={({ className, content }) => (
                      <Link
                        className={className}
                        to={breadcrumbTo(
                          generatePath(DevPaths.skillDetails, {
                            skillId: String(skill.id),
                          }),
                          `?from=run-${runId}`,
                          stageChildCrumbs
                        )}
                      >
                        {content}
                      </Link>
                    )}
                  >
                    {skill.name}
                  </Label>
                ))}
              </LabelGroup>
            </CardBody>
          </Card>
        </PageSection>
      )}

      {runMigrationPlan.modal}
    </>
  );
};

export default StageRunDetail;
