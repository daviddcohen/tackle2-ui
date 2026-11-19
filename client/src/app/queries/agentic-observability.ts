/**
 * TanStack Query hooks for run observability: the AgentRun behind each stage
 * of a plan run, its resource, its transcript and its container logs.
 *
 * Keys live under the `agentRunObservability` group of `agenticKeys`, which
 * the approve and start mutations invalidate (`MUTATION_EFFECTS`).
 *
 * Refresh: each hook takes the phase of what it shows (the plan run for the
 * list, the agent run for the rest: `agentRun.phase`, which in a run on
 * several applications can differ from the stage's aggregate status) and
 * polls
 * - every 3 s (logs, transcript) or 5 s (summaries, resource) while Running
 *   or Pending,
 * - every 30 s while AwaitingApproval (nothing changes on its own),
 * - and, once the phase is Succeeded or Failed, exactly once more: every
 *   query remembers whether it was read in a terminal phase, and stops after
 *   that read whatever the server says, so the last lines and final usage
 *   are read and a server that never says "complete" is not polled forever.
 * What cannot change any more is not polled whatever the phase: a skipped
 * transcript, a complete log, a finished AgentRun. A complete or incomplete
 * transcript is not final while the stage runs: the hub marks a recording
 * incomplete when it shuts down mid-run and sets it back to recording when
 * it restarts, so it is polled by phase like a recording one.
 * Before a stage has anything to show, the hub answers 404 (no recording
 * yet, no pod log yet). While the phase is not terminal that is "not there
 * yet", not an error: the transcript reads as `none`, the log as empty, and
 * polling goes on. In a terminal phase a 404 log is an error (the container
 * has no log) and a 404 transcript is `none` (no recording).
 * Polling stops while a query is errored (`pollUnlessErrored`) and, as for
 * every TanStack query, in background tabs.
 */
import { useEffect, useMemo, useRef } from "react";
import {
  QueryKey,
  QueryStatus,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  AgentRunLogChunk,
  AgentRunLogSource,
  AgentRunTranscript,
  ControllerRunPhase,
  EntityId,
  StageAgentRun,
  isTerminalRunPhase,
  stageAgentRunsOf,
} from "@app/agentic";
import type { AgentRun } from "@app/api/agentic/contract";
import { isTerminalPhase } from "@app/api/agentic/contract";
import {
  getAgentRunLog,
  getAgentRunResource,
  getAgentRunTranscript,
  getPlanRunAgentRuns,
} from "@app/api/rest/agentic";

import {
  POLL_AWAITING_DECISION_MS,
  POLL_FAST_MS,
  POLL_RUN_MS,
  agenticKeys,
  agenticRetry,
  isNotFoundError,
  isUsableId,
} from "./agentic";
import { pollUnlessErrored } from "./agentic-polling";

const GROUP = "agentRunObservability";

const agentRunObservabilityKeys = {
  all: agenticKeys.group(GROUP),
  planRun: (runId: EntityId) => agenticKeys.list(GROUP, { runId }),
  resource: (name: string) => agenticKeys.detail(GROUP, name),
  transcript: (name: string) =>
    [...agenticKeys.group(GROUP), "transcript", name] as const,
  log: (name: string, container: string) =>
    [...agenticKeys.group(GROUP), "log", name, container] as const,
};

/**
 * What an observability query holds: the value read, and whether it was
 * read while the phase was terminal (then it is the final read).
 */
interface PhasedRead<T> {
  value: T;
  readWhenTerminal: boolean;
}

/**
 * The phase travels in the query's `meta`, not in its key: a new phase is
 * the same query read again, not a new one.
 */
interface PhaseMeta {
  phase?: ControllerRunPhase;
  [key: string]: unknown;
}
const phaseOf = (meta: Record<string, unknown> | undefined) =>
  (meta as PhaseMeta | undefined)?.phase;
const isLivePhase = (phase: ControllerRunPhase | undefined) =>
  phase == null || !isTerminalRunPhase(phase);

