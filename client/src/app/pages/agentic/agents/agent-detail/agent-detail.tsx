import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useHistory, useParams } from "react-router-dom";
import {
  ButtonVariant,
  Content,
  EmptyState,
  EmptyStateBody,
  Label,
  PageSection,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { AgentDetailsRoute, DevPaths } from "@app/Paths";
import { ControllerRunPhase, EntityId } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  DetailTabPanel,
  EntityDetailActions,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteAgentMutation,
  useFetchAgentById,
  useFetchAgentTestRuns,
  useFetchGateways,
  useFetchMigrationPlans,
  useFetchPlanRuns,
} from "@app/queries/agentic";
import { agenticAgentRunsWriteScopes, agentsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { RunStatus } from "../../components/agentic-status";
import {
  getPlansUsingAgent,
  useAgentDeleteBlockedReason,
} from "../agent-usage";
import { AgentFormModal } from "../components/agent-form-modal";
import { AgentTestModal } from "../components/agent-test-modal";

import { AgentDetailsTab } from "./agent-details-tab";

const AGENT_DETAIL_TABS = ["details", "runs"] as const;
type AgentDetailTab = (typeof AGENT_DETAIL_TABS)[number];
const TAB_PREFIX = "agent-detail";

const AgentDetail: React.FC = () => {
  const { t } = useTranslation();
  const { agentId } = useParams<AgentDetailsRoute>();
  const history = useHistory();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);
  const canTestAgents = useHasSomeScopes(agenticAgentRunsWriteScopes);
  const deleteBlockedReason = useAgentDeleteBlockedReason();
  const [isTestOpen, setIsTestOpen] = React.useState(false);

  const { agent, isLoading, fetchError, isNotFound, refetch } =
    useFetchAgentById(agentId);
  const {
    migrationPlans,
    isSuccess: hasPlans,
    isLoading: isLoadingPlans,
    fetchError: plansError,
  } = useFetchMigrationPlans();
  const { gateways } = useFetchGateways();
  const { planRuns } = useFetchPlanRuns();
  const { agentTestRuns } = useFetchAgentTestRuns(agentId);

  const [activeTab, setActiveTab] = useUrlTab<AgentDetailTab>(
    AGENT_DETAIL_TABS,
    "details"
  );

  const [editModal, setEditModal, editFormKey] = useFormModalState<true>();
  const isEditOpen = editModal !== null;
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const onDeleteSuccess = () => {
    pushNotification({ title: t("agentic.agent.deleted"), variant: "success" });
    history.push(DevPaths.agents);
  };
  const onDeleteError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };
  const { mutate: deleteAgent } = useDeleteAgentMutation(
    onDeleteSuccess,
    onDeleteError
  );

  // Plans that use this agent in any stage
  const plansUsingAgent = agent
    ? getPlansUsingAgent(agent.id, migrationPlans)
    : [];

  // Agent runs: stage runs whose stage snapshot was assigned to this agent
  const agentRunEntries = React.useMemo(() => {
    if (!agent) return [];
    const entries: Array<{
      key: string;
      planRunId: EntityId;
      planRunName: string;
      planId: EntityId;
      stageName: string;
      stageId: EntityId;
      status: ControllerRunPhase;
      startedAt?: string;
      completedAt?: string;
    }> = [];
    planRuns.forEach((run) => {
      run.stageRuns
        .filter((sr) => sr.agent.id === agent.id)
        .forEach((sr) => {
          entries.push({
            key: `${run.id}-${sr.stageId}`,
            planRunId: run.id,
            planRunName: run.name,
            planId: run.planId,
            stageName: sr.name,
            stageId: sr.stageId,
            status: sr.status,
            startedAt: sr.startedAt,
            completedAt: sr.completedAt,
          });
        });
    });
    return entries.sort((a, b) => {
      const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [agent, planRuns]);

  const { breadcrumbs, linkCrumbs: agentChildCrumbs } = useEntityBreadcrumbs(
    agent?.name ?? t("agentic.entity.agent"),
    [{ title: t("sidebar.agents"), path: DevPaths.agents }]
  );

  if (agent == null) {
    if (isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound || fetchError == null}
        notFoundTitle={t("agentic.agent.notFoundTitle")}
        notFoundBody={t("agentic.agent.notFoundBody")}
        backLabel={t("agentic.agent.backToAgents")}
        backPath={DevPaths.agents}
      />
    );
  }

  const panelId = (tab: AgentDetailTab) => tabPanelId(TAB_PREFIX, tab);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={agent.name}
          description={
            agent.description ? (
              <Content component="p">{agent.description}</Content>
            ) : undefined
          }
          breadcrumbs={breadcrumbs}
          btnActions={
            // Each entry by its own scope; nothing left, no menu (A2, X5).
            <EntityDetailActions
              onEdit={canManageAgents ? () => setEditModal(true) : undefined}
              items={
                canTestAgents
                  ? [
                      {
                        key: "test",
                        label: t("agentic.agent.test"),
                        onClick: () => setIsTestOpen(true),
                      },
                    ]
                  : []
              }
              onDelete={
                canManageAgents ? () => setIsDeleteOpen(true) : undefined
              }
              deleteDisabledReason={deleteBlockedReason(
                hasPlans ? plansUsingAgent.length : undefined
              )}
              managedReason={
                agent.operatorManaged
                  ? t("agentic.common.managedByKonveyor")
                  : undefined
              }
            />
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs activeKey={activeTab} onSelect={(_e, key) => setActiveTab(key)}>
          <Tab
            eventKey="details"
            id={panelId("details")}
            tabContentId={panelId("details")}
            title={
              <TabTitleText>{t("agentic.agentDetail.tabDetails")}</TabTitleText>
            }
          />
          <Tab
            eventKey="runs"
            id={panelId("runs")}
            tabContentId={panelId("runs")}
            title={
              <TabTitleText>{t("agentic.agentDetail.tabRuns")}</TabTitleText>
            }
          />
        </Tabs>
      </PageSection>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="details"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          <AgentDetailsTab
            agent={agent}
            gateway={gateways.find((gateway) => gateway.id === agent.model.id)}
            plansUsingAgent={plansUsingAgent}
            isLoadingPlans={isLoadingPlans}
            plansError={hasPlans ? null : plansError}
            linkCrumbs={agentChildCrumbs}
          />
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel prefix={TAB_PREFIX} eventKey="runs" activeKey={activeTab}>
        <PageSection hasBodyWrapper={false}>
          {agentRunEntries.length === 0 && agentTestRuns.length === 0 ? (
            <EmptyState
              headingLevel="h3"
              icon={CubesIcon}
              titleText={t("agentic.agentDetail.runsEmptyTitle")}
              variant="sm"
            >
              <EmptyStateBody>
                {t("agentic.agentDetail.runsEmptyDescription")}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <Table
              aria-label={t("agentic.agentDetail.runsTableLabel")}
              variant="compact"
            >
              <Thead>
                <Tr>
                  <Th width={25}>{t("agentic.agentDetail.planRun")}</Th>
                  <Th width={20}>{t("agentic.agentDetail.stage")}</Th>
                  <Th width={15}>{t("agentic.agentDetail.runType")}</Th>
                  <Th width={10}>{t("agentic.planRun.status")}</Th>
                  <Th width={15}>{t("agentic.planRun.started")}</Th>
                  <Th width={15}>{t("agentic.planRun.completed")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {agentRunEntries.map((entry) => (
                  <Tr key={entry.key}>
                    <Td dataLabel={t("agentic.agentDetail.planRun")}>
                      <Link
                        to={breadcrumbTo(
                          DevPaths.planRunDetails.replace(
                            ":runId",
                            entry.planRunId.toString()
                          ),
                          `?from=agent-${agentId}`,
                          agentChildCrumbs
                        )}
                      >
                        {entry.planRunName}
                      </Link>
                    </Td>
                    <Td dataLabel={t("agentic.agentDetail.stage")}>
                      <Link
                        to={breadcrumbTo(
                          DevPaths.stageRunDetails
                            .replace(":runId", entry.planRunId.toString())
                            .replace(":stageId", entry.stageId.toString()),
                          `?fromAgent=${agentId}`,
                          agentChildCrumbs
                        )}
                      >
                        {entry.stageName}
                      </Link>
                    </Td>
                    <Td dataLabel={t("agentic.agentDetail.runType")}>
                      <Label color="blue" isCompact>
                        {t("agentic.agentDetail.runTypePlan")}
                      </Label>
                    </Td>
                    <Td dataLabel={t("agentic.planRun.status")}>
                      <RunStatus status={entry.status} />
                    </Td>
                    <Td dataLabel={t("agentic.planRun.started")}>
                      {entry.startedAt
                        ? new Date(entry.startedAt).toLocaleString()
                        : "—"}
                    </Td>
                    <Td dataLabel={t("agentic.planRun.completed")}>
                      {entry.completedAt
                        ? new Date(entry.completedAt).toLocaleString()
                        : "—"}
                    </Td>
                  </Tr>
                ))}
                {agentTestRuns.map((testRun) => (
                  <Tr key={`test-${testRun.id}`}>
                    <Td dataLabel={t("agentic.agentDetail.planRun")}>
                      <Link
                        to={breadcrumbTo(
                          generatePath(DevPaths.applicationDetails, {
                            applicationId: String(testRun.application.id),
                          }),
                          "",
                          agentChildCrumbs
                        )}
                      >
                        {testRun.application.name}
                      </Link>
                    </Td>
                    <Td dataLabel={t("agentic.agentDetail.stage")}>
                      <Content component="small">
                        {testRun.task.length > 60
                          ? `${testRun.task.slice(0, 60)}…`
                          : testRun.task}
                      </Content>
                    </Td>
                    <Td dataLabel={t("agentic.agentDetail.runType")}>
                      <Label color="orange" isCompact>
                        {t("agentic.agentDetail.runTypeTest")}
                      </Label>
                    </Td>
                    <Td dataLabel={t("agentic.planRun.status")}>
                      <RunStatus status={testRun.phase} />
                    </Td>
                    <Td dataLabel={t("agentic.planRun.started")}>
                      {new Date(testRun.startedAt).toLocaleString()}
                    </Td>
                    <Td dataLabel={t("agentic.planRun.completed")}>—</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </PageSection>
      </DetailTabPanel>

      <AgentFormModal
        agent={agent}
        isOpen={isEditOpen}
        formKey={editFormKey}
        onClose={() => {
          setEditModal(null);
          refetch();
        }}
      />

      <AgentTestModal
        agent={isTestOpen ? agent : null}
        onClose={() => setIsTestOpen(false)}
      />

      {isDeleteOpen && (
        <ConfirmDialog
          title={t("agentic.agent.deleteTitle")}
          message={t("agentic.agent.deleteDescription", {
            agent: agent.name,
          })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsDeleteOpen(false)}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={() => {
            deleteAgent(agent.id);
            setIsDeleteOpen(false);
          }}
        />
      )}
    </>
  );
};

export default AgentDetail;
