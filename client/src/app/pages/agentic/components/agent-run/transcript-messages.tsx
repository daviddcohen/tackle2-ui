import * as React from "react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import Message from "@patternfly/chatbot/dist/dynamic/Message";
import MessageDivider from "@patternfly/chatbot/dist/dynamic/MessageDivider";
import {
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  Content,
  ExpandableSection,
  ExpandableSectionToggle,
  Flex,
  FlexItem,
  Icon,
  Label,
  List,
  ListItem,
  Stack,
  StackItem,
  Tooltip,
} from "@patternfly/react-core";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  PendingIcon,
  UserIcon,
} from "@patternfly/react-icons";
import timestampStyles from "@patternfly/react-styles/css/components/Timestamp/timestamp";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import {
  TranscriptEntry,
  TranscriptPlanEntryStatus,
  TranscriptToolCallStatus,
} from "@app/agentic";
import { IconedStatus } from "@app/components/Icons/IconedStatus";
import { formatDuration } from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import { stripAnsi } from "./strip-ansi";
import { unifiedDiff } from "./unified-diff";

const KEY = "agentic.agentRun.transcript";

/** Class of the transcript's own layout rules (agent-run-transcript.css). */
export const TRANSCRIPT_CLASS = "agent-run-transcript";

type ToolCallEntry = Extract<TranscriptEntry, { kind: "toolCall" }>;
type PlanEntry = Extract<TranscriptEntry, { kind: "plan" }>;

interface StepPresentation {
  status?: "info" | "success" | "danger";
  /** Colour of the status label, which says the status in words. */
  color: "blue" | "green" | "red" | "grey";
  icon: React.ComponentType;
  /** Key of its text under `stepStatus`. */
  label: string;
}

/** Tool call and plan entry statuses: icon, label colour and text. */
const STEP_STATUS: Record<TranscriptToolCallStatus, StepPresentation> = {
  pending: { color: "grey", icon: PendingIcon, label: "pending" },
  inProgress: {
    status: "info",
    color: "blue",
    icon: InProgressIcon,
    label: "inProgress",
  },
  completed: {
    status: "success",
    color: "green",
    icon: CheckCircleIcon,
    label: "completed",
  },
  failed: {
    status: "danger",
    color: "red",
    icon: ExclamationCircleIcon,
    label: "failed",
  },
};

/**
 * A step still in progress when the stage stopped running (failed,
 * finished, waiting for approval) will not move on: "Not finished" with the
 * neutral pending icon, never a spinner, so the transcript does not say
 * something is running when the stage is not. The data stays as recorded.
 */
const NOT_FINISHED: StepPresentation = {
  color: "grey",
  icon: PendingIcon,
  label: "notFinished",
};

/**
 * A step that had not started when the stage stopped running will not start
 * either: "Not started", not "Pending", which says it still will.
 */
