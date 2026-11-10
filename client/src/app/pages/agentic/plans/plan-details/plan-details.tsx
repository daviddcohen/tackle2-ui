import "./plan-details.css";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useHistory, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  PageSection,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from "@patternfly/react-core";
import {
  BookOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockIcon,
  MinusCircleIcon,
  SearchIcon,
} from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  Agent,
  EffectiveSkillAssociation,
  MigrationPlan,
  getPlanConfigurationChecks,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { BreadCrumbPath } from "@app/components/BreadCrumbPath";
import { StateError } from "@app/components/StateError";
import { serializeFilterUrlParams } from "@app/hooks/table-controls";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import { DetailTabPanel } from "@app/pages/agentic/entity-detail";
import {
  archetypePath,
  targetProfilePath,
} from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlanById,
  useFetchPlanRuns,
} from "@app/queries/agentic";
import { plansWriteScopes } from "@app/scopes";

import { RunStatusLabel } from "../../components/run-status-label";
import { PlanWizard } from "../plan-wizard/plan-wizard";

interface PlanDetailsRouteParams {
  planId: string;
}

const PlanStageCard: React.FC<{
  plan: MigrationPlan;
  stageIndex: number;
  agents: Agent[];
  planChildCrumbs: BreadcrumbEntry[];
}> = ({ plan, stageIndex, agents, planChildCrumbs }) => {
  const { t } = useTranslation();
  const stage = plan.stages[stageIndex];
  const agent = agents.find((item) => item.id === stage.agent.id);
  const isApproval = stage.requiresApproval;

  return (
    <div className="plan-stage-card">
      <div className="plan-stage-card-header">
        <div className="plan-stage-card-header-left">
          <div
            className={`plan-stage-number ${isApproval ? "plan-stage-number--approval" : "plan-stage-number--auto"}`}
            aria-hidden="true"
          >
            {stageIndex + 1}
          </div>
          <Title headingLevel="h3" size="md">
            {stage.name}
          </Title>
        </div>
        {isApproval && (
          <Label color="orange" isCompact icon={<LockIcon />}>
            {t("agentic.plan.approvalRequired")}
          </Label>
        )}
      </div>
      <div className="plan-stage-card-body">
        <dl className="plan-stage-meta-grid">
          <dt>{t("agentic.plan.agent")}</dt>
          <dd>
            <Link
              to={breadcrumbTo(
                generatePath(DevPaths.agentDetails, {
                  agentId: String(stage.agent.id),
                }),
                `?from=plan-${plan.id}`,
                planChildCrumbs
              )}
            >
              {stage.agent.name}
            </Link>
          </dd>
          <dt>{t("agentic.plan.model")}</dt>
          <dd>{agent?.model.name || t("agentic.plan.notConfigured")}</dd>
          {(agent?.skills?.length ?? 0) > 0 && (
            <>
              <dt>{t("agentic.plan.skills")}</dt>
              <dd>
                {agent?.skills.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 && ", "}
                    <Link
                      to={breadcrumbTo(
                        generatePath(DevPaths.skillDetails, {
                          skillId: String(s.id),
                        }),
                        `?from=plan-${plan.id}`,
                        planChildCrumbs
                      )}
                    >
                      {s.name}
                    </Link>
                  </React.Fragment>
                ))}
              </dd>
            </>
          )}
        </dl>
        {stage.instructions && (
          <div
            className={`plan-stage-instructions ${isApproval ? "plan-stage-instructions--approval" : ""}`}
          >
            {stage.instructions}
          </div>
        )}
      </div>
    </div>
  );
};

const scopeColor = (scope: string): "blue" | "green" | "orange" | "grey" => {
  switch (scope) {
    case "agent":
      return "blue";
    case "targetProfile":
      return "green";
    case "archetype":
      return "orange";
    case "application":
      return "grey";
    default:
      return "grey";
  }
};

