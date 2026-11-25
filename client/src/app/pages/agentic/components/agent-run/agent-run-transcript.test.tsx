import * as React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  AgentRunTranscript as Transcript,
  StageAgentRun,
  TranscriptEntry,
} from "@app/agentic";
import { useFetchAgentRunTranscript } from "@app/queries/agentic-observability";
// The chatbot's Markdown renderer as the test setup replaces it: it shows
// the Markdown source and logs what it rendered.
import { markdownRenders as mockMarkdownRenders } from "@app/test-config/chatbot-markdown-renderer";

import { AgentRunTranscript } from "./agent-run-transcript";
import { OUTPUT_PREVIEW_LINES } from "./transcript-messages";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
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
    lastUpdatedAt: Date.now(),
    refetch,
    ...overrides,
  });

const at = (time: string) => `2026-11-16T${time}Z`;

const edit: TranscriptEntry = {
  kind: "toolCall",
  id: "4",
  at: at("21:24:20"),
  toolCallId: "toolu_edit",
  title: "text_editor · src/Main.java",
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
    output: "[\u001b[1;31mERROR\u001b[m] BUILD FAILURE\n[ERROR] 1 error",
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
      agentName="Java Code Migrator"
      phase="Running"
      onViewLogs={onViewLogs}
    />
  );

const transcriptRegion = () =>
  screen.getByRole("region", { name: "Transcript" });

/** The messages, named by who sent them and when. */
const messages = () =>
  within(transcriptRegion()).getAllByRole("region", { name: /^Message from / });

const toggleFor = (title: RegExp) =>
  screen.getByRole("button", { name: title });

/** Markdown renders once the chatbot's renderer has loaded. */
const markdownLoaded = () => screen.findAllByTestId("markdown");

