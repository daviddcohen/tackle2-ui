import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  AgentRunTranscript,
  PlanRun,
  SkillsByStage,
  StageAgentRun,
  StageRun,
} from "@app/agentic";
import type { AgentRun } from "@app/api/agentic/contract";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { fakeLogViewer } from "@app/test-config/fake-log-viewer";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import StageRunDetail from "./stage-run-detail";

// English strings, plus a Trans that renders `<tag>text</tag>` with the
// component given for that tag (the shared stand-in has no Trans).
jest.mock("react-i18next", () => {
  const english = jest.requireActual("@app/test-config/english-i18n");
  const { cloneElement } = jest.requireActual("react");
  return {
    ...english,
    Trans: ({
      i18nKey,
      values,
      components,
    }: {
      i18nKey: string;
      values: Record<string, unknown>;
      components: Record<string, React.ReactElement>;
    }) =>
      english
        .englishT(i18nKey, values)
        .split(/(<\w+>.*?<\/\w+>)/)
        .map((part: string, index: number) => {
          const tag = /^<(\w+)>(.*)<\/\1>$/.exec(part);
          return tag
            ? cloneElement(components[tag[1]], { key: index }, tag[2])
            : part;
        }),
  };
});
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
jest.mock("@monaco-editor/react", () =>
  jest.requireActual("@app/test-config/fake-monaco-editor")
);
// react-markdown is ESM only; the transcript passes it messages verbatim.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));
jest.mock("@patternfly/react-log-viewer", () =>
  jest.requireActual("@app/test-config/fake-log-viewer")
);

const mockGrantedScopes = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const stage = (
  order: number,
  name: string,
  status: StageRun["status"],
  overrides: Partial<StageRun> = {}
): StageRun => ({
  stageId: String(order),
  name,
  agent: { id: String(order), name: `${name} Agent` },
  instructions: `Do ${name}.\n\nThen report.`,
  requiresApproval: false,
  order,
  status,
  ...overrides,
});

const run = (stageRuns: StageRun[], status: PlanRun["status"]): PlanRun => ({
  id: "1",
  name: "Run #1: Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: [{ id: 1, name: "Customer Management" }],
  status,
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns,
});

