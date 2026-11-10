import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import {
  Alert,
  AlertVariant,
  Button,
  ButtonVariant,
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
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";

import { DevPaths, StageRunDetailsRoute } from "@app/Paths";
import { getStageDefinition } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { BreadCrumbPath } from "@app/components/BreadCrumbPath";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { StateError } from "@app/components/StateError";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useApproveStageMutation,
  useFetchAgentById,
  useFetchPlanRun,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { RunStatusLabel } from "../../components/run-status-label";
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

  const { mutate: approveStage, isPending: isApproving } =
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

  const { breadcrumbs, linkCrumbs: stageChildCrumbs } = useEntityBreadcrumbs(
    stage?.name ??
      (fetchError != null && !isNotFound
        ? stageId
        : t("agentic.stageRun.notFound")),
    [
      { title: t("agentic.planRun.title"), path: DevPaths.planRuns },
      ...(planRun
        ? [
            {
              title: planRun.name,
              path: generatePath(DevPaths.planRunDetails, { runId }),
            },
          ]
        : []),
    ]
  );

  if (isLoading) {
    return <AppPlaceholder />;
  }

  if (!planRun || !stageRun || !stage) {
    return (
      <PageSection hasBodyWrapper={false}>
        <BreadCrumbPath breadcrumbs={breadcrumbs} />
        {fetchError != null && !isNotFound ? (
          <StateError />
        ) : (
          <Alert
            variant={AlertVariant.warning}
            title={t("agentic.stageRun.notFound")}
          >
            {t("agentic.stageRun.notFoundDescription")}
          </Alert>
        )}
      </PageSection>
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
                  <RunStatusLabel status={stageRun.status} isCompact={false} />
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

      {/* Approval action */}
      {stageRun.status === "AwaitingApproval" && (
        <PageSection hasBodyWrapper={false}>
          <Alert
            variant="warning"
            isInline
            title={t("agentic.planRun.approveTitle")}
          >
            <Stack hasGutter>
              <StackItem>
                {t("agentic.planRun.approveDescription", {
                  agentName: stage.agent.name,
                })}
              </StackItem>
              {canManageRun && (
                <StackItem>
                  <Button
                    variant={ButtonVariant.primary}
                    isLoading={isApproving}
                    isDisabled={isApproving}
                    onClick={() =>
                      approveStage({
                        runId: planRun.id,
                        stageId: stageRun.stageId,
                      })
                    }
                  >
                    {t("agentic.planRun.approve")}
                  </Button>
                </StackItem>
              )}
            </Stack>
          </Alert>
        </PageSection>
      )}

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
    </>
  );
};

export default StageRunDetail;
