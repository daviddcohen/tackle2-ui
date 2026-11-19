/**
 * Pure logic of the stage Logs view (`agent-run-logs.tsx`): which container
 * to show, the merged "All containers" log, the download file and following
 * the end of a live log.
 */
import { ANSI } from "./strip-ansi";

/**
 * The main container of an agent run's pod (harness and goose): the one the
 * view opens on. The others (the `skill-loader` init container) come from
 * the agent run's `containers`.
 */
export const MAIN_CONTAINER = "agent";

/** The select value of "All containers" (never a container name: not a DNS label). */
export const ALL_CONTAINERS = "*";

/** What the container select can show: one container, or all of them merged. */
export type LogContainerChoice = string;

/** The container the view opens on: `agent`, else the last one started. */
export const mainContainer = (containers: readonly string[]): string =>
  containers.includes(MAIN_CONTAINER) || containers.length === 0
    ? MAIN_CONTAINER
    : containers[containers.length - 1];

/**
 * The container shown when the user has not picked one: the main one,
 * unless its log is finished and empty while an earlier container (the
 * init container, which runs first) is where the pod stopped.
 */
export const defaultLogContainer = (
  mainLog:
    | {
        lines: string[];
        complete: boolean;
        isLoading: boolean;
        error: unknown;
      }
    | undefined,
  containers: readonly string[],
  main = mainContainer(containers)
): LogContainerChoice => {
  const earlier = containers.find((container) => container !== main);
  return mainLog != null &&
    earlier != null &&
    !mainLog.isLoading &&
    mainLog.error == null &&
    mainLog.complete &&
    mainLog.lines.length === 0
    ? earlier
    : main;
};

/**
 * A line of the "All containers" log: prefixed with its container like
 * `oc logs --prefix`. Containers follow in start order (the init container
 * ends before the agent starts, so this order is also time order).
 */
export const prefixLine = (container: string, line: string) =>
  `[${container}] ${line}`;

/** A mapped list of lines, kept to map the next version incrementally. */
export interface MappedLines<T> {
  input: readonly string[];
  output: T[];
}

/**
 * `next.map(map)`, reusing what `previous` mapped for the lines `next`
 * starts with (a log that grew: the same strings, then new ones). Only the
 * lines from the first difference on are mapped again, so a poll of a long
 * live log maps the new lines and the partial last one, not the whole log.
 * Returns `previous.output` itself when nothing changed.
 */
export const mapAppended = <T>(
  previous: MappedLines<T> | undefined,
  next: readonly string[],
  map: (line: string) => T
): T[] => {
  if (previous == null) return next.map((line) => map(line));
  if (previous.input === next) return previous.output;
  const length = Math.min(previous.input.length, next.length);
  let shared = 0;
  while (shared < length && previous.input[shared] === next[shared]) {
    shared += 1;
  }
  if (shared === next.length && shared === previous.input.length) {
    return previous.output;
  }
  const output = previous.output.slice(0, shared);
  for (let index = shared; index < next.length; index += 1) {
    output.push(map(next[index]));
  }
  return output;
};

/** The text a download saves: every line read so far, newline terminated. */
export const logFileText = (lines: string[]) =>
  lines.length === 0 ? "" : `${lines.join("\n")}\n`;

/** `{agent run}-{container}.log`; the merged log is `{agent run}-all-containers.log`. */
export const logFileName = (agentRunName: string, choice: LogContainerChoice) =>
  `${agentRunName}-${choice === ALL_CONTAINERS ? "all-containers" : choice}.log`;

/** What `LogViewer` reports to `onScroll` (react-window's scroll state). */
export interface LogScrollEvent {
  scrollDirection: "forward" | "backward";
  scrollOffset: number;
  /** -1 when the list has just been created and has not scrolled yet. */
  scrollOffsetToBottom: number;
  /** False when the user scrolled, true for a programmatic scroll. */
  scrollUpdateWasRequested: boolean;
}

/**
 * How far from the end (px) the view may be and still count as at the end.
 * Covers the scroll container's own padding below the last line.
 */
export const FOLLOW_SLACK_PX = 32;

/**
 * What a scroll event means for following the end of the log:
 * - `scrollToEnd`: the list was just (re)created, which `LogViewer` does on
 *   mount, on window resize and when wrapping changes, and a new list starts
 *   at the top, so a following view must go back to the end;
 * - `pause`: the user scrolled up, away from the end, so keep their place;
 * - `none`: anything else (programmatic scrolls, scrolling down, a paused view).
 */
