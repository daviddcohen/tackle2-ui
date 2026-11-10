/**
 * TanStack Query hooks for the agentic migration UI.
 *
 * Conventions:
 * - Keys come from `agenticKeys` and live under the `"agentic"` root, so a
 *   group (for example every plan query, list and detail) is invalidated with
 *   one call and nothing collides with upstream keys.
 * - Every mutation invalidates the groups listed in `MUTATION_EFFECTS`, the
 *   single source for "what does this write change on the server".
 * - Detail hooks are disabled until they have a usable id, never retry a 404
 *   and expose `isNotFound` separately from `fetchError`, so pages can tell
 *   "not found" from "the API failed".
 * - Hooks poll only while something they show can still change, and stop
 *   polling while the query is errored.
 * - `isLoading` means "first load in flight" (TanStack v4 `isInitialLoading`),
 *   so a disabled query never reports loading forever.
 */
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AxiosError, isAxiosError } from "axios";

import {
  AgentTestRun,
  ApplicationMigrationMap,
  ApplicationMigrationView,
  EntityId,
  MigrationPlan,
  ModelProjection,
  PlanRun,
  Provider,
  Skill,
  SkillCollection,
  StartApplicationMigrationsRequest,
  StartApplicationMigrationsResponse,
  isActivePlanRun,
  isTerminalRunPhase,
} from "@app/agentic";
import {
  approveStageRun,
  assignPlanToTargetProfile,
  createAgent,
  createMigrationPlan,
  createModel,
  createProvider,
  createSkill,
  createSkillCollection,
  deleteAgent,
  deleteMigrationPlan,
  deleteModel,
  deleteProvider,
  deleteSkill,
  deleteSkillCollection,
  getAgentById,
  getAgentTestRuns,
  getAgents,
  getApplicationMigrations,
  getAvailableModels,
  getMigrationPlanById,
  getMigrationPlans,
  getModels,
  getPlanRunById,
  getPlanRuns,
  getProviders,
  getSkillById,
  getSkillCollectionById,
  getSkillCollections,
  getSkills,
  resolveApplicationMigrationRequest,
  setDefaultModel,
  startAgentTestRun,
  startApplicationMigrations,
  updateAgent,
  updateMigrationPlan,
  updateModel,
  updateProvider,
  updateSkill,
  updateSkillCollection,
} from "@app/api/rest/agentic";

import { AGENTIC_QUERY_RETRY, pollUnlessErrored } from "./agentic-polling";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const AGENTIC_QUERY_ROOT = "agentic";

export type AgenticQueryGroup =
  | "skills"
  | "skillCollections"
  | "models"
  | "providers"
  | "availableModels"
  | "agents"
  | "agentTestRuns"
  | "plans"
  | "planRuns"
  | "applicationMigrations"
  | "executionPolicy";

export const agenticKeys = {
  all: [AGENTIC_QUERY_ROOT] as const,
  group: (group: AgenticQueryGroup) => [AGENTIC_QUERY_ROOT, group] as const,
  list: (group: AgenticQueryGroup, params?: unknown) =>
    [AGENTIC_QUERY_ROOT, group, "list", params ?? null] as const,
  detail: (group: AgenticQueryGroup, id: EntityId) =>
    [AGENTIC_QUERY_ROOT, group, "detail", id] as const,
};

// ---------------------------------------------------------------------------
// Invalidation matrix
// ---------------------------------------------------------------------------

/**
 * For every write: the query groups whose server data the write can change
 * (directly, through server-maintained relationships, or through name
 * cascades on rename).
 */
export const MUTATION_EFFECTS = {
  skill: [
    "skills",
    "skillCollections",
    "agents",
    "plans",
    "planRuns",
    "applicationMigrations",
  ],
  skillCollection: [
    "skillCollections",
    "skills",
    "agents",
    "applicationMigrations",
  ],
  model: ["models", "agents", "plans"],
  provider: ["providers", "availableModels", "models"],
  agent: [
    "agents",
    "skills",
    "skillCollections",
    "plans",
    "planRuns",
    "agentTestRuns",
    "applicationMigrations",
  ],
  agentTestRun: ["agentTestRuns"],
  plan: ["plans", "planRuns", "applicationMigrations"],
  startMigrations: ["applicationMigrations", "planRuns", "plans"],
  runDecision: ["planRuns", "applicationMigrations"],
  executionPolicy: ["executionPolicy", "applicationMigrations", "planRuns"],
} as const satisfies Record<string, readonly AgenticQueryGroup[]>;

