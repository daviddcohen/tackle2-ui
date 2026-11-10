import { type RestHandler, rest } from "msw";

import type { Archetype, Tag, TagCategory } from "@app/api/models";
import { hub } from "@app/api/rest";

/**
 * Simple stub handlers as place holders until hub API is ready.
 *
 * Handler structure modeled after hub api handler:
 *   https://github.com/konveyor/tackle2-hub/blob/main/api/tag.go
 */
const handlers: RestHandler[] = [
  rest.get(hub`/archetypes`, (req, res, ctx) => {
    console.log(
      "%c stub %c → %s",
      "font-weight: bold; color: blue; background-color: white;",
      "font-weight: normal; color: auto; background-color: auto;",
      `get the list of archetypes`
    );

    const dataAsList = Array.from(Object.values(mockArchetypes));
    return res(ctx.json(dataAsList));
  }),

  rest.get(hub`/archetypes/:id`, async (req, res, ctx) => {
    const { id } = req.params;

    console.log(
      "%c stub %c → %s",
      "font-weight: bold; color: blue; background-color: white;",
      "font-weight: normal; color: auto; background-color: auto;",
      `get archetype ${id}`
    );

    const id_ = Array.isArray(id) ? id[0] : id;
    if (id_ in mockArchetypes) {
      return res(ctx.json(mockArchetypes[Number(id_)]));
    }
    return res(ctx.status(404));
  }),

  rest.post(hub`/archetypes`, async (req, res, ctx) => {
    const create = await req.json();

    console.log(
      "%c stub %c → %s",
      "font-weight: bold; color: blue; background-color: white;",
      "font-weight: normal; color: auto; background-color: auto;",
      `create archetype →`,
      create
    );

    const lastId = Math.max(...Object.keys(mockArchetypes).map((k) => +k));
    create.id = lastId + 1;
    mockArchetypes[create.id] = create;
    return res(ctx.status(201), ctx.json(create));
  }),

  rest.put(hub`/archetypes/:id`, async (req, res, ctx) => {
    const { id } = req.params;
    const update = await req.json();

    console.log(
      "%c stub %c → %s",
      "font-weight: bold; color: blue; background-color: white;",
      "font-weight: normal; color: auto; background-color: auto;",
      `update archetype ${id} →`,
      update
    );

    const id_ = Array.isArray(id) ? id[0] : id;
    if (id_ in mockArchetypes) {
      mockArchetypes[Number(id_)] = update;
      return res(ctx.status(204));
    }
    return res(ctx.status(404));
  }),

  rest.delete(hub`/archetypes/:id`, (req, res, ctx) => {
    const { id } = req.params;
    console.log(
      "%c✏️ archetype stub%c 🤖 %s",
      "font-weight: bold; color: blue; background-color: white;",
      "font-weight: normal; color: auto; background-color: auto;",
      `delete archetype ${id}`
    );

    const id_ = Array.isArray(id) ? id[0] : id;
    if (id_ in mockArchetypes) {
      delete mockArchetypes[Number(id_)];
      return res(ctx.status(204));
    }
    return res(ctx.status(404));
  }),
];

const tagCategoryData: Record<number, Omit<TagCategory, "tags">> = {
  1: {
    id: 1,
    name: "Application framework",
    colour: "#0066cc",
  },
  2: {
    id: 2,
    name: "Migration priority",
    colour: "#3e8635",
  },
};

const tagData: Record<number, Tag> = {
  1: { id: 1, name: "Java EE", category: tagCategoryData[1] },
  2: { id: 2, name: "Spring Boot", category: tagCategoryData[1] },
  3: { id: 3, name: "Legacy Java", category: tagCategoryData[1] },
  4: { id: 4, name: ".NET Framework", category: tagCategoryData[1] },
  5: { id: 5, name: "Node.js", category: tagCategoryData[1] },
  81: { id: 81, name: "Priority 1", category: tagCategoryData[2] },
  82: { id: 82, name: "Priority 2", category: tagCategoryData[2] },
  83: { id: 83, name: "Priority 3", category: tagCategoryData[2] },
};

/**
 * The archetype stub/mock data.
 */