describe("AgentRunTranscript", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkdownRenders.length = 0;
  });

  it("shows each entry as a chat message, notices and gaps as dividers", async () => {
    respond({ status: "recording", entries });
    renderTranscript();
    await markdownLoaded();

    // Turns: the plan; the agent's message with the thought and the two
    // tool calls after it; the user's message. The notice and the gap
    // divide the conversation.
    expect(messages()).toHaveLength(3);
    expect(
      within(messages()[1]).getAllByRole("button", { expanded: false })
    ).toHaveLength(2);
    const region = transcriptRegion();
    expect(within(region).getByText("Context compacted.")).toBeInTheDocument();
    expect(
      within(region).getByText("Recording interrupted for 4m")
    ).toBeInTheDocument();
    expect(
      within(region).getByText("Context compacted.").closest("section")
    ).toBeNull();
    expect(
      screen.getByText(
        /^Recording while the stage runs. Updated (just now|\d+ seconds? ago).$/
      )
    ).toBeInTheDocument();
  });

  it("names the agent's messages, labels them AI and renders their Markdown", async () => {
    respond({ status: "complete", entries: [entries[1]] });
    renderTranscript();

    expect(await screen.findByTestId("markdown")).toHaveTextContent(
      "I'll start from the **proposal**."
    );
    const [message] = messages();
    expect(within(message).getByText("Java Code Migrator")).toBeVisible();
    expect(within(message).getByText("AI")).toBeVisible();
    // The agent's avatar is decorative: the name says who speaks.
    expect(message.querySelector(".pf-v6-c-avatar")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("names a steer from a user apart from the agent, without the AI label", async () => {
    respond({ status: "complete", entries: [entries[7]] });
    renderTranscript();
    await markdownLoaded();

    const [message] = messages();
    expect(message).toHaveAccessibleName(/^Message from User at /);
    expect(within(message).getByText("User")).toBeVisible();
    expect(within(message).queryByText("AI")).toBeNull();
    expect(within(message).getByTestId("markdown")).toHaveTextContent(
      "Skip the tests."
    );
  });

  it("calls the agent Agent when its name is not known", async () => {
    respond({ status: "complete", entries: [entries[1]] });
    render(<AgentRunTranscript agentRun={agentRun} phase="Succeeded" />);
    await markdownLoaded();
    expect(messages()[0]).toHaveAccessibleName(/^Message from Agent at /);
  });

  it("shows a tool call as a card with its status in words", () => {
    respond({ status: "complete", entries: [edit] });
    renderTranscript();

    const toggle = toggleFor(/text_editor · src\/Main\.java/);
    // Kind (the title does not say edit as a word), title and status.
    expect(toggle).toHaveTextContent(
      "Edittext_editor · src/Main.javaCompleted"
    );
    expect(within(toggle).getByText("Completed")).toHaveClass(
      "pf-v6-c-label__text"
    );
  });

  it("expands and collapses a tool call with the keyboard", async () => {
    const user = userEvent.setup();
    respond({ status: "recording", entries });
    renderTranscript();

    const toggle = toggleFor(/text_editor · src\/Main\.java/);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const diff = screen.getByRole("region", { name: "Diff of src/Main.java" });
    expect(diff.textContent).toBe(
      " package a;\n-@Stateless\n+@ApplicationScoped\n class Main {}"
    );
    expect(within(diff).getByText("-@Stateless")).toHaveClass(
      "pf-v6-u-text-color-status-danger"
    );
    expect(within(diff).getByText("+@ApplicationScoped")).toHaveClass(
      "pf-v6-u-text-color-status-success"
    );
    expect(screen.getByText("src/Main.java")).toBeVisible();
    expect(screen.getByText("The file has been edited.")).toBeVisible();

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The file has been edited.")).toBeNull();
  });

  it("opens a failed tool call, with its output free of ANSI escape codes", () => {
    respond({ status: "complete", entries });
    renderTranscript();

    const toggle = toggleFor(/Run mvn compile/);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Failed");
    // "Run mvn compile" does not say execute: the kind shows.
    expect(toggle).toHaveTextContent("Execute");
    expect(screen.getByRole("region", { name: "Output" }).textContent).toBe(
      "[ERROR] BUILD FAILURE\n[ERROR] 1 error"
    );
  });

  it("opens a running tool call while the stage runs, and says when it has no output yet", () => {
    const running: TranscriptEntry = {
      kind: "toolCall",
      id: "8",
      at: at("21:36:00"),
      toolCallId: "toolu_running",
      title: "Read pom.xml",
      toolKind: "read",
      status: "inProgress",
    };
    respond({ status: "recording", entries: [running] });
    renderTranscript();

    const toggle = toggleFor(/Read pom\.xml/);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("In progress");
    expect(screen.getByText("No output yet.")).toBeVisible();
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
      expect(screen.getAllByText("Not finished")).toHaveLength(2);
      expect(screen.queryByText("In progress")).toBeNull();
      // Neutral: no status colour on the icon or the label.
      const toggle = toggleFor(/Push konveyor/);
      expect(toggle.querySelector(".pf-v6-c-icon__content")).not.toHaveClass(
        "pf-m-info"
      );
      expect(
        within(toggle).getByText("Not finished").closest(".pf-v6-c-label")
      ).not.toHaveClass("pf-m-blue");
      // Opened while it ran, it stays open for the reader.
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("shows the plan's steps with their status in words", () => {
    respond({ status: "recording", entries });
    renderTranscript();

    const plan = messages()[0];
    expect(within(plan).getByText("Plan (latest status)")).toBeVisible();
    expect(
      within(plan)
        .getAllByRole("listitem")
        .map((step) => step.textContent)
    ).toEqual([
      "Prepare workspace Completed",
      "Migrate code In progress",
      "Push branch Pending",
    ]);
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
    expect(toggleFor(/Search the code/)).toHaveTextContent(
      /^Search the code for @StatelessCompleted$/
    );
  });

  it("collapses a thought to its first line and expands it to the whole thought", async () => {
    const user = userEvent.setup();
    respond({ status: "recording", entries });
    renderTranscript();

    const toggle = toggleFor(/^Thought: Check the EJB usage first\.$/);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Collapsed, the thought's body is not rendered at all.
    expect(screen.queryByText(/Then the REST resources\./)).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Open: the toggle says only the word, the body the whole thought.
    expect(toggle).toHaveAccessibleName("Thought:");
    const thought = await screen.findByText(/Then the REST resources\./);
    expect(thought).toHaveTextContent(
      "Check the EJB usage first. Then the REST resources."
    );
    expect(thought).toBeVisible();
  });

  it("keeps the reader's expand and collapse when the transcript grows", async () => {
    const user = userEvent.setup();
    const failed = entries[3];
    respond({ status: "recording", entries: [edit, failed] });
    const { rerender } = renderTranscript();
    await user.click(toggleFor(/text_editor · src\/Main\.java/));
    await user.click(toggleFor(/Run mvn compile/));

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
        { ...edit, id: "10" },
        { ...failed, id: "11" },
        {
          kind: "toolCall",
          id: "12",
          at: at("21:25:00"),
          toolCallId: "toolu_next",
          title: "Read pom.xml",
          status: "completed",
          output: "reading",
        },
      ],
    });
    rerender(
      <AgentRunTranscript
        agentRun={agentRun}
        agentName="Java Code Migrator"
        phase="Running"
      />
    );

    expect(toggleFor(/text_editor · src\/Main\.java/)).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    // Closed by the reader, though failed calls open by default.
    expect(toggleFor(/Run mvn compile/)).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(toggleFor(/Read pom\.xml/)).toHaveAttribute(
      "aria-expanded",
      "false"
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
    expect(screen.queryByText("Second call output")).toBeNull();
  });

  it("copies a tool call's whole output", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [entries[3]] });
    renderTranscript();

    const copy = screen.getByRole("button", { name: "Copy output" });
    await user.click(copy);
    expect(await navigator.clipboard.readText()).toBe(
      "[ERROR] BUILD FAILURE\n[ERROR] 1 error"
    );
    await user.unhover(copy);
    await user.hover(copy);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copied");
  });

  it("copies a diff", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [edit] });
    renderTranscript();
    await user.click(toggleFor(/text_editor · src\/Main\.java/));

    await user.click(
      screen.getByRole("button", { name: "Copy diff of src/Main.java" })
    );
    expect(await navigator.clipboard.readText()).toBe(
      " package a;\n-@Stateless\n+@ApplicationScoped\n class Main {}"
    );
  });

  it("shows the first lines of a long output, and all of it on request", async () => {
    const user = userEvent.setup();
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
    respond({
      status: "complete",
      entries: [
        {
          kind: "toolCall",
          id: "0",
          at: at("21:24:20"),
          toolCallId: "toolu_long",
          title: "Run the tests",
          status: "failed",
          output: lines.join("\n"),
        },
      ],
    });
    renderTranscript();

    const output = document.querySelector(".pf-v6-c-code-block__code");
    expect(output).toHaveTextContent(`line ${OUTPUT_PREVIEW_LINES}`);
    expect(output).not.toHaveTextContent(`line ${OUTPUT_PREVIEW_LINES + 1}`);
    const showAll = screen.getByRole("button", { name: "Show all 60 lines" });
    expect(showAll).toHaveAttribute("aria-expanded", "false");

    await user.click(showAll);
    expect(output).toHaveTextContent("line 60");
    const showFewer = screen.getByRole("button", { name: "Show fewer lines" });
    expect(showFewer).toHaveAttribute("aria-expanded", "true");
    // Copy takes the whole output, shown or not.
    await user.click(showFewer);
    await user.click(screen.getByRole("button", { name: "Copy output" }));
    expect(await navigator.clipboard.readText()).toBe(lines.join("\n"));
  });

  it("shows short output whole, without Show all", () => {
    respond({ status: "complete", entries: [entries[3]] });
    renderTranscript();
    expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
  });

  it("shows the date only on the first message and when the day changes", async () => {
    const message = (id: string, time: string): TranscriptEntry => ({
      kind: "message",
      id,
      at: time,
      role: "agent",
      text: id,
    });
    respond({
      status: "complete",
      entries: [
        message("One", "2026-11-16T12:00:00Z"),
        message("Two", "2026-11-16T12:00:05Z"),
        message("Three", "2026-11-17T00:00:01Z"),
      ],
    });
    renderTranscript();
    await markdownLoaded();
    expect(screen.getByText("Nov 16, 2026 12:00:00 PM")).toBeInTheDocument();
    expect(screen.getByText("12:00:05 PM")).toBeInTheDocument();
    expect(screen.getByText("Nov 17, 2026 12:00:01 AM")).toBeInTheDocument();
    // A complete recording needs no sentence.
    expect(screen.queryByText(/was recorded/)).toBeNull();
  });

  it("gives each message its UTC time, in its name and the time's tooltip, to match the log", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [entries[1]] });
    renderTranscript();
    await markdownLoaded();

    // The tests run in UTC, so local and UTC read the same here.
    expect(messages()[0]).toHaveAccessibleName(
      "Message from Java Code Migrator at Nov 16, 2026 9:24:05 PM (UTC 21:24:05)"
    );
    await user.hover(screen.getByText("Nov 16, 2026 9:24:05 PM"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /\(UTC 2026-11-16T21:24:05\.000Z\)$/
    );
  });

  it("does not announce the messages as they render", async () => {
    respond({ status: "recording", entries });
    renderTranscript();
    await markdownLoaded();
    messages().forEach((message) =>
      expect(message).not.toHaveAttribute("aria-live")
    );
  });

  it("renders again only the entries a refresh changed or added", async () => {
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
    await markdownLoaded();
    expect(mockMarkdownRenders).toContain("First");

    mockMarkdownRenders.length = 0;
    respond({ status: "recording", entries: [first, second] });
    rerender(
      <AgentRunTranscript
        agentRun={agentRun}
        agentName="Java Code Migrator"
        phase="Running"
      />
    );
    expect(mockMarkdownRenders).toContain("Second");
    expect(mockMarkdownRenders).not.toContain("First");
  });

  it("keeps the recording sentence without a second control for the latest entry", () => {
    respond({ status: "recording", entries });
    renderTranscript();
    expect(
      screen.getByText(/^Recording while the stage runs\./)
    ).toBeInTheDocument();
    // The chat's own Back to latest button is the one control.
    expect(screen.queryByRole("button", { name: /latest entry/ })).toBeNull();
  });

  it("names the jump buttons, and Back to latest follows new entries again", async () => {
    const user = userEvent.setup();
    // A box scrolled to its top, with more below; jsdom has no layout and
    // no scrollTo (the jump buttons scroll smoothly with it).
    const scrollTo = jest.fn();
    const metrics = { scrollHeight: 1000, clientHeight: 200, scrollTo };
    const restore = Object.entries(metrics).map(([name, value]) => {
      const original = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        name
      );
      Object.defineProperty(
        HTMLElement.prototype,
        name,
        typeof value === "function"
          ? { configurable: true, writable: true, value }
          : { configurable: true, get: () => value }
      );
      return () =>
        original &&
        Object.defineProperty(HTMLElement.prototype, name, original);
    });
    try {
      respond({ status: "recording", entries: entries.slice(0, 2) });
      const { rerender } = renderTranscript();
      const box = transcriptRegion();
      // A recording opens at the latest entry; the reader scrolls up.
      expect(box.scrollTop).toBe(1000);
      act(() => {
        box.scrollTop = 0;
        box.dispatchEvent(new Event("scroll"));
      });
      const toLatest = await screen.findByRole("button", {
        name: "Back to latest",
      });
      await user.click(toLatest);
      // The message box scrolls there smoothly itself...
      await waitFor(() =>
        expect(scrollTo).toHaveBeenCalledWith({
          top: 1000,
          behavior: "smooth",
        })
      );
      // ...and the transcript follows from there: a new entry is brought
      // into view though the smooth scroll has not arrived yet.
      respond({ status: "recording", entries: entries.slice(0, 3) });
      await act(async () => {
        rerender(
          <AgentRunTranscript
            agentRun={agentRun}
            agentName="Java Code Migrator"
            phase="Running"
          />
        );
      });
      expect(box.scrollTop).toBe(1000);
      act(() => {
        box.scrollTop = 800;
        box.dispatchEvent(new Event("scroll"));
      });
      expect(
        await screen.findByRole("button", { name: "Back to top" })
      ).toBeInTheDocument();
    } finally {
      restore.forEach((undo) => undo());
    }
  });

  it("renders a collapsed tool call's output only once it is opened", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [edit] });
    renderTranscript();

    const toggle = toggleFor(/text_editor · src\/Main\.java/);
    const card = toggle.closest("section") as HTMLElement;
    expect(card.querySelector(".pf-v6-c-code-block")).toBeNull();
    expect(
      within(card).queryByRole("button", { name: "Copy output" })
    ).toBeNull();
    await user.click(toggle);
    expect(card.querySelector(".pf-v6-c-code-block")).not.toBeNull();
  });

  it("names the output and the diffs, focusable to scroll their long lines", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [edit] });
    renderTranscript();
    await user.click(toggleFor(/text_editor · src\/Main\.java/));

    // Next to the diff, the one-line output is a sentence.
    expect(screen.getByText("The file has been edited.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Output" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Diff of src/Main.java" })
    ).toHaveTextContent("+@ApplicationScoped");
  });

  it("says so when the clipboard refuses the copy", async () => {
    const user = userEvent.setup();
    respond({ status: "complete", entries: [entries[3]] });
    renderTranscript();
    const writeText = jest
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    try {
      const copy = screen.getByRole("button", { name: "Copy output" });
      await user.click(copy);
      await user.unhover(copy);
      await user.hover(copy);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Copy failed"
      );
    } finally {
      writeText.mockRestore();
    }
  });

  it("shows no time for an entry whose time is not valid", async () => {
    respond({
      status: "complete",
      entries: [
        { kind: "message", id: "1", at: "", role: "agent", text: "Hello" },
      ],
    });
    renderTranscript();
    await markdownLoaded();
    const [message] = messages();
    expect(message).toHaveAccessibleName("Message from Java Code Migrator");
    // PF's Timestamp would show the render time: hidden by the CSS.
    expect(message).toHaveAttribute("data-has-time", "false");
  });

  it("fills the given height", () => {
    respond({ status: "complete", entries });
    render(
      <AgentRunTranscript agentRun={agentRun} phase="Succeeded" height={600} />
    );
    expect(
      transcriptRegion().closest(".pf-v6-l-flex") as HTMLElement
    ).toHaveStyle({ height: "600px" });
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
        agentName="Migration Proposal Agent"
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
    await markdownLoaded();

    expect(
      screen.getByText(
        "Stages that require approval are not recorded. These are the agent's messages from the live session."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No transcript for this stage" })
    ).toBeNull();
    const shown = messages();
    expect(shown).toHaveLength(2);
    expect(shown[0]).toHaveAccessibleName(
      "Message from Migration Proposal Agent at Nov 16, 2026 9:20:00 PM (UTC 21:20:00)"
    );
    expect(shown[0]).toHaveTextContent(
      "Identified 4 high-risk migration areas."
    );
    expect(shown[1]).toHaveAccessibleName(
      "Message from User at 9:21:00 PM (UTC 21:21:00)"
    );
    expect(shown[1]).toHaveTextContent("Go ahead.");
    await user.click(screen.getByRole("button", { name: "View logs" }));
    expect(onViewLogs).toHaveBeenCalledTimes(1);
  });

  it("shows the messages, not the stage's own, of a recorded transcript", async () => {
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
    await markdownLoaded();
    expect(screen.queryByText("Only in messages")).toBeNull();
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
    expect(screen.queryByRole("region", { name: "Transcript" })).toBeNull();
  });

  it("says when a finished transcript has no entries", () => {
    respond({ status: "complete", entries: [] });
    renderTranscript();
    expect(
      screen.getByText("This transcript has no entries.")
    ).toBeInTheDocument();
  });

  it("names the askUser reason of a stage that was not recorded", () => {
    respond({ status: "skipped", skipReason: "askUser enabled", entries: [] });
    renderTranscript();
    expect(
      screen.getByText(/Stages whose agent can ask questions are not recorded/)
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
    expect(transcriptRegion()).toBeInTheDocument();
  });

  it("follows new entries while recording", async () => {
    respond({ status: "recording", entries: [entries[1]] });
    const { rerender } = renderTranscript();
    const box = transcriptRegion();
    Object.defineProperty(box, "scrollHeight", {
      configurable: true,
      value: 3000,
    });
    respond({ status: "recording", entries: [entries[1], entries[7]] });
    await act(async () => {
      rerender(
        <AgentRunTranscript
          agentRun={agentRun}
          agentName="Java Code Migrator"
          phase="Running"
        />
      );
    });
    expect(box.scrollTop).toBe(3000);
  });

  it("starts a turn where the agent speaks, with the thoughts just before it", async () => {
    const thought = (id: string): TranscriptEntry => ({
      kind: "thought",
      id,
      at: at("21:24:00"),
      text: id,
    });
    const say = (id: string): TranscriptEntry => ({
      kind: "message",
      id,
      at: at("21:24:01"),
      role: "agent",
      text: id,
    });
    respond({
      status: "complete",
      entries: [
        thought("t1"),
        say("Reading."),
        entries[3],
        thought("t2"),
        say("Building."),
        edit,
      ],
    });
    renderTranscript();
    await markdownLoaded();

    const [first, second] = messages();
    expect(messages()).toHaveLength(2);
    expect(within(first).getByText(/^t1$/)).toBeInTheDocument();
    expect(within(first).getByText("Reading.")).toBeInTheDocument();
    expect(within(first).getByText(/^t2$/)).toBeInTheDocument();
    expect(within(first).getByText("Run mvn compile")).toBeInTheDocument();
    expect(within(second).getByText("Building.")).toBeInTheDocument();
    expect(
      within(second).getByText("text_editor · src/Main.java")
    ).toBeInTheDocument();
  });

  it("ends a running stage's chat with the agent working, and a finished one without", () => {
    respond({ status: "recording", entries: [entries[1]] });
    const { rerender } = renderTranscript();
    expect(
      within(messages()[0]).getByText("The agent is working")
    ).toBeInTheDocument();

    respond({ status: "complete", entries: [entries[1]] });
    rerender(<AgentRunTranscript agentRun={agentRun} phase="Succeeded" />);
    expect(screen.queryByText("The agent is working")).toBeNull();
  });

  it("tells screen readers how many entries arrived, not the ones already there", () => {
    respond({ status: "recording", entries: [entries[1]] });
    const { rerender } = renderTranscript();
    const announcement = () =>
      transcriptRegion().querySelector(".pf-chatbot__messagebox-announcement");
    expect(announcement()).toHaveTextContent("");

    respond({
      status: "recording",
      entries: [entries[1], entries[2], entries[3]],
    });
    rerender(
      <AgentRunTranscript
        agentRun={agentRun}
        agentName="Java Code Migrator"
        phase="Running"
      />
    );
    expect(announcement()).toHaveTextContent("2 new transcript entries");
  });

  it("announces a second batch of the same size too", () => {
    jest.useFakeTimers();
    try {
      const shown = (count: number) => {
        respond({ status: "recording", entries: entries.slice(1, 1 + count) });
        rerender(
          <AgentRunTranscript
            agentRun={agentRun}
            agentName="Java Code Migrator"
            phase="Running"
          />
        );
      };
      respond({ status: "recording", entries: [entries[1]] });
      const { rerender } = renderTranscript();
      const announcement = () =>
        transcriptRegion().querySelector(
          ".pf-chatbot__messagebox-announcement"
        );
      shown(2);
      expect(announcement()).toHaveTextContent("1 new transcript entry");
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(announcement()).toHaveTextContent("");
      shown(3);
      expect(announcement()).toHaveTextContent("1 new transcript entry");
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers a copy button only for output of more than one line", async () => {
    const user = userEvent.setup();
    const oneLine: TranscriptEntry = {
      ...entries[3],
      output: "BUILD FAILURE",
    } as TranscriptEntry;
    respond({ status: "complete", entries: [oneLine] });
    renderTranscript();
    const output = screen.getByRole("region", { name: "Output" });
    expect(output).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("button", { name: "Copy output" })).toBeNull();

    respond({ status: "complete", entries: [entries[3]] });
    renderTranscript();
    await user.click(screen.getAllByRole("button", { name: "Copy output" })[0]);
    expect(await navigator.clipboard.readText()).toContain("BUILD FAILURE");
  });

  it("names a recording gap whose times are not known", () => {
    respond({
      status: "incomplete",
      entries: [entries[1], { kind: "gap", id: "g", from: "", to: "" }],
    });
    renderTranscript();
    expect(
      within(transcriptRegion()).getByText("Recording interrupted")
    ).toBeInTheDocument();
  });

  it("sums up a collapsed thought without its Markdown marks", () => {
    respond({
      status: "complete",
      entries: [
        {
          kind: "thought",
          id: "t",
          at: at("21:24:00"),
          text: "## **Analyzing** the _pom_\nMore.",
        },
      ],
    });
    renderTranscript();
    expect(
      screen.getByRole("button", { name: "Thought: Analyzing the pom" })
    ).toBeInTheDocument();
  });
});
