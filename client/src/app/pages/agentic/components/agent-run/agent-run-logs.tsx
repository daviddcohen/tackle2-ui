/**
 * Logs view of a stage: the pod log of its agent run, per container or all
 * containers merged, live while the pod runs and saved once it is gone.
 *
 * Following: while the log is live the view follows its end, so each update
 * shows the newest line. Scrolling up (or searching) pauses following and
 * keeps the reader's place as lines arrive; "Resume following" goes back to
 * the end. A saved log opens at its last line.
 *
 * Layout: given a `height`, the whole view (toolbar, status line and log)
 * is that tall, and the log viewer gets the rest after the toolbar and the
 * status line as its `height`. Without one it fills the height of its
 * parent, which must then have a definite height.
 */
import * as React from "react";
import { isAxiosError } from "axios";
import { saveAs } from "file-saver";
import { Trans, useTranslation } from "react-i18next";
import {
  Alert,
  AlertActionLink,
  Bullseye,
  Button,
  Checkbox,
  Content,
  Divider,
  EmptyState,
  MenuToggle,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import { DownloadIcon, PauseIcon, PlayIcon } from "@patternfly/react-icons";
import {
  LogViewer,
  LogViewerSearch,
  LogViewerToolbarContext,
} from "@patternfly/react-log-viewer";
import { css } from "@patternfly/react-styles";
import sizingStyles from "@patternfly/react-styles/css/utilities/Sizing/sizing";
import spacingStyles from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import {
  AgentRunLogSource,
  ControllerRunPhase,
  StageAgentRun,
} from "@app/agentic";
import {
  AgentRunContainerLog,
  useAgentRunLogs,
} from "@app/queries/agentic-observability";
import { getAxiosErrorMessage } from "@app/utils/utils";

import {
  ALL_CONTAINERS,
  LogAnchor,
  LogContainerChoice,
  LogScrollEvent,
  MAIN_CONTAINER,
  MappedLines,
  defaultLogContainer,
  displayLogLine,
  firstVisibleRow,
  followActionOnScroll,
  followScrollRow,
  logFileName,
  logFileText,
  mainContainer,
  mapAppended,
  prefixLine,
  readerAnchor,
} from "./agent-run-logs-helpers";
import { UpdatedAgo } from "./live-status";
import {
  LOG_VIEWER_BODY_CLASS,
  makeLogKeyboardScrollable,
  renderedLogRows,
} from "./log-viewer-dom";
import { useBodyHeight } from "./use-body-height";

export interface AgentRunLogsProps {
  agentRun: StageAgentRun;
  phase: ControllerRunPhase;
  /** Height of the whole view in pixels; default: its parent's height. */
  height?: number;
  /**
   * Someone asked to see the log: `focus` ("View logs") focuses the log
   * region and scrolls it into view, `scroll` (a link that opened the page
   * on its logs) only scrolls it into view. Then `onFocused` is called.
   */
  focusRequest?: "focus" | "scroll";
  onFocused?: () => void;
}

/** One container's log, or the merged log, as the view shows it. */
interface ShownLog {
  lines: string[];
  isLive: boolean;
  isLoading: boolean;
  /** A failure other than "no such container". */
  error: unknown;
  isNotFound: boolean;
  lastUpdatedAt?: number;
  refetch: () => void;
}

/**
 * Live while the pod writes it: the source the log read says, or, before
 * the first read (and while the pod has written nothing yet), the agent
 * run's own.
 */
const isLiveLog = (
  log: AgentRunContainerLog,
  fallback: AgentRunLogSource | undefined
) => (log.source ?? fallback) === "live" && !log.complete;

const fromContainer = (
  log: AgentRunContainerLog,
  fallback: AgentRunLogSource | undefined
): ShownLog => ({
  lines: log.lines,
  isLive: isLiveLog(log, fallback),
  isLoading: log.isLoading,
  error: log.isNotFound ? null : log.error,
  isNotFound: log.isNotFound,
  lastUpdatedAt: log.lastUpdatedAt,
  refetch: log.refetch,
});

/**
 * The "All containers" lines, kept per container from the last render
 * (state adjusted while rendering), so a poll prefixes only the new lines
 * and an unchanged log keeps its array.
 */
const useMergedLines = (logs: AgentRunContainerLog[], enabled: boolean) => {
  const [cache, setCache] = React.useState<{
    parts: Map<string, MappedLines<string>>;
    merged: string[];
  }>({ parts: new Map(), merged: [] });
  if (!enabled) return cache.merged;
  let changed = cache.parts.size !== logs.length;
  const parts = new Map<string, MappedLines<string>>();
  logs.forEach(({ container, lines }) => {
    const previous = cache.parts.get(container);
    const output = mapAppended(previous, lines, (line) =>
      prefixLine(container, line)
    );
    if (output !== previous?.output) changed = true;
    parts.set(container, { input: lines, output });
  });
  if (!changed) return cache.merged;
  const merged = logs.flatMap(
    ({ container }) => parts.get(container)?.output ?? []
  );
  setCache({ parts, merged });
  return merged;
};

/**
 * `lines.map(map)`, mapping only the lines that changed since the last
 * render (state adjusted while rendering).
 */
const useMappedLines = (lines: string[], map: (line: string) => string) => {
  const [cache, setCache] = React.useState<MappedLines<string>>();
  if (cache?.input === lines) return cache.output;
  const output = mapAppended(cache, lines, map);
  setCache({ input: lines, output });
  return output;
};

export const AgentRunLogs: React.FC<AgentRunLogsProps> = ({
  agentRun,
  phase,
  height,
  focusRequest,
  onFocused,
}) => {
  const { t } = useTranslation();
  const [pickedContainer, setPickedContainer] =
    React.useState<LogContainerChoice>();
  const [isSelectOpen, setIsSelectOpen] = React.useState(false);
  const [isWrapped, setIsWrapped] = React.useState(false);
  const regionId = React.useId();
  const regionRef = React.useRef<HTMLDivElement>(null);
  const logHeight = useBodyHeight(height, regionRef, LOG_VIEWER_BODY_CLASS);

  const { containers } = agentRun;
  const main = mainContainer(containers);
  // The main log decides the default container, so it is read unless the
  // user picked another container alone.
  const readsMain =
    pickedContainer == null ||
    pickedContainer === main ||
    pickedContainer === ALL_CONTAINERS;
  const [mainLog] = useAgentRunLogs(
    agentRun.name,
    readsMain ? [main] : [],
    phase
  );
  const choice = pickedContainer ?? defaultLogContainer(mainLog, containers);
  const otherLogs = useAgentRunLogs(
    agentRun.name,
    (choice === ALL_CONTAINERS ? containers : [choice]).filter(
      (container) => container !== main
    ),
    phase
  );
  const logsInOrder = (choice === ALL_CONTAINERS ? containers : [choice])
    .map((container) =>
      container === main
        ? mainLog
        : otherLogs.find((log) => log.container === container)
    )
    .filter((log): log is AgentRunContainerLog => log != null);
  const mergedLines = useMergedLines(logsInOrder, choice === ALL_CONTAINERS);

  let shown: ShownLog;
  if (choice !== ALL_CONTAINERS && logsInOrder.length === 1) {
    shown = fromContainer(logsInOrder[0], agentRun.logSource);
  } else {
    // Merged: a container the pod does not have adds nothing.
    const updated = logsInOrder
      .map((log) => log.lastUpdatedAt)
      .filter((at): at is number => at != null);
    shown = {
      lines: mergedLines,
      isLive: logsInOrder.some((log) => isLiveLog(log, agentRun.logSource)),
      isLoading: logsInOrder.some((log) => log.isLoading),
      error: logsInOrder.find((log) => log.error != null && !log.isNotFound)
        ?.error,
      isNotFound:
        logsInOrder.length > 0 && logsInOrder.every((log) => log.isNotFound),
      lastUpdatedAt: updated.length > 0 ? Math.min(...updated) : undefined,
      refetch: () => {
        logsInOrder.forEach((log) => log.refetch());
      },
    };
  }

  // "View logs": the reader lands on the log, not on the link they left.
  // Focus moves at once; the scroll waits until the log has loaded, since
  // the page may not be tall enough to bring it to the top before.
  const isShownLoading = shown.isLoading;
  React.useEffect(() => {
    if (focusRequest == null) return;
    const region = regionRef.current;
    if (focusRequest === "focus") region?.focus({ preventScroll: true });
    if (isShownLoading) return;
    region?.scrollIntoView?.({ block: "start" });
    onFocused?.();
  }, [focusRequest, onFocused, isShownLoading]);

  const isLive = shown.isLive;

  const knownLabels: Record<string, string> = {
    [MAIN_CONTAINER]: t("agentic.agentRun.logs.containerAgent"),
    "skill-loader": t("agentic.agentRun.logs.containerSkillLoader"),
  };
  const knownHelp: Record<string, string> = {
    "skill-loader": t("agentic.agentRun.logs.containerSkillLoaderHelp"),
  };
  const labelOf = (container: LogContainerChoice) =>
    container === ALL_CONTAINERS
      ? t("agentic.agentRun.logs.containerAll")
      : (knownLabels[container] ?? container);

  const containerSelect = (
    <Select
      isOpen={isSelectOpen}
      onOpenChange={setIsSelectOpen}
      selected={choice}
      onSelect={(_event, value) => {
        setPickedContainer(String(value));
        setIsSelectOpen(false);
      }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          aria-label={t("agentic.agentRun.logs.containerToggle", {
            container: labelOf(choice),
          })}
          onClick={() => setIsSelectOpen(!isSelectOpen)}
          isExpanded={isSelectOpen}
        >
          {labelOf(choice)}
        </MenuToggle>
      )}
    >
      <SelectList aria-label={t("agentic.agentRun.logs.containers")}>
        {[...containers]
          // The main container first: it is the one the view opens on.
          .sort((a, b) => Number(b === main) - Number(a === main))
          .map((container) => (
            <SelectOption
              key={container}
              value={container}
              description={knownHelp[container]}
            >
              {labelOf(container)}
            </SelectOption>
          ))}
        {containers.length > 1 && (
          <>
            <Divider component="li" />
            <SelectOption
              value={ALL_CONTAINERS}
              description={t("agentic.agentRun.logs.containerAllHelp", {
                containers: containers.map(labelOf).join(", "),
              })}
            >
              {labelOf(ALL_CONTAINERS)}
            </SelectOption>
          </>
        )}
      </SelectList>
    </Select>
  );

  const logLabel = t("agentic.agentRun.logs.logLabel", {
    container: labelOf(choice),
  });

  const download = () => {
    saveAs(
      new Blob([logFileText(shown.lines)], {
        type: "text/plain;charset=utf-8",
      }),
      logFileName(agentRun.name, choice)
    );
  };

  const panel = (
    <LogPanel
      // A new container (or agent run) starts following from its end again.
      key={`${agentRun.name}/${choice}`}
      regionId={regionId}
      logLabel={logLabel}
      log={shown}
      isLive={isLive}
      podName={agentRun.podName}
      logHeight={logHeight}
      containerSelect={containerSelect}
      isWrapped={isWrapped}
      onWrapChange={setIsWrapped}
      onDownload={download}
    />
  );

  // One region for every state of the log (and every container), so focus
  // moved here stays when the log loads or the container changes.
  return (
    <div
      ref={regionRef}
      id={regionId}
      role="region"
      aria-label={logLabel}
      // "View logs" moves focus here.
      tabIndex={-1}
      className={height == null ? sizingStyles.h_100 : undefined}
    >
      {panel}
    </div>
  );
};