const readInPhase = async <T>(
  meta: Record<string, unknown> | undefined,
  read: () => Promise<T>
): Promise<PhasedRead<T>> => {
  // The phase when the read starts: a read that started while the stage
  // ran is not the final one, even if the phase turns terminal meanwhile.
  const readWhenTerminal = !isLivePhase(phaseOf(meta));
  return { value: await read(), readWhenTerminal };
};

const selectValue = <T>(read: PhasedRead<T>) => read.value;

/** How often a view refreshes while its subject is live. */
export type ObservabilityCadence = "stream" | "summary";

/**
 * Poll interval for an observability view. `phase` is the phase of what the
 * view shows; `settled` says the final read in a terminal phase is done.
 * Unknown phase: no polling (fetch once).
 */
export const agentRunPollInterval = (
  phase: ControllerRunPhase | undefined,
  cadence: ObservabilityCadence,
  settled: boolean
): number | false => {
  if (phase == null) return false;
  const live = cadence === "stream" ? POLL_FAST_MS : POLL_RUN_MS;
  if (isTerminalRunPhase(phase)) return settled ? false : live;
  if (phase === "AwaitingApproval") return POLL_AWAITING_DECISION_MS;
  return live;
};

/**
 * The interval of an observability query: none once `isFinal(value)` (it
 * cannot change any more), none while errored, none in a terminal phase
 * after a read in that phase or once `isSettled(value)` (the value already
 * shows the end), else by phase.
 */
const observabilityInterval = <T>(
  query: { state: { status: QueryStatus; data?: PhasedRead<T> } },
  phase: ControllerRunPhase | undefined,
  cadence: ObservabilityCadence,
  {
    isFinal = () => false,
    isSettled = () => false,
  }: { isFinal?: (value: T) => boolean; isSettled?: (value: T) => boolean }
) => {
  const read = query.state.data;
  if (read != null && isFinal(read.value)) return false;
  return pollUnlessErrored(
    query,
    agentRunPollInterval(
      phase,
      cadence,
      read != null && (read.readWhenTerminal || isSettled(read.value))
    )
  );
};

/** One list for "no agent runs", so a memo over it does not recompute. */
const NO_AGENT_RUNS: StageAgentRun[] = [];

/**
 * The AgentRuns of a plan run: one per started stage per application of the
 * run, in stage order, then the run's application order (Pending stages have
 * none yet). `runPhase` is the plan run's status.
 */
export const useFetchPlanRunAgentRuns = (
  runId: EntityId | undefined,
  runPhase: ControllerRunPhase | undefined
) => {
  const { data, isFetching, isInitialLoading, error, refetch, dataUpdatedAt } =
    useQuery({
      queryKey: agentRunObservabilityKeys.planRun(runId ?? ""),
      queryFn: ({ meta }) =>
        readInPhase(meta, () => getPlanRunAgentRuns(runId ?? "")),
      meta: { phase: runPhase } satisfies PhaseMeta,
      select: selectValue<StageAgentRun[]>,
      enabled: isUsableId(runId),
      retry: agenticRetry,
      // Never final on its own (a running plan run starts more stages);
      // once the run ended, settled when every agent run says it ended too
      // (a list read before the run's phase was known needs no reread).
      refetchInterval: (_agentRuns, query) =>
        observabilityInterval(query, runPhase, "summary", {
          isSettled: (agentRuns) =>
            agentRuns.every((agentRun) => isTerminalRunPhase(agentRun.phase)),
        }),
    });
  // A run that stops for a decision is next polled in 30 s: read its agent
  // runs now, so the stage that stopped shows its final usage at once.
  const previousPhase = useRef(runPhase);
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = runPhase;
    if (
      previous != null &&
      previous !== runPhase &&
      runPhase === "AwaitingApproval" &&
      isUsableId(runId)
    ) {
      void refetch();
    }
  }, [runPhase, runId, refetch]);
  return {
    agentRuns: data ?? NO_AGENT_RUNS,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
    lastUpdatedAt: dataUpdatedAt || undefined,
    refetch,
  };
};

