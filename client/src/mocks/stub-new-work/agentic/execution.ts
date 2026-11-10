/**
 * Execution side of the agentic mock server: plan runs and the per-application
 * migration view.
 *
 * One source of truth: the run records below. The plan-run list, run detail,
 * stage detail, an application's plan-runs tab and the inventory migration
 * status all read them, so one run shows one status everywhere.
 *
 * Prototype scenarios ("worlds"): the switcher's scenario and stage select a
 * seeded set of runs (see `seedWorld`). Changing either re-seeds the world, as
 * an explicit scenario change applies to the whole demo. Within a world, user
 * actions (start, approve, reject) mutate the records and the server advances
 * runs over time:
 *   - a started run is Pending for 2 s, then runs each stage for 4 s;
 *   - a stage that requires approval stops as AwaitingApproval when the
 *     execution policy is `interactive` (seeded "action required" runs always
 *     wait for a decision);
 *   - approving a stage completes it and starts the next one; approving the
 *     last stage completes the run.
 * Seeded runs are snapshots: they do not progress until a user acts on them.
 *
 * A plan run snapshots its Plan's stages when it starts, so editing or deleting
 * stages of the Plan never changes an existing run.
 */
import {
  ApplicationMigrationStageExecution,
  ApplicationMigrationView,
  ControllerRunPhase,
  EffectiveSkillAssociation,
  EntityId,
  EntityRef,
  PlanRun,
  PlanStage,
  StageMessage,
  StageRun,
  StartApplicationMigrationsResponse,
} from "@app/agentic";
import { Application } from "@app/api/models";
import {
  PROTOTYPE_FIXTURE_RESET_EVENT,
  PrototypeScenario,
} from "@app/prototype/agentic/types";
import { mockApplicationArray } from "@mocks/stub-new-work/applications";

import {
  Body,
  StoredPlan,
  applicationSkills,
  asBody,
  badRequest,
  collectionSkillsForAgents,
  conflict,
  db,
  effectiveSkillsForPlan,
  findApplication,
  findArchetype,
  isSeeded,
  listNames,
  notFound,
  requiredArray,
  requiredString,
  resolveAgentRef,
  resolvePlanRef,
  resolveSkillRef,
  uniqueEffectiveSkills,
} from "./db";
import { PlanRunTemplate, mockMigrationPlans, mockPlanRuns } from "./fixtures";
import { APPLICATION_TARGET_PROFILE_IDS, selectPortfolio } from "./portfolio";
import {
  getPrototypeScenario,
  getPrototypeStageIndex,
} from "./prototype-state";

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export const PENDING_MS = 2000;
export const STAGE_MS = 4000;

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

interface RunClock {
  /** Index into `run.stageRuns` (execution order). */
  index: number;
  phase: "pending" | "running";
  /** When the current phase started (ms). */
  since: number;
}

interface RunRecord {
  run: PlanRun;
  /** Present while the server advances the run over time. */
  clock?: RunClock;
  /** A running stage whose agent messages are revealed over time. */
  live?: { index: number; since: number };
}

interface World {
  key: string;
  records: RunRecord[];
}

let world: World | undefined;

const worldKey = () => `${getPrototypeScenario()}:${getPrototypeStageIndex()}`;

/** Forget all runs; the next read seeds the world for the current scenario. */
export const resetExecutionWorld = () => {
  world = undefined;
};

if (typeof window !== "undefined") {
  window.addEventListener(PROTOTYPE_FIXTURE_RESET_EVENT, resetExecutionWorld);
}

// ---------------------------------------------------------------------------
// Content generators
// ---------------------------------------------------------------------------

const MINUTE = 60000;

const runNumber = (id: EntityId) => {
  const value = Number(id);
  return Number.isFinite(value) ? value : 0;
};

/** Deterministic fake commit hash (e2e specs rely on run 1 stage 1 = 007a69cafe). */
export const mockRunHash = (runId: EntityId, stageIndex: number): string =>
  ((runNumber(runId) * 31337 + stageIndex * 104729) % 16777216)
    .toString(16)
    .padStart(6, "0") + "cafe";

