import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useLocation } from "react-router-dom";
import {
  Alert,
  AlertActionLink,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from "@patternfly/react-core";
import { RouteIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  ApplicationMigrationResult,
  ApplicationMigrationView,
  HubRef,
  PlanRun,
  StageRun,
  UNCONFIGURED_MIGRATION,
  getMigrationDisplayStatus,
} from "@app/agentic";
import { Ref } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { ExternalLink } from "@app/components/ExternalLink";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { MigrationStatus } from "@app/pages/agentic/components/agentic-status";
import { useRunMigrationPlanLauncher } from "@app/pages/agentic/components/run-migration-plan-launcher";
import {
  StageAttentionAlert,
  getStageAttention,
} from "@app/pages/agentic/components/stage-attention-alert";
import { StageRunsTable } from "@app/pages/agentic/components/stage-runs-table";
import { targetProfileOwnerPath } from "@app/pages/agentic/entity-paths";
import {
  useFetchApplicationMigrations,
  useFetchPlanRun,
  useResolveApplicationMigrationRequestMutation,
} from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { planRunPath } from "../../components/agentic-migration/paths";
import { DecoratedApplication } from "../../useDecoratedApplications";

import { TabSection, TabSections } from "./tab-sections";

interface MigrationTabProps {
  application: DecoratedApplication;
  applicationId: number;
  /** Breadcrumb trail for links that leave the application. */
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The application's agentic migration (guide 7.6, applications amendment 1):
 * the one attention alert when something needs a person, the facts, the
 * stages of its latest run and, once it succeeded, the commits.
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

  // The attention alert and the target branch read the run itself, like the
  // run page. A decision belongs to the run, which can cover several
  // applications: deciding here decides for all of them.
  const {
    planRun,
    isLoading: isLoadingRun,
    fetchError: runError,
  } = useFetchPlanRun(migration.planRun?.id);

  const resolveRequest = useResolveApplicationMigrationRequestMutation(
    // The toast names what was decided, which only the caller knows.
    () => undefined,
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );
  // Approve: "{stage} approved". Reject fails the whole run: "{run} rejected"
  // (applications AP13). A failure is reported by the mutation.
  const decide =
    (decision: "approve" | "reject") => async (stageRun: StageRun) => {
      await resolveRequest.mutateAsync({ applicationId, decision });
      pushNotification({
        title:
          decision === "approve"
            ? t("agentic.planRun.stageApproved", { stage: stageRun.name })
            : t("agentic.execution.runRejected", {
                run: planRun?.name ?? migration.planRun?.name,
              }),
        variant: "success",
      });
    };
  const runMigrationPlan = useRunMigrationPlanLauncher({
    applications: [{ id: applicationId, name: application.name }],
    migrations,
    rerunOf: planRun?.status === "Failed" ? planRun : undefined,
    linkCrumbs,
  });

  if (isLoading || isLoadingRun) {
    return <AppPlaceholder />;
  }

  if (fetchError != null) {
    return <StateError />;
  }

  if (!migration.configured) {
    return (
      <NoMigrationPath
        archetype={application.archetypes?.[0]}
        linkTo={linkTo}
      />
    );
  }

  const status = getMigrationDisplayStatus(migration);
  const failedStage = migration.stages.find(
    (stage) => stage.phase === "Failed"
  );
  const attention = planRun != null ? getStageAttention(planRun) : undefined;
  // The alert shows the failure's summary, so the Stages table leaves it out.
  const alertShowsFailure = attention?.kind === "failed";
  const stages =
    alertShowsFailure && failedStage != null
      ? migration.stages.map((stage) =>
          stage === failedStage ? { ...stage, summary: undefined } : stage
        )
      : migration.stages;
  const hasRun = migration.planRun != null;
  const cannotStart =
    !hasRun &&
    (migration.preflight === "blocked" ||
      migration.preflight === "reviewRequired") &&
    !!migration.preflightReason;

  // Only an alert with something to say takes a place in the section stack.
  const alert =
    planRun != null && attention != null ? (
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
      />
    ) : migration.planRun != null &&
      runError != null &&
      (status === "actionRequired" || status === "failed") ? (
      // What the run needs cannot be shown without the run: send the user there.
      <RunUnavailableAlert to={linkTo(planRunPath(migration.planRun.id))} />
    ) : cannotStart ? (
      <Alert
        variant="warning"
        isInline
        title={t("agentic.execution.cannotStartTitle")}
      >
        {t("agentic.execution.cannotStartBody", {
          reason: migration.preflightReason,
        })}
      </Alert>
    ) : null;

  return (
    <>
      <TabSections>
        {alert}
        <MigrationFacts
          migration={migration}
          planRun={planRun}
          linkTo={linkTo}
        />
        <TabSection title={t("agentic.stageRunsTable.label")}>
          {hasRun && stages.length > 0 ? (
            <StageRunsTable stages={stages} />
          ) : status === "preflightReady" && runMigrationPlan.open != null ? (
            <EmptyState variant="xs">
              <EmptyStateBody>{t("agentic.execution.noRunYet")}</EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button
                    variant="primary"
                    onClick={() => runMigrationPlan.open?.()}
                  >
                    {t("agentic.execution.startMigration")}
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          ) : (
            <EmptyState variant="xs">
              <EmptyStateBody>
                {t("agentic.execution.stagesAppearHere")}
              </EmptyStateBody>
            </EmptyState>
          )}
        </TabSection>
        {migration.result && <CommitsSection result={migration.result} />}
      </TabSections>

      {runMigrationPlan.modal}
    </>
  );
};

/**
 * The facts (applications amendment 1): Status · Migration plan · Plan run ·
 * Target profile · Target branch · Skills. Without a run, Plan run and Target
 * branch are omitted.
 */
const MigrationFacts: React.FC<{
  migration: ApplicationMigrationView;
  planRun?: PlanRun;
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
}> = ({ migration, planRun, linkTo }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const skillsTab = new URLSearchParams(location.search);
  skillsTab.set("tab", "skills");
  // The Skills tab of this same page, keeping its breadcrumb trail.
  const skillsLink = useLinkComponent({
    pathname: location.pathname,
    search: `?${skillsTab.toString()}`,
    state: location.state,
  });
  const skillCount =
    migration.effectiveSkills != null
      ? new Set(migration.effectiveSkills.map(({ skill }) => skill.id)).size
      : undefined;
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );
  const targetBranch = migration.result?.targetBranch ?? planRun?.targetBranch;

  const fact = (term: string, description: React.ReactNode) => (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{description}</DescriptionListDescription>
    </DescriptionListGroup>
  );

  return (
    <DescriptionList
      isHorizontal
      isCompact
      horizontalTermWidthModifier={{ default: "18ch" }}
      columnModifier={{ lg: "2Col" }}
    >
      {fact(
        t("agentic.execution.statusLabel"),
        <MigrationStatus status={getMigrationDisplayStatus(migration)} />
      )}
      {fact(
        t("agentic.entity.migrationPlan"),
        migration.plan ? (
          <Link
            to={linkTo(
              generatePath(DevPaths.migrationPlanDetails, {
                planId: migration.plan.id,
              })
            )}
          >
            {migration.plan.name}
          </Link>
        ) : (
          <EmptyTextMessage message={t("agentic.execution.notAssigned")} />
        )
      )}
      {migration.planRun &&
        fact(
          t("agentic.entity.planRun"),
          <Link to={linkTo(planRunPath(migration.planRun.id))}>
            {migration.planRun.name}
          </Link>
        )}
      {fact(
        t("agentic.execution.targetProfile"),
        migration.targetProfile ? (
          <TargetProfileLink
            profile={migration.targetProfile}
            linkTo={linkTo}
          />
        ) : (
          <EmptyTextMessage message={t("agentic.execution.none")} />
        )
      )}
      {migration.planRun &&
        fact(
          t("agentic.execution.targetBranch"),
          // The tab waits for the run, so no branch here means the run
          // could not be read: unknown (addenda X6).
          targetBranch == null ? (
            unavailable
          ) : migration.result?.branchUrl ? (
            <ExternalLink href={migration.result.branchUrl} isInline>
              <span className="pf-v6-u-font-family-monospace">
                {targetBranch}
              </span>
            </ExternalLink>
          ) : (
            <span className="pf-v6-u-font-family-monospace">
              {targetBranch}
            </span>
          )
        )}
      {fact(
        t("agentic.applicationDetail.tabSkills"),
        skillCount == null ? (
          // The server did not say: unknown, never "None" (addenda X6).
          unavailable
        ) : skillCount === 0 ? (
          <EmptyTextMessage message={t("agentic.execution.none")} />
        ) : (
          <Button
            variant="link"
            isInline
            className="pf-v6-u-text-nowrap"
            component={skillsLink}
          >
            {t("agentic.execution.skillCount", { count: skillCount })}
          </Button>
        )
      )}
    </DescriptionList>
  );
};