/**
 * The agent runs of one stage of a plan run, one per application of the run,
 * in the run's application order (each carries its `application`). The same
 * query as `useFetchPlanRunAgentRuns` (one cache entry and one poll per plan
 * run), filtered: pick one with `stageAgentRunFor` (the URL's application)
 * or `defaultStageAgentRun`, and read it with the name-based hooks below,
 * passing that agent run's `phase`, not the stage's: in a run on several
 * applications the stage shows the worst state, so another application's
 * finished agent run would keep polling as if it were live.
 */
export const useFetchStageAgentRuns = (
  runId: EntityId | undefined,
  stageId: EntityId | undefined,
  runPhase: ControllerRunPhase | undefined
) => {
  const { agentRuns, ...rest } = useFetchPlanRunAgentRuns(runId, runPhase);
  const stageAgentRuns = useMemo(
    () =>
      stageId != null ? stageAgentRunsOf(agentRuns, stageId) : NO_AGENT_RUNS,
    [agentRuns, stageId]
  );
  return { agentRuns: stageAgentRuns, ...rest };
};

/** The AgentRun resource (CRD shape) for the YAML/JSON view. */
export const useFetchAgentRunResource = (
  name: string | undefined,
  phase: ControllerRunPhase | undefined
) => {
  const { data, isFetching, isInitialLoading, error, refetch, dataUpdatedAt } =
    useQuery({
      queryKey: agentRunObservabilityKeys.resource(name ?? ""),
      queryFn: ({ meta }) =>
        readInPhase(meta, () => getAgentRunResource(name ?? "")),
      meta: { phase } satisfies PhaseMeta,
      select: selectValue<AgentRun>,
      enabled: isUsableId(name),
      retry: agenticRetry,
      refetchInterval: (_agentRun, query) =>
        observabilityInterval(query, phase, "summary", {
          isFinal: (agentRun: AgentRun) =>
            isTerminalPhase(agentRun.status?.phase),
        }),
    });
  return {
    agentRun: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
    lastUpdatedAt: dataUpdatedAt || undefined,
    refetch,
  };
};

/** No recording (yet): the hub's 404 with `X-Transcript-Status: none`. */
const NO_RECORDING: AgentRunTranscript = { status: "none", entries: [] };

/**
 * A transcript that cannot change any more: only a skipped one, which the
 * recorder decides before the run starts (approve mode, askUser).
 */
const isFinalTranscript = ({ status }: AgentRunTranscript) =>
  status === "skipped";

/**
 * The stage's transcript and its recording status. A 404 is no recording
 * (`none`), which a live stage polls until the recorder starts. A skipped
 * transcript is final: it is not polled again (a mutation that changes the
 * stage invalidates it). Any other status is polled by the stage's phase,
 * and once the phase is terminal read once more.
 */
export const useFetchAgentRunTranscript = (
  name: string | undefined,
  phase: ControllerRunPhase | undefined
) => {
  const { data, isFetching, isInitialLoading, error, refetch, dataUpdatedAt } =
    useQuery({
      queryKey: agentRunObservabilityKeys.transcript(name ?? ""),
      queryFn: ({ meta }) =>
        readInPhase(meta, async () => {
          try {
            return await getAgentRunTranscript(name ?? "");
          } catch (failure) {
            if (isNotFoundError(failure)) return NO_RECORDING;
            throw failure;
          }
        }),
      meta: { phase } satisfies PhaseMeta,
      select: selectValue<AgentRunTranscript>,
      enabled: isUsableId(name),
      retry: agenticRetry,
      refetchInterval: (_transcript, query) =>
        observabilityInterval(query, phase, "stream", {
          isFinal: isFinalTranscript,
        }),
    });
  return {
    transcript: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    lastUpdatedAt: dataUpdatedAt || undefined,
    refetch,
  };
};

/** The log of one container as read so far. */
export interface AgentRunLogState {
  /** The complete lines read so far (each ended by a newline). */
  lines: string[];
  /** The text after the last newline: a line still being written. */
  partial: string;
  /** Offset (bytes) to read on from. */
  nextOffset: number;
  source?: AgentRunLogSource;
  complete: boolean;
}

const EMPTY_LOG: AgentRunLogState = {
  lines: [],
  partial: "",
  nextOffset: 0,
  complete: false,
};