export const followActionOnScroll = (
  event: LogScrollEvent,
  isFollowing: boolean
): "scrollToEnd" | "pause" | "none" => {
  if (event.scrollOffsetToBottom < 0) {
    return isFollowing ? "scrollToEnd" : "none";
  }
  if (
    isFollowing &&
    !event.scrollUpdateWasRequested &&
    event.scrollDirection === "backward" &&
    event.scrollOffsetToBottom > FOLLOW_SLACK_PX
  ) {
    return "pause";
  }
  return "none";
};

/**
 * `LogViewer`'s `scrollToRow` while following: the last line, so every update
 * scrolls to it. `undefined` while paused, so updates leave the view alone.
 */
export const followScrollRow = (isFollowing: boolean, lineCount: number) =>
  isFollowing && lineCount > 0 ? lineCount - 1 : undefined;

/** A row to scroll back to after `LogViewer` rebuilds its list. */
export interface LogAnchor {
  row: number;
  /** "center" for a search match (where search puts it), else "start". */
  align: "start" | "center";
}

/**
 * The 0-based index of the first log row the reader can see: the lowest
 * line number among rendered rows whose bottom is below the view's top.
 * Rows carry their 1-based line number, as `LogViewer` shows it.
 */
export const firstVisibleRow = (
  rows: { lineNumber: number; bottom: number }[],
  viewTop: number
): number | undefined => {
  const visible = rows
    .filter((row) => Number.isFinite(row.lineNumber) && row.bottom > viewTop)
    .map((row) => row.lineNumber);
  return visible.length > 0 ? Math.min(...visible) - 1 : undefined;
};

/**
 * Where the reader is, kept when wrapping lines rebuilds the list:
 * the current search match if there is one, else the first row in
 * view. Nothing while following: the end of the log is the place.
 */
export const readerAnchor = ({
  isFollowing,
  matchRow,
  topRow,
}: {
  isFollowing: boolean;
  matchRow?: number;
  topRow?: number;
}): LogAnchor | undefined => {
  if (isFollowing) return undefined;
  if (matchRow != null && matchRow >= 0) {
    return { row: matchRow, align: "center" };
  }
  if (topRow != null && topRow >= 0) return { row: topRow, align: "start" };
  return undefined;
};

/** Whole seconds between `since` and `now`, never negative. */
export const secondsSince = (since: number, now: number) =>
  Math.max(0, Math.floor((now - since) / 1000));

/** Width of a tab stop in the log view, as a terminal prints it. */
const LOG_TAB_SIZE = 8;

/** One ANSI escape sequence at a given index (sticky copy of `ANSI`). */
const ANSI_AT = new RegExp(ANSI.source, "y");

/**
 * A log line with its tabs expanded to spaces up to the next tab stop, so
 * the view reads the same wrapped or not (a wrapped line otherwise renders
 * tabs as wide gaps). ANSI escape sequences (colors) take no column, as in
 * a terminal, so a tab after a colored word still lands on its tab stop.
 * Only the display changes: Download keeps the raw text.
 */
export const expandTabs = (line: string, tabSize = LOG_TAB_SIZE): string => {
  if (!line.includes("\t")) return line;
  let column = 0;
  let expanded = "";
  let index = 0;
  while (index < line.length) {
    ANSI_AT.lastIndex = index;
    const escape = ANSI_AT.exec(line);
    if (escape != null) {
      expanded += escape[0];
      index += escape[0].length;
      continue;
    }
    const char = String.fromCodePoint(line.codePointAt(index) ?? 0);
    index += char.length;
    if (char === "\t") {
      const spaces = tabSize - (column % tabSize);
      expanded += " ".repeat(spaces);
      column += spaces;
    } else {
      expanded += char;
      column += 1;
    }
  }
  return expanded;
};

const NBSP = " ";

/**
 * A log line whose spaces survive the unwrapped view: the log viewer lays
 * unwrapped lines out with `white-space: nowrap`, which drops leading
 * spaces and collapses runs of spaces, so indentation (stack traces, YAML)
 * and aligned columns would be lost. Every leading space, and every space
 * after another space, becomes a no-break space; single spaces between
 * words stay, so a search for "mvn -q" still matches. Display only:
 * Download keeps the raw text.
 */
export const keepSpaces = (line: string): string =>
  line.includes(" ")
    ? line.replace(/^ +| {2,}/g, (run, offset: number) =>
        offset === 0
          ? NBSP.repeat(run.length)
          : " " + NBSP.repeat(run.length - 1)
      )
    : line;

/** A log line as the view shows it: tabs expanded, spaces kept. */
export const displayLogLine = (line: string): string =>
  keepSpaces(expandTabs(line));