/**
 * A target profile belongs to one archetype, which need not be this
 * application's (applications AP14): its owner is found by profile id, as for
 * skill sources. Plain text when no archetype owns it.
 */
const TargetProfileLink: React.FC<{
  profile: HubRef;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ profile, linkTo }) => {
  const { archetypes } = useFetchArchetypes();
  const path = targetProfileOwnerPath(profile.id, archetypes);
  return path != null ? (
    <Link to={linkTo(path)}>{profile.name}</Link>
  ) : (
    <>{profile.name}</>
  );
};

/** The run could not be read, so its alert cannot say what it needs. */
const RunUnavailableAlert: React.FC<{ to: LocationDescriptor }> = ({ to }) => {
  const { t } = useTranslation();
  const link = useLinkComponent(to);
  return (
    <Alert
      variant="danger"
      isInline
      title={t("agentic.execution.planRunUnavailable")}
      actionLinks={
        <AlertActionLink component={link}>
          {t("agentic.execution.viewPlanRun")}
        </AlertActionLink>
      }
    />
  );
};

/**
 * What the agents committed (applications amendment 3): "Commits (n)", one
 * sentence and a compact table. The branch is the Target branch fact.
 */
const CommitsSection: React.FC<{ result: ApplicationMigrationResult }> = ({
  result,
}) => {
  const { t } = useTranslation();
  const columns = {
    commit: t("agentic.execution.commitColumn"),
    message: t("agentic.execution.messageColumn"),
  };
  if (result.commits.length === 0) {
    return (
      <TabSection title={t("agentic.execution.commits")}>
        <EmptyState variant="xs">
          <EmptyStateBody>{t("agentic.execution.commitsEmpty")}</EmptyStateBody>
        </EmptyState>
      </TabSection>
    );
  }
  return (
    <TabSection
      title={t("agentic.execution.commitsTitle", {
        count: result.commits.length,
      })}
      description={t("agentic.execution.commitsDescription")}
    >
      <Table aria-label={t("agentic.execution.commits")} variant="compact">
        <Thead>
          <Tr>
            <Th modifier="fitContent">{columns.commit}</Th>
            <Th>{columns.message}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {result.commits.map((commit) => (
            <Tr key={commit.hash}>
              <Td dataLabel={columns.commit} modifier="nowrap">
                {commit.url ? (
                  // Git URLs open outside the app (guide 4.11), like the
                  // Target branch fact.
                  <ExternalLink href={commit.url} isInline>
                    <span className="pf-v6-u-font-family-monospace">
                      {commit.hash}
                    </span>
                  </ExternalLink>
                ) : (
                  <span className="pf-v6-u-font-family-monospace">
                    {commit.hash}
                  </span>
                )}
              </Td>
              <Td dataLabel={columns.message}>{commit.message}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TabSection>
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
