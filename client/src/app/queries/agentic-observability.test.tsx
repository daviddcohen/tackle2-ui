import { rest } from "msw";

import { AgentRunLogChunk, ControllerRunPhase } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { act, renderHook, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  AgentRunLogState,
  agentRunPollInterval,
  appendLogChunk,
  useAgentRunLogs,
  useFetchAgentRunResource,
  useFetchAgentRunTranscript,
  useFetchPlanRunAgentRuns,
} from "./agentic-observability";

/** One container's log. */
const useAgentRunLog = (
  name: string | undefined,
  container: string,
  phase: Parameters<typeof useAgentRunLogs>[2]
) => useAgentRunLogs(name, [container], phase)[0];

const logsUrl = (name: string) => `${AGENTIC_ENDPOINTS.agentRuns}/${name}/logs`;

/** A log server over `logs` (by container) that records the offsets asked for. */
const serveLogs = (logs: Record<string, string>, complete = false) => {
  const requests: { container: string; offset: number }[] = [];
  server.use(
    rest.get(logsUrl(":name"), (req, res, ctx) => {
      const container = req.url.searchParams.get("container") ?? "";
      const offset = Number(req.url.searchParams.get("offset") ?? 0);
      requests.push({ container, offset });
      const text = logs[container];
      if (text == null) return res(ctx.status(404), ctx.json({}));
      // ASCII test logs: characters are bytes. Past the end: no text.
      const chunk: AgentRunLogChunk = {
        container,
        source: complete ? "saved" : "live",
        offset,
        nextOffset: Math.max(offset, text.length),
        text: text.slice(offset),
        complete,
      };
      return res(ctx.json(chunk));
    })
  );
  return requests;
};

describe("agentRunPollInterval", () => {
  it.each([
    ["Running", "stream", false, 3000],
    ["Running", "summary", false, 5000],
    ["Pending", "summary", false, 5000],
    ["AwaitingApproval", "stream", false, 30000],
    ["AwaitingApproval", "summary", false, 30000],
    // Terminal: one more fetch until the read in a terminal phase is done.
    ["Succeeded", "stream", false, 3000],
    ["Failed", "summary", false, 5000],
    ["Succeeded", "stream", true, false],
    ["Failed", "summary", true, false],
    [undefined, "stream", false, false],
  ] as const)("%s, %s, settled %s: %s", (phase, cadence, settled, expected) => {
    expect(agentRunPollInterval(phase, cadence, settled)).toBe(expected);
  });
});

describe("appendLogChunk", () => {
  const chunk = (text: string, nextOffset: number): AgentRunLogChunk => ({
    container: "agent",
    source: "live",
    offset: 0,
    nextOffset,
    text,
    complete: false,
  });
  const empty: AgentRunLogState = {
    lines: [],
    partial: "",
    nextOffset: 0,
    complete: false,
  };

  it("keeps the lines held and carries a partial last line", () => {
    const first = appendLogChunk(empty, chunk("one\ntwo\nthr", 11));
    expect(first).toMatchObject({
      lines: ["one", "two"],
      partial: "thr",
      nextOffset: 11,
    });
    const second = appendLogChunk(first, chunk("ee\nfour\n", 19));
    expect(second).toMatchObject({
      lines: ["one", "two", "three", "four"],
      partial: "",
    });
    expect(second.lines[0]).toBe(first.lines[0]);
  });

  it("keeps the same lines array when no line was completed", () => {
    const first = appendLogChunk(empty, chunk("one\n", 4));
    expect(appendLogChunk(first, chunk("tw", 6)).lines).toBe(first.lines);
    expect(appendLogChunk(first, chunk("", 4)).lines).toBe(first.lines);
  });
});

