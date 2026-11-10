/**
 * MSW handlers for the agentic prototype API (`/hub/prototype/agentic/*`).
 *
 * The handlers only translate HTTP to the mock server modules (`catalog.ts`,
 * `execution.ts`) and back, with REST semantics:
 * - the URL id identifies the resource (a body id is ignored);
 * - 201 + entity on create, 204 on update and delete (as the Hub does);
 * - 400 invalid payload, 404 unknown id, 409 conflict, with `{ message }`.
 *
 * Every GET goes through `read()`, which applies the prototype scenario the
 * same way everywhere: `apiError` answers 503, `loading` delays 10 s, and
 * `initial` hides fixture entities (lists are empty, fixture ids are 404).
 */
import {
  DefaultBodyType,
  PathParams,
  ResponseComposition,
  RestContext,
  RestRequest,
  rest,
} from "msw";

import { EntityId, ModelProjection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";

import * as catalog from "./catalog";
import { EntityKind, MockHttpError, isSeeded } from "./db";
import * as execution from "./execution";
import { availableModelsByProviderType } from "./fixtures";
import { getPrototypeScenario } from "./prototype-state";

const {
  skills: SKILLS,
  skillCollections: SKILL_COLLECTIONS,
  models: MODELS,
  providers: PROVIDERS,
  agents: AGENTS,
  agentRuns: AGENT_RUNS,
  plans: PLANS,
  archetypes: ARCHETYPES,
  planRuns: PLAN_RUNS,
  applicationMigrations: APPLICATION_MIGRATIONS,
  executionPolicy: EXECUTION_POLICY,
} = AGENTIC_ENDPOINTS;

type Req = RestRequest<DefaultBodyType, PathParams>;
type Res = ResponseComposition<DefaultBodyType>;

interface Reply {
  status?: number;
  body?: unknown;
}

const LOADING_DELAY_MS = 10000;

const param = (req: Req, name: string): EntityId => String(req.params[name]);

const readJson = async (req: Req): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    throw new MockHttpError(400, "The request body must be valid JSON.");
  }
};

const respond = (res: Res, ctx: RestContext, reply: Reply, delay = 0) =>
  res(
    ...[
      ...(delay > 0 ? [ctx.delay(delay)] : []),
      ctx.status(reply.status ?? (reply.body === undefined ? 204 : 200)),
      ...(reply.body !== undefined ? [ctx.json(reply.body)] : []),
    ]
  );

const fail = (res: Res, ctx: RestContext, error: unknown) => {
  if (error instanceof MockHttpError) {
    return res(ctx.status(error.status), ctx.json({ message: error.message }));
  }
  throw error;
};

/** A write: errors become `{ message }` responses. */
const write =
  (handler: (req: Req) => Promise<Reply> | Reply) =>
  async (req: Req, res: Res, ctx: RestContext) => {
    try {
      return respond(res, ctx, await handler(req));
    } catch (error) {
      return fail(res, ctx, error);
    }
  };

interface ReadOptions {
  /** In the `initial` scenario, hide fixture entities of this kind. */
  kind?: EntityKind;
}

/** A read with the prototype scenario applied. */
const read =
  (handler: (req: Req) => unknown, options: ReadOptions = {}) =>
  async (req: Req, res: Res, ctx: RestContext) => {
    const scenario = getPrototypeScenario();
    if (scenario === "apiError") {
      return res(
        ctx.status(503),
        ctx.json({ message: "The prototype API dependency is unavailable." })
      );
    }
    try {
      let body = handler(req);
      if (scenario === "initial" && options.kind != null) {
        const kind = options.kind;
        if (Array.isArray(body)) {
          body = body.filter(
            (item: { id: EntityId }) => !isSeeded(kind, item.id)
          );
        } else if (
          body != null &&
          typeof body === "object" &&
          "id" in body &&
          isSeeded(kind, String((body as { id: unknown }).id))
        ) {
          throw new MockHttpError(404, "Not found.");
        }
      }
      return respond(
        res,
        ctx,
        { status: 200, body },
        scenario === "loading" ? LOADING_DELAY_MS : 0
      );
    } catch (error) {
      return fail(res, ctx, error);
    }
  };