/**
 * The log after `chunk`: only the chunk's text is split, the complete lines
 * already held are kept as they are (and stay the same strings), and a
 * partial last line is carried until its newline arrives.
 */
export const appendLogChunk = (
  held: AgentRunLogState,
  chunk: AgentRunLogChunk
): AgentRunLogState => {
  const parts = (held.partial + chunk.text).split("\n");
  const partial = parts.pop() ?? "";
  return {
    lines: parts.length > 0 ? [...held.lines, ...parts] : held.lines,
    partial,
    nextOffset: chunk.nextOffset,
    source: chunk.source,
    complete: chunk.complete,
  };
};

/** Every line of a log, the partial last one included; one array per state. */
const shownLines = new WeakMap<AgentRunLogState, string[]>();
const linesOf = (log: AgentRunLogState | undefined): string[] => {
  if (log == null) return EMPTY_LOG.lines;
  if (log.partial === "") return log.lines;
  let lines = shownLines.get(log);
  if (lines == null) {
    lines = [...log.lines, log.partial];
    shownLines.set(log, lines);
  }
  return lines;
};

/** One container's log, as `useAgentRunLogs` returns it. */
export interface AgentRunContainerLog {
  container: string;
  /** Every line read so far, a partial last line included. */
  lines: string[];
  source?: AgentRunLogSource;
  complete: boolean;
  isFetching: boolean;
  isLoading: boolean;
  error: unknown;
  isNotFound: boolean;
  lastUpdatedAt?: number;
  refetch: () => void;
}

/**
 * The logs of some containers of an agent run (`agent`, `skill-loader`),
 * in the order given, each read incrementally: every fetch asks only for
 * the text after what is already held (`nextOffset`, bytes) and appends it,
 * so a poll never downloads what is shown. A container that leaves the
 * list keeps its log in the cache, and coming back reads on from it.
 *
 * Before the pod has written a log the hub answers 404; while the phase is
 * not terminal that keeps the log empty and polling goes on. A log that got
 * shorter on the server (it answers no text past its end) is not detected:
 * the offsets only grow.
 */
export const useAgentRunLogs = (
  name: string | undefined,
  containers: readonly string[],
  phase: ControllerRunPhase | undefined
): AgentRunContainerLog[] => {
  const queryClient = useQueryClient();
  const results = useQueries({
    queries: containers.map((container) => ({
      queryKey: agentRunObservabilityKeys.log(name ?? "", container),
      queryFn: ({
        queryKey,
        meta,
      }: {
        queryKey: QueryKey;
        meta: Record<string, unknown> | undefined;
      }) =>
        readInPhase(meta, async () => {
          const held =
            queryClient.getQueryData<PhasedRead<AgentRunLogState>>(queryKey)
              ?.value ?? EMPTY_LOG;
          try {
            const chunk = await getAgentRunLog({
              name: name ?? "",
              container,
              offset: held.nextOffset,
            });
            return appendLogChunk(held, chunk);
          } catch (failure) {
            // Not written yet: nothing to show, keep polling.
            if (isLivePhase(phaseOf(meta)) && isNotFoundError(failure)) {
              return held;
            }
            throw failure;
          }
        }),
      meta: { phase } satisfies PhaseMeta,
      select: selectValue<AgentRunLogState>,
      enabled: isUsableId(name) && isUsableId(container),
      retry: agenticRetry,
      refetchInterval: (
        _log: AgentRunLogState | undefined,
        query: {
          state: { status: QueryStatus; data?: PhasedRead<AgentRunLogState> };
        }
      ) =>
        observabilityInterval(query, phase, "stream", {
          isFinal: (log: AgentRunLogState) => log.complete,
        }),
    })),
  });
  return results.map((result, index) => ({
    container: containers[index],
    lines: linesOf(result.data),
    source: result.data?.source,
    complete: result.data?.complete ?? false,
    isFetching: result.isFetching,
    isLoading: result.isInitialLoading,
    error: result.error,
    isNotFound: isNotFoundError(result.error),
    lastUpdatedAt: result.dataUpdatedAt || undefined,
    refetch: () => {
      result.refetch();
    },
  }));
};