export type AgenticMutationKind = keyof typeof MUTATION_EFFECTS;

export const invalidateAgentic = (
  queryClient: QueryClient,
  kind: AgenticMutationKind
) =>
  Promise.all(
    MUTATION_EFFECTS[kind].map((group) =>
      queryClient.invalidateQueries({ queryKey: agenticKeys.group(group) })
    )
  );

// ---------------------------------------------------------------------------
// Shared query policy
// ---------------------------------------------------------------------------

export const isNotFoundError = (error: unknown) =>
  isAxiosError(error) && error.response?.status === 404;

/** Retry transient failures once; never retry a 4xx. */
export const agenticRetry = (failureCount: number, error: unknown) => {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status != null && status >= 400 && status < 500) return false;
  return failureCount < AGENTIC_QUERY_RETRY;
};

/** True for an id the API can be asked about (no `""`, `"NaN"` or `"undefined"`). */
export const isUsableId = (id: EntityId | null | undefined): id is EntityId =>
  id != null &&
  id.trim() !== "" &&
  id !== "NaN" &&
  id !== "undefined" &&
  id !== "null";

const POLL_FAST_MS = 3000;
const POLL_RUN_MS = 5000;
/**
 * While the only active work waits for a human decision nothing changes on
 * its own; keep a slow poll so a decision made elsewhere still shows up.
 */
const POLL_AWAITING_DECISION_MS = 30000;

/** Poll interval for a set of plan runs: fast while one progresses on its own. */
const planRunsPollInterval = (runs: PlanRun[]): number | false => {
  const active = runs.filter(isActivePlanRun);
  if (active.length === 0) return false;
  return active.every((run) => run.status === "AwaitingApproval")
    ? POLL_AWAITING_DECISION_MS
    : POLL_RUN_MS;
};

const hasPendingVerification = (
  items: { verificationStatus: string }[] | undefined
) => (items ?? []).some((item) => item.verificationStatus === "pending");

/** Poll interval for migration views: fast while a run progresses on its own. */
const migrationsPollInterval = (
  map: ApplicationMigrationMap | undefined
): number | false => {
  const active = Object.values(map ?? {}).filter(
    (migration: ApplicationMigrationView) =>
      migration.runPhase != null && !isTerminalRunPhase(migration.runPhase)
  );
  if (active.length === 0) return false;
  return active.every(
    (migration) => migration.intervention === "actionRequired"
  )
    ? POLL_AWAITING_DECISION_MS
    : POLL_FAST_MS;
};

type OnError = (err: AxiosError) => void;

// ---------------------------------------------------------------------------
// Agent test runs
// ---------------------------------------------------------------------------

export const useFetchAgentTestRuns = (agentId?: EntityId) => {
  const { data, isFetching, isInitialLoading, error } = useQuery({
    queryKey: agenticKeys.list("agentTestRuns", { agentId }),
    queryFn: () => getAgentTestRuns(agentId),
    enabled: isUsableId(agentId),
    retry: agenticRetry,
    refetchInterval: (runs, query) =>
      pollUnlessErrored(
        query,
        (runs ?? []).some((run) => !isTerminalRunPhase(run.phase))
          ? POLL_RUN_MS
          : false
      ),
  });
  return {
    agentTestRuns: data || [],
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
  };
};