/** In `partialConfiguration`, every Model is still waiting for verification. */
const withScenarioVerification = (model: ModelProjection): ModelProjection =>
  getPrototypeScenario() === "partialConfiguration"
    ? {
        ...model,
        verificationStatus: "pending",
        statusReason: "Connection verification is required.",
      }
    : model;

const handlers = [
  // Skills
  rest.get(
    SKILLS,
    read(() => catalog.listSkills(), { kind: "skills" })
  ),
  rest.get(
    `${SKILLS}/:id`,
    read((req) => catalog.getSkill(param(req, "id")), { kind: "skills" })
  ),
  rest.post(
    SKILLS,
    write(async (req) => ({
      status: 201,
      body: catalog.createSkill(await readJson(req)),
    }))
  ),
  rest.put(
    `${SKILLS}/:id`,
    write(async (req) => {
      catalog.updateSkill(param(req, "id"), await readJson(req));
      return {};
    })
  ),
  rest.delete(
    `${SKILLS}/:id`,
    write((req) => {
      catalog.deleteSkill(param(req, "id"));
      return {};
    })
  ),

  // Skill collections
  rest.get(
    SKILL_COLLECTIONS,
    read(() => catalog.listSkillCollections(), { kind: "skillCollections" })
  ),
  rest.get(
    `${SKILL_COLLECTIONS}/:id`,
    read((req) => catalog.getSkillCollection(param(req, "id")), {
      kind: "skillCollections",
    })
  ),
  rest.post(
    SKILL_COLLECTIONS,
    write(async (req) => ({
      status: 201,
      body: catalog.createSkillCollection(await readJson(req)),
    }))
  ),
  rest.put(
    `${SKILL_COLLECTIONS}/:id`,
    write(async (req) => {
      catalog.updateSkillCollection(param(req, "id"), await readJson(req));
      return {};
    })
  ),
  rest.delete(
    `${SKILL_COLLECTIONS}/:id`,
    write((req) => {
      catalog.deleteSkillCollection(param(req, "id"));
      return {};
    })
  ),

  // Models (controller Gateway shape; the default is a proposed Hub policy)
  rest.get(
    MODELS,
    read(() => catalog.listModels().map(withScenarioVerification), {
      kind: "models",
    })
  ),
  rest.put(
    `${MODELS}/:id/default`,
    write((req) => ({ body: catalog.setDefaultModel(param(req, "id")) }))
  ),
  rest.get(
    `${MODELS}/:id`,
    read(
      (req) => withScenarioVerification(catalog.getModel(param(req, "id"))),
      {
        kind: "models",
      }
    )
  ),
  rest.post(
    MODELS,
    write(async (req) => ({
      status: 201,
      body: catalog.createModel(await readJson(req)),
    }))
  ),
  rest.put(
    `${MODELS}/:id`,
    write(async (req) => {
      catalog.updateModel(param(req, "id"), await readJson(req));
      return {};
    })
  ),
  rest.delete(
    `${MODELS}/:id`,
    write((req) => {
      catalog.deleteModel(param(req, "id"));
      return {};
    })
  ),

  // Providers
  rest.get(
    PROVIDERS,
    read(() => catalog.listProviders(), { kind: "providers" })
  ),
  rest.get(
    `${PROVIDERS}/:id/available-models`,
    read((req) =>
      catalog.getAvailableModels(
        param(req, "id"),
        availableModelsByProviderType
      )
    )
  ),
  rest.get(
    `${PROVIDERS}/:id`,
    read((req) => catalog.getProvider(param(req, "id")), { kind: "providers" })
  ),
  rest.post(
    PROVIDERS,
    write(async (req) => ({
      status: 201,
      body: catalog.createProvider(await readJson(req)),
    }))
  ),
  rest.put(
    `${PROVIDERS}/:id`,
    write(async (req) => {
      catalog.updateProvider(param(req, "id"), await readJson(req));
      return {};
    })
  ),
  rest.delete(
    `${PROVIDERS}/:id`,
    write((req) => {
      catalog.deleteProvider(param(req, "id"));
      return {};
    })
  ),

  // Agents
  rest.get(
    AGENTS,
    read(() => catalog.listAgents(), { kind: "agents" })
  ),
  rest.get(
    `${AGENTS}/:id`,
    read((req) => catalog.getAgent(param(req, "id")), { kind: "agents" })
  ),
  rest.post(
    AGENTS,
    write(async (req) => ({
      status: 201,
      body: catalog.createAgent(await readJson(req)),
    }))
  ),
  rest.put(
    `${AGENTS}/:id`,
    write(async (req) => {
      catalog.updateAgent(param(req, "id"), await readJson(req));
      return {};
    })
  ),
  rest.delete(
    `${AGENTS}/:id`,
    write((req) => {
      catalog.deleteAgent(param(req, "id"));
      return {};
    })
  ),

  // Agent test runs
  rest.get(
    AGENT_RUNS,
    read(
      (req) => catalog.listAgentTestRuns(req.url.searchParams.get("agentId")),
      { kind: "agentTestRuns" }
    )
  ),
  rest.post(
    AGENT_RUNS,
    write(async (req) => ({
      status: 202,
      body: catalog.startAgentTestRun(await readJson(req)),
    }))
  ),

  // Plans
  rest.get(
    PLANS,
    read(() => catalog.listPlans(), { kind: "plans" })
  ),
  rest.get(
    `${PLANS}/:id`,
    read((req) => catalog.getPlan(param(req, "id")), { kind: "plans" })
  ),
  rest.post(
    PLANS,
    write(async (req) => ({
      status: 201,
      body: catalog.createPlan(await readJson(req)),
    }))
  ),
  rest.put(
    `${PLANS}/:id`,
    write(async (req) => {
      catalog.updatePlan(param(req, "id"), await readJson(req));
      return {};
    })
  ),
  rest.delete(
    `${PLANS}/:id`,
    write((req) => {
      catalog.deletePlan(param(req, "id"));
      return {};
    })
  ),

  rest.put(
    `${ARCHETYPES}/:archetypeId/target-profiles/:profileId/plan`,
    write(async (req) => {
      catalog.assignPlanToTargetProfile(
        Number(req.params.archetypeId),
        Number(req.params.profileId),
        await readJson(req)
      );
      return {};
    })
  ),

  // Plan runs
  rest.get(
    PLAN_RUNS,
    read((req) => execution.listPlanRuns(req.url.searchParams.get("planId")))
  ),
  rest.get(
    `${PLAN_RUNS}/:runId`,
    read((req) => execution.getPlanRun(param(req, "runId")))
  ),
  rest.post(
    `${PLAN_RUNS}/:runId/stages/:stageId/approve`,
    write((req) => ({
      body: execution.approveStage(param(req, "runId"), param(req, "stageId")),
    }))
  ),

  // Application migrations
  rest.get(
    APPLICATION_MIGRATIONS,
    read((req) =>
      execution.getApplicationMigrations(
        (req.url.searchParams.get("applicationIds") ?? "")
          .split(",")
          .filter((value) => value.trim() !== "")
          .map(Number)
          .filter(Number.isFinite)
      )
    )
  ),
  rest.post(
    APPLICATION_MIGRATIONS,
    write(async (req) => ({
      status: 202,
      body: execution.startApplicationMigrations(await readJson(req)),
    }))
  ),
  rest.post(
    `${APPLICATION_MIGRATIONS}/:id/requests/current`,
    write(async (req) => {
      const applicationId = Number(req.params.id);
      if (!Number.isFinite(applicationId)) {
        throw new MockHttpError(404, "Application migration not found.");
      }
      return {
        body: execution.resolveApplicationRequest(
          applicationId,
          await readJson(req)
        ),
      };
    })
  ),

  // Execution policy
  rest.get(
    EXECUTION_POLICY,
    read(() => catalog.getExecutionPolicy())
  ),
  rest.put(
    EXECUTION_POLICY,
    write(async (req) => ({
      body: catalog.updateExecutionPolicy(await readJson(req)),
    }))
  ),
];

export default handlers;