const PROGRESS_SCRIPT: Array<{ relativeMs: number; content: string }> = [
  { relativeMs: 0, content: "" },
  {
    relativeMs: 4000,
    content: "Connected to application repository. Cloning source files...",
  },
  {
    relativeMs: 10000,
    content:
      "Source scan complete. Analyzing dependencies and import statements.",
  },
  {
    relativeMs: 18000,
    content:
      "Identified migration-relevant patterns. Building transformation plan.",
  },
  {
    relativeMs: 26000,
    content:
      "Dependency graph resolved. Determining optimal transformation sequence.",
  },
  {
    relativeMs: 34000,
    content: "Generating application-specific migration instructions.",
  },
  {
    relativeMs: 42000,
    content: "Draft migration proposal ready. Preparing for review.",
  },
];

const progressMessages = (
  stageName: string,
  elapsedMs: number,
  startedAt: number
): StageMessage[] =>
  PROGRESS_SCRIPT.filter((entry) => entry.relativeMs <= elapsedMs).map(
    (entry) => ({
      role: "agent" as const,
      content:
        entry.relativeMs === 0
          ? `Starting "${stageName}": initializing analysis environment.`
          : entry.content,
      timestamp: new Date(startedAt + entry.relativeMs).toISOString(),
    })
  );

const FAILURE_OUTPUT =
  "Error: Unable to resolve dependency tree. 14 conflicting packages require manual resolution before migration can proceed.";

/** Failure details per Plan, shown as evidence in the application view. */
const PLAN_FAILURE_DETAILS: Record<
  EntityId,
  { summary: string; evidence: string[] }
> = {
  "1": {
    summary: "Validation stopped after two integration tests failed.",
    evidence: [
      "InventoryRepositoryIT: expected 200, received 500",
      "StockReservationIT: database timeout after 30 seconds",
    ],
  },
  "2": {
    summary: "Validation stopped after a migrated test failed.",
    evidence: [
      "OrderResourceIT: response contract changed",
      "One consumer still expects the legacy error payload",
    ],
  },
  "3": {
    summary: "The security review found an unresolved runtime exception.",
    evidence: [
      "Container requests a fixed root UID",
      "The exception has no approved justification",
    ],
  },
  "4": {
    summary: "Deployment validation found an unavailable dependency.",
    evidence: [
      "spring-cloud-starter-sleuth is unsupported on Spring Boot 3",
      "OpenTelemetry replacement requires review",
    ],
  },
  "5": {
    summary: "The Java 17 build found an incompatible library.",
    evidence: [
      "legacy-xml-parser 2.4 uses removed JDK internals",
      "No compatible version is approved in the dependency catalog",
    ],
  },
  "6": {
    summary: "Validation found a Windows-only API dependency.",
    evidence: [
      "System.Drawing.Common is called by ReportRenderer",
      "A cross-platform rendering replacement is required",
    ],
  },
  "7": {
    summary: "The selected platform cannot satisfy a runtime constraint.",
    evidence: [
      "The application requires Windows authentication",
      "The target namespace does not provide a compatible identity integration",
    ],
  },
  "8": {
    summary: "The runtime upgrade found an incompatible native module.",
    evidence: [
      "canvas 2.x has no approved Node.js 22 build",
      "Image preview behavior requires regression testing",
    ],
  },
};

const snapshotStage = (stage: PlanStage) => ({
  stageId: stage.id,
  name: stage.name,
  agent: { ...stage.agent },
  instructions: stage.instructions,
  requiresApproval: stage.requiresApproval,
  order: stage.order,
});

const pendingStage = (stage: PlanStage): StageRun => ({
  ...snapshotStage(stage),
  status: "Pending",
});

const succeededStage = (
  runId: EntityId,
  stage: PlanStage,
  index: number,
  startMs: number,
  endMs: number
): StageRun => ({
  ...snapshotStage(stage),
  status: "Succeeded",
  startedAt: new Date(startMs).toISOString(),
  completedAt: new Date(endMs).toISOString(),
  messages: [
    {
      role: "agent",
      content: `Starting "${stage.name}": initializing execution environment.`,
      timestamp: new Date(
        startMs + Math.min(5000, (endMs - startMs) / 4)
      ).toISOString(),
    },
    {
      role: "agent",
      content: `"${stage.name}" completed successfully.`,
      timestamp: new Date(
        endMs - Math.min(15000, (endMs - startMs) / 4)
      ).toISOString(),
    },
  ],
  commits: [
    {
      hash: mockRunHash(runId, index),
      message: `${stage.name}: apply migration changes`,
      stageName: stage.name,
    },
  ],
});

const runningStage = (stage: PlanStage, startMs: number): StageRun => ({
  ...snapshotStage(stage),
  status: "Running",
  startedAt: new Date(startMs).toISOString(),
  messages: [],
  commits: [],
});

