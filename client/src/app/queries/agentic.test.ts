import { QueryClient } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { rest } from "msw";

import { act, renderHook, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  AgenticQueryGroup,
  MUTATION_EFFECTS,
  agenticKeys,
  agenticRetry,
  invalidateAgentic,
  isNotFoundError,
  isUsableId,
  useUpdateApplicationSkillsMutation,
  useUpdateArchetypeSkillsMutation,
  useUpdateSkillCollectionAgentsMutation,
  useUpdateSkillCollectionMembershipsMutation,
  useUpdateTargetProfileSkillsMutation,
} from "./agentic";

const axiosError = (status: number) =>
  new AxiosError("failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

describe("agentic query policy", () => {
  it("only enables detail queries for usable ids", () => {
    expect(isUsableId("2")).toBe(true);
    expect(isUsableId("java-ee-to-quarkus")).toBe(true);
    [undefined, null, "", " ", "NaN", "undefined", "null"].forEach((id) =>
      expect(isUsableId(id)).toBe(false)
    );
  });

  it("never retries a 4xx and retries a 5xx once", () => {
    expect(agenticRetry(0, axiosError(404))).toBe(false);
    expect(agenticRetry(0, axiosError(409))).toBe(false);
    expect(agenticRetry(0, axiosError(503))).toBe(true);
    expect(agenticRetry(1, axiosError(503))).toBe(false);
  });

  it("tells not-found apart from other errors", () => {
    expect(isNotFoundError(axiosError(404))).toBe(true);
    expect(isNotFoundError(axiosError(503))).toBe(false);
    expect(isNotFoundError(new Error("x"))).toBe(false);
  });
});

describe("invalidation matrix", () => {
  const groups: AgenticQueryGroup[] = [
    "skills",
    "skillCollections",
    "models",
    "providers",
    "availableModels",
    "agents",
    "agentTestRuns",
    "plans",
    "planRuns",
    "applicationMigrations",
    "executionPolicy",
  ];

  const seed = () => {
    const client = new QueryClient();
    groups.forEach((group) => {
      client.setQueryData(agenticKeys.list(group), []);
      client.setQueryData(agenticKeys.detail(group, "1"), {});
    });
    return client;
  };

  const invalidated = (client: QueryClient) =>
    groups.filter(
      (group) =>
        client.getQueryState(agenticKeys.list(group))?.isInvalidated &&
        client.getQueryState(agenticKeys.detail(group, "1"))?.isInvalidated
    );

  it.each(Object.keys(MUTATION_EFFECTS) as (keyof typeof MUTATION_EFFECTS)[])(
    "%s invalidates exactly its dependent groups (lists and details)",
    async (kind) => {
      const client = seed();
      await invalidateAgentic(client, kind);
      expect(invalidated(client).sort()).toEqual(
        [...MUTATION_EFFECTS[kind]].sort()
      );
    }
  );

  it("refreshes everything a Skill write can change", () => {
    expect(MUTATION_EFFECTS.skill).toEqual(
      expect.arrayContaining([
        "skills",
        "skillCollections",
        "agents",
        "plans",
        "applicationMigrations",
      ])
    );
    expect(MUTATION_EFFECTS.agent).toContain("skills");
    expect(MUTATION_EFFECTS.startMigrations).toContain("planRuns");
    expect(MUTATION_EFFECTS.runDecision).toContain("applicationMigrations");
    expect(MUTATION_EFFECTS.agentTestRun).toContain("agentTestRuns");
  });
});

describe("association writes", () => {
  // A fan-out that fails part way may have written some objects already, so
  // these hooks refresh on error too.
  const onSuccess = jest.fn();
  const onError = jest.fn();
  beforeEach(() => jest.clearAllMocks());

  const hooks = {
    useArchetypeSkillsWrite: () => {
      const mutation = useUpdateArchetypeSkillsMutation(onSuccess, onError);
      return () => mutation.mutate({ archetypeId: 1, skills: [] });
    },
    useTargetProfileSkillsWrite: () => {
      const mutation = useUpdateTargetProfileSkillsMutation(onSuccess, onError);
      return () =>
        mutation.mutate({ archetypeId: 1, targetProfileId: 1, skills: [] });
    },
    useApplicationSkillsWrite: () => {
      const mutation = useUpdateApplicationSkillsMutation(onSuccess, onError);
      return () => mutation.mutate({ applicationId: 1, skills: [] });
    },
    useSkillCollectionMembershipsWrite: () => {
      const mutation = useUpdateSkillCollectionMembershipsMutation(
        onSuccess,
        onError
      );
      return () => mutation.mutate({ skillId: "1", collections: [] });
    },
    useSkillCollectionAgentsWrite: () => {
      const mutation = useUpdateSkillCollectionAgentsMutation(
        onSuccess,
        onError
      );
      return () => mutation.mutate({ collectionId: "1", agents: [] });
    },
  };

  it.each(Object.keys(hooks) as (keyof typeof hooks)[])(
    "%s refreshes skills, collections and agents after a failed write",
    async (name) => {
      server.use(
        rest.put("*", (_req, res, ctx) =>
          res(ctx.status(500), ctx.json({ message: "Partly written." }))
        )
      );
      const queryClient = new QueryClient();
      const groups: AgenticQueryGroup[] = [
        "skills",
        "skillCollections",
        "agents",
      ];
      groups.forEach((group) =>
        queryClient.setQueryData(agenticKeys.list(group), [])
      );
      const { result } = renderHook(hooks[name], { queryClient });

      act(() => result.current());

      await waitFor(() => expect(onError).toHaveBeenCalled());
      expect(onSuccess).not.toHaveBeenCalled();
      await waitFor(() =>
        groups.forEach((group) =>
          expect(
            queryClient.getQueryState(agenticKeys.list(group))?.isInvalidated
          ).toBe(true)
        )
      );
    }
  );
});
