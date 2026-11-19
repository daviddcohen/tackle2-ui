import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath, useLocation, useParams } from "react-router-dom";
import {
  Alert,
  AlertActionLink,
  Content,
  EmptyState,
  EmptyStateBody,
  ExpandableSection,
  PageSection,
  Skeleton,
  Spinner,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths, StageRunDetailsRoute } from "@app/Paths";
import {
  ControllerRunPhase,
  StageAgentRun,
  getOrderedStageRuns,
  getStageDefinition,
  isTerminalRunPhase,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PageHeader } from "@app/components/PageHeader";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import {
  DetailTabPanel,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "@app/pages/agentic/entity-detail";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchPlanRun } from "@app/queries/agentic";
import { useFetchPlanRunAgentRuns } from "@app/queries/agentic-observability";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { formatDuration, stageRunDurationSeconds } from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import { AgentRunLogs } from "../../components/agent-run/agent-run-logs";
import { AgentRunResource } from "../../components/agent-run/agent-run-resource";
import { AgentRunTranscript } from "../../components/agent-run/agent-run-transcript";
import {
  ContextUsage,
  hasNoUsageYet,
} from "../../components/agent-run/context-usage";
import { LiveSentence } from "../../components/agent-run/live-status";
import {
  formatCost,
  formatTokens,
} from "../../components/agent-run/usage-format";
import { useFillHeight } from "../../components/agent-run/use-fill-height";
import { DetailFacts, DetailSection } from "../../components/detail-section";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import {
  StageAttentionAlert,
  getStageAttention,
} from "../../components/stage-attention-alert";
import { RunPageBody, RunStatusLine } from "../components/run-page-layout";
import { StageCommits } from "../components/stage-run-content";
import { useApproveStage } from "../components/use-approve-stage";

const STAGE_TABS = ["details", "transcript", "logs", "yaml"] as const;
type StageTab = (typeof STAGE_TABS)[number];
const TAB_PREFIX = "stage-run-detail";

/**
 * A full height view (the log, the YAML): it reaches the bottom of the page
 * with a floor of 480 px, and the page scrolls when there is less room.
 * The view gets the height and passes it on to its
 * component's height prop. It mounts once the height is known,
 * so the log viewer and the editor lay out at their final size.
 */
const FullHeightView: React.FC<{
  children: (height: number) => React.ReactNode;
}> = ({ children }) => {
  const [ref, height] = useFillHeight<HTMLDivElement>();
  return <div ref={ref}>{height != null && children(height)}</div>;
};

/**
 * How the agent run facts read while the runs load or could not be read,
 * and for a value the run does not report.
 */
interface AgentRunFactsState {
  agentRun?: StageAgentRun;
  /** The stage's status: a running stage may not have reported usage yet. */
  phase: ControllerRunPhase;
  isLoading: boolean;
  isUnavailable: boolean;
}

/**
 * The agent run facts of a started stage: Model, Turns,
 * Compactions, Tokens, Cost and Pod. A value the run does not report says
 * so, never 0 or a dash; a running stage that has not reported any usage
 * yet says "Not reported yet".
 */
