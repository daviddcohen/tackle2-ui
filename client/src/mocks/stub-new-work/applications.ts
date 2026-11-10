import { rest } from "msw";

import { Application } from "@app/api/models";
import { hub } from "@app/api/rest";

import { selectPortfolio } from "./agentic/portfolio";
import { getPrototypeScenario } from "./agentic/prototype-state";

function generateRandomId(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const mockApplicationArray: Application[] = [
  {
    id: 1,
    name: "Customer Management",
    description: "Java EE customer account application.",
    comments: "Ready for the Java EE to Quarkus migration path.",
    businessService: { id: 1, name: "Customer operations" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/customer-management",
      branch: "main",
    },
    identities: [{ id: 401, name: "Source credential", role: "source" }],
    migrationWave: { id: 501, name: "Wave 1" },
  },
  {
    id: 2,
    name: "Policy Administration",
    description: "Java EE policy management application.",
    comments: "Source credentials must be added before migration.",
    businessService: { id: 2, name: "Policy operations" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/policy-administration",
      branch: "main",
    },
    migrationWave: { id: 501, name: "Wave 1" },
  },
  {
    id: 3,
    name: "Claims Processing",
    description: "Java EE claims workflow application.",
    businessService: { id: 3, name: "Claims operations" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/claims-processing",
      branch: "main",
    },
    identities: [{ id: 403, name: "Source credential", role: "source" }],
    migrationWave: { id: 501, name: "Wave 1" },
  },
  {
    id: 4,
    name: "Order Service",
    description: "Spring Boot service for order processing.",
    businessService: { id: 4, name: "Commerce" },
    tags: [{ id: 2, name: "Spring Boot" }],
    archetypes: [{ id: 2, name: "Spring Boot Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/order-service",
      branch: "main",
    },
    identities: [{ id: 404, name: "Source credential", role: "source" }],
    migrationWave: { id: 502, name: "Wave 2" },
  },
  {
    id: 5,
    name: "Inventory Service",
    description: "Spring Boot inventory service.",
    businessService: { id: 4, name: "Commerce" },
    tags: [{ id: 2, name: "Spring Boot" }],
    archetypes: [{ id: 2, name: "Spring Boot Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/inventory-service",
      branch: "main",
    },
    identities: [{ id: 405, name: "Source credential", role: "source" }],
    migrationWave: { id: 502, name: "Wave 2" },
  },
  {
    id: 6,
    name: "Billing Operations",
    description: "Java EE billing and invoicing application.",
    businessService: { id: 5, name: "Billing" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/billing-operations",
      branch: "main",
    },
    identities: [{ id: 406, name: "Source credential", role: "source" }],
    migrationWave: { id: 501, name: "Wave 1" },
  },
  {
    id: 7,
    name: "Partner Portal",
    description: "Java EE partner onboarding portal.",
    businessService: { id: 6, name: "Partner services" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/partner-portal",
      branch: "main",
    },
    identities: [{ id: 407, name: "Source credential", role: "source" }],
    migrationWave: { id: 501, name: "Wave 1" },
  },
  {
    id: 8,
    name: "Underwriting Workbench",
    description: "Java EE underwriting rules application.",
    businessService: { id: 7, name: "Underwriting" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/underwriting-workbench",
      branch: "main",
    },
    identities: [{ id: 408, name: "Source credential", role: "source" }],
    migrationWave: { id: 501, name: "Wave 1" },
  },
  {
    id: 9,
    name: "Document Archive",
    description: "Java EE document retention application.",
    businessService: { id: 8, name: "Document services" },
    tags: [{ id: 1, name: "Java EE" }],
    archetypes: [{ id: 1, name: "Java EE Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/document-archive",
      branch: "main",
    },
    identities: [{ id: 409, name: "Source credential", role: "source" }],
    migrationWave: { id: 503, name: "Wave 3" },
  },
  {
    id: 10,
    name: "Payment Gateway",
    description: "Spring Boot payment authorization service.",
    businessService: { id: 9, name: "Payments" },
    tags: [{ id: 2, name: "Spring Boot" }],
    archetypes: [{ id: 2, name: "Spring Boot Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/payment-gateway",
      branch: "main",
    },
    identities: [{ id: 410, name: "Source credential", role: "source" }],
    migrationWave: { id: 502, name: "Wave 2" },
  },
  {
    id: 11,
    name: "Pricing Service",
    description: "Spring Boot pricing calculation service.",
    businessService: { id: 4, name: "Commerce" },
    tags: [{ id: 2, name: "Spring Boot" }],
    archetypes: [{ id: 2, name: "Spring Boot Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/pricing-service",
      branch: "main",
    },
    identities: [{ id: 411, name: "Source credential", role: "source" }],
    migrationWave: { id: 502, name: "Wave 2" },
  },
  {
    id: 12,
    name: "Notification Service",
    description: "Spring Boot customer notification service.",
    businessService: { id: 1, name: "Customer operations" },
    tags: [{ id: 2, name: "Spring Boot" }],
    archetypes: [{ id: 2, name: "Spring Boot Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/notification-service",
      branch: "main",
    },
    identities: [{ id: 412, name: "Source credential", role: "source" }],
    migrationWave: { id: 503, name: "Wave 3" },
  },
  {
    id: 13,
    name: "Branch Operations",
    description: "Legacy Java branch workflow application running on Java 8.",
    businessService: { id: 10, name: "Branch banking" },
    tags: [{ id: 3, name: "Legacy Java" }],
    archetypes: [{ id: 3, name: "Legacy Java Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/branch-operations",
      branch: "release/7.x",
    },
    identities: [{ id: 413, name: "Source credential", role: "source" }],
    migrationWave: { id: 502, name: "Wave 2" },
  },
  {
    id: 14,
    name: "Batch Settlement",
    description:
      "Legacy Java batch processing application with scheduled jobs.",
    businessService: { id: 11, name: "Settlement" },
    tags: [{ id: 3, name: "Legacy Java" }],
    archetypes: [{ id: 3, name: "Legacy Java Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/batch-settlement",
      branch: "main",
    },
    identities: [{ id: 414, name: "Source credential", role: "source" }],
    migrationWave: { id: 503, name: "Wave 3" },
  },
  {
    id: 15,
    name: "Advisor Workbench API",
    description: ".NET Framework API supporting financial advisor workflows.",
    businessService: { id: 12, name: "Advisor services" },
    tags: [{ id: 4, name: ".NET Framework" }],
    archetypes: [{ id: 4, name: ".NET Framework Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/advisor-workbench-api",
      branch: "main",
    },
    identities: [{ id: 415, name: "Source credential", role: "source" }],
    migrationWave: { id: 502, name: "Wave 2" },
  },
  {
    id: 16,
    name: "Settlement Desktop API",
    description: ".NET Framework service with Windows runtime dependencies.",
    businessService: { id: 11, name: "Settlement" },
    tags: [{ id: 4, name: ".NET Framework" }],
    archetypes: [{ id: 4, name: ".NET Framework Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/settlement-desktop-api",
      branch: "main",
    },
    identities: [{ id: 416, name: "Source credential", role: "source" }],
    migrationWave: { id: 503, name: "Wave 3" },
  },
  {
    id: 17,
    name: "Risk Calculation Service",
    description: ".NET Framework service for intraday risk calculations.",
    businessService: { id: 13, name: "Risk management" },
    tags: [{ id: 4, name: ".NET Framework" }],
    archetypes: [{ id: 4, name: ".NET Framework Application" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/risk-calculation-service",
      branch: "main",
    },
    identities: [{ id: 417, name: "Source credential", role: "source" }],
    migrationWave: { id: 504, name: "Wave 4" },
  },
  {
    id: 18,
    name: "Partner Events API",
    description: "Node.js service exposing partner event subscriptions.",
    businessService: { id: 6, name: "Partner services" },
    tags: [{ id: 5, name: "Node.js" }],
    archetypes: [{ id: 5, name: "Node.js Service" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/partner-events-api",
      branch: "main",
    },
    identities: [{ id: 418, name: "Source credential", role: "source" }],
    migrationWave: { id: 503, name: "Wave 3" },
  },
  {
    id: 19,
    name: "Document Preview Service",
    description:
      "Node.js service that renders previews for archived documents.",
    businessService: { id: 8, name: "Document services" },
    tags: [{ id: 5, name: "Node.js" }],
    archetypes: [{ id: 5, name: "Node.js Service" }],
    repository: {
      kind: "git",
      url: "https://git.example.com/document-preview-service",
      branch: "main",
    },
    identities: [{ id: 419, name: "Source credential", role: "source" }],
    migrationWave: { id: 504, name: "Wave 4" },
  },
];

const handlers = [
  // Commented out to avoid conflict with the real API
  rest.get(hub`/applications`, (req, res, ctx) => {
    const scenario = getPrototypeScenario();
    if (scenario === "apiError") {
      return res(
        ctx.status(503),
        ctx.json({ message: "The prototype API dependency is unavailable." })
      );
    }
    const applications = selectPortfolio(mockApplicationArray);
    if (scenario === "loading") {
      return res(ctx.delay(10000), ctx.json(applications));
    }
    if (scenario === "initial") {
      return res(ctx.json([]));
    }
    return res(ctx.json(applications));
  }),
  rest.get(hub`/applications/:id`, (req, res, ctx) => {
    const { id } = req.params;
    const mockApplication = mockApplicationArray.find(
      (app) => app.id === parseInt(id as string, 10)
    );
    const scenario = getPrototypeScenario();
    if (scenario === "apiError") {
      return res(
        ctx.status(503),
        ctx.json({ message: "The prototype API dependency is unavailable." })
      );
    }
    if (mockApplication) {
      return scenario === "loading"
        ? res(ctx.delay(10000), ctx.json(mockApplication))
        : res(ctx.json(mockApplication));
    } else {
      return res(
        ctx.status(404),
        ctx.json({ message: "Application not found" })
      );
    }
  }),
  rest.post(hub`/applications`, async (req, res, ctx) => {
    const newApplication: Application = await req.json();
    newApplication.id = generateRandomId(1000, 9999);

    const existingApplicationIndex = mockApplicationArray.findIndex(
      (app) => app.id === newApplication.id
    );

    if (existingApplicationIndex !== -1) {
      mockApplicationArray[existingApplicationIndex] = newApplication;
      return res(
        ctx.status(200),
        ctx.json({ message: "Application updated successfully" })
      );
    } else {
      mockApplicationArray.push(newApplication);
      return res(
        ctx.status(201),
        ctx.json({ message: "Application created successfully" })
      );
    }
  }),
  rest.delete(hub`/applications`, async (req, res, ctx) => {
    const ids: number[] = await req.json();

    // Filter and remove applications from the mock array by their IDs
    ids.forEach((id) => {
      const existingApplicationIndex = mockApplicationArray.findIndex(
        (app) => app.id === id
      );

      if (existingApplicationIndex !== -1) {
        mockApplicationArray.splice(existingApplicationIndex, 1);
      }
    });

    return res(
      ctx.status(200),
      ctx.json({ message: "Applications deleted successfully" })
    );
  }),
];

export default handlers;
