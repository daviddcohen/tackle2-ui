import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";
import { RouteIcon } from "@patternfly/react-icons";

import { DevPaths } from "@app/Paths";
import {
  UNCONFIGURED_MIGRATION,
  getMigrationDisplayStatus,
} from "@app/agentic";
import { Ref } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  MigrationStatus,
  RunStatus,
} from "@app/pages/agentic/components/agentic-status";
import { useRunMigrationPlanLauncher } from "@app/pages/agentic/components/run-migration-plan-launcher";
import {
  StageAttentionAlert,
  getStageAttention,
} from "@app/pages/agentic/components/stage-attention-alert";
import { StageRunsTable } from "@app/pages/agentic/components/stage-runs-table";
import {
  useFetchApplicationMigrations,
  useFetchPlanRun,
  useResolveApplicationMigrationRequestMutation,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { planRunPath } from "../../components/agentic-migration/paths";
import { DecoratedApplication } from "../../useDecoratedApplications";

interface MigrationTabProps {
  application: DecoratedApplication;
  applicationId: number;
  /** Breadcrumb trail for links that leave the application. */
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The application's agentic migration: status, preflight
 * blockers, the pending decision (approve or reject), stage progress, failure
 * evidence with a new run, and the Git results of a finished run.
 */
export const MigrationTab: React.FC<MigrationTabProps> = ({
  application,
  applicationId,
  linkCrumbs,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
  const linkTo = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, linkCrumbs);

  const { migrations, isLoading, fetchError } = useFetchApplicationMigrations([
    applicationId,
  ]);
  // An application the aggregate omits has no Plan: not configured.
  const migration = migrations[applicationId] ?? UNCONFIGURED_MIGRATION;

  // The attention alert reads the run's own stages, like the run page. A
  // decision belongs to the run, which can cover several applications:
  // deciding here decides for all of them.
  const { planRun } = useFetchPlanRun(migration.planRun?.id);

  const resolveRequest = useResolveApplicationMigrationRequestMutation(
    () =>
      pushNotification({
        title: t("agentic.execution.requestResolved"),
        variant: "success",
      }),
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );
  const decide = (decision: "approve" | "reject") => () =>
    resolveRequest.mutateAsync({ applicationId, decision });
  const runMigrationPlan = useRunMigrationPlanLauncher({
    applications: [{ id: applicationId, name: application.name }],
    migrations,
    rerunOf: planRun?.status === "Failed" ? planRun : undefined,
    linkCrumbs,
  });

  if (isLoading) {
    return (
      <DrawerTabContent>
        <AppPlaceholder />
      </DrawerTabContent>
    );
  }

  if (fetchError != null) {
    return (
      <DrawerTabContent>
        <Alert
          isInline
          variant="danger"
          title={t("agentic.execution.unavailableTitle")}
        >
          {t("agentic.execution.unavailableDescription")}
        </Alert>
      </DrawerTabContent>
    );
  }

  if (!migration.configured) {
    return (
      <NoMigrationPath
        archetype={application.archetypes?.[0]}
        linkTo={linkTo}
      />
    );
  }

  const failedStage = migration.stages.find(
    (stage) => stage.phase === "Failed"
  );
  // The alert shows the failure's summary, so the Stages table leaves it out.
  const alertShowsFailure =
    planRun != null && getStageAttention(planRun)?.kind === "failed";

  return (
    <DrawerTabContent>
      <Stack hasGutter>
        {planRun != null && (
          <StageAttentionAlert
            surface="application"
            planRun={planRun}
            reviewStageTo={(stageRun) =>
              linkTo(
                generatePath(DevPaths.stageRunDetails, {
                  runId: planRun.id,
                  stageId: stageRun.stageId,
                })
              )
            }
            onApprove={canManageRun ? decide("approve") : undefined}
            onReject={canManageRun ? decide("reject") : undefined}
            isDeciding={resolveRequest.isPending}
            onRunMigrationPlan={runMigrationPlan.open}
            failureDetails={failedStage}
            restartBlockedReason={
              migration.preflight != null && migration.preflight !== "ready"
                ? migration.preflightReason
                : undefined
            }
            planRunTo={linkTo(planRunPath(planRun.id))}
            wrapper={(alert) => <StackItem>{alert}</StackItem>}
          />
        )}
        <StackItem>
          <DescriptionList isHorizontal isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.execution.statusLabel")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                <MigrationStatus
                  status={getMigrationDisplayStatus(migration)}
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
            {migration.planRun && (
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.execution.latestPlanRun")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <Link to={linkTo(planRunPath(migration.planRun.id))}>
                    {migration.planRun.name}
                  </Link>
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        </StackItem>

        {migration.preflight != null &&
          migration.preflight !== "ready" &&
          migration.preflightReason && (
            <StackItem>
              <Alert
                isInline
                variant="warning"
                title={t(`agentic.execution.preflight.${migration.preflight}`)}
              >
                {migration.preflightReason}
              </Alert>
            </StackItem>
          )}

        <StackItem>
          <Divider />
        </StackItem>

        <StackItem>
          <Title headingLevel="h3" size="md">
            {t("agentic.execution.planContext")}
          </Title>
          <DescriptionList isHorizontal isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.execution.resolvedPlan")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {migration.plan ? (
                  <Link
                    to={linkTo(
                      DevPaths.migrationPlanDetails.replace(
                        ":planId",
                        migration.plan.id
                      )
                    )}
                  >
                    {migration.plan.name}
                  </Link>
                ) : (
                  t("agentic.plan.notConfigured")
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.plan.targetProfile")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {migration.targetProfile?.name ||
                  t("agentic.plan.notConfigured")}
              </DescriptionListDescription>
            </DescriptionListGroup>
            {migration.runPhase && (
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("agentic.execution.controllerRunPhase")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <RunStatus status={migration.runPhase} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        </StackItem>

        {migration.effectiveSkills?.length ? (
          <StackItem>
            <Card isCompact>
              <CardTitle>
                {t("agentic.execution.effectiveSkillsTitle")}
              </CardTitle>
              <CardBody>
                <Content component="p">
                  {t("agentic.execution.effectiveSkillsDescription")}
                </Content>
                <Content component="ul">
                  {migration.effectiveSkills.map((association) => (
                    <Content
                      component="li"
                      key={`${association.skill.id}-${association.scope}-${association.scopeName}`}
                    >
                      {association.skill.name}{" "}
                      <Content component="small">
                        {t("agentic.execution.skillProvenance", {
                          scope: t(
                            `agentic.skillsTable.scope.${association.scope}`
                          ),
                          name: association.scopeName,
                        })}
                      </Content>
                    </Content>
                  ))}
                </Content>
              </CardBody>
            </Card>
          </StackItem>
        ) : null}

        {migration.stages.length > 0 && (
          <StackItem>
            <Title headingLevel="h3" size="md">
              {t("agentic.execution.stageProgress")}
            </Title>
            <StageRunsTable
              stages={
                alertShowsFailure && failedStage != null
                  ? // The alert already shows the failure's summary.
                    migration.stages.map((stage) =>
                      stage === failedStage
                        ? { ...stage, summary: undefined }
                        : stage
                    )
                  : migration.stages
              }
            />
          </StackItem>
        )}

        {migration.result && (
          <StackItem>
            <Card isCompact>
              <CardTitle>{t("agentic.execution.gitResults")}</CardTitle>
              <CardBody>
                <DescriptionList isHorizontal isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("agentic.execution.targetBranch")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {migration.result.branchUrl ? (
                        <a
                          href={migration.result.branchUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {migration.result.targetBranch}
                        </a>
                      ) : (
                        migration.result.targetBranch
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t("agentic.execution.commits")}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {migration.result.commits.length === 0 ? (
                        t("agentic.planRun.commitsEmpty")
                      ) : (
                        <Content component="ul">
                          {migration.result.commits.map((commit) => (
                            <Content component="li" key={commit.hash}>
                              {commit.url ? (
                                <a
                                  href={commit.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <code>{commit.hash}</code>
                                </a>
                              ) : (
                                <code>{commit.hash}</code>
                              )}{" "}
                              {commit.message}{" "}
                              <Content component="small">
                                {t("agentic.execution.commitStage", {
                                  stage: commit.stageName,
                                })}
                              </Content>
                            </Content>
                          ))}
                        </Content>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </StackItem>
        )}
      </Stack>

      {runMigrationPlan.modal}
    </DrawerTabContent>
  );
};

/**
 * No migration plan resolves for the application (applications AP10). Plans
 * come from the archetype's target profile, so the next step is there; an
 * application without an archetype is told to get one first. The data gives
 * no cause (a profile without a plan, no profile, a plan on another profile),
 * so the copy names none.
 */
const NoMigrationPath: React.FC<{
  archetype?: Ref;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ archetype, linkTo }) => {
  const { t } = useTranslation();
  const link = useLinkComponent(
    linkTo(
      archetype != null
        ? generatePath(DevPaths.archetypeTargetProfiles, {
            archetypeId: String(archetype.id),
          })
        : DevPaths.archetypes
    )
  );
  return (
    <EmptyState
      headingLevel="h2"
      icon={RouteIcon}
      titleText={t("agentic.execution.noMigrationPathTitle")}
      variant="sm"
    >
      <EmptyStateBody>
        {archetype != null
          ? t("agentic.execution.noMigrationPathBody", {
              archetype: archetype.name,
            })
          : t("agentic.execution.noArchetypeBody")}
      </EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="link" component={link}>
            {archetype != null
              ? t("agentic.execution.viewTargetProfiles")
              : t("agentic.execution.goToArchetypes")}
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
};