const useAgentRunFacts = ({
  agentRun,
  phase,
  isLoading,
  isUnavailable,
}: AgentRunFactsState): [string, React.ReactNode][] => {
  const { t } = useTranslation();
  const usage = agentRun?.usage;
  // A running stage whose agent run is not listed yet is waiting too.
  const isWaiting = hasNoUsageYet(phase, usage);
  const value = (
    shown: React.ReactNode | undefined,
    isUsageReading = false
  ): React.ReactNode => {
    if (isLoading) {
      return (
        <Skeleton
          fontSize="sm"
          width="8ch"
          screenreaderText={t("agentic.stageRun.loadingValue")}
        />
      );
    }
    if (shown != null) return shown;
    if (isUnavailable && agentRun == null) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    if (isUsageReading && isWaiting) {
      return (
        <EmptyTextMessage message={t("agentic.agentRun.notReportedYet")} />
      );
    }
    return (
      <EmptyTextMessage message={t("agentic.agentRun.context.notReported")} />
    );
  };
  const tokens =
    usage?.inputTokens != null && usage.outputTokens != null
      ? t("agentic.stageRun.tokensInputOutput", {
          input: formatTokens(usage.inputTokens),
          output: formatTokens(usage.outputTokens),
        })
      : usage?.inputTokens != null
        ? t("agentic.stageRun.tokensInput", {
            input: formatTokens(usage.inputTokens),
          })
        : usage?.outputTokens != null
          ? t("agentic.stageRun.tokensOutput", {
              output: formatTokens(usage.outputTokens),
            })
          : undefined;
  return [
    [
      t("agentic.stageRun.model"),
      value(
        usage?.model != null ? (
          <span className={textStyles.fontFamilyMonospace}>{usage.model}</span>
        ) : undefined
      ),
    ],
    [
      t("agentic.stageRun.turns"),
      value(
        usage?.turnsUsed == null
          ? undefined
          : usage.maxTurns != null
            ? t("agentic.stageRun.turnsOfMax", {
                used: usage.turnsUsed,
                max: usage.maxTurns,
              })
            : String(usage.turnsUsed),
        true
      ),
    ],
    [
      t("agentic.stageRun.compactions"),
      value(
        usage?.compactions == null ? undefined : usage.compactions > 0 ? (
          String(usage.compactions)
        ) : (
          <EmptyTextMessage message={t("terms.none")} />
        ),
        true
      ),
    ],
    [t("agentic.stageRun.tokens"), value(tokens, true)],
    [
      t("agentic.stageRun.cost"),
      value(
        usage?.cost != null
          ? formatCost(usage.cost, usage.currency)
          : undefined,
        true
      ),
    ],
    [
      t("agentic.stageRun.pod"),
      value(
        agentRun?.podName != null ? (
          <span className={textStyles.fontFamilyMonospace}>
            {agentRun.podName}
          </span>
        ) : undefined
      ),
    ],
  ];
};

const StageRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId, stageId } = useParams<StageRunDetailsRoute>();

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);
  // The stage definition comes from the run's snapshot, not the current Plan.
  const stageRun = planRun?.stageRuns.find((sr) => sr.stageId === stageId);
  const stageStatus = stageRun?.status;
  const {
    agentRuns,
    isLoading: isLoadingAgentRuns,
    fetchError: agentRunsError,
    refetch: refetchAgentRuns,
    lastUpdatedAt: agentRunsUpdatedAt,
  } = useFetchPlanRunAgentRuns(runId, planRun?.status);
  const agentRun = agentRuns.find((candidate) => candidate.stageId === stageId);
  const agentRunState: AgentRunFactsState = {
    agentRun,
    phase: stageStatus ?? "Pending",
    isLoading: isLoadingAgentRuns,
    isUnavailable: agentRunsError != null,
  };
  const agentRunFacts = useAgentRunFacts(agentRunState);

  const [activeTab, setActiveTab] = useUrlTab<StageTab>(STAGE_TABS, "details");
  // "View logs" (the alert, the transcript) lands focus on the log.
  // The request is honoured right away or not at all:
  // when the log cannot show yet (the agent runs are loading or failed),
  // focus goes to the Logs tab panel instead, and leaving the Logs tab drops
  // a request, so focus never jumps later while the user is elsewhere.
  const [logsFocus, setLogsFocus] = React.useState<
    "log" | "panel" | "scroll"
  >();
  const requestLogsFocus = () =>
    setLogsFocus(agentRun != null ? "log" : "panel");
  const onLogsFocused = React.useCallback(() => setLogsFocus(undefined), []);
  React.useEffect(() => {
    if (logsFocus == null) return;
    if (activeTab === "logs" && logsFocus === "panel") {
      document.getElementById(tabPanelId(TAB_PREFIX, "logs"))?.focus();
    }
    if (activeTab !== "logs" || logsFocus === "panel") setLogsFocus(undefined);
  }, [activeTab, logsFocus]);
  // A failed stage opened on its Logs tab (the plan run's "Review stage"
  // link) brings the log into view once, like "View logs", but leaves focus
  // where the page load puts it.
  const isOpenedOnLogs = React.useRef(activeTab === "logs");
  React.useEffect(() => {
    if (!isOpenedOnLogs.current || stageStatus == null || agentRun == null) {
      return;
    }
    isOpenedOnLogs.current = false;
    if (stageStatus === "Failed" && activeTab === "logs")
      setLogsFocus("scroll");
  }, [stageStatus, agentRun, activeTab]);
  // The Logs tab of this page, keeping the trail.
  const location = useLocation();
  const logsSearch = new URLSearchParams(location.search);
  logsSearch.set("tab", "logs");
  const viewLogsTo = {
    pathname: location.pathname,
    search: `?${logsSearch.toString()}`,
    state: location.state,
  };

  const stage = stageRun ? getStageDefinition(stageRun) : undefined;

  const { approve, isApproving } = useApproveStage(runId);

  // The run itself is missing: the page is the run's not found.
  const isRunMissing =
    planRun == null && !isLoading && (isNotFound || fetchError == null);
  const { breadcrumbs, linkCrumbs: stageChildCrumbs } = useEntityBreadcrumbs(
    isRunMissing
      ? t("agentic.entity.planRun")
      : (stage?.name ?? t("agentic.entity.stage")),
    [
      { title: t("sidebar.planRuns"), path: DevPaths.planRuns },
      // While the run loads or fails, its crumb is the noun.
      ...(isRunMissing
        ? []
        : [
            {
              title: planRun?.name ?? t("agentic.entity.planRun"),
              path: generatePath(DevPaths.planRunDetails, { runId }),
            },
          ]),
    ]
  );

  const runMigrationPlan = useRunMigrationPlanLauncher({
    rerunOf: planRun,
    linkCrumbs: stageChildCrumbs,
  });

  if (!planRun || !stageRun || !stage) {
    if (planRun == null && isLoading) {
      return <EntityDetailLoading breadcrumbs={breadcrumbs} />;
    }
    if (planRun == null) {
      // A missing run is the run's not found; any other failure is the
      // error branch under the full trail.
      return (
        <EntityDetailUnavailable
          breadcrumbs={breadcrumbs}
          isNotFound={isRunMissing}
          notFoundTitle={t("agentic.planRun.notFoundTitle")}
          notFoundBody={t("agentic.planRun.notFoundBody")}
          backLabel={t("agentic.planRun.backToPlanRuns")}
          backPath={DevPaths.planRuns}
        />
      );
    }
    // A missing stage of a known run goes back to that run.
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound
        notFoundTitle={t("agentic.stageRun.notFoundTitle")}
        notFoundBody={t("agentic.stageRun.notFoundBody")}
        backLabel={t("agentic.stageRun.backToRun", { run: planRun.name })}
        backPath={generatePath(DevPaths.planRunDetails, { runId })}
      />
    );
  }

  const ordered = getOrderedStageRuns(planRun);
  const position = {
    position: ordered.findIndex((s) => s.stageId === stageRun.stageId) + 1,
    total: ordered.length,
    run: planRun.name,
  };
  const duration = stageRunDurationSeconds(stageRun);
  // The way back to the run, also on a trail that does not pass through it
  // (Agents > agent > stage).
  const runLink = (
    <Link
      to={breadcrumbTo(
        generatePath(DevPaths.planRunDetails, { runId: planRun.id }),
        "",
        stageChildCrumbs
      )}
    />
  );
  // The approval gate is still ahead of a gated stage until it succeeds; one
  // that succeeded without an approval record went on without one (for
  // example in an unattended run).
  const isGateAhead = stage.requiresApproval && stageRun.status !== "Succeeded";
  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.entity.agent"),
      <Link
        key="agent"
        to={breadcrumbTo(
          generatePath(DevPaths.agentDetails, { agentId: stage.agent.id }),
          `?from=run-${runId}`,
          stageChildCrumbs
        )}
      >
        {stage.agent.name}
      </Link>,
    ],
    [
      t("agentic.planRun.duration"),
      duration != null ? (
        formatDuration(duration)
      ) : (
        <EmptyTextMessage
          message={
            stageRun.status === "Pending"
              ? t("terms.notStarted")
              : t("agentic.common.unavailable")
          }
        />
      ),
    ],
    [
      t("agentic.stageRun.approval"),
      stage.requiresApproval && stageRun.approvedAt ? (
        t("agentic.stageRun.approvedOn", {
          date: formatDate(new Date(stageRun.approvedAt)),
        })
      ) : isGateAhead ? (
        t("agentic.stageRun.approvalRequired")
      ) : (
        <EmptyTextMessage message={t("agentic.stageRun.approvalNotRequired")} />
      ),
    ],
  ];
  // A started stage has an agent run: its facts follow the stage's own
  // (Model next to Agent, the usage after Approval). A Pending stage has
  // none yet, so it keeps the three stage facts only.
  if (stageRun.status !== "Pending") {
    const [model, ...usageFacts] = agentRunFacts;
    facts.splice(1, 0, model);
    facts.push(...usageFacts);
  }
  // Instructions are prose: one paragraph per blank-line-separated block.
  const paragraphs = stage.instructions
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const attention = getStageAttention(planRun, stageRun);
  const panelId = (tab: StageTab) => tabPanelId(TAB_PREFIX, tab);
  const isStarted = stageRun.status !== "Pending";
  const notStarted = (message: string) => (
    <EmptyState variant="xs">
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  );
  /**
   * A view of the stage's agent run (Transcript, Logs, YAML): its "appears
   * when this stage starts" state for a Pending stage, then the view, which
   * owns its own loading, empty and error states. A started stage whose
   * agent run is not listed yet (the controller creates it a moment after
   * the stage starts) waits for it while it can still run, and says the
   * agent never started once it ended.
   */
  const agentRunView = (
    notStartedMessage: string,
    view: (shown: StageAgentRun) => React.ReactNode
  ) => {
    if (!isStarted) return notStarted(notStartedMessage);
    if (agentRun != null) return view(agentRun);
    if (isLoadingAgentRuns) {
      return (
        <Spinner size="lg" aria-label={t("agentic.stageRun.loadingView")} />
      );
    }
    if (agentRunsError != null) {
      return (
        <Alert
          isInline
          variant="danger"
          title={t("agentic.stageRun.viewErrorTitle")}
          actionLinks={
            <AlertActionLink onClick={() => refetchAgentRuns()}>
              {t("agentic.agentRun.tryAgain")}
            </AlertActionLink>
          }
        />
      );
    }
    if (isTerminalRunPhase(stageRun.status)) {
      return notStarted(t("agentic.stageRun.agentNeverStarted"));
    }
    return (
      <Stack hasGutter>
        <StackItem>
          <LiveSentence updatedAt={agentRunsUpdatedAt}>
            {t("agentic.agentRun.refreshesWhileRunning")}
          </LiveSentence>
        </StackItem>
        <StackItem>
          {notStarted(t("agentic.stageRun.waitingForAgent"))}
        </StackItem>
      </Stack>
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={stage.name}
          breadcrumbs={breadcrumbs}
          description={
            <RunStatusLine status={stageRun.status}>
              {stageRun.startedAt ? (
                <Trans
                  i18nKey="agentic.stageRun.statusLineStarted"
                  values={{
                    ...position,
                    started: formatDate(new Date(stageRun.startedAt)),
                  }}
                  components={{ runLink }}
                />
              ) : (
                <Trans
                  i18nKey="agentic.stageRun.statusLine"
                  values={position}
                  components={{ runLink }}
                />
              )}
            </RunStatusLine>
          }
        />
      </PageSection>

      {/* The alert and the context window stay above the tabs, so they show
          on every tab. A Pending stage has no context row. */}
      {(attention != null || isStarted) && (
        <RunPageBody>
          {attention != null && (
            <StageAttentionAlert
              surface="stage"
              planRun={planRun}
              stageRun={stageRun}
              viewLogsTo={viewLogsTo}
              onViewLogs={requestLogsFocus}
              onApprove={canManageRun ? approve : undefined}
              isDeciding={isApproving}
              onRunMigrationPlan={runMigrationPlan.open}
            />
          )}
          <ContextUsage
            phase={stageRun.status}
            usage={agentRun?.usage}
            isLoading={isLoadingAgentRuns}
            isUnavailable={agentRunsError != null && agentRun == null}
          />
        </RunPageBody>
      )}

      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, key) => setActiveTab(key)}
          aria-label={t("agentic.stageRun.tabsLabel")}
          mountOnEnter
          unmountOnExit
        >
          <Tab
            eventKey="details"
            id={panelId("details")}
            tabContentId={panelId("details")}
            title={
              <TabTitleText>{t("agentic.stageRun.tabDetails")}</TabTitleText>
            }
          />
          <Tab
            eventKey="transcript"
            id={panelId("transcript")}
            tabContentId={panelId("transcript")}
            title={
              <TabTitleText>{t("agentic.stageRun.tabTranscript")}</TabTitleText>
            }
          />
          <Tab
            eventKey="logs"
            id={panelId("logs")}
            tabContentId={panelId("logs")}
            title={<TabTitleText>{t("agentic.stageRun.tabLogs")}</TabTitleText>}
          />
          <Tab
            eventKey="yaml"
            id={panelId("yaml")}
            tabContentId={panelId("yaml")}
            title={<TabTitleText>{t("agentic.stageRun.tabYaml")}</TabTitleText>}
          />
        </Tabs>
      </PageSection>

      {/* Only the open tab renders, so only its queries load and poll. */}
      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="details"
        activeKey={activeTab}
      >
        <RunPageBody>
          {stageRun.status === "Running" && (
            <LiveSentence updatedAt={agentRunsUpdatedAt}>
              {t("agentic.agentRun.refreshesWhileRunning")}
            </LiveSentence>
          )}
          <DetailFacts facts={facts} isTwoColumn />

          {paragraphs.length > 0 && (
            <DetailSection title={t("agentic.stageRun.instructions")}>
              {/* Long instructions show their first lines; the
                  toggle appears only when the text is cut. */}
              <ExpandableSection
                variant="truncate"
                truncateMaxLines={8}
                toggleTextCollapsed={t("terms.showMore")}
                toggleTextExpanded={t("terms.showLess")}
              >
                <Content>
                  {paragraphs.map((paragraph, index) => (
                    <Content component="p" key={index}>
                      {paragraph}
                    </Content>
                  ))}
                </Content>
              </ExpandableSection>
            </DetailSection>
          )}

          {/* A pending stage has done nothing yet; its alert says when it starts. */}
          {isStarted && <StageCommits stageRun={stageRun} />}
        </RunPageBody>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="transcript"
        activeKey={activeTab}
      >
        <PageSection hasBodyWrapper={false}>
          {agentRunView(t("agentic.stageRun.transcriptNotStarted"), (shown) => (
            <AgentRunTranscript
              agentRun={shown}
              messages={stageRun.messages}
              phase={stageRun.status}
              onViewLogs={() => {
                requestLogsFocus();
                setActiveTab("logs");
              }}
            />
          ))}
        </PageSection>
      </DetailTabPanel>

      {/* The log and the YAML fill the rest of the page, like Task details,
          and never get shorter than 480 px. */}
      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="logs"
        activeKey={activeTab}
        isFilled
      >
        <PageSection hasBodyWrapper={false} isFilled>
          {agentRunView(t("agentic.stageRun.logsNotStarted"), (shown) => (
            <FullHeightView>
              {(height) => (
                <AgentRunLogs
                  agentRun={shown}
                  phase={stageRun.status}
                  height={height}
                  focusRequest={
                    logsFocus === "log"
                      ? "focus"
                      : logsFocus === "scroll"
                        ? "scroll"
                        : undefined
                  }
                  onFocused={onLogsFocused}
                />
              )}
            </FullHeightView>
          ))}
        </PageSection>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="yaml"
        activeKey={activeTab}
        isFilled
      >
        <PageSection hasBodyWrapper={false} isFilled>
          {agentRunView(t("agentic.stageRun.yamlNotStarted"), (shown) => (
            <FullHeightView>
              {(height) => (
                <AgentRunResource
                  agentRun={shown}
                  phase={stageRun.status}
                  height={height}
                />
              )}
            </FullHeightView>
          ))}
        </PageSection>
      </DetailTabPanel>

      {runMigrationPlan.modal}
    </>
  );
};

export default StageRunDetail;
