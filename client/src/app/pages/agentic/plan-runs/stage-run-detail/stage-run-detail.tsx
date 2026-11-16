import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import {
  Card,
  CardBody,
  CardTitle,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  LabelGroup,
  PageSection,
  Title,
} from "@patternfly/react-core";

import { DevPaths, StageRunDetailsRoute } from "@app/Paths";
import { getStageDefinition } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useApproveStageMutation,
  useFetchAgentById,
  useFetchPlanRun,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { RunStatus } from "../../components/agentic-status";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import { StageAttentionAlert } from "../../components/stage-attention-alert";
import { StageRunContent } from "../components/stage-run-content";

const StageRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId, stageId } = useParams<StageRunDetailsRoute>();
  const { pushNotification } = React.useContext(NotificationsContext);

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);

  // The stage definition comes from the run's snapshot, not the current Plan.
  const stageRun = planRun?.stageRuns.find((sr) => sr.stageId === stageId);
  const stage = stageRun ? getStageDefinition(stageRun) : undefined;

  const { agent } = useFetchAgentById(stage?.agent.id);

  const onApproveError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };

  const { mutateAsync: approveStage, isPending: isApproving } =
    useApproveStageMutation(
      () =>
        pushNotification({
          title: t("agentic.planRun.stageApproved", {
            stage: stage?.name ?? "",
          }),
          variant: "success",
        }),
      onApproveError
    );

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

  const title = t("agentic.stageRun.title", {
    stage: stage.name,
    run: planRun.name,
  });

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader title={title} breadcrumbs={breadcrumbs} />
      </PageSection>

      <StageAttentionAlert
        surface="stage"
        planRun={planRun}
        stageRun={stageRun}
        onApprove={
          canManageRun
            ? () =>
                approveStage({
                  runId: planRun.id,
                  stageId: stageRun.stageId,
                })
            : undefined
        }
        isDeciding={isApproving}
        onRunMigrationPlan={runMigrationPlan.open}
        wrapper={(alert) => (
          <PageSection hasBodyWrapper={false}>{alert}</PageSection>
        )}
      />

      {/* Metadata */}
      <PageSection hasBodyWrapper={false}>
        <Card>
          <CardBody>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.stageRun.plan")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <Link
                    to={breadcrumbTo(
                      DevPaths.migrationPlanDetails.replace(
                        ":planId",
                        planRun.planId.toString()
                      ),
                      `?from=run-${runId}`,
                      stageChildCrumbs
                    )}
                  >
                    {planRun.planName}
                  </Link>
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.stageRun.stage")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {stage.name}
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.stageRun.agent")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <Link
                    to={breadcrumbTo(
                      DevPaths.agentDetails.replace(
                        ":agentId",
                        stage.agent.id.toString()
                      ),
                      `?from=run-${runId}`,
                      stageChildCrumbs
                    )}
                  >
                    {stage.agent.name}
                  </Link>
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.planRun.status")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <RunStatus status={stageRun.status} />
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.stageRun.applications")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <LabelGroup numLabels={5}>
                    {planRun.applications.map((app) => (
                      <Label key={app.id} isCompact>
                        <Link
                          to={breadcrumbTo(
                            DevPaths.applicationDetails.replace(
                              ":applicationId",
                              String(app.id)
                            ),
                            "",
                            stageChildCrumbs
                          )}
                        >
                          {app.name}
                        </Link>
                      </Label>
                    ))}
                  </LabelGroup>
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.planRun.targetBranch")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <Label isCompact color="blue">
                    {planRun.targetBranch}
                  </Label>
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.planRun.started")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {stageRun.startedAt
                    ? new Date(stageRun.startedAt).toLocaleString()
                    : "—"}
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.planRun.completed")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {stageRun.completedAt
                    ? new Date(stageRun.completedAt).toLocaleString()
                    : "—"}
                </DescriptionListDescription>
              </DescriptionListGroup>

              {stageRun.approvedAt && (
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {t("agentic.stageRun.approvedAt")}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    {new Date(stageRun.approvedAt).toLocaleString()}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}

              {stageRun.output && (
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    {t("agentic.stageRun.output")}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <Content component="pre">{stageRun.output}</Content>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>
          </CardBody>
        </Card>
      </PageSection>

      {/* Activities and commits */}
      {stageRun.status !== "Pending" && (
        <PageSection hasBodyWrapper={false}>
          <Card>
            <CardBody>
              <StageRunContent
                status={stageRun.status}
                messages={stageRun.messages ?? []}
                commits={stageRun.commits ?? []}
              />
            </CardBody>
          </Card>
        </PageSection>
      )}

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
