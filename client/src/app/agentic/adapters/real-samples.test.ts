/**
 * The adapters against the agentic controller's own objects.
 *
 * Fixtures: `__fixtures__/agentic-controller-369070c6/`, verbatim copies of
 * konveyor/agentic-controller `config/defaults/*.yaml` (the content the
 * operator installs) and `config/samples/*.yaml` at `main` @
 * 369070c659a71cecf50d57c376cb13d09d332701 (kustomization.yaml and README.md
 * left out). To refresh them, copy both folders again from the controller
 * version you target and update the folder name and this comment.
 *
 * Each object goes domain -> request -> writer over its own spec and must come
 * back unchanged: an unchanged save in the UI must not change the CRD.
 */
import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

import type * as Crd from "@app/api/agentic/contract";

import {
  Agent,
  AgentRequest,
  MigrationPlan,
  MigrationPlanRequest,
  ModelProjection,
  ModelRequest,
  Skill,
  SkillCollection,
  SkillCollectionRequest,
  SkillRequest,
} from "../types";

import {
  controllerOwnedSkills,
  toAgent,
  toAgentSpec,
  toAgentTestRun,
  toCreateRunInput,
  toGatewaySpec,
  toMigrationPlan,
  toModel,
  toSkill,
  toSkillCardSpec,
  toSkillCollection,
  toSkillCollectionSpec,
  toWorkflowRunInputs,
  toWorkflowSpec,
} from "./index";

const FIXTURES = path.join(
  __dirname,
  "__fixtures__",
  "agentic-controller-369070c6"
);

interface KubeObject {
  kind: string;
  metadata: Crd.ObjectMeta;
}

const isKubeObject = (value: unknown): value is KubeObject =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  typeof value.kind === "string" &&
  "metadata" in value;

const loadFolder = (folder: string) =>
  fs
    .readdirSync(path.join(FIXTURES, folder))
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .flatMap((file) =>
      yaml.loadAll(fs.readFileSync(path.join(FIXTURES, folder, file), "utf8"))
    )
    .filter(isKubeObject);

const defaults = loadFolder("defaults");
const samples = loadFolder("samples");
const objects = [...defaults, ...samples];

interface Kinds {
  Agent: Crd.AgentResource;
  AgentRun: Crd.AgentRun;
  AgentWorkflow: Crd.AgentWorkflow;
  Gateway: Crd.Gateway;
  SkillCard: Crd.SkillCard;
  SkillCollection: Crd.SkillCollection;
}

const ofKind = <K extends keyof Kinds>(kind: K, from = objects) =>
  from.filter((o): o is KubeObject & Kinds[K] => o.kind === kind);

const named = <T extends KubeObject>(list: T[]) =>
  list.map((o) => [o.metadata.name ?? "", o] as const);

// Domain -> request, as the edit forms do on an unchanged save.

const agentRequest = (agent: Agent): AgentRequest => ({
  name: agent.name,
  description: agent.description,
  model: { id: agent.model.id },
  skills: agent.skills.map(({ id }) => ({ id })),
  skillCollections: (agent.skillCollections ?? []).map(({ id }) => ({ id })),
  prompt: agent.prompt,
  capabilities: agent.capabilities,
  parameters: agent.parameters,
});

const planRequest = (plan: MigrationPlan): MigrationPlanRequest => ({
  name: plan.name,
  description: plan.description,
  stages: plan.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    agent: { id: stage.agent.id },
    instructions: stage.instructions,
    requiresApproval: stage.requiresApproval,
  })),
});

const skillRequest = (skill: Skill): SkillRequest => ({
  name: skill.name,
  description: skill.description,
  sourceType: skill.sourceType,
  content: skill.content,
  repoUrl: skill.repoUrl,
  repoBranch: skill.repoBranch,
  repoPath: skill.repoPath,
  imageRef: skill.imageRef,
});

const collectionRequest = (
  collection: SkillCollection
): SkillCollectionRequest => ({
  name: collection.name,
  description: collection.description,
  skills: collection.skills.map(({ id }) => ({ id })),
});

const modelRequest = (model: ModelProjection): ModelRequest => ({
  name: model.name,
  provider: { id: model.provider.id },
  model: model.model,
  endpoint: model.endpoint,
});