const EffectiveSkillsTable: React.FC<{
  skills: EffectiveSkillAssociation[];
  planId: string;
  planChildCrumbs: BreadcrumbEntry[];
}> = ({ skills, planId, planChildCrumbs }) => {
  const { t } = useTranslation();

  if (skills.length === 0) {
    return <Content component="p">{t("agentic.plan.notConfigured")}</Content>;
  }

  return (
    <Table aria-label={t("agentic.plan.effectiveSkills")} variant="compact">
      <Thead>
        <Tr>
          <Th>{t("agentic.plan.skillColumnName")}</Th>
          <Th>{t("agentic.plan.skillColumnResolvedFrom")}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {skills.map((association, index) => (
          <Tr key={`${association.scope}-${association.skill.id}-${index}`}>
            <Td dataLabel={t("agentic.plan.skillColumnName")}>
              <Link
                to={breadcrumbTo(
                  generatePath(DevPaths.skillDetails, {
                    skillId: String(association.skill.id),
                  }),
                  `?from=plan-${planId}`,
                  planChildCrumbs
                )}
              >
                {association.skill.name}
              </Link>
            </Td>
            <Td dataLabel={t("agentic.plan.skillColumnResolvedFrom")}>
              <Flex
                spaceItems={{ default: "spaceItemsXs" }}
                alignItems={{ default: "alignItemsCenter" }}
              >
                <FlexItem>
                  <Label color={scopeColor(association.scope)} isCompact>
                    {t(`agentic.plan.skillScopes.${association.scope}`)}
                  </Label>
                </FlexItem>
                <FlexItem>{association.scopeName}</FlexItem>
              </Flex>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

const PLAN_DETAIL_TABS = ["overview", "runs", "knowledge-base"] as const;
type PlanDetailTab = (typeof PLAN_DETAIL_TABS)[number];

const tabTitleKeys: Record<PlanDetailTab, string> = {
  overview: "agentic.planDetail.tabOverview",
  runs: "agentic.planDetail.tabRuns",
  "knowledge-base": "agentic.planDetail.tabKnowledgeBase",
};

const PANEL_PREFIX = "plan-detail";
const panelId = (tab: PlanDetailTab) => tabPanelId(PANEL_PREFIX, tab);

const PlanDetailsPage: React.FC = () => {
  const { t } = useTranslation();
  const hasManagePlansScope = useHasSomeScopes(plansWriteScopes);
  const canManagePlans = hasManagePlansScope;
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

  const [activeTab, setActiveTab] = useUrlTab(PLAN_DETAIL_TABS, "overview");

  const { breadcrumbs, linkCrumbs: planChildCrumbs } = useEntityBreadcrumbs(
    migrationPlan?.name ??
      (fetchError != null && !isNotFound
        ? planId
        : t("agentic.plan.notFoundTitle")),
    [
      {
        title: t("agentic.plan.plansBreadcrumb"),
        path: DevPaths.migrationPlans,
      },
    ]
  );

  if (isLoading) {
    return <AppPlaceholder />;
  }

  if (!migrationPlan) {
    return (
      <PageSection hasBodyWrapper={false}>
        <BreadCrumbPath breadcrumbs={breadcrumbs} />
        {fetchError != null && !isNotFound ? (
          <StateError />
        ) : (
          <EmptyState
            headingLevel="h1"
            icon={SearchIcon}
            titleText={t("agentic.plan.notFoundTitle")}
          >
            <EmptyStateBody>{t("agentic.plan.notFoundBody")}</EmptyStateBody>
            <Button
              variant="primary"
              onClick={() => history.push(DevPaths.migrationPlans)}
            >
              {t("agentic.plan.backToPlans")}
            </Button>
          </EmptyState>
        )}
      </PageSection>
    );
  }

  const path = migrationPlan.migrationPath;
  const impact = migrationPlan.applicationImpact;
  const effectiveSkills = migrationPlan.effectiveSkills || [];
  const configurationChecks = getPlanConfigurationChecks(
    migrationPlan,
    isLoadingAgents || agentsFetchError != null ? undefined : agents,
    isLoadingModels || modelsFetchError != null ? undefined : gateways
  );
  const hasConfigIssue = configurationChecks.some((c) => c.status === "issue");

  return (
    <>
      {/* Header */}
      <PageSection hasBodyWrapper={false} className="plan-details-header">
        <BreadCrumbPath breadcrumbs={breadcrumbs} />
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsFlexStart" }}
          spaceItems={{ default: "spaceItemsLg" }}
          className="plan-heading"
        >
          <FlexItem>
            <Content component="h1">{migrationPlan.name}</Content>
            <Content component="p">{migrationPlan.description}</Content>
          </FlexItem>
          <FlexItem>
            <Flex spaceItems={{ default: "spaceItemsSm" }}>
              {canManagePlans && (
                <FlexItem>
                  <Button
                    variant="secondary"
                    onClick={() => setIsEditOpen(true)}
                  >
                    {t("agentic.plan.editPlan")}
                  </Button>
                </FlexItem>
              )}
              <FlexItem>
                <Button
                  variant="primary"
                  onClick={() =>
                    history.push({
                      ...breadcrumbTo(
                        DevPaths.applications,
                        "",
                        planChildCrumbs
                      ),
                      // The inventory's Migration plan filter shows exactly
                      // the applications counted in `applicationImpact`.
                      search: new URLSearchParams({
                        filters:
                          serializeFilterUrlParams({
                            migrationPlan: [migrationPlan.id],
                          }).filters ?? "",
                      }).toString(),
                    })
                  }
                >
                  {t("agentic.plan.viewApplicationsCount", {
                    count: impact?.matching ?? 0,
                  })}
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      {/* Tabs */}
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

      {/* Tab: Overview */}
      <DetailTabPanel
        prefix={PANEL_PREFIX}
        eventKey="overview"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          {path ? (
            <Content component="p" className="plan-migration-path-line">
              {t("agentic.plan.migrationPathFor")}{" "}
              <Link
                to={breadcrumbTo(
                  archetypePath(path.archetype.id),
                  "",
                  planChildCrumbs
                )}
              >
                {path.archetype.name}
              </Link>{" "}
              {t("agentic.plan.migrationPathTargeting")}{" "}
              {path.targetProfiles.map((profile, index) => (
                <React.Fragment key={profile.id}>
                  {index > 0 && ", "}
                  <Link
                    to={breadcrumbTo(
                      targetProfilePath(path.archetype.id, profile.id),
                      "",
                      planChildCrumbs
                    )}
                  >
                    {profile.name}
                  </Link>
                </React.Fragment>
              ))}
            </Content>
          ) : (
            <Alert
              isInline
              variant="warning"
              title={t("agentic.plan.noPathTitle")}
            >
              {t("agentic.plan.noPathBody")}
            </Alert>
          )}
          {hasConfigIssue ? (
            <Alert
              isInline
              isPlain
              variant="warning"
              title={t("agentic.plan.checksHaveIssues")}
            >
              <Flex
                spaceItems={{ default: "spaceItemsLg" }}
                alignItems={{ default: "alignItemsCenter" }}
              >
                {configurationChecks.map((check) => (
                  <FlexItem key={check.id}>
                    <Flex
                      spaceItems={{ default: "spaceItemsXs" }}
                      alignItems={{ default: "alignItemsCenter" }}
                    >
                      <FlexItem>
                        {check.status === "passed" ? (
                          <CheckCircleIcon color="var(--pf-t--global--icon--color--severity--success--default)" />
                        ) : check.status === "issue" ? (
                          <ExclamationTriangleIcon color="var(--pf-t--global--icon--color--severity--warning--default)" />
                        ) : (
                          <MinusCircleIcon color="var(--pf-t--global--icon--color--disabled)" />
                        )}
                      </FlexItem>
                      <FlexItem>{t(check.labelKey)}</FlexItem>
                    </Flex>
                  </FlexItem>
                ))}
              </Flex>
            </Alert>
          ) : (
            <Alert
              isInline
              isPlain
              variant="success"
              title={t("agentic.plan.allChecksPassed")}
            >
              <Flex
                spaceItems={{ default: "spaceItemsLg" }}
                alignItems={{ default: "alignItemsCenter" }}
              >
                {configurationChecks.map((check) => (
                  <FlexItem key={check.id}>
                    <Flex
                      spaceItems={{ default: "spaceItemsXs" }}
                      alignItems={{ default: "alignItemsCenter" }}
                    >
                      <FlexItem>
                        <CheckCircleIcon color="var(--pf-t--global--icon--color--severity--success--default)" />
                      </FlexItem>
                      <FlexItem>{t(check.labelKey)}</FlexItem>
                    </Flex>
                  </FlexItem>
                ))}
              </Flex>
            </Alert>
          )}
        </PageSection>
        <PageSection hasBodyWrapper={false}>
          <Title headingLevel="h2" size="xl">
            {t("agentic.plan.stages")}
          </Title>
          <Content component="p">{t("agentic.plan.stagesDescription")}</Content>
          <div className="plan-stage-list">
            {migrationPlan.stages.map((_stage, index) => (
              <PlanStageCard
                key={_stage.id}
                plan={migrationPlan}
                stageIndex={index}
                agents={agents}
                planChildCrumbs={planChildCrumbs}
              />
            ))}
          </div>
        </PageSection>
        <PageSection hasBodyWrapper={false}>
          <Title headingLevel="h2" size="xl">
            {t("agentic.plan.effectiveSkills")}
          </Title>
          <Content component="p" className="plan-effective-skills-help">
            {t("agentic.plan.effectiveSkillsHelp")}
          </Content>
          <EffectiveSkillsTable
            skills={effectiveSkills}
            planId={planId}
            planChildCrumbs={planChildCrumbs}
          />
        </PageSection>
      </DetailTabPanel>

      {/* Tab: Runs */}
      <DetailTabPanel
        prefix={PANEL_PREFIX}
        eventKey="runs"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          {isLoadingRuns ? (
            <AppPlaceholder />
          ) : runsFetchError != null ? (
            <StateError />
          ) : planRuns.length === 0 ? (
            <EmptyState
              headingLevel="h2"
              icon={BookOpenIcon}
              titleText={t("agentic.planDetail.runsEmptyTitle")}
              variant="sm"
            >
              <EmptyStateBody>
                {t("agentic.planDetail.runsEmptyDescription")}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <div>
              {planRuns.map((run) => (
                <Flex
                  key={run.id}
                  alignItems={{ default: "alignItemsCenter" }}
                  spaceItems={{ default: "spaceItemsMd" }}
                  style={{
                    padding: "var(--pf-t--global--spacer--sm) 0",
                    borderBottom:
                      "1px solid var(--pf-t--global--border--color--default)",
                  }}
                >
                  <FlexItem>
                    <Link
                      to={breadcrumbTo(
                        DevPaths.planRunDetails.replace(
                          ":runId",
                          run.id.toString()
                        ),
                        `?from=plan-${migrationPlan.id}`,
                        planChildCrumbs
                      )}
                    >
                      {run.name}
                    </Link>
                  </FlexItem>
                  <FlexItem>
                    <RunStatusLabel status={run.status} />
                  </FlexItem>
                  <FlexItem>
                    <Content component="small">
                      {new Date(run.startedAt).toLocaleString()}
                    </Content>
                  </FlexItem>
                </Flex>
              ))}
            </div>
          )}
        </PageSection>
      </DetailTabPanel>

      {/* Tab: Knowledge Base */}
      <DetailTabPanel
        prefix={PANEL_PREFIX}
        eventKey="knowledge-base"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <EmptyState
            headingLevel="h2"
            icon={BookOpenIcon}
            titleText={t("agentic.planDetail.knowledgeBaseEmptyTitle")}
            variant="sm"
          >
            <EmptyStateBody>
              {t("agentic.planDetail.knowledgeBaseEmptyDescription")}
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      </DetailTabPanel>

      <PlanWizard
        isOpen={isEditOpen}
        plan={migrationPlan}
        onClose={() => setIsEditOpen(false)}
      />
    </>
  );
};

export default PlanDetailsPage;