const awaitingStage = (
  runId: EntityId,
  stage: PlanStage,
  index: number,
  startMs: number,
  readyMs: number
): StageRun => ({
  ...snapshotStage(stage),
  status: "AwaitingApproval",
  startedAt: new Date(startMs).toISOString(),
  messages: [
    {
      role: "agent",
      content: `Starting "${stage.name}": analyzing application against migration criteria.`,
      timestamp: new Date(
        startMs + Math.min(5000, (readyMs - startMs) / 4)
      ).toISOString(),
    },
    {
      role: "agent",
      content:
        "Analysis complete. Migration proposal ready for architect review. Awaiting your approval to continue.",
      timestamp: new Date(readyMs).toISOString(),
    },
  ],
  commits: [
    {
      hash: mockRunHash(runId, index),
      message: `${stage.name}: proposal ready for review`,
      stageName: stage.name,
    },
  ],
});

const failedStage = (
  stage: PlanStage,
  startMs: number,
  endMs: number,
  output = FAILURE_OUTPUT
): StageRun => ({
  ...snapshotStage(stage),
  status: "Failed",
  startedAt: new Date(startMs).toISOString(),
  completedAt: new Date(endMs).toISOString(),
  output,
  messages: [
    {
      role: "agent",
      content: `Starting "${stage.name}": scanning source code and analyzing dependencies.`,
      timestamp: new Date(startMs + 10000).toISOString(),
    },
    {
      role: "agent",
      content: output,
      timestamp: new Date(endMs).toISOString(),
    },
  ],
  commits: [],
});

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

type SeedPhase =
  | "Pending"
  | "Running"
  | "AwaitingApproval"
  | "Failed"
  | "Succeeded";

/** Membership of the seeded runs in the execution scenarios: every portfolio app once. */
const EXECUTION_MEMBERSHIP: Record<EntityId, number[]> = {
  "1": [1, 3, 8],
  "2": [7, 12],
  "3": [2],
  "4": [15, 16],
  "5": [4, 5],
  "6": [18],
  "7": [13],
};

/** Runs waiting for a decision in the `actionRequired` scenario; the rest run. */
const ACTION_REQUIRED_RUN_IDS = new Set<EntityId>(["1", "2", "4", "7"]);

/**
 * Configured-world runs whose fixture phase is replaced, so that nothing is
 * running in the "Fully configured. Ready to trigger migrations." world.
 */
const CONFIGURED_OVERRIDES: Record<
  EntityId,
  { phase: SeedPhase; index: number }
> = {
  "4": { phase: "Failed", index: 0 },
  "6": { phase: "Succeeded", index: 0 },
};

const SEED_SCENARIOS_WITHOUT_RUNS: PrototypeScenario[] = [
  "initial",
  "partialConfiguration",
];

const EXECUTION_SCENARIOS: PrototypeScenario[] = [
  "queued",
  "running",
  "actionRequired",
  "failed",
  "completed",
];

/** Stage definitions a seeded run was started with (the fixture Plan). */
const seedStagesFor = (planId: EntityId): PlanStage[] =>
  mockMigrationPlans.find((plan) => plan.id === planId)?.stages ?? [];

const applicationRefs = (ids: number[]) =>
  ids
    .map((id) => findApplication(id))
    .filter((application): application is Application => application != null)
    .map((application) => ({ id: application.id, name: application.name }));

