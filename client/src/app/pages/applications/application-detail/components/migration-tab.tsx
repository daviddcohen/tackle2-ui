import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath, useLocation } from "react-router-dom";
import {
  Alert,
  AlertActionLink,
  Button,
  Content,
  List,
  ListItem,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  ApplicationMigrationPath,
  ApplicationMigrationResult,
  ApplicationMigrationView,
  EntityId,
  EntityRef,
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
  LinkLabels,
  SectionEmpty,
} from "@app/pages/agentic/components/detail-section";
import { useRunMigrationPlanLauncher } from "@app/pages/agentic/components/run-migration-plan-launcher";
import { linkToPath } from "@app/pages/agentic/components/skill-origin";
import {
  StageAttentionAlert,
  getStageAttention,
} from "@app/pages/agentic/components/stage-attention-alert";
import { StageRunsTable } from "@app/pages/agentic/components/stage-runs-table";
import {
  archetypePath,
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import {
  useFetchApplicationMigrations,
  useFetchPlanRun,
  useFetchPlanRuns,
  useResolveApplicationMigrationRequestMutation,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import {
  formatTableDate,
  getAxiosErrorMessage,
  universalComparator,
} from "@app/utils/utils";

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
 * the one attention alert when something needs a person, the facts, its
 * latest plan run (facts and stages) and, once it succeeded, the commits.
 */
export const MigrationTab: React.FC<MigrationTabProps> = ({
  application,
  applicationId,
  linkCrumbs,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
  const linkTo = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, linkCrumbs);

  const { migrations, isLoading, fetchError } = useFetchApplicationMigrations([
    applicationId,
  ]);
  // An application the aggregate omits has no Plan: not configured.
  const migration = migrations[applicationId] ?? UNCONFIGURED_MIGRATION;

  // The attention alert and the latest plan run's facts read the run
  // itself, like the run page. A decision belongs to the run, which can
  // cover several applications: deciding here decides for all of them.
  const {
    planRun,
    isLoading: isLoadingRun,
    fetchError: runError,
  } = useFetchPlanRun(migration.planRun?.id);
  // How many plan runs include the application: the Plan runs tab's query.
  // The tab does not wait for it: until it is read, or when it never was,
  // the count is not said. A failed refresh keeps the last read, like the
  // Plan runs tab.
  const { planRuns } = useFetchPlanRuns();
  const runCount = planRuns.filter((run) =>
    run.applications.some((app) => app.id === applicationId)
  ).length;
  const planRunsTabSearch = new URLSearchParams(location.search);
  planRunsTabSearch.set("tab", "plan-runs");
  const planRunsTabTo: LocationDescriptor = {
    pathname: location.pathname,
    search: `?${planRunsTabSearch}`,
    state: location.state,
  };

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

  const isReady = !isLoading && !isLoadingRun;

  if (!isReady) {
    return <AppPlaceholder />;
  }

  if (fetchError != null) {
    return <StateError />;
  }

  const archetypes = application.archetypes ?? [];

  if (!migration.configured) {
    return (
      <DetailSections>
        <MigrationFacts
          migration={migration}
          archetypes={archetypes}
          linkTo={linkTo}
        />
        <NoMigrationPlan
          migration={migration}
          archetype={shownPath(migration)?.archetype ?? archetypes[0]}
          linkTo={linkTo}
        />
        {/* A run that used a plan chosen at launch is still shown. */}
        {migration.planRun != null && (
          <LatestPlanRun
            migration={migration}
            planRun={planRun}
            applicationId={applicationId}
            runCount={runCount}
            planRunsTabTo={planRunsTabTo}
            linkTo={linkTo}
          >
            {migration.stages.length > 0 && (
              <StageRunsTable stages={migration.stages} />
            )}
          </LatestPlanRun>
        )}
      </DetailSections>
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
  // The latest run ran another plan than the one the next run uses (the
  // default path's), or, with several runnable target profiles, a plan none
  // of them uses. Without the run's plan nothing is said: it is never
  // guessed from the run name.
  const runPlanId = migration.planRunPlan?.id;
  const ranOtherPlan =
    runPlanId != null &&
    migration.plan != null &&
    runPlanId !== migration.plan.id;
  const ranUnusedPlan =
    runPlanId != null &&
    migration.plan == null &&
    runnablePaths(migration).length > 1 &&
    !runnablePaths(migration).some(({ plan }) => plan?.id === runPlanId);
  const planLink = (plan: EntityRef | undefined) =>
    plan != null ? (
      <Link
        to={linkTo(
          generatePath(DevPaths.migrationPlanDetails, { planId: plan.id })
        )}
      />
    ) : (
      <span />
    );
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
          stageRunTo(planRun.id, stageRun.stageId, applicationId, linkTo)
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
          archetypes={archetypes}
          linkTo={linkTo}
        />
        <LatestPlanRun
          migration={migration}
          planRun={planRun}
          applicationId={applicationId}
          runCount={runCount}
          planRunsTabTo={planRunsTabTo}
          linkTo={linkTo}
          description={
            ranUnusedPlan ? (
              <Trans
                i18nKey="agentic.execution.latestRunUnusedPlan"
                values={{ plan: migration.planRunPlan?.name }}
                components={{ planLink: planLink(migration.planRunPlan) }}
              />
            ) : ranOtherPlan ? (
              // Names both plans, so the stages (the run's plan) and the
              // Migration plan fact (the plan the next run uses) do not read
              // as one plan. The Plan run fact below links the run.
              <Trans
                i18nKey="agentic.execution.latestRunOtherPlan"
                values={{
                  plan: migration.planRunPlan?.name,
                  ownPlan: migration.plan?.name,
                }}
                components={{
                  planLink: planLink(migration.planRunPlan),
                  ownPlanLink: planLink(migration.plan),
                }}
              />
            ) : undefined
          }
        >
          {hasRun && stages.length > 0 ? (
            <StageRunsTable stages={stages} />
          ) : status === "preflightReady" && runMigrationPlan.open != null ? (
            <SectionEmpty
              action={
                <Button
                  variant="link"
                  isInline
                  onClick={() => runMigrationPlan.open?.()}
                >
                  {t("agentic.execution.startMigration")}
                </Button>
              }
            >
              {t("agentic.execution.noRunYet")}
            </SectionEmpty>
          ) : (
            <SectionEmpty>
              {t("agentic.execution.stagesAppearHere")}
            </SectionEmpty>
          )}
        </LatestPlanRun>
        {migration.result && <CommitsSection result={migration.result} />}
      </DetailSections>

      {runMigrationPlan.modal}
    </>
  );
};

/** The application's migration paths whose target profile has a plan. */
const runnablePaths = (migration: ApplicationMigrationView) =>
  (migration.migrationPaths ?? []).filter(({ plan }) => plan != null);

/**
 * The migration path the Target profile and Migration plan facts show: the
 * default path, else the only path (without a plan). Undefined when the
 * application has several paths and no default: the Target profiles fact
 * lists them instead.
 */
const shownPath = (
  migration: ApplicationMigrationView
): ApplicationMigrationPath | undefined => {
  if (migration.targetProfile != null && migration.archetype != null) {
    return {
      archetype: migration.archetype,
      targetProfile: migration.targetProfile,
      plan: migration.plan,
    };
  }
  const paths = migration.migrationPaths ?? [];
  return paths.length === 1 ? paths[0] : undefined;
};

/**
 * Every migration path of an application without a default, one per line:
 * "Quarkus 3.x: Java EE to Quarkus", the profile and the plan linked, "Not
 * assigned" for a profile without a plan. The archetype follows the profile
 * ("Quarkus 3.x (Java EE Application)") only when the paths span several
 * archetypes; otherwise the Archetype fact above names it. With several
 * plans to run, a note says a run picks one.
 */
const MigrationPathsFact: React.FC<{
  paths: ApplicationMigrationPath[];
  to: (path: string) => LocationDescriptor;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ paths, to, linkTo }) => {
  const { t } = useTranslation();
  const runnableCount = paths.filter(({ plan }) => plan != null).length;
  const isOneArchetype =
    new Set(paths.map(({ archetype }) => archetype.id)).size === 1;
  return (
    <>
      <List isPlain>
        {paths.map(({ archetype, targetProfile, plan }) => (
          <ListItem key={`${archetype.id}-${targetProfile.id}`}>
            <Trans
              i18nKey={
                isOneArchetype
                  ? "agentic.execution.migrationPathPlanOneArchetype"
                  : "agentic.execution.migrationPathPlan"
              }
              values={{
                profile: targetProfile.name,
                archetype: archetype.name,
                plan: plan?.name ?? t("agentic.execution.notAssigned"),
              }}
              components={{
                profileLink: (
                  <Link
                    to={to(targetProfilePath(archetype.id, targetProfile.id))}
                  />
                ),
                planLink:
                  plan != null ? (
                    <Link
                      to={linkTo(
                        generatePath(DevPaths.migrationPlanDetails, {
                          planId: plan.id,
                        })
                      )}
                    />
                  ) : (
                    <i className={textStyles.textColorSubtle} />
                  ),
              }}
            />
          </ListItem>
        ))}
      </List>
      {runnableCount > 1 && (
        <Content component="small" className={textStyles.textColorSubtle}>
          {t("agentic.execution.migrationPathsNote")}
        </Content>
      )}
    </>
  );
};

/**
 * The application's facts: Status, then the chain that decides the plan
 * (Archetype, Target profile, Migration plan; or, for several target
 * profiles and no default, Target profiles with the plan each uses). Each
 * name links where it is edited. The latest run's facts are its section's.
 */
const MigrationFacts: React.FC<{
  migration: ApplicationMigrationView;
  /** The application's archetypes; the target profile's comes first. */
  archetypes: Ref[];
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
}> = ({ migration, archetypes, linkTo }) => {
  const { t } = useTranslation();
  const none = <EmptyTextMessage message={t("agentic.execution.none")} />;
  const to = (path: string) => linkToPath(linkTo, path);

  const chainPath = shownPath(migration);
  const paths = migration.migrationPaths ?? [];
  // The target profile's archetype first, then the others by name.
  const chainArchetype = chainPath?.archetype;
  const orderedArchetypes: Ref[] = [
    ...(chainArchetype != null ? [chainArchetype] : []),
    ...[...archetypes]
      .filter((archetype) => archetype.id !== chainArchetype?.id)
      .sort((a, b) => universalComparator(a.name, b.name)),
  ];

  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.execution.statusLabel"),
      <MigrationStatus
        key="status"
        status={getMigrationDisplayStatus(migration)}
      />,
    ],
    [
      orderedArchetypes.length > 1
        ? t("agentic.execution.archetypes")
        : t("agentic.execution.archetype"),
      orderedArchetypes.length === 0 ? (
        none
      ) : orderedArchetypes.length === 1 ? (
        <Link to={to(archetypePath(orderedArchetypes[0].id))}>
          {orderedArchetypes[0].name}
        </Link>
      ) : (
        <LinkLabels
          items={orderedArchetypes.map((archetype) => ({
            id: archetype.id,
            name: archetype.name,
            to: to(archetypePath(archetype.id)),
          }))}
        />
      ),
    ],
    ...(chainPath == null && paths.length > 1
      ? ([
          [
            t("terms.targetProfiles"),
            <MigrationPathsFact
              key="paths"
              paths={paths}
              to={to}
              linkTo={linkTo}
            />,
          ],
        ] as [string, React.ReactNode][])
      : ([
          [
            t("agentic.execution.targetProfile"),
            chainPath != null ? (
              <Link
                to={to(
                  targetProfilePath(
                    chainPath.archetype.id,
                    chainPath.targetProfile.id
                  )
                )}
              >
                {chainPath.targetProfile.name}
              </Link>
            ) : migration.targetProfile != null ? (
              // A profile without a known archetype stays text.
              migration.targetProfile.name
            ) : (
              none
            ),
          ],
          [
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
            ),
          ],
        ] as [string, React.ReactNode][])),
  ];

  return <DetailFacts facts={facts} isTwoColumn />;
};

