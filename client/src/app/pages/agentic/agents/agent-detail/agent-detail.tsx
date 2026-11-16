import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  ButtonVariant,
  Content,
  PageSection,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";

import { AgentDetailsRoute, DevPaths } from "@app/Paths";
import { useHasSomeScopes } from "@app/auth";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
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

import {
  getPlansUsingAgent,
  useAgentDeleteBlockedReason,
} from "../agent-usage";
import { AgentFormModal } from "../components/agent-form-modal";
import { AgentTestModal } from "../components/agent-test-modal";

import { AgentDetailsTab } from "./agent-details-tab";
import { AgentRunsTab } from "./agent-runs-tab";

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
  const {
    gateways,
    isLoading: isLoadingGateways,
    fetchError: gatewaysError,
  } = useFetchGateways();
  const {
    planRuns,
    isLoading: isLoadingPlanRuns,
    fetchError: planRunsError,
  } = useFetchPlanRuns();
  const {
    agentTestRuns,
    isLoading: isLoadingTestRuns,
    fetchError: testRunsError,
  } = useFetchAgentTestRuns(agentId);

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
            isGatewayUnavailable={
              gatewaysError != null && gateways.length === 0
            }
            isGatewayLoading={isLoadingGateways}
            plansUsingAgent={plansUsingAgent}
            isLoadingPlans={isLoadingPlans}
            plansError={hasPlans ? null : plansError}
            linkCrumbs={agentChildCrumbs}
          />
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel prefix={TAB_PREFIX} eventKey="runs" activeKey={activeTab}>
        <PageSection hasBodyWrapper={false}>
          <AgentRunsTab
            agentId={agent.id}
            planRuns={planRuns}
            isLoadingPlanRuns={isLoadingPlanRuns}
            planRunsError={planRuns.length > 0 ? null : planRunsError}
            testRuns={agentTestRuns}
            isLoadingTestRuns={isLoadingTestRuns}
            testRunsError={agentTestRuns.length > 0 ? null : testRunsError}
            canTestAgent={canTestAgents}
            linkCrumbs={agentChildCrumbs}
          />
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
