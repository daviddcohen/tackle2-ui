/**
 * Run observability side of the agentic mock server: for every started stage
 * of a plan run and every application of the run, the AgentRun behind it
 * (the CR, as the Hub serves it), its recorded transcript and its container
 * logs. The real backend runs one AgentWorkflowRun per application, so a
 * stage has one AgentRun per application.
 *
 * Per application (multi-application runs): each agent run has
 * its application (label and `APP_ID`), its own name, its own skills (the
 * stage's group plus that application's every-stage group), its own
 * transcript text (the repository and "the application" name it) and its
 * own context curve. Its phase follows the stage, except that a Failed or
 * AwaitingApproval stage fails or waits for one application only, the run's
 * first: the other applications' agent runs for that stage Succeeded. The
 * `StageRun.status` stays the aggregate (the worst state shows). The first
 * application's agent run keeps the stage's name, messages and output, so a
 * consumer that takes the stage's first agent run sees what it saw before;
 * a run on one application is unchanged.
 *
 * No state of its own: everything is generated from the plan run
 * `execution.getPlanRun` returns, so a stage's status agrees everywhere. The
 * content is deterministic: the same stage, status and times give the same
 * frames, log lines and usage.
 *
 * One script per stage drives all three views, so they agree with each
 * other: a timeline of ACP frames (what the recorder would save) and log
 * lines over `OBSERVABILITY_SCRIPT_MS`. The transcript is the frames as
 * recorded lines (NDJSON read by line offset, with the recording status in
 * headers, as the hub serves it; the UI folds them with `foldTranscript`),
 * usage is the frames folded by that adapter, the logs are the lines, the
 * AgentRun's status follows the stage. A recorded stage's own
 * messages (the plan run's activity, including a running stage's live
 * progress messages) are part of its transcript; an approve mode stage is
 * not recorded, so the UI shows its `StageRun.messages` instead. A stage's
 * output is its AgentRun's `terminationData.stopReason`.
 *
 * Growth over time: while a stage is Running, only the part of the script up
 * to the time since the stage became live (`execution.getStageLiveSince`,
 * the clock its progress messages use) is visible. A step lands about every
 * 5 s for 2.5 minutes (log lines about every second), then the stage
 * plateaus (seeded runs stay Running). Finished and awaiting stages that
 * ran at least as long as the script show all of it, spread over their real
 * duration. A shorter one (the 4 s stages of a run started in the
 * prototype) shows what it reached at real time and then its closing part
 * at its end, so what a reader saw while it ran never changes: the log stays
 * append-only, as the hub's is.
 *
 * Demo states (stage ids are global fixture ids):
 * - context climbs through 80 % and compacts once on every metered stage;
 * - stage "3" (Validate of the Java EE to Quarkus plan) compacts twice and
 *   ends near the window (danger);
 * - stages whose agent uses the self-hosted Llama Model ("4") report no
 *   context (goose reports `used: 0`, as on Bedrock);
 * - stage "2" (Migrate of the same plan), once finished, has a very long agent
 *   log (`LONG_LOG_LINES` lines, generated on first read) and an incomplete
 *   transcript with a gap;
 * - approve mode stages (`requiresApproval`) are never recorded: transcript
 *   `skipped`, reason "approve mode".
 */
import {
  AgentRunLogChunk,
  AgentRunRecordingStatus,
  AgentRunTranscript,
  ControllerRunPhase,
  EntityId,
  HubRef,
  ModelProjection,
  PlanRun,
  RECORDING_SKIP_REASONS,
  SkillLoadPolicy,
  StageAgentRun,
  StageMessage,
  StageRun,
  isCommitOf,
  isTerminalRunPhase,
} from "@app/agentic";
import {
  AGENT_RUN_CONTAINERS,
  RecordedTranscriptLine,
  foldTranscript,
  toResourceName,
  toStageAgentRun,
} from "@app/agentic/adapters";
import { GOOSE_UPDATE_METHOD, PLAN_META_KEY } from "@app/api/agentic/acp";
import type * as Crd from "@app/api/agentic/contract";
import {
  ACP_READY_CONDITION,
  APPLICATION_LABEL,
  MANAGED_BY_LABEL,
  RUN_ENV,
} from "@app/api/agentic/contract";

import { badRequest, db, findApplication, notFound } from "./db";
import * as execution from "./execution";
import { mockAgents, mockGateways, mockProviders } from "./fixtures";

// ---------------------------------------------------------------------------
// Timing and demo knobs
// ---------------------------------------------------------------------------

/** Length of one stage's script: live stages grow for this long, then plateau. */
export const OBSERVABILITY_SCRIPT_MS = 150_000;
const FIRST_STEP_MS = 2_000;
const STEP_MS = 4_800;
const STEP_COUNT = 30;
const FINISH_MS = 146_000;
/** The sandbox passes its readiness probe this long after the stage starts. */
const ACP_READY_AFTER_MS = 3_000;

const DANGER_STAGE_ID = "3";
const LONG_LOG_STAGE_ID = "2";
const GAP_STAGE_ID = "2";
/** Models whose runtime reports no context occupancy. */
const UNMETERED_MODEL_IDS: ReadonlySet<EntityId> = new Set(["4"]);
/** Lines of build output in the long log, on top of the script's own lines. */
export const LONG_LOG_LINES = 24_000;
const GAP_STEPS = { from: 12, to: 16 };
const MAX_TURNS = 150;
const NAMESPACE = "konveyor-tackle";
const SANDBOX_STARTUP_MS = 5_000;

