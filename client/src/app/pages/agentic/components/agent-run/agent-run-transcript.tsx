import * as React from "react";
import { useTranslation } from "react-i18next";
import ChatbotContent from "@patternfly/chatbot/dist/dynamic/ChatbotContent";
import MessageBox, {
  MessageBoxHandle,
} from "@patternfly/chatbot/dist/dynamic/MessageBox";
import {
  Alert,
  AlertActionLink,
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Skeleton,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import {
  AgentRunRecordingStatus,
  ControllerRunPhase,
  RECORDING_SKIP_REASONS,
  StageAgentRun,
  StageMessage,
  TranscriptEntry,
  isTerminalRunPhase,
} from "@app/agentic";
import { useFetchAgentRunTranscript } from "@app/queries/agentic-observability";

import { SectionEmpty } from "../detail-section";

import { LiveSentence } from "./live-status";
import {
  TRANSCRIPT_CLASS,
  TranscriptDivider,
  TranscriptTurn,
  entryKey,
  entryTime,
  groupTranscript,
  isExpandedByDefault,
} from "./transcript-messages";
import { useFollowLatest } from "./use-follow-latest";

import "@patternfly/chatbot/dist/css/main.css";
import "./agent-run-transcript.css";

const KEY = "agentic.agentRun.transcript";

/**
 * One subtle sentence above the transcript when it has news: it records
 * (in the live sentence shape every stage view uses), or parts of it were
 * not recorded. A complete recording needs no sentence.
 */
const RecordingSentence: React.FC<{
  status: AgentRunRecordingStatus;
  lastUpdatedAt?: number;
}> = ({ status, lastUpdatedAt }) => {
  const { t } = useTranslation();
  if (status === "recording") {
    return (
      <LiveSentence updatedAt={lastUpdatedAt}>
        {t(`${KEY}.recording`)}
      </LiveSentence>
    );
  }
  if (status !== "incomplete") return null;
  return (
    <Content component="small" className={textStyles.textColorSubtle}>
      {t(`${KEY}.incomplete`)}
    </Content>
  );
};

/**
 * The entries as a chat, in PatternFly Chatbot's message box: it scrolls on
 * its own, with jump buttons to the first and the latest entry. While the
 * stage is followed it opens at the latest entry and follows new ones, as
 * long as the reader stays there (`useFollowLatest`), and says how many
 * entries arrived to screen readers.
 */
const TranscriptChat: React.FC<{
  entries: readonly TranscriptEntry[];
  agentName: string;
  isStageRunning: boolean;
  /** The agent is still working: loading dots end the chat. */
  isWorking: boolean;
  boxRef: React.Ref<MessageBoxHandle>;
  /** The jump button scrolls to the latest entry: follow from there on. */
  onScrollToLatest: () => void;
}> = ({
  entries,
  agentName,
  isStageRunning,
  isWorking,
  boxRef,
  onScrollToLatest,
}) => {
  const { t } = useTranslation();
  // Expand and collapse by entry key, the reader's own and the defaults
  // already shown (`isExpandedByDefault`): a running tool call opened on
  // its own stays open once it completes. Kept across refreshes.
  const [toggled, setToggled] = React.useState<ReadonlyMap<string, boolean>>(
    () => new Map()
  );
  const toggle = React.useCallback(
    (key: string, isExpanded: boolean) =>
      setToggled((previous) => new Map(previous).set(key, isExpanded)),
    []
  );
  React.useEffect(() => {
    const opened = entries.filter(
      (entry) =>
        !toggled.has(entryKey(entry)) &&
        isExpandedByDefault(entry, isStageRunning)
    );
    if (opened.length === 0) return;
    setToggled((previous) => {
      const next = new Map(previous);
      opened.forEach((entry) => next.set(entryKey(entry), true));
      return next;
    });
  }, [entries, toggled, isStageRunning]);
  const isExpanded = (entry: TranscriptEntry) =>
    toggled.get(entryKey(entry)) ?? isExpandedByDefault(entry, isStageRunning);

  const items = React.useMemo(() => groupTranscript(entries), [entries]);
  const announcement = useNewEntriesAnnouncement(entries.length, isWorking);
  const backToTop = t(`${KEY}.backToTop`);
  const backToLatest = t(`${KEY}.backToLatest`);
  const last = items[items.length - 1];
  return (
    <MessageBox
      ref={boxRef}
      className={TRANSCRIPT_CLASS}
      ariaLabel={t(`${KEY}.ariaLabel`)}
      announcement={announcement}
      onScrollToBottomClick={onScrollToLatest}
      jumpButtonTopProps={{ "aria-label": backToTop }}
      jumpButtonTopTooltipProps={{ content: backToTop }}
      jumpButtonBottomProps={{ "aria-label": backToLatest }}
      jumpButtonBottomTooltipProps={{ content: backToLatest }}
    >
      {items.map((item, index) => {
        if (item.kind === "divider") {
          return <TranscriptDivider key={item.key} entry={item.entry} />;
        }
        const previous = items[index - 1];
        const previousAt =
          previous == null
            ? undefined
            : previous.kind === "divider"
              ? entryTime(previous.entry)
              : entryTime(previous.entries[0]);
        return (
          <TranscriptTurn
            key={item.key}
            entries={item.entries}
            isUser={item.isUser}
            previousAt={previousAt}
            agentName={agentName}
            expanded={item.entries.map(isExpanded)}
            onToggle={toggle}
            isStageRunning={isStageRunning}
            isWorking={isWorking && item === last && !item.isUser}
          />
        );
      })}
    </MessageBox>
  );
};

/** How long an announcement stays, so the same words can be said again. */
const ANNOUNCEMENT_MS = 1000;

/**
 * What the message box announces while the stage is followed: how many
 * entries arrived since the last refresh. Nothing for the entries already
 * there when the view opens. Each announcement is cleared after a moment,
 * so two batches of the same size are both read.
 */
const useNewEntriesAnnouncement = (count: number, isFollowed: boolean) => {
  const { t } = useTranslation();
  const seen = React.useRef(count);
  const [announcement, setAnnouncement] = React.useState("");
  React.useEffect(() => {
    const added = count - seen.current;
    seen.current = count;
    if (!isFollowed || added <= 0) return;
    setAnnouncement(t(`${KEY}.newEntries`, { count: added }));
    const clear = setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_MS);
    return () => clearTimeout(clear);
  }, [count, isFollowed, t]);
  return announcement;
};