/** Builds a run in a given phase at a given stage (0-based), timed from `baseMs`. */
const generateRun = (
  template: PlanRunTemplate,
  applications: PlanRun["applications"],
  phase: SeedPhase,
  stageIndex: number,
  baseMs: number,
  now: number
): RunRecord => {
  const stages = seedStagesFor(template.planId);
  const target = Math.min(
    Math.max(stageIndex, 0),
    Math.max(stages.length - 1, 0)
  );
  const stageStart = (i: number) => baseMs + i * 10 * MINUTE;
  const stageEnd = (i: number) => stageStart(i) + 9 * MINUTE;
  const base: PlanRun = {
    ...template,
    applications,
    startedAt: new Date(baseMs).toISOString(),
    completedAt: undefined,
    status: phase,
    stageRuns: [],
  };
  let live: RunRecord["live"];
  switch (phase) {
    case "Pending":
      base.stageRuns = stages.map(pendingStage);
      break;
    case "Succeeded": {
      base.stageRuns = stages.map((stage, i) =>
        succeededStage(template.id, stage, i, stageStart(i), stageEnd(i))
      );
      base.completedAt = new Date(
        stages.length > 0 ? stageEnd(stages.length - 1) : baseMs
      ).toISOString();
      break;
    }
    case "Running": {
      const activeStart = Math.min(stageStart(target), now);
      base.stageRuns = stages.map((stage, i) =>
        i < target
          ? succeededStage(template.id, stage, i, stageStart(i), stageEnd(i))
          : i === target
            ? runningStage(stage, activeStart)
            : pendingStage(stage)
      );
      live = { index: target, since: now };
      break;
    }
    case "AwaitingApproval":
      base.stageRuns = stages.map((stage, i) =>
        i < target
          ? succeededStage(template.id, stage, i, stageStart(i), stageEnd(i))
          : i === target
            ? awaitingStage(template.id, stage, i, stageStart(i), stageEnd(i))
            : pendingStage(stage)
      );
      break;
    case "Failed":
      base.stageRuns = stages.map((stage, i) =>
        i < target
          ? succeededStage(template.id, stage, i, stageStart(i), stageEnd(i))
          : i === target
            ? failedStage(stage, stageStart(target), stageEnd(target))
            : pendingStage(stage)
      );
      base.completedAt = new Date(stageEnd(target)).toISOString();
      break;
  }
  return { run: base, live };
};

/** A fixture run as-is, with the stage snapshot attached to each stage run. */
const fixtureRun = (template: PlanRunTemplate): RunRecord => {
  const stages = seedStagesFor(template.planId);
  return {
    run: {
      ...template,
      applications: template.applications.map((ref) => ({ ...ref })),
      stageRuns: stages.map((stage) => {
        const content = template.stageRuns.find(
          (sr) => sr.stageId === stage.id
        );
        return content
          ? { ...snapshotStage(stage), ...JSON.parse(JSON.stringify(content)) }
          : pendingStage(stage);
      }),
    },
  };
};

const seedWorld = (
  scenario: PrototypeScenario,
  stageNumber: number,
  now: number
): RunRecord[] => {
  if (SEED_SCENARIOS_WITHOUT_RUNS.includes(scenario)) return [];
  if (!EXECUTION_SCENARIOS.includes(scenario)) {
    // configured, preflightBlocked, loading, apiError
    return mockPlanRuns.map((template) => {
      const override = CONFIGURED_OVERRIDES[template.id];
      return override
        ? generateRun(
            template,
            template.applications,
            override.phase,
            override.index,
            Date.parse(template.startedAt),
            now
          )
        : fixtureRun(template);
    });
  }
  const stageIndex = stageNumber - 1;
  return mockPlanRuns.map((template, runIndex) => {
    const applications = applicationRefs(
      EXECUTION_MEMBERSHIP[template.id] ?? []
    );
    const phase: SeedPhase =
      scenario === "queued"
        ? "Pending"
        : scenario === "running"
          ? "Running"
          : scenario === "failed"
            ? "Failed"
            : scenario === "completed"
              ? "Succeeded"
              : ACTION_REQUIRED_RUN_IDS.has(template.id)
                ? "AwaitingApproval"
                : "Running";
    const baseMs =
      now -
      (scenario === "completed" ? 3 : 1) * 60 * MINUTE -
      runIndex * 5 * MINUTE;
    return generateRun(template, applications, phase, stageIndex, baseMs, now);
  });
};

const ensureWorld = (): World => {
  const key = worldKey();
  if (!world || world.key !== key) {
    world = {
      key,
      records: seedWorld(
        getPrototypeScenario(),
        getPrototypeStageIndex(),
        Date.now()
      ),
    };
  }
  return world;
};

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

const isGate = (stage: StageRun) =>
  stage.requiresApproval &&
  stage.approvedAt == null &&
  db.executionPolicy.interactionMode === "interactive";

const startStage = (record: RunRecord, index: number, at: number) => {
  const stage = record.run.stageRuns[index];
  record.run.stageRuns[index] = {
    ...stage,
    status: "Running",
    startedAt: new Date(at).toISOString(),
    messages: [],
    commits: [],
  };
  record.run.status = "Running";
  record.clock = { index, phase: "running", since: at };
  record.live = { index, since: at };
};

const completeRun = (record: RunRecord, at: number) => {
  record.run.status = "Succeeded";
  record.run.completedAt = new Date(at).toISOString();
  record.clock = undefined;
  record.live = undefined;
};