export const useStartAgentTestRunMutation = (
  onSuccess: (run: AgentTestRun) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startAgentTestRun,
    onSuccess: (run) => {
      invalidateAgentic(queryClient, "agentTestRun");
      onSuccess(run);
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Application migrations
// ---------------------------------------------------------------------------

/**
 * Migration views for the given applications. The query is independent of the
 * inventory: it is disabled (and reports `isLoading: false`) when there are no
 * applications, and its errors never block the application list.
 */
export const useFetchApplicationMigrations = (applicationIds: number[]) => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.list("applicationMigrations", {
      applicationIds: [...applicationIds].sort((a, b) => a - b),
    }),
    queryFn: () => getApplicationMigrations(applicationIds),
    enabled: applicationIds.length > 0,
    retry: agenticRetry,
    keepPreviousData: true,
    refetchInterval: (migrations, query) =>
      pollUnlessErrored(query, migrationsPollInterval(migrations)),
  });
  return {
    migrations: data || {},
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    refetch,
  };
};

export const useResolveApplicationMigrationRequestMutation = (
  onSuccess: (migration: ApplicationMigrationView) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveApplicationMigrationRequest,
    onSuccess: (migration) => {
      invalidateAgentic(queryClient, "runDecision");
      onSuccess(migration);
    },
    onError,
  });
};

export const useStartApplicationMigrationsMutation = (
  onSuccess: (
    response: StartApplicationMigrationsResponse,
    request: StartApplicationMigrationsRequest
  ) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startApplicationMigrations,
    onSuccess: (response, request) => {
      invalidateAgentic(queryClient, "startMigrations");
      onSuccess(response, request);
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** `enabled: false` skips the request (for example where agentic is off). */
export interface AgenticListQueryOptions {
  enabled?: boolean;
}

export const useFetchSkills = ({
  enabled = true,
}: AgenticListQueryOptions = {}) => {
  const { data, isFetching, isInitialLoading, isSuccess, error, refetch } =
    useQuery({
      queryKey: agenticKeys.list("skills"),
      queryFn: getSkills,
      enabled,
      retry: agenticRetry,
    });
  return {
    skills: data || [],
    isFetching,
    isLoading: isInitialLoading,
    isSuccess,
    fetchError: error,
    refetch,
  };
};

export const useFetchSkillById = (id: EntityId | undefined) => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.detail("skills", id ?? ""),
    queryFn: () => getSkillById(id ?? ""),
    enabled: isUsableId(id),
    retry: agenticRetry,
  });
  return {
    skill: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
    refetch,
  };
};

export const useCreateSkillMutation = (
  onSuccess: (skill: Skill) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSkill,
    onSuccess: (skill) => {
      invalidateAgentic(queryClient, "skill");
      onSuccess(skill);
    },
    onError,
  });
};

export const useUpdateSkillMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSkill,
    onSuccess: () => {
      invalidateAgentic(queryClient, "skill");
      onSuccess();
    },
    onError,
  });
};

export const useDeleteSkillMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSkill,
    onSuccess: (_data, skillId) => {
      queryClient.removeQueries({
        queryKey: agenticKeys.detail("skills", skillId),
      });
      invalidateAgentic(queryClient, "skill");
      onSuccess();
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Skill collections
// ---------------------------------------------------------------------------

export const useFetchSkillCollections = () => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.list("skillCollections"),
    queryFn: getSkillCollections,
    retry: agenticRetry,
  });
  return {
    skillCollections: data || [],
    isLoading: isInitialLoading,
    isFetching,
    fetchError: error,
    refetch,
  };
};

export const useFetchSkillCollectionById = (id: EntityId | undefined) => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.detail("skillCollections", id ?? ""),
    queryFn: () => getSkillCollectionById(id ?? ""),
    enabled: isUsableId(id),
    retry: agenticRetry,
  });
  return {
    skillCollection: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
    refetch,
  };
};

export const useCreateSkillCollectionMutation = (
  onSuccess: (collection: SkillCollection) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSkillCollection,
    onSuccess: (collection) => {
      invalidateAgentic(queryClient, "skillCollection");
      onSuccess(collection);
    },
    onError,
  });
};

export const useUpdateSkillCollectionMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSkillCollection,
    onSuccess: () => {
      invalidateAgentic(queryClient, "skillCollection");
      onSuccess();
    },
    onError,
  });
};

export const useDeleteSkillCollectionMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSkillCollection,
    onSuccess: (_data, collectionId) => {
      queryClient.removeQueries({
        queryKey: agenticKeys.detail("skillCollections", collectionId),
      });
      invalidateAgentic(queryClient, "skillCollection");
      onSuccess();
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Models (the code calls them gateways, after the controller CRD)
// ---------------------------------------------------------------------------

export const useFetchGateways = () => {
  const { data, isFetching, isInitialLoading, isSuccess, error, refetch } =
    useQuery({
      queryKey: agenticKeys.list("models"),
      queryFn: getModels,
      retry: agenticRetry,
      refetchInterval: (models, query) =>
        pollUnlessErrored(
          query,
          hasPendingVerification(models) ? POLL_FAST_MS : false
        ),
    });
  return {
    gateways: data || [],
    isFetching,
    isLoading: isInitialLoading,
    isSuccess,
    fetchError: error,
    refetch,
  };
};

export const useCreateGatewayMutation = (
  onSuccess: (model: ModelProjection) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createModel,
    onSuccess: (model) => {
      invalidateAgentic(queryClient, "model");
      onSuccess(model);
    },
    onError,
  });
};

export const useUpdateGatewayMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateModel,
    onSuccess: () => {
      invalidateAgentic(queryClient, "model");
      onSuccess();
    },
    onError,
  });
};

export const useDeleteGatewayMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteModel,
    onSuccess: () => {
      invalidateAgentic(queryClient, "model");
      onSuccess();
    },
    onError,
  });
};

export const useSetDefaultModelMutation = (
  onSuccess: (model: ModelProjection) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setDefaultModel,
    onSuccess: (model) => {
      invalidateAgentic(queryClient, "model");
      onSuccess(model);
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const useFetchProviders = () => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.list("providers"),
    queryFn: getProviders,
    retry: agenticRetry,
    refetchInterval: (providers, query) =>
      pollUnlessErrored(
        query,
        hasPendingVerification(providers) ? POLL_FAST_MS : false
      ),
  });
  return {
    providers: data || [],
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    refetch,
  };
};

export const useCreateProviderMutation = (
  onSuccess: (provider: Provider) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProvider,
    onSuccess: (provider) => {
      invalidateAgentic(queryClient, "provider");
      onSuccess(provider);
    },
    onError,
  });
};

export const useUpdateProviderMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProvider,
    onSuccess: () => {
      invalidateAgentic(queryClient, "provider");
      onSuccess();
    },
    onError,
  });
};

export const useDeleteProviderMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProvider,
    onSuccess: () => {
      invalidateAgentic(queryClient, "provider");
      onSuccess();
    },
    onError,
  });
};

export const useFetchAvailableModels = (providerId: EntityId | undefined) => {
  const { data, isFetching, error } = useQuery({
    queryKey: agenticKeys.detail("availableModels", providerId ?? ""),
    queryFn: () => getAvailableModels(providerId ?? ""),
    enabled: isUsableId(providerId),
    retry: agenticRetry,
  });
  return {
    availableModels: data || [],
    isFetching,
    fetchError: error,
  };
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const useFetchAgents = () => {
  const { data, isFetching, isInitialLoading, isSuccess, error, refetch } =
    useQuery({
      queryKey: agenticKeys.list("agents"),
      queryFn: getAgents,
      retry: agenticRetry,
    });
  return {
    agents: data || [],
    isFetching,
    isLoading: isInitialLoading,
    isSuccess,
    fetchError: error,
    refetch,
  };
};

export const useFetchAgentById = (id: EntityId | undefined) => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.detail("agents", id ?? ""),
    queryFn: () => getAgentById(id ?? ""),
    enabled: isUsableId(id),
    retry: agenticRetry,
  });
  return {
    agent: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
    refetch,
  };
};

export const useCreateAgentMutation = (
  onSuccess: (agent: Awaited<ReturnType<typeof createAgent>>) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAgent,
    onSuccess: (agent) => {
      invalidateAgentic(queryClient, "agent");
      onSuccess(agent);
    },
    onError,
  });
};

