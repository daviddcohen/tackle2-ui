import * as React from "react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import DeepThinking from "@patternfly/chatbot/dist/dynamic/DeepThinking";
import MarkdownContent from "@patternfly/chatbot/dist/dynamic/MarkdownContent";
import Message, {
  MessageAndActions,
  MessageLoading,
} from "@patternfly/chatbot/dist/dynamic/Message";
import MessageDivider from "@patternfly/chatbot/dist/dynamic/MessageDivider";
import ToolResponse from "@patternfly/chatbot/dist/dynamic/ToolResponse";
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
import displayStyles from "@patternfly/react-styles/css/utilities/Display/display";
import sizingStyles from "@patternfly/react-styles/css/utilities/Sizing/sizing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { TranscriptEntry, TranscriptToolCallStatus } from "@app/agentic";
import { IconedStatus } from "@app/components/Icons/IconedStatus";
import { formatDuration } from "@app/utils/agentic";
import { formatDate } from "@app/utils/utils";

import { DiffLine, diffLineText, diffLines } from "./diff-lines";
import { stripAnsi } from "./strip-ansi";

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
 * "text_editor · src/Main.java" does not say edit.
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

/** A thought's first line, without its Markdown heading, quote or emphasis marks. */
const thoughtSummary = (text: string) => {
  const trimmed = text.trim();
  const newline = trimmed.indexOf("\n");
  const first = newline === -1 ? trimmed : trimmed.slice(0, newline);
  return first
    .replace(/^[#>\s]+/, "")
    .replace(/[*_]{1,2}(\S(?:.*?\S)?)[*_]{1,2}/g, "$1")
    .trim();
};

/** Lines of output shown before "Show all": about a screenful. */
export const OUTPUT_PREVIEW_LINES = 20;
/** Output only this much longer than the preview shows whole. */
const OUTPUT_SLACK_LINES = 5;

/** Lines of text; a trailing newline ends the last line, it adds none. */
const toLines = (text: string) => text.replace(/\n$/, "").split("\n");

/** A diff's added and removed lines, in PatternFly's status text colours. */
const DIFF_LINE_CLASS: Record<DiffLine["kind"], string | undefined> = {
  added: textStyles.textColorStatusSuccess,
  removed: textStyles.textColorStatusDanger,
  context: undefined,
  skipped: textStyles.textColorSubtle,
};

/** Diff lines in their colours (added, removed); plain text otherwise. */
const renderLines = (lines: string[], diff?: DiffLine[], offset = 0) =>
  diff == null
    ? lines.join("\n")
    : lines.map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 && "\n"}
          <span className={DIFF_LINE_CLASS[diff[offset + index].kind]}>
            {line}
          </span>
        </React.Fragment>
      ));

/**
 * Tool output or a diff: monospace on the code block's grey. More than one
 * line has a copy button for the whole text. Long text shows its first
 * lines and a "Show all" control; the rest renders only when asked for, so
 * a huge output costs nothing until then.
 */