/**
 * "Wrap lines". It sits in the log viewer's toolbar, so it can read the
 * current search match and hand it over with the new setting.
 */
const WrapLinesCheckbox: React.FC<{
  id: string;
  isChecked: boolean;
  onChange: (isChecked: boolean, matchRow?: number) => void;
}> = ({ id, isChecked, onChange }) => {
  const { t } = useTranslation();
  // Null outside a LogViewer (the toolbar of an empty or loading log).
  const search = React.useContext(LogViewerToolbarContext) as React.ContextType<
    typeof LogViewerToolbarContext
  > | null;
  const hasMatch =
    search != null &&
    search.searchedInput !== "" &&
    search.searchedWordIndexes.some((match) => match.rowIndex >= 0);
  return (
    <Checkbox
      id={id}
      label={t("agentic.agentRun.logs.wrapLines")}
      isChecked={isChecked}
      onChange={(_event, checked) =>
        onChange(checked, hasMatch ? search?.rowInFocus.rowIndex : undefined)
      }
    />
  );
};

interface LogPanelProps {
  /** Id of the log region around the panel. */
  regionId: string;
  /** Accessible name of the log ("Agent log"), also for its scroller. */
  logLabel: string;
  log: ShownLog;
  isLive: boolean;
  podName?: string;
  /** Height of the log itself; default: what the parent leaves. */
  logHeight?: number;
  containerSelect: React.ReactNode;
  isWrapped: boolean;
  onWrapChange: (isWrapped: boolean) => void;
  onDownload: () => void;
}

