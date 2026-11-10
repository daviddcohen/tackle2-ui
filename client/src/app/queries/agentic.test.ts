import { QueryClient } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";

import {
  AgenticQueryGroup,
  MUTATION_EFFECTS,
  agenticKeys,
  agenticRetry,
  invalidateAgentic,
  isNotFoundError,
  isUsableId,
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

  it("refreshes everything a Skill write can change (F2)", () => {
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
