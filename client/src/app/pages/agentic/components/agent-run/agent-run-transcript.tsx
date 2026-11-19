import * as React from "react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import {
  Alert,
  AlertActionLink,
  Button,
  CodeBlock,
  CodeBlockCode,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  List,
  ListItem,
  Skeleton,
  Stack,
  StackItem,
  Tooltip,
} from "@patternfly/react-core";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  InfoCircleIcon,
  PendingIcon,
} from "@patternfly/react-icons";
import a11yStyles from "@patternfly/react-styles/css/utilities/Accessibility/accessibility";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import {
  ExpandableRowContent,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import {
  AgentRunRecordingStatus,
  ControllerRunPhase,
  RECORDING_SKIP_REASONS,
  StageAgentRun,
  StageMessage,
  TranscriptEntry,
  TranscriptPlanEntryStatus,
  TranscriptToolCallStatus,
  isTerminalRunPhase,
} from "@app/agentic";
import { IconedStatus } from "@app/components/Icons/IconedStatus";
import { markdownPFComponents } from "@app/components/markdownPFComponents";
import { useFetchAgentRunTranscript } from "@app/queries/agentic-observability";
import { formatDuration } from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import { LiveSentence } from "./live-status";
import { stripAnsi } from "./strip-ansi";
import { unifiedDiff } from "./unified-diff";

const KEY = "agentic.agentRun.transcript";

interface StepPresentation {
  status?: "info" | "success" | "danger";
  icon: React.ComponentType<{ title?: string }>;
  /** Key of its text under `stepStatus`. */
  label: string;
}

/** Tool call and plan entry statuses: icon and text. */
const STEP_STATUS: Record<TranscriptToolCallStatus, StepPresentation> = {
  pending: { icon: PendingIcon, label: "pending" },
  inProgress: { status: "info", icon: InProgressIcon, label: "inProgress" },
  completed: { status: "success", icon: CheckCircleIcon, label: "completed" },
  failed: { status: "danger", icon: ExclamationCircleIcon, label: "failed" },
};

/**
 * A step still in progress when the stage stopped running (failed,
 * finished, waiting for approval) will not move on: "Not finished" with the
 * neutral pending icon, never a spinner, so the transcript does not say
 * something is running when the stage is not. The data
 * stays as recorded.
 */
const NOT_FINISHED: StepPresentation = {
  icon: PendingIcon,
  label: "notFinished",
};

/**
 * A step that had not started when the stage stopped running will not start
 * either: "Not started", not "Pending", which says it still will.
 */
const NOT_STARTED: StepPresentation = {
  icon: PendingIcon,
  label: "notStarted",
};

const stepPresentation = (
  status: TranscriptToolCallStatus,
  isStageRunning: boolean
): StepPresentation => {
  if (status === "inProgress" && !isStageRunning) return NOT_FINISHED;
  if (status === "pending" && !isStageRunning) return NOT_STARTED;
  return STEP_STATUS[status] ?? STEP_STATUS.pending;
};

/** ACP tool kinds with a label; any other kind adds nothing to the title. */
const TOOL_KINDS = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "fetch",
] as const;

/**
 * The kind adds information only when the title does not already say it,
 * as a whole word: "Search the code" says search, while
 * "developer__text_editor: str_replace" does not say edit.
 */
const titleSaysKind = (title: string, kind: string) =>
  new RegExp(`\\b${kind}\\b`, "i").test(title);

/**
 * Expansion is keyed by what stays the same across refetches: a tool call's
 * id, otherwise the entry id (folded in recording order, so stable).
 */
const entryKey = (entry: TranscriptEntry) =>
  entry.kind === "toolCall" && entry.toolCallId !== ""
    ? `tool-${entry.toolCallId}`
    : `entry-${entry.id}`;

const entryTime = (entry: TranscriptEntry) =>
  entry.kind === "gap" ? entry.from : entry.at;

const splitThought = (text: string) => {
  const trimmed = text.trim();
  const newline = trimmed.indexOf("\n");
  return newline === -1
    ? { first: trimmed, rest: "" }
    : {
        first: trimmed.slice(0, newline).trim(),
        rest: trimmed.slice(newline + 1).trim(),
      };
};

