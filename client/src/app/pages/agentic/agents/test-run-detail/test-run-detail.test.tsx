import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { AgentTestRun } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import TestRunDetail from "./test-run-detail";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
// react-markdown is ESM only; the transcript passes it messages verbatim.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

const testRun = (overrides: Partial<AgentTestRun> = {}): AgentTestRun => ({
  id: "9003",
  name: "Test run #3",
  agent: { id: "2", name: "Code Migrator" },
  application: { id: 5, name: "Inventory Service" },
  task: "Apply the conversion patterns to the service layer.",
  phase: "Succeeded",
  startedAt: "2026-09-19T11:00:00Z",
  addedSkills: [{ id: "4", name: "Quarkus best practices" }],
  ...overrides,
});

/** The agent's test runs, or a failure (403: not retried). */
const useTestRuns = (runs: AgentTestRun[] | "error") =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.agentRuns, (_req, res, ctx) =>
      runs === "error" ? res(ctx.status(403)) : res(ctx.json(runs))
    )
  );

/**
 * A complete transcript of each AgentRun, as the hub serves it (the status
 * in a header, one NDJSON line per recorded update), recording which names
 * were read.
 */
const transcriptNames: string[] = [];
const useTranscript = (agentMessage: string) =>
  server.use(
    rest.get(
      `${AGENTIC_ENDPOINTS.agentRuns}/:name/transcript`,
      (req, res, ctx) => {
        transcriptNames.push(String(req.params.name));
        const line = JSON.stringify({
          t: "2026-09-19T11:01:00Z",
          frame: {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: agentMessage },
              },
            },
          },
        });
        const offset = Number(req.url.searchParams.get("offset") ?? 0);
        return res(
          ctx.set({
            "Content-Type": "application/x-ndjson",
            "X-Transcript-Status": "complete",
          }),
          ctx.body(offset > 0 ? "" : `${line}\n`)
        );
      }
    )
  );

const renderPage = (runId = "9003", search = "") =>
  render(
    <MemoryRouter initialEntries={[`/agents/2/test-runs/${runId}${search}`]}>
      <Route path={DevPaths.agentTestRunDetails}>
        <TestRunDetail />
      </Route>
    </MemoryRouter>
  );

describe("TestRunDetail", () => {
  beforeEach(() => {
    transcriptNames.length = 0;
  });

  it("shows the run by its name, its status and what it ran on, in one view", async () => {
    useTestRuns([testRun()]);
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Test run #3" })
    ).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Agents" })).toHaveAttribute(
      "href",
      "/agents"
    );
    expect(
      within(trail).getByRole("link", { name: "Code Migrator" })
    ).toHaveAttribute("href", "/agents/2?tab=runs");
    expect(
      screen.getByRole("link", { name: "Inventory Service" })
    ).toHaveAttribute("href", "/applications/5");
    expect(
      screen.getByText("Apply the conversion patterns to the service layer.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", "/skills/4");
    expect(within(trail).getByText("Test run #3")).toBeInTheDocument();
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText(/^Started /)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("says None for a test run that added no skills", async () => {
    useTestRuns([testRun({ addedSkills: undefined })]);
    renderPage();
    expect(await screen.findByText("None")).toBeInTheDocument();
  });

  it("reads the transcript of the AgentRun named by the test run id", async () => {
    useTestRuns([testRun()]);
    useTranscript("Test run finished.");
    renderPage();
    // No tab to open: the transcript is under the facts.
    expect(await screen.findByText("Test run finished.")).toBeInTheDocument();
    expect(transcriptNames).toContain("9003");
  });

  it("waits for a test run that has not started", async () => {
    useTestRuns([testRun({ phase: "Pending" })]);
    renderPage();
    expect(
      await screen.findByText(
        "The transcript appears when this test run starts."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Started /)).toBeNull();
    expect(transcriptNames).toEqual([]);
  });

  it("says a missing test run was not found, with the way back to the test runs", async () => {
    useTestRuns([testRun()]);
    renderPage("9999");
    expect(
      await screen.findByRole("heading", { name: "Test run not found" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to test runs" })
    ).toBeInTheDocument();
  });

  it("shows the error state when the test runs cannot be read", async () => {
    useTestRuns("error");
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Unable to connect" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Test run not found")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
