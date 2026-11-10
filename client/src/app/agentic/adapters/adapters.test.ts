import type {
  AgentResource,
  AgentRun,
  AgentWorkflow,
  AgentWorkflowRun,
  Gateway,
  SkillCard,
  SkillCollection,
} from "@app/api/agentic/contract";

import {
  RenameNotSupportedError,
  WORKFLOW_RUN_LABEL,
  assertNotRenamed,
  controllerOwnedSkills,
  isAgentTestRun,
  toAgent,
  toAgentSpec,
  toAgentTestRun,
  toCreateRunInput,
  toGatewaySpec,
  toMigrationPlan,
  toModel,
  toNameIndex,
  toNewResourceName,
  toPlanRun,
  toResourceName,
  toSkill,
  toSkillCardSpec,
  toSkillCollection,
  toSkillCollectionSpec,
  toStartResponse,
  toVerificationStatus,
  toWorkflowRunInputs,
  toWorkflowSpec,
} from "./index";

// ---------------------------------------------------------------------------
// Fixtures: konveyor.io/v1alpha1 objects as the Hub returns them
// (shapes from api/agentic/contract.ts; names follow api/rest/agent-runs.test.ts)
// ---------------------------------------------------------------------------

const created = "2026-11-02T09:15:00Z";

const gateway: Gateway = {
  apiVersion: "konveyor.io/v1alpha1",
  kind: "Gateway",
  metadata: { name: "claude-sonnet", creationTimestamp: created },
  spec: {
    provider: "anthropic",
    endpoint: "https://api.anthropic.com",
    credentialRef: { secretName: "anthropic-credentials", key: "api-key" },
    model: { name: "claude-sonnet-4-6", contextWindow: 200000, tier: "large" },
  },
  status: {
    observedGeneration: 1,
    connectionVerified: true,
    conditions: [
      {
        type: "Ready",
        status: "True",
        reason: "ConnectionVerified",
        message: "Endpoint https://api.anthropic.com is reachable (HTTP 200)",
        lastTransitionTime: "2026-11-02T09:16:00Z",
      },
    ],
  },
};

const withReady = (
  status: "True" | "False",
  reason: string,
  message = ""
): Gateway => ({
  ...gateway,
  status: {
    connectionVerified: false,
    conditions: [{ type: "Ready", status, reason, message }],
  },
});

const agent: AgentResource = {
  apiVersion: "konveyor.io/v1alpha1",
  kind: "Agent",
  metadata: {
    name: "migrate",
    creationTimestamp: created,
    labels: { "konveyor.io/managed": "true" },
  },
  spec: {
    image: "ghcr.io/ibolton336/agent-java:demo",
    prompt: "You migrate Java EE applications to Quarkus.",
    gateways: [{ ref: "claude-sonnet" }, { ref: "gpt-4o" }],
    skillCards: [{ ref: "ejb-to-cdi" }],
    skillCollections: [{ ref: "quarkus-patterns" }],
    params: [
      {
        name: "dry_run",
        type: "boolean",
        description: "Plan only",
        default: "false",
      },
      { name: "attempts", type: "number", required: true },
    ],
    execution: { maxTurns: 80 },
    gitConfig: { userName: "Konveyor", userEmail: "bot@konveyor.io" },
  },
  status: {
    conditions: [
      { type: "Ready", status: "True", reason: "AllDependenciesReady" },
    ],
  },
};

const inlineCard: SkillCard = {
  metadata: { name: "ejb-to-cdi", creationTimestamp: created },
  spec: {
    displayName: "EJB to CDI conversion patterns",
    description: "Replace stateless EJBs with CDI beans.",
    inline: "---\nname: ejb-to-cdi\ndescription: Replace EJBs\n---\n# Steps",
    type: "skill",
    tags: ["java"],
  },
  status: { deliveryMode: "inline" },
};

const gitCard: SkillCard = {
  metadata: { name: "jakarta-ee" },
  spec: {
    source: "https://github.com/konveyor/rulesets",
    ref: "main",
    subPath: "default/generated/jakarta-ee",
  },
};

const imageCard: SkillCard = {
  metadata: { name: "quarkus-skill" },
  spec: { image: "quay.io/konveyor/skills:latest", subPath: "quarkus" },
};