const LogPanel: React.FC<LogPanelProps> = ({
  regionId,
  logLabel,
  log,
  isLive,
  podName,
  logHeight,
  containerSelect,
  isWrapped,
  onWrapChange,
  onDownload,
}) => {
  const { t } = useTranslation();
  const [isFollowing, setIsFollowing] = React.useState(true);
  // react-window's list, which LogViewer forwards its ref to.
  const listRef = React.useRef<{
    scrollToItem: (index: number, align?: string) => void;
  } | null>(null);
  // Where to put the reader back once the list is rebuilt (wrap toggled).
  const anchorRef = React.useRef<LogAnchor>();
  const lineCount = log.lines.length;
  // Tabs expanded and spaces kept for display only; Download saves the
  // raw lines.
  const displayedLines = useMappedLines(log.lines, displayLogLine);

  // A new height (the view settled, an alert appeared above the log) keeps
  // the scroll offset, so a log that follows its end goes back to it.
  const followRef = React.useRef({ isFollowing, lineCount });
  React.useLayoutEffect(() => {
    followRef.current = { isFollowing, lineCount };
  });
  React.useEffect(() => {
    if (logHeight == null) return;
    const timer = window.setTimeout(() => {
      const { isFollowing: follows, lineCount: count } = followRef.current;
      if (follows && count > 0) listRef.current?.scrollToItem(count - 1, "end");
    });
    return () => window.clearTimeout(timer);
  }, [logHeight]);
  // The work a new list waits for (see `onScroll`), cancelled on unmount.
  const newListTimer = React.useRef<number>();
  React.useEffect(() => () => window.clearTimeout(newListTimer.current), []);

  /** The first row in view, read from the rendered list. */
  const topVisibleRow = () => {
    const rendered = renderedLogRows(document.getElementById(regionId));
    return rendered != null
      ? firstVisibleRow(rendered.rows, rendered.top)
      : undefined;
  };

  const hasLines = lineCount > 0;
  // Lines already read stay on screen when a later read fails.
  const showsLog = hasLines && !log.isNotFound;

  // react-window calls the latest `onScroll`, so it sees the current state.
  const onScroll = (event: LogScrollEvent) => {
    const action = followActionOnScroll(event, isFollowing);
    if (event.scrollOffsetToBottom < 0) {
      // A new list: make its scroll container keyboard focusable, and go
      // back to the end if following.
      window.clearTimeout(newListTimer.current);
      newListTimer.current = window.setTimeout(() => {
        makeLogKeyboardScrollable(document.getElementById(regionId), logLabel);
        const anchor = anchorRef.current;
        anchorRef.current = undefined;
        if (action === "scrollToEnd" && lineCount > 0) {
          listRef.current?.scrollToItem(lineCount - 1, "end");
        } else if (anchor != null) {
          listRef.current?.scrollToItem(anchor.row, anchor.align);
        }
      });
    } else if (action === "pause") {
      setIsFollowing(false);
    }
  };

  const statusLine = (
    <Content
      component="small"
      className={css(textStyles.textColorSubtle, spacingStyles.mbSm)}
    >
      {/* Only state changes are announced: the ticking time is outside. */}
      <span aria-live="polite">
        {isLive ? (
          podName != null ? (
            <Trans
              i18nKey="agentic.agentRun.logs.statusLive"
              values={{ pod: podName }}
              components={{
                pod: <span className={textStyles.fontFamilyMonospace} />,
              }}
            />
          ) : (
            t("agentic.agentRun.logs.statusLiveNoPod")
          )
        ) : (
          t("agentic.agentRun.logs.statusSaved")
        )}
        {isLive && !isFollowing && (
          <> {t("agentic.agentRun.logs.statusPaused")}</>
        )}
      </span>
      {isLive && log.lastUpdatedAt != null && (
        <>
          {" "}
          <UpdatedAgo updatedAt={log.lastUpdatedAt} />
        </>
      )}{" "}
      {t("agentic.agentRun.logs.timesInUtc")}
    </Content>
  );

  const errorAlert =
    log.error != null ? (
      <Alert
        variant="danger"
        isInline
        className={spacingStyles.mbSm}
        title={t("agentic.agentRun.logs.loadFailed")}
        actionLinks={
          <AlertActionLink onClick={log.refetch}>
            {t("agentic.agentRun.tryAgain")}
          </AlertActionLink>
        }
      >
        {isAxiosError(log.error) ? getAxiosErrorMessage(log.error) : null}
      </Alert>
    ) : null;

  const searchLabel = t("agentic.agentRun.logs.search");
  const toolbar = (
    <Toolbar inset={{ default: "insetNone" }}>
      <ToolbarContent>
        <ToolbarGroup>
          <ToolbarItem>{containerSelect}</ToolbarItem>
          <ToolbarItem>
            {showsLog ? (
              <LogViewerSearch
                placeholder={searchLabel}
                aria-label={searchLabel}
                minSearchChars={2}
                // Following would scroll away from the match.
                onChange={(_event, value) => {
                  if (value !== "") setIsFollowing(false);
                }}
                onNextClick={() => setIsFollowing(false)}
                onPreviousClick={() => setIsFollowing(false)}
              />
            ) : (
              <SearchInput
                placeholder={searchLabel}
                aria-label={searchLabel}
                isDisabled
              />
            )}
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarGroup align={{ default: "alignEnd" }}>
          <ToolbarItem alignSelf="center">
            <WrapLinesCheckbox
              id={`${regionId}-wrap`}
              isChecked={isWrapped}
              onChange={(checked, matchRow) => {
                // Wrapping rebuilds the list at its top: keep the place.
                anchorRef.current = readerAnchor({
                  isFollowing,
                  matchRow,
                  topRow: topVisibleRow(),
                });
                onWrapChange(checked);
              }}
            />
          </ToolbarItem>
          {isLive && (
            <ToolbarItem>
              <Button
                variant="link"
                icon={isFollowing ? <PauseIcon /> : <PlayIcon />}
                onClick={() => setIsFollowing(!isFollowing)}
              >
                {isFollowing
                  ? t("agentic.agentRun.logs.pauseFollowing")
                  : t("agentic.agentRun.logs.resumeFollowing")}
              </Button>
            </ToolbarItem>
          )}
          <ToolbarItem>
            <Button
              variant="link"
              icon={<DownloadIcon />}
              onClick={onDownload}
              isDisabled={!hasLines}
            >
              {t("agentic.agentRun.download")}
            </Button>
          </ToolbarItem>
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  );

  if (showsLog) {
    return (
      <LogViewer
        ref={listRef}
        data={displayedLines}
        theme="dark"
        hasLineNumbers
        isTextWrapped={isWrapped}
        height={logHeight ?? "100%"}
        toolbar={toolbar}
        header={
          <>
            {errorAlert}
            {statusLine}
          </>
        }
        scrollToRow={followScrollRow(isFollowing, lineCount)}
        onScroll={onScroll}
      />
    );
  }

  let state: React.ReactNode;
  if (errorAlert != null) {
    state = errorAlert;
  } else if (log.isNotFound) {
    state = (
      <EmptyState
        variant="sm"
        headingLevel="h2"
        titleText={t("agentic.agentRun.logs.notFound")}
      />
    );
  } else if (log.isLoading) {
    state = (
      <Bullseye>
        <Spinner size="xl" aria-label={t("agentic.agentRun.logs.loading")} />
      </Bullseye>
    );
  } else {
    state = (
      <EmptyState
        variant="sm"
        headingLevel="h2"
        titleText={
          isLive
            ? t("agentic.agentRun.logs.emptyLive")
            : t("agentic.agentRun.logs.emptySaved")
        }
      />
    );
  }

  return (
    <Stack className={logHeight == null ? sizingStyles.h_100 : undefined}>
      <StackItem className={spacingStyles.mbSm}>{toolbar}</StackItem>
      <StackItem>{statusLine}</StackItem>
      <StackItem isFilled>{state}</StackItem>
    </Stack>
  );
};
