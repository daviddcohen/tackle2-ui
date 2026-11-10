import { type RestHandler, rest } from "msw";

import type {
  AnalysisProfile,
  BusinessService,
  Generator,
  Identity,
  SettingTypes,
  TagCategory,
  TaskDashboard,
  TaskQueue,
} from "@app/api/models";
import { hub } from "@app/api/rest";

export const mockGenerators: Generator[] = [
  {
    id: 1,
    kind: "generator",
    name: "Container build assets",
    description:
      "Generates a Containerfile and related container build configuration.",
  },
  {
    id: 2,
    kind: "generator",
    name: "OpenShift manifests",
    description:
      "Generates OpenShift deployment resources for the application.",
  },
];

export const mockAnalysisProfiles: AnalysisProfile[] = [
  {
    id: 1,
    name: "Java EE to Quarkus",
    description: "Analyzes Java EE applications that are targeting Quarkus.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 2,
    name: "Spring Boot to Quarkus",
    description:
      "Analyzes Spring Boot applications that are targeting Quarkus.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 3,
    name: "Java EE lift and shift",
    description:
      "Finds Java EE runtime and packaging constraints for containerization.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 4,
    name: "Spring Boot 3 modernization",
    description:
      "Finds Java and Spring compatibility changes required by Spring Boot 3.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 5,
    name: "Legacy Java runtime modernization",
    description: "Finds runtime and dependency changes required for Java 17.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 6,
    name: ".NET Framework to .NET 8",
    description:
      "Finds .NET Framework APIs and packages unsupported by .NET 8.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 7,
    name: ".NET lift and shift",
    description:
      "Finds Windows runtime and infrastructure dependencies that affect containerization.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
  {
    id: 8,
    name: "Node.js runtime modernization",
    description:
      "Finds Node.js runtime, package, and native module compatibility risks.",
    mode: { withDeps: true },
    scope: { withKnownLibs: false, packages: {} },
    rules: { labels: {}, targets: [] },
  },
];

const emptyTaskQueue: TaskQueue = {
  total: 0,
  ready: 0,
  postponed: 0,
  pending: 0,
  running: 0,
};

const tagCategories: TagCategory[] = [
  {
    id: 1,
    name: "Framework",
    tags: [
      { id: 1, name: "Java EE" },
      { id: 2, name: "Spring Boot" },
      { id: 3, name: "Legacy Java" },
      { id: 4, name: ".NET Framework" },
      { id: 5, name: "Node.js" },
    ],
  },
];

export const mockBusinessServices: BusinessService[] = [
  "Customer operations",
  "Policy operations",
  "Claims operations",
  "Commerce",
  "Billing",
  "Partner services",
  "Underwriting",
  "Document services",
  "Payments",
  "Branch banking",
  "Settlement",
  "Advisor services",
  "Risk management",
].map((name, index) => ({ id: index + 1, name }));

/**
 * Model provider API keys: the credentials the agentic fixtures' Providers
 * and Models reference (ids 601-605), offered by the Model form.
 */
const modelCredentials: Identity[] = [
  "Anthropic production credential",
  "Azure OpenAI production credential",
  "IBM model credential",
  "Internal model credential",
  "Vertex AI evaluation credential",
].map(
  (name, index): Identity => ({
    id: 601 + index,
    kind: "bearer",
    name,
    description: "Model provider API key.",
  })
);

export const mockIdentities: Identity[] = [
  ...Array.from(
    { length: 19 },
    (_, index): Identity => ({
      id: 401 + index,
      kind: "source",
      name: `Source credential ${index + 1}`,
      description: "Credential reference used by the prototype applications.",
    })
  ),
  ...modelCredentials,
];

const taskDashboard: TaskDashboard[] = [];

const settings: SettingTypes = {
  "download.html.enabled": false,
  "git.insecure.enabled": false,
  "mvn.dependencies.update.forced": false,
  "mvn.insecure.enabled": false,
  "svn.insecure.enabled": false,
  "ui.target.order": [],
};

const handlers: RestHandler[] = [
  rest.get(hub`/generators`, (_req, res, ctx) => res(ctx.json(mockGenerators))),
  rest.get(hub`/analysis/profiles`, (_req, res, ctx) =>
    res(ctx.json(mockAnalysisProfiles))
  ),
  rest.get(hub`/tasks/report/queue`, (_req, res, ctx) =>
    res(ctx.json(emptyTaskQueue))
  ),
  rest.get(hub`/tasks/report/dashboard`, (_req, res, ctx) =>
    res(ctx.json(taskDashboard))
  ),
  rest.get(hub`/tasks`, (_req, res, ctx) =>
    res(ctx.set("X-Total", "0"), ctx.json([]))
  ),
  rest.get(hub`/tickets`, (_req, res, ctx) => res(ctx.json([]))),
  rest.get(hub`/reviews`, (_req, res, ctx) => res(ctx.json([]))),
  rest.get(hub`/applications/:id/facts`, (_req, res, ctx) => res(ctx.json({}))),
  rest.get(hub`/tags/:id`, (req, res, ctx) => {
    const tagId = Number(req.params.id);
    const tag = tagCategories
      .flatMap((category) => category.tags || [])
      .find((candidate) => candidate.id === tagId);
    return tag
      ? res(ctx.json(tag))
      : res(ctx.status(404), ctx.json({ message: "Tag not found" }));
  }),
  rest.get(hub`/tagcategories`, (_req, res, ctx) =>
    res(ctx.json(tagCategories))
  ),
  rest.get(hub`/businessservices`, (_req, res, ctx) =>
    res(ctx.json(mockBusinessServices))
  ),
  rest.get(hub`/identities`, (_req, res, ctx) => res(ctx.json(mockIdentities))),
  rest.get(hub`/settings/:key`, (req, res, ctx) => {
    const key = req.params.key as keyof SettingTypes;
    return key in settings
      ? res(ctx.json(settings[key]))
      : res(ctx.status(404));
  }),
  rest.put(hub`/settings/:key`, async (req, res, ctx) => {
    const key = req.params.key as keyof SettingTypes;
    if (!(key in settings)) return res(ctx.status(404));
    const value = (await req.json()) as boolean | number[];
    const writableSettings = settings as Record<
      keyof SettingTypes,
      boolean | number[]
    >;
    writableSettings[key] = value;
    return res(ctx.json({ key, value }));
  }),
];

export default handlers;