/**
 * Latest plan run: the application's latest run (its name, the target
 * profile this application ran on when the run reports it, the target
 * branch and the start), then its stages. With several runs, a sentence
 * says so and links to the Plan runs tab. Before a run, only the content
 * (the empty sentence).
 */
const LatestPlanRun: React.FC<{
  migration: ApplicationMigrationView;
  planRun?: PlanRun;
  applicationId: number;
  /** The plan runs that include the application. */
  runCount: number;
  planRunsTabTo: LocationDescriptor;
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  /** Which plan the run ran, when it is not the application's. */
  description?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  migration,
  planRun,
  applicationId,
  runCount,
  planRunsTabTo,
  linkTo,
  description,
  children,
}) => {
  const { t } = useTranslation();
  const runRef = migration.planRun;
  const severalRuns =
    runRef != null && runCount > 1 ? (
      <>
        {t("agentic.execution.latestOfPlanRuns", { count: runCount })}{" "}
        <Link to={planRunsTabTo}>{t("agentic.execution.viewPlanRuns")}</Link>
      </>
    ) : null;
  return (
    <DetailSection
      headingId="latest-plan-run-heading"
      title={t("agentic.execution.latestPlanRun")}
      description={
        description != null && severalRuns != null ? (
          <>
            {description} {severalRuns}
          </>
        ) : (
          (description ?? severalRuns ?? undefined)
        )
      }
    >
      {runRef != null && (
        <LatestRunFacts
          runRef={runRef}
          migration={migration}
          planRun={planRun}
          applicationId={applicationId}
          linkTo={linkTo}
        />
      )}
      {children}
    </DetailSection>
  );
};

