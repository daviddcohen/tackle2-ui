import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { saveAs } from "file-saver";

import { StageAgentRun } from "@app/agentic";
import {
  AgentRunContainerLog,
  useAgentRunLogs,
} from "@app/queries/agentic-observability";
import {
  fakeLogViewer,
  resetFakeLogViewer,
} from "@app/test-config/fake-log-viewer";
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";

import { AgentRunLogs } from "./agent-run-logs";

jest.mock("react-i18next", () => {
  const english = jest.requireActual("@app/test-config/english-i18n");
  return {
    ...english,
    // English text with the markup tags dropped.
    Trans: ({
      i18nKey,
      values,
    }: {
      i18nKey: string;
      values?: Record<string, unknown>;
    }) => english.englishT(i18nKey, values).replace(/<\/?\w+>/g, ""),
  };
});
jest.mock("@patternfly/react-log-viewer", () =>
  jest.requireActual("@app/test-config/fake-log-viewer")
);
jest.mock("@app/queries/agentic-observability", () => ({
  useAgentRunLogs: jest.fn(),
}));
jest.mock("file-saver", () => ({ saveAs: jest.fn() }));

type LogResult = Omit<AgentRunContainerLog, "container">;

const log = (overrides: Partial<LogResult> = {}): LogResult => ({
  lines: [],
  source: "live",
  complete: false,
  isFetching: false,
  isLoading: false,
  error: null,
  isNotFound: false,
  lastUpdatedAt: Date.now(),
  refetch: jest.fn(),
  ...overrides,
});

const withLines = (lines: string[], overrides: Partial<LogResult> = {}) =>
  log({ lines, ...overrides });

/** The logs the mocked hook serves, by container. */
let logs: Record<string, LogResult>;
const serve = (byContainer: Record<string, LogResult>) => {
  logs = byContainer;
  jest
    .mocked(useAgentRunLogs)
    .mockImplementation((_name, containers) =>
      containers.map((container) => ({ container, ...logs[container] }))
    );
};

const agentRun = (overrides: Partial<StageAgentRun> = {}): StageAgentRun => ({
  name: "run-1-migrate",
  runId: "1",
  stageId: "2",
  phase: "Running",
  podName: "run-1-migrate-x7k2p",
  containers: ["skill-loader", "agent"],
  logSource: "live",
  ...overrides,
});

const renderLogs = (overrides: Partial<StageAgentRun> = {}) =>
  render(
    <AgentRunLogs
      agentRun={agentRun(overrides)}
      phase={overrides.phase ?? "Running"}
    />
  );

