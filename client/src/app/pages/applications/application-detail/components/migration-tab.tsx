import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Alert,
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
  Divider,
  ProgressStep,
  ProgressStepper,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { ControllerRunPhase, UNCONFIGURED_MIGRATION } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { RunStatusLabel } from "@app/pages/agentic/components/run-status-label";
import {
  useFetchApplicationMigrations,
  useFetchPlanRun,
  useResolveApplicationMigrationRequestMutation,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { MigrationNextAction } from "../../components/agentic-migration/migration-next-action";
import { MigrationPreflightModal } from "../../components/agentic-migration/migration-preflight-modal";
import { MigrationStatusLabel } from "../../components/agentic-migration/migration-status-label";
import {
  MigrationNextActionKey,
  getMigrationNextAction,
} from "../../components/agentic-migration/next-action";
import { planRunPath } from "../../components/agentic-migration/paths";
import { useStartMigrations } from "../../components/agentic-migration/use-start-migrations";
import { DecoratedApplication } from "../../useDecoratedApplications";

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

const phaseLabelKey: Record<ControllerRunPhase, string> = {
  Pending: "agentic.runStatus.pending",
  Running: "agentic.runStatus.running",
  Succeeded: "agentic.runStatus.succeeded",
  Failed: "agentic.runStatus.failed",
  AwaitingApproval: "agentic.runStatus.awaitingApproval",
};

/** Section ids the next action moves focus to when it is on this tab. */
const sectionIds: Partial<Record<MigrationNextActionKey, string>> = {
  resolve: "application-migration-preflight",
  review: "application-migration-request",
  correct: "application-migration-failure",
};

interface MigrationTabProps {
  application: DecoratedApplication;
  applicationId: number;
  /** Breadcrumb trail for links that leave the application. */
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The application's agentic migration: status and next action, preflight
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
  const [isPreflightOpen, setIsPreflightOpen] = React.useState(false);
  const [decisionToConfirm, setDecisionToConfirm] = React.useState<
    "approve" | "reject" | null
  >(null);
  const linkTo = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, linkCrumbs);

  const { migrations, isLoading, fetchError } = useFetchApplicationMigrations([
    applicationId,
  ]);
  // An application the aggregate omits has no Plan: not configured.
  const migration = migrations[applicationId] ?? UNCONFIGURED_MIGRATION;

  // A pending decision belongs to the plan run, which can cover several
  // applications: deciding here decides for all of them.
  const isAwaitingDecision = migration.intervention === "actionRequired";
  const { planRun: decisionRun } = useFetchPlanRun(
    isAwaitingDecision ? migration.planRun?.id : undefined
  );
  const affectedApplicationNames = decisionRun?.applications.map(
    (ref) => ref.name
  ) ?? [application.name];

  const resolveRequest = useResolveApplicationMigrationRequestMutation(
    () => {
      setDecisionToConfirm(null);
      pushNotification({
        title: t("agentic.execution.requestResolved"),
        variant: "success",
      });
    },
    (error: AxiosError) => {
      setDecisionToConfirm(null);
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      });
    }
  );
  const { startMigrations, isStarting } = useStartMigrations(linkCrumbs, () =>
    setIsPreflightOpen(false)
  );

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

  const nextAction = getMigrationNextAction(migration);
  const failedStage = migration.stages.find(
    (stage) => stage.phase === "Failed"
  );
  const focusSection = () => {
    const id = sectionIds[nextAction.key];
    const section = id != null ? document.getElementById(id) : null;
    section?.scrollIntoView({ block: "center" });
    section?.focus({ preventScroll: true });
  };
  const openPreflight = canManageRun
    ? () => setIsPreflightOpen(true)
    : undefined;

  return (
    <DrawerTabContent>
      <Stack hasGutter>
        <StackItem>
          <DescriptionList isHorizontal isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.execution.statusLabel")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                <MigrationStatusLabel migration={migration} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.execution.nextAction")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                <MigrationNextAction
                  migration={migration}
                  applicationId={applicationId}
                  archetypeId={application.archetypes?.[0]?.id}
                  linkTo={linkTo}
                  onStart={openPreflight}
                  onOpenMigrationTab={focusSection}
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
                id={sectionIds.resolve}
                tabIndex={-1}
                isInline
                variant={
                  migration.preflight === "blocked" ? "danger" : "warning"
                }
                title={t(`agentic.execution.preflight.${migration.preflight}`)}
              >
                {migration.preflightReason}
              </Alert>
            </StackItem>
          )}

        {migration.intervention === "actionRequired" && migration.action && (
          <StackItem>
            <Alert
              id={sectionIds.review}
              tabIndex={-1}
              isInline
              variant="warning"
              component="h3"
              title={migration.action.title}
            >
              <Stack hasGutter>
                <StackItem>{migration.action.description}</StackItem>
                {affectedApplicationNames.length > 1 && (
                  <StackItem>
                    {t("agentic.execution.decisionAppliesToRun", {
                      run: decisionRun?.name,
                      applications: affectedApplicationNames.join(", "),
                    })}
                  </StackItem>
                )}
                {canManageRun && (
                  <StackItem>
                    <Button
                      variant={ButtonVariant.primary}
                      onClick={() => setDecisionToConfirm("approve")}
                      isLoading={
                        resolveRequest.isPending &&
                        decisionToConfirm === "approve"
                      }
                      isDisabled={resolveRequest.isPending}
                    >
                      {t("agentic.execution.approveAndContinue")}
                    </Button>{" "}
                    <Button
                      variant={ButtonVariant.link}
                      onClick={() => setDecisionToConfirm("reject")}
                      isDisabled={resolveRequest.isPending}
                    >
                      {t("agentic.execution.rejectRequest")}
                    </Button>
                  </StackItem>
                )}
              </Stack>
            </Alert>
          </StackItem>
        )}

        {failedStage && (
          <StackItem>
            <Alert
              id={sectionIds.correct}
              tabIndex={-1}
              isInline
              variant="danger"
              component="h3"
              title={t("agentic.execution.stageFailed", {
                stage: failedStage.stageName,
              })}
            >
              {failedStage.summary && (
                <Content component="p">{failedStage.summary}</Content>
              )}
              {failedStage.evidence?.length ? (
                <Content component="ul">
                  {failedStage.evidence.map((evidence) => (
                    <Content component="li" key={evidence}>
                      {evidence}
                    </Content>
                  ))}
                </Content>
              ) : null}
              <Content component="p">
                {t("agentic.execution.recoveryDescription")}
              </Content>
              {canManageRun && (
                <Button
                  variant={ButtonVariant.primary}
                  onClick={() => setIsPreflightOpen(true)}
                >
                  {t("agentic.execution.startNewRun")}
                </Button>
              )}
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
                  <RunStatusLabel status={migration.runPhase} />
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
                            `agentic.skill.associationScope.${association.scope}`
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
            <ProgressStepper
              isVertical
              aria-label={t("agentic.execution.stageProgress")}
            >
              {migration.stages.map((stage, index) => (
                <ProgressStep
                  key={`${stage.stageName}-${index}`}
                  id={`migration-stage-${applicationId}-${index}`}
                  titleId={`migration-stage-title-${applicationId}-${index}`}
                  variant={phaseVariant(stage.phase)}
                  isCurrent={stage.stageName === migration.currentStage}
                  aria-label={t("agentic.execution.stagePhase", {
                    stage: stage.stageName,
                    phase: t(phaseLabelKey[stage.phase]),
                  })}
                  description={t(phaseLabelKey[stage.phase])}
                >
                  {stage.stageName}
                </ProgressStep>
              ))}
            </ProgressStepper>
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

      {isPreflightOpen && (
        <MigrationPreflightModal
          applications={[{ id: applicationId, name: application.name }]}
          migrations={migrations}
          isStarting={isStarting}
          linkTo={linkTo}
          onClose={() => setIsPreflightOpen(false)}
          onStartReady={startMigrations}
        />
      )}

      <ConfirmDialog
        isOpen={decisionToConfirm != null}
        title={
          decisionToConfirm === "reject"
            ? t("agentic.execution.confirmRejectTitle")
            : t("agentic.execution.confirmApproveTitle")
        }
        titleIconVariant="warning"
        message={
          <Stack hasGutter>
            <StackItem>
              {decisionToConfirm === "reject"
                ? t("agentic.execution.confirmRejectMessage", {
                    count: affectedApplicationNames.length,
                  })
                : t("agentic.execution.confirmApproveMessage", {
                    count: affectedApplicationNames.length,
                  })}
            </StackItem>
            <StackItem>
              <Content component="ul" aria-label={t("terms.applications")}>
                {affectedApplicationNames.map((name) => (
                  <Content component="li" key={name}>
                    {name}
                  </Content>
                ))}
              </Content>
            </StackItem>
          </Stack>
        }
        confirmBtnLabel={
          decisionToConfirm === "reject"
            ? t("agentic.execution.rejectRequest")
            : t("agentic.execution.approveAndContinue")
        }
        cancelBtnLabel={t("actions.cancel")}
        confirmBtnVariant={
          decisionToConfirm === "reject"
            ? ButtonVariant.danger
            : ButtonVariant.primary
        }
        inProgress={resolveRequest.isPending}
        onCancel={() => setDecisionToConfirm(null)}
        onClose={() => setDecisionToConfirm(null)}
        onConfirm={() => {
          if (decisionToConfirm != null) {
            resolveRequest.mutate({
              applicationId,
              decision: decisionToConfirm,
            });
          }
        }}
      />
    </DrawerTabContent>
  );
};