/** Moves a timed run forward to `now` (tick on read). */
const advance = (record: RunRecord, now: number) => {
  while (record.clock) {
    const { clock } = record;
    if (clock.phase === "pending") {
      if (now - clock.since < PENDING_MS) return;
      if (record.run.stageRuns.length === 0) {
        completeRun(record, clock.since + PENDING_MS);
        return;
      }
      startStage(record, clock.index, clock.since + PENDING_MS);
      continue;
    }
    if (now - clock.since < STAGE_MS) return;
    const end = clock.since + STAGE_MS;
    const stage = record.run.stageRuns[clock.index];
    const definition = { ...stage, id: stage.stageId };
    if (isGate(stage)) {
      record.run.stageRuns[clock.index] = awaitingStage(
        record.run.id,
        definition,
        clock.index,
        clock.since,
        end
      );
      record.run.stageRuns[clock.index].approvedAt = undefined;
      record.run.status = "AwaitingApproval";
      record.clock = undefined;
      record.live = undefined;
      return;
    }
    record.run.stageRuns[clock.index] = {
      ...succeededStage(
        record.run.id,
        definition,
        clock.index,
        clock.since,
        end
      ),
      approvedAt: stage.approvedAt,
    };
    if (clock.index + 1 < record.run.stageRuns.length) {
      startStage(record, clock.index + 1, end);
    } else {
      completeRun(record, end);
    }
  }
};

const records = (): RunRecord[] => {
  const current = ensureWorld();
  const now = Date.now();
  current.records.forEach((record) => advance(record, now));
  return current.records;
};

// ---------------------------------------------------------------------------
// Presentation (names are resolved on read)
// ---------------------------------------------------------------------------

const presentRun = (record: RunRecord, now = Date.now()): PlanRun => {
  const { run, live } = record;
  return {
    ...run,
    planName: resolvePlanRef({ id: run.planId, name: run.planName }).name,
    applications: run.applications.map((ref) => ({
      id: ref.id,
      name: findApplication(ref.id)?.name ?? ref.name,
    })),
    resolvedSkills: run.resolvedSkills?.map((entry) => ({
      ...entry,
      skill: resolveSkillRef(entry.skill),
    })),
    stageRuns: run.stageRuns.map((stageRun, index) => ({
      ...stageRun,
      agent: resolveAgentRef(stageRun.agent),
      messages:
        live?.index === index && stageRun.status === "Running"
          ? progressMessages(stageRun.name, now - live.since, live.since)
          : stageRun.messages,
    })),
  };
};

// ---------------------------------------------------------------------------
// Plan run API
// ---------------------------------------------------------------------------

export const listPlanRuns = (planId?: EntityId | null): PlanRun[] =>
  records()
    .filter((record) => planId == null || record.run.planId === planId)
    .map((record) => presentRun(record));

const findRecord = (runId: EntityId) => {
  const record = records().find((candidate) => candidate.run.id === runId);
  if (!record) throw notFound(`Plan run "${runId}" not found.`);
  return record;
};

export const getPlanRun = (runId: EntityId): PlanRun =>
  presentRun(findRecord(runId));

export const runsUsingPlan = (planId: EntityId) =>
  records().filter((record) => record.run.planId === planId);

/** Approves the awaiting stage; the run continues with the next stage or completes. */
export const approveStage = (runId: EntityId, stageId: EntityId): PlanRun => {
  const record = findRecord(runId);
  const index = record.run.stageRuns.findIndex((sr) => sr.stageId === stageId);
  if (index === -1) {
    throw notFound(`Stage "${stageId}" not found in plan run "${runId}".`);
  }
  const stage = record.run.stageRuns[index];
  if (stage.status !== "AwaitingApproval") {
    throw conflict(`Stage "${stage.name}" is not awaiting approval.`);
  }
  const now = Date.now();
  record.run.stageRuns[index] = {
    ...stage,
    status: "Succeeded",
    approvedAt: new Date(now).toISOString(),
    completedAt: new Date(now).toISOString(),
  };
  if (index + 1 < record.run.stageRuns.length) {
    startStage(record, index + 1, now);
  } else {
    completeRun(record, now);
  }
  return presentRun(record, now);
};

