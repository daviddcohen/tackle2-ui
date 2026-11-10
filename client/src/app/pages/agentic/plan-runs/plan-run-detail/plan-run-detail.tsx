import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  AlertVariant,
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
  getOrderedStageRuns,
  getStageDefinition,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { BreadCrumbPath } from "@app/components/BreadCrumbPath";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { StateError } from "@app/components/StateError";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { MigrationPreflightModal } from "@app/pages/applications/components/agentic-migration/migration-preflight-modal";
import { useStartMigrations } from "@app/pages/applications/components/agentic-migration/use-start-migrations";
import { useApproveStageMutation, useFetchPlanRun } from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { RunStatusLabel } from "../../components/run-status-label";

import { ResolvedSkillsTable } from "./components/resolved-skills-table";
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
  const [isNewRunOpen, setIsNewRunOpen] = React.useState(false);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);
  // Stages render from the run's own snapshot, never from the current Plan.
  const stageRuns = planRun ? getOrderedStageRuns(planRun) : [];

  const onApproveError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };

  const { mutate: approveStage, isPending: isApproving } =
    useApproveStageMutation(() => undefined, onApproveError);
  const approve = (stageId: string, stageName: string) =>
    approveStage(
      { runId: runId, stageId },
      {
        onSuccess: () =>
          pushNotification({
            title: t("agentic.planRun.stageApproved", { stage: stageName }),
            variant: "success",
          }),
      }
    );

  const { breadcrumbs, linkCrumbs: runChildCrumbs } = useEntityBreadcrumbs(
    // On an API error the run may exist: name it by id rather than "not found".
    planRun?.name ??
      (fetchError != null && !isNotFound
        ? runId
        : t("agentic.planRun.notFound")),
    [{ title: t("agentic.planRun.title"), path: DevPaths.planRuns }]
  );

  const { startMigrations, isStarting } = useStartMigrations(
    runChildCrumbs,
    () => setIsNewRunOpen(false)
  );

  if (isLoading) {
    return <AppPlaceholder />;
  }

  if (!planRun) {
    return (
      <PageSection hasBodyWrapper={false}>
        <BreadCrumbPath breadcrumbs={breadcrumbs} />
        {fetchError != null && !isNotFound ? (
          <StateError />
        ) : (
          <Alert
            variant={AlertVariant.warning}
            title={t("agentic.planRun.notFound")}
          >
            {t("agentic.planRun.notFoundDescription")}
          </Alert>
        )}
      </PageSection>
    );
  }

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={planRun.name}
          breadcrumbs={breadcrumbs}
          btnActions={
            <Flex
              alignItems={{ default: "alignItemsCenter" }}
              gap={{ default: "gapMd" }}
            >
              <FlexItem>
                <RunStatusLabel status={planRun.status} isCompact={false} />
              </FlexItem>
              {planRun.status === "Failed" && canManageRun && (
                <FlexItem>
                  <Button
                    variant={ButtonVariant.primary}
                    onClick={() => setIsNewRunOpen(true)}
                  >
                    {t("agentic.planRun.startNewRun")}
                  </Button>
                </FlexItem>
              )}
            </Flex>
          }
        />
      </PageSection>

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
                canApprove={canManageRun}
                isApproving={isApproving}
                onApprove={() => approve(stageRun.stageId, stageRun.name)}
                runChildCrumbs={runChildCrumbs}
              />
            </StackItem>
          ))}
        </Stack>
      </PageSection>

      {/* Resolved skills — shown after stages as supporting context */}
      {planRun.resolvedSkills && planRun.resolvedSkills.length > 0 && (
        <PageSection hasBodyWrapper={false}>
          <Stack hasGutter>
            <StackItem>
              <Title headingLevel="h2" size="md">
                {t("agentic.planRun.resolvedSkills")}
              </Title>
              <Content component="p">
                {t("agentic.planRun.resolvedSkillsInfo")}
              </Content>
            </StackItem>
            <StackItem>
              <ResolvedSkillsTable
                skills={planRun.resolvedSkills}
                runId={planRun.id}
                runChildCrumbs={runChildCrumbs}
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

      {isNewRunOpen && (
        <MigrationPreflightModal
          applications={planRun.applications}
          initialValues={{
            planSelection: "single",
            planId: planRun.planId,
            targetBranch: planRun.targetBranch,
          }}
          isStarting={isStarting}
          linkTo={(pathname, search = "") =>
            breadcrumbTo(pathname, search, runChildCrumbs)
          }
          onClose={() => setIsNewRunOpen(false)}
          onStartReady={startMigrations}
        />
      )}
    </>
  );
};

export default PlanRunDetail;
