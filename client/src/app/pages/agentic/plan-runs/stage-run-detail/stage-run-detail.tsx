import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath, useLocation, useParams } from "react-router-dom";
import {
  Alert,
  AlertActionLink,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  ExpandableSection,
  PageSection,
  Popover,
  Skeleton,
  Spinner,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";
import { RhUiQuestionMarkCircleIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths, StageRunDetailsRoute } from "@app/Paths";
import {
  ControllerRunPhase,
  HubRef,
  StageAgentRun,
  getOrderedStageRuns,
  getStageDefinition,
  isTerminalRunPhase,
  stageAgentRunFor,
  stageAttentionApplications,
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
import {
  useFetchMigrationPlanById,
  useFetchPlanRun,
} from "@app/queries/agentic";
import { useFetchStageAgentRuns } from "@app/queries/agentic-observability";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { formatDuration, stageRunDurationSeconds } from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import { AgentRunLogs } from "../../components/agent-run/agent-run-logs";
import { AgentRunResource } from "../../components/agent-run/agent-run-resource";
import { AgentRunTranscript } from "../../components/agent-run/agent-run-transcript";
import {
  ContextUsageValue,
  hasNoUsageYet,
} from "../../components/agent-run/context-usage";
import {
  LiveSentence,
  UpdatedAgo,
} from "../../components/agent-run/live-status";
import {
  formatCost,
  formatTokens,
} from "../../components/agent-run/usage-format";
import { useFillHeight } from "../../components/agent-run/use-fill-height";
import {
  DetailFacts,
  DetailFactsProps,
  DetailSection,
} from "../../components/detail-section";
import { useRunMigrationPlanLauncher } from "../../components/run-migration-plan-launcher";
import { searchWithFrom } from "../../components/skill-origin";
import {
  StageAttentionAlert,
  getStageAttention,
} from "../../components/stage-attention-alert";
import { StageSkillsTable } from "../../components/stage-skills-table";
import {
  RunPageBody,
  RunStatusLine,
  StageApplicationRow,
} from "../components/run-page-layout";
import { StageCommits } from "../components/stage-run-content";
import { useApproveStage } from "../components/use-approve-stage";
import { useSelectedApplication } from "../components/use-selected-application";

const STAGE_TABS = ["details", "transcript", "logs", "yaml"] as const;
const NO_APPLICATIONS: HubRef[] = [];
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
 * The agent run facts of a started stage: Model, Pod,
 * Turns, Compactions, Tokens and Cost; the page adds the context window
 * last. A value the run does not report says so, never 0 or a dash; a
 * running stage that has not reported any usage yet says "Not reported
 * yet".
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
      t("agentic.stageRun.modelId"),
      value(
        usage?.model != null ? (
          <span className={textStyles.fontFamilyMonospace}>{usage.model}</span>
        ) : undefined
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
  ];
};

const StageRunDetail: React.FC = () => {
  const { t } = useTranslation();
  const { runId, stageId } = useParams<StageRunDetailsRoute>();

  const canManageRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);

  const { planRun, isLoading, fetchError, isNotFound } = useFetchPlanRun(runId);
  // The plan's archetype, for the From values of the Skills section.
  const { migrationPlan } = useFetchMigrationPlanById(planRun?.planId);
  // The stage definition comes from the run's snapshot, not the current Plan.
  const stageRun = planRun?.stageRuns.find((sr) => sr.stageId === stageId);
  const stageStatus = stageRun?.status;
  const {
    agentRuns: stageAgentRuns,
    isLoading: isLoadingAgentRuns,
    fetchError: agentRunsError,
    refetch: refetchAgentRuns,
    lastUpdatedAt: agentRunsUpdatedAt,
  } = useFetchStageAgentRuns(runId, stageId, planRun?.status);
  const applications = planRun?.applications ?? NO_APPLICATIONS;
  const {
    isSeveral: hasSeveralApplications,
    selectedId: selectedApplicationId,
    select: selectApplication,
  } = useSelectedApplication({
    applications,
    stageAgentRuns,
    isReady: stageRun != null && !isLoadingAgentRuns,
  });
  // The selected application's agent run for this stage. A run on one
  // application takes the stage's agent run even when it names no
  // application; a run on several never shows another application's.
  const agentRun = hasSeveralApplications
    ? stageAgentRunFor(stageAgentRuns, selectedApplicationId)
    : (stageAgentRunFor(stageAgentRuns, selectedApplicationId) ??
      stageAgentRuns[0]);
  // What the agent run views read: its own phase, which in a run on several
  // applications can differ from the stage's (the worst one).
  const agentRunPhase = agentRun?.phase ?? stageStatus ?? "Pending";
  const agentRunState: AgentRunFactsState = {
    agentRun,
    phase: agentRunPhase,
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
  // In a run on several applications, the applications whose agent run
  // waits for the stage's decision or failed.
  // The decision alert shows on their pages only; on another application's
  // page Details points to them instead.
  const attentionApplications = hasSeveralApplications
    ? stageAttentionApplications(stageAgentRuns, stageStatus, applications)
    : NO_APPLICATIONS;
  const isAttentionHere = attentionApplications.some(
    (application) => application.id === selectedApplicationId
  );
  // Named only when one application needs the person.
  const attentionName =
    attentionApplications.length === 1
      ? attentionApplications[0].name
      : undefined;
  // "Show {application}" moves focus to the application toggle once the
  // selection changed and the pointer is gone.
  const [focusToggle, setFocusToggle] = React.useState(false);
  React.useEffect(() => {
    if (!focusToggle) return;
    setFocusToggle(false);
    document.getElementById("stage-application-toggle")?.focus();
  }, [focusToggle]);
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
  // The Logs tab of this page, keeping the trail and the application.
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

  // In a run on several applications the status line is the selected
  // application's agent run; until it is known, the stage's.
  const lineStatus =
    hasSeveralApplications && agentRun != null
      ? agentRun.phase
      : stageRun.status;
  const lineStartedAt =
    hasSeveralApplications && agentRun != null
      ? agentRun.startedAt
      : stageRun.startedAt;
  // Each application's agent run status for the Select's options. A pending
  // stage has no agent runs: every application is pending.
  const applicationStatuses = new Map<number, ControllerRunPhase>(
    stageRun.status === "Pending"
      ? planRun.applications.map((application) => [application.id, "Pending"])
      : stageAgentRuns.flatMap((candidate) =>
          candidate.application != null
            ? [[candidate.application.id, candidate.phase]]
            : []
        )
  );

  const ordered = getOrderedStageRuns(planRun);
  const position = {
    position: ordered.findIndex((s) => s.stageId === stageRun.stageId) + 1,
    total: ordered.length,
    run: planRun.name,
  };
  // In a run on several applications, the selected agent run's own time,
  // like the status line; a waiting one stops
  // at the stage's last message.
  const durationPhase =
    hasSeveralApplications && agentRun != null
      ? agentRun.phase
      : stageRun.status;
  const duration =
    hasSeveralApplications && agentRun != null
      ? stageRunDurationSeconds({
          status: agentRun.phase,
          startedAt: agentRun.startedAt,
          completedAt: agentRun.completedAt,
          messages:
            agentRun.phase === "AwaitingApproval"
              ? stageRun.messages
              : undefined,
        })
      : stageRunDurationSeconds(stageRun);
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
  // The approval gate is ahead of a gated stage until it succeeds, and of
  // any stage waiting for approval. A gated stage that succeeded without an
  // approval record (for example in an unattended run) says so, never "Not
  // required".
  const isGateAhead =
    stageRun.status === "AwaitingApproval" ||
    (stage.requiresApproval && stageRun.status !== "Succeeded");
  const facts: DetailFactsProps["facts"] = [
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
            durationPhase === "Pending"
              ? t("terms.notStarted")
              : isTerminalRunPhase(durationPhase)
                ? t("agentic.common.unavailable")
                : t("agentic.stageRunsTable.notFinished")
          }
        />
      ),
    ],
    [
      t("agentic.stageRun.approval"),
      stageRun.approvedAt != null ? (
        t("agentic.stageRun.approvedOn", {
          date: formatDate(new Date(stageRun.approvedAt)),
        })
      ) : isGateAhead ? (
        t("agentic.stageRun.approvalRequired")
      ) : stage.requiresApproval ? (
        <EmptyTextMessage message={t("agentic.stageRun.approvalNotRecorded")} />
      ) : (
        <EmptyTextMessage message={t("agentic.stageRun.approvalNotRequired")} />
      ),
    ],
  ];
  // The context window is the agent run's last fact, alone in its row, with
  // the same help as the plan run's Stages table.
  const runFacts: DetailFactsProps["facts"] = [
    ...agentRunFacts,
    [
      t("agentic.agentRun.context.title"),
      <ContextUsageValue
        key="context"
        phase={agentRunPhase}
        usage={agentRun?.usage}
        isLoading={isLoadingAgentRuns}
        isUnavailable={agentRunsError != null && agentRun == null}
      />,
      {
        termHelp: (
          <Popover
            aria-label={t("agentic.agentRun.context.title")}
            bodyContent={t("agentic.planRun.contextHelp")}
            closeBtnAriaLabel={t("actions.close")}
          >
            <Button
              variant="plain"
              hasNoPadding
              aria-label={t("agentic.planRun.contextHelpLabel")}
              icon={<RhUiQuestionMarkCircleIcon />}
            />
          </Popover>
        ),
      },
    ],
  ];
  // Instructions are prose: one paragraph per blank-line-separated block.
  const paragraphs = stage.instructions
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const attention = getStageAttention(planRun, stageRun);
  /**
   * How the attention alert shows:
   * - "decision": the full alert with its actions, on every tab that offers
   *   a decision. A run on one application, the pending explanation, the
   *   application that waits or failed, and a run whose agent runs name no
   *   application (nothing tells the applications apart, as in a run on
   *   one application).
   * - "pointer": another application waits or failed: Details names it and
   *   offers only "Show {application}".
   * - "plain": the agent runs could not be read, so the application that
   *   needs a person is unknown: Details says what happened to the stage,
   *   with no actions.
   * - none while the agent runs load in a run on several applications.
   */
  const alertMode: "decision" | "pointer" | "plain" | undefined =
    attention == null
      ? undefined
      : attention.kind === "pending" || !hasSeveralApplications
        ? "decision"
        : isLoadingAgentRuns
          ? undefined
          : agentRunsError != null && stageAgentRuns.length === 0
            ? "plain"
            : attentionApplications.length === 0 || isAttentionHere
              ? "decision"
              : "pointer";
  // Transcript, Logs and YAML open with the alert of a stage that waits for
  // this user's decision (Approve, or Run migration plan after a failure),
  // in its own section above the view, without "View logs": those tabs
  // already show the agent run. An alert with
  // nothing to decide, and the pending alert, stay on Details.
  const offersDecision =
    (attention?.kind === "approval" && canManageRun) ||
    (attention?.kind === "failed" && runMigrationPlan.open != null);
  const viewAlert = offersDecision && alertMode === "decision" && (
    <StageAttentionAlert
      surface="stage"
      planRun={planRun}
      stageRun={stageRun}
      applicationName={attentionName}
      onApprove={canManageRun ? approve : undefined}
      isDeciding={isApproving}
      onRunMigrationPlan={runMigrationPlan.open}
      wrapper={(alert) => (
        <PageSection hasBodyWrapper={false}>{alert}</PageSection>
      )}
    />
  );
  const panelId = (tab: StageTab) => tabPanelId(TAB_PREFIX, tab);
  const isStarted = stageRun.status !== "Pending";
  const notStarted = (message: string) => (
    <EmptyState variant="xs">
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  );
  /**
   * A view of the stage's agent run (Transcript, Logs, YAML): its "appears
   * when this stage starts" state for a Pending stage ("did not start" once
   * the run has ended), then the view, which owns its own loading, empty and
   * error states. A started stage whose agent run is not listed yet (the
   * controller creates it a moment after the stage starts) waits for it
   * while it can still run, and says the agent never started once it ended.
   */
  const agentRunView = (
    notStartedMessage: string,
    view: (shown: StageAgentRun) => React.ReactNode
  ) => {
    if (!isStarted) {
      // The run ended before this stage started: it never will.
      return notStarted(
        isTerminalRunPhase(planRun.status)
          ? t("agentic.stageRun.agentNeverStarted")
          : notStartedMessage
      );
    }
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
            <>
              {/* The scope (the applications) reads before the status. */}
              <StageApplicationRow
                applications={planRun.applications}
                runId={planRun.id}
                linkCrumbs={stageChildCrumbs}
                selection={{
                  selectedId: selectedApplicationId,
                  onSelect: selectApplication,
                  statuses: applicationStatuses,
                }}
              />
              <RunStatusLine status={lineStatus}>
                {lineStartedAt ? (
                  <Trans
                    i18nKey="agentic.stageRun.statusLineStarted"
                    values={{
                      ...position,
                      started: formatDate(new Date(lineStartedAt)),
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
            </>
          }
        />
      </PageSection>

      <PageSection hasBodyWrapper={false} type="tabs">
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, key) => setActiveTab(key)}
          tabListAriaLabel={t("agentic.stageRun.tabsLabel")}
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
          {attention != null &&
            (alertMode === "pointer" || alertMode === "plain") && (
              // Another application failed or waits (a pointer to it), or the
              // agent runs could not be read: nothing to decide here.
              <Alert
                isInline
                isPlain
                variant={attention.kind === "failed" ? "danger" : "warning"}
                title={
                  attentionName == null
                    ? attention.kind === "failed"
                      ? t("agentic.stageAttention.failedTitle", {
                          stage: stageRun.name,
                        })
                      : t("agentic.stageAttention.approvalTitle", {
                          stage: stageRun.name,
                        })
                    : attention.kind === "failed"
                      ? t("agentic.stageAttention.failedForApplication", {
                          stage: stageRun.name,
                          application: attentionName,
                        })
                      : t(
                          "agentic.stageAttention.approvalTitleForApplication",
                          {
                            stage: stageRun.name,
                            application: attentionName,
                          }
                        )
                }
                actionLinks={
                  alertMode === "pointer" ? (
                    <AlertActionLink
                      onClick={() => {
                        selectApplication(attentionApplications[0].id);
                        // Like the Select, focus lands on the toggle, which
                        // now names that application.
                        setFocusToggle(true);
                      }}
                    >
                      {t("agentic.stageAttention.showApplication", {
                        application: attentionApplications[0].name,
                      })}
                    </AlertActionLink>
                  ) : undefined
                }
              />
            )}
          {attention != null && alertMode === "decision" && (
            <StageAttentionAlert
              surface="stage"
              planRun={planRun}
              stageRun={stageRun}
              applicationName={attentionName}
              viewLogsTo={viewLogsTo}
              onViewLogs={requestLogsFocus}
              onApprove={canManageRun ? approve : undefined}
              isDeciding={isApproving}
              onRunMigrationPlan={runMigrationPlan.open}
            />
          )}
          <DetailFacts facts={facts} isTwoColumn />

          {/* A Pending stage has no agent run yet. */}
          {isStarted && (
            <DetailSection
              title={t("agentic.stageRun.agentRunTitle")}
              description={
                agentRunPhase === "Running" ? (
                  <>
                    {t("agentic.agentRun.refreshesWhileRunning")}
                    {agentRunsUpdatedAt != null && (
                      <>
                        {" "}
                        <UpdatedAgo updatedAt={agentRunsUpdatedAt} />
                      </>
                    )}
                  </>
                ) : undefined
              }
            >
              <DetailFacts facts={runFacts} isTwoColumn />
            </DetailSection>
          )}

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

          {/* What this stage's agent gets: its own group and the selected
              application's Every stage group, from the run's snapshot. */}
          <DetailSection
            title={t("agentic.stageRun.skillsTitle")}
            headingId="stage-run-skills-heading"
            description={
              // Not reported: "Unavailable" and its reason say it all.
              planRun.skills == null
                ? undefined
                : isStarted
                  ? t("agentic.stageRun.skillsDescriptionStarted")
                  : isTerminalRunPhase(planRun.status)
                    ? // The run ended before this stage: it never will run.
                      t("agentic.stageRun.skillsDescriptionNotRun")
                    : t("agentic.stageRun.skillsDescriptionPending")
            }
          >
            <StageSkillsTable
              skills={planRun.skills}
              context="run"
              filter={{
                stageId: stageRun.stageId,
                applicationId: selectedApplicationId,
              }}
              linkTo={(pathname, search) =>
                breadcrumbTo(
                  pathname,
                  searchWithFrom(search ?? "", `run-${runId}`),
                  stageChildCrumbs
                )
              }
              originOptions={{
                archetypeId: migrationPlan?.migrationPath?.archetype.id,
              }}
              // The Run migration plan dialog's tables start at 400.
              rowIndexOffset={100}
              // Until the application is chosen the filter would keep every
              // application's Every stage group.
              isLoading={
                hasSeveralApplications && selectedApplicationId == null
              }
              unavailableText={t("agentic.stageRun.skillsUnavailable")}
              aria-label={t("agentic.stageRun.skillsTitle")}
            />
          </DetailSection>

          {/* A pending stage has done nothing yet; its alert says when it starts. */}
          {isStarted && (
            <StageCommits
              stageRun={stageRun}
              applicationId={selectedApplicationId}
              phase={agentRunPhase}
              isLoading={
                hasSeveralApplications && selectedApplicationId == null
              }
            />
          )}
        </RunPageBody>
      </DetailTabPanel>

      <DetailTabPanel
        prefix={TAB_PREFIX}
        eventKey="transcript"
        activeKey={activeTab}
      >
        {viewAlert}
        <PageSection hasBodyWrapper={false}>
          {agentRunView(t("agentic.stageRun.transcriptNotStarted"), (shown) => (
            <AgentRunTranscript
              agentRun={shown}
              messages={
                shown.application == null ||
                shown.application.id === planRun.applications[0]?.id
                  ? stageRun.messages
                  : undefined
              }
              phase={shown.phase}
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
        {viewAlert}
        <PageSection hasBodyWrapper={false} isFilled>
          {agentRunView(t("agentic.stageRun.logsNotStarted"), (shown) => (
            <FullHeightView>
              {(height) => (
                <AgentRunLogs
                  agentRun={shown}
                  phase={shown.phase}
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
        {viewAlert}
        <PageSection hasBodyWrapper={false} isFilled>
          {agentRunView(t("agentic.stageRun.yamlNotStarted"), (shown) => (
            <FullHeightView>
              {(height) => (
                <AgentRunResource
                  agentRun={shown}
                  phase={shown.phase}
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
