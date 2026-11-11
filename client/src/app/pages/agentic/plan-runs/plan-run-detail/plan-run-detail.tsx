import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useParams } from "react-router-dom";
import {
  Card,
  CardBody,
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

import { DevPaths, PlanRunDetailsRoute } from "@app/Paths";
import { useHasSomeScopes } from "@app/auth";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchPlanRun } from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";

import { RunStatus } from "../../components/agentic-status";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import { SkillsTable, groupSkillSources } from "../../components/skills-table";
import { StageAttentionAlert } from "../../components/stage-attention-alert";
import { StageRunsTable } from "../../components/stage-runs-table";
import { useApproveStage } from "../components/use-approve-stage";

const PlanRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId } = useParams<PlanRunDetailsRoute>();

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);
  // The run's snapshot of skills: render what the server returns, never more.
  const skillRows = groupSkillSources(planRun?.resolvedSkills ?? []);

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

      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          <StackItem>
            <Title headingLevel="h2" size="md">
              {t("agentic.planRun.stages")}
            </Title>
          </StackItem>
          <StackItem>
            <StageRunsTable
              stageRuns={planRun.stageRuns}
              runId={planRun.id}
              linkTo={(pathname, search = "") =>
                breadcrumbTo(pathname, search, runChildCrumbs)
              }
              origin={`?from=run-${runId}`}
            />
          </StackItem>
        </Stack>
      </PageSection>

      {skillRows.length > 0 && (
        <PageSection hasBodyWrapper={false}>
          <Stack hasGutter>
            <StackItem>
              <Title headingLevel="h2" size="md">
                {t("agentic.planRun.skillsTitle", { count: skillRows.length })}
              </Title>
              <Content component="p">
                {t("agentic.planRun.skillsDescription")}
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

      {runMigrationPlan.modal}
    </>
  );
};

export default PlanRunDetail;