/**
 * The latest run's facts: Plan run, the target profile this application
 * ran on (when the run reports it), Target branch and Started.
 */
const LatestRunFacts: React.FC<{
  runRef: EntityRef;
  migration: ApplicationMigrationView;
  planRun?: PlanRun;
  applicationId: number;
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
}> = ({ runRef, migration, planRun, applicationId, linkTo }) => {
  const { t } = useTranslation();
  // The tab waits for the run, so a value missing here means the run could
  // not be read: unknown.
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );
  const to = (path: string) => linkToPath(linkTo, path);
  const targetBranch = migration.result?.targetBranch ?? planRun?.targetBranch;
  // Absent when the run does not report it.
  const ranOn = planRun?.targetProfiles?.find(
    (entry) => entry.application.id === applicationId
  );
  const monospace = (value: string) => (
    <span className={textStyles.fontFamilyMonospace}>{value}</span>
  );
  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.entity.planRun"),
      <Link key="run" to={linkTo(planRunPath(runRef.id))}>
        {runRef.name}
      </Link>,
    ],
    ...(ranOn != null
      ? ([
          [
            t("agentic.execution.targetProfile"),
            ranOn.targetProfile == null ? (
              <EmptyTextMessage message={t("agentic.execution.none")} />
            ) : ranOn.archetype != null ? (
              <Link
                key="ran-on"
                to={to(
                  targetProfilePath(ranOn.archetype.id, ranOn.targetProfile.id)
                )}
              >
                {ranOn.targetProfile.name}
              </Link>
            ) : (
              ranOn.targetProfile.name
            ),
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      t("agentic.execution.targetBranch"),
      targetBranch == null ? (
        unavailable
      ) : migration.result?.branchUrl ? (
        <ExternalLink key="branch" href={migration.result.branchUrl} isInline>
          {monospace(targetBranch)}
        </ExternalLink>
      ) : (
        monospace(targetBranch)
      ),
    ],
    [
      t("terms.started"),
      // A pending run's start is not a start, as in the plan runs list.
      planRun?.status === "Pending" ? (
        <EmptyTextMessage message={t("terms.notStarted")} />
      ) : planRun == null || !planRun.startedAt ? (
        unavailable
      ) : (
        formatTableDate(new Date(planRun.startedAt))
      ),
    ],
  ];
  return <DetailFacts facts={facts} isTwoColumn />;
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
 * No migration plan resolves for the application. Plans come from the
 * archetype's target profiles, so the body names the missing link of that
 * chain (no archetype, no target profile, no plan on its target profile or
 * on any of them) and the action goes where it is fixed.
 */
const NoMigrationPlan: React.FC<{
  migration: ApplicationMigrationView;
  archetype?: Ref;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ migration, archetype, linkTo }) => {
  const { t } = useTranslation();
  const link = useLinkComponent(
    linkTo(
      archetype != null ? targetProfilesPath(archetype.id) : DevPaths.archetypes
    )
  );
  // The archetype's target profiles; without the paths, the server's own.
  const profiles =
    migration.migrationPaths != null
      ? migration.migrationPaths
          .filter((path) => path.archetype.id === archetype?.id)
          .map((path) => path.targetProfile)
      : migration.targetProfile != null
        ? [migration.targetProfile]
        : [];
  const body =
    archetype == null
      ? t("agentic.execution.noArchetypeBody")
      : profiles.length === 0
        ? t("agentic.execution.noTargetProfileBody", {
            archetype: archetype.name,
          })
        : profiles.length === 1
          ? t("agentic.execution.noPlanForProfileBody", {
              profile: profiles[0].name,
              archetype: archetype.name,
            })
          : t("agentic.execution.noPlanForProfilesBody", {
              archetype: archetype.name,
            });
  return (
    <DetailSection title={t("agentic.execution.noMigrationPathTitle")}>
      <SectionEmpty
        action={
          <Button variant="link" isInline component={link}>
            {archetype != null
              ? t("agentic.execution.viewTargetProfiles")
              : t("agentic.execution.goToArchetypes")}
          </Button>
        }
      >
        {body}
      </SectionEmpty>
    </DetailSection>
  );
};

/**
 * A stage page link from this application: it carries the application, so
 * a run of several applications opens on this one's agent run.
 */
export const stageRunTo = (
  runId: EntityId,
  stageId: EntityId,
  applicationId: number,
  linkTo: (pathname: string, search?: string) => LocationDescriptor
) =>
  linkTo(
    generatePath(DevPaths.stageRunDetails, { runId, stageId }),
    `?${new URLSearchParams({ application: String(applicationId) })}`
  );