/** Prose as paragraphs (there is no pre-wrap utility). */
const Paragraphs: React.FC<{ text: string }> = ({ text }) => (
  <Content>
    {text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph !== "")
      .map((paragraph, index) => (
        <Content component="p" key={index}>
          {paragraph}
        </Content>
      ))}
  </Content>
);

const Markdown: React.FC<{ text: string }> = ({ text }) => (
  <Content>
    <ReactMarkdown components={markdownPFComponents}>{text}</ReactMarkdown>
  </Content>
);

const isExpandable = (entry: TranscriptEntry) => {
  if (entry.kind === "toolCall") {
    return (
      (entry.output != null && entry.output !== "") ||
      (entry.diffs != null && entry.diffs.length > 0)
    );
  }
  return entry.kind === "thought" && splitThought(entry.text).rest !== "";
};

/**
 * Time of day, local like the page header; the date too on the first row
 * and when the day changes. The tooltip adds the UTC time, as the log
 * prints it, so a row can be matched to its log lines.
 */
const TimeCell: React.FC<{ at: string; previous?: string }> = ({
  at,
  previous,
}) => {
  const { t } = useTranslation();
  const time = dayjs(at);
  if (!time.isValid()) return null;
  const newDay = previous == null || !dayjs(previous).isSame(time, "day");
  return (
    <Tooltip
      content={t(`${KEY}.timeTooltip`, {
        local: formatDate(time.toDate()),
        utc: time.toISOString(),
      })}
    >
      <span>
        <time dateTime={at}>
          {time.format(newDay ? "YYYY-MM-DD HH:mm:ss" : "HH:mm:ss")}
        </time>
        {/* The tooltip shows on hover only: screen readers get the UTC
            time too, to match the row to the log. */}
        <span className={a11yStyles.screenReader}>
          {" "}
          {t(`${KEY}.timeUtc`, { utc: time.toISOString() })}
        </span>
      </span>
    </Tooltip>
  );
};

/**
 * One subtle sentence about the recording (above the table); while it
 * records, in the live sentence shape every stage view uses.
 */
const RecordingSentence: React.FC<{
  status: AgentRunRecordingStatus;
  lastUpdatedAt?: number;
  /** Brings the newest entry into view; offered while recording. */
  onGoToLatest?: () => void;
}> = ({ status, lastUpdatedAt, onGoToLatest }) => {
  const { t } = useTranslation();
  if (status === "recording") {
    const sentence = (
      <LiveSentence updatedAt={lastUpdatedAt}>
        {t(`${KEY}.recording`)}
      </LiveSentence>
    );
    if (onGoToLatest == null) return sentence;
    // New entries arrive below the fold: one step to the newest.
    return (
      <Flex
        spaceItems={{ default: "spaceItemsSm" }}
        alignItems={{ default: "alignItemsBaseline" }}
      >
        <FlexItem>{sentence}</FlexItem>
        <FlexItem>
          <Button variant="link" isInline onClick={onGoToLatest}>
            {t(`${KEY}.goToLatest`)}
          </Button>
        </FlexItem>
      </Flex>
    );
  }
  const sentence =
    status === "complete"
      ? t(`${KEY}.complete`)
      : status === "incomplete"
        ? t(`${KEY}.incomplete`)
        : undefined;
  if (sentence == null) return null;
  return (
    <Content component="small" className={textStyles.textColorSubtle}>
      {sentence}
    </Content>
  );
};