/**
 * The stage's own messages (`StageRun.messages`, from the live ACP session)
 * as transcript messages, for a stage the recorder did not record.
 */
const stageMessageEntries = (
  messages: readonly StageMessage[]
): TranscriptEntry[] =>
  messages.map((message, index) => ({
    kind: "message",
    id: `stage-message-${index}`,
    at: message.timestamp,
    role: message.role,
    text: message.content,
  }));

const NO_MESSAGES: readonly StageMessage[] = [];

export interface AgentRunTranscriptProps {
  agentRun: StageAgentRun;
  /** The agent's name, on its messages; "Agent" when not given. */
  agentName?: string;
  /**
   * The stage's messages from the live session. A stage that was not
   * recorded (approve mode) shows them instead of a transcript, so what
   * the agent said is not lost.
   */
  messages?: readonly StageMessage[];
  /**
   * Phase of the stage: drives how often the transcript refreshes, and a
   * stage that is not Running shows unfinished steps as "Not finished".
   */
  phase: ControllerRunPhase;
  /**
   * Height of the whole view in pixels: the chat takes what the sentence
   * and any alert above it leave, and scrolls inside. Without one the chat
   * is as tall as its messages.
   */
  height?: number;
  /** Opens the stage's logs; offered when there is no transcript. */
  onViewLogs?: () => void;
}

/**
 * The stage's transcript: what the agent said and did, in order, as a chat.
 * The agent's prose reads as Markdown messages, each tool call is a card
 * with its status that expands to its output, thoughts and the plan are
 * their own messages, and runtime notices divide the conversation. While
 * the stage runs the transcript refreshes: unchanged messages do not render
 * again, and expanded cards stay expanded.
 */