const collection: SkillCollection = {
  metadata: { name: "quarkus-patterns" },
  spec: {
    skills: [
      { name: "ejb-to-cdi", skillCardRef: "ejb-to-cdi" },
      { name: "panache", source: "https://git.example.com/skills", ref: "v1" },
    ],
  },
  status: { resolvedSkills: ["quarkus-patterns-panache", "ejb-to-cdi"] },
};

const workflow: AgentWorkflow = {
  apiVersion: "konveyor.io/v1alpha1",
  kind: "AgentWorkflow",
  metadata: { name: "migrate-app", creationTimestamp: created },
  spec: {
    guide: "Migrate one application per run.",
    params: [{ name: "application_name", type: "string" }],
    stages: [
      { name: "assess", agentRef: "analyzer", instructions: "Assess the app." },
      {
        name: "migrate",
        agentRef: "migrate",
        instructions: "Apply the changes.",
        execution: { mode: "approve", maxTurns: 40 },
      },
    ],
  },
};

const stageRun = (name: string, phase: AgentRun["status"]): AgentRun => ({
  metadata: {
    name,
    labels: {
      [WORKFLOW_RUN_LABEL]: "ui-x7k2p",
      "konveyor.io/application": "12",
    },
  },
  spec: { agentRef: name.endsWith("assess") ? "analyzer" : "migrate" },
  status: phase,
});

const workflowRun: AgentWorkflowRun = {
  metadata: {
    name: "ui-x7k2p",
    creationTimestamp: created,
    labels: { "konveyor.io/application": "12" },
  },
  spec: {
    workflowRef: "migrate-app",
    env: [
      { name: "APP_ID", value: "12" },
      { name: "TARGET_BRANCH", value: "konveyor/migration-1762074900" },
      { name: "HUB_BASE_URL", value: "http://tackle-hub:8080" },
    ],
  },
  status: {
    phase: "Running",
    currentStage: "migrate",
    startTime: "2026-11-02T09:20:00Z",
    stages: [
      {
        name: "assess",
        phase: "Succeeded",
        agentRunName: "ui-x7k2p-assess",
        agentRef: "analyzer",
        instructions: "Assess the app.",
      },
      {
        name: "migrate",
        phase: "Running",
        agentRunName: "ui-x7k2p-migrate",
        agentRef: "migrate",
        instructions: "Apply the changes.",
        execution: { mode: "approve" },
      },
    ],
  },
};

const agentRuns: AgentRun[] = [
  stageRun("ui-x7k2p-assess", {
    phase: "Succeeded",
    startTime: "2026-11-02T09:20:05Z",
    completionTime: "2026-11-02T09:24:00Z",
    terminationData: { outcome: "succeeded", stopReason: "end_turn" },
  }),
  stageRun("ui-x7k2p-migrate", {
    phase: "Running",
    startTime: "2026-11-02T09:24:10Z",
  }),
];

// ---------------------------------------------------------------------------

describe("common", () => {
  it("derives Kubernetes resource names from display text", () => {
    expect(toResourceName("Java EE to Quarkus")).toBe("java-ee-to-quarkus");
    expect(toResourceName("  Ünïcode / Café  ")).toBe("unicode-cafe");
    expect(toResourceName("!!!")).toBe("");
    expect(toResourceName("a".repeat(40) + " " + "b".repeat(40))).toHaveLength(
      63
    );
    expect(toResourceName("abc def", 4)).toBe("abc");
  });
});