describe("agentic-controller default and sample objects", () => {
  it("loads every fixture", () => {
    expect(ofKind("Agent")).toHaveLength(4);
    expect(ofKind("AgentWorkflow")).toHaveLength(1);
    expect(ofKind("SkillCard")).toHaveLength(5);
    expect(ofKind("SkillCollection")).toHaveLength(1);
    expect(ofKind("Gateway")).toHaveLength(5);
    expect(ofKind("AgentRun")).toHaveLength(1);
  });

  it("marks the operator's defaults, and only them, as operator-managed", () => {
    const managed = (o: KubeObject) => {
      switch (o.kind) {
        case "Agent":
          return ofKind("Agent", [o]).map((a) => toAgent(a).operatorManaged);
        case "AgentWorkflow":
          return ofKind("AgentWorkflow", [o]).map(
            (w) => toMigrationPlan(w).operatorManaged
          );
        case "SkillCard":
          return ofKind("SkillCard", [o]).map(
            (c) => toSkill(c).operatorManaged
          );
        case "SkillCollection":
          return ofKind("SkillCollection", [o]).map(
            (c) => toSkillCollection(c).operatorManaged
          );
        default:
          return [];
      }
    };
    expect(defaults.flatMap(managed)).toEqual(
      Array(defaults.length).fill(true)
    );
    expect(samples.flatMap(managed).every((value) => !value)).toBe(true);
  });

  it.each(named(ofKind("Agent")))("Agent %s round-trips", (_name, agent) => {
    const spec = toAgentSpec(agentRequest(toAgent(agent)), agent.spec);
    expect(spec).toEqual({
      ...agent.spec,
      prompt: agent.spec.prompt ?? "",
      gateways: agent.spec.gateways ?? [],
      skillCards: agent.spec.skillCards ?? [],
      skillCollections: agent.spec.skillCollections ?? [],
      params: agent.spec.params ?? [],
    });
  });

  it.each(named(ofKind("AgentWorkflow")))(
    "AgentWorkflow %s round-trips",
    (_name, workflow) => {
      const spec = toWorkflowSpec(
        planRequest(toMigrationPlan(workflow)),
        workflow.spec
      );
      expect(spec).toEqual(workflow.spec);
    }
  );

  it.each(named(ofKind("SkillCard")))(
    "SkillCard %s round-trips",
    (_name, card) => {
      const spec = toSkillCardSpec(skillRequest(toSkill(card)), card.spec);
      expect(spec).toEqual({
        ...card.spec,
        displayName: card.spec.displayName ?? card.metadata.name,
      });
    }
  );

  it.each(named(ofKind("SkillCollection")))(
    "SkillCollection %s round-trips",
    (_name, collection) => {
      const spec = toSkillCollectionSpec(
        collectionRequest(toSkillCollection(collection)),
        collection.spec,
        controllerOwnedSkills(collection)
      );
      expect(spec).toEqual(collection.spec);
    }
  );

  it.each(named(ofKind("Gateway")))(
    "Gateway %s round-trips",
    (_name, gateway) => {
      const spec = toGatewaySpec(modelRequest(toModel(gateway)), gateway.spec);
      expect(spec).toEqual(gateway.spec);
    }
  );

  it("maps the sample AgentRun as a test run and back", () => {
    const [run] = ofKind("AgentRun");
    const testRun = toAgentTestRun(run);
    expect(testRun).toMatchObject({
      id: "migration-run-001",
      agent: { id: "migration-agent" },
      application: { id: 1, name: "#1" },
      phase: "Pending",
    });
    expect(
      toCreateRunInput({
        agentId: testRun.agent.id,
        applicationId: testRun.application.id,
        task: testRun.task,
        modelId: run.spec.gateway,
        targetBranch: "konveyor/migration",
      })
    ).toEqual({
      agentRef: "migration-agent",
      applicationRef: "1",
      instructions: run.spec.instructions,
      gateway: "gcp-vertex-ai",
      targetBranch: "konveyor/migration",
    });
  });

  it("needs a run-level Model for the shipped workflow: its Agents declare no Gateway", () => {
    const stageAgents = new Set(
      ofKind("AgentWorkflow").flatMap((w) =>
        w.spec.stages.map(({ agentRef }) => agentRef)
      )
    );
    const agents = ofKind("Agent", defaults).filter(
      ({ metadata }) => metadata.name != null && stageAgents.has(metadata.name)
    );
    expect(agents).toHaveLength(stageAgents.size);
    // The controller defaults spec.gateway only for exactly one declared
    // Gateway, so every run of this workflow must name one.
    expect(agents.every(({ spec }) => (spec.gateways ?? []).length === 0)).toBe(
      true
    );
    expect(agents.map((agent) => toAgent(agent).model)).toEqual(
      agents.map(() => ({ id: "", name: "" }))
    );

    const [workflow] = ofKind("AgentWorkflow");
    expect(
      toWorkflowRunInputs({
        applicationIds: [1],
        planSelection: "single",
        planId: workflow.metadata.name,
        targetBranch: "konveyor/migration-1",
        modelId: "anthropic-claude",
      })
    ).toEqual([
      {
        workflowRef: workflow.metadata.name,
        applicationRef: "1",
        targetBranch: "konveyor/migration-1",
        gateway: "anthropic-claude",
      },
    ]);
  });
});
