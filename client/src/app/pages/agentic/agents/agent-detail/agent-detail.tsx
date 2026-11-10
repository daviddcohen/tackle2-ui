import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useHistory, useParams } from "react-router-dom";
import {
  ButtonVariant,
  Card,
  CardBody,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { AgentDetailsRoute, DevPaths } from "@app/Paths";
import { ControllerRunPhase, EntityId } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  DetailTabPanel,
  EntityDetailActions,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useDeleteAgentMutation,
  useFetchAgentById,
  useFetchAgentTestRuns,
  useFetchMigrationPlans,
  useFetchPlanRuns,
} from "@app/queries/agentic";
import { agentsWriteScopes } from "@app/scopes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { RunStatusLabel } from "../../components/run-status-label";
import { getPlansUsingAgent } from "../agent-usage";
import { AgentForm } from "../components/agent-form";

const AGENT_DETAIL_TABS = ["details", "runs"] as const;
type AgentDetailTab = (typeof AGENT_DETAIL_TABS)[number];
const TAB_PREFIX = "agent-detail";

const AgentDetail: React.FC = () => {
  const { t } = useTranslation();
  const { agentId } = useParams<AgentDetailsRoute>();
  const history = useHistory();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);

  const { agent, isLoading, fetchError, isNotFound, refetch } =
    useFetchAgentById(agentId);
  const { migrationPlans } = useFetchMigrationPlans();
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
    agent?.name ?? agentId,
    [{ title: t("sidebar.agents"), path: DevPaths.agents }]
  );

  if (agent == null) {
    if (isLoading) {
      return <AppPlaceholder />;
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
          breadcrumbs={breadcrumbs}
          btnActions={
            canManageAgents && (
              <EntityDetailActions
                onEdit={() => setEditModal(true)}
                onDelete={() => setIsDeleteOpen(true)}
                deleteDisabledReason={
                  plansUsingAgent.length > 0
                    ? t("agentic.agent.deleteInUse", {
                        count: plansUsingAgent.length,
                      })
                    : undefined
                }
              />
            )
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
          <Stack hasGutter>
            <StackItem>
              <Card>
                <CardBody>
                  <DescriptionList isHorizontal>
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        {t("terms.description")}
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        {agent.description || "—"}
                      </DescriptionListDescription>
                    </DescriptionListGroup>

                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        {t("agentic.agentDetail.personaPrompt")}
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        <Content
                          component="pre"
                          style={{
                            whiteSpace: "pre-wrap",
                            maxHeight: "200px",
                            overflowY: "auto",
                          }}
                        >
                          {agent.prompt || "—"}
                        </Content>
                      </DescriptionListDescription>
                    </DescriptionListGroup>

                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        {t("agentic.agentDetail.model")}
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        {agent.model.name}
                      </DescriptionListDescription>
                    </DescriptionListGroup>

                    {agent.skills.length > 0 && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.agentDetail.skills")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          <LabelGroup>
                            {agent.skills.map((s) => (
                              <Label
                                key={s.id}
                                variant="outline"
                                render={({ className, content }) => (
                                  <Link
                                    className={className}
                                    to={breadcrumbTo(
                                      generatePath(DevPaths.skillDetails, {
                                        skillId: String(s.id),
                                      }),
                                      `?from=agent-${agent.id}`,
                                      agentChildCrumbs
                                    )}
                                  >
                                    {content}
                                  </Link>
                                )}
                              >
                                {s.name}
                              </Label>
                            ))}
                          </LabelGroup>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}

                    {(agent.skillCollections?.length ?? 0) > 0 && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.agentDetail.skillCollections")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          <LabelGroup>
                            {(agent.skillCollections ?? []).map((c) => (
                              <Label
                                key={c.id}
                                color="teal"
                                render={({ className, content }) => (
                                  <Link
                                    className={className}
                                    to={breadcrumbTo(
                                      generatePath(
                                        DevPaths.skillCollectionDetails,
                                        {
                                          collectionId: String(c.id),
                                        }
                                      ),
                                      `?from=agent-${agent.id}`,
                                      agentChildCrumbs
                                    )}
                                  >
                                    {content}
                                  </Link>
                                )}
                              >
                                {c.name}
                              </Label>
                            ))}
                          </LabelGroup>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}

                    {agent.capabilities.length > 0 && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.agentDetail.capabilities")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                            {agent.capabilities.map((cap, i) => (
                              <li key={i}>{cap}</li>
                            ))}
                          </ul>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}

                    {agent.parameters.length > 0 && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.agentDetail.parameters")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          <Flex direction={{ default: "column" }}>
                            {agent.parameters.map((p, index) => (
                              <FlexItem key={index}>
                                <Label isCompact color="grey">
                                  {p.type}
                                </Label>{" "}
                                <strong>{p.name}</strong>
                                {p.description ? ` — ${p.description}` : ""}
                                {p.defaultValue
                                  ? ` ${t("agentic.agentDetail.parameterDefault", { value: p.defaultValue })}`
                                  : ""}
                              </FlexItem>
                            ))}
                          </Flex>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}

                    {agent.createTime && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          {t("agentic.agentDetail.createdAt")}
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          {new Date(agent.createTime).toLocaleString()}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                  </DescriptionList>
                </CardBody>
              </Card>
            </StackItem>

            {/* Used in migration plans */}
            <StackItem>
              <Content component="h3">
                {t("agentic.agentDetail.usedInPlans")}
              </Content>
              {plansUsingAgent.length === 0 ? (
                <Content
                  component="p"
                  style={{
                    color: "var(--pf-t--global--text--color--subtle)",
                  }}
                >
                  {t("agentic.agentDetail.notUsedInPlans")}
                </Content>
              ) : (
                <Table
                  aria-label={t("agentic.agentDetail.usedInPlans")}
                  variant="compact"
                >
                  <Thead>
                    <Tr>
                      <Th>{t("terms.name")}</Th>
                      <Th>{t("agentic.agentDetail.stagesLabel")}</Th>
                      <Th>{t("terms.description")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {plansUsingAgent.map((plan) => {
                      const stageNames = plan.stages
                        .filter((s) => s.agent.id === agent.id)
                        .map((s) => s.name);
                      return (
                        <Tr key={plan.id}>
                          <Td>
                            <Link
                              to={breadcrumbTo(
                                generatePath(DevPaths.migrationPlanDetails, {
                                  planId: String(plan.id),
                                }),
                                `?from=agent-${agent.id}`,
                                agentChildCrumbs
                              )}
                            >
                              {plan.name}
                            </Link>
                          </Td>
                          <Td>
                            {stageNames.map((name, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && ", "}
                                {name}
                              </React.Fragment>
                            ))}
                          </Td>
                          <Td>{plan.description || "—"}</Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              )}
            </StackItem>
          </Stack>
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
                      <RunStatusLabel status={entry.status} />
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
                      <RunStatusLabel status={testRun.phase} />
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

      <Modal
        id="edit-agent-modal"
        variant="medium"
        isOpen={isEditOpen}
        onClose={() => setEditModal(null)}
      >
        <ModalHeader title={t("agentic.agent.edit")} />
        <ModalBody>
          <AgentForm
            key={editFormKey}
            agent={agent}
            onClose={() => {
              setEditModal(null);
              refetch();
            }}
          />
        </ModalBody>
      </Modal>

      {isDeleteOpen && (
        <ConfirmDialog
          title={t("agentic.agent.deleteTitle", { agent: agent.name })}
          titleIconVariant="warning"
          message={t("agentic.agent.deleteDescription")}
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
