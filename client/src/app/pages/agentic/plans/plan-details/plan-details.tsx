import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { generatePath, useHistory, useParams } from "react-router-dom";
import {
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Tab,
  TabTitleText,
  Tabs,
  Tooltip,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import {
  MigrationPlan,
  ResolvePlanSkillsRequest,
  getPlanConfigurationChecks,
  getPlanTargetProfiles,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { adminViewScopes } from "@app/auth/roles-to-scopes";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PageHeader } from "@app/components/PageHeader";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  DetailTabPanel,
  EntityDetailActions,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import {
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  planSkillsState,
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlanById,
  useFetchPlanRuns,
  useResolvePlanSkills,
} from "@app/queries/agentic";
import { plansWriteScopes } from "@app/scopes";

import { ConfigurationStatus } from "../../components/agentic-status";
import { CountLink } from "../../components/count-link";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  LinkLabels,
} from "../../components/detail-section";
import { PlanRunsTable } from "../../components/plan-runs-table";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import { searchWithFrom } from "../../components/skill-origin";
import { StageSkillsTable } from "../../components/stage-skills-table";
import { PlanConfigurationAlert } from "../components/plan-configuration-alert";
import {
  getPlanDeleteBlocker,
  useDeletePlanDialog,
} from "../components/plan-delete";
import { planApplicationsLocation } from "../components/plan-paths";
import { getRunBlocker, preflightPlanOf } from "../components/plan-run-blocker";
import { StagesTable } from "../components/stages-table";
import { PlanWizard } from "../plan-wizard/plan-wizard";

interface PlanDetailsRouteParams {
  planId: string;
}

/**
 * "View models" appears only for users who can open Models: the route needs `adminViewScopes`
 * (`Routes.tsx`) and the page reads gateways. Architects hold neither admin view scope, so they get no link.
 */
const modelsReadScopes = ["agentic.gateways:get"];

const PLAN_DETAIL_TABS = ["details", "runs"] as const;
type PlanDetailTab = (typeof PLAN_DETAIL_TABS)[number];

const tabTitleKeys: Record<PlanDetailTab, string> = {
  details: "agentic.planDetail.tabDetails",
  runs: "agentic.planDetail.tabRuns",
};

const PANEL_PREFIX = "plan-detail";
const panelId = (tab: PlanDetailTab) => tabPanelId(PANEL_PREFIX, tab);

/**
 * Every archetype + target profile pair of the plan's path as link labels
 * ("Quarkus 3.x (Java EE Application)"), plus the unassigned cue. A path
 * without target profiles reads Not assigned too: no profile can use it.
 */
const TargetProfilesFact: React.FC<{
  plan: MigrationPlan;
  linkCrumbs: BreadcrumbEntry[];
}> = ({ plan, linkCrumbs }) => {
  const { t } = useTranslation();
  const pairs = getPlanTargetProfiles(plan);
  // The cue opens the Target profiles page of the path's archetype.
  const profilesLink = useLinkComponent(
    pairs.length === 0
      ? undefined
      : breadcrumbTo(targetProfilesPath(pairs[0].archetype.id), "", linkCrumbs)
  );
  if (pairs.length === 0) {
    // A plan without a migration path runs when someone picks it: "Not
    // assigned", not a failed read.
    return <EmptyTextMessage message={t("agentic.execution.notAssigned")} />;
  }
  return (
    <>
      <LinkLabels
        items={pairs.map(({ archetype, targetProfile }) => ({
          id: `${archetype.id}-${targetProfile.id}`,
          name: t("agentic.skill.targetProfileOption", {
            profile: targetProfile.name,
            archetype: archetype.name,
          }),
          to: breadcrumbTo(
            targetProfilePath(archetype.id, targetProfile.id),
            "",
            linkCrumbs
          ),
        }))}
      />
      {plan.migrationPath?.isDefault === false && (
        <Content component="small" className={textStyles.textColorSubtle}>
          {t("agentic.plan.notAssignedCue")}{" "}
          <Button variant="link" isInline component={profilesLink}>
            {t("agentic.plan.viewTargetProfiles")}
          </Button>
        </Content>
      )}
    </>
  );
};