const NOT_STARTED: StepPresentation = {
  color: "grey",
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
 * What stays the same for an entry across refreshes: a tool call's id,
 * otherwise the entry id (folded in recording order, so stable). Keys the
 * rendered messages and the expanded state.
 */
export const entryKey = (entry: TranscriptEntry) =>
  entry.kind === "toolCall" && entry.toolCallId !== ""
    ? `tool-${entry.toolCallId}`
    : `entry-${entry.id}`;

export const entryTime = (entry: TranscriptEntry) =>
  entry.kind === "gap" ? entry.from : entry.at;

/**
 * Whether an entry opens expanded: a failed tool call (what went wrong is
 * the first thing to read), and a tool call still running while the stage
 * runs (its output is what happens now). The reader's own choice wins.
 */
export const isExpandedByDefault = (
  entry: TranscriptEntry,
  isStageRunning: boolean
) =>
  entry.kind === "toolCall" &&
  (entry.status === "failed" ||
    (entry.status === "inProgress" && isStageRunning));

const splitThought = (text: string) => {
  const trimmed = text.trim();
  const newline = trimmed.indexOf("\n");
  return newline === -1 ? trimmed : trimmed.slice(0, newline).trim();
};

/** Lines of output shown before "Show all": about a screenful. */
export const OUTPUT_PREVIEW_LINES = 20;
/** Output only this much longer than the preview shows whole. */
const OUTPUT_SLACK_LINES = 5;

/**
 * Tool output or a diff: monospace on the code block's grey, with a copy
 * button for the whole text. Long text shows its first lines and a "Show
 * all" control; the rest renders only when asked for, so a huge output
 * costs nothing until then.
 */
const OutputBlock: React.FC<{
  id: string;
  text: string;
  /** Names the block, which takes focus to scroll its long lines. */
  label: string;
  copyLabel: string;
}> = ({ id, text, label, copyLabel }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = React.useState(false);
  const [isShowingAll, setIsShowingAll] = React.useState(false);
  const lines = React.useMemo(() => text.split("\n"), [text]);
  const isLong = lines.length > OUTPUT_PREVIEW_LINES + OUTPUT_SLACK_LINES;
  const restId = `${id}-rest`;
  const toggleId = `${id}-toggle`;
  const [copyFailed, setCopyFailed] = React.useState(false);
  const copy = () => {
    // Denied (permission, an insecure origin) or no clipboard at all: the
    // tooltip says so instead of an unhandled rejection.
    const done = navigator.clipboard?.writeText(text);
    if (done == null) {
      setCopyFailed(true);
      return;
    }
    done.then(
      () => setIsCopied(true),
      () => setCopyFailed(true)
    );
  };
  return (
    <CodeBlock
      actions={
        <CodeBlockAction>
          <ClipboardCopyButton
            id={`${id}-copy`}
            aria-label={copyLabel}
            variant="plain"
            onClick={copy}
            exitDelay={isCopied || copyFailed ? 1500 : 600}
            onTooltipHidden={() => {
              setIsCopied(false);
              setCopyFailed(false);
            }}
          >
            {isCopied
              ? t(`${KEY}.copied`)
              : copyFailed
                ? t(`${KEY}.copyFailed`)
                : t(`${KEY}.copy`)}
          </ClipboardCopyButton>
        </CodeBlockAction>
      }
    >
      {/* Output keeps its lines, like a terminal: a long line scrolls
          (by keyboard too), it does not wrap. A focusable scroll area, so
          a named region, like the message box. */}
      <CodeBlockCode role="region" tabIndex={0} aria-label={label}>
        {isLong ? lines.slice(0, OUTPUT_PREVIEW_LINES).join("\n") : text}
        {isLong && (
          <ExpandableSection
            isExpanded={isShowingAll}
            isDetached
            contentId={restId}
            toggleId={toggleId}
          >
            {isShowingAll && lines.slice(OUTPUT_PREVIEW_LINES).join("\n")}
          </ExpandableSection>
        )}
      </CodeBlockCode>
      {isLong && (
        <ExpandableSectionToggle
          isExpanded={isShowingAll}
          onToggle={setIsShowingAll}
          contentId={restId}
          toggleId={toggleId}
          direction="up"
        >
          {isShowingAll
            ? t(`${KEY}.showFewerLines`)
            : t(`${KEY}.showAllLines`, { count: lines.length })}
        </ExpandableSectionToggle>
      )}
    </CodeBlock>
  );
};

const hasOutput = (entry: ToolCallEntry) =>
  (entry.output != null && entry.output !== "") ||
  (entry.diffs != null && entry.diffs.length > 0);

/** A tool call's file changes as unified diffs, then its output. */
const ToolCallDetails: React.FC<{
  entry: ToolCallEntry;
  idPrefix: string;
  isStageRunning: boolean;
}> = ({ entry, idPrefix, isStageRunning }) => {
  const { t } = useTranslation();
  if (!hasOutput(entry)) {
    const isRunning = entry.status === "inProgress" && isStageRunning;
    return (
      <Content component="p" className={textStyles.textColorSubtle}>
        {isRunning ? t(`${KEY}.noOutputYet`) : t(`${KEY}.noOutput`)}
      </Content>
    );
  }
  return (
    <Stack hasGutter>
      {(entry.diffs ?? []).map((diff, index) => (
        <StackItem key={`${diff.path}-${index}`}>
          <Content
            component="p"
            className={`${textStyles.fontFamilyMonospace} ${textStyles.textBreakWord}`}
          >
            {diff.path}
          </Content>
          <OutputBlock
            id={`${idPrefix}-diff-${index}`}
            text={unifiedDiff(diff)}
            label={t(`${KEY}.diffLabel`, { path: diff.path })}
            copyLabel={t(`${KEY}.copyDiff`, { path: diff.path })}
          />
        </StackItem>
      ))}
      {entry.output != null && entry.output !== "" && (
        <StackItem>
          <OutputBlock
            id={`${idPrefix}-output`}
            text={stripAnsi(entry.output)}
            label={t(`${KEY}.outputLabel`)}
            copyLabel={t(`${KEY}.copyOutput`)}
          />
        </StackItem>
      )}
    </Stack>
  );
};

/**
 * Whether the element's text is cut by its ellipsis, kept up to date as
 * the element resizes.
 */
const useIsTruncated = (ref: React.RefObject<HTMLElement>, text: string) => {
  const [isTruncated, setIsTruncated] = React.useState(false);
  React.useEffect(() => {
    const element = ref.current;
    if (element == null) return;
    const measure = () =>
      setIsTruncated(element.scrollWidth > element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, text]);
  return isTruncated;
};

/**
 * The tool call's toggle: status icon, the kind when the title does not say
 * it, the title on one line, and the status in words. The whole title is
 * the button's text, so screen readers read all of it; a cut title shows
 * whole in a tooltip on hover and on keyboard focus of the toggle.
 */
const ToolCallToggle: React.FC<{
  entry: ToolCallEntry;
  toggleId: string;
  presentation: StepPresentation;
}> = ({ entry, toggleId, presentation }) => {
  const { t } = useTranslation();
  const titleRef = React.useRef<HTMLSpanElement>(null);
  const isTruncated = useIsTruncated(titleRef, entry.title);
  // The toggle button is the chatbot's (ExpandableSection inside
  // ToolResponse, @patternfly/chatbot 6.9): found by its id once rendered.
  const toggleRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    toggleRef.current = document.getElementById(toggleId);
  }, [toggleId]);
  const kind = (TOOL_KINDS as readonly string[]).includes(entry.toolKind ?? "")
    ? entry.toolKind
    : undefined;
  const showKind = kind != null && !titleSaysKind(entry.title, kind);
  const StatusIcon = presentation.icon;
  return (
    <Flex
      className={`${TRANSCRIPT_CLASS}__toggle`}
      spaceItems={{ default: "spaceItemsSm" }}
      alignItems={{ default: "alignItemsCenter" }}
      // A narrow screen gives the title its own line rather than none.
      flexWrap={{ default: "wrap", md: "nowrap" }}
    >
      <FlexItem>
        <Icon status={presentation.status} isInline>
          <StatusIcon aria-hidden />
        </Icon>
      </FlexItem>
      {showKind && (
        <FlexItem className={textStyles.textColorSubtle}>
          {t(`${KEY}.toolKind.${kind}`)}
        </FlexItem>
      )}
      <FlexItem className={`${TRANSCRIPT_CLASS}__toggle-title`}>
        <span ref={titleRef} className={textStyles.textTruncate}>
          {entry.title}
        </span>
        {isTruncated && (
          <Tooltip content={entry.title} aria="none" triggerRef={toggleRef} />
        )}
      </FlexItem>
      <FlexItem>
        <Label isCompact variant="outline" color={presentation.color}>
          {t(`${KEY}.stepStatus.${presentation.label}`)}
        </Label>
      </FlexItem>
    </Flex>
  );
};