const OutputBlock: React.FC<{
  id: string;
  /** The output, or the text of the diff's lines. */
  text: string;
  /** A diff's lines, to colour what was added and removed. */
  diff?: DiffLine[];
  /** Names the block, which takes focus to scroll its long lines. */
  label: string;
  copyLabel: string;
}> = ({ id, text, diff, label, copyLabel }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const [isShowingAll, setIsShowingAll] = React.useState(false);
  const lines = React.useMemo(() => toLines(text), [text]);
  const isLong = lines.length > OUTPUT_PREVIEW_LINES + OUTPUT_SLACK_LINES;
  const restId = `${id}-rest`;
  const toggleId = `${id}-toggle`;
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
        lines.length > 1 && (
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
        )
      }
    >
      {/* A long line scrolls (by keyboard too), like a terminal: a
          focusable, named region. */}
      <CodeBlockCode
        className={`${TRANSCRIPT_CLASS}__output`}
        role="region"
        tabIndex={0}
        aria-label={label}
      >
        {renderLines(
          isLong ? lines.slice(0, OUTPUT_PREVIEW_LINES) : lines,
          diff
        )}
        {isLong && (
          <ExpandableSection
            isExpanded={isShowingAll}
            isDetached
            contentId={restId}
            toggleId={toggleId}
          >
            {isShowingAll &&
              renderLines(
                lines.slice(OUTPUT_PREVIEW_LINES),
                diff,
                OUTPUT_PREVIEW_LINES
              )}
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

/**
 * A tool call's file changes as diffs, then its output. Next to a diff, a
 * one-line output ("The file has been edited.") is a plain sentence.
 */
const ToolCallDetails: React.FC<{
  entry: ToolCallEntry;
  idPrefix: string;
  isStageRunning: boolean;
}> = ({ entry, idPrefix, isStageRunning }) => {
  const { t } = useTranslation();
  const diffs = React.useMemo(
    () =>
      (entry.diffs ?? []).map((change) => ({
        change,
        lines: diffLines(change),
      })),
    [entry.diffs]
  );
  if (!hasOutput(entry)) {
    const isRunning = entry.status === "inProgress" && isStageRunning;
    return (
      <Content component="p" className={textStyles.textColorSubtle}>
        {isRunning ? t(`${KEY}.noOutputYet`) : t(`${KEY}.noOutput`)}
      </Content>
    );
  }
  const output =
    entry.output != null && entry.output !== ""
      ? stripAnsi(entry.output)
      : undefined;
  const isOutputASentence =
    output != null && diffs.length > 0 && toLines(output).length === 1;
  return (
    <Stack hasGutter>
      {diffs.map(({ change, lines }, index) => {
        return (
          <StackItem key={`${change.path}-${index}`}>
            <Content
              component="p"
              className={`${textStyles.fontFamilyMonospace} ${textStyles.textBreakWord}`}
            >
              {change.path}
            </Content>
            {lines.length > 0 && (
              <OutputBlock
                id={`${idPrefix}-diff-${index}`}
                text={lines.map(diffLineText).join("\n")}
                diff={lines}
                label={t(`${KEY}.diffLabel`, { path: change.path })}
                copyLabel={t(`${KEY}.copyDiff`, { path: change.path })}
              />
            )}
          </StackItem>
        );
      })}
      {output != null && (
        <StackItem>
          {isOutputASentence ? (
            <Content component="p" className={textStyles.textColorSubtle}>
              {output}
            </Content>
          ) : (
            <OutputBlock
              id={`${idPrefix}-output`}
              text={output}
              label={t(`${KEY}.outputLabel`)}
              copyLabel={t(`${KEY}.copyOutput`)}
            />
          )}
        </StackItem>
      )}
    </Stack>
  );
};

/**
 * Lets a toggle's title shrink within its row, so the text inside it can end
 * in an ellipsis (`textTruncate`).
 */
const TITLE_CLASS = `${displayStyles.displayFlex} ${sizingStyles.minWidth}`;

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
  // ToolResponse): PF Truncate would measure the button's parent and make
  // the title focusable inside the button, so the tooltip is our own.
  const toggle = React.useCallback(
    () => document.getElementById(toggleId) as HTMLElement,
    [toggleId]
  );
  const kind = (TOOL_KINDS as readonly string[]).includes(entry.toolKind ?? "")
    ? entry.toolKind
    : undefined;
  const showKind = kind != null && !titleSaysKind(entry.title, kind);
  const StatusIcon = presentation.icon;
  return (
    <Flex
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
      <FlexItem className={TITLE_CLASS}>
        <span ref={titleRef} className={textStyles.textTruncate}>
          {entry.title}
        </span>
        {isTruncated && (
          <Tooltip
            content={entry.title}
            aria="none"
            aria-live="off"
            triggerRef={toggle}
          />
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
        {t(`${KEY}.planLatest`)}
      </StackItem>
      <StackItem>
        <List isPlain>
          {entry.entries.map((step, index) => {
            const presentation = stepPresentation(step.status, isStageRunning);
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

type DividerEntry = Extract<TranscriptEntry, { kind: "gap" | "status" }>;

/** One message of the chat: a turn, or a divider between turns. */
export type TranscriptItem =
  | { kind: "divider"; key: string; entry: DividerEntry }
  | {
      kind: "turn";
      key: string;
      isUser: boolean;
      entries: TranscriptEntry[];
    };

const isUserMessage = (entry: TranscriptEntry) =>
  entry.kind === "message" && entry.role === "user";

/**
 * The entries as the chat shows them. Runtime notices and recording gaps
 * divide it; everything else is in turns, one message each. A turn starts
 * where the agent speaks: its prose, with the thoughts just before it, and
 * the tool calls, thoughts and plan after it. A user's message is a turn of
 * its own. A turn keeps its first entry's key, so it stays the same message
 * as entries join it.
 */
export const groupTranscript = (
  entries: readonly TranscriptEntry[]
): TranscriptItem[] => {
  const items: TranscriptItem[] = [];
  let turn: Extract<TranscriptItem, { kind: "turn" }> | undefined;
  entries.forEach((entry) => {
    if (entry.kind === "gap" || entry.kind === "status") {
      items.push({ kind: "divider", key: entryKey(entry), entry });
      turn = undefined;
      return;
    }
    const isUser = isUserMessage(entry);
    const joins =
      turn != null &&
      !isUser &&
      !turn.isUser &&
      (entry.kind !== "message" ||
        turn.entries.every((joined) => joined.kind === "thought"));
    if (turn != null && joins) {
      turn.entries.push(entry);
      return;
    }
    turn = { kind: "turn", key: entryKey(entry), isUser, entries: [entry] };
    items.push(turn);
  });
  return items;
};

/** A notice or a recording gap, between turns. */
export const TranscriptDivider: React.FC<{ entry: DividerEntry }> = ({
  entry,
}) => {
  const { t } = useTranslation();
  if (entry.kind === "status") {
    return <MessageDivider variant="inset" content={entry.text} />;
  }
  const seconds = Math.round(
    (Date.parse(entry.to) - Date.parse(entry.from)) / 1000
  );
  return (
    <MessageDivider
      variant="inset"
      content={
        Number.isNaN(seconds)
          ? t(`${KEY}.gapUnknown`)
          : t(`${KEY}.gap`, { duration: formatDuration(Math.max(0, seconds)) })
      }
    />
  );
};

/**
 * Time of day in the locale's format, local like the page header; the date
 * too on the first turn and when the day changes. The UTC time, as the log
 * prints it, so a turn can be matched to its log lines, is in the tooltip
 * of the time and in the message's accessible name.
 */
const useTurnTime = (at: string, previousAt: string | undefined) => {
  const { t } = useTranslation();
  const time = dayjs(at);
  if (!time.isValid()) return undefined;
  const newDay = previousAt == null || !dayjs(previousAt).isSame(time, "day");
  return {
    shown: time.format(newDay ? "ll LTS" : "LTS"),
    tooltip: t(`${KEY}.timeTooltip`, {
      local: formatDate(time.toDate()),
      utc: time.toISOString(),
    }),
    utc: time.utc().format("HH:mm:ss"),
  };
};

interface TranscriptPartProps {
  entry: TranscriptEntry;
  isExpanded: boolean;
  onToggle: (key: string, isExpanded: boolean) => void;
  isStageRunning: boolean;
}

/**
 * One entry inside a turn: the agent's prose as Markdown, a tool call as a
 * card that expands to its output, a thought as a collapsed reasoning card,
 * the plan as its steps. Memoized: a refresh keeps unchanged entries
 * referentially equal (structural sharing), so only new or changed entries
 * render again.
 */
const TranscriptPart = React.memo(function TranscriptPart({
  entry,
  isExpanded,
  onToggle,
  isStageRunning,
}: TranscriptPartProps) {
  const { t } = useTranslation();
  const key = entryKey(entry);
  const idPrefix = `transcript-${key}`;
  const toggleId = `${idPrefix}-toggle`;
  const onExpandToggle = (_event: React.MouseEvent, next: boolean) =>
    onToggle(key, next);
  switch (entry.kind) {
    case "message":
      return (
        <MarkdownContent
          content={entry.text}
          codeBlockProps={{ "aria-label": t(`${KEY}.copyCode`) }}
        />
      );
    case "thought":
      return (
        <DeepThinking
          toggleContent={
            // Reasoning, not a tool: a leading word and subtle text. Open,
            // the body shows the whole thought, so the toggle says the word.
            <span className={`${TITLE_CLASS} ${textStyles.textColorSubtle}`}>
              <span className={textStyles.textTruncate}>
                <span className={textStyles.fontWeightBold}>
                  {t(`${KEY}.thought`)}
                </span>
                {!isExpanded && <> {thoughtSummary(entry.text)}</>}
              </span>
            </span>
          }
          // Rendered only when open: a long transcript has many thoughts.
          body={isExpanded ? entry.text : undefined}
          isBodyMarkdown
          expandableSectionProps={{
            isExpanded,
            onToggle: onExpandToggle,
            toggleId,
          }}
        />
      );
    case "toolCall":
      return (
        <ToolResponse
          toggleContent={
            <ToolCallToggle
              entry={entry}
              toggleId={toggleId}
              presentation={stepPresentation(entry.status, isStageRunning)}
            />
          }
          // Rendered only when open: a collapsed card holds no code block,
          // copy button or output.
          body={
            isExpanded ? (
              <ToolCallDetails
                entry={entry}
                idPrefix={idPrefix}
                isStageRunning={isStageRunning}
              />
            ) : undefined
          }
          expandableSectionProps={{
            isExpanded,
            onToggle: onExpandToggle,
            toggleId,
          }}
        />
      );
    case "plan":
      return <PlanSteps entry={entry} isStageRunning={isStageRunning} />;
    default:
      return null;
  }
});

export interface TranscriptTurnProps {
  entries: readonly TranscriptEntry[];
  isUser: boolean;
  /** Time of the turn above, so the date shows when the day changes. */
  previousAt?: string;
  /** Shown on the agent's turns. */
  agentName: string;
  /** Whether each entry is expanded, in the order of `entries`. */
  expanded: readonly boolean[];
  onToggle: (key: string, isExpanded: boolean) => void;
  isStageRunning: boolean;
  /** The agent is still working: loading dots end the turn. */
  isWorking: boolean;
}

const sameItems = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * A turn as one chat message (PatternFly Chatbot's custom message
 * structure): who and when once, then its entries. Rendered again only
 * when one of its entries or their expansion changes.
 */
export const TranscriptTurn = React.memo(
  function TranscriptTurn({
    entries,
    isUser,
    previousAt,
    agentName,
    expanded,
    onToggle,
    isStageRunning,
    isWorking,
  }: TranscriptTurnProps) {
    const { t } = useTranslation();
    const sectionRef = React.useRef<HTMLDivElement>(null);
    const time = useTurnTime(entryTime(entries[0]), previousAt);
    const name = isUser ? t(`${KEY}.userName`) : agentName;
    // Message does not expose its Timestamp: found by PF's class inside the
    // message, for the UTC tooltip.
    const timeElement = React.useCallback(
      () =>
        sectionRef.current?.querySelector<HTMLElement>(
          `.${timestampStyles.timestamp}`
        ) as HTMLElement,
      []
    );
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
          // would read it all again. The message box announces new entries.
          isLiveRegion={false}
        >
          <MessageAndActions>
            {entries.map((entry, index) => (
              <TranscriptPart
                key={entryKey(entry)}
                entry={entry}
                isExpanded={expanded[index]}
                onToggle={onToggle}
                isStageRunning={isStageRunning}
              />
            ))}
            {isWorking && <MessageLoading loadingWord={t(`${KEY}.working`)} />}
          </MessageAndActions>
        </Message>
        {time != null && (
          <Tooltip
            content={time.tooltip}
            aria-live="off"
            triggerRef={timeElement}
          />
        )}
      </>
    );
  },
  (previous, next) =>
    previous.isUser === next.isUser &&
    previous.previousAt === next.previousAt &&
    previous.agentName === next.agentName &&
    previous.onToggle === next.onToggle &&
    previous.isStageRunning === next.isStageRunning &&
    previous.isWorking === next.isWorking &&
    sameItems(previous.entries, next.entries) &&
    sameItems(previous.expanded, next.expanded)
);
