import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  AgentRunTranscript as Transcript,
  StageAgentRun,
  TranscriptEntry,
} from "@app/agentic";
import { useFetchAgentRunTranscript } from "@app/queries/agentic-observability";

import { AgentRunTranscript } from "./agent-run-transcript";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
// react-markdown is ESM only; the component passes it the message verbatim.
const mockMarkdownRenders: React.ReactNode[] = [];
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    mockMarkdownRenders.push(children);
    return <div data-testid="markdown">{children}</div>;
  },
}));
jest.mock("@app/queries/agentic-observability", () => ({
  useFetchAgentRunTranscript: jest.fn(),
}));

const mockedHook = useFetchAgentRunTranscript as jest.MockedFunction<
  typeof useFetchAgentRunTranscript
>;

const agentRun: StageAgentRun = {
  name: "run-1-migrate",
  runId: "1",
  stageId: "2",
  phase: "Running",
  containers: ["skill-loader", "agent"],
};

const refetch = jest.fn();

const respond = (
  transcript: Transcript | undefined,
  overrides: Partial<ReturnType<typeof useFetchAgentRunTranscript>> = {}
) =>
  mockedHook.mockReturnValue({
    transcript,
    isFetching: false,
    isLoading: false,
    fetchError: null,
    isNotFound: false,
    lastUpdatedAt: Date.now(),
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useFetchAgentRunTranscript>);

const at = (time: string) => `2026-11-16T${time}Z`;

const edit: TranscriptEntry = {
  kind: "toolCall",
  id: "4",
  at: at("21:24:20"),
  toolCallId: "toolu_edit",
  title: "developer__text_editor: str_replace src/Main.java",
  toolKind: "edit",
  status: "completed",
  output: "The file has been edited.",
  diffs: [
    {
      path: "src/Main.java",
      oldText: "package a;\n@Stateless\nclass Main {}\n",
      newText: "package a;\n@ApplicationScoped\nclass Main {}\n",
    },
  ],
};

const entries: TranscriptEntry[] = [
  {
    kind: "plan",
    id: "0",
    at: at("21:24:03"),
    entries: [
      { content: "Prepare workspace", status: "completed" },
      { content: "Migrate code", status: "inProgress" },
      { content: "Push branch", status: "pending" },
    ],
  },
  {
    kind: "message",
    id: "1",
    at: at("21:24:05"),
    role: "agent",
    text: "I'll start from the **proposal**.",
  },
  {
    kind: "thought",
    id: "2",
    at: at("21:24:06"),
    text: "Check the EJB usage first.\nThen the REST resources.",
  },
  {
    kind: "toolCall",
    id: "3",
    at: at("21:24:09"),
    toolCallId: "toolu_build",
    title: "Run mvn compile",
    toolKind: "execute",
    status: "failed",
    // Tools print ANSI colors; the transcript shows the plain text.
    output: "[\u001b[1;31mERROR\u001b[m] BUILD FAILURE",
  },
  edit,
  {
    kind: "status",
    id: "5",
    at: at("21:31:02"),
    text: "Context compacted.",
  },
  {
    kind: "gap",
    id: "6",
    from: at("21:31:10"),
    to: at("21:35:10"),
  },
  {
    kind: "message",
    id: "7",
    at: at("21:35:44"),
    role: "user",
    text: "Skip the tests.",
  },
];

const renderTranscript = (onViewLogs?: () => void) =>
  render(
    <AgentRunTranscript
      agentRun={agentRun}
      phase="Running"
      onViewLogs={onViewLogs}
    />
  );

const toggleFor = (title: RegExp) =>
  screen.getByRole("button", { name: title });

describe("AgentRunTranscript", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders every entry kind", () => {
    respond({ status: "recording", entries });
    renderTranscript();

    const table = screen.getByRole("grid", { name: "Transcript" });
    expect(within(table).getByText("Plan")).toBeInTheDocument();
    // Each plan step says its status in words, after the step.
    const steps = within(table).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Prepare workspace Completed",
      "Migrate code In progress",
      "Push branch Pending",
    ]);
    expect(screen.getAllByTestId("markdown")[0]).toHaveTextContent(
      "I'll start from the **proposal**."
    );
    expect(
      within(table).getByText("Check the EJB usage first.")
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Then the REST resources.")
    ).not.toBeVisible();
    expect(within(table).getByText("Failed")).toBeInTheDocument();
    expect(within(table).getByText("Run mvn compile")).toBeInTheDocument();
    // The kind shows because the title does not already say it.
    expect(within(table).getByText("Execute")).toBeInTheDocument();
    // "text_editor" does not say edit: only a whole word does.
    expect(within(table).getByText("Edit")).toBeInTheDocument();
    expect(within(table).getByText("Context compacted.")).toBeInTheDocument();
    // The gap sentence starts under the Time column, like the other rows.
    const gap = within(table).getByText("Recording interrupted for 4m");
    expect(gap.closest("td")?.getAttribute("colspan")).toBe("2");
    expect(gap.closest("tr")?.querySelectorAll("td")).toHaveLength(2);
    expect(within(table).getByText("Message from a user")).toBeInTheDocument();
    expect(
      screen.getByText(
        /^Recording while the stage runs. Updated (just now|\d+ seconds? ago).$/
      )
    ).toBeInTheDocument();
  });

  it("says Not finished, never In progress, once the stage stopped running", () => {
    const pushing: TranscriptEntry = {
      kind: "toolCall",
      id: "8",
      at: at("21:36:00"),
      toolCallId: "harness-push-1",
      title: "Push konveyor/agentic-migration",
      toolKind: "execute",
      status: "inProgress",
    };
    respond({ status: "complete", entries: [...entries, pushing] });
    const { rerender } = render(
      <AgentRunTranscript agentRun={agentRun} phase="Running" />
    );
    // The plan step and the tool call.
    expect(screen.getAllByText("In progress")).toHaveLength(2);

    for (const phase of ["Failed", "AwaitingApproval", "Succeeded"] as const) {
      rerender(<AgentRunTranscript agentRun={agentRun} phase={phase} />);
      // The plan step and the tool call both say it in words.
      const notFinished = screen.getAllByText("Not finished");
      expect(notFinished).toHaveLength(2);
      expect(screen.queryByText("In progress")).toBeNull();
      // Neutral: no status color.
      notFinished.forEach((text) =>
        expect(
          text
            .closest(".pf-v6-c-label, li, td")
            ?.querySelector(".pf-v6-c-icon__content")
        ).not.toHaveClass("pf-m-info")
      );
    }
    // Finished and failed steps keep their own status; a step that never
    // started will not start now.
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("keeps Pending for a step that has not started while the stage runs", () => {
    respond({ status: "recording", entries });
    render(<AgentRunTranscript agentRun={agentRun} phase="Running" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Not started")).toBeNull();
  });

  it("leaves out the kind when the title says it as a word", () => {
    respond({
      status: "complete",
      entries: [
        {
          kind: "toolCall",
          id: "0",
          at: at("21:24:20"),
          toolCallId: "toolu_search",
          title: "Search the code for @Stateless",
          toolKind: "search",
          status: "completed",
        },
      ],
    });
    renderTranscript();
    expect(screen.getByText("Search the code for @Stateless")).toBeVisible();
    expect(screen.queryByText("Search")).toBeNull();
  });

  it("shows the date only on the first row and when the day changes", () => {
    respond({
      status: "complete",
      entries: [
        { kind: "status", id: "0", at: "2026-11-16T12:00:00", text: "One" },
        { kind: "status", id: "1", at: "2026-11-16T12:00:05", text: "Two" },
        { kind: "status", id: "2", at: "2026-11-17T00:00:01", text: "Three" },
      ],
    });
    renderTranscript();
    expect(screen.getByText("2026-11-16 12:00:00")).toBeInTheDocument();
    expect(screen.getByText("12:00:05")).toBeInTheDocument();
    expect(screen.getByText("2026-11-17 00:00:01")).toBeInTheDocument();
    expect(
      screen.getByText("The whole stage was recorded.")
    ).toBeInTheDocument();
  });

  it("expands and collapses a tool call with the keyboard", async () => {
    const user = userEvent.setup();
    respond({ status: "recording", entries });
    renderTranscript();

    const toggle = toggleFor(/str_replace src\/Main\.java/);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const diff = screen.getByText(/@@ -1,3 \+1,3 @@/);
    expect(diff).toHaveTextContent("-@Stateless");
    expect(diff).toHaveTextContent("+@ApplicationScoped");
    expect(screen.getByText("The file has been edited.")).toBeVisible();

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows tool output without ANSI escape codes", async () => {
    const user = userEvent.setup();
    respond({ status: "recording", entries });
    renderTranscript();

    await user.click(toggleFor(/Run mvn compile/));
    expect(screen.getByText("[ERROR] BUILD FAILURE")).toBeVisible();
  });

  it("expands a thought to the rest of its text", async () => {
    const user = userEvent.setup();
    respond({ status: "recording", entries });
    renderTranscript();

    await user.click(toggleFor(/Thought: Check the EJB usage first/));
    expect(screen.getByText("Then the REST resources.")).toBeVisible();
  });

  it("keeps rows expanded when the transcript grows", async () => {
    const user = userEvent.setup();
    respond({ status: "recording", entries: [edit] });
    const { rerender } = renderTranscript();
    await user.click(toggleFor(/str_replace src\/Main\.java/));

    respond({
      status: "recording",
      entries: [
        {
          kind: "message",
          id: "9",
          at: at("21:24:00"),
          role: "agent",
          text: "Earlier.",
        },
        { ...edit, id: "10", status: "completed" },
        {
          kind: "toolCall",
          id: "11",
          at: at("21:25:00"),
          toolCallId: "toolu_next",
          title: "Read pom.xml",
          status: "inProgress",
          output: "reading",
        },
      ],
    });
    rerender(<AgentRunTranscript agentRun={agentRun} phase="Running" />);

    expect(toggleFor(/str_replace src\/Main\.java/)).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(toggleFor(/Read pom\.xml/)).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("brings the newest entry into view while recording", async () => {
    respond({ status: "recording", entries });
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      renderTranscript();
      await userEvent.click(
        screen.getByRole("button", { name: "Go to latest entry" })
      );
      expect(scrolled).toHaveLength(1);
      expect(
        within(scrolled[0] as HTMLElement).getByText("Skip the tests.")
      ).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("offers Go to latest entry only while recording", () => {
    respond({ status: "complete", entries });
    renderTranscript();
    expect(
      screen.queryByRole("button", { name: "Go to latest entry" })
    ).toBeNull();
  });

  it("says when parts were not recorded", () => {
    respond({ status: "incomplete", entries });
    renderTranscript();
    expect(
      screen.getByText("Parts of this transcript were not recorded.")
    ).toBeInTheDocument();
  });

  it("explains a stage that requires approval and opens the logs", async () => {
    const user = userEvent.setup();
    const onViewLogs = jest.fn();
    respond({ status: "skipped", skipReason: "approve mode", entries: [] });
    renderTranscript(onViewLogs);

    expect(
      screen.getByRole("heading", { name: "No transcript for this stage" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Stages that require approval are not recorded. The logs show what the agent did."
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View logs" }));
    expect(onViewLogs).toHaveBeenCalledTimes(1);
  });

  it("shows the live session's messages of a stage that was not recorded", async () => {
    const user = userEvent.setup();
    const onViewLogs = jest.fn();
    respond({ status: "skipped", skipReason: "approve mode", entries: [] });
    render(
      <AgentRunTranscript
        agentRun={agentRun}
        phase="AwaitingApproval"
        onViewLogs={onViewLogs}
        messages={[
          {
            role: "agent",
            content: "Identified 4 high-risk migration areas.",
            timestamp: at("21:20:00"),
          },
          {
            role: "user",
            content: "Go ahead.",
            timestamp: at("21:21:00"),
          },
        ]}
      />
    );

    expect(
      screen.getByText(
        "Stages that require approval are not recorded. These are the agent's messages from the live session."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No transcript for this stage" })
    ).toBeNull();
    const rows = within(screen.getByRole("grid", { name: "Transcript" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows).toHaveLength(2);
    // Each time is followed by its UTC time for screen readers.
    expect(rows[0]).toHaveTextContent(
      "2026-11-16 21:20:00 (UTC 2026-11-16T21:20:00.000Z)Identified 4 high-risk migration areas."
    );
    expect(rows[1]).toHaveTextContent(
      "21:21:00 (UTC 2026-11-16T21:21:00.000Z)Message from a userGo ahead."
    );
    // Messages never expand, so there is no empty toggle column before Time.
    expect(
      within(screen.getByRole("grid", { name: "Transcript" }))
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["Time", "Entry"]);
    expect(within(rows[0]).getAllByRole("cell")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "View logs" }));
    expect(onViewLogs).toHaveBeenCalledTimes(1);
  });

  it("shows the messages, not the stage's own, of a recorded transcript", () => {
    respond({ status: "complete", entries });
    render(
      <AgentRunTranscript
        agentRun={agentRun}
        phase="Succeeded"
        messages={[
          {
            role: "agent",
            content: "Only in messages",
            timestamp: at("21:20:00"),
          },
        ]}
      />
    );
    expect(screen.queryByText("Only in messages")).toBeNull();
  });

  it("renders again only the entries a refresh changed or added", () => {
    const first: TranscriptEntry = {
      kind: "message",
      id: "m1",
      at: at("21:20:00"),
      role: "agent",
      text: "First",
    };
    const second: TranscriptEntry = { ...first, id: "m2", text: "Second" };
    respond({ status: "recording", entries: [first] });
    const { rerender } = renderTranscript();
    expect(mockMarkdownRenders).toContain("First");

    mockMarkdownRenders.length = 0;
    respond({ status: "recording", entries: [first, second] });
    rerender(<AgentRunTranscript agentRun={agentRun} phase="Running" />);
    expect(mockMarkdownRenders).toContain("Second");
    expect(mockMarkdownRenders).not.toContain("First");
  });

  it("shows local times, with the UTC time in the tooltip to match the log", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [entries[1]] });
    renderTranscript();
    // The tests run in UTC, so local and UTC read the same here.
    const time = screen.getByText("2026-11-16 21:24:05");
    expect(time).toHaveAttribute("datetime", at("21:24:05"));
    await user.hover(time);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /\(UTC 2026-11-16T21:24:05\.000Z\)$/
    );
  });

  it("keeps tool calls without an id apart", async () => {
    const user = userEvent.setup();
    const call = (id: string, title: string): TranscriptEntry => ({
      kind: "toolCall",
      id,
      at: at("21:20:00"),
      toolCallId: "",
      title,
      status: "completed",
      output: `${title} output`,
    });
    respond({
      status: "complete",
      entries: [call("1", "First call"), call("2", "Second call")],
    });
    renderTranscript();
    await user.click(toggleFor(/First call/));
    expect(screen.getByText("First call output")).toBeVisible();
    expect(screen.getByText("Second call output")).not.toBeVisible();
  });

  it("has no View logs action without a handler", () => {
    // No recording of a finished stage (a live one may not have started).
    respond({ status: "none", entries: [] });
    render(<AgentRunTranscript agentRun={agentRun} phase="Succeeded" />);
    expect(
      screen.getByText(
        "This stage was not recorded. The logs show what the agent did."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View logs" })).toBeNull();
  });

  it("says when a live transcript has no entries yet", () => {
    respond({ status: "recording", entries: [] });
    renderTranscript();
    expect(screen.getByText("No transcript entries yet.")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("names the askUser reason of a stage that was not recorded", () => {
    respond({ status: "skipped", skipReason: "askUser enabled", entries: [] });
    renderTranscript();
    expect(
      screen.getByText(/Stages whose agent can ask questions are not recorded/)
    ).toBeInTheDocument();
  });

  it("gives screen readers the UTC time of a row", () => {
    respond({ status: "complete", entries: [edit] });
    renderTranscript();
    expect(
      screen.getByText("(UTC 2026-11-16T21:24:20.000Z)")
    ).toBeInTheDocument();
  });

  it("waits for the recording of a live stage that has none yet", () => {
    respond({ status: "none", entries: [] });
    renderTranscript(jest.fn());
    expect(screen.getByText("No transcript entries yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/Refreshes while the stage runs\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/was not recorded/)).toBeNull();
  });

  it("keeps a not recorded stage's sentence under a failed refresh", () => {
    respond(
      { status: "skipped", skipReason: "approve mode", entries: [] },
      { fetchError: new Error("boom") }
    );
    renderTranscript();
    expect(
      screen.getByText("The transcript could not be loaded.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stages that require approval are not recorded/)
    ).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    respond(undefined, { isLoading: true });
    renderTranscript();
    expect(screen.getByText("Loading transcript")).toBeInTheDocument();
  });

  it("retries after an error", async () => {
    const user = userEvent.setup();
    respond(undefined, { fetchError: new Error("boom") });
    renderTranscript();

    expect(
      screen.getByText("The transcript could not be loaded.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the entries shown when a refresh fails", () => {
    respond({ status: "recording", entries }, { fetchError: new Error("x") });
    renderTranscript();
    expect(
      screen.getByText("The transcript could not be loaded.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("grid", { name: "Transcript" })
    ).toBeInTheDocument();
  });
});
