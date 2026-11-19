import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useLocation } from "react-router-dom";
import {
  Alert,
  AlertActionLink,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from "@patternfly/react-core";
import { RouteIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
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
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  SectionEmpty,
} from "@app/pages/agentic/components/detail-section";
import { useRunMigrationPlanLauncher } from "@app/pages/agentic/components/run-migration-plan-launcher";
import {
  StageAttentionAlert,
  getStageAttention,
} from "@app/pages/agentic/components/stage-attention-alert";
import { StageRunsTable } from "@app/pages/agentic/components/stage-runs-table";
import {
  targetProfileOwnerPath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
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

interface MigrationTabProps {
  application: DecoratedApplication;
  applicationId: number;
  /** Breadcrumb trail for links that leave the application. */
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The application's agentic migration:
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
  // Approve: "{stage} approved". Reject fails the whole run: "{run} rejected".
  // A failure is reported by the mutation.
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
      <DetailSections>
        {alert}
        <MigrationFacts
          migration={migration}
          planRun={planRun}
          linkTo={linkTo}
        />
        <DetailSection title={t("agentic.stageRunsTable.label")}>
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
            <SectionEmpty>
              {t("agentic.execution.stagesAppearHere")}
            </SectionEmpty>
          )}
        </DetailSection>
        {migration.result && <CommitsSection result={migration.result} />}
      </DetailSections>

      {runMigrationPlan.modal}
    </>
  );
};

/**
 * The facts: Status · Migration plan · Plan run ·
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
  const usedSkillIds =
    migration.effectiveSkills != null
      ? new Set(migration.effectiveSkills.map(({ skill }) => skill.id))
      : undefined;
  const skillCount = usedSkillIds?.size;
  // Skills its migration plan excludes, counted like the Skills tab heading.
  const excludedSkillCount = new Set(
    (migration.excludedSkills ?? [])
      .map(({ skill }) => skill.id)
      .filter((id) => !usedSkillIds?.has(id))
  ).size;
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );
  const targetBranch = migration.result?.targetBranch ?? planRun?.targetBranch;

  const monospace = (value: string) => (
    <span className={textStyles.fontFamilyMonospace}>{value}</span>
  );
  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.execution.statusLabel"),
      <MigrationStatus
        key="status"
        status={getMigrationDisplayStatus(migration)}
      />,
    ],
    [
      t("agentic.entity.migrationPlan"),
      migration.plan ? (
        <Link
          key="plan"
          to={linkTo(
            generatePath(DevPaths.migrationPlanDetails, {
              planId: migration.plan.id,
            })
          )}
        >
          {migration.plan.name}
        </Link>
      ) : (
        <EmptyTextMessage
          key="plan"
          message={t("agentic.execution.notAssigned")}
        />
      ),
    ],
    ...(migration.planRun
      ? ([
          [
            t("agentic.entity.planRun"),
            <Link key="run" to={linkTo(planRunPath(migration.planRun.id))}>
              {migration.planRun.name}
            </Link>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      t("agentic.execution.targetProfile"),
      migration.targetProfile ? (
        <TargetProfileLink
          key="profile"
          profile={migration.targetProfile}
          linkTo={linkTo}
        />
      ) : (
        <EmptyTextMessage key="profile" message={t("agentic.execution.none")} />
      ),
    ],
    ...(migration.planRun
      ? ([
          [
            t("agentic.execution.targetBranch"),
            // The tab waits for the run, so no branch here means the run
            // could not be read: unknown.
            targetBranch == null ? (
              unavailable
            ) : migration.result?.branchUrl ? (
              <ExternalLink
                key="branch"
                href={migration.result.branchUrl}
                isInline
              >
                {monospace(targetBranch)}
              </ExternalLink>
            ) : (
              monospace(targetBranch)
            ),
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      t("agentic.applicationDetail.tabSkills"),
      skillCount == null ? (
        // The server did not say: unknown, never "None".
        unavailable
      ) : skillCount === 0 && excludedSkillCount === 0 ? (
        <EmptyTextMessage key="skills" message={t("agentic.execution.none")} />
      ) : (
        <Button
          key="skills"
          variant="link"
          isInline
          className={textStyles.textNowrap}
          component={skillsLink}
        >
          {excludedSkillCount > 0
            ? t("agentic.execution.skillCountUsed", {
                used: skillCount,
                count: skillCount + excludedSkillCount,
              })
            : t("agentic.execution.skillCount", { count: skillCount })}
        </Button>
      ),
    ],
  ];

  return <DetailFacts facts={facts} isTwoColumn />;
};

/**
 * A target profile belongs to one archetype, which need not be this
 * application's: its owner is found by profile id, as for
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
 * What the agents committed: "Commits (n)", one
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
      <DetailSection title={t("agentic.execution.commits")}>
        <SectionEmpty>{t("agentic.execution.commitsEmpty")}</SectionEmpty>
      </DetailSection>
    );
  }
  return (
    <DetailSection
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
                  // Git URLs open outside the app, like the
                  // Target branch fact.
                  <ExternalLink href={commit.url} isInline>
                    <span className={textStyles.fontFamilyMonospace}>
                      {commit.hash}
                    </span>
                  </ExternalLink>
                ) : (
                  <span className={textStyles.fontFamilyMonospace}>
                    {commit.hash}
                  </span>
                )}
              </Td>
              <Td dataLabel={columns.message}>{commit.message}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </DetailSection>
  );
};

/**
 * No migration plan resolves for the application. Plans
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
      archetype != null ? targetProfilesPath(archetype.id) : DevPaths.archetypes
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