describe("Gateway -> Model", () => {
  it("maps a verified Gateway", () => {
    expect(toModel(gateway)).toEqual({
      id: "claude-sonnet",
      name: "claude-sonnet",
      description: undefined,
      provider: { id: "anthropic", name: "anthropic" },
      model: "claude-sonnet-4-6",
      endpoint: "https://api.anthropic.com",
      credential: undefined,
      verificationStatus: "verified",
      lastVerified: "2026-11-02T09:16:00Z",
      statusReason:
        "Endpoint https://api.anthropic.com is reachable (HTTP 200)",
      isOrganizationDefault: false,
    });
  });

  it("derives the verification state from the Ready condition", () => {
    expect(toVerificationStatus({ ...gateway, status: undefined })).toBe(
      "pending"
    );
    expect(toVerificationStatus(withReady("False", "Verifying"))).toBe(
      "pending"
    );
    expect(
      toVerificationStatus(withReady("False", "AuthenticationFailed"))
    ).toBe("unreachable");
    expect(
      toVerificationStatus(withReady("False", "CredentialSecretNotFound"))
    ).toBe("unreachable");
    expect(toVerificationStatus(withReady("True", "VerificationSkipped"))).toBe(
      "verified"
    );
    expect(
      toModel(withReady("False", "Verifying")).lastVerified
    ).toBeUndefined();
  });

  it("writes a spec that keeps the credential and context window", () => {
    expect(
      toGatewaySpec(
        {
          name: "claude-sonnet",
          description: "dropped",
          provider: { id: "anthropic" },
          model: "claude-opus-4-1",
          credential: { id: 601 },
        },
        gateway.spec
      )
    ).toEqual({
      provider: "anthropic",
      endpoint: "https://api.anthropic.com",
      credentialRef: { secretName: "anthropic-credentials", key: "api-key" },
      model: { name: "claude-opus-4-1", contextWindow: 200000, tier: "large" },
    });
  });

  it("requires an endpoint", () => {
    expect(() =>
      toGatewaySpec(
        { name: "m", provider: { id: "openai" }, model: "gpt-4o" },
        {
          credentialRef: { secretName: "openai" },
          model: { contextWindow: 128000 },
        }
      )
    ).toThrow("endpoint");
  });
});

describe("Agent", () => {
  const skillNames = toNameIndex([toSkill(inlineCard)]);

  it("maps an Agent CRD with documented defaults", () => {
    expect(toAgent(agent, skillNames)).toEqual({
      id: "migrate",
      name: "migrate",
      description: "",
      model: { id: "claude-sonnet", name: "claude-sonnet" },
      skills: [{ id: "ejb-to-cdi", name: "EJB to CDI conversion patterns" }],
      skillCollections: [{ id: "quarkus-patterns", name: "quarkus-patterns" }],
      prompt: "You migrate Java EE applications to Quarkus.",
      capabilities: [],
      parameters: [
        {
          name: "dry_run",
          type: "boolean",
          description: "Plan only",
          defaultValue: "false",
        },
        {
          name: "attempts",
          type: "number",
          description: "",
          defaultValue: undefined,
        },
      ],
      operatorManaged: false,
      createTime: created,
      updateTime: undefined,
    });
  });

  it("maps an Agent without gateways to an empty Model ref", () => {
    const bare: AgentResource = {
      metadata: { name: "bare" },
      spec: { image: "agent:1" },
    };
    expect(toAgent(bare)).toMatchObject({
      model: { id: "", name: "" },
      skills: [],
      parameters: [],
      prompt: "",
    });
  });

  it("writes a spec over the current one without losing CRD-only fields", () => {
    const spec = toAgentSpec(
      {
        name: "migrate",
        description: "dropped",
        model: { id: "granite" },
        skills: [{ id: "jakarta-ee" }],
        skillCollections: [],
        prompt: "New prompt",
        capabilities: ["dropped"],
        parameters: [
          {
            name: "attempts",
            type: "number",
            description: "",
            defaultValue: "3",
          },
        ],
      },
      agent.spec
    );
    expect(spec).toEqual({
      image: "ghcr.io/ibolton336/agent-java:demo",
      prompt: "New prompt",
      gateways: [{ ref: "granite" }, { ref: "gpt-4o" }],
      skillCards: [{ ref: "jakarta-ee" }],
      skillCollections: [],
      params: [
        {
          name: "attempts",
          type: "number",
          description: undefined,
          // `required` + a default is rejected by the controller's CEL rule:
          // the default makes the parameter optional.
          default: "3",
          required: undefined,
        },
      ],
      execution: { maxTurns: 80 },
      gitConfig: { userName: "Konveyor", userEmail: "bot@konveyor.io" },
    });
  });

  it("does not duplicate a gateway the request moves to the front", () => {
    const spec = toAgentSpec(
      {
        name: "migrate",
        description: "",
        model: { id: "gpt-4o" },
        skills: [],
        skillCollections: [],
        prompt: "",
        capabilities: [],
        parameters: [],
      },
      agent.spec
    );
    expect(spec.gateways).toEqual([{ ref: "gpt-4o" }]);
  });
});

