import axios from "axios";

import { RenameNotSupportedError } from "@app/agentic/adapters";
import type * as Crd from "@app/api/agentic/contract";

import * as prototypeApi from "./agentic";
import * as hubApi from "./agentic-hub";

jest.mock("axios");

const mockedAxios = jest.mocked(axios);

// Compile-time check: every function of the Hub module is a drop-in for the
// prototype function of the same name (same parameters, same resolved type).
const dropIn: Pick<typeof prototypeApi, keyof typeof hubApi> = hubApi;

const BASE = "/hub/agentic";

const agent: Crd.AgentResource = {
  metadata: { name: "migrate", labels: { "konveyor.io/managed": "true" } },
  spec: {
    image: "quay.io/konveyor/agent-java:latest",
    prompt: "Migrate.",
    gateways: [{ ref: "claude" }],
    skillCards: [{ ref: "ejb-to-cdi" }],
    execution: { maxTurns: 80 },
  },
};

const otherAgent: Crd.AgentResource = {
  metadata: { name: "verify" },
  spec: { image: "quay.io/konveyor/agent-java:latest" },
};

const card: Crd.SkillCard = {
  metadata: { name: "ejb-to-cdi" },
  spec: {
    displayName: "EJB to CDI",
    inline: "---\nname: ejb-to-cdi\ndescription: d\n---\n# Steps",
    type: "rule",
  },
};

const collection: Crd.SkillCollection = {
  metadata: { name: "java" },
  spec: {
    skills: [
      { name: "alias", skillCardRef: "ejb-to-cdi" },
      { name: "bundle", source: "https://git.example.com/skills" },
    ],
  },
  status: { resolvedSkills: ["ejb-to-cdi", "java-bundle"] },
};

const workflowRun: Crd.AgentWorkflowRun = {
  metadata: {
    name: "ui-abc",
    labels: { "konveyor.io/application": "12" },
  },
  spec: { workflowRef: "java-ee-to-quarkus" },
  status: {
    phase: "Running",
    stages: [{ name: "plan", phase: "Running", agentRunName: "ui-abc-plan" }],
  },
};

const stageRun: Crd.AgentRun = {
  metadata: {
    name: "ui-abc-plan",
    labels: { "konveyor.io/agentworkflowrun": "ui-abc" },
  },
  spec: { agentRef: "migrate" },
  status: { phase: "Running", startTime: "2026-11-09T10:00:00Z" },
};

const testRun: Crd.AgentRun = {
  metadata: { name: "ui-test", labels: { "konveyor.io/application": "7" } },
  spec: { agentRef: "migrate", instructions: "Try it" },
};

const responses: Record<string, unknown> = {
  [`${BASE}/agents`]: [agent, otherAgent],
  [`${BASE}/agents/migrate`]: agent,
  [`${BASE}/skills`]: [card],
  [`${BASE}/skills/ejb-to-cdi`]: card,
  [`${BASE}/skillcollections/java`]: collection,
  [`${BASE}/workflowruns`]: [
    workflowRun,
    { ...workflowRun, spec: { workflowRef: "other" } },
  ],
  [`${BASE}/workflowruns/ui-abc`]: workflowRun,
  [`${BASE}/agentruns`]: [stageRun, testRun],
  [`${BASE}/agentruns/ui-abc-plan`]: stageRun,
};

const bodyOf = (call: unknown[]) => call[1];

beforeEach(() => {
  jest.clearAllMocks();
  mockedAxios.get.mockImplementation((url: string) =>
    url in responses
      ? Promise.resolve({ data: responses[url] })
      : Promise.reject(new Error(`unexpected GET ${url}`))
  );
  mockedAxios.put.mockResolvedValue({ data: "" });
  mockedAxios.post.mockImplementation((url: string, body: unknown) =>
    Promise.resolve({
      data: {
        ...(typeof body === "object" ? body : {}),
        metadata: { name: url.endsWith("runs") ? "ui-new" : "created" },
      },
    })
  );
});