const ToolCallSummary: React.FC<{
  entry: Extract<TranscriptEntry, { kind: "toolCall" }>;
  labelId?: string;
  isStageRunning: boolean;
}> = ({ entry, labelId, isStageRunning }) => {
  const { t } = useTranslation();
  const presentation = stepPresentation(entry.status, isStageRunning);
  const kind = (TOOL_KINDS as readonly string[]).includes(entry.toolKind ?? "")
    ? entry.toolKind
    : undefined;
  const showKind = kind != null && !titleSaysKind(entry.title, kind);
  return (
    <Flex
      spaceItems={{ default: "spaceItemsMd" }}
      alignItems={{ default: "alignItemsBaseline" }}
      flexWrap={{ default: "nowrap" }}
    >
      <FlexItem className={textStyles.textNowrap}>
        <IconedStatus
          status={presentation.status}
          icon={<presentation.icon />}
          label={t(`${KEY}.stepStatus.${presentation.label}`)}
        />
      </FlexItem>
      <FlexItem className={textStyles.textBreakWord}>
        <span id={labelId}>{entry.title}</span>
        {showKind && (
          <>
            {" "}
            <span className={textStyles.textColorSubtle}>
              {t(`${KEY}.toolKind.${kind}`)}
            </span>
          </>
        )}
      </FlexItem>
    </Flex>
  );
};

const ToolCallDetails: React.FC<{
  entry: Extract<TranscriptEntry, { kind: "toolCall" }>;
}> = ({ entry }) => (
  <Stack hasGutter>
    {(entry.diffs ?? []).map((diff, index) => (
      <StackItem key={`${diff.path}-${index}`}>
        <Content
          component="p"
          className={`${textStyles.fontFamilyMonospace} ${textStyles.textBreakWord}`}
        >
          {diff.path}
        </Content>
        <CodeBlock>
          <CodeBlockCode>{unifiedDiff(diff)}</CodeBlockCode>
        </CodeBlock>
      </StackItem>
    ))}
    {entry.output != null && entry.output !== "" && (
      <StackItem>
        <CodeBlock>
          <CodeBlockCode>{stripAnsi(entry.output)}</CodeBlockCode>
        </CodeBlock>
      </StackItem>
    )}
  </Stack>
);