describe("AgentRun -> Agent test run", () => {
  const testRun: AgentRun = {
    metadata: {
      name: "ui-abc12",
      creationTimestamp: created,
      labels: { "konveyor.io/application": "7" },
    },
    spec: {
      agentRef: "migrate",
      instructions: "Upgrade to Jakarta EE 10",
      env: [{ name: "APP_ID", value: "7" }],
    },
    status: { phase: "Running", startTime: "2026-11-02T10:00:00Z" },
  };

  it("maps a test run and resolves the application name", () => {
    expect(toAgentTestRun(testRun, new Map([[7, "Partner Portal"]]))).toEqual({
      id: "ui-abc12",
      agent: { id: "migrate", name: "migrate" },
      application: { id: 7, name: "Partner Portal" },
      task: "Upgrade to Jakarta EE 10",
      phase: "Running",
      startedAt: "2026-11-02T10:00:00Z",
    });
  });

  it("falls back to APP_ID, then to an empty application", () => {
    const unlabeled = { ...testRun, metadata: { name: "ui-abc12" } };
    expect(toAgentTestRun(unlabeled).application).toEqual({
      id: 7,
      name: "#7",
    });
    expect(
      toAgentTestRun({ ...unlabeled, spec: { agentRef: "migrate" } })
    ).toMatchObject({ application: { id: 0, name: "" }, phase: "Running" });
  });

  it("tells test runs from workflow stage runs", () => {
    expect(isAgentTestRun(testRun)).toBe(true);
    expect(isAgentTestRun(agentRuns[0])).toBe(false);
  });

  it("builds the createAgentRun input", () => {
    expect(
      toCreateRunInput({ agentId: "migrate", applicationId: 7, task: "Go" })
    ).toEqual({ agentRef: "migrate", applicationRef: "7", instructions: "Go" });
  });
});

describe("SkillCard -> Skill", () => {
  it("maps each source kind", () => {
    expect(toSkill(inlineCard)).toEqual({
      id: "ejb-to-cdi",
      name: "EJB to CDI conversion patterns",
      description: "Replace stateless EJBs with CDI beans.",
      sourceType: "inline",
      content: inlineCard.spec.inline,
      repoUrl: undefined,
      repoBranch: undefined,
      repoPath: undefined,
      imageRef: undefined,
      associations: undefined,
      operatorManaged: false,
      createTime: created,
      updateTime: undefined,
    });
    expect(toSkill(gitCard)).toMatchObject({
      name: "jakarta-ee",
      description: "",
      sourceType: "git",
      repoUrl: "https://github.com/konveyor/rulesets",
      repoBranch: "main",
      repoPath: "default/generated/jakarta-ee",
    });
    expect(toSkill(imageCard)).toMatchObject({
      sourceType: "oci",
      imageRef: "quay.io/konveyor/skills:latest",
      repoPath: undefined,
    });
  });

  it("derives agent associations from Agent.spec.skillCards", () => {
    expect(toSkill(inlineCard, [agent]).associations).toEqual([
      { scope: "agent", resource: { id: "migrate", name: "migrate" } },
    ]);
    expect(toSkill(gitCard, [agent]).associations).toEqual([]);
  });

  it("writes exactly one source and keeps CRD-only fields", () => {
    expect(
      toSkillCardSpec(
        {
          name: "EJB to CDI",
          description: "",
          sourceType: "git",
          repoUrl: "https://git.example.com/skills",
          repoBranch: "",
          repoPath: "/skills/ejb/",
        },
        inlineCard.spec
      )
    ).toEqual({
      type: "skill",
      tags: ["java"],
      version: undefined,
      displayName: "EJB to CDI",
      description: undefined,
      source: "https://git.example.com/skills",
      ref: undefined,
      subPath: "skills/ejb",
    });
  });

  it("keeps an image card's subPath and treats '/' as the repository root", () => {
    expect(
      toSkillCardSpec(
        {
          name: "Quarkus",
          description: "d",
          sourceType: "oci",
          imageRef: "quay.io/konveyor/skills:2",
        },
        imageCard.spec
      )
    ).toMatchObject({ image: "quay.io/konveyor/skills:2", subPath: "quarkus" });
    expect(
      toSkillCardSpec({
        name: "Rules",
        description: "",
        sourceType: "git",
        repoUrl: "https://git.example.com/r",
        repoPath: "/",
      }).subPath
    ).toBeUndefined();
    expect(
      toSkillCardSpec({ name: "x", description: "", sourceType: "inline" })
    ).toMatchObject({ inline: "" });
  });
});

