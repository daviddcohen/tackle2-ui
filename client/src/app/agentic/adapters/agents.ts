/**
 * Agent (domain) <-> Agent (konveyor.io/v1alpha1, `/hub/agentic/agents`), and
 * Agent test run <-> AgentRun (`/hub/agentic/agentruns`).
 */
import type * as Crd from "@app/api/agentic/contract";
import { isOperatorManaged } from "@app/utils/agentic";

import {
  Agent,
  AgentParameter,
  AgentRequest,
  AgentTestRun,
  AgentTestRunRequest,
} from "../types";

import {
  ApplicationNameIndex,
  NameIndex,
  toEntityId,
  toEntityRef,
  toRunApplication,
} from "./common";

/**
 * Label the agentic controller stamps on the AgentRuns it creates for
 * workflow stages (agentic-controller `internal/controller/doc.go`,
 * `labelAgentWorkflowRun`). Test runs are the AgentRuns without it.
 */
export const WORKFLOW_RUN_LABEL = "konveyor.io/agentworkflowrun";

const toParameter = (param: Crd.AgentParam): AgentParameter => ({
  name: param.name,
  type: param.type ?? "string",
  description: param.description ?? "",
  defaultValue: param.default,
});

/**
 * Agent CRD -> Agent. `skillNames` resolves Skill display names (SkillCard
 * `spec.displayName`). No backend source (documented defaults):
 * `description` "", `capabilities` [], `updateTime` undefined. `model` is the
 * first of `spec.gateways` (the domain holds one Model); with no gateways it
 * is `{ id: "", name: "" }`. A parameter's `required` flag is not modelled.
 * `operatorManaged` marks the operator's built-in Agents.
 */
export const toAgent = (
  resource: Crd.AgentResource,
  skillNames?: NameIndex
): Agent => {
  const { spec } = resource;
  const firstGateway = spec.gateways?.[0]?.ref;
  return {
    id: toEntityId(resource.metadata),
    name: toEntityId(resource.metadata),
    description: "",
    model:
      firstGateway != null ? toEntityRef(firstGateway) : { id: "", name: "" },
    skills: (spec.skillCards ?? []).map(({ ref }) =>
      toEntityRef(ref, skillNames)
    ),
    skillCollections: (spec.skillCollections ?? []).map(({ ref }) =>
      toEntityRef(ref)
    ),
    prompt: spec.prompt ?? "",
    capabilities: [],
    parameters: (spec.params ?? []).map(toParameter),
    operatorManaged: isOperatorManaged(resource),
    createTime: resource.metadata.creationTimestamp,
    updateTime: undefined,
  };
};

/**
 * What an Agent spec needs that an `AgentRequest` cannot supply: the agent
 * `image` (required by the CRD). On update pass the current `agent.spec`: the
 * Hub replaces the whole spec, so `gitConfig`, `execution` limits, extra
 * gateways and parameter `required` flags are kept from it.
 */
export type AgentSpecBase = Pick<Crd.AgentResourceSpec, "image"> &
  Partial<Crd.AgentResourceSpec>;

/**
 * A parameter in the CRD: the request's fields over the current parameter of
 * the same name (so fields the domain does not model survive). The controller
 * rejects a parameter that is `required` and has a non-empty `default` (CEL
 * rule on `AgentParam`), so a default clears the kept `required` flag: a
 * parameter with a default is optional by definition.
 */
const toCrdParam = (
  param: AgentParameter,
  current: Crd.AgentParam | undefined
): Crd.AgentParam => {
  const hasDefault = param.defaultValue != null && param.defaultValue !== "";
  return {
    ...current,
    name: param.name,
    type: param.type,
    description: param.description || undefined,
    default: hasDefault ? param.defaultValue : undefined,
    required: hasDefault ? undefined : current?.required,
  };
};

/**
 * AgentRequest -> Agent spec, spread over `base`. The request's Model replaces
 * the first gateway; any further gateways in `base` are kept. `name` (the
 * resource name, immutable: see `assertNotRenamed`), `description` and
 * `capabilities` have no spec field and are dropped.
 */
export const toAgentSpec = (
  request: AgentRequest,
  base: AgentSpecBase
): Crd.AgentResourceSpec => {
  const modelRef = request.model.id;
  const otherGateways = (base.gateways ?? [])
    .slice(1)
    .filter(({ ref }) => ref !== modelRef);
  const baseParams = new Map((base.params ?? []).map((p) => [p.name, p]));
  return {
    ...base,
    prompt: request.prompt,
    gateways: [
      ...(modelRef !== "" ? [{ ref: modelRef }] : []),
      ...otherGateways,
    ],
    skillCards: request.skills.map(({ id }) => ({ ref: id })),
    skillCollections: request.skillCollections.map(({ id }) => ({ ref: id })),
    params: request.parameters.map((param) =>
      toCrdParam(param, baseParams.get(param.name))
    ),
  };
};

/** True for an AgentRun started directly (not as a workflow stage). */
export const isAgentTestRun = (run: Crd.AgentRun) =>
  run.metadata.labels?.[WORKFLOW_RUN_LABEL] == null;

/**
 * AgentRun -> Agent test run. `application` is `{ id: 0, name: "" }` when the
 * run carries no application label or `APP_ID`.
 */
export const toAgentTestRun = (
  run: Crd.AgentRun,
  applicationNames?: ApplicationNameIndex
): AgentTestRun => ({
  id: toEntityId(run.metadata),
  agent: toEntityRef(run.spec.agentRef),
  application: toRunApplication(
    run.metadata,
    run.spec.env,
    applicationNames
  ) ?? {
    id: 0,
    name: "",
  },
  task: run.spec.instructions ?? "",
  phase: run.status?.phase ?? "Pending",
  startedAt: run.status?.startTime ?? run.metadata.creationTimestamp ?? "",
});

/**
 * Agent test run request -> input for `createAgentRun` (`api/rest/agent-runs`).
 * `modelId` becomes `spec.gateway`, `targetBranch` the `TARGET_BRANCH` env and
 * `params` `spec.params`; each is omitted when the request leaves it out.
 */
export const toCreateRunInput = (
  request: AgentTestRunRequest
): Crd.CreateRunInput => ({
  agentRef: request.agentId,
  applicationRef: String(request.applicationId),
  instructions: request.task,
  gateway: request.modelId || undefined,
  targetBranch: request.targetBranch || undefined,
  params: request.params,
});