describe("useAgentRunLog", () => {
  it("appends only the new text on every fetch", async () => {
    const logs = { agent: "one\ntwo\n" };
    const requests = serveLogs(logs);
    const { result } = renderHook(() =>
      useAgentRunLog("run-1-migrate", "agent", "Running")
    );
    await waitFor(() => expect(result.current.lines).toEqual(["one", "two"]));
    expect(result.current).toMatchObject({
      source: "live",
      complete: false,
      isLoading: false,
    });
    expect(result.current.lastUpdatedAt).toEqual(expect.any(Number));

    logs.agent += "three\nfour (partial";
    await act(() => result.current.refetch());
    await waitFor(() =>
      expect(result.current.lines).toEqual([
        "one",
        "two",
        "three",
        "four (partial",
      ])
    );
    const held = result.current.lines;
    logs.agent += ")\n";
    await act(() => result.current.refetch());
    await waitFor(() =>
      expect(result.current.lines).toEqual([
        "one",
        "two",
        "three",
        "four (partial)",
      ])
    );
    // The lines read before stay the same strings.
    expect(result.current.lines[0]).toBe(held[0]);
    expect(requests.map((request) => request.offset)).toEqual([0, 8, 27]);
  });

  it("appends a chunk once when Try again overlaps a read in flight", async () => {
    const logs = { agent: "one\ntwo\n" };
    const requests: number[] = [];
    server.use(
      rest.get(logsUrl(":name"), async (req, res, ctx) => {
        const offset = Number(req.url.searchParams.get("offset") ?? 0);
        requests.push(offset);
        const chunk: AgentRunLogChunk = {
          container: "agent",
          source: "live",
          offset,
          nextOffset: Math.max(offset, logs.agent.length),
          text: logs.agent.slice(offset),
          complete: false,
        };
        // The second read is slow, so Try again starts while it is in flight.
        return res(ctx.delay(requests.length === 2 ? 200 : 0), ctx.json(chunk));
      })
    );
    const { result } = renderHook(() =>
      useAgentRunLog("run-1-migrate", "agent", "Running")
    );
    await waitFor(() => expect(result.current.lines).toEqual(["one", "two"]));

    logs.agent += "three\n";
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(requests).toEqual([0, 8]));
    await act(() => result.current.refetch());
    await waitFor(() =>
      expect(result.current.lines).toEqual(["one", "two", "three"])
    );
    // Wait past the slow read: its answer is not appended as well.
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(result.current.lines).toEqual(["one", "two", "three"]);
    expect(requests).toEqual([0, 8, 8]);

    await act(() => result.current.refetch());
    await waitFor(() => expect(requests).toEqual([0, 8, 8, 14]));
    expect(result.current.lines).toEqual(["one", "two", "three"]);
  });

  it("starts a new log when the container changes", async () => {
    const requests = serveLogs({
      agent: "agent line\n",
      "skill-loader": "3 skill(s) valid\n",
    });
    const { result, rerender } = renderHook(
      ({ container }) => useAgentRunLog("run-1-migrate", container, "Running"),
      { initialProps: { container: "agent" } }
    );
    await waitFor(() => expect(result.current.lines).toEqual(["agent line"]));
    rerender({ container: "skill-loader" });
    await waitFor(() =>
      expect(result.current.lines).toEqual(["3 skill(s) valid"])
    );
    expect(requests).toEqual([
      { container: "agent", offset: 0 },
      { container: "skill-loader", offset: 0 },
    ]);
  });

  it("returns the logs of several containers in the order asked", async () => {
    serveLogs({ agent: "agent line\n", "skill-loader": "3 skill(s) valid\n" });
    const { result } = renderHook(() =>
      useAgentRunLogs("run-1-migrate", ["skill-loader", "agent"], "Running")
    );
    await waitFor(() =>
      expect(result.current.map((log) => log.lines)).toEqual([
        ["3 skill(s) valid"],
        ["agent line"],
      ])
    );
    expect(result.current.map((log) => log.container)).toEqual([
      "skill-loader",
      "agent",
    ]);
  });

  it("reports a complete saved log and errors such as an unknown container", async () => {
    serveLogs({ agent: "done\n" }, true);
    const { result } = renderHook(() =>
      useAgentRunLog("run-1-migrate", "agent", "Succeeded")
    );
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current.source).toBe("saved");

    const missing = renderHook(() =>
      useAgentRunLog("run-1-migrate", "sidecar", "Succeeded")
    );
    await waitFor(() => expect(missing.result.current.error).toBeTruthy());
    expect(missing.result.current.isNotFound).toBe(true);
    expect(missing.result.current.lines).toEqual([]);
  });

  it("does not fetch without a name or container", () => {
    const requests = serveLogs({ agent: "x\n" });
    const { result } = renderHook(() =>
      useAgentRunLog(undefined, "agent", "Running")
    );
    expect(result.current.isLoading).toBe(false);
    renderHook(() => useAgentRunLogs("run-1-migrate", [], "Running"));
    expect(requests).toEqual([]);
  });
});