export const useUpdateAgentMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAgent,
    onSuccess: () => {
      invalidateAgentic(queryClient, "agent");
      onSuccess();
    },
    onError,
  });
};

export const useDeleteAgentMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAgent,
    onSuccess: (_data, agentId) => {
      queryClient.removeQueries({
        queryKey: agenticKeys.detail("agents", agentId),
      });
      invalidateAgentic(queryClient, "agent");
      onSuccess();
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const useFetchMigrationPlans = ({
  enabled = true,
}: AgenticListQueryOptions = {}) => {
  const { data, isFetching, isInitialLoading, isSuccess, error, refetch } =
    useQuery({
      queryKey: agenticKeys.list("plans"),
      queryFn: getMigrationPlans,
      enabled,
      retry: agenticRetry,
    });
  return {
    migrationPlans: data || [],
    isFetching,
    isLoading: isInitialLoading,
    isSuccess,
    fetchError: error,
    refetch,
  };
};

export const useFetchMigrationPlanById = (id: EntityId | undefined) => {
  const { data, isFetching, isInitialLoading, error } = useQuery({
    queryKey: agenticKeys.detail("plans", id ?? ""),
    queryFn: () => getMigrationPlanById(id ?? ""),
    enabled: isUsableId(id),
    retry: agenticRetry,
  });
  return {
    migrationPlan: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
  };
};

export const useCreateMigrationPlanMutation = (
  onSuccess: (plan: MigrationPlan) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMigrationPlan,
    onSuccess: (plan) => {
      invalidateAgentic(queryClient, "plan");
      onSuccess(plan);
    },
    onError,
  });
};

export const useUpdateMigrationPlanMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMigrationPlan,
    onSuccess: () => {
      invalidateAgentic(queryClient, "plan");
      onSuccess();
    },
    onError,
  });
};

export const useDeleteMigrationPlanMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMigrationPlan,
    onSuccess: (_data, planId) => {
      queryClient.removeQueries({
        queryKey: agenticKeys.detail("plans", planId),
      });
      invalidateAgentic(queryClient, "plan");
      onSuccess();
    },
    onError,
  });
};

export const useAssignPlanToTargetProfileMutation = (
  onSuccess: () => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assignPlanToTargetProfile,
    onSuccess: () => {
      invalidateAgentic(queryClient, "plan");
      onSuccess();
    },
    onError,
  });
};

// ---------------------------------------------------------------------------
// Plan runs
// ---------------------------------------------------------------------------

export const useFetchPlanRuns = (planId?: EntityId) => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.list("planRuns", { planId }),
    queryFn: () => getPlanRuns(planId),
    retry: agenticRetry,
    refetchInterval: (runs, query) =>
      pollUnlessErrored(query, planRunsPollInterval(runs ?? [])),
  });
  return {
    planRuns: data || [],
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    refetch,
  };
};

export const useFetchPlanRun = (runId: EntityId | undefined) => {
  const { data, isFetching, isInitialLoading, error, refetch } = useQuery({
    queryKey: agenticKeys.detail("planRuns", runId ?? ""),
    queryFn: () => getPlanRunById(runId ?? ""),
    enabled: isUsableId(runId),
    retry: agenticRetry,
    refetchInterval: (run: PlanRun | undefined, query) =>
      pollUnlessErrored(query, planRunsPollInterval(run ? [run] : [])),
  });
  return {
    planRun: data,
    isFetching,
    isLoading: isInitialLoading,
    fetchError: error,
    isNotFound: isNotFoundError(error),
    refetch,
  };
};

/**
 * Approves the awaiting stage of a plan run. The server advances the run (next
 * stage, or completion after the last stage); the hook only refreshes.
 */
export const useApproveStageMutation = (
  onSuccess: (run: PlanRun) => void,
  onError: OnError
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveStageRun,
    onSuccess: (run) => {
      queryClient.setQueryData(agenticKeys.detail("planRuns", run.id), run);
      invalidateAgentic(queryClient, "runDecision");
      onSuccess(run);
    },
    onError,
  });
};