const rejectRun = (record: RunRecord) => {
  const index = record.run.stageRuns.findIndex(
    (sr) => sr.status === "AwaitingApproval"
  );
  const now = Date.now();
  if (index !== -1) {
    const stage = record.run.stageRuns[index];
    record.run.stageRuns[index] = {
      ...stage,
      status: "Failed",
      completedAt: new Date(now).toISOString(),
      output: "The migration request was rejected during review.",
    };
  }
  record.run.status = "Failed";
  record.run.completedAt = new Date(now).toISOString();
  record.clock = undefined;
  record.live = undefined;
};

// ---------------------------------------------------------------------------
// Plan resolution
// ---------------------------------------------------------------------------

/** The applications the inventory shows (Hub applications in the portfolio). */
export const portfolioApplications = () =>
  selectPortfolio(mockApplicationArray);

/**
 * The target profile an application migrates to: its fixture assignment
 * (`APPLICATION_TARGET_PROFILE_IDS`) when that profile belongs to its
 * archetype, otherwise the archetype's first profile.
 */
export const targetProfileFor = (application: Application) => {
  const archetypeId = application.archetypes?.[0]?.id;
  const profiles =
    archetypeId != null ? (findArchetype(archetypeId)?.profiles ?? []) : [];
  if (archetypeId == null || profiles.length === 0) return undefined;
  const assignedId = APPLICATION_TARGET_PROFILE_IDS[application.id];
  const profile =
    profiles.find((candidate) => candidate.id === assignedId) ?? profiles[0];
  return { archetypeId, profile };
};

/**
 * The Plan a migration of this application resolves to: the default Plan of
 * the application's archetype + target profile (`migrationPath.isDefault`),
 * or none (not configured). Non-default Plans on the same path are only used
 * when a run selects them explicitly. In the `initial` scenario the seeded
 * Plans are hidden from every read, so they do not resolve either.
 */
export const resolvePlanFor = (
  application: Application
): StoredPlan | undefined => {
  const target = targetProfileFor(application);
  if (!target) return undefined;
  const hideSeeded = getPrototypeScenario() === "initial";
  return db.plans.find(
    (plan) =>
      !(hideSeeded && isSeeded("plans", plan.id)) &&
      plan.migrationPath?.isDefault === true &&
      plan.migrationPath.archetype.id === target.archetypeId &&
      plan.migrationPath.targetProfiles.some(
        (profile) => profile.id === target.profile.id
      )
  );
};

/**
 * Number of portfolio applications whose migration uses the Plan: the Plan of
 * the application's latest run, or the Plan its migration path resolves to
 * when it has no run. This is the `plan` of the application migration view,
 * so the count matches the inventory filtered by Plan.
 */
export const planImpact = (planId: EntityId) =>
  portfolioApplications().filter(
    (application) => getApplicationMigration(application).plan?.id === planId
  ).length;

// ---------------------------------------------------------------------------
// Application migration view
// ---------------------------------------------------------------------------

const latestRecordFor = (applicationId: number) =>
  records()
    .filter((record) =>
      record.run.applications.some((ref) => ref.id === applicationId)
    )
    .sort(
      (a, b) =>
        Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt) ||
        runNumber(b.run.id) - runNumber(a.run.id)
    )[0];

const scenarioPreflight = (
  application: Application
): Pick<ApplicationMigrationView, "preflight" | "preflightReason"> => {
  const scenario = getPrototypeScenario();
  if (scenario === "partialConfiguration") {
    return application.id % 2 === 0
      ? {
          preflight: "blocked",
          preflightReason: "An approved Model is unavailable.",
        }
      : {
          preflight: "reviewRequired",
          preflightReason: "A required application parameter needs review.",
        };
  }
  if (scenario === "preflightBlocked") {
    const outcome = application.id % 3;
    if (outcome === 1) {
      return {
        preflight: "blocked",
        preflightReason: "A source control credential reference is missing.",
      };
    }
    if (outcome === 2) {
      return {
        preflight: "reviewRequired",
        preflightReason: "The resolved migration target must be confirmed.",
      };
    }
  }
  return { preflight: "ready" };
};

const stageExecution = (
  run: PlanRun,
  stageRun: StageRun
): ApplicationMigrationStageExecution => ({
  stageName: stageRun.name,
  phase: stageRun.status,
  summary:
    stageRun.status === "Failed"
      ? (stageRun.output ?? PLAN_FAILURE_DETAILS[run.planId]?.summary)
      : undefined,
  evidence:
    stageRun.status === "Failed"
      ? PLAN_FAILURE_DETAILS[run.planId]?.evidence
      : undefined,
  completedAt: stageRun.completedAt,
});