describe("SkillCollection", () => {
  it("lists skillCardRef members and resolved cards once", () => {
    expect(
      toSkillCollection(collection, toNameIndex([toSkill(inlineCard)]))
    ).toEqual({
      id: "quarkus-patterns",
      name: "quarkus-patterns",
      description: "",
      skills: [
        { id: "ejb-to-cdi", name: "EJB to CDI conversion patterns" },
        { id: "quarkus-patterns-panache", name: "quarkus-patterns-panache" },
      ],
      operatorManaged: false,
    });
  });

  it("writes skillCardRef entries and keeps source entries", () => {
    expect(
      toSkillCollectionSpec(
        {
          name: "quarkus-patterns",
          description: "",
          skills: [{ id: "jakarta-ee" }],
        },
        collection.spec
      )
    ).toEqual({
      skills: [
        {
          name: "panache",
          source: "https://git.example.com/skills",
          ref: "v1",
        },
        { name: "jakarta-ee", skillCardRef: "jakarta-ee" },
      ],
    });
  });

  it("does not write controller-owned members back as skillCardRef entries", () => {
    const owned = controllerOwnedSkills(collection);
    expect(owned).toEqual(["quarkus-patterns-panache"]);
    // An unchanged save sends back every listed member: same entries, no
    // duplicate (kept source entries come first).
    const unchanged = toSkillCollection(collection);
    const spec = toSkillCollectionSpec(
      {
        name: unchanged.name,
        description: unchanged.description,
        skills: unchanged.skills.map(({ id }) => ({ id })),
      },
      collection.spec,
      owned
    );
    expect(spec.skills).toHaveLength(collection.spec.skills?.length ?? 0);
    expect(spec.skills).toEqual(
      expect.arrayContaining(collection.spec.skills ?? [])
    );
  });

  it("refuses to edit the members of an enumerated collection", () => {
    expect(() =>
      toSkillCollectionSpec(
        { name: "c", description: "", skills: [] },
        { image: "quay.io/konveyor/skills:latest" }
      )
    ).toThrow();
  });
});

describe("AgentWorkflow -> Migration Plan", () => {
  it("maps stages in order and counts runs client-side", () => {
    expect(toMigrationPlan(workflow, [workflowRun])).toEqual({
      id: "migrate-app",
      name: "migrate-app",
      description: "",
      stages: [
        {
          id: "assess",
          name: "assess",
          agent: { id: "analyzer", name: "analyzer" },
          instructions: "Assess the app.",
          requiresApproval: false,
          order: 1,
        },
        {
          id: "migrate",
          name: "migrate",
          agent: { id: "migrate", name: "migrate" },
          instructions: "Apply the changes.",
          requiresApproval: true,
          order: 2,
        },
      ],
      migrationPath: undefined,
      effectiveSkills: undefined,
      applicationImpact: undefined,
      runCount: 1,
      operatorManaged: false,
      createTime: created,
      updateTime: undefined,
    });
    expect(toMigrationPlan(workflow).runCount).toBeUndefined();
  });

  it("writes stages: kept ids, new unique names, approval as execution mode", () => {
    expect(
      toWorkflowSpec(
        {
          name: "migrate-app",
          description: "dropped",
          stages: [
            {
              id: "migrate",
              name: "migrate",
              agent: { id: "migrate" },
              instructions: "Apply the changes.",
              requiresApproval: false,
            },
            {
              name: "Migrate",
              agent: { id: "verifier" },
              instructions: "",
              requiresApproval: true,
            },
            {
              id: "assess",
              name: "assess",
              agent: { id: "analyzer" },
              instructions: "Assess the app.",
              requiresApproval: false,
            },
          ],
        },
        workflow.spec
      )
    ).toEqual({
      guide: "Migrate one application per run.",
      params: [{ name: "application_name", type: "string" }],
      stages: [
        {
          name: "migrate",
          agentRef: "migrate",
          instructions: "Apply the changes.",
          execution: { maxTurns: 40, mode: undefined },
        },
        {
          name: "migrate-2",
          agentRef: "verifier",
          instructions: undefined,
          execution: { mode: "approve" },
        },
        {
          name: "assess",
          agentRef: "analyzer",
          instructions: "Assess the app.",
          execution: undefined,
        },
      ],
    });
  });
});