const PlanDetailsPage: React.FC = () => {
  const { t } = useTranslation();
  const canManagePlans = useHasSomeScopes(plansWriteScopes);
  const canOpenAdministration = useHasSomeScopes(adminViewScopes);
  const canReadModels = useHasSomeScopes(modelsReadScopes);
  const canViewModels = canOpenAdministration && canReadModels;
  const history = useHistory();
  const { planId } = useParams<PlanDetailsRouteParams>();
  const { migrationPlan, isLoading, fetchError, isNotFound } =
    useFetchMigrationPlanById(planId);
  const {
    agents,
    isLoading: isLoadingAgents,
    fetchError: agentsFetchError,
  } = useFetchAgents();
  const {
    gateways,
    isLoading: isLoadingModels,
    fetchError: modelsFetchError,
  } = useFetchGateways();
  const {
    planRuns,
    isLoading: isLoadingRuns,
    fetchError: runsFetchError,
  } = useFetchPlanRuns(planId);
  // The same server resolution the wizard shows, for the saved plan and its
  // exclusions.
  const skillsRequest = React.useMemo<ResolvePlanSkillsRequest | undefined>(
    () =>
      migrationPlan == null
        ? undefined
        : {
            stages: [...migrationPlan.stages]
              .sort((a, b) => a.order - b.order)
              .map((stage) => ({
                agent: { id: stage.agent.id },
                name: stage.name,
              })),
            migrationPath:
              migrationPlan.migrationPath != null
                ? {
                    archetype: { id: migrationPlan.migrationPath.archetype.id },
                    targetProfiles:
                      migrationPlan.migrationPath.targetProfiles.map(
                        (profile) => ({ id: profile.id })
                      ),
                  }
                : undefined,
            excludedSkills: (migrationPlan.excludedSkills ?? []).map(
              (skill) => ({ id: skill.id })
            ),
          },
    [migrationPlan]
  );
  const skillsQuery = useResolvePlanSkills(skillsRequest);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  // Leave before the next render: this page would refetch the deleted plan (404).
  const { requestDelete, dialog: deleteDialog } = useDeletePlanDialog(() =>
    flushSync(() => history.push(DevPaths.migrationPlans))
  );

  const [activeTab, setActiveTab] = useUrlTab(PLAN_DETAIL_TABS, "details");

  const { breadcrumbs, linkCrumbs: planChildCrumbs } = useEntityBreadcrumbs(
    migrationPlan?.name ?? t("agentic.entity.migrationPlan"),
    [
      {
        title: t("sidebar.plans"),
        path: DevPaths.migrationPlans,
      },
    ]
  );
  const launcher = useRunMigrationPlanLauncher({ linkCrumbs: planChildCrumbs });

  if (!migrationPlan) {
    if (isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound || fetchError == null}
        notFoundTitle={t("agentic.plan.notFoundTitle")}
        notFoundBody={t("agentic.plan.notFoundBody")}
        backLabel={t("agentic.plan.backToPlans")}
        backPath={DevPaths.migrationPlans}
      />
    );
  }

  const path = migrationPlan.migrationPath;
  const impact = migrationPlan.applicationImpact;
  const runCount = migrationPlan.runCount;
  const isLoadingConfiguration = isLoadingAgents || isLoadingModels;
  const loadedAgents =
    isLoadingAgents || agentsFetchError != null ? undefined : agents;
  const loadedModels =
    isLoadingModels || modelsFetchError != null ? undefined : gateways;
  const configurationChecks = getPlanConfigurationChecks(
    migrationPlan,
    loadedAgents,
    loadedModels
  );
  const runBlockedReason = getRunBlocker(migrationPlan, canManagePlans, t);
  // Runs the plan's own applications, the plan fixed (undefined without the run scope).
  const runPlan =
    launcher.open != null
      ? () =>
          launcher.open?.(
            impact?.applications ?? [],
            preflightPlanOf(migrationPlan)
          )
      : undefined;
  const notEvaluatedDetails = configurationChecks
    .filter((check) => check.status === "notEvaluated")
    .map((check) => t(check.detailKey, check.detailValues))
    .join(" ");
  const configurationStatus = (
    <ConfigurationStatus checks={configurationChecks} />
  );
  const childLink = (pathname: string) =>
    breadcrumbTo(pathname, `?from=plan-${migrationPlan.id}`, planChildCrumbs);

  // After an edit the previous plan's rows are not shown while the saved
  // plan resolves: their exclusions can be out of date.
  const skillsState = planSkillsState(skillsQuery);
  // Skill origins keep their own query or anchor, plus this page's origin.
  const skillLinkTo = (pathname: string, search: string) =>
    breadcrumbTo(
      pathname,
      searchWithFrom(search, `plan-${migrationPlan.id}`),
      planChildCrumbs
    );

  // The configuration alert says what is wrong; the Configuration fact
  // would repeat it with another count, so it shows only without the alert
  // (Ready, Not evaluated).
  const hasConfigurationIssue = configurationChecks.some(
    (check) => check.status === "issue"
  );
  const facts: [string, React.ReactNode][] = [
    [
      t("terms.targetProfiles"),
      <TargetProfilesFact
        key="profiles"
        plan={migrationPlan}
        linkCrumbs={planChildCrumbs}
      />,
    ],
    [
      t("terms.applications"),
      impact == null ? (
        <EmptyTextMessage message={t("agentic.common.unavailable")} />
      ) : impact.matching === 0 ? (
        <EmptyTextMessage message={t("terms.none")} />
      ) : (
        <CountLink
          to={planApplicationsLocation(migrationPlan.id, planChildCrumbs)}
        >
          {t("agentic.plan.applicationCount", { count: impact.matching })}
        </CountLink>
      ),
    ],
    [
      t("agentic.plan.runs"),
      runCount == null ? (
        <EmptyTextMessage message={t("agentic.common.unavailable")} />
      ) : runCount === 0 ? (
        <EmptyTextMessage message={t("terms.none")} />
      ) : (
        // The Runs tab of this page: switch tabs, do not navigate.
        <Button
          variant="link"
          isInline
          className={textStyles.textNowrap}
          onClick={() => setActiveTab("runs")}
        >
          {t("agentic.plan.runCount", { count: runCount })}
        </Button>
      ),
    ],
  ];
  if (!hasConfigurationIssue) {
    facts.push([
      t("agentic.plan.configuration"),
      isLoadingConfiguration ? (
        <Skeleton width="8rem" screenreaderText={t("terms.loading")} />
      ) : notEvaluatedDetails ? (
        <Tooltip content={notEvaluatedDetails}>
          <span tabIndex={0}>{configurationStatus}</span>
        </Tooltip>
      ) : (
        configurationStatus
      ),
    ]);
  }

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={migrationPlan.name}
          breadcrumbs={breadcrumbs}
          description={
            migrationPlan.description ? (
              <Content component="p">{migrationPlan.description}</Content>
            ) : undefined
          }
          btnActions={
            canManagePlans || runPlan != null ? (
              <EntityDetailActions
                items={
                  runPlan != null
                    ? [
                        {
                          key: "run",
                          label: t("agentic.execution.startMigration"),
                          onClick: runPlan,
                          disabledReason: runBlockedReason,
                        },
                      ]
                    : []
                }
                onEdit={canManagePlans ? () => setIsEditOpen(true) : undefined}
                onDelete={
                  canManagePlans
                    ? () => requestDelete(migrationPlan)
                    : undefined
                }
                deleteDisabledReason={getPlanDeleteBlocker(migrationPlan, t)}
                managedReason={
                  migrationPlan.operatorManaged
                    ? t("agentic.common.managedByKonveyor")
                    : undefined
                }
              />
            ) : undefined
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs
          activeKey={activeTab}
          onSelect={(_e, key) => setActiveTab(key)}
          tabListAriaLabel={t("agentic.planDetail.tabsLabel")}
        >
          {PLAN_DETAIL_TABS.map((tab) => (
            <Tab
              key={tab}
              eventKey={tab}
              id={panelId(tab)}
              tabContentId={panelId(tab)}
              title={<TabTitleText>{t(tabTitleKeys[tab])}</TabTitleText>}
            />
          ))}
        </Tabs>
      </PageSection>

      <DetailTabPanel
        prefix={PANEL_PREFIX}
        eventKey="details"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <DetailSections>
            {hasConfigurationIssue && (
              <PlanConfigurationAlert
                plan={migrationPlan}
                checks={configurationChecks}
                agents={loadedAgents ?? []}
                models={loadedModels ?? []}
                canViewModels={canViewModels}
                onEdit={canManagePlans ? () => setIsEditOpen(true) : undefined}
              />
            )}
            <DetailFacts facts={facts} />
            <DetailSection
              title={t("agentic.plan.stages")}
              description={t("agentic.plan.stagesDescription")}
            >
              <StagesTable
                aria-label={t("agentic.plan.stages")}
                rows={[...migrationPlan.stages]
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => ({
                    key: stage.id,
                    name: stage.name,
                    agentId: stage.agent.id,
                    agentName: stage.agent.name,
                    instructions: stage.instructions,
                    requiresApproval: stage.requiresApproval,
                  }))}
                agents={loadedAgents}
                models={loadedModels}
                isLoading={isLoadingConfiguration}
                agentLinkTo={(agentId) =>
                  childLink(generatePath(DevPaths.agentDetails, { agentId }))
                }
              />
            </DetailSection>
            <DetailSection
              title={t("agentic.stageSkills.title")}
              // The Every stage note sits here, after the first sentence:
              // the table's Every stage title carries only the subtitle that
              // every context shows.
              description={t("agentic.planDetail.skillsByStageDescription", {
                everyStage:
                  path != null
                    ? t("agentic.stageSkills.everyStagePlanNote")
                    : t("agentic.stageSkills.everyStageNoPath"),
              })}
            >
              <StageSkillsTable
                skills={
                  skillsState === "ready"
                    ? skillsQuery.skillsByStage
                    : undefined
                }
                context="plan"
                linkTo={skillLinkTo}
                originOptions={{ archetypeId: path?.archetype.id }}
                // The Stages table above uses 0 and up.
                rowIndexOffset={100}
                unavailableText={t("agentic.planDetail.skillsNotAvailable")}
                aria-label={t("agentic.stageSkills.title")}
                isLoading={skillsState === "loading"}
                isError={skillsState === "error"}
                onRetry={() => void skillsQuery.refetch()}
              />
            </DetailSection>
          </DetailSections>
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={PANEL_PREFIX}
        eventKey="runs"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          {isLoadingRuns || runsFetchError != null ? (
            // The spinner and error rows of the table.
            <DetailSection title={t("agentic.planDetail.runsTitleEmpty")}>
              <PlanRunsTable
                runs={[]}
                isLoading={isLoadingRuns}
                fetchError={runsFetchError}
                showPlan={false}
                linkTo={(pathname, search = "") =>
                  breadcrumbTo(pathname, search, planChildCrumbs)
                }
              />
            </DetailSection>
          ) : planRuns.length === 0 ? (
            <DetailSection title={t("agentic.planDetail.runsTitleEmpty")}>
              <EmptyState variant="xs">
                <EmptyStateBody>
                  {t("agentic.planDetail.runsEmptyDescription")}
                </EmptyStateBody>
                {runPlan != null && (
                  <EmptyStateFooter>
                    <EmptyStateActions>
                      {runBlockedReason != null ? (
                        <Tooltip content={runBlockedReason}>
                          <Button variant="link" isAriaDisabled>
                            {t("agentic.execution.startMigration")}
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button variant="link" onClick={runPlan}>
                          {t("agentic.execution.startMigration")}
                        </Button>
                      )}
                    </EmptyStateActions>
                  </EmptyStateFooter>
                )}
              </EmptyState>
            </DetailSection>
          ) : (
            <DetailSection
              title={t("agentic.planDetail.runsTitle", {
                count: planRuns.length,
              })}
              description={t("agentic.planDetail.runsDescription")}
            >
              <PlanRunsTable
                runs={planRuns}
                showPlan={false}
                linkTo={(pathname, search = "") =>
                  breadcrumbTo(pathname, search, planChildCrumbs)
                }
                origin={`?from=plan-${migrationPlan.id}`}
              />
            </DetailSection>
          )}
        </PageSection>
      </DetailTabPanel>

      <PlanWizard
        isOpen={isEditOpen}
        plan={migrationPlan}
        onClose={() => setIsEditOpen(false)}
      />
      {deleteDialog}
      {launcher.modal}
    </>
  );
};

export default PlanDetailsPage;