const effectiveSkillsFor = (
  plan: StoredPlan | undefined,
  applicationId: number
): EffectiveSkillAssociation[] =>
  uniqueEffectiveSkills([
    ...(plan ? effectiveSkillsForPlan(plan) : []),
    ...collectionSkillsForAgents(plan?.stages.map((s) => s.agent.id) ?? []),
    ...applicationSkills(applicationId),
  ]);

export const getApplicationMigration = (
  application: Application
): ApplicationMigrationView => {
  const record = latestRecordFor(application.id);
  const resolved = resolvePlanFor(application);
  if (!record) {
    if (!resolved) {
      return {
        configured: false,
        intervention: "none",
        stages: [],
        preflightReason: "No Plan is assigned to this migration path.",
      };
    }
    const profile = targetProfileFor(application)?.profile;
    return {
      configured: true,
      plan: { id: resolved.id, name: resolved.name },
      targetProfile: profile
        ? { id: profile.id, name: profile.name }
        : resolved.migrationPath?.targetProfiles[0],
      ...scenarioPreflight(application),
      intervention: "none",
      effectiveSkills: effectiveSkillsFor(resolved, application.id),
      stages: [],
      updatedAt: "2026-09-01T08:30:00Z",
    };
  }

  const run = presentRun(record);
  const plan = db.plans.find((candidate) => candidate.id === run.planId);
  const awaiting = run.stageRuns.find((sr) => sr.status === "AwaitingApproval");
  const active =
    awaiting ??
    run.stageRuns.find(
      (sr) => sr.status === "Running" || sr.status === "Failed"
    ) ??
    (run.status === "Succeeded"
      ? run.stageRuns[run.stageRuns.length - 1]
      : undefined);
  const profileRef = plan?.migrationPath?.targetProfiles[0];
  const isActive = run.status !== "Succeeded" && run.status !== "Failed";
  const repositoryUrl = application.repository?.url;
  return {
    configured: true,
    plan: { id: run.planId, name: run.planName },
    planRun: { id: run.id, name: run.name },
    targetProfile: profileRef,
    ...(isActive
      ? {
          preflight: "blocked" as const,
          preflightReason: `${run.name} is already in progress for this application.`,
        }
      : run.status === "Succeeded"
        ? {
            preflight: "blocked" as const,
            preflightReason: `${run.name} already migrated this application.`,
          }
        : scenarioPreflight(application)),
    runPhase: run.status === "AwaitingApproval" ? "Running" : run.status,
    currentStage: active?.name,
    intervention: awaiting ? "actionRequired" : "none",
    action: awaiting
      ? {
          title: `${awaiting.name} review required`,
          description: `The ${awaiting.name} Stage produced a migration proposal that requires a decision before the run continues.`,
          risk: application.id % 2 === 0 ? "medium" : "low",
          requestedAction: "Review Migration Proposal",
        }
      : undefined,
    effectiveSkills: effectiveSkillsFor(plan, application.id),
    result:
      run.status === "Succeeded"
        ? {
            repositoryName: application.name,
            targetBranch: run.targetBranch,
            branchUrl: repositoryUrl
              ? `${repositoryUrl}/tree/${encodeURIComponent(run.targetBranch)}`
              : undefined,
            commits: run.stageRuns.flatMap((sr) =>
              (sr.commits ?? []).map((commit) => ({
                ...commit,
                url: repositoryUrl
                  ? `${repositoryUrl}/commit/${commit.hash}`
                  : commit.url,
              }))
            ),
          }
        : undefined,
    stages: run.stageRuns.map((sr) => stageExecution(run, sr)),
    startedAt: run.startedAt,
    updatedAt: run.completedAt ?? run.startedAt,
  };
};

export const getApplicationMigrations = (applicationIds: number[]) => {
  const requested = new Set(applicationIds);
  return Object.fromEntries(
    portfolioApplications()
      .filter((application) => requested.has(application.id))
      .map((application) => [
        application.id,
        getApplicationMigration(application),
      ])
  );
};

// ---------------------------------------------------------------------------
// Start and decisions
// ---------------------------------------------------------------------------

const nextRunId = () =>
  String(
    records().reduce(
      (max, record) => Math.max(max, runNumber(record.run.id)),
      0
    ) + 1
  );