const PlanEntry: React.FC<{
  entry: Extract<TranscriptEntry, { kind: "plan" }>;
  isStageRunning: boolean;
}> = ({ entry, isStageRunning }) => {
  const { t } = useTranslation();
  return (
    <Stack>
      <StackItem className={textStyles.fontWeightBold}>
        {t(`${KEY}.plan`)}
      </StackItem>
      <StackItem>
        <List isPlain>
          {entry.entries.map((step, index) => {
            const status: TranscriptPlanEntryStatus = step.status;
            const presentation = stepPresentation(status, isStageRunning);
            return (
              <ListItem key={index}>
                {/* Status is icon and text, like the tool call rows:
                    the step, then its status, subtle. */}
                <IconedStatus
                  status={presentation.status}
                  icon={<presentation.icon />}
                  label={
                    <>
                      {step.content}{" "}
                      <span className={textStyles.textColorSubtle}>
                        {t(`${KEY}.stepStatus.${presentation.label}`)}
                      </span>
                    </>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </StackItem>
    </Stack>
  );
};

const EntryCell: React.FC<{
  entry: TranscriptEntry;
  labelId: string;
  isStageRunning: boolean;
}> = ({ entry, labelId, isStageRunning }) => {
  const { t } = useTranslation();
  switch (entry.kind) {
    case "message":
      return entry.role === "user" ? (
        <Stack>
          <StackItem>
            <Content component="small" className={textStyles.textColorSubtle}>
              {t(`${KEY}.userMessage`)}
            </Content>
          </StackItem>
          <StackItem>
            <Markdown text={entry.text} />
          </StackItem>
        </Stack>
      ) : (
        <Markdown text={entry.text} />
      );
    case "thought":
      return (
        <span id={labelId} className={textStyles.textColorSubtle}>
          <span className={a11yStyles.screenReader}>
            {t(`${KEY}.thought`)}{" "}
          </span>
          {splitThought(entry.text).first}
        </span>
      );
    case "toolCall":
      return (
        <ToolCallSummary
          entry={entry}
          labelId={labelId}
          isStageRunning={isStageRunning}
        />
      );
    case "plan":
      return <PlanEntry entry={entry} isStageRunning={isStageRunning} />;
    case "status":
      return (
        <IconedStatus
          status="info"
          icon={<InfoCircleIcon title={t(`${KEY}.notice`)} />}
          label={entry.text}
        />
      );
    default:
      return null;
  }
};

interface TranscriptRowProps {
  entry: TranscriptEntry;
  /** Time of the entry above, so the date shows when the day changes. */
  previousAt?: string;
  rowIndex: number;
  isExpanded: boolean;
  onToggle: (key: string) => void;
  isStageRunning: boolean;
  /** False when no entry can expand: the table then has no toggle column. */
  hasExpandColumn: boolean;
}

/**
 * One entry of the transcript. Memoized: a refresh keeps unchanged entries
 * referentially equal (structural sharing), so only new or changed rows
 * render again, which matters for long runs with markdown messages.
 */
const TranscriptRow = React.memo(function TranscriptRow({
  entry,
  previousAt,
  rowIndex,
  isExpanded: isExpandedKey,
  onToggle,
  isStageRunning,
  hasExpandColumn,
}: TranscriptRowProps) {
  const { t } = useTranslation();
  const columns = {
    time: t(`${KEY}.time`),
    entry: t(`${KEY}.entry`),
  };
  const key = entryKey(entry);
  if (entry.kind === "gap") {
    const seconds = Math.round(
      (Date.parse(entry.to) - Date.parse(entry.from)) / 1000
    );
    return (
      <Tbody>
        <Tr>
          {/* Under the Time column, like every other row's text. */}
          {hasExpandColumn && <Td />}
          <Td colSpan={2} className={textStyles.textColorSubtle}>
            {t(`${KEY}.gap`, {
              duration: Number.isNaN(seconds)
                ? ""
                : formatDuration(Math.max(0, seconds)),
            })}
          </Td>
        </Tr>
      </Tbody>
    );
  }
  const expandable = isExpandable(entry);
  const isExpanded = expandable && isExpandedKey;
  // PF names an expand toggle by the element `simple-node{rowIndex}`
  // and its own "Details" label: point it at the entry's title.
  const labelId = `simple-node${rowIndex}`;
  return (
    <Tbody isExpanded={isExpanded}>
      <Tr>
        {expandable ? (
          <Td
            expand={{
              rowIndex,
              isExpanded,
              expandId: "transcript-entry-toggle-",
              onToggle: () => onToggle(key),
            }}
          />
        ) : (
          hasExpandColumn && <Td />
        )}
        <Td dataLabel={columns.time} modifier="nowrap">
          <TimeCell at={entry.at} previous={previousAt} />
        </Td>
        <Td dataLabel={columns.entry}>
          <EntryCell
            entry={entry}
            labelId={labelId}
            isStageRunning={isStageRunning}
          />
        </Td>
      </Tr>
      {expandable && (
        <Tr isExpanded={isExpanded}>
          <Td />
          <Td colSpan={2} dataLabel={columns.entry}>
            <ExpandableRowContent>
              {entry.kind === "toolCall" ? (
                <ToolCallDetails entry={entry} />
              ) : entry.kind === "thought" ? (
                <span className={textStyles.textColorSubtle}>
                  <Paragraphs text={splitThought(entry.text).rest} />
                </span>
              ) : null}
            </ExpandableRowContent>
          </Td>
        </Tr>
      )}
    </Tbody>
  );
});

const TranscriptTable: React.FC<{
  entries: TranscriptEntry[];
  isStageRunning: boolean;
  /**
   * The toggle column. Fixed per table rather than derived from the entries,
   * so a recording that gains its first expandable entry does not shift every
   * row; live messages never expand, so their table has none.
   */
  hasExpandColumn: boolean;
}> = ({ entries, isStageRunning, hasExpandColumn }) => {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([]);
  const toggle = React.useCallback(
    (key: string) =>
      setExpandedKeys((keys) =>
        keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
      ),
    []
  );

  return (
    <Table aria-label={t(`${KEY}.ariaLabel`)} variant="compact">
      <Thead>
        <Tr>
          {/* As narrow as its toggle: free width goes to the entry. */}
          {hasExpandColumn && (
            <Th
              modifier="fitContent"
              screenReaderText={t(`${KEY}.rowExpansion`)}
            />
          )}
          <Th modifier="fitContent">{t(`${KEY}.time`)}</Th>
          <Th>{t(`${KEY}.entry`)}</Th>
        </Tr>
      </Thead>
      {entries.map((entry, rowIndex) => {
        const key = entryKey(entry);
        return (
          <TranscriptRow
            key={key}
            entry={entry}
            previousAt={
              rowIndex > 0 ? entryTime(entries[rowIndex - 1]) : undefined
            }
            rowIndex={rowIndex}
            isExpanded={expandedKeys.includes(key)}
            onToggle={toggle}
            isStageRunning={isStageRunning}
            hasExpandColumn={hasExpandColumn}
          />
        );
      })}
    </Table>
  );
};

/**
 * The stage's own messages (`StageRun.messages`, from the live ACP session)
 * as transcript message rows, for a stage the recorder did not record.
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
  /** Opens the stage's logs; offered when there is no transcript. */
  onViewLogs?: () => void;
}

/**
 * The stage's transcript: what the agent said and did,
 * in order, as a compact table with Time and Entry. Tool calls and long
 * thoughts expand in place. While the stage runs the transcript refreshes:
 * new entries append below, so the reader's place does not move, and rows
 * stay expanded across refreshes.
 */
export const AgentRunTranscript: React.FC<AgentRunTranscriptProps> = ({
  agentRun,
  messages = NO_MESSAGES,
  phase,
  onViewLogs,
}) => {
  const { t } = useTranslation();
  const { transcript, isLoading, fetchError, refetch, lastUpdatedAt } =
    useFetchAgentRunTranscript(agentRun.name, phase);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const messageEntries = React.useMemo(
    () => stageMessageEntries(messages),
    [messages]
  );

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
          <EmptyState variant="xs">
            <EmptyStateBody>{t(`${KEY}.emptyRecording`)}</EmptyStateBody>
          </EmptyState>
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
      <Button variant="link" isInline size="sm" onClick={onViewLogs}>
        {t(`${KEY}.viewLogs`)}
      </Button>
    );
    if (messages.length > 0) {
      // Not recorded, but the live session's messages are known: show them
      // in the same table, after the sentence that says why. The
      // View logs link next to it already points to the logs, so the
      // sentence does not say so again.
      return withError(
        <Stack hasGutter>
          <StackItem>
            <Flex
              spaceItems={{ default: "spaceItemsSm" }}
              alignItems={{ default: "alignItemsBaseline" }}
            >
              <FlexItem>
                <Content
                  component="small"
                  className={textStyles.textColorSubtle}
                >
                  {body} {t(`${KEY}.liveMessages`)}
                </Content>
              </FlexItem>
              {viewLogs && <FlexItem>{viewLogs}</FlexItem>}
            </Flex>
          </StackItem>
          <StackItem>
            <TranscriptTable
              entries={messageEntries}
              isStageRunning={phase === "Running"}
              hasExpandColumn={false}
            />
          </StackItem>
        </Stack>
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

  const hasEntries = transcript.entries.length > 0;
  const goToLatest = () => {
    const rows = tableRef.current?.querySelectorAll("tbody");
    rows?.[rows.length - 1]?.scrollIntoView?.({ block: "end" });
  };
  return (
    <Stack hasGutter>
      {errorAlert && <StackItem>{errorAlert}</StackItem>}
      <StackItem>
        <RecordingSentence
          status={transcript.status}
          lastUpdatedAt={lastUpdatedAt}
          onGoToLatest={hasEntries ? goToLatest : undefined}
        />
      </StackItem>
      <StackItem>
        {hasEntries ? (
          <div ref={tableRef}>
            <TranscriptTable
              entries={transcript.entries}
              isStageRunning={phase === "Running"}
              hasExpandColumn
            />
          </div>
        ) : (
          <EmptyState variant="xs">
            <EmptyStateBody>
              {transcript.status === "recording"
                ? t(`${KEY}.emptyRecording`)
                : t(`${KEY}.empty`)}
            </EmptyStateBody>
          </EmptyState>
        )}
      </StackItem>
    </Stack>
  );
};
