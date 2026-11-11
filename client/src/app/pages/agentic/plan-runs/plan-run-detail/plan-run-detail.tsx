import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Card,
  CardBody,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  PageSection,
  ProgressStep,
  ProgressStepper,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";

import { DevPaths, PlanRunDetailsRoute } from "@app/Paths";
import {
  ControllerRunPhase,
  StageRun,
  getOrderedStageRuns,
  getStageDefinition,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useApproveStageMutation, useFetchPlanRun } from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { RunStatus } from "../../components/agentic-status";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import { SkillsTable, groupSkillSources } from "../../components/skills-table";
import { StageAttentionAlert } from "../../components/stage-attention-alert";

import { StageRunSection } from "./components/stage-run-section";

const phaseVariant = (
  phase: ControllerRunPhase
): "success" | "info" | "pending" | "danger" | "warning" => {
  switch (phase) {
    case "Succeeded":
      return "success";
    case "Running":
      return "info";
    case "Failed":
      return "danger";
    case "AwaitingApproval":
      return "warning";
    default:
      return "pending";
  }
};

const PlanRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId } = useParams<PlanRunDetailsRoute>();
  const { pushNotification } = React.useContext(NotificationsContext);

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);
  // Stages render from the run's own snapshot, never from the current Plan.
  const stageRuns = planRun ? getOrderedStageRuns(planRun) : [];
  // The run's snapshot of skills: render what the server returns, never more.
  const skillRows = groupSkillSources(planRun?.resolvedSkills ?? []);

  const onApproveError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };

  const { mutateAsync: approveStage, isPending: isApproving } =
    useApproveStageMutation(() => undefined, onApproveError);
  const approve = (stageRun: StageRun) =>
    approveStage({ runId: runId, stageId: stageRun.stageId }).then(() =>
      pushNotification({
        title: t("agentic.planRun.stageApproved", { stage: stageRun.name }),
        variant: "success",
      })
    );

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

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={planRun.name}
          breadcrumbs={breadcrumbs}
          btnActions={<RunStatus status={planRun.status} />}
        />
      </PageSection>

      <StageAttentionAlert
        surface="run"
        planRun={planRun}
        reviewStageTo={(stageRun) =>
          breadcrumbTo(
            generatePath(DevPaths.stageRunDetails, {
              runId: planRun.id,
              stageId: stageRun.stageId,
            }),
            "",
            runChildCrumbs
          )
        }
        onApprove={canManageRun ? approve : undefined}
        isDeciding={isApproving}
        onRunMigrationPlan={runMigrationPlan.open}
        wrapper={(alert) => (
          <PageSection hasBodyWrapper={false}>{alert}</PageSection>
        )}
      />

      {/* Summary card */}
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
                      runChildCrumbs
                    )}
                  >
                    {planRun.planName}
                  </Link>
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.planRun.applications")}
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
                            runChildCrumbs
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
                  {new Date(planRun.startedAt).toLocaleString()}
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.planRun.completed")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {planRun.completedAt
                    ? new Date(planRun.completedAt).toLocaleString()
                    : "—"}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      </PageSection>

      {/* Progress and stages */}
      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          <StackItem>
            <Title headingLevel="h2" size="md">
              {t("agentic.planRun.stages")}
            </Title>
          </StackItem>

          {stageRuns.length > 0 && (
            <StackItem>
              <ProgressStepper aria-label={t("agentic.planRun.stages")}>
                {stageRuns.map((stageRun) => (
                  <ProgressStep
                    key={stageRun.stageId}
                    variant={phaseVariant(stageRun.status)}
                    id={`stage-${stageRun.stageId}`}
                    titleId={`stage-title-${stageRun.stageId}`}
                  >
                    {stageRun.name}
                  </ProgressStep>
                ))}
              </ProgressStepper>
            </StackItem>
          )}

          <StackItem>
            <Divider />
          </StackItem>

          {stageRuns.map((stageRun) => (
            <StackItem key={stageRun.stageId}>
              <StageRunSection
                stage={getStageDefinition(stageRun)}
                stageRun={stageRun}
                runId={planRun.id}
                runChildCrumbs={runChildCrumbs}
              />
            </StackItem>
          ))}
        </Stack>
      </PageSection>

      {skillRows.length > 0 && (
        <PageSection hasBodyWrapper={false}>
          <Stack hasGutter>
            <StackItem>
              <Title headingLevel="h2" size="md">
                {t("agentic.skillsTable.title", { count: skillRows.length })}
              </Title>
              <Content component="p">
                {t("agentic.skillsTable.runDescription")}
              </Content>
            </StackItem>
            <StackItem>
              <SkillsTable
                rows={skillRows}
                linkTo={(pathname) =>
                  breadcrumbTo(pathname, `?from=run-${runId}`, runChildCrumbs)
                }
              />
            </StackItem>
          </Stack>
        </PageSection>
      )}

      {/* Save lessons learned — placeholder */}
      {planRun.status === "Succeeded" && (
        <PageSection hasBodyWrapper={false}>
          <Flex>
            <FlexItem>
              <Button
                variant={ButtonVariant.secondary}
                isDisabled
                aria-disabled
                title={t("agentic.planRun.saveLessonsLearnedTooltip")}
              >
                {t("agentic.planRun.saveLessonsLearned")}
              </Button>
            </FlexItem>
          </Flex>
        </PageSection>
      )}

      {runMigrationPlan.modal}
    </>
  );
};

export default PlanRunDetail;