describe("summary and transcript hooks", () => {
  it("fetch the plan run's agent runs and a transcript", async () => {
    server.use(
      rest.get(`${AGENTIC_ENDPOINTS.planRuns}/1/agent-runs`, (_req, res, ctx) =>
        res(
          ctx.json([
            {
              name: "run-1-migrate",
              runId: "1",
              stageId: "2",
              phase: "Running",
              containers: ["skill-loader", "agent"],
            },
          ])
        )
      ),
      rest.get(
        `${AGENTIC_ENDPOINTS.agentRuns}/run-1-migrate/transcript`,
        (_req, res, ctx) =>
          res(
            ctx.json({
              status: "recording",
              entries: [
                {
                  kind: "status",
                  id: "0",
                  at: "2026-11-17T09:00:00Z",
                  text: "Hi",
                },
              ],
            })
          )
      )
    );
    const runs = renderHook(() => useFetchPlanRunAgentRuns("1", "Running"));
    await waitFor(() => expect(runs.result.current.agentRuns).toHaveLength(1));
    const transcript = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Running")
    );
    await waitFor(() =>
      expect(transcript.result.current.transcript?.entries).toHaveLength(1)
    );
    expect(transcript.result.current.transcript?.status).toBe("recording");
  });

  it("tells a missing plan run apart", async () => {
    server.use(
      rest.get(`${AGENTIC_ENDPOINTS.planRuns}/9/agent-runs`, (_req, res, ctx) =>
        res(ctx.status(404), ctx.json({ message: "Plan run not found." }))
      )
    );
    const { result } = renderHook(() =>
      useFetchPlanRunAgentRuns("9", "Running")
    );
    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    expect(result.current.agentRuns).toEqual([]);
  });
});

/** Advance the fake clock a second at a time, letting each fetch settle. */
const advance = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
  }
};

const agentRun = (phase: string) => ({
  name: "run-1-migrate",
  runId: "1",
  stageId: "2",
  phase,
  containers: ["skill-loader", "agent"],
});