describe("Hub-backed agentic REST reference", () => {
  it("is a drop-in for the prototype functions it covers", () => {
    expect(Object.keys(dropIn).sort()).toEqual(Object.keys(hubApi).sort());
  });

  it("joins Agents into Skills and Skill names into Agents", async () => {
    const [skill] = await hubApi.getSkills();
    expect(skill).toMatchObject({
      id: "ejb-to-cdi",
      name: "EJB to CDI",
      associations: [
        { scope: "agent", resource: { id: "migrate", name: "migrate" } },
      ],
    });
    const [migrate] = await hubApi.getAgents();
    expect(migrate.skills).toEqual([{ id: "ejb-to-cdi", name: "EJB to CDI" }]);
  });

  it("updates a Skill over its current spec and moves Agent associations", async () => {
    await hubApi.updateSkill({
      id: "ejb-to-cdi",
      name: "EJB to CDI (v2)",
      description: "",
      sourceType: "inline",
      content: "---\nname: ejb-to-cdi\ndescription: d\n---\n# v2",
      associations: [{ scope: "agent", resource: { id: "verify" } }],
    });
    expect(mockedAxios.put.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/skills/ejb-to-cdi`,
      `${BASE}/agents/migrate`,
      `${BASE}/agents/verify`,
    ]);
    const [cardPut, removed, added] = mockedAxios.put.mock.calls.map(bodyOf);
    expect(cardPut).toMatchObject({
      spec: { displayName: "EJB to CDI (v2)", type: "rule" },
    });
    expect(removed).toMatchObject({
      spec: { skillCards: [], execution: { maxTurns: 80 } },
    });
    expect(added).toMatchObject({
      spec: { skillCards: [{ ref: "ejb-to-cdi" }] },
    });
  });

  it("refuses Skill associations the Hub cannot store", async () => {
    await expect(
      hubApi.createSkill({
        name: "New",
        description: "",
        sourceType: "inline",
        content: "---\nname: new-skill\ndescription: d\n---\n",
        associations: [{ scope: "archetype", resource: { id: 3 } }],
      })
    ).rejects.toThrow("no Hub backend");
    // The card is named after its SKILL.md frontmatter.
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${BASE}/skills`,
      expect.objectContaining({ metadata: { name: "new-skill" } })
    );
  });

  it("rejects a rename before writing", async () => {
    await expect(
      hubApi.updateAgent({
        id: "migrate",
        name: "Renamed",
        description: "",
        model: { id: "claude" },
        skills: [],
        skillCollections: [],
        prompt: "",
        capabilities: [],
        parameters: [],
      })
    ).rejects.toThrow(RenameNotSupportedError);
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });

  it("saves a collection without duplicating controller-owned members", async () => {
    const current = await hubApi.getSkillCollectionById("java");
    await hubApi.updateSkillCollection({
      id: "java",
      name: current.name,
      description: "",
      skills: current.skills.map(({ id }) => ({ id })),
    });
    expect(mockedAxios.put).toHaveBeenCalledWith(
      `${BASE}/skillcollections/java`,
      { metadata: { name: "java" }, spec: collection.spec }
    );
  });

  it("lists test runs without workflow stage runs", async () => {
    expect(await hubApi.getAgentTestRuns("migrate")).toEqual([
      expect.objectContaining({
        id: "ui-test",
        application: { id: 7, name: "#7" },
      }),
    ]);
  });

  it("starts a test run with its Model and target branch", async () => {
    await hubApi.startAgentTestRun({
      agentId: "migrate",
      applicationId: 7,
      task: "Try it",
      modelId: "claude",
      targetBranch: "konveyor/migration-1",
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(`${BASE}/agentruns`, {
      metadata: {
        generateName: "ui-",
        labels: { "konveyor.io/application": "7" },
      },
      spec: {
        agentRef: "migrate",
        instructions: "Try it",
        gateway: "claude",
        env: [
          { name: "APP_ID", value: "7" },
          { name: "TARGET_BRANCH", value: "konveyor/migration-1" },
        ],
      },
    });
  });

  it("filters plan runs by Plan and fills stage timing from the AgentRuns", async () => {
    const runs = await hubApi.getPlanRuns("java-ee-to-quarkus");
    expect(runs).toHaveLength(1);
    expect(runs[0].stageRuns[0]).toMatchObject({
      stageId: "plan",
      status: "Running",
      startedAt: "2026-11-09T10:00:00Z",
    });
    expect((await hubApi.getPlanRunById("ui-abc")).applications).toEqual([
      { id: 12, name: "#12" },
    ]);
  });

  it("starts one workflow run per application", async () => {
    const response = await hubApi.startApplicationMigrations({
      applicationIds: [12, 7],
      planSelection: "single",
      planId: "java-ee-to-quarkus",
      targetBranch: "konveyor/migration-1",
      modelId: "claude",
    });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(bodyOf(mockedAxios.post.mock.calls[1])).toMatchObject({
      metadata: { labels: { "konveyor.io/application": "7" } },
      spec: { workflowRef: "java-ee-to-quarkus", gateway: "claude" },
    });
    expect(response.planRuns).toHaveLength(2);
  });
});