const createRun = (
  plan: StoredPlan,
  applications: Application[],
  targetBranch: string,
  now: number
): RunRecord => {
  const id = nextRunId();
  const resolvedSkills = uniqueEffectiveSkills([
    ...effectiveSkillsForPlan(plan),
    ...collectionSkillsForAgents(plan.stages.map((s) => s.agent.id)),
    ...applications.flatMap((application) => applicationSkills(application.id)),
  ]);
  return {
    run: {
      id,
      name: `Run #${id} — ${plan.name}`,
      planId: plan.id,
      planName: plan.name,
      applications: applications.map((application) => ({
        id: application.id,
        name: application.name,
      })),
      status: "Pending",
      targetBranch,
      startedAt: new Date(now).toISOString(),
      resolvedSkills,
      stageRuns: [...plan.stages]
        .sort((a, b) => a.order - b.order)
        .map((stage) =>
          pendingStage({ ...stage, agent: resolveAgentRef(stage.agent) })
        ),
    },
    clock: { index: 0, phase: "pending", since: now },
  };
};

/**
 * POST /application-migrations. Validates the request completely, then
 * creates one run per resolved Plan and returns the created runs.
 */
export const startApplicationMigrations = (
  input: unknown
): StartApplicationMigrationsResponse => {
  const body: Body = asBody(input);
  const ids = requiredArray(body, "applicationIds");
  if (ids.length === 0) throw badRequest("applicationIds must not be empty.");
  if (!ids.every((id): id is number => typeof id === "number")) {
    throw badRequest("applicationIds must be numbers.");
  }
  const planSelection = body.planSelection;
  if (planSelection !== "recommended" && planSelection !== "single") {
    throw badRequest('planSelection must be "recommended" or "single".');
  }
  const targetBranch = requiredString(body, "targetBranch", "targetBranch");

  const portfolio = portfolioApplications();
  const applications = ids.map((id) => {
    const application = portfolio.find((candidate) => candidate.id === id);
    if (!application) throw badRequest(`Application "${id}" does not exist.`);
    return application;
  });

  let singlePlan: StoredPlan | undefined;
  if (planSelection === "single") {
    const planId = body.planId;
    if (typeof planId !== "string" || planId === "") {
      throw badRequest('planId is required when planSelection is "single".');
    }
    singlePlan = db.plans.find((plan) => plan.id === planId);
    if (!singlePlan) throw badRequest(`Plan "${planId}" does not exist.`);
  }

  const notReady = applications.filter(
    (application) => getApplicationMigration(application).preflight !== "ready"
  );
  if (notReady.length > 0) {
    throw conflict(
      `These applications cannot start: ${listNames(notReady.map((a) => a.name))}. Resolve their preflight first.`
    );
  }

  const groups = new Map<EntityId, { plan: StoredPlan; apps: Application[] }>();
  applications.forEach((application) => {
    const view = getApplicationMigration(application);
    const plan =
      singlePlan ??
      db.plans.find((candidate) => candidate.id === view.plan?.id);
    if (!plan) {
      throw conflict(`No Plan resolves for ${application.name}.`);
    }
    const group = groups.get(plan.id) ?? { plan, apps: [] };
    group.apps.push(application);
    groups.set(plan.id, group);
  });

  const now = Date.now();
  const current = ensureWorld();
  const created: EntityRef[] = [];
  groups.forEach(({ plan, apps }) => {
    const record = createRun(plan, apps, targetBranch, now);
    current.records.unshift(record);
    created.push({ id: record.run.id, name: record.run.name });
  });
  return { planRuns: created };
};

/** POST /application-migrations/:id/requests/current */
export const resolveApplicationRequest = (
  applicationId: number,
  input: unknown
): ApplicationMigrationView => {
  const body = asBody(input);
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw badRequest('decision must be "approve" or "reject".');
  }
  const application = portfolioApplications().find(
    (candidate) => candidate.id === applicationId
  );
  if (!application) {
    throw notFound(`Application migration "${applicationId}" not found.`);
  }
  const record = latestRecordFor(applicationId);
  const awaiting = record?.run.stageRuns.find(
    (sr) => sr.status === "AwaitingApproval"
  );
  if (!record || !awaiting) {
    throw conflict(`${application.name} has no request awaiting a decision.`);
  }
  if (decision === "approve") {
    approveStage(record.run.id, awaiting.stageId);
  } else {
    rejectRun(record);
  }
  return getApplicationMigration(application);
};

/** Test helper: the phase of every run in the current world. */
export const runPhases = (): Record<EntityId, ControllerRunPhase> =>
  Object.fromEntries(
    records().map((record) => [record.run.id, record.run.status])
  );