export const AgentRunTranscript: React.FC<AgentRunTranscriptProps> = ({
  agentRun,
  agentName,
  messages = NO_MESSAGES,
  phase,
  height,
  onViewLogs,
}) => {
  const { t } = useTranslation();
  const { transcript, isLoading, fetchError, refetch, lastUpdatedAt } =
    useFetchAgentRunTranscript(agentRun.name, phase);
  const isRecording = transcript?.status === "recording";
  const isStageRunning = phase === "Running";
  // A running stage that is not recorded shows its live session messages,
  // which grow too: followed like a recording.
  const isLive =
    isRecording ||
    (isStageRunning && transcript?.status === "skipped" && messages.length > 0);
  const { ref: boxRef, resumeFollowing } = useFollowLatest(isLive);
  const messageEntries = React.useMemo(
    () => stageMessageEntries(messages),
    [messages]
  );
  const name = agentName ?? t(`${KEY}.agentName`);

  if (isLoading) {
    return (
      <Stack hasGutter>
        <Skeleton width="40%" screenreaderText={t(`${KEY}.loading`)} />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </Stack>
    );
  }

  const errorAlert = fetchError != null && (
    <Alert
      variant="danger"
      isInline
      title={t(`${KEY}.error`)}
      actionLinks={
        <AlertActionLink onClick={() => refetch()}>
          {t("agentic.agentRun.tryAgain")}
        </AlertActionLink>
      }
    />
  );
  if (transcript == null) return errorAlert || null;
  // A failed refresh keeps what was read, under the error.
  const withError = (content: React.ReactNode) =>
    errorAlert ? (
      <Stack hasGutter>
        <StackItem>{errorAlert}</StackItem>
        <StackItem>{content}</StackItem>
      </Stack>
    ) : (
      content
    );
  /**
   * A sentence (and the error of a failed refresh) above the chat, which
   * fills the rest of `height`.
   */
  const withChat = (sentence: React.ReactNode, entries: TranscriptEntry[]) => (
    <Flex
      direction={{ default: "column" }}
      flexWrap={{ default: "nowrap" }}
      spaceItems={{ default: "spaceItemsMd" }}
      style={height != null ? { height } : undefined}
    >
      {errorAlert && <FlexItem>{errorAlert}</FlexItem>}
      {sentence != null && <FlexItem>{sentence}</FlexItem>}
      <ChatbotContent>
        <TranscriptChat
          entries={entries}
          agentName={name}
          isStageRunning={isStageRunning}
          isWorking={isLive && isStageRunning}
          boxRef={boxRef}
          onScrollToLatest={resumeFollowing}
        />
      </ChatbotContent>
    </Flex>
  );
  // No recording yet while the stage can still run: the recorder starts
  // once the agent is ready, so the view waits for it (and keeps polling).
  const isWaiting = transcript.status === "none" && !isTerminalRunPhase(phase);

  if (isWaiting) {
    return withError(
      <Stack hasGutter>
        <StackItem>
          <LiveSentence updatedAt={lastUpdatedAt}>
            {t("agentic.agentRun.refreshesWhileRunning")}
          </LiveSentence>
        </StackItem>
        <StackItem>
          <SectionEmpty>{t(`${KEY}.emptyRecording`)}</SectionEmpty>
        </StackItem>
      </Stack>
    );
  }

  if (transcript.status === "skipped" || transcript.status === "none") {
    // Approve mode and askUser are the reasons the UI can name; any
    // other reason, or no recording at all, gets the plain sentence.
    const body =
      transcript.status !== "skipped"
        ? t(`${KEY}.notRecorded`)
        : transcript.skipReason === RECORDING_SKIP_REASONS.approve
          ? t(`${KEY}.skippedApproval`)
          : transcript.skipReason === RECORDING_SKIP_REASONS.askUser
            ? t(`${KEY}.skippedAskUser`)
            : t(`${KEY}.notRecorded`);
    const viewLogs = onViewLogs != null && (
      <Button variant="link" isInline onClick={onViewLogs}>
        {t(`${KEY}.viewLogs`)}
      </Button>
    );
    if (messages.length > 0) {
      // Not recorded, but the live session's messages are known: show them
      // in the same chat, after the sentence that says why. The View logs
      // link that ends it already points to the logs, so the sentence does
      // not say so again.
      return withChat(
        <Content component="small" className={textStyles.textColorSubtle}>
          {body} {t(`${KEY}.liveMessages`)}
          {viewLogs && <> {viewLogs}</>}
        </Content>,
        messageEntries
      );
    }
    return withError(
      <EmptyState
        variant="sm"
        headingLevel="h2"
        titleText={t(`${KEY}.noTranscriptTitle`)}
      >
        <EmptyStateBody>
          {body} {t(`${KEY}.logsShowWhatAgentDid`)}
        </EmptyStateBody>
        {onViewLogs != null && (
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" onClick={onViewLogs}>
                {t(`${KEY}.viewLogs`)}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        )}
      </EmptyState>
    );
  }

  const sentence = (
    <RecordingSentence
      status={transcript.status}
      lastUpdatedAt={lastUpdatedAt}
    />
  );
  if (transcript.entries.length === 0) {
    return withError(
      <Stack hasGutter>
        <StackItem>{sentence}</StackItem>
        <StackItem>
          <SectionEmpty>
            {isRecording ? t(`${KEY}.emptyRecording`) : t(`${KEY}.empty`)}
          </SectionEmpty>
        </StackItem>
      </Stack>
    );
  }
  return withChat(sentence, transcript.entries);
};
