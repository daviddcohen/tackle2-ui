import * as React from "react";
import { flushSync } from "react-dom";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath, useHistory, useParams } from "react-router-dom";
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
import { CubesIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import { MigrationPlan, getPlanConfigurationChecks } from "@app/agentic";
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
  archetypePath,
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlanById,
  useFetchPlanRuns,
} from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes, plansWriteScopes } from "@app/scopes";

import { ConfigurationStatus } from "../../components/agentic-status";
import { CountLink } from "../../components/count-link";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  LinkLabels,
} from "../../components/detail-section";
import { PlanRunsTable } from "../../components/plan-runs-table";
import { SkillsTable, groupSkillSources } from "../../components/skills-table";
import { PlanConfigurationAlert } from "../components/plan-configuration-alert";
import {
  getPlanDeleteBlocker,
  useDeletePlanDialog,
} from "../components/plan-delete";
import { planApplicationsLocation } from "../components/plan-paths";
import { StagesTable } from "../components/stages-table";
import { PlanWizard } from "../plan-wizard/plan-wizard";

interface PlanDetailsRouteParams {
  planId: string;
}

/**
 * "View models" appears only for users who can open Models (guide 7.3): the route needs `adminViewScopes`
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

/** The plan's target profiles as link labels, plus the unassigned cue (addenda P3, X11). */
const TargetProfilesFact: React.FC<{
  plan: MigrationPlan;
  linkCrumbs: BreadcrumbEntry[];
}> = ({ plan, linkCrumbs }) => {
  const { t } = useTranslation();
  const path = plan.migrationPath;
  const profilesLink = useLinkComponent(
    path == null
      ? undefined
      : breadcrumbTo(targetProfilesPath(path.archetype.id), "", linkCrumbs)
  );
  if (path == null) {
    // The real adapters do not report the path yet: unknown, not empty (X6).
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  if (path.targetProfiles.length === 0) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  return (
    <>
      <LinkLabels
        items={path.targetProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          to: breadcrumbTo(
            targetProfilePath(path.archetype.id, profile.id),
            "",
            linkCrumbs
          ),
        }))}
      />
      {!path.isDefault && (
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
  const canRunPlans = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
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
  const inventoryLink = useLinkComponent(
    breadcrumbTo(DevPaths.applications, "", planChildCrumbs)
  );

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
  const notEvaluatedDetails = configurationChecks
    .filter((check) => check.status === "notEvaluated")
    .map((check) => t(check.detailKey, check.detailValues))
    .join(" ");
  const configurationStatus = (
    <ConfigurationStatus checks={configurationChecks} />
  );
  const childLink = (pathname: string) =>
    breadcrumbTo(pathname, `?from=plan-${migrationPlan.id}`, planChildCrumbs);

  const skillRows =
    migrationPlan.effectiveSkills == null
      ? undefined
      : groupSkillSources(migrationPlan.effectiveSkills);

  const facts: [string, React.ReactNode][] = [
    [
      t("terms.archetype"),
      path ? (
        <Link
          to={breadcrumbTo(
            archetypePath(path.archetype.id),
            "",
            planChildCrumbs
          )}
        >
          {path.archetype.name}
        </Link>
      ) : (
        <EmptyTextMessage message={t("agentic.common.unavailable")} />
      ),
    ],
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
    [
      t("agentic.plan.configuration"),
      isLoadingConfiguration ? (
        <Skeleton width="8rem" screenreaderText={t("terms.loading")} />
      ) : notEvaluatedDetails &&
        !configurationChecks.some((check) => check.status === "issue") ? (
        <Tooltip content={notEvaluatedDetails}>
          <span tabIndex={0}>{configurationStatus}</span>
        </Tooltip>
      ) : (
        configurationStatus
      ),
    ],
  ];

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
            canManagePlans ? (
              <EntityDetailActions
                onEdit={() => setIsEditOpen(true)}
                onDelete={() => requestDelete(migrationPlan)}
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
          aria-label={t("agentic.planDetail.tabsLabel")}
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
            {configurationChecks.some((check) => check.status === "issue") && (
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
            {skillRows == null ? (
              <DetailSection title={t("agentic.planDetail.skillsTitleEmpty")}>
                <EmptyTextMessage message={t("agentic.common.unavailable")} />
              </DetailSection>
            ) : skillRows.length === 0 ? (
              <DetailSection title={t("agentic.planDetail.skillsTitleEmpty")}>
                <EmptyState
                  variant="xs"
                  headingLevel="h3"
                  titleText={t("agentic.planDetail.skillsEmpty")}
                />
              </DetailSection>
            ) : (
              <DetailSection
                title={t("agentic.planDetail.skillsTitle", {
                  count: skillRows.length,
                })}
                description={t("agentic.planDetail.skillsDescription")}
              >
                <SkillsTable rows={skillRows} linkTo={childLink} />
              </DetailSection>
            )}
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
            // The spinner and error rows of the table (addenda X6).
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
              <EmptyState
                headingLevel="h3"
                icon={CubesIcon}
                titleText={t("agentic.planDetail.runsEmptyTitle")}
                variant="sm"
              >
                <EmptyStateBody>
                  {t("agentic.planDetail.runsEmptyDescription")}
                </EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="link" component={inventoryLink}>
                      {t("agentic.planDetail.goToInventory")}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            </DetailSection>
          ) : (
            <DetailSection
              title={t("agentic.planDetail.runsTitle", {
                count: planRuns.length,
              })}
              description={
                canRunPlans ? (
                  <Trans
                    i18nKey="agentic.planDetail.runsDescriptionWithStart"
                    components={{
                      inventoryLink: (
                        <Link
                          to={breadcrumbTo(
                            DevPaths.applications,
                            "",
                            planChildCrumbs
                          )}
                        />
                      ),
                    }}
                  />
                ) : (
                  t("agentic.planDetail.runsDescription")
                )
              }
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
    </>
  );
};

export default PlanDetailsPage;
