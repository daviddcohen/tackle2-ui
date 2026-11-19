import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { Trans, useTranslation } from "react-i18next";
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
import { StageSkillsTable } from "@app/pages/agentic/components/stage-skills-table";
import {
  archetypePath,
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import {
  useFetchApplicationMigrations,
  useFetchPlanRun,
  useResolveApplicationMigrationRequestMutation,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage, universalComparator } from "@app/utils/utils";

import { planRunPath } from "../../components/agentic-migration/paths";
import { DecoratedApplication } from "../../useDecoratedApplications";

import {
  SKILLS_BY_STAGE_HASH,
  SKILLS_BY_STAGE_HEADING_ID,
  SKILLS_BY_STAGE_ID,
} from "./skills-by-stage-anchor";

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

  const isReady = !isLoading && !isLoadingRun;
  // "See skills by stage" (Skills tab) opens this tab at that section: move
  // focus to its heading once it is there, so the reader starts on it. Once
  // per navigation (location key): a refetch that shows the placeholder and
  // the content again must not pull focus back.
  const focusedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isReady || location.hash !== SKILLS_BY_STAGE_HASH) return;
    const navigation = location.key ?? location.pathname + location.search;
    if (focusedFor.current === navigation) return;
    const heading = document.getElementById(SKILLS_BY_STAGE_HEADING_ID);
    if (heading == null) return;
    focusedFor.current = navigation;
    heading.scrollIntoView?.();
    heading.focus();
  }, [
    isReady,
    location.hash,
    location.key,
    location.pathname,
    location.search,
  ]);

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
          archetype={migration.archetype ?? archetypes[0]}
          linkTo={linkTo}
        />
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
  // The latest run ran another plan than the one the next run uses. Without
  // the run's plan nothing is said: it is never guessed from the run name.
  const ranOtherPlan =
    migration.planRunPlan != null &&
    migration.plan != null &&
    migration.planRunPlan.id !== migration.plan.id;
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
          planRun={planRun}
          linkTo={linkTo}
        />
        <DetailSection
          // A named region, like Skills by stage below it.
          headingId="migration-stages-heading"
          title={t("agentic.stageRunsTable.label")}
          description={
            ranOtherPlan ? (
              // Names both plans, so the Stages above (the run's plan) and
              // Skills by stage below (this application's plan) do not read
              // as one plan. The run's own name often
              // holds its plan's name, so the link says "latest run".
              <Trans
                i18nKey="agentic.execution.latestRunOtherPlan"
                values={{
                  plan: migration.planRunPlan?.name,
                  ownPlan: migration.plan?.name,
                }}
                components={{
                  runLink: migration.planRun ? (
                    <Link to={linkTo(planRunPath(migration.planRun.id))} />
                  ) : (
                    <span />
                  ),
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
            <EmptyState variant="xs">
              <EmptyStateBody>{t("agentic.execution.noRunYet")}</EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button
                    variant="link"
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
        <DetailSection
          id={SKILLS_BY_STAGE_ID}
          headingId={SKILLS_BY_STAGE_HEADING_ID}
          title={t("agentic.stageSkills.title")}
          description={
            migration.plan != null && migration.skills != null
              ? t("agentic.execution.skillsByStageNext", {
                  plan: migration.plan.name,
                })
              : undefined
          }
        >
          <StageSkillsTable
            skills={migration.skills}
            context="application"
            linkTo={linkTo}
            originOptions={{
              archetypeId: migration.archetype?.id,
              thisApplicationId: applicationId,
            }}
            unavailableText={t("agentic.execution.skillsByStageUnavailable")}
            aria-label={t("agentic.stageSkills.title")}
          />
        </DetailSection>
      </DetailSections>

      {runMigrationPlan.modal}
    </>
  );
};

/**
 * The facts: Status, then the chain that decides the plan
 * (Archetype, Target profile, Migration plan), then Plan run and Target
 * branch once there is a run. Each name links where it is edited.
 */
const MigrationFacts: React.FC<{
  migration: ApplicationMigrationView;
  /** The application's archetypes; the target profile's comes first. */
  archetypes: Ref[];
  planRun?: PlanRun;
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
}> = ({ migration, archetypes, planRun, linkTo }) => {
  const { t } = useTranslation();
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );
  const none = <EmptyTextMessage message={t("agentic.execution.none")} />;
  const targetBranch = migration.result?.targetBranch ?? planRun?.targetBranch;
  const to = (path: string) => linkToPath(linkTo, path);

  // The target profile's archetype first, then the others by name.
  const chainArchetype = migration.archetype;
  const orderedArchetypes: Ref[] = [
    ...(chainArchetype != null ? [chainArchetype] : []),
    ...[...archetypes]
      .filter((archetype) => archetype.id !== chainArchetype?.id)
      .sort((a, b) => universalComparator(a.name, b.name)),
  ];

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
      orderedArchetypes.length > 1
        ? t("agentic.execution.archetypes")
        : t("agentic.execution.archetype"),
      orderedArchetypes.length === 0 ? (
        none
      ) : orderedArchetypes.length === 1 ? (
        <Link to={to(archetypePath(orderedArchetypes[0].id, "skills"))}>
          {orderedArchetypes[0].name}
        </Link>
      ) : (
        <LinkLabels
          items={orderedArchetypes.map((archetype) => ({
            id: archetype.id,
            name: archetype.name,
            to: to(archetypePath(archetype.id, "skills")),
          }))}
        />
      ),
    ],
    [
      t("agentic.execution.targetProfile"),
      migration.targetProfile == null ? (
        none
      ) : migration.archetype != null ? (
        <Link
          to={to(
            targetProfilePath(
              migration.archetype.id,
              migration.targetProfile.id
            )
          )}
        >
          {migration.targetProfile.name}
        </Link>
      ) : (
        migration.targetProfile.name
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
    ...(migration.planRun
      ? ([
          [
            t("agentic.entity.planRun"),
            <Link key="run" to={linkTo(planRunPath(migration.planRun.id))}>
              {migration.planRun.name}
            </Link>,
          ],
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
 * archetype's target profile, so the body names the missing link of that
 * chain (no archetype, no target profile, no plan on the profile) and the
 * action goes where it is fixed.
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
  const body =
    archetype == null
      ? t("agentic.execution.noArchetypeBody")
      : migration.targetProfile == null
        ? t("agentic.execution.noTargetProfileBody", {
            archetype: archetype.name,
          })
        : t("agentic.execution.noPlanForProfileBody", {
            profile: migration.targetProfile.name,
            archetype: archetype.name,
          });
  return (
    <EmptyState
      headingLevel="h2"
      icon={RouteIcon}
      titleText={t("agentic.execution.noMigrationPathTitle")}
      variant="sm"
    >
      <EmptyStateBody>{body}</EmptyStateBody>
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