const useRun = (planRun: PlanRun) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.planRuns}/:id`, (_req, res, ctx) =>
      res(ctx.json(planRun))
    )
  );

/** The agent runs of run 1 (and their resources), or a failure (403: not retried). */
const useAgentRuns = (agentRuns: StageAgentRun[] | "error") =>
  server.use(
    rest.get(
      `${AGENTIC_ENDPOINTS.planRuns}/:id/agent-runs`,
      (_req, res, ctx) =>
        agentRuns === "error" ? res(ctx.status(403)) : res(ctx.json(agentRuns))
    ),
    rest.get(`${AGENTIC_ENDPOINTS.agentRuns}/:name`, (req, res, ctx) =>
      res(ctx.json(resourceOf(String(req.params.name))))
    ),
    rest.get(
      `${AGENTIC_ENDPOINTS.agentRuns}/:name/transcript`,
      (_req, res, ctx) => res(ctx.json(mockTranscript))
    ),
    rest.get(`${AGENTIC_ENDPOINTS.agentRuns}/:name/logs`, (req, res, ctx) =>
      res(
        ctx.json({
          container: req.url.searchParams.get("container"),
          source: "live",
          offset: 0,
          nextOffset: 0,
          text: "",
          complete: false,
        })
      )
    )
  );

let mockTranscript: AgentRunTranscript = { status: "recording", entries: [] };

const resourceOf = (name: string): AgentRun => ({
  apiVersion: "konveyor.io/v1alpha1",
  kind: "AgentRun",
  metadata: {
    name,
    namespace: "konveyor-tackle",
    managedFields: [{ manager: "controller" }],
  } as AgentRun["metadata"],
  spec: { agentRef: "code-migrator" } as AgentRun["spec"],
  status: { phase: "Running" } as AgentRun["status"],
});

const agentRunOf = (
  stageId: string,
  overrides: Partial<StageAgentRun> = {}
): StageAgentRun => ({
  name: `run-1-stage-${stageId}`,
  runId: "1",
  stageId,
  phase: "Running",
  podName: `run-1-stage-${stageId}-x7k2p`,
  containers: ["skill-loader", "agent"],
  usage: {
    contextUsed: 121_400,
    contextSize: 200_000,
    peakContextUsed: 168_204,
    compactions: 1,
    inputTokens: 1_240_311,
    outputTokens: 48_204,
    turnsUsed: 14,
    maxTurns: 50,
    cost: 3.42,
    currency: "USD",
    model: "claude-3-7-sonnet",
  },
  ...overrides,
});

let currentSearch = "";

const renderStage = (stageId: string, search = "") =>
  render(
    <MemoryRouter initialEntries={[`/plan-runs/1/stages/${stageId}${search}`]}>
      <Route path={DevPaths.stageRunDetails}>
        <StageRunDetail />
      </Route>
      <Route
        render={({ location }) => {
          currentSearch = location.search;
          return null;
        }}
      />
    </MemoryRouter>
  );

const fact = (term: string) => {
  const dt = screen
    .getAllByRole("term")
    .find((candidate) => candidate.textContent?.trim() === term);
  if (dt == null) throw new Error(`No fact "${term}"`);
  return dt.nextElementSibling as HTMLElement;
};

const awaiting = run(
  [
    stage(1, "Prepare proposal", "AwaitingApproval", {
      requiresApproval: true,
      startedAt: "2026-11-10T10:06:00Z",
      messages: [
        {
          role: "agent",
          content: "Analysis complete.",
          timestamp: "2026-11-10T10:15:00Z",
        },
        {
          role: "user",
          content: "Looks good.",
          timestamp: "2026-11-10T10:16:00Z",
        },
      ],
      commits: [
        {
          hash: "007a69cafe",
          message: "Prepare proposal: ready",
          stageName: "Prepare proposal",
        },
        {
          hash: "b2c3d4e5f6a1",
          message: "Prepare proposal: notes",
          stageName: "Prepare proposal",
          url: "https://git.example.com/commit/b2c3d4e5f6a1",
        },
      ],
    }),
    stage(2, "Migrate", "Pending"),
  ],
  "AwaitingApproval"
);

beforeEach(() => {
  mockGrantedScopes.all = true;
  mockTranscript = { status: "recording", entries: [] };
  useAgentRuns([]);
});

describe("StageRunDetail", () => {
  it("is titled by the stage and links back to its run", async () => {
    useRun(awaiting);
    renderStage("1");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Prepare proposal" })
    ).toBeInTheDocument();
    const runLinks = screen.getAllByRole("link", {
      name: "Run #1: Java EE to Quarkus",
    });
    // The breadcrumb and the status line both lead to the run.
    expect(runLinks).toHaveLength(2);
    expect(runLinks[1]).toHaveAttribute("href", "/plan-runs/1");
    expect(runLinks[1].parentElement).toHaveTextContent(
      /^Stage 1 of 2 in Run #1: Java EE to Quarkus · Started November 10, 2026/
    );
  });

  it("has the stage facts and the facts of its agent run", async () => {
    useRun(awaiting);
    useAgentRuns([agentRunOf("1", { phase: "Succeeded" })]);
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Pod")).toHaveTextContent("run-1-stage-1-x7k2p");
    expect(
      screen.getAllByRole("term").map((term) => term.textContent?.trim())
    ).toEqual([
      "Agent",
      "Duration",
      "Approval",
      "Model ID",
      "Pod",
      "Turns",
      "Compactions",
      "Tokens",
      "Cost",
      "Context window",
    ]);
    // The agent run's facts are their own section, after the stage's.
    const section = screen.getByRole("heading", { level: 2, name: "Agent run" })
      .parentElement?.parentElement as HTMLElement;
    expect(
      within(section)
        .getAllByRole("term")
        .map((term) => term.textContent?.trim())
    ).toEqual([
      "Model ID",
      "Pod",
      "Turns",
      "Compactions",
      "Tokens",
      "Cost",
      "Context window",
    ]);
    expect(
      within(fact("Agent")).getByRole("link", {
        name: "Prepare proposal Agent",
      })
    ).toHaveAttribute("href", "/agents/1?from=run-1");
    expect(fact("Model ID")).toHaveTextContent("claude-3-7-sonnet");
    expect(fact("Duration")).toHaveTextContent("9m");
    expect(fact("Approval")).toHaveTextContent("Required after this stage");
    expect(fact("Turns")).toHaveTextContent("14 of 50");
    expect(fact("Compactions")).toHaveTextContent("1");
    expect(fact("Tokens")).toHaveTextContent("1.24M input, 48.2K output");
    expect(fact("Cost")).toHaveTextContent("$3.42");
  });

  it("says Not reported for usage the run does not report", async () => {
    useRun(awaiting);
    useAgentRuns([
      agentRunOf("1", {
        podName: undefined,
        usage: { inputTokens: 900, compactions: 0 },
      }),
    ]);
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    await screen.findByText("900 input");
    for (const term of ["Model ID", "Turns", "Cost", "Pod"]) {
      expect(fact(term)).toHaveTextContent("Not reported");
    }
    expect(fact("Compactions")).toHaveTextContent("None");
    expect(fact("Tokens")).toHaveTextContent("900 input");
  });

  it("says a passed gate was approved, or that no approval was recorded", async () => {
    const finished = {
      startedAt: "2026-11-10T10:06:00Z",
      requiresApproval: true,
    };
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Succeeded", {
            ...finished,
            approvedAt: "2026-11-10T10:20:00Z",
          }),
          // An unattended run passes the gate without an approval record.
          stage(2, "Migrate", "Succeeded", finished),
        ],
        "Succeeded"
      )
    );
    const { unmount } = renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Approval")).toHaveTextContent(/^Approved November 10, 2026/);
    unmount();

    renderStage("2");
    await screen.findByRole("heading", { level: 1, name: "Migrate" });
    expect(fact("Approval")).toHaveTextContent("No approval recorded");
  });

  it("says approval is required for a stage waiting for it, even if its definition has no gate", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "AwaitingApproval", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
        "AwaitingApproval"
      )
    );
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Approval")).toHaveTextContent("Required after this stage");
  });

  it("says Not finished for a running duration it cannot read yet, Unavailable once it ended", async () => {
    // The awaiting stage has no agent message to stop the clock.
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "AwaitingApproval", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
        "AwaitingApproval"
      )
    );
    const { unmount } = renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Duration")).toHaveTextContent("Not finished");
    unmount();

    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Failed", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
        "Failed"
      )
    );
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Duration")).toHaveTextContent("Unavailable");
  });

  it("keeps the gate ahead of a gated stage that failed", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Failed", {
            startedAt: "2026-11-10T10:06:00Z",
            requiresApproval: true,
          }),
        ],
        "Failed"
      )
    );
    renderStage("1");
    await screen.findByRole("heading", { level: 1 });
    expect(fact("Approval")).toHaveTextContent("Required after this stage");
  });

  it("asks to check the logs and commits, and links its Logs tab", async () => {
    useRun(awaiting);
    renderStage("1");
    expect(
      await screen.findByText(
        "Prepare proposal Agent finished Prepare proposal. Check its logs and commits, then approve to start Migrate."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review stage" })).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "View logs" }));
    expect(currentSearch).toBe("?tab=logs");
    expect(screen.getByRole("tab", { name: "Logs" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("lands focus on the log after View logs, scrolled into view", async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    useRun(awaiting);
    useAgentRuns([agentRunOf("1", { phase: "AwaitingApproval" })]);
    renderStage("1");
    await userEvent.click(
      await screen.findByRole("link", { name: "View logs" })
    );
    const log = await screen.findByRole("region", { name: "Agent log" });
    await waitFor(() => expect(log).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });

    // Opening the tab by hand later does not move focus.
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    await userEvent.click(screen.getByRole("tab", { name: "Logs" }));
    await screen.findByRole("region", { name: "Agent log" });
    expect(screen.getByRole("tab", { name: "Logs" })).toHaveFocus();
  });

  it("focuses the Logs tab panel when the log cannot show yet, and never the log later", async () => {
    // The query logs the failure to read the agent runs.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    Element.prototype.scrollIntoView = jest.fn();
    useRun(awaiting);
    useAgentRuns("error");
    renderStage("1");
    await userEvent.click(
      await screen.findByRole("link", { name: "View logs" })
    );
    const panel = await screen.findByRole("tabpanel", { name: "Logs" });
    await waitFor(() => expect(panel).toHaveFocus());

    // The agent run arrives later: focus stays where the user put it.
    useAgentRuns([agentRunOf("1", { phase: "AwaitingApproval" })]);
    const tryAgain = await within(panel).findByRole("button", {
      name: "Try again",
    });
    tryAgain.focus();
    await userEvent.keyboard("{Enter}");
    const log = await screen.findByRole("region", { name: "Agent log" });
    expect(log).not.toHaveFocus();
    consoleError.mockRestore();
  });

  it("lists commits with a count, and no activity section", async () => {
    useRun(awaiting);
    renderStage("1");
    // The transcript replaces Activity.
    await screen.findByRole("heading", { level: 2, name: "Instructions" });
    expect(screen.queryByRole("heading", { name: "Activity" })).toBeNull();

    expect(
      screen.getByRole("heading", { level: 2, name: "Commits (2)" })
    ).toBeInTheDocument();
    const commits = screen.getByRole("grid", { name: "Commits" });
    expect(within(commits).getByText("007a69cafe")).toBeInTheDocument();
    expect(
      within(commits).getByRole("link", { name: /b2c3d4e5f6a1/ })
    ).toHaveAttribute("href", "https://git.example.com/commit/b2c3d4e5f6a1");
  });

  it("shows the first line of the output in the alert, and no raw output", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Failed", {
            startedAt: "2026-11-10T10:06:00Z",
            completedAt: "2026-11-10T10:15:00Z",
            output: "Error: Unable to resolve dependency tree.\nat line 2",
          }),
          stage(2, "Migrate", "Pending"),
        ],
        "Failed"
      )
    );
    renderStage("1");
    // The alert has the first line; the rest is in the logs and the YAML
    // (terminationData.stopReason), not repeated on Details.
    expect(
      await screen.findByText("Error: Unable to resolve dependency tree.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/at line 2/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Show output" })).toBeNull();

    expect(screen.getByText("This stage made no commits.")).toBeVisible();
  });

  it("brings the log of a failed stage opened on its Logs tab into view, without moving focus", async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const failed = (status: "Failed" | "Running") =>
      run(
        [
          stage(1, "Prepare proposal", status, {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
        status
      );
    useRun(failed("Failed"));
    useAgentRuns([agentRunOf("1", { phase: "Failed" })]);
    const { unmount } = renderStage("1", "?tab=logs");
    const log = await screen.findByRole("region", { name: "Agent log" });
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
    );
    expect(log).not.toHaveFocus();

    // Only once: opening the tab again by hand does not scroll.
    scrollIntoView.mockClear();
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    await userEvent.click(screen.getByRole("tab", { name: "Logs" }));
    await screen.findByRole("region", { name: "Agent log" });
    expect(scrollIntoView).not.toHaveBeenCalled();
    unmount();

    // A stage that did not fail opens where it is.
    useRun(failed("Running"));
    useAgentRuns([agentRunOf("1")]);
    renderStage("1", "?tab=logs");
    await screen.findByRole("region", { name: "Agent log" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("says a running stage has no commits yet", async () => {
    useRun(
      run(
        [
          stage(1, "Prepare proposal", "Running", {
            startedAt: "2026-11-10T10:06:00Z",
          }),
        ],
        "Running"
      )
    );
    renderStage("1");
    expect(await screen.findByText("No commits yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Commits" })
    ).toBeInTheDocument();
  });

  it("explains a pending stage and leaves out its commits", async () => {
    useRun(awaiting);
    renderStage("2");
    expect(
      await screen.findByText(
        "This stage starts after Prepare proposal is approved."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/^Stage 2 of 2 in/).textContent).not.toMatch(
      /Started/
    );
    // No agent run yet: the stage facts only, and no context row.
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Agent", "Duration", "Approval"]
    );
    expect(fact("Duration")).toHaveTextContent("Not started");
    expect(fact("Approval")).toHaveTextContent("Not required");
    expect(screen.queryByText("Context window")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Instructions" })
    ).toBeInTheDocument();
    expect(screen.getByText("Do Migrate.")).toBeInTheDocument();
    expect(screen.getByText("Then report.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Commits/ })).toBeNull();
  });

  it("offers no decision without the scope to approve", async () => {
    mockGrantedScopes.all = false;
    useRun(awaiting);
    renderStage("1");
    expect(
      await screen.findByText(
        "Prepare proposal Agent finished Prepare proposal. Waiting for approval."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve and continue" })
    ).toBeNull();
  });

  describe("tabs", () => {
    const running = run(
      [
        stage(1, "Prepare proposal", "Running", {
          startedAt: "2026-11-10T10:06:00Z",
        }),
        stage(2, "Migrate", "Pending"),
      ],
      "Running"
    );

    it("opens Details by default and keeps the open tab in the URL", async () => {
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      renderStage("1");
      const details = await screen.findByRole("tab", { name: "Details" });
      expect(details).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("heading", { level: 2, name: "Instructions" })
      ).toBeInTheDocument();
      // The same live sentence as the other views of a running stage.
      expect(
        await screen.findByText(
          /^Refreshes while the stage runs. Updated (just now|\d+ seconds? ago).$/
        )
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: "YAML" }));
      expect(currentSearch).toBe("?tab=yaml");
      expect(screen.getByRole("tab", { name: "YAML" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      // Only the open tab renders.
      expect(
        screen.queryByRole("heading", { name: "Instructions" })
      ).toBeNull();
    });

    it("has Details, Transcript, Logs and YAML, in that order", async () => {
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      renderStage("1", "?tab=logs");
      expect(
        (await screen.findAllByRole("tab")).map((tab) => tab.textContent)
      ).toEqual(["Details", "Transcript", "Logs", "YAML"]);
      expect(screen.getByRole("tab", { name: "Logs" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });

    it("opens the logs from a transcript that was not recorded", async () => {
      mockTranscript = {
        status: "skipped",
        skipReason: "approve mode",
        entries: [],
      };
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      renderStage("1", "?tab=transcript");
      await userEvent.click(
        await screen.findByRole("button", { name: "View logs" })
      );
      expect(currentSearch).toBe("?tab=logs");
      expect(screen.getByRole("tab", { name: "Logs" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      // Focus follows to the log, not to the page body.
      Element.prototype.scrollIntoView = jest.fn();
      await waitFor(() =>
        expect(screen.getByRole("region", { name: "Agent log" })).toHaveFocus()
      );
    });

    it("shows the messages of a stage that was not recorded on its Transcript tab", async () => {
      mockTranscript = {
        status: "skipped",
        skipReason: "approve mode",
        entries: [],
      };
      useRun(awaiting);
      useAgentRuns([agentRunOf("1", { phase: "AwaitingApproval" })]);
      renderStage("1", "?tab=transcript");
      expect(await screen.findByText("Analysis complete.")).toBeVisible();
      expect(screen.getByText("Looks good.")).toBeVisible();
      expect(
        screen.getByText(/These are the agent's messages from the live session/)
      ).toBeVisible();
    });

    it("says when each view of a pending stage appears", async () => {
      useRun(running);
      const { unmount } = renderStage("2", "?tab=transcript");
      expect(
        await screen.findByText(
          "The transcript appears when this stage starts."
        )
      ).toBeInTheDocument();
      unmount();
      renderStage("2", "?tab=logs");
      expect(
        await screen.findByText("The logs appear when this stage starts.")
      ).toBeInTheDocument();
    });

    it("waits for the agent of a running stage whose agent run is not listed yet", async () => {
      useRun(running);
      // beforeEach: the plan run lists no agent runs yet.
      const { unmount } = renderStage("1", "?tab=logs");
      expect(
        await screen.findByText("Waiting for the agent to start.")
      ).toBeInTheDocument();
      expect(screen.getByText(/Refreshes while the stage runs/)).toBeVisible();
      expect(
        screen.queryByText("The logs appear when this stage starts.")
      ).toBeNull();
      unmount();

      renderStage("1");
      await waitFor(() =>
        expect(fact("Turns")).toHaveTextContent("Not reported yet")
      );
      expect(fact("Cost")).toHaveTextContent("Not reported yet");
    });

    it("says the agent never started for a finished stage without an agent run", async () => {
      useRun(
        run(
          [
            stage(1, "Prepare proposal", "Failed", {
              startedAt: "2026-11-10T10:06:00Z",
            }),
          ],
          "Failed"
        )
      );
      renderStage("1", "?tab=transcript");
      expect(
        await screen.findByText("The agent did not start for this stage.")
      ).toBeInTheDocument();
      expect(screen.queryByText(/Refreshes while the stage runs/)).toBeNull();
    });

    it("falls back to Details for an unknown tab", async () => {
      useRun(running);
      renderStage("1", "?tab=transcripts");
      expect(
        await screen.findByRole("tab", { name: "Details" })
      ).toHaveAttribute("aria-selected", "true");
    });

    it("shows the context window as the last Details fact, with its help", async () => {
      useRun(awaiting);
      useAgentRuns([
        agentRunOf("1", {
          phase: "Succeeded",
          usage: { contextUsed: 190_000, contextSize: 200_000 },
        }),
      ]);
      renderStage("1");
      const bar = await screen.findByRole("progressbar", {
        name: "Context window",
      });
      expect(fact("Context window")).toContainElement(bar);
      expect(fact("Context window")).toHaveTextContent(
        "190K of 200K tokens (95%)"
      );
      // The bar is neutral at every level.
      expect(bar).toHaveAttribute(
        "aria-valuetext",
        "190K of 200K tokens (95%)"
      );
      expect(bar.closest(".pf-v6-c-progress")?.className).not.toMatch(
        /pf-m-(warning|danger)/
      );
      // The same help as the plan run's Stages table.
      await userEvent.click(
        screen.getByRole("button", { name: "More information about context" })
      );
      expect(
        await screen.findByText(
          "How full the agent's context window is. The agent compacts it automatically when it gets full."
        )
      ).toBeVisible();

      // The other tabs are the views: no context window there.
      await userEvent.click(screen.getByRole("tab", { name: "YAML" }));
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.queryByText("Context window")).toBeNull();
    });

    it("says a running stage has no usage yet, never Not reported", async () => {
      useRun(running);
      useAgentRuns([
        agentRunOf("1", {
          usage: {
            contextSize: 200_000,
            maxTurns: 50,
            model: "claude-3-7-sonnet",
          },
        }),
      ]);
      renderStage("1");
      await waitFor(() =>
        expect(fact("Turns")).toHaveTextContent("Not reported yet")
      );
      expect(fact("Context window")).toHaveTextContent("Not reported yet");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(fact("Tokens")).toHaveTextContent("Not reported yet");
      expect(fact("Cost")).toHaveTextContent("Not reported yet");
      expect(fact("Model ID")).toHaveTextContent("claude-3-7-sonnet");
      expect(screen.queryByText("Not reported")).toBeNull();
    });

    it("says the context is not reported, or unavailable", async () => {
      useRun(running);
      // Tokens are reported, the context is not (an unmetered model).
      useAgentRuns([agentRunOf("1", { usage: { inputTokens: 10 } })]);
      const { unmount } = renderStage("1");
      expect(await screen.findByText("Context window")).toBeInTheDocument();
      expect(await screen.findAllByText("Not reported")).not.toHaveLength(0);
      expect(screen.queryByRole("progressbar")).toBeNull();
      unmount();

      useAgentRuns("error");
      renderStage("1");
      expect(await screen.findAllByText("Unavailable")).not.toHaveLength(0);
    });

    it("shows the stage's resource as YAML or JSON, without managed fields", async () => {
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      renderStage("1", "?tab=yaml");
      const editor = await screen.findByTestId("code-editor");
      await waitFor(() =>
        expect(editor).toHaveTextContent("name: run-1-stage-1")
      );
      expect(editor).toHaveTextContent("kind: AgentRun");
      expect(editor).not.toHaveTextContent("managedFields");
      expect(
        screen.getByText(/^Refreshes while the stage runs. Updated /)
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /JSON/ }));
      await waitFor(() =>
        expect(screen.getByTestId("code-editor")).toHaveTextContent(
          '"name": "run-1-stage-1"'
        )
      );
    });

    it("offers a retry when the resource cannot be read", async () => {
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      server.use(
        rest.get(`${AGENTIC_ENDPOINTS.agentRuns}/:name`, (_req, res, ctx) =>
          res(ctx.status(403))
        )
      );
      renderStage("1", "?tab=yaml");
      expect(
        await screen.findByText("The YAML could not be loaded.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    });

    it("keeps the YAML under an error when a refresh fails", async () => {
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      renderStage("1", "?tab=yaml");
      const editor = await screen.findByTestId("code-editor");
      await waitFor(() =>
        expect(editor).toHaveTextContent("name: run-1-stage-1")
      );
      server.use(
        rest.get(`${AGENTIC_ENDPOINTS.agentRuns}/:name`, (_req, res, ctx) =>
          res(ctx.status(403))
        )
      );
      await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
      expect(
        await screen.findByText("The YAML could not be loaded.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(screen.getByTestId("code-editor")).toHaveTextContent(
        "name: run-1-stage-1"
      );
      consoleError.mockRestore();
    });

    it("never gives the logs or the YAML less than 480 px", async () => {
      useRun(running);
      useAgentRuns([agentRunOf("1")]);
      // A short window: jsdom has no layout, so the views start at its top.
      const innerHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 300,
      });
      const { unmount } = renderStage("1", "?tab=yaml");
      // The height goes to the components' height props (no inline style);
      // jsdom has no layout, so there is no toolbar height to take off.
      const editor = await screen.findByTestId("code-editor");
      expect(editor).toHaveAttribute("data-height", "480px");
      unmount();
      server.use(
        rest.get(`${AGENTIC_ENDPOINTS.agentRuns}/:name/logs`, (req, res, ctx) =>
          res(
            ctx.json({
              container: req.url.searchParams.get("container"),
              source: "live",
              offset: 0,
              nextOffset: 4,
              text: "one\n",
              complete: false,
            })
          )
        )
      );
      renderStage("1", "?tab=logs");
      await screen.findByRole("region", { name: "Agent log" });
      await waitFor(() => expect(fakeLogViewer.props?.height).toBe(480));
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: innerHeight,
      });
    });

    it("keeps the YAML tab of a pending stage with an empty state", async () => {
      useRun(running);
      renderStage("2", "?tab=yaml");
      expect(
        await screen.findByText("The YAML appears when this stage starts.")
      ).toBeInTheDocument();
      expect(screen.queryByTestId("code-editor")).toBeNull();
    });
  });
  describe("page structure", () => {
    const failed = run(
      [
        stage(1, "Prepare proposal", "Failed", {
          startedAt: "2026-11-10T10:06:00Z",
          output: "Error: Unable to resolve dependency tree.",
        }),
        stage(2, "Migrate", "Pending"),
      ],
      "Failed"
    );

    // PatternFly inline alerts have no role of their own.
    const alerts = () =>
      Array.from(document.querySelectorAll<HTMLElement>(".pf-v6-c-alert"));

    /** The page's top level: the header section, then the tabs section. */
    const tabsSection = () => screen.getByRole("tablist").closest("section");

    it.each([
      ["awaiting approval", "1", false],
      ["failed", "1", true],
      ["pending", "2", false],
    ] as const)(
      "puts nothing between the header and the tabs of a stage %s",
      async (_label, stageId, isFailed) => {
        useRun(isFailed ? failed : awaiting);
        useAgentRuns([agentRunOf("1", { phase: "Succeeded" })]);
        renderStage(stageId);
        const title = await screen.findByRole("heading", { level: 1 });
        const header = title.closest(".pf-v6-c-page__main-section");
        await waitFor(() => expect(alerts()).toHaveLength(1));
        expect(header?.nextElementSibling).toBe(tabsSection());
        // The alert and the context window are tab content.
        expect(
          screen.getByRole("tabpanel", { name: "Details" })
        ).toContainElement(alerts()[0]);
        expect(header).not.toHaveTextContent(/Context window/);
      }
    );

    it("names the one application of the run in the header, keeping the trail", async () => {
      useRun(awaiting);
      renderStage("1");
      const title = await screen.findByRole("heading", { level: 1 });
      const header = title.closest(
        ".pf-v6-c-page__main-section"
      ) as HTMLElement;
      const link = within(header).getByRole("link", {
        name: "Customer Management",
      });
      expect(link).toHaveAttribute("href", "/applications/1");
      expect(link.parentElement).toHaveTextContent(
        /^Application: Customer Management$/
      );
      // No Select, and the URL stays as it was.
      expect(
        within(header).queryByRole("button", { name: /^Application:/ })
      ).toBeNull();
      expect(currentSearch).toBe("");
      // The application row comes before the status line.
      const statusLine = within(header).getByText(/^Stage 1 of 2 in/);
      expect(
        link.compareDocumentPosition(statusLine) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("puts the application Select of a run on several applications first in the header", async () => {
      useRun({
        ...awaiting,
        applications: [
          { id: 1, name: "Customer Management" },
          { id: 2, name: "Inventory Service" },
        ],
      });
      renderStage("1");
      const title = await screen.findByRole("heading", { level: 1 });
      const header = title.closest(
        ".pf-v6-c-page__main-section"
      ) as HTMLElement;
      const toggle = await within(header).findByRole("button", {
        name: "Application: Customer Management",
      });
      expect(
        within(header).queryByRole("link", { name: "Customer Management" })
      ).toBeNull();
      const statusLine = within(header).getByText(/^Stage 1 of 2 in/);
      expect(
        toggle.compareDocumentPosition(statusLine) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("opens every tab of a stage awaiting approval with its alert, View logs on Details only", async () => {
      useRun(awaiting);
      useAgentRuns([agentRunOf("1", { phase: "AwaitingApproval" })]);
      renderStage("1");
      const alertTitle = /Prepare proposal needs approval/;
      expect(await screen.findByText(alertTitle)).toBeVisible();
      expect(screen.getByRole("link", { name: "View logs" })).toBeVisible();
      for (const name of ["Transcript", "Logs", "YAML"]) {
        await userEvent.click(screen.getByRole("tab", { name }));
        const panel = screen.getByRole("tabpanel", { name });
        expect(within(panel).getByText(alertTitle)).toBeVisible();
        expect(
          within(panel).getByRole("button", { name: "Approve and continue" })
        ).toBeVisible();
        expect(
          within(panel).queryByRole("link", { name: "View logs" })
        ).toBeNull();
        // The alert has its own section, before the view's.
        const section = within(panel)
          .getByText(alertTitle)
          .closest(".pf-v6-c-page__main-section");
        expect(section?.parentElement).toBe(panel);
        expect(section?.nextElementSibling).toHaveClass(
          "pf-v6-c-page__main-section"
        );
      }
    });

    it("opens every tab of a failed stage with its alert and Run migration plan", async () => {
      useRun(failed);
      useAgentRuns([agentRunOf("1", { phase: "Failed" })]);
      renderStage("1", "?tab=logs");
      const panel = await screen.findByRole("tabpanel", { name: "Logs" });
      expect(
        await within(panel).findByText(
          "Error: Unable to resolve dependency tree."
        )
      ).toBeVisible();
      expect(
        within(panel).getByRole("button", { name: "Run migration plan" })
      ).toBeVisible();
      expect(
        within(panel).queryByRole("link", { name: "View logs" })
      ).toBeNull();
    });

    it("keeps an alert with no decision for this user on Details", async () => {
      mockGrantedScopes.all = false;
      useRun(awaiting);
      useAgentRuns([agentRunOf("1", { phase: "AwaitingApproval" })]);
      renderStage("1");
      expect(await screen.findByText(/Waiting for approval/)).toBeVisible();
      await userEvent.click(screen.getByRole("tab", { name: "Logs" }));
      await screen.findByRole("region", { name: "Agent log" });
      expect(screen.queryByText(/Waiting for approval/)).toBeNull();
      expect(alerts()).toHaveLength(0);
    });

    it("keeps a failed alert on Details when this user cannot run the plan", async () => {
      mockGrantedScopes.all = false;
      useRun(failed);
      useAgentRuns([agentRunOf("1", { phase: "Failed" })]);
      renderStage("1");
      const details = await screen.findByRole("tabpanel", { name: "Details" });
      expect(
        await within(details).findByText(
          "Error: Unable to resolve dependency tree."
        )
      ).toBeVisible();
      expect(
        within(details).getByRole("link", { name: "View logs" })
      ).toBeVisible();
      expect(
        within(details).queryByRole("button", { name: "Run migration plan" })
      ).toBeNull();

      await userEvent.click(screen.getByRole("tab", { name: "Logs" }));
      await screen.findByRole("region", { name: "Agent log" });
      expect(alerts()).toHaveLength(0);
      expect(screen.queryByRole("link", { name: "View logs" })).toBeNull();
    });

    it("says the Agent run refreshes, and when, only while the stage runs", async () => {
      const withStatus = (status: "Running" | "Succeeded") =>
        run(
          [
            stage(1, "Prepare proposal", status, {
              startedAt: "2026-11-10T10:06:00Z",
            }),
          ],
          status
        );
      useRun(withStatus("Running"));
      useAgentRuns([agentRunOf("1")]);
      const { unmount } = renderStage("1");
      const heading = await screen.findByRole("heading", {
        level: 2,
        name: "Agent run",
      });
      const description = await screen.findByText(
        /^Refreshes while the stage runs. Updated (just now|\d+ seconds? ago).$/
      );
      expect(heading.parentElement).toContainElement(description);
      unmount();

      useRun(withStatus("Succeeded"));
      useAgentRuns([agentRunOf("1", { phase: "Succeeded" })]);
      renderStage("1");
      await screen.findByRole("heading", { level: 2, name: "Agent run" });
      await waitFor(() => expect(fact("Turns")).toHaveTextContent("14 of 50"));
      expect(screen.queryByText(/Refreshes while the stage runs/)).toBeNull();
    });

    it("explains a pending stage on Details only", async () => {
      useRun(awaiting);
      renderStage("2");
      const reason = "This stage starts after Prepare proposal is approved.";
      expect(await screen.findByText(reason)).toBeVisible();
      for (const name of ["Transcript", "Logs", "YAML"]) {
        await userEvent.click(screen.getByRole("tab", { name }));
        expect(screen.queryByText(reason)).toBeNull();
      }
    });
  });
  describe("a run on several applications", () => {
    const customer = { id: 1, name: "Customer Management" };
    const inventory = { id: 2, name: "Inventory Service" };
    const proposalAgent = { id: "1", name: "Prepare proposal Agent" };
    const migrateAgent = { id: "2", name: "Migrate Agent" };
    const skills: SkillsByStage = {
      stages: [
        {
          order: 1,
          name: "Prepare proposal",
          agent: proposalAgent,
          stageId: "1",
          skills: [
            {
              skill: { id: "10", name: "API compatibility checklist" },
              loadPolicy: "skill",
              from: [{ kind: "agent", agent: proposalAgent }],
              excluded: false,
            },
          ],
        },
        {
          order: 2,
          name: "Migrate",
          agent: migrateAgent,
          stageId: "2",
          skills: [
            {
              skill: { id: "20", name: "Jakarta EE namespace migration" },
              loadPolicy: "skill",
              from: [{ kind: "agent", agent: migrateAgent }],
              excluded: false,
            },
          ],
        },
      ],
      everyStage: [customer, inventory].map((application) => ({
        application,
        skills: [
          {
            skill: {
              id: String(100 + application.id),
              name: `${application.name} conventions`,
            },
            loadPolicy: "rule" as const,
            from: [{ kind: "application" as const, application }],
            excluded: false,
          },
        ],
      })),
    };
    const severalRun = (
      status: "Failed" | "AwaitingApproval",
      overrides: Partial<PlanRun> = {}
    ): PlanRun => ({
      ...run(
        [
          stage(1, "Prepare proposal", status, {
            requiresApproval: true,
            startedAt: "2026-11-10T10:06:00Z",
            output: "Error: Unable to resolve dependency tree.",
          }),
          stage(2, "Migrate", "Pending"),
        ],
        status
      ),
      applications: [customer, inventory],
      skills,
      ...overrides,
    });
    /** Customer Management's agent run is the first; Inventory Service's differs in everything. */
    const severalAgentRuns = (
      customerPhase: StageAgentRun["phase"],
      inventoryPhase: StageAgentRun["phase"]
    ) => [
      agentRunOf("1", {
        application: customer,
        phase: customerPhase,
        startedAt: "2026-11-10T10:06:00Z",
        podName: "pod-customer",
      }),
      agentRunOf("1", {
        name: "run-1-stage-1-app-2",
        application: inventory,
        phase: inventoryPhase,
        startedAt: "2026-11-11T12:00:00Z",
        podName: "pod-inventory",
      }),
    ];
    /** Each agent run's transcript and log name it. */
    const useNamedViews = () =>
      server.use(
        rest.get(
          `${AGENTIC_ENDPOINTS.agentRuns}/:name/transcript`,
          (req, res, ctx) =>
            res(
              ctx.json({
                status: "complete",
                entries: [
                  {
                    kind: "message",
                    id: "m1",
                    at: "2026-11-10T10:07:00Z",
                    role: "agent",
                    text: `Working on ${req.params.name}`,
                  },
                ],
              } satisfies AgentRunTranscript)
            )
        ),
        rest.get(
          `${AGENTIC_ENDPOINTS.agentRuns}/:name/logs`,
          (req, res, ctx) => {
            const text = `log of ${req.params.name}\n`;
            return res(
              ctx.json({
                container: req.url.searchParams.get("container"),
                source: "saved",
                offset: 0,
                nextOffset: text.length,
                text,
                complete: true,
              })
            );
          }
        )
      );
    const useSeveralAgentRuns = (
      customerPhase: StageAgentRun["phase"],
      inventoryPhase: StageAgentRun["phase"]
    ) => {
      useAgentRuns(severalAgentRuns(customerPhase, inventoryPhase));
      useNamedViews();
    };
    const header = async () =>
      (await screen.findByRole("heading", { level: 1 })).closest(
        ".pf-v6-c-page__main-section"
      ) as HTMLElement;
    const searchParam = (key: string) =>
      new URLSearchParams(currentSearch).get(key);
    /** Transcript, Logs and YAML of the selected application carry no alert. */
    const expectNoAlertOnViews = async () => {
      Element.prototype.scrollIntoView = jest.fn();
      for (const name of ["Transcript", "Logs", "YAML"]) {
        await userEvent.click(screen.getByRole("tab", { name }));
        await waitFor(() =>
          expect(screen.getByRole("tab", { name })).toHaveAttribute(
            "aria-selected",
            "true"
          )
        );
        expect(screen.queryByRole("heading", { name: /alert:/ })).toBeNull();
      }
      await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    };
    const pickApplication = async (name: string) => {
      await userEvent.click(
        screen.getByRole("button", { name: /^Application: / })
      );
      await userEvent.click(
        await screen.findByRole("option", { name: new RegExp(`^${name}`) })
      );
    };

    it("opens on the application whose agent run needs attention, written once to the URL", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Succeeded", "Failed");
      renderStage("1", "?tab=details&from=agent-4");
      const head = await header();
      expect(
        await within(head).findByRole("button", {
          name: "Application: Inventory Service",
        })
      ).toBeVisible();
      expect(searchParam("application")).toBe("2");
      expect(searchParam("tab")).toBe("details");
      expect(searchParam("from")).toBe("agent-4");
      // The status line is Inventory Service's agent run.
      expect(within(head).getByText("Failed")).toBeVisible();
      expect(within(head).getByText(/^Stage 1 of 2 in/)).toHaveTextContent(
        /Started November 11, 2026/
      );
      await waitFor(() =>
        expect(fact("Pod")).toHaveTextContent("pod-inventory")
      );
    });

    it("lists each application with its status, and switches by keyboard", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Succeeded", "Failed");
      renderStage("1");
      const head = await header();
      const toggle = await within(head).findByRole("button", {
        name: "Application: Inventory Service",
      });
      await waitFor(() => expect(searchParam("application")).toBe("2"));

      toggle.focus();
      await userEvent.keyboard("{Enter}");
      const list = await screen.findByRole("listbox", {
        name: "Applications",
      });
      await userEvent.keyboard("{ArrowDown}");
      const options = within(list).getAllByRole("option");
      // The run's order, each with its agent run's status.
      expect(options.map((option) => option.textContent)).toEqual([
        "Customer ManagementSucceeded",
        "Inventory ServiceFailed",
      ]);
      await waitFor(() => expect(options[0]).toHaveFocus());
      await userEvent.keyboard("{Enter}");

      const picked = await within(head).findByRole("button", {
        name: "Application: Customer Management",
      });
      await waitFor(() => expect(picked).toHaveFocus());
      expect(searchParam("application")).toBe("1");
      expect(within(head).getByText("Succeeded")).toBeVisible();
      expect(within(head).getByText(/^Stage 1 of 2 in/)).toHaveTextContent(
        /Started November 10, 2026/
      );
      expect(fact("Pod")).toHaveTextContent("pod-customer");
    });

    it("points to the failed application from another one, on Details only, with nothing to decide", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Succeeded", "Failed");
      renderStage("1", "?application=1");
      await screen.findByRole("button", {
        name: "Application: Customer Management",
      });
      expect(
        await screen.findByRole("heading", {
          name: "Danger alert: Prepare proposal failed for Inventory Service",
        })
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Run migration plan" })
      ).toBeNull();
      expect(screen.queryByRole("link", { name: "View logs" })).toBeNull();
      expect(
        screen.queryByText("Error: Unable to resolve dependency tree.")
      ).toBeNull();

      // The views of Customer Management carry no alert.
      await expectNoAlertOnViews();

      // "Show" switches every tab to the failed application.
      await userEvent.click(
        await screen.findByRole("button", { name: "Show Inventory Service" })
      );
      const shown = await screen.findByRole("button", {
        name: "Application: Inventory Service",
      });
      // Focus lands on the toggle, like after a choice in the Select.
      await waitFor(() => expect(shown).toHaveFocus());
      expect(searchParam("application")).toBe("2");
      expect(
        screen.getByRole("button", { name: "Run migration plan" })
      ).toBeVisible();
      const viewLogs = screen.getByRole("link", { name: "View logs" });
      const search = new URLSearchParams(
        viewLogs.getAttribute("href")?.split("?")[1]
      );
      expect(search.get("tab")).toBe("logs");
      expect(search.get("application")).toBe("2");
    });

    it("keeps the decision on the waiting application, and says approving moves every application", async () => {
      useRun(severalRun("AwaitingApproval"));
      useSeveralAgentRuns("AwaitingApproval", "Succeeded");
      renderStage("1", "?application=2");
      const head = await header();
      await within(head).findByRole("button", {
        name: "Application: Inventory Service",
      });
      await waitFor(() =>
        expect(within(head).getByText("Succeeded")).toBeVisible()
      );
      // Inventory Service succeeded: a pointer to the application that waits.
      expect(
        await screen.findByRole("heading", {
          name: "Warning alert: Prepare proposal needs approval for Customer Management",
        })
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Approve and continue" })
      ).toBeNull();
      await expectNoAlertOnViews();

      await userEvent.click(
        screen.getByRole("button", { name: "Show Customer Management" })
      );
      expect(
        await screen.findByText(
          "Prepare proposal Agent finished Prepare proposal for Customer Management. Check its logs and commits, then approve to start Migrate for all 2 applications."
        )
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Approve and continue" })
      ).toBeVisible();
      expect(searchParam("application")).toBe("1");
    });

    it("names no application when several failed", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Failed", "Failed");
      renderStage("1", "?application=2");
      expect(
        await screen.findByRole("heading", {
          name: "Danger alert: Prepare proposal failed",
        })
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Run migration plan" })
      ).toBeVisible();
    });

    it("shows the selected application's commits and duration", async () => {
      useRun(
        severalRun("Failed", {
          stageRuns: [
            stage(1, "Prepare proposal", "Failed", {
              startedAt: "2026-11-10T10:06:00Z",
              completedAt: "2026-11-10T10:15:00Z",
              commits: [
                {
                  hash: "aaaa111",
                  message: "Customer change",
                  stageName: "Prepare proposal",
                  application: customer,
                },
                {
                  hash: "bbbb222",
                  message: "Inventory change",
                  stageName: "Prepare proposal",
                  application: inventory,
                },
              ],
            }),
            stage(2, "Migrate", "Pending"),
          ],
        })
      );
      useAgentRuns([
        agentRunOf("1", {
          application: customer,
          phase: "Succeeded",
          startedAt: "2026-11-10T10:06:00Z",
          completedAt: "2026-11-10T10:09:00Z",
        }),
        agentRunOf("1", {
          name: "run-1-stage-1-app-2",
          application: inventory,
          phase: "Failed",
          startedAt: "2026-11-10T10:06:00Z",
          completedAt: "2026-11-10T10:15:00Z",
        }),
      ]);
      useNamedViews();
      renderStage("1", "?application=1");
      const commits = await screen.findByRole("grid", { name: "Commits" });
      expect(commits).toHaveTextContent("Customer change");
      expect(commits).not.toHaveTextContent("Inventory change");
      expect(
        screen.getByRole("heading", { name: "Commits (1)" })
      ).toBeVisible();
      await waitFor(() => expect(fact("Duration")).toHaveTextContent("3m"));

      await pickApplication("Inventory Service");
      await waitFor(() =>
        expect(screen.getByRole("grid", { name: "Commits" })).toHaveTextContent(
          "Inventory change"
        )
      );
      expect(fact("Duration")).toHaveTextContent("9m");
    });

    it.each(["Failed", "AwaitingApproval"] as const)(
      "keeps Skills and Commits loading, and shows no alert, until the application is chosen (%s)",
      async (status) => {
        useRun(severalRun(status));
        server.use(
          rest.get(
            `${AGENTIC_ENDPOINTS.planRuns}/:id/agent-runs`,
            (_req, res, ctx) => res(ctx.delay(5000), ctx.json([]))
          )
        );
        renderStage("1");
        const head = await header();
        // A disabled toggle holds the Select's place, never the links.
        const toggle = await within(head).findByRole("button", {
          name: /^Application:/,
        });
        expect(toggle).toBeDisabled();
        expect(
          within(head).queryByRole("link", { name: "Customer Management" })
        ).toBeNull();
        const skills = screen.getByRole("region", { name: "Skills" });
        expect(skills).not.toHaveTextContent("Every stage");
        expect(within(skills).getByText("Loading skills")).toBeInTheDocument();
        const commits = screen.getByRole("region", { name: "Commits" });
        expect(within(commits).getByText("Loading")).toBeInTheDocument();
        expect(commits).not.toHaveTextContent("This stage made no commits.");
        // Nothing says which application needs a person yet: no alert.
        expect(screen.queryByRole("heading", { name: /alert:/ })).toBeNull();
        expect(
          screen.queryByRole("button", { name: "Approve and continue" })
        ).toBeNull();
      }
    );

    it.each([
      ["Failed", "Danger alert: Prepare proposal failed"],
      ["AwaitingApproval", "Warning alert: Prepare proposal needs approval"],
    ] as const)(
      "says what happened to the stage (%s), with no actions, when the agent runs cannot be read",
      async (status, title) => {
        useRun(severalRun(status));
        useAgentRuns("error");
        renderStage("1");
        expect(
          await screen.findByRole("heading", { name: title })
        ).toBeVisible();
        for (const name of [
          "Run migration plan",
          "Approve and continue",
          /^Show /,
        ]) {
          expect(screen.queryByRole("button", { name })).toBeNull();
        }
        expect(screen.queryByRole("link", { name: "View logs" })).toBeNull();
      }
    );

    it.each([
      ["transcript", "Working on"],
      ["logs", "log of"],
      ["yaml", "name:"],
    ] as const)(
      "shows the selected application's agent run on the %s tab",
      async (tabKey, prefix) => {
        Element.prototype.scrollIntoView = jest.fn();
        useRun(severalRun("Failed"));
        useSeveralAgentRuns("Succeeded", "Failed");
        renderStage("1", `?tab=${tabKey}&application=1`);
        const panel = await screen.findByRole("tabpanel");
        await waitFor(() =>
          expect(panel).toHaveTextContent(`${prefix} run-1-stage-1`)
        );
        expect(panel).not.toHaveTextContent("run-1-stage-1-app-2");

        await pickApplication("Inventory Service");
        await waitFor(() =>
          expect(screen.getByRole("tabpanel")).toHaveTextContent(
            `${prefix} run-1-stage-1-app-2`
          )
        );
        expect(searchParam("tab")).toBe(tabKey);
      }
    );

    it("keeps the application when the tab changes", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Succeeded", "Failed");
      renderStage("1", "?application=1");
      await screen.findByRole("button", {
        name: "Application: Customer Management",
      });
      await userEvent.click(screen.getByRole("tab", { name: "YAML" }));
      expect(searchParam("tab")).toBe("yaml");
      expect(searchParam("application")).toBe("1");
      await userEvent.click(screen.getByRole("tab", { name: "Details" }));
      expect(searchParam("application")).toBe("1");
    });

    it("shows this stage's skills and the selected application's Every stage group only", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Succeeded", "Failed");
      renderStage("1", "?application=2");
      const section = await screen.findByRole("region", { name: "Skills" });
      expect(section).toHaveTextContent(
        "Worked out when the run started. If the agent's skills changed before this stage started, the agent got the new ones."
      );
      const table = within(section).getByRole("grid", { name: "Skills" });
      const groups = () =>
        within(table)
          .getAllByRole("heading", { level: 3 })
          .map((heading) => heading.textContent);
      expect(groups()).toEqual([
        "Stage 1: Prepare proposal",
        "Every stage: Inventory Service",
      ]);
      expect(table).toHaveTextContent("Inventory Service conventions");
      expect(table).not.toHaveTextContent("Customer Management conventions");
      expect(table).not.toHaveTextContent("Jakarta EE namespace migration");

      await pickApplication("Customer Management");
      await waitFor(() =>
        expect(groups()).toEqual([
          "Stage 1: Prepare proposal",
          "Every stage: Customer Management",
        ])
      );
    });

    it("says a pending stage's skills are worked out, and keeps the Select", async () => {
      useRun(severalRun("AwaitingApproval"));
      useSeveralAgentRuns("AwaitingApproval", "Succeeded");
      renderStage("2");
      const head = await header();
      // No agent runs for a pending stage: the run's first application.
      expect(
        await within(head).findByRole("button", {
          name: "Application: Customer Management",
        })
      ).toBeVisible();
      await waitFor(() => expect(searchParam("application")).toBe("1"));
      const section = screen.getByRole("region", { name: "Skills" });
      expect(section).toHaveTextContent(
        "Worked out when the run started. If the agent's skills change before this stage starts, it gets the new ones."
      );
      expect(
        within(section).getByRole("heading", {
          level: 3,
          name: "Stage 2: Migrate",
        })
      ).toBeVisible();
      await userEvent.click(within(head).getByRole("button"));
      expect(
        (await screen.findAllByRole("option")).map(
          (option) => option.textContent
        )
      ).toEqual(["Customer ManagementPending", "Inventory ServicePending"]);
    });

    it("says the skills of a stage the ended run never reached were not read", async () => {
      useRun(severalRun("Failed"));
      useSeveralAgentRuns("Succeeded", "Failed");
      renderStage("2");
      const section = await screen.findByRole("region", { name: "Skills" });
      await waitFor(() =>
        expect(section).toHaveTextContent(
          "Worked out when the run started. This stage did not run, so its agent did not read them."
        )
      );
      expect(section).not.toHaveTextContent("it gets the new ones");
    });
  });

  it("says the skills of a run without a snapshot are unavailable", async () => {
    useRun(awaiting);
    renderStage("1");
    const section = await screen.findByRole("region", { name: "Skills" });
    expect(section).toHaveTextContent(
      /^SkillsUnavailableThis server does not report the skills of a stage yet.$/
    );
  });
});