const shownLines = () =>
  within(screen.getByRole("list", { name: "log lines" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);

const pickContainer = async (name: RegExp) => {
  await userEvent.click(screen.getByRole("button", { name: /^Container:/ }));
  await userEvent.click(screen.getByRole("option", { name }));
};

/** Simulate react-window's scroll report. */
const scroll = (event: {
  scrollDirection: "forward" | "backward";
  scrollOffsetToBottom: number;
  scrollUpdateWasRequested?: boolean;
}) =>
  act(() =>
    fakeLogViewer.props?.onScroll?.({
      scrollOffset: 0,
      scrollUpdateWasRequested: false,
      ...event,
    })
  );

const AGENT_LINES = ["agent one", "agent two", "agent three"];
const LOADER_LINES = ["sources: 2", "2 skill(s) valid"];

beforeEach(() => {
  resetFakeLogViewer();
  jest.mocked(saveAs).mockReset();
  serve({
    agent: withLines(AGENT_LINES),
    "skill-loader": withLines(LOADER_LINES),
  });
});

describe("AgentRunLogs", () => {
  it("shows the live agent log, following its end, in a labelled region", () => {
    renderLogs();
    expect(screen.getByRole("region", { name: "Agent log" })).toBeVisible();
    expect(shownLines()).toEqual(AGENT_LINES);
    expect(fakeLogViewer.props).toMatchObject({
      theme: "dark",
      hasLineNumbers: true,
      isTextWrapped: false,
      scrollToRow: 2,
    });
    expect(
      screen.getByRole("button", { name: "Pause following" })
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Search logs" })
    ).not.toBeDisabled();
  });

  it("switches containers and merges all containers, skill loader first", async () => {
    renderLogs();
    await pickContainer(/^Skill loader/);
    expect(
      screen.getByRole("region", { name: "Skill loader log" })
    ).toBeVisible();
    expect(shownLines()).toEqual(LOADER_LINES);

    await pickContainer(/^All containers/);
    expect(shownLines()).toEqual([
      "[skill-loader] sources: 2",
      "[skill-loader] 2 skill(s) valid",
      "[agent] agent one",
      "[agent] agent two",
      "[agent] agent three",
    ]);

    await pickContainer(/^Agent/);
    expect(shownLines()).toEqual(AGENT_LINES);
  });

  it("says in plain words what the skill loader does", async () => {
    renderLogs();
    await userEvent.click(screen.getByRole("button", { name: /^Container:/ }));
    expect(
      screen.getByRole("option", { name: /^Skill loader/ })
    ).toHaveTextContent(
      "Skill loaderLoads this stage's skills before the agent starts"
    );
    expect(screen.queryByText("Init container")).toBeNull();
  });

  it("offers the containers the agent run has, and All containers only for several", async () => {
    serve({ agent: withLines(AGENT_LINES), sidecar: withLines(["side"]) });
    const { unmount } = renderLogs({ containers: ["agent"] });
    await userEvent.click(screen.getByRole("button", { name: /^Container:/ }));
    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["Agent"]);
    unmount();

    renderLogs({ containers: ["agent", "sidecar"] });
    await pickContainer(/^sidecar/);
    expect(shownLines()).toEqual(["side"]);
    await pickContainer(/^All containers/);
    expect(shownLines()).toEqual([
      "[agent] agent one",
      "[agent] agent two",
      "[agent] agent three",
      "[sidecar] side",
    ]);
  });

  it("shows new lines, also in the merged log, when a poll brings them", async () => {
    const { rerender } = renderLogs();
    await pickContainer(/^All containers/);
    serve({
      agent: withLines([...AGENT_LINES, "agent four"]),
      "skill-loader": withLines(LOADER_LINES),
    });
    rerender(<AgentRunLogs agentRun={agentRun()} phase="Running" />);
    expect(shownLines()).toEqual([
      "[skill-loader] sources: 2",
      "[skill-loader] 2 skill(s) valid",
      "[agent] agent one",
      "[agent] agent two",
      "[agent] agent three",
      "[agent] agent four",
    ]);
  });

  it("says a running stage's log is live before the pod has written one", () => {
    // The hub answered 404: nothing read yet, no source.
    serve({ agent: log({ source: undefined }) });
    renderLogs();
    expect(screen.getByText("No log lines yet")).toBeVisible();
    expect(screen.getByText(/Live from pod/)).toBeVisible();
  });

  it("opens on the skill loader when the agent log is finished and empty", () => {
    serve({
      agent: log({ source: "saved", complete: true }),
      "skill-loader": withLines(LOADER_LINES, {
        source: "saved",
        complete: true,
      }),
    });
    renderLogs({ phase: "Failed", logSource: "saved" });
    expect(shownLines()).toEqual(LOADER_LINES);
    expect(
      screen.getByRole("button", { name: "Container: Skill loader" })
    ).toBeVisible();
  });

  it("pauses following when the user scrolls up and resumes on request", async () => {
    const { rerender } = renderLogs();
    // Programmatic scrolls and small moves near the end keep following.
    scroll({
      scrollDirection: "backward",
      scrollOffsetToBottom: 500,
      scrollUpdateWasRequested: true,
    });
    scroll({ scrollDirection: "backward", scrollOffsetToBottom: 10 });
    expect(fakeLogViewer.props?.scrollToRow).toBe(2);

    scroll({ scrollDirection: "backward", scrollOffsetToBottom: 400 });
    expect(fakeLogViewer.props?.scrollToRow).toBeUndefined();
    expect(screen.getByText(/Following paused\./)).toBeVisible();

    // New lines do not move a paused view.
    serve({
      ...logs,
      agent: withLines([...AGENT_LINES, "agent four"]),
    });
    rerender(<AgentRunLogs agentRun={agentRun()} phase="Running" />);
    expect(shownLines()).toHaveLength(4);
    expect(fakeLogViewer.props?.scrollToRow).toBeUndefined();

    await userEvent.click(
      screen.getByRole("button", { name: "Resume following" })
    );
    expect(fakeLogViewer.props?.scrollToRow).toBe(3);
    expect(screen.queryByText(/Following paused\./)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pause following" })
    ).toBeVisible();
  });

  it("goes back to the end when the list is created again while following", () => {
    jest.useFakeTimers();
    try {
      renderLogs();
      scroll({ scrollDirection: "forward", scrollOffsetToBottom: -1 });
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(fakeLogViewer.scrollToItem).toHaveBeenCalledWith(2, "end");
    } finally {
      jest.useRealTimers();
    }
  });

  it("goes back to the end when its height changes while following", () => {
    jest.useFakeTimers();
    try {
      const props = { agentRun: agentRun(), phase: "Running" as const };
      const { rerender } = render(<AgentRunLogs {...props} height={600} />);
      expect(fakeLogViewer.props?.height).toBe(600);
      act(() => {
        jest.runOnlyPendingTimers();
      });
      fakeLogViewer.scrollToItem.mockClear();
      rerender(<AgentRunLogs {...props} height={700} />);
      expect(fakeLogViewer.props?.height).toBe(700);
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(fakeLogViewer.scrollToItem).toHaveBeenCalledWith(2, "end");

      // Paused: the reader's place stays.
      scroll({ scrollDirection: "backward", scrollOffsetToBottom: 200 });
      fakeLogViewer.scrollToItem.mockClear();
      rerender(<AgentRunLogs {...props} height={650} />);
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(fakeLogViewer.scrollToItem).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("brings the log into view once it has loaded, focusing only on a View logs request", () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const onFocused = jest.fn();
    serve({
      agent: log({ isLoading: true, lastUpdatedAt: undefined }),
      "skill-loader": log({ isLoading: true, lastUpdatedAt: undefined }),
    });
    const props = {
      agentRun: agentRun(),
      phase: "Running" as const,
      onFocused,
    };
    const { rerender } = render(
      <AgentRunLogs {...props} focusRequest="scroll" />
    );
    // The page may not be tall enough yet: wait for the log.
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(onFocused).not.toHaveBeenCalled();

    serve({ agent: withLines(["one"]), "skill-loader": withLines([]) });
    rerender(<AgentRunLogs {...props} focusRequest="scroll" />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(onFocused).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Agent log" })).not.toHaveFocus();
  });

  it("pauses following while searching", async () => {
    renderLogs();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search logs" }),
      "two"
    );
    expect(fakeLogViewer.props?.scrollToRow).toBeUndefined();
    expect(
      screen.getByRole("button", { name: "Resume following" })
    ).toBeVisible();
  });

  it("wraps lines on request", async () => {
    renderLogs();
    await userEvent.click(screen.getByRole("checkbox", { name: "Wrap lines" }));
    expect(fakeLogViewer.props?.isTextWrapped).toBe(true);
  });

  it("keeps the current search match when wrapping lines", async () => {
    renderLogs();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search logs" }),
      "agent t"
    );
    // Matches: "agent two" (row 1), "agent three" (row 2); go to the second.
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Wrap lines" }));
    expect(fakeLogViewer.props?.isTextWrapped).toBe(true);
    // LogViewer rebuilds its list at the top; the view goes back to the match.
    fakeLogViewer.scrollToItem.mockClear();
    scroll({ scrollDirection: "forward", scrollOffsetToBottom: -1 });
    await waitFor(() =>
      expect(fakeLogViewer.scrollToItem).toHaveBeenCalledWith(2, "center")
    );
  });

  it("stays at the end when wrapping lines while following", async () => {
    renderLogs();
    await userEvent.click(screen.getByRole("checkbox", { name: "Wrap lines" }));
    fakeLogViewer.scrollToItem.mockClear();
    scroll({ scrollDirection: "forward", scrollOffsetToBottom: -1 });
    await waitFor(() =>
      expect(fakeLogViewer.scrollToItem).toHaveBeenCalledWith(2, "end")
    );
    expect(fakeLogViewer.scrollToItem).toHaveBeenCalledTimes(1);
  });

  it("downloads the full text of the selected log", async () => {
    renderLogs();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(saveAs).toHaveBeenLastCalledWith(
      expect.any(Blob),
      "run-1-migrate-agent.log"
    );
    const blob = jest.mocked(saveAs).mock.lastCall?.[0] as Blob;
    expect(await readBlob(blob)).toBe("agent one\nagent two\nagent three\n");

    await pickContainer(/^All containers/);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(saveAs).toHaveBeenLastCalledWith(
      expect.any(Blob),
      "run-1-migrate-all-containers.log"
    );
    expect(
      await readBlob(jest.mocked(saveAs).mock.lastCall?.[0] as Blob)
    ).toMatch(/^\[skill-loader\] sources: 2\n.*\[agent\] agent three\n$/s);
  });

  it("shows tabs as kept spaces to the next tab stop and downloads them raw", async () => {
    serve({
      agent: withLines(["2026-11-16T23:35:45Z\tINFO\tstarted"]),
      "skill-loader": withLines([]),
    });
    renderLogs();
    // Runs of spaces are no-break spaces after the first, so the unwrapped
    // view does not collapse them.
    expect(shownLines()).toEqual([
      "2026-11-16T23:35:45Z \u00a0\u00a0\u00a0INFO \u00a0\u00a0\u00a0started",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    const blob = jest.mocked(saveAs).mock.lastCall?.[0] as Blob;
    expect(await readBlob(blob)).toBe("2026-11-16T23:35:45Z\tINFO\tstarted\n");
  });

  it("says where a live log comes from without announcing the clock", () => {
    serve({
      agent: withLines(AGENT_LINES, { lastUpdatedAt: Date.now() - 5000 }),
    });
    renderLogs();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "SMALL" &&
          element.textContent ===
            "Live from pod run-1-migrate-x7k2p. Updated 5 seconds ago. Times are in UTC."
      )
    ).toBeVisible();
    const announced = document.querySelector("[aria-live='polite']");
    expect(announced?.textContent).toBe("Live from pod run-1-migrate-x7k2p.");
  });

  it("shows a saved log at its end with no follow control", () => {
    serve({
      agent: withLines(AGENT_LINES, { source: "saved", complete: true }),
    });
    renderLogs({ phase: "Succeeded", logSource: "saved" });
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "SMALL" &&
          element.textContent ===
            "Saved log. The pod no longer exists. Times are in UTC."
      )
    ).toBeVisible();
    expect(fakeLogViewer.props?.scrollToRow).toBe(2);
    expect(
      screen.queryByRole("button", { name: /following/ })
    ).not.toBeInTheDocument();
  });

  it("tells an empty live log from a finished container that wrote nothing", () => {
    serve({ agent: log() });
    const { unmount } = renderLogs();
    expect(screen.getByText("No log lines yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Search logs" })).toBeDisabled();
    unmount();

    serve({
      agent: log({ source: "saved", complete: true }),
      "skill-loader": log({ source: "saved", complete: true }),
    });
    renderLogs({ phase: "Succeeded", logSource: "saved" });
    expect(screen.getByText("This container wrote no log")).toBeVisible();
  });

  it("shows loading, a missing container and a failure with a retry", async () => {
    serve({ agent: log({ isLoading: true, lastUpdatedAt: undefined }) });
    const { unmount } = renderLogs();
    expect(
      screen.getByRole("progressbar", { name: "Loading log" })
    ).toBeVisible();
    unmount();

    serve({
      agent: log({ isNotFound: true, error: new Error("404") }),
    });
    const notFound = renderLogs();
    expect(
      screen.getByText("This stage has no log for this container")
    ).toBeVisible();
    notFound.unmount();

    const failure = new AxiosError(
      "Request failed",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 500,
        statusText: "Server error",
        data: { message: "log store unavailable" },
        headers: {},
        config: { headers: new AxiosHeaders() },
      }
    );
    const failed = log({ error: failure });
    serve({ agent: failed });
    renderLogs();
    expect(screen.getByText("Log could not be loaded")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.refetch).toHaveBeenCalled();
  });
});

describe("AgentRunLogs after a failed refresh", () => {
  it("keeps the lines read so far under the error", async () => {
    const failed = withLines(AGENT_LINES, { error: new Error("timeout") });
    serve({ agent: failed });
    renderLogs();
    expect(shownLines()).toEqual(AGENT_LINES);
    expect(screen.getByText("Log could not be loaded")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.refetch).toHaveBeenCalled();
  });
});

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