/** The plan: its steps with their status in icon and words. */
const PlanSteps: React.FC<{ entry: PlanEntry; isStageRunning: boolean }> = ({
  entry,
  isStageRunning,
}) => {
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

/**
 * Time of day, local like the page header; the date too on the first entry
 * and when the day changes. The UTC time, as the log prints it, so an entry
 * can be matched to its log lines, is in the tooltip of the time and in the
 * message's accessible name.
 */
const useMessageTime = (at: string, previousAt: string | undefined) => {
  const { t } = useTranslation();
  const time = dayjs(at);
  if (!time.isValid()) return undefined;
  const newDay = previousAt == null || !dayjs(previousAt).isSame(time, "day");
  const utc = time.toISOString();
  return {
    shown: time.format(newDay ? "YYYY-MM-DD HH:mm:ss" : "HH:mm:ss"),
    tooltip: t(`${KEY}.timeTooltip`, { local: formatDate(time.toDate()), utc }),
    utc,
  };
};

export interface TranscriptMessageProps {
  entry: TranscriptEntry;
  /** Time of the entry above, so the date shows when the day changes. */
  previousAt?: string;
  /** Shown on the agent's messages. */
  agentName: string;
  isExpanded: boolean;
  onToggle: (key: string, isExpanded: boolean) => void;
  isStageRunning: boolean;
}

/**
 * One entry of the transcript as a chat message: the agent's prose as
 * Markdown, a tool call as a card that expands to its output, a thought as
 * a collapsed reasoning card, the plan as its steps; a runtime notice and a
 * recording gap as dividers between messages.
 *
 * Memoized: a refresh keeps unchanged entries referentially equal
 * (structural sharing), so only new or changed entries render again.
 */
export const TranscriptMessage = React.memo(function TranscriptMessage({
  entry,
  previousAt,
  agentName,
  isExpanded,
  onToggle,
  isStageRunning,
}: TranscriptMessageProps) {
  const { t } = useTranslation();
  const key = entryKey(entry);
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const time = useMessageTime(entryTime(entry), previousAt);
  // Message (@patternfly/chatbot 6.9) does not expose its Timestamp: found
  // by PF's class inside the message once rendered, for the UTC tooltip.
  const timeRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    timeRef.current =
      sectionRef.current?.querySelector<HTMLElement>(
        `.${timestampStyles.timestamp}`
      ) ?? null;
  });

  if (entry.kind === "gap") {
    const seconds = Math.round(
      (Date.parse(entry.to) - Date.parse(entry.from)) / 1000
    );
    return (
      <MessageDivider
        variant="inset"
        content={t(`${KEY}.gap`, {
          duration: Number.isNaN(seconds)
            ? ""
            : formatDuration(Math.max(0, seconds)),
        })}
      />
    );
  }
  if (entry.kind === "status") {
    return <MessageDivider variant="inset" content={entry.text} />;
  }

  const isUser = entry.kind === "message" && entry.role === "user";
  const name = isUser ? t(`${KEY}.userName`) : agentName;
  const idPrefix = `transcript-${key}`;
  const onExpandToggle = (_event: React.MouseEvent, next: boolean) =>
    onToggle(key, next);

  let body: Partial<React.ComponentProps<typeof Message>> = {};
  switch (entry.kind) {
    case "message":
      body = { content: entry.text };
      break;
    case "thought":
      body = {
        deepThinking: {
          toggleContent: (
            // Reasoning, not a tool: a leading word and subtle text, so it
            // does not read like a tool call's link-colour title. Open, the
            // body shows the whole thought, so the toggle says only the word.
            <span
              className={`${TRANSCRIPT_CLASS}__toggle-title ${textStyles.textColorSubtle}`}
            >
              <span className={textStyles.textTruncate}>
                <span className={textStyles.fontWeightBold}>
                  {t(`${KEY}.thought`)}
                </span>
                {!isExpanded && <> {splitThought(entry.text)}</>}
              </span>
            </span>
          ),
          // Rendered only when open: a long transcript has many thoughts.
          body: isExpanded ? entry.text : undefined,
          isBodyMarkdown: true,
          expandableSectionProps: {
            isExpanded,
            onToggle: onExpandToggle,
            toggleId: `${idPrefix}-toggle`,
          },
        },
      };
      break;
    case "toolCall": {
      const toggleId = `${idPrefix}-toggle`;
      body = {
        toolResponse: {
          toggleContent: (
            <ToolCallToggle
              entry={entry}
              toggleId={toggleId}
              presentation={stepPresentation(entry.status, isStageRunning)}
            />
          ),
          // Rendered only when open: a collapsed card holds no code block,
          // copy button or output.
          body: isExpanded ? (
            <ToolCallDetails
              entry={entry}
              idPrefix={idPrefix}
              isStageRunning={isStageRunning}
            />
          ) : undefined,
          expandableSectionProps: {
            isExpanded,
            onToggle: onExpandToggle,
            toggleId,
          },
        },
      };
      break;
    }
    case "plan":
      body = {
        extraContent: {
          afterMainContent: (
            <PlanSteps entry={entry} isStageRunning={isStageRunning} />
          ),
        },
      };
      break;
  }

  return (
    <>
      <Message
        ref={sectionRef}
        role={isUser ? "user" : "bot"}
        name={name}
        botWord={t(`${KEY}.aiLabel`)}
        avatar={isUser ? <UserIcon /> : undefined}
        avatarProps={isUser ? { color: "gray" } : undefined}
        timestamp={time?.shown ?? ""}
        // Without a time PF's Timestamp would show the render time: hidden
        // by agent-run-transcript.css.
        data-has-time={time != null}
        aria-label={
          time != null
            ? t(`${KEY}.messageLabel`, {
                name,
                time: time.shown,
                utc: time.utc,
              })
            : t(`${KEY}.messageLabelNoTime`, { name })
        }
        // A refresh re-renders the transcript: announcing every message
        // would read it all again. The recording sentence says it records.
        isLiveRegion={false}
        {...body}
      />
      {time != null && <Tooltip content={time.tooltip} triggerRef={timeRef} />}
    </>
  );
});