export const mockArchetypes: Record<number, Archetype> = {
  1: {
    id: 1,
    name: "Java EE Application",
    description:
      "Enterprise Java applications using Java EE APIs and application server services.",
    comments: "Primary archetype for the Java EE to Quarkus migration path.",
    criteria: [tagData[1]],
    tags: [tagData[81]],
    stakeholders: [],
    stakeholderGroups: [],
    applications: [
      { id: 1, name: "Customer Management" },
      { id: 2, name: "Policy Administration" },
      { id: 3, name: "Claims Processing" },
      { id: 6, name: "Billing Operations" },
      { id: 7, name: "Partner Portal" },
      { id: 8, name: "Underwriting Workbench" },
      { id: 9, name: "Document Archive" },
    ],
    profiles: [
      {
        id: 11,
        name: "Quarkus 3.x",
        generators: [{ id: 2, name: "OpenShift manifests" }],
        analysisProfile: { id: 1, name: "Java EE to Quarkus" },
      },
      {
        id: 12,
        name: "OpenShift lift and shift",
        generators: [
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ],
        analysisProfile: { id: 3, name: "Java EE lift and shift" },
      },
    ],
    assessed: false,
  },

  2: {
    id: 2,
    name: "Spring Boot Application",
    description:
      "Spring Boot services that are candidates for framework and platform modernization.",
    comments: "Supports Spring Boot to Quarkus modernization.",
    criteria: [tagData[2]],
    tags: [tagData[81], tagData[82]],
    stakeholders: [],
    stakeholderGroups: [],
    applications: [
      { id: 4, name: "Order Service" },
      { id: 5, name: "Inventory Service" },
      { id: 10, name: "Payment Gateway" },
      { id: 11, name: "Pricing Service" },
      { id: 12, name: "Notification Service" },
    ],
    profiles: [
      {
        id: 21,
        name: "Quarkus 3.x",
        generators: [{ id: 2, name: "OpenShift manifests" }],
        analysisProfile: { id: 2, name: "Spring Boot to Quarkus" },
      },
      {
        id: 22,
        name: "Spring Boot 3 on OpenShift",
        generators: [
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ],
        analysisProfile: { id: 4, name: "Spring Boot 3 modernization" },
      },
    ],
    assessed: false,
  },

  3: {
    id: 3,
    name: "Legacy Java Application",
    description:
      "Java applications on older runtimes that require dependency and platform modernization.",
    comments: "Supports Java 17 runtime modernization and containerization.",
    criteria: [tagData[3]],
    tags: [tagData[82]],
    stakeholders: [],
    stakeholderGroups: [],
    applications: [
      { id: 13, name: "Branch Operations" },
      { id: 14, name: "Batch Settlement" },
    ],
    profiles: [
      {
        id: 31,
        name: "Java 17 on OpenShift",
        generators: [
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ],
        analysisProfile: { id: 5, name: "Legacy Java runtime modernization" },
      },
      {
        id: 32,
        name: "Java 17 on RHEL",
        generators: [{ id: 1, name: "Container build assets" }],
        analysisProfile: { id: 5, name: "Legacy Java runtime modernization" },
      },
    ],
    assessed: false,
  },
  4: {
    id: 4,
    name: ".NET Framework Application",
    description:
      ".NET Framework applications that need runtime modernization or platform migration.",
    comments: "Supports both .NET 8 modernization and lift and shift paths.",
    criteria: [tagData[4]],
    tags: [tagData[81]],
    stakeholders: [],
    stakeholderGroups: [],
    applications: [
      { id: 15, name: "Advisor Workbench API" },
      { id: 16, name: "Settlement Desktop API" },
      { id: 17, name: "Risk Calculation Service" },
    ],
    profiles: [
      {
        id: 41,
        name: ".NET 8 on OpenShift",
        generators: [
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ],
        analysisProfile: { id: 6, name: ".NET Framework to .NET 8" },
      },
      {
        id: 42,
        name: "OpenShift lift and shift",
        generators: [
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ],
        analysisProfile: { id: 7, name: ".NET lift and shift" },
      },
    ],
    assessed: false,
  },
  5: {
    id: 5,
    name: "Node.js Service",
    description:
      "Node.js services that need a supported runtime and standardized OpenShift deployment.",
    comments: "Supports Node.js 22 runtime modernization.",
    criteria: [tagData[5]],
    tags: [tagData[83]],
    stakeholders: [],
    stakeholderGroups: [],
    applications: [
      { id: 18, name: "Partner Events API" },
      { id: 19, name: "Document Preview Service" },
    ],
    profiles: [
      {
        id: 51,
        name: "Node.js 22 on OpenShift",
        generators: [
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ],
        analysisProfile: { id: 8, name: "Node.js runtime modernization" },
      },
    ],
    assessed: false,
  },
};

export default handlers;