describe("polling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /** A transcript server answering with each status in turn (the last one stays). */
  const serveTranscript = (statuses: string[], failFrom?: number) => {
    let requests = 0;
    server.use(
      rest.get(
        `${AGENTIC_ENDPOINTS.agentRuns}/run-1-migrate/transcript`,
        (_req, res, ctx) => {
          requests += 1;
          if (failFrom != null && requests >= failFrom) {
            return res(ctx.status(403), ctx.json({ message: "Forbidden" }));
          }
          const status = statuses[Math.min(requests, statuses.length) - 1];
          return res(ctx.json({ status, entries: [] }));
        }
      )
    );
    return () => requests;
  };

  it("polls a recording transcript every 3 s and stops once it is skipped", async () => {
    const requests = serveTranscript(["recording", "recording", "skipped"]);
    const { result } = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Running")
    );
    await waitFor(() =>
      expect(result.current.transcript?.status).toBe("recording")
    );
    expect(requests()).toBe(1);

    await advance(3000);
    expect(requests()).toBe(2);
    await advance(3000);
    expect(requests()).toBe(3);
    expect(result.current.transcript?.status).toBe("skipped");

    await advance(15000);
    expect(requests()).toBe(3);
  });

  it("never polls a skipped transcript, even while the stage runs", async () => {
    const requests = serveTranscript(["skipped"]);
    const { result } = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Running")
    );
    await waitFor(() =>
      expect(result.current.transcript?.status).toBe("skipped")
    );
    await advance(15000);
    expect(requests()).toBe(1);
  });

  it("keeps polling an incomplete transcript while the stage runs, as the hub resumes recording after a restart", async () => {
    const requests = serveTranscript(["recording", "incomplete", "recording"]);
    const { result } = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Running")
    );
    await waitFor(() =>
      expect(result.current.transcript?.status).toBe("recording")
    );
    await advance(3000);
    expect(result.current.transcript?.status).toBe("incomplete");
    await advance(3000);
    expect(requests()).toBe(3);
    expect(result.current.transcript?.status).toBe("recording");
  });

  it.each(["complete", "incomplete"])(
    "polls a %s transcript while the stage runs, and reads it once after it ends",
    async (status) => {
      const requests = serveTranscript([status]);
      const { result, rerender } = renderHook(
        ({ phase }: { phase: ControllerRunPhase }) =>
          useFetchAgentRunTranscript("run-1-migrate", phase),
        { initialProps: { phase: "Running" as ControllerRunPhase } }
      );
      await waitFor(() =>
        expect(result.current.transcript?.status).toBe(status)
      );
      await advance(3000);
      expect(requests()).toBe(2);

      rerender({ phase: "Succeeded" });
      await advance(3000);
      expect(requests()).toBe(3);
      await advance(15000);
      expect(requests()).toBe(3);
    }
  );

  it("stops polling on an error and polls again after Try again", async () => {
    // The query logs its failure.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const requests = serveTranscript(["recording"], 2);
    const { result } = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Running")
    );
    await waitFor(() => expect(result.current.transcript).toBeDefined());
    await advance(3000);
    await waitFor(() => expect(result.current.fetchError).not.toBeNull());
    expect(requests()).toBe(2);
    // The data read before the error stays.
    expect(result.current.transcript?.status).toBe("recording");

    await advance(15000);
    expect(requests()).toBe(2);

    serveTranscript(["recording"]);
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.fetchError).toBeNull());
    await advance(3000);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    consoleError.mockRestore();
  });

  it("fetches the agent runs once more after the run turns terminal, then stops", async () => {
    let phase = "Running";
    let requests = 0;
    server.use(
      rest.get(
        `${AGENTIC_ENDPOINTS.planRuns}/1/agent-runs`,
        (_req, res, ctx) => {
          requests += 1;
          return res(ctx.json([agentRun(phase)]));
        }
      )
    );
    const { result, rerender } = renderHook(
      ({ runPhase }) => useFetchPlanRunAgentRuns("1", runPhase),
      { initialProps: { runPhase: "Running" as "Running" | "Succeeded" } }
    );
    await waitFor(() => expect(result.current.agentRuns).toHaveLength(1));
    await advance(5000);
    expect(requests).toBe(2);

    // The plan run finished; the list still says Running until it is read again.
    rerender({ runPhase: "Succeeded" });
    phase = "Succeeded";
    await advance(5000);
    expect(requests).toBe(3);
    expect(result.current.agentRuns[0].phase).toBe("Succeeded");

    await advance(20000);
    expect(requests).toBe(3);
  });

  it("reads the agent runs of a finished run once, even before its phase is known", async () => {
    let requests = 0;
    server.use(
      rest.get(
        `${AGENTIC_ENDPOINTS.planRuns}/1/agent-runs`,
        (_req, res, ctx) => {
          requests += 1;
          return res(ctx.json([agentRun("Succeeded")]));
        }
      )
    );
    // The plan run is still loading: its phase is not known yet.
    const { result, rerender } = renderHook(
      ({ runPhase }) => useFetchPlanRunAgentRuns("1", runPhase),
      { initialProps: { runPhase: undefined as "Succeeded" | undefined } }
    );
    await waitFor(() => expect(result.current.agentRuns).toHaveLength(1));
    rerender({ runPhase: "Succeeded" });
    await advance(30000);
    expect(requests).toBe(1);
  });

  it("polls a stage awaiting approval every 30 s", async () => {
    const requests = serveLogs({ agent: "one\n" });
    renderHook(() =>
      useAgentRunLog("run-1-migrate", "agent", "AwaitingApproval")
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await advance(29000);
    expect(requests).toHaveLength(1);
    await advance(1000);
    expect(requests).toHaveLength(2);
  });
});

describe("useAgentRunLog errors", () => {
  it("reports an error on the very first read", async () => {
    // The query logs its failure.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    server.use(
      rest.get(logsUrl(":name"), (_req, res, ctx) =>
        res(ctx.status(400), ctx.json({ message: "bad offset" }))
      )
    );
    const { result } = renderHook(() =>
      useAgentRunLog("run-1-migrate", "agent", "Running")
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.lines).toEqual([]);
    expect(result.current.isNotFound).toBe(false);
    consoleError.mockRestore();
  });
});