const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-3-7-sonnet": 200_000,
  "gpt-4o": 128_000,
  "llama3.3:70b": 131_072,
  "granite-code-20b": 8_192,
  "gemini-2.5-pro": 1_048_576,
};
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** USD per million tokens (input, output); absent = the runtime reports no cost. */
const PRICES: Record<string, [number, number]> = {
  "claude-3-7-sonnet": [3, 15],
  "gpt-4o": [2.5, 10],
  "gemini-2.5-pro": [1.25, 10],
};

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** FNV-1a: a stable 32-bit hash for picking and jittering content. */
const hash = (text: string) => {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

const pick = <T>(items: readonly T[], seed: string): T =>
  items[hash(seed) % items.length];

const between = (seed: string, low: number, high: number) =>
  low + (hash(seed) % (high - low + 1));

const fakeUid = (seed: string) => {
  const hex = [0, 1, 2, 3]
    .map((part) => hash(`${seed}:${part}`).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

// ---------------------------------------------------------------------------
// Stage context
// ---------------------------------------------------------------------------

interface StageGateway {
  model: ModelProjection;
  contextWindow: number;
  metered: boolean;
  price?: [number, number];
  resource: Crd.Gateway;
}

interface Timeline {
  /** Time of script ms 0. */
  start: number;
  /** Real ms per script ms. */
  scale: number;
  /** Script ms visible now (everything for a stage that stopped). */
  visibleUntil: number;
  /**
   * A stage that stopped before its script could run (shorter than the
   * script, like the 4 s stages of a run started in the prototype): script
   * ms where it stopped. The script after it is hidden, except its closing
   * part (from `FINISH_MS`), which is stamped at the stage's end.
   */
  cutAt?: number;
}

interface StageContext {
  run: PlanRun;
  stage: StageRun;
  index: number;
  name: string;
  /** The application this agent run works on (none for a run without any). */
  application?: HubRef;
  /** Position of `application` in the run's applications. */
  applicationIndex: number;
  /** This agent run's phase (see `applicationPhase`). */
  phase: ControllerRunPhase;
  completedAt?: string;
  /** `terminationData.stopReason` source: the stage output, when it is this run's. */
  output?: string;
  gateway: StageGateway;
  approve: boolean;
  /** The pod exists: Running or AwaitingApproval. */
  live: boolean;
  terminal: boolean;
  timeline: Timeline;
}

/**
 * The applications a stage has an agent run for, in run order. A run without
 * applications still gets one agent run per stage (no application).
 */
const runApplications = (run: PlanRun): (HubRef | undefined)[] =>
  run.applications.length > 0 ? run.applications : [undefined];

/** Kubernetes name limit. */
const MAX_NAME = 63;

/** `head` cut to leave room for `tail`, then `tail`: at most 63 characters. */
const withTail = (head: string, tail: string) =>
  `${toResourceName(head, MAX_NAME - tail.length)}${tail}`;

/**
 * Agent run names by stage index, then application index, unique within the
 * run. The first application keeps the stage's name (`run-{run}-{stage}`,
 * what a run on one application has, with `-{n}` for a repeated stage name);
 * the others add `-app-{id}`, cutting the stage slug, never a suffix. Names
 * that still collide after a cut get `-{stage}-{application}` (1-based).
 */
const agentRunNames = (run: PlanRun): string[][] => {
  const base = run.stageRuns.map((stage, index) => {
    const slug = toResourceName(`run-${run.id}-${stage.name}`, 58);
    return slug !== "" ? slug : `run-${toResourceName(run.id)}-${index + 1}`;
  });
  const repeat = base.map((name, index) =>
    base.indexOf(name) === index ? "" : `-${index + 1}`
  );
  const names = base.map((name, index) =>
    runApplications(run).map((application, applicationIndex) =>
      applicationIndex === 0 || application == null
        ? `${name}${repeat[index]}`
        : withTail(name, `${repeat[index]}-app-${application.id}`)
    )
  );
  const seen = new Set<string>();
  return names.map((forStage, index) =>
    forStage.map((name, applicationIndex) => {
      let unique = name;
      for (let n = 1; seen.has(unique); n++) {
        unique = withTail(
          name,
          `-${index + 1}-${applicationIndex + 1}${n > 1 ? `-${n}` : ""}`
        );
      }
      seen.add(unique);
      return unique;
    })
  );
};

/**
 * An agent run's phase. A Failed or AwaitingApproval stage fails or waits
 * for the run's first application; the other applications' agent runs for
 * that stage finished (Succeeded), so the stage shows its worst state and
 * has one decision. Any other stage status is every agent run's.
 */
const applicationPhase = (
  stage: StageRun,
  applicationIndex: number
): ControllerRunPhase =>
  applicationIndex > 0 &&
  (stage.status === "Failed" || stage.status === "AwaitingApproval")
    ? "Succeeded"
    : stage.status;

/**
 * The skills this stage's agent loads for one application, once each, with
 * how it loads them: the stage's own group of the run's skills snapshot
 * (`stageId`) and that application's every-stage group, without the rows the
 * plan excluded. A run without a snapshot stages nothing.
 */
const stagedSkills = (
  run: PlanRun,
  stage: StageRun,
  applicationId: number | undefined
): { name: string; loadPolicy: SkillLoadPolicy }[] => {
  const rows = [
    ...(run.skills?.stages.find((group) => group.stageId === stage.stageId)
      ?.skills ?? []),
    ...(run.skills?.everyStage.find(
      (group) => group.application?.id === applicationId
    )?.skills ?? []),
  ].filter((row) => !row.excluded);
  const staged = new Map<
    string,
    { name: string; loadPolicy: SkillLoadPolicy }
  >();
  rows.forEach(({ skill, loadPolicy }) => {
    if (!staged.has(skill.id)) {
      staged.set(skill.id, { name: skill.name, loadPolicy });
    }
  });
  return [...staged.values()];
};

const isStarted = (stage: StageRun) =>
  stage.status !== "Pending" && stage.startedAt != null;

const gatewayFor = (stage: StageRun): StageGateway => {
  const agent =
    mockAgents.find((candidate) => candidate.id === stage.agent.id) ??
    db.agents.find((candidate) => candidate.id === stage.agent.id);
  const modelId = agent?.model.id ?? "1";
  const model =
    mockGateways.find((candidate) => candidate.id === modelId) ??
    db.models.find((candidate) => candidate.id === modelId) ??
    mockGateways[0];
  const provider =
    mockProviders.find((candidate) => candidate.id === model.provider.id) ??
    db.providers.find((candidate) => candidate.id === model.provider.id);
  const contextWindow = CONTEXT_WINDOWS[model.model] ?? DEFAULT_CONTEXT_WINDOW;
  const name = toResourceName(model.name);
  return {
    model,
    contextWindow,
    metered: !UNMETERED_MODEL_IDS.has(model.id),
    price: PRICES[model.model],
    resource: {
      apiVersion: "konveyor.io/v1alpha1",
      kind: "Gateway",
      metadata: { name, namespace: NAMESPACE },
      spec: {
        provider: provider?.providerType ?? "openai",
        endpoint: model.endpoint ?? "",
        credentialRef: { secretName: `${name}-credentials`, key: "api-key" },
        model: { name: model.model, contextWindow },
      },
    },
  };
};

/** The stage's last message time, of those at or before `limit` if given. */
const lastMessageAt = (stage: StageRun, limit?: string) =>
  stage.messages?.reduce<string | undefined>(
    (latest, message) =>
      (limit == null || message.timestamp <= limit) &&
      (latest == null || message.timestamp > latest)
        ? message.timestamp
        : latest,
    undefined
  );

/**
 * When another application's agent run (not the run's first) ended, in a
 * stage that failed, waits, or was decided: at the stage's last message up
 * to the decision or the stage's end (a waiting stage's proposal is ready
 * then). Pinned there, so approving or rejecting the first application's
 * proposal later never moves it. Other stages: the stage's end.
 */
const otherApplicationEnd = (stage: StageRun) => {
  if (stage.approvedAt != null) {
    return lastMessageAt(stage, stage.approvedAt) ?? stage.completedAt;
  }
  if (stage.status === "Failed" || stage.status === "AwaitingApproval") {
    return lastMessageAt(stage, stage.completedAt) ?? stage.completedAt;
  }
  return stage.completedAt;
};

const timelineFor = (
  run: PlanRun,
  stage: StageRun,
  phase: ControllerRunPhase,
  completedAt: string | undefined,
  now: number
): Timeline => {
  const started = Date.parse(stage.startedAt ?? run.startedAt);
  if (phase === "Running") {
    const since = execution.getStageLiveSince(run.id, stage.stageId) ?? started;
    return { start: since, scale: 1, visibleUntil: Math.max(0, now - since) };
  }
  const endIso =
    phase === "AwaitingApproval" ? lastMessageAt(stage) : completedAt;
  const end = endIso != null ? Date.parse(endIso) : NaN;
  const duration = Number.isNaN(end)
    ? OBSERVABILITY_SCRIPT_MS
    : Math.max(end - started, 1000);
  // Never faster than real time: what a reader saw while the stage ran keeps
  // its times and its place, so the log stays append-only (the hooks read
  // it by byte offset) and the transcript times still match its lines.
  if (duration < OBSERVABILITY_SCRIPT_MS) {
    return {
      start: started,
      scale: 1,
      visibleUntil: Infinity,
      cutAt: duration,
    };
  }
  return {
    start: started,
    scale: duration / OBSERVABILITY_SCRIPT_MS,
    visibleUntil: Infinity,
  };
};

const contextFor = (
  run: PlanRun,
  index: number,
  applicationIndex: number,
  name: string,
  now: number
): StageContext => {
  const stage = run.stageRuns[index];
  const phase = applicationPhase(stage, applicationIndex);
  const own = phase === stage.status;
  const completedAt =
    applicationIndex === 0 ? stage.completedAt : otherApplicationEnd(stage);
  const terminal = isTerminalRunPhase(phase);
  return {
    run,
    stage,
    index,
    name,
    application: runApplications(run)[applicationIndex],
    applicationIndex,
    phase,
    completedAt,
    output: own ? stage.output : undefined,
    gateway: gatewayFor(stage),
    approve: stage.requiresApproval,
    live: !terminal,
    terminal,
    timeline: timelineFor(run, stage, phase, completedAt, now),
  };
};

/**
 * Every started stage of a run, one agent run per application: stage order,
 * then the run's application order.
 */
const startedStages = (run: PlanRun, now: number): StageContext[] => {
  const names = agentRunNames(run);
  return run.stageRuns.flatMap((stage, index) =>
    isStarted(stage)
      ? names[index].map((name, applicationIndex) =>
          contextFor(run, index, applicationIndex, name, now)
        )
      : []
  );
};

const findAgentRun = (name: string, now = Date.now()): StageContext => {
  for (const run of execution.listPlanRuns()) {
    const names = agentRunNames(run);
    for (let index = 0; index < names.length; index++) {
      const applicationIndex = names[index].indexOf(name);
      if (applicationIndex !== -1 && isStarted(run.stageRuns[index])) {
        return contextFor(run, index, applicationIndex, name, now);
      }
    }
  }
  throw notFound(`Agent run "${name}" not found.`);
};

const timeAt = ({ timeline }: StageContext, rel: number) => {
  const shown =
    timeline.cutAt != null && rel >= FINISH_MS ? timeline.cutAt : rel;
  return new Date(
    Math.round(timeline.start + shown * timeline.scale)
  ).toISOString();
};

const isVisible = ({ timeline }: StageContext, rel: number) =>
  rel <= timeline.visibleUntil &&
  (timeline.cutAt == null || rel <= timeline.cutAt || rel >= FINISH_MS);

// ---------------------------------------------------------------------------
// Script content
// ---------------------------------------------------------------------------

type Ecosystem = "java" | "dotnet" | "node";

const ecosystemOf = (planId: EntityId): Ecosystem =>
  planId === "6" || planId === "7"
    ? "dotnet"
    : planId === "8"
      ? "node"
      : "java";

const ECOSYSTEMS: Record<
  Ecosystem,
  {
    files: string[];
    build: string;
    edits: { oldText: string; newText: string }[];
    ok: string;
    error: string;
  }
> = {
  java: {
    files: [
      "src/main/java/com/example/coolstore/model/Product.java",
      "src/main/java/com/example/coolstore/service/OrderService.java",
      "src/main/java/com/example/coolstore/rest/CartEndpoint.java",
      "src/main/java/com/example/coolstore/persistence/InventoryRepository.java",
      "src/main/resources/application.properties",
      "pom.xml",
    ],
    build: "mvn -q -DskipTests package",
    edits: [
      {
        oldText: "import javax.persistence.Entity;",
        newText: "import jakarta.persistence.Entity;",
      },
      {
        oldText: "import javax.ejb.Stateless;",
        newText: "import jakarta.enterprise.context.ApplicationScoped;",
      },
      {
        oldText: '@Path("/cart")\n@Stateless',
        newText: '@Path("/cart")\n@ApplicationScoped',
      },
    ],
    ok: "[\u001b[1;36mINFO\u001b[m] \u001b[1;32mBUILD SUCCESS\u001b[m",
    error:
      "[\u001b[1;91mERROR\u001b[m] COMPILATION ERROR: OrderService.java:[12,8] package javax.ejb does not exist",
  },
  dotnet: {
    files: [
      "src/ReportRenderer/ReportRenderer.csproj",
      "src/ReportRenderer/Rendering/PdfExporter.cs",
      "src/Web/Startup.cs",
      "src/Web/Program.cs",
      "src/Web/appsettings.json",
      "Dockerfile",
    ],
    build: "dotnet build -c Release",
    edits: [
      {
        oldText: "<TargetFramework>net48</TargetFramework>",
        newText: "<TargetFramework>net8.0</TargetFramework>",
      },
      {
        oldText: "using System.Drawing;",
        newText: "using SkiaSharp;",
      },
    ],
    ok: "Build \u001b[32msucceeded\u001b[0m.",
    error:
      "\u001b[91merror\u001b[0m CS0246: The type or namespace name 'Bitmap' could not be found",
  },
  node: {
    files: [
      "package.json",
      "src/server.js",
      "src/routes/preview.js",
      "src/lib/image.js",
      ".nvmrc",
      "Dockerfile",
    ],
    build: "npm ci && npm test",
    edits: [
      { oldText: '"node": ">=14"', newText: '"node": ">=22"' },
      {
        oldText: "const canvas = require('canvas');",
        newText: "const sharp = require('sharp');",
      },
    ],
    ok: "\u001b[32m  42 passing\u001b[0m (3s)",
    error: "\u001b[91m  1 failing\u001b[0m: preview renders a thumbnail",
  },
};

type Level = "INFO" | "WARN" | "ERROR";

/**
 * zap's console encoder with colored capital levels (the harness logger).
 * The mock uses only colors that keep 4.5:1 contrast on a dark background
 * (cyan, yellow, green, bright red); zap itself prints INFO in blue.
 */
const LEVELS: Record<Level, string> = {
  INFO: "\u001b[36mINFO\u001b[0m",
  WARN: "\u001b[33mWARN\u001b[0m",
  ERROR: "\u001b[91mERROR\u001b[0m",
};

interface ScriptFrame {
  rel: number;
  method: "session/update" | typeof GOOSE_UPDATE_METHOD;
  update: Record<string, unknown>;
}

interface ScriptLog {
  rel: number;
  level: Level;
  text: string;
}

interface Script {
  frames: ScriptFrame[];
  log: ScriptLog[];
  /** Where the long build output goes, for the long-log stage. */
  buildOutputAt?: number;
}

interface ContextCurve {
  start: number;
  slope: number;
  cap: number;
  /** Compaction steps: occupancy drops to `to`, then grows by `slope`. */
  compactions: { step: number; to: number; slope: number }[];
}

const CURVES: Record<"normal" | "danger", ContextCurve> = {
  normal: {
    start: 0.07,
    slope: 0.055,
    cap: 0.9,
    compactions: [{ step: 16, to: 0.22, slope: 0.047 }],
  },
  danger: {
    start: 0.08,
    slope: 0.07,
    cap: 0.965,
    compactions: [
      { step: 11, to: 0.28, slope: 0.07 },
      { step: 20, to: 0.35, slope: 0.068 },
    ],
  },
};

/**
 * The curve of one agent run: the stage's, with its growth varied by up to
 * 10 % either way for the applications after the run's first, so each
 * application's context reads differently (deterministic by name).
 */
const curveFor = (
  curve: ContextCurve,
  applicationIndex: number,
  seed: string
): ContextCurve => {
  if (applicationIndex === 0) return curve;
  const factor = 1 + (between(`${seed}:growth`, 0, 20) - 10) / 100;
  return {
    ...curve,
    slope: curve.slope * factor,
    compactions: curve.compactions.map((c) => ({
      ...c,
      slope: c.slope * factor,
    })),
  };
};

/** Context occupancy (fraction of the window) after each step. */
const occupancy = (curve: ContextCurve, seed: string): number[] => {
  const values: number[] = [];
  let value = curve.start;
  let slope = curve.slope;
  for (let step = 0; step < STEP_COUNT; step++) {
    const compaction = curve.compactions.find((c) => c.step === step);
    if (compaction != null) {
      value = compaction.to;
      slope = compaction.slope;
    } else if (step > 0) {
      value = Math.min(curve.cap, value + slope);
    }
    const jitter = ((hash(`${seed}:${step}`) % 1000) / 1000 - 0.5) * 0.008;
    values.push(Math.min(curve.cap, Math.max(0.02, value + jitter)));
  }
  return values;
};

const stepStart = (step: number) => FIRST_STEP_MS + step * STEP_MS;

/** A tool title in the ASCII log: its middle dot prints as a colon. */
const logTitle = (title: string) => title.replace(" · ", ": ");

/** Builds the stage's whole script (finish block only once the stage stopped). */
const buildScript = (ctx: StageContext): Script => {
  const { run, stage, gateway } = ctx;
  const eco = ECOSYSTEMS[ecosystemOf(run.planId)];
  const seed = ctx.name;
  const frames: ScriptFrame[] = [];
  const log: ScriptLog[] = [];
  let buildOutputAt: number | undefined;
  const acp = (rel: number, update: Record<string, unknown>) =>
    frames.push({ rel, method: "session/update", update });
  const gooseFrame = (rel: number, update: Record<string, unknown>) =>
    frames.push({ rel, method: GOOSE_UPDATE_METHOD, update });
  const info = (rel: number, text: string) =>
    log.push({ rel, level: "INFO", text });
  const warn = (rel: number, text: string) =>
    log.push({ rel, level: "WARN", text });

  const branch = run.targetBranch || "konveyor/migration";
  const applicationName =
    findApplication(ctx.application?.id ?? -1)?.name ?? ctx.application?.name;
  const repo =
    toResourceName(applicationName ?? "application") || "application";
  // In a run on several applications the agent names its application where
  // the stage's instructions say "the application".
  const instructions =
    run.applications.length > 1 && applicationName != null
      ? stage.instructions.replace(
          /\b(the) (application)\b/gi,
          (_match, article: string, word: string) =>
            `${article} ${applicationName} ${word}`
        )
      : stage.instructions;
  // ...and says which application it works on.
  const scope =
    run.applications.length > 1 && applicationName != null
      ? `I work on ${applicationName} (application ${ctx.applicationIndex + 1} of ${run.applications.length} in this run). `
      : "";
  const skills = stagedSkills(run, stage, ctx.application?.id).map(({ name }) =>
    toResourceName(name)
  );
  const stageCount = run.stageRuns.length;
  const window = gateway.contextWindow;
  const curve = occupancy(
    curveFor(
      stage.stageId === DANGER_STAGE_ID ? CURVES.danger : CURVES.normal,
      ctx.applicationIndex,
      seed
    ),
    seed
  );
  const compactionSteps = new Set(
    (stage.stageId === DANGER_STAGE_ID
      ? CURVES.danger
      : CURVES.normal
    ).compactions.map((c) => c.step)
  );

  let turns = 0;
  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let messageId = 0;

  const ladder = (
    prep: string,
    task: string,
    push: string,
    pushContent = `Push the results to ${branch}`,
    pushMeta: Record<string, unknown> = {}
  ) => ({
    sessionUpdate: "plan",
    entries: [
      {
        content: `Prepare the workspace: clone ${repo} on ${branch}`,
        priority: "high",
        status: prep,
        _meta: { [PLAN_META_KEY]: { rung: "prep", repo, branch } },
      },
      {
        content:
          turns > 0
            ? `${stage.name} (${turns} of ${MAX_TURNS} turns)`
            : stage.name,
        priority: "high",
        status: task,
        _meta: {
          [PLAN_META_KEY]: {
            rung: "task",
            task: stage.instructions.slice(0, 120),
            stage: ctx.index + 1,
            stageCount,
            model: gateway.model.name,
            turnsUsed: turns,
            maxTurns: MAX_TURNS,
          },
        },
      },
      {
        content: pushContent,
        priority: "medium",
        status: push,
        _meta: { [PLAN_META_KEY]: { rung: "push", ...pushMeta } },
      },
    ],
  });

  const say = (
    rel: number,
    kind: "agent_message_chunk" | "agent_thought_chunk",
    text: string
  ) => {
    const id = `msg-${++messageId}`;
    const words = text.split(" ");
    const half = Math.ceil(words.length / 2);
    [words.slice(0, half).join(" ") + " ", words.slice(half).join(" ")]
      .filter((chunk) => chunk.trim() !== "")
      .forEach((chunk, i) =>
        acp(rel + i * 250, {
          sessionUpdate: kind,
          content: { type: "text", text: chunk },
          _meta: { goose: { messageId: id } },
        })
      );
  };

  const tool = (
    rel: number,
    title: string,
    kind: string,
    status: "completed" | "failed",
    output?: string,
    diff?: { path: string; oldText: string; newText: string }
  ) => {
    const toolCallId = `toolu_${hash(`${seed}:${rel}`).toString(36)}`;
    turns += 1;
    toolCalls += 1;
    acp(rel, {
      sessionUpdate: "tool_call",
      toolCallId,
      title,
      kind,
      status: "in_progress",
    });
    info(rel, `  tool: ${logTitle(title)} (in_progress)`);
    acp(rel + 900, {
      sessionUpdate: "tool_call_update",
      toolCallId,
      status,
      content: [
        ...(diff != null ? [{ type: "diff", ...diff }] : []),
        ...(output != null
          ? [{ type: "content", content: { type: "text", text: output } }]
          : []),
      ],
    });
    info(rel + 900, `  tool: ${status}`);
    return toolCallId;
  };

  const usage = (rel: number, step: number, compaction = false) => {
    const used = Math.round(window * curve[step]);
    const input = compaction
      ? Math.round(window * curve[Math.max(0, step - 1)])
      : used;
    const output = between(`${seed}:out:${step}`, 300, 1400);
    inputTokens += input;
    outputTokens += output;
    const price = gateway.price;
    const callCost =
      price != null
        ? (input * price[0] + output * price[1]) / 1_000_000
        : undefined;
    if (callCost != null) cost += callCost;
    gooseFrame(rel, {
      sessionUpdate: "message_usage",
      messageId: `msg-${messageId}`,
      usage: gateway.metered
        ? {
            inputTokens: input,
            outputTokens: output,
            totalTokens: input + output,
            ...(callCost != null
              ? {
                  cost: Number(callCost.toFixed(4)),
                  costSource: "estimated",
                }
              : {}),
            elapsedMs: between(`${seed}:ms:${step}`, 1800, 9000),
            isCompaction: compaction,
          }
        : { isCompaction: compaction },
    });
    info(
      rel,
      gateway.metered
        ? `  goose: provider request completed (input ${input} tokens, output ${output} tokens)`
        : "  goose: provider request completed (usage not reported)"
    );
    gooseFrame(rel + 50, {
      sessionUpdate: "usage_update",
      used: gateway.metered ? used : 0,
      contextLimit: window,
      accumulatedInputTokens: gateway.metered ? inputTokens : 0,
      accumulatedOutputTokens: gateway.metered ? outputTokens : 0,
      ...(gateway.metered && price != null
        ? { accumulatedCost: Number(cost.toFixed(4)) }
        : {}),
    });
  };

  // Harness start-up (the skill-loader init container already ran).
  info(0, `max turns: ${MAX_TURNS}`);
  info(120, `cloning ${repo}...`);
  skills.forEach((skill, i) =>
    info(400 + i * 40, `discovered skill: ${skill}`)
  );
  info(
    700,
    "ask_user tool not mounted (opt in with spec.execution.askUser or HARNESS_HITL_ASK=on)"
  );
  info(900, `goose serve started on port 4001 (pid ${between(seed, 20, 90)})`);
  info(1100, "filesystem watcher started (quiet period: 2s)");
  acp(1200, ladder("in_progress", "pending", "pending"));
  if (ctx.approve) info(ACP_READY_AFTER_MS + 400, "tee: viewer attached");

  for (let step = 0; step < STEP_COUNT; step++) {
    const at = stepStart(step);
    const file = eco.files[step % eco.files.length];
    if (step === 0) {
      acp(at, ladder("completed", "in_progress", "pending"));
      say(
        at + 400,
        "agent_thought_chunk",
        `${scope}The stage asks me to ${instructions.charAt(0).toLowerCase()}${instructions.slice(1, 160)}`
      );
      usage(at + 1500, step);
      continue;
    }
    if (compactionSteps.has(step)) {
      usage(at, step, true);
      const notice =
        "Context compacted: the conversation was summarized to stay within the model's context window.";
      gooseFrame(at + 200, {
        sessionUpdate: "status_message",
        status: { type: "notice", message: notice },
      });
      warn(at + 200, `goose notice: ${notice}`);
      say(
        at + 1200,
        "agent_message_chunk",
        "Picking up from the summary: the remaining incidents are in the service and REST layers."
      );
      continue;
    }
    switch (step % 4) {
      case 1:
        say(
          at,
          "agent_message_chunk",
          `Next I will read \`${file}\` and update it for the target platform.`
        );
        tool(
          at + 800,
          `text_editor · ${file}`,
          "read",
          "completed",
          `Read ${between(`${seed}:lines:${step}`, 40, 420)} lines.`
        );
        break;
      case 2: {
        const edit = eco.edits[step % eco.edits.length];
        tool(
          at + 300,
          `text_editor · ${file}`,
          "edit",
          "completed",
          "The file has been edited.",
          { path: file, ...edit }
        );
        break;
      }
      case 3: {
        const fails = step % 8 === 7;
        info(at + 200, `  goose: $ ${eco.build}`);
        if (buildOutputAt == null) buildOutputAt = at + 400;
        tool(
          at + 300,
          `shell · ${eco.build}`,
          "execute",
          fails ? "failed" : "completed",
          fails ? eco.error : eco.ok
        );
        info(at + 1300, `  goose: ${fails ? eco.error : eco.ok}`);
        if (fails) {
          say(
            at + 2200,
            "agent_message_chunk",
            "The build failed on a leftover import. Fixing it before moving on."
          );
        }
        break;
      }
      default:
        say(
          at,
          "agent_thought_chunk",
          `${toolCalls} tool calls so far. The remaining work is in ${eco.files[(step + 1) % eco.files.length]}.`
        );
        break;
    }
    usage(at + 3200, step);
    if (step % 3 === 0)
      acp(at + 3400, ladder("completed", "in_progress", "pending"));
  }

  if (ctx.terminal || ctx.phase === "AwaitingApproval") {
    const at = FINISH_MS;
    if (ctx.phase === "Failed") {
      const output =
        ctx.output ?? "The stage failed before it could push its changes.";
      tool(at, `shell · ${eco.build}`, "execute", "failed", output);
      acp(at + 1200, ladder("completed", "in_progress", "pending"));
      const notice = `Stage failed: ${output}`;
      gooseFrame(at + 1300, {
        sessionUpdate: "status_message",
        status: { type: "notice", message: notice },
      });
      log.push({
        rel: at + 1300,
        level: "ERROR",
        text: `stage failed: ${output}`,
      });
    } else if (ctx.phase === "AwaitingApproval") {
      say(
        at,
        "agent_message_chunk",
        "The proposal is ready. Waiting for approval before applying it."
      );
      info(
        at + 400,
        "tee: session/request_permission kperm-1 offered to 1 viewer(s)"
      );
    } else {
      // This application's own commits.
      const commits =
        stage.commits?.filter((commit) =>
          isCommitOf(commit, ctx.application?.id)
        ).length ?? 0;
      // A last check before the push, then a closing summary in Markdown
      // (emphasis, a list, inline code). A stage with commits for this
      // application shows its changes (a tool output of several lines); one
      // without has a clean working tree (no output) and says nothing
      // changed, as its "0 commits" plan step does. Plain frames, not
      // `tool()`: they add no turn or usage.
      const [changedA, changedB] = eco.files;
      const hasChanges = commits > 0;
      const validateId = `toolu_${hash(`${seed}:validate`).toString(36)}`;
      const validateTitle = "shell · git status --short && git diff --stat";
      acp(at - 1300, {
        sessionUpdate: "tool_call",
        toolCallId: validateId,
        title: validateTitle,
        kind: "execute",
        status: "in_progress",
      });
      info(at - 1300, `  tool: ${logTitle(validateTitle)} (in_progress)`);
      acp(at - 900, {
        sessionUpdate: "tool_call_update",
        toolCallId: validateId,
        status: "completed",
        content: hasChanges
          ? [
              {
                type: "content",
                content: {
                  type: "text",
                  text: [
                    ` M ${changedA}`,
                    ` M ${changedB}`,
                    ` ${changedA} | 6 ++++--`,
                    ` ${changedB} | 4 ++--`,
                    " 2 files changed, 6 insertions(+), 4 deletions(-)",
                  ].join("\n"),
                },
              },
            ]
          : [],
      });
      info(at - 900, "  tool: completed");
      say(
        at - 600,
        "agent_message_chunk",
        (hasChanges
          ? [
              "*Final check passed:*",
              "",
              `- \`${eco.build}\`: build OK`,
              "- The working tree holds only the intended changes:",
              `  - \`${changedA}\` (modified)`,
              `  - \`${changedB}\` (modified)`,
            ]
          : [
              "*Final check passed:*",
              "",
              `- \`${eco.build}\`: build OK`,
              "- The working tree is clean: this stage changed no files, so there is nothing to commit.",
            ]
        ).join("\n")
      );
      say(
        at,
        "agent_message_chunk",
        `${stage.name} is done. Pushing the branch.`
      );
      const pushId = "harness-push-1";
      acp(at + 600, {
        sessionUpdate: "tool_call",
        toolCallId: pushId,
        title: `Push ${branch}`,
        kind: "execute",
        status: "in_progress",
      });
      info(at + 600, `  tool: Push ${branch} (in_progress)`);
      acp(at + 1400, {
        sessionUpdate: "tool_call_update",
        toolCallId: pushId,
        status: "completed",
      });
      info(at + 1400, "  tool: completed");
      acp(
        at + 1500,
        ladder(
          "completed",
          "completed",
          "completed",
          `Pushed 1 time, ${commits} commit${commits === 1 ? "" : "s"} on ${branch}`,
          { pushes: 1, commits }
        )
      );
      if (gateway.metered && gateway.price != null) {
        acp(at + 1600, {
          sessionUpdate: "usage_update",
          used: Math.round(window * curve[STEP_COUNT - 1]),
          size: window,
          cost: { amount: Number(cost.toFixed(2)), currency: "USD" },
        });
      }
      const notice = `Stage succeeded: results pushed to ${branch}.`;
      gooseFrame(at + 1700, {
        sessionUpdate: "status_message",
        status: { type: "notice", message: notice },
      });
      info(
        at + 1700,
        "agent closing message: none (2 text chunks during the turn)"
      );
      info(at + 1800, `[ok] ${stage.name} succeeded`);
    }
  }

  frames.sort((a, b) => a.rel - b.rel);
  log.sort((a, b) => a.rel - b.rel);
  return { frames, log, buildOutputAt };
};

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

const hasGap = (ctx: StageContext) =>
  ctx.terminal &&
  ctx.stage.stageId === GAP_STAGE_ID &&
  !ctx.approve &&
  isVisible(ctx, stepStart(GAP_STEPS.from));

const recordingFor = (
  ctx: StageContext
): Pick<AgentRunTranscript, "status" | "skipReason"> => {
  if (ctx.approve) {
    return { status: "skipped", skipReason: RECORDING_SKIP_REASONS.approve };
  }
  // Waiting for approval, the agent has finished its turn: everything it did
  // is recorded. The pod still exists, so its log stays live.
  if (ctx.phase === "AwaitingApproval") return { status: "complete" };
  if (ctx.live) return { status: "recording" };
  return { status: hasGap(ctx) ? "incomplete" : "complete" };
};

/**
 * The recorded lines visible now: frames stamped with their time, the gap,
 * and the stage's own messages (the plan run's activity, including the live
 * progress messages) as agent messages at their timestamps. The stage's
 * messages are the first application's agent run's (they carry its failure
 * or its proposal), never another application's.
 */
const recordedLines = (
  ctx: StageContext,
  script: Script
): RecordedTranscriptLine[] => {
  const gap = hasGap(ctx)
    ? { from: stepStart(GAP_STEPS.from), to: stepStart(GAP_STEPS.to) }
    : undefined;
  const inGap = (rel: number) => gap != null && rel >= gap.from && rel < gap.to;
  const frame = (update: Record<string, unknown>, method: string) => ({
    jsonrpc: "2.0",
    method,
    params: { sessionId: `${ctx.name}-session`, update },
  });
  const timed: { ms: number; line: RecordedTranscriptLine }[] = [];
  script.frames.forEach(({ rel, method, update }) => {
    if (!isVisible(ctx, rel) || inGap(rel)) return;
    const t = timeAt(ctx, rel);
    timed.push({
      ms: Date.parse(t),
      line: { t, frame: frame(update, method) },
    });
  });
  // A chunked agent message spans from its first chunk to its last; a stage
  // message stamped inside one goes after it, as one session would emit it.
  const spans = new Map<string, { first: number; last: number }>();
  script.frames.forEach(({ rel, update }) => {
    const goose = (update._meta as { goose?: { messageId?: string } })?.goose;
    if (goose?.messageId == null) return;
    const ms = Date.parse(timeAt(ctx, rel));
    const span = spans.get(goose.messageId);
    spans.set(goose.messageId, {
      first: span?.first ?? ms,
      last: Math.max(span?.last ?? ms, ms),
    });
  });
  const splitSpan = (ms: number) =>
    [...spans.values()].find(({ first, last }) => ms >= first && ms <= last);
  const own = ctx.applicationIndex === 0 ? (ctx.stage.messages ?? []) : [];
  const { cutAt } = ctx.timeline;
  // A stage that stopped before its script ran (the 4 s stages of a run
  // started in the prototype) was read while it ran, and the recording only
  // grows (the hooks read it by line offset): it keeps the progress messages
  // the stage sent while it ran, and its final messages, which replace them
  // on the plan run, come after everything recorded then, at its end (just
  // before the closing frames).
  // Known mock limit: a stage watched while it ran that ends after its
  // script has played rescales its times to its real duration, so its lines
  // change after they were read. The hub's recording only grows.
  const end = cutAt == null ? undefined : ctx.timeline.start + cutAt - 1;
  const messages: { message: StageMessage; at?: number }[] =
    end == null || own.length === 0
      ? own.map((message) => ({ message }))
      : [
          ...execution
            .progressMessages(
              ctx.stage.name,
              (cutAt ?? 0) - 1,
              ctx.timeline.start
            )
            .map((message) => ({ message })),
          ...own.map((message) => ({ message, at: end })),
        ];
  messages.forEach(({ message, at }, i) => {
    const stamped = at ?? Date.parse(message.timestamp);
    const span = at == null ? splitSpan(stamped) : undefined;
    const ms = span == null ? stamped : span.last + 1;
    const rel = (ms - ctx.timeline.start) / ctx.timeline.scale;
    // Moved past a message still arriving: it shows once that message ends.
    if (
      Number.isNaN(ms) ||
      inGap(rel) ||
      (span != null && !isVisible(ctx, rel))
    )
      return;
    timed.push({
      ms,
      line: {
        t: new Date(ms).toISOString(),
        frame: frame(
          {
            sessionUpdate:
              message.role === "user"
                ? "user_message_chunk"
                : "agent_message_chunk",
            content: { type: "text", text: message.content },
            _meta: {
              goose: {
                messageId: `stage-message-${i}`,
                ...(message.role === "user" ? { steer: true } : {}),
              },
            },
          },
          "session/update"
        ),
      },
    });
  });
  if (gap != null && isVisible(ctx, gap.from)) {
    const from = timeAt(ctx, gap.from);
    timed.push({
      ms: Date.parse(from),
      line: { gap: { from, to: timeAt(ctx, gap.to) } },
    });
  }
  // Stable sort: equal times keep script order.
  return timed
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => a.ms - b.ms || a.order - b.order)
    .map(({ line }) => line);
};

/** Usage as the run reports it: every visible frame (the live ACP stream). */
const visibleUsage = (ctx: StageContext, script: Script) =>
  foldTranscript(
    script.frames
      .filter(({ rel }) => isVisible(ctx, rel))
      .map(({ rel, method, update }) => ({
        t: timeAt(ctx, rel),
        frame: { jsonrpc: "2.0", method, params: { update } },
      }))
  );

// ---------------------------------------------------------------------------
// The AgentRun resource
// ---------------------------------------------------------------------------

const condition = (
  type: string,
  status: Crd.Condition["status"],
  reason: string,
  message: string,
  lastTransitionTime: string
): Crd.Condition => ({
  type,
  status,
  reason,
  message,
  lastTransitionTime,
  observedGeneration: 1,
});

const agentRunResource = (ctx: StageContext, script: Script): Crd.AgentRun => {
  const { run, stage, gateway } = ctx;
  const startTime = stage.startedAt ?? run.startedAt;
  const startMs = Date.parse(startTime);
  const applicationId = ctx.application?.id;
  // One AgentWorkflowRun per application: the first application's keeps
  // the plan run's name, the others add their application id.
  const workflowRun =
    ctx.applicationIndex > 0 && applicationId != null
      ? toResourceName(`run-${run.id}-app-${applicationId}`)
      : toResourceName(`run-${run.id}`);
  const usage = ctx.terminal ? visibleUsage(ctx, script).usage : undefined;
  const ready = timeAt(ctx, ACP_READY_AFTER_MS);
  const acpReady = ctx.terminal
    ? condition(
        ACP_READY_CONDITION,
        "False",
        "Finished",
        "The run has finished; its ACP endpoint is closed.",
        ctx.completedAt ?? startTime
      )
    : isVisible(ctx, ACP_READY_AFTER_MS)
      ? condition(
          ACP_READY_CONDITION,
          "True",
          "Listening",
          "The agent accepts ACP connections on port 4000.",
          ready
        )
      : condition(
          ACP_READY_CONDITION,
          "False",
          "NotListening",
          "Waiting for the sandbox to pass its readiness probe.",
          startTime
        );
  const succeeded =
    ctx.phase === "Succeeded"
      ? condition(
          "Succeeded",
          "True",
          "Succeeded",
          "The agent completed its work.",
          ctx.completedAt ?? startTime
        )
      : ctx.phase === "Failed"
        ? condition(
            "Succeeded",
            "False",
            "Failed",
            ctx.output ?? "The agent failed.",
            ctx.completedAt ?? startTime
          )
        : condition(
            "Succeeded",
            "Unknown",
            "Running",
            "The agent is running.",
            startTime
          );
  const completionTime = ctx.terminal ? ctx.completedAt : undefined;
  return {
    apiVersion: "konveyor.io/v1alpha1",
    kind: "AgentRun",
    metadata: {
      name: ctx.name,
      namespace: NAMESPACE,
      uid: fakeUid(ctx.name),
      resourceVersion: String(between(`${ctx.name}:rv`, 10_000, 99_999)),
      generation: 1,
      creationTimestamp: new Date(startMs - SANDBOX_STARTUP_MS).toISOString(),
      labels: {
        [MANAGED_BY_LABEL]: "agentic-controller",
        "konveyor.io/agentworkflowrun": workflowRun,
        "konveyor.io/stage": toResourceName(stage.name),
        ...(applicationId != null
          ? { [APPLICATION_LABEL]: String(applicationId) }
          : {}),
      },
    },
    spec: {
      agentRef: toResourceName(stage.agent.name),
      instructions: stage.instructions,
      gateway: gateway.resource.metadata.name,
      execution: {
        mode: ctx.approve ? "approve" : "auto",
        maxTurns: MAX_TURNS,
      },
      env: [
        {
          name: RUN_ENV.HUB_BASE_URL,
          value: "http://tackle-hub.konveyor-tackle.svc:8080",
        },
        ...(applicationId != null
          ? [{ name: RUN_ENV.APP_ID, value: String(applicationId) }]
          : []),
        { name: RUN_ENV.TARGET_BRANCH, value: run.targetBranch },
      ],
    },
    status: {
      phase: ctx.terminal ? (ctx.phase as Crd.AgentRunPhase) : "Running",
      observedGeneration: 1,
      sandboxName: ctx.name,
      startTime,
      ...(completionTime != null
        ? {
            completionTime,
            duration: Math.round((Date.parse(completionTime) - startMs) / 1000),
          }
        : {}),
      secretKeyRef: { name: `${ctx.name}-acp` },
      conditions: [succeeded, acpReady],
      ...(ctx.terminal
        ? {
            terminationData: {
              exitCode: ctx.phase === "Succeeded" ? 0 : 1,
              outcome: ctx.phase === "Succeeded" ? "succeeded" : "failed",
              // The stage output the plan run shows is this field.
              stopReason:
                ctx.output ??
                (ctx.phase === "Succeeded" ? "end_turn" : "stage failed"),
              // What the harness writes today: no tokens, and no cost
              // (it reads a field goose does not send, see ADR 0021).
              usage: {
                ...(usage?.turnsUsed != null
                  ? { turnsUsed: usage.turnsUsed }
                  : {}),
                ...(usage?.contextUsed != null
                  ? { contextUsed: usage.contextUsed }
                  : {}),
                contextSize: gateway.contextWindow,
              },
            },
          }
        : {}),
    },
  };
};

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

const MAVEN_ARTIFACTS = [
  "io/quarkus/quarkus-core/3.15.1/quarkus-core-3.15.1",
  "io/quarkus/quarkus-arc/3.15.1/quarkus-arc-3.15.1",
  "io/quarkus/quarkus-hibernate-orm/3.15.1/quarkus-hibernate-orm-3.15.1",
  "jakarta/persistence/jakarta.persistence-api/3.1.0/jakarta.persistence-api-3.1.0",
  "jakarta/enterprise/jakarta.enterprise.cdi-api/4.1.0/jakarta.enterprise.cdi-api-4.1.0",
  "org/hibernate/orm/hibernate-core/6.6.1.Final/hibernate-core-6.6.1.Final",
  "io/smallrye/reactive/mutiny/2.6.2/mutiny-2.6.2",
  "org/jboss/logging/jboss-logging/3.6.1.Final/jboss-logging-3.6.1.Final",
];

/** One line of verbose build output (deterministic by index). */
const buildOutputLine = (i: number): string => {
  const artifact = MAVEN_ARTIFACTS[i % MAVEN_ARTIFACTS.length];
  switch (i % 5) {
    case 0:
      return `  goose: [\u001b[1;36mINFO\u001b[m] Downloading from central: https://repo.maven.apache.org/maven2/${artifact}.pom`;
    case 1:
      return `  goose: [\u001b[1;36mINFO\u001b[m] Downloaded from central: https://repo.maven.apache.org/maven2/${artifact}.jar (${(i % 900) + 12} kB at ${(i % 400) + 180} kB/s)`;
    case 2:
      return `  goose: [\u001b[1;33mWARNING\u001b[m] /workspace/src/main/java/com/example/coolstore/generated/Model${i % 997}.java:[${(i % 300) + 1},${(i % 40) + 1}] [deprecation] getId() in BaseEntity has been deprecated`;
    case 3:
      return `  goose: [\u001b[1;36mINFO\u001b[m] Compiling module ${Math.floor(i / 5) % 64} of 64: ${(i % 2000) + 1} source files with javac [debug release 17]`;
    default:
      return `  goose: [\u001b[1;36mINFO\u001b[m] Processing annotation ${i}: io.quarkus.arc.processor.BeanProcessor`;
  }
};

const logLine = (ctx: StageContext, { rel, level, text }: ScriptLog) =>
  `${timeAt(ctx, rel)}\t${LEVELS[level]}\t${text}`;

const LONG_LOG_CACHE = new Map<string, string>();
const LONG_LOG_CACHE_SIZE = 4;

const agentLogText = (ctx: StageContext, script: Script): string => {
  const long =
    ctx.terminal &&
    ctx.stage.stageId === LONG_LOG_STAGE_ID &&
    script.buildOutputAt != null &&
    isVisible(ctx, script.buildOutputAt);
  const key = `${ctx.name}|${ctx.phase}|${ctx.timeline.start}|${ctx.timeline.scale}`;
  if (long) {
    const cached = LONG_LOG_CACHE.get(key);
    if (cached != null) return cached;
  }
  const lines: string[] = [];
  const at = script.buildOutputAt ?? 0;
  let spilled = !long;
  script.log.forEach((entry) => {
    if (!isVisible(ctx, entry.rel)) return;
    if (!spilled && entry.rel > at) {
      // The long build output goes right after the first build command.
      spilled = true;
      for (let i = 0; i < LONG_LOG_LINES; i++) {
        lines.push(
          logLine(ctx, {
            rel: at + (i * 800) / LONG_LOG_LINES,
            level: "INFO",
            text: buildOutputLine(i),
          })
        );
      }
    }
    lines.push(logLine(ctx, entry));
  });
  const text = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  if (long) {
    if (LONG_LOG_CACHE.size >= LONG_LOG_CACHE_SIZE) LONG_LOG_CACHE.clear();
    LONG_LOG_CACHE.set(key, text);
  }
  return text;
};

/** The init container's log: plain lines (the loader writes to stderr, no timestamps). */
const skillLoaderLogText = (ctx: StageContext): string => {
  const skills = stagedSkills(ctx.run, ctx.stage, ctx.application?.id).map(
    ({ name, loadPolicy }) => ({
      name: toResourceName(name),
      type: loadPolicy,
    })
  );
  if (skills.length === 0) {
    return "sources: 0 declared under /opt/skills-src, destination: /opt/skills\nno skills staged, the agent will run without any\n";
  }
  const sources = [
    "quay.io/konveyor/skills:java-migration",
    "https://github.com/konveyor/skills",
    "inline",
  ];
  const rules = skills.filter((skill) => skill.type === "rule");
  return [
    `sources: ${skills.length} declared under /opt/skills-src, destination: /opt/skills`,
    ...skills.map(
      (skill) =>
        `${skill.name} (${skill.type}) from ${skill.type === "rule" ? "inline" : pick(sources.slice(0, 2), skill.name)}`
    ),
    ...(rules.length > 0
      ? [`always-loaded rules: [${rules.map((rule) => rule.name).join(" ")}]`]
      : []),
    `${skills.length} skill(s) valid`,
    "",
  ].join("\n");
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const stageAgentRun = (ctx: StageContext): StageAgentRun => {
  const script = buildScript(ctx);
  return toStageAgentRun(agentRunResource(ctx, script), {
    runId: ctx.run.id,
    stageId: ctx.stage.stageId,
    phase: ctx.phase,
    applicationNames: new Map(
      ctx.run.applications.map(({ id, name }) => [id, name])
    ),
    gateway: ctx.gateway.resource,
    liveUsage: visibleUsage(ctx, script).usage,
    logSource: ctx.live ? "live" : "saved",
  });
};

/**
 * GET /plan-runs/:runId/agent-runs: one per started stage and application,
 * in stage order, then the run's application order.
 */
export const listPlanRunAgentRuns = (runId: EntityId): StageAgentRun[] => {
  const now = Date.now();
  const run = execution.getPlanRun(runId);
  return startedStages(run, now).map(stageAgentRun);
};

/** GET /agent-runs/:name: the AgentRun CR. */
export const getAgentRunResource = (name: string): Crd.AgentRun => {
  const ctx = findAgentRun(name);
  return agentRunResource(ctx, buildScript(ctx));
};

/** A recorded transcript read, as the hub branch serves it (ADR 0024). */
export interface RecordedTranscriptReply {
  /** 404 before the recorder has created the run's directory, else 200. */
  httpStatus: 200 | 404;
  /** `X-Transcript-Status`. */
  status: AgentRunRecordingStatus;
  /** `X-Transcript-Skip-Reason`. */
  skipReason?: string;
  /** The NDJSON body: the recorded lines from the offset on, each ended by a newline. */
  ndjson: string;
}

/**
 * GET /agent-runs/:name/transcript?offset=. The recorded lines (`{t, frame}`
 * and gap lines) from line `offset` on, as NDJSON, with the recording status
 * in headers. An offset at or past the end answers no lines, a malformed one
 * a 400. A running stage answers 404 (`none`) until its sandbox is ready
 * (`ACP_READY_AFTER_MS`), as the hub does before its recorder has created
 * the run's directory; a skipped run is decided before the run starts.
 */
export const getAgentRunTranscript = (
  name: string,
  offsetParam: string | null = null
): RecordedTranscriptReply => {
  const ctx = findAgentRun(name);
  const offset =
    offsetParam == null || offsetParam === "" ? 0 : Number(offsetParam);
  if (!Number.isInteger(offset) || offset < 0) {
    throw badRequest("offset must be a non-negative integer.");
  }
  const recording = recordingFor(ctx);
  if (recording.status === "skipped") {
    return { httpStatus: 200, ...recording, ndjson: "" };
  }
  if (ctx.live && !isVisible(ctx, ACP_READY_AFTER_MS)) {
    return { httpStatus: 404, status: "none", ndjson: "" };
  }
  const ndjson = recordedLines(ctx, buildScript(ctx))
    .slice(offset)
    .map((line) => `${JSON.stringify(line)}\n`)
    .join("");
  return { httpStatus: 200, ...recording, ndjson };
};

/** UTF-8 length of one code point. */
const utf8Width = (codePoint: number) =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

/** UTF-8 length of a text, the unit of the log offsets. */
export const utf8Length = (text: string) => {
  let bytes = 0;
  for (const char of text) bytes += utf8Width(char.codePointAt(0) ?? 0);
  return bytes;
};

/**
 * The text after its first `bytes` UTF-8 bytes. JSON carries characters,
 * not bytes, so an offset inside a character starts at the next one (the
 * hub's text/plain body would start mid-character instead).
 */
const afterUtf8Bytes = (text: string, bytes: number) => {
  let skipped = 0;
  let index = 0;
  while (index < text.length && skipped < bytes) {
    const codePoint = text.codePointAt(index) ?? 0;
    skipped += utf8Width(codePoint);
    index += codePoint > 0xffff ? 2 : 1;
  }
  return text.slice(index);
};

/**
 * GET /agent-runs/:name/logs?container=&offset=. The text from `offset`
 * (UTF-8 bytes, like the observability hub branch) on. As on the hub, an offset at or
 * past the end answers no text (200), and only a malformed offset is a 400.
 */
export const getAgentRunLog = (
  name: string,
  container: string | null,
  offsetParam: string | null
): AgentRunLogChunk => {
  const ctx = findAgentRun(name);
  const selected = container == null || container === "" ? "agent" : container;
  if (!(AGENT_RUN_CONTAINERS as readonly string[]).includes(selected)) {
    throw notFound(`Container "${selected}" not found in agent run "${name}".`);
  }
  const offset =
    offsetParam == null || offsetParam === "" ? 0 : Number(offsetParam);
  if (!Number.isInteger(offset) || offset < 0) {
    throw badRequest("offset must be a non-negative integer.");
  }
  const text =
    selected === "agent"
      ? agentLogText(ctx, buildScript(ctx))
      : skillLoaderLogText(ctx);
  const size = utf8Length(text);
  return {
    container: selected,
    source: ctx.live ? "live" : "saved",
    offset,
    nextOffset: Math.max(offset, size),
    text: offset < size ? afterUtf8Bytes(text, offset) : "",
    complete: ctx.terminal,
  };
};