describe("AgentWorkflowRun -> Plan run", () => {
  it("maps the run snapshot, its application and stage timing", () => {
    expect(
      toPlanRun(workflowRun, {
        agentRuns,
        applicationNames: new Map([[12, "Customer Portal"]]),
      })
    ).toEqual({
      id: "ui-x7k2p",
      name: "ui-x7k2p",
      planId: "migrate-app",
      planName: "migrate-app",
      applications: [{ id: 12, name: "Customer Portal" }],
      status: "Running",
      targetBranch: "konveyor/migration-1762074900",
      startedAt: "2026-11-02T09:20:00Z",
      completedAt: undefined,
      stageRuns: [
        {
          stageId: "assess",
          name: "assess",
          agent: { id: "analyzer", name: "analyzer" },
          instructions: "Assess the app.",
          requiresApproval: false,
          order: 1,
          status: "Succeeded",
          startedAt: "2026-11-02T09:20:05Z",
          completedAt: "2026-11-02T09:24:00Z",
          approvedAt: undefined,
          output: "end_turn",
          messages: undefined,
          commits: undefined,
        },
        {
          stageId: "migrate",
          name: "migrate",
          agent: { id: "migrate", name: "migrate" },
          instructions: "Apply the changes.",
          requiresApproval: true,
          order: 2,
          status: "Running",
          startedAt: "2026-11-02T09:24:10Z",
          completedAt: undefined,
          approvedAt: undefined,
          output: undefined,
          messages: undefined,
          commits: undefined,
        },
      ],
      resolvedSkills: undefined,
    });
  });

  it("maps a run the controller has not reconciled yet", () => {
    const fresh: AgentWorkflowRun = {
      metadata: { name: "ui-new01", creationTimestamp: created },
      spec: { workflowRef: "migrate-app" },
    };
    expect(toPlanRun(fresh)).toMatchObject({
      status: "Pending",
      applications: [],
      targetBranch: "",
      startedAt: created,
      stageRuns: [],
    });
  });

  it("builds one createWorkflowRun input per application", () => {
    expect(
      toWorkflowRunInputs({
        applicationIds: [12, 7],
        planSelection: "single",
        planId: "migrate-app",
        targetBranch: "konveyor/migration-1",
      })
    ).toEqual([
      {
        workflowRef: "migrate-app",
        applicationRef: "12",
        targetBranch: "konveyor/migration-1",
      },
      {
        workflowRef: "migrate-app",
        applicationRef: "7",
        targetBranch: "konveyor/migration-1",
      },
    ]);
  });

  it("needs a resolver for the recommended Plan", () => {
    const request = {
      applicationIds: [12],
      planSelection: "recommended" as const,
      targetBranch: "b",
    };
    expect(() => toWorkflowRunInputs(request)).toThrow("application 12");
    expect(toWorkflowRunInputs(request, () => "migrate-app")).toEqual([
      { workflowRef: "migrate-app", applicationRef: "12", targetBranch: "b" },
    ]);
  });

  it("returns the created runs as the start response", () => {
    expect(toStartResponse([workflowRun])).toEqual({
      planRuns: [{ id: "ui-x7k2p", name: "ui-x7k2p" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Writer hardening: unknown fields, CRD validation rules, entry names, renames
// ---------------------------------------------------------------------------

const OPERATOR_LABELS = {
  "app.kubernetes.io/managed-by": "agentic-controller-defaults",
};

describe("writers keep spec fields this contract does not know", () => {
  // A field a newer controller adds: the Hub replaces the whole spec on PUT,
  // so a writer that rebuilt the spec field by field would drop it.
  const future = { futureField: { enabled: true } };

  it("Gateway", () => {
    const base = { ...gateway.spec, ...future };
    expect(
      toGatewaySpec(
        { name: "claude-sonnet", provider: { id: "anthropic" }, model: "m" },
        base
      )
    ).toMatchObject(future);
  });

  it("SkillCard, and only one source survives a source change", () => {
    const base = { ...imageCard.spec, ...future };
    const spec = toSkillCardSpec(
      { name: "Q", description: "", sourceType: "inline", content: "x" },
      base
    );
    expect(spec).toMatchObject({ ...future, inline: "x" });
    expect(spec.image).toBeUndefined();
    expect(spec.subPath).toBeUndefined();
  });

  it("AgentWorkflow, at spec and stage level", () => {
    const base = {
      ...workflow.spec,
      ...future,
      stages: workflow.spec.stages.map((stage) => ({ ...stage, ...future })),
    };
    const spec = toWorkflowSpec(
      {
        name: "migrate-app",
        description: "",
        stages: [
          {
            id: "assess",
            name: "assess",
            agent: { id: "analyzer" },
            instructions: "Assess the app.",
            requiresApproval: false,
          },
          {
            name: "New stage",
            agent: { id: "migrate" },
            instructions: "",
            requiresApproval: false,
          },
        ],
      },
      base
    );
    expect(spec).toMatchObject(future);
    expect(spec.stages[0]).toMatchObject(future);
    expect(spec.stages[1]).not.toHaveProperty("futureField");
  });

  it("Agent parameters", () => {
    const spec = toAgentSpec(
      {
        name: "migrate",
        description: "",
        model: { id: "claude-sonnet" },
        skills: [],
        skillCollections: [],
        prompt: "",
        capabilities: [],
        parameters: [
          {
            name: "dry_run",
            type: "boolean",
            description: "",
            defaultValue: "",
          },
        ],
      },
      { image: "i", params: [{ name: "dry_run", ...future }] }
    );
    expect(spec.params?.[0]).toMatchObject(future);
  });
});

describe("Agent parameters stay valid for the controller", () => {
  const write = (
    defaultValue: string | undefined,
    current: AgentResource["spec"]["params"]
  ) =>
    toAgentSpec(
      {
        name: "a",
        description: "",
        model: { id: "" },
        skills: [],
        skillCollections: [],
        prompt: "",
        capabilities: [],
        parameters: [
          { name: "x", type: "string", description: "", defaultValue },
        ],
      },
      { image: "i", params: current }
    ).params?.[0];

  it("keeps required when there is no default", () => {
    expect(write(undefined, [{ name: "x", required: true }])).toMatchObject({
      required: true,
    });
    expect(write("", [{ name: "x", required: true }])).toMatchObject({
      required: true,
      default: undefined,
    });
  });

  it("drops required when a default is set (CEL: a required parameter cannot have a default)", () => {
    const param = write("v", [{ name: "x", required: true }]);
    expect(param).toMatchObject({ default: "v" });
    expect(param?.required).toBeUndefined();
  });
});

describe("Skill collection entries", () => {
  it("keep their names and positions; new cards are appended", () => {
    const base = {
      version: "1",
      skills: [
        { name: "my-alias", skillCardRef: "plan" },
        { name: "bundle", image: "quay.io/k/skills:1", subPath: "a" },
        { name: "verify", skillCardRef: "verify" },
      ],
    };
    expect(
      toSkillCollectionSpec(
        {
          name: "c",
          description: "",
          skills: [{ id: "execute" }, { id: "verify" }, { id: "plan" }],
        },
        base
      )
    ).toEqual({
      version: "1",
      skills: [
        { name: "my-alias", skillCardRef: "plan" },
        { name: "bundle", image: "quay.io/k/skills:1", subPath: "a" },
        { name: "verify", skillCardRef: "verify" },
        { name: "execute", skillCardRef: "execute" },
      ],
    });
  });

  it("drop a removed card's entry and name a new entry uniquely", () => {
    const base = {
      skills: [
        { name: "plan", source: "https://git.example.com/s" },
        { name: "old", skillCardRef: "old" },
      ],
    };
    expect(
      toSkillCollectionSpec(
        { name: "c", description: "", skills: [{ id: "plan" }] },
        base
      ).skills
    ).toEqual([
      { name: "plan", source: "https://git.example.com/s" },
      { name: "plan-2", skillCardRef: "plan" },
    ]);
  });
});

describe("operator-managed objects", () => {
  it("are flagged from the managed-by label", () => {
    const labelled = <T extends { metadata: object }>(o: T): T => ({
      ...o,
      metadata: { ...o.metadata, labels: OPERATOR_LABELS },
    });
    expect(toAgent(labelled(agent)).operatorManaged).toBe(true);
    expect(toSkill(labelled(inlineCard)).operatorManaged).toBe(true);
    expect(toSkillCollection(labelled(collection)).operatorManaged).toBe(true);
    expect(toMigrationPlan(labelled(workflow)).operatorManaged).toBe(true);
    // konveyor.io/managed=true only says the Hub lists it, not who owns it.
    expect(toAgent(agent).operatorManaged).toBe(false);
  });
});

describe("Gateway status after an update", () => {
  const observedAt = (observedGeneration: number): Gateway => ({
    ...gateway,
    metadata: { ...gateway.metadata, generation: 3 },
    status: {
      conditions: [
        {
          type: "Ready",
          status: "True",
          reason: "ConnectionVerified",
          lastTransitionTime: "2026-11-02T09:16:00Z",
          observedGeneration,
        },
      ],
    },
  });

  it("is pending while the Ready condition describes an older generation", () => {
    expect(toVerificationStatus(observedAt(2))).toBe("pending");
    expect(toModel(observedAt(2)).lastVerified).toBeUndefined();
    expect(toVerificationStatus(observedAt(3))).toBe("verified");
  });
});

describe("run inputs", () => {
  it("carry the Model, target branch and parameters of a test run", () => {
    expect(
      toCreateRunInput({
        agentId: "migrate",
        applicationId: 7,
        task: "Go",
        modelId: "claude-sonnet",
        targetBranch: "konveyor/migration-1",
        params: { dry_run: "true" },
      })
    ).toEqual({
      agentRef: "migrate",
      applicationRef: "7",
      instructions: "Go",
      gateway: "claude-sonnet",
      targetBranch: "konveyor/migration-1",
      params: { dry_run: "true" },
    });
    expect(
      toCreateRunInput({
        agentId: "migrate",
        applicationId: 7,
        task: "Go",
        modelId: "",
        targetBranch: "",
      })
    ).toEqual({ agentRef: "migrate", applicationRef: "7", instructions: "Go" });
  });

  it("carry the Model and parameters to every workflow run", () => {
    expect(
      toWorkflowRunInputs({
        applicationIds: [12, 7],
        planSelection: "single",
        planId: "migrate-app",
        targetBranch: "b",
        modelId: "claude-sonnet",
        params: { application_name: "x" },
      }).map(({ gateway, params }) => ({ gateway, params }))
    ).toEqual([
      { gateway: "claude-sonnet", params: { application_name: "x" } },
      { gateway: "claude-sonnet", params: { application_name: "x" } },
    ]);
  });
});

describe("resource names and renames", () => {
  it("builds a create name or explains why it cannot", () => {
    expect(toNewResourceName("Java EE to Quarkus")).toBe("java-ee-to-quarkus");
    expect(() => toNewResourceName("!!!")).toThrow("resource name");
  });

  it("accepts an update whose name maps to the current resource name", () => {
    expect(() =>
      assertNotRenamed("java-ee-to-quarkus", "java-ee-to-quarkus")
    ).not.toThrow();
    expect(() =>
      assertNotRenamed("java-ee-to-quarkus", "Java EE to Quarkus")
    ).not.toThrow();
  });

  it("rejects a rename", () => {
    expect(() => assertNotRenamed("java-ee-to-quarkus", "Quarkus 3")).toThrow(
      RenameNotSupportedError
    );
  });
});