describe("polling around a stage's start and end", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const transcriptUrl = `${AGENTIC_ENDPOINTS.agentRuns}/run-1-migrate/transcript`;

  it("reads a 404 log of a live stage as not written yet and keeps polling", async () => {
    let written = false;
    const requests: number[] = [];
    server.use(
      rest.get(logsUrl(":name"), (req, res, ctx) => {
        requests.push(Number(req.url.searchParams.get("offset")));
        if (!written) return res(ctx.status(404), ctx.json({}));
        return res(
          ctx.json({
            container: "agent",
            source: "live",
            offset: 0,
            nextOffset: 6,
            text: "first\n",
            complete: false,
          })
        );
      })
    );
    const { result } = renderHook(() =>
      useAgentRunLog("run-1-migrate", "agent", "Running")
    );
    await waitFor(() => expect(result.current.lastUpdatedAt).toBeDefined());
    expect(result.current).toMatchObject({
      lines: [],
      error: null,
      isNotFound: false,
    });
    await advance(3000);
    expect(requests).toEqual([0, 0]);
    written = true;
    await advance(3000);
    expect(result.current.lines).toEqual(["first"]);
  });

  it("reads a 404 transcript as no recording, polled while the stage runs", async () => {
    let recording = false;
    let requests = 0;
    server.use(
      rest.get(transcriptUrl, (_req, res, ctx) => {
        requests += 1;
        return recording
          ? res(ctx.json({ status: "recording", entries: [] }))
          : res(ctx.status(404), ctx.json({}));
      })
    );
    const { result } = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Running")
    );
    await waitFor(() => expect(result.current.transcript?.status).toBe("none"));
    expect(result.current.fetchError).toBeNull();
    await advance(3000);
    expect(requests).toBe(2);
    recording = true;
    await advance(3000);
    expect(result.current.transcript?.status).toBe("recording");
  });

  it("reads a 404 transcript of a finished stage once, as no recording", async () => {
    let requests = 0;
    server.use(
      rest.get(transcriptUrl, (_req, res, ctx) => {
        requests += 1;
        return res(ctx.status(404), ctx.json({}));
      })
    );
    const { result } = renderHook(() =>
      useFetchAgentRunTranscript("run-1-migrate", "Failed")
    );
    await waitFor(() => expect(result.current.transcript?.status).toBe("none"));
    expect(result.current.fetchError).toBeNull();
    await advance(15000);
    expect(requests).toBe(1);
  });

  it("reads a log once more after the stage ends, then stops, even if it never says complete", async () => {
    const requests = serveLogs({ agent: "one\n" });
    const { rerender } = renderHook(
      ({ phase }) => useAgentRunLog("run-1-migrate", "agent", phase),
      { initialProps: { phase: "Running" as "Running" | "Succeeded" } }
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await advance(3000);
    expect(requests).toHaveLength(2);

    rerender({ phase: "Succeeded" });
    await advance(3000);
    expect(requests).toHaveLength(3);
    await advance(30000);
    expect(requests).toHaveLength(3);
  });

  it("reads a transcript still marked recording once more after the stage ends, then stops", async () => {
    let requests = 0;
    server.use(
      rest.get(transcriptUrl, (_req, res, ctx) => {
        requests += 1;
        return res(ctx.json({ status: "recording", entries: [] }));
      })
    );
    const { rerender } = renderHook(
      ({ phase }) => useFetchAgentRunTranscript("run-1-migrate", phase),
      { initialProps: { phase: "Running" as "Running" | "Failed" } }
    );
    await waitFor(() => expect(requests).toBe(1));
    rerender({ phase: "Failed" });
    await advance(3000);
    expect(requests).toBe(2);
    await advance(30000);
    expect(requests).toBe(2);
  });

  it("reads the resource once more after the stage ends, then stops", async () => {
    let requests = 0;
    server.use(
      rest.get(
        `${AGENTIC_ENDPOINTS.agentRuns}/run-1-migrate`,
        (_req, res, ctx) => {
          requests += 1;
          // The CR still says Running (the controller lags the stage).
          return res(
            ctx.json({
              apiVersion: "konveyor.io/v1alpha1",
              kind: "AgentRun",
              metadata: { name: "run-1-migrate" },
              spec: {},
              status: { phase: "Running" },
            })
          );
        }
      )
    );
    const { rerender } = renderHook(
      ({ phase }) => useFetchAgentRunResource("run-1-migrate", phase),
      { initialProps: { phase: "Running" as "Running" | "Succeeded" } }
    );
    await waitFor(() => expect(requests).toBe(1));
    await advance(5000);
    expect(requests).toBe(2);
    rerender({ phase: "Succeeded" });
    await advance(5000);
    expect(requests).toBe(3);
    await advance(30000);
    expect(requests).toBe(3);
  });

  it("does not poll a stage that was already finished when it was opened", async () => {
    const requests = serveLogs({ agent: "one\n" });
    renderHook(() => useAgentRunLog("run-1-migrate", "agent", "Failed"));
    await waitFor(() => expect(requests).toHaveLength(1));
    await advance(30000);
    expect(requests).toHaveLength(1);
  });
});
