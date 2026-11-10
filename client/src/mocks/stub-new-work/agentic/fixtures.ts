/**
 * Seed data for the agentic mock server. The store (`store.ts`) deep-copies
 * these arrays, so handlers never mutate them. Server-derived fields
 * (`effectiveSkills`, `applicationImpact`, `runCount`, agent-scope Skill
 * associations, ref names) are computed by the store on read.
 *
 * Ids are opaque strings; the values are numeric-looking so prototype URLs such
 * as `/agents/2` keep working. Hub references (applications, archetypes, target
 * profiles, identities) keep numeric Hub ids.
 */
import {
  Agent,
  AgentTestRun,
  AvailableModel,
  ExecutionPolicy,
  MigrationPlan,
  ModelProjection,
  PlanRun,
  Provider,
  ProviderType,
  Skill,
  SkillCollection,
  StageRun,
} from "@app/agentic";
import { mockApplicationArray } from "@mocks/stub-new-work/applications";

/** A stage run without its stage definition; the store adds the Plan's stage snapshot. */
export type StageRunTemplate = Omit<
  StageRun,
  "name" | "agent" | "instructions" | "requiresApproval" | "order"
>;

/** Content for a seeded plan run (configured world). See `execution.ts`. */
export type PlanRunTemplate = Omit<PlanRun, "stageRuns"> & {
  stageRuns: StageRunTemplate[];
};

const applicationRef = (id: number) => {
  const application = mockApplicationArray.find(
    (candidate) => candidate.id === id
  );
  if (!application) throw new Error(`Unknown fixture application ${id}`);
  return { id: application.id, name: application.name };
};

/**
 * Interactive: a started run stops at every stage that requires approval and
 * waits for a decision (the "action required" journey). Switch to
 * `unattended` (PUT /execution-policy) to let new runs pass approval gates on
 * their own; seeded "action required" runs still wait either way.
 */
export const mockExecutionPolicy: ExecutionPolicy = {
  interactionMode: "interactive",
};

export const mockGateways: ModelProjection[] = [
  {
    id: "1",
    name: "Claude 3.7 Sonnet",
    description: "Approved premium model for migration planning and review.",
    provider: { id: "1", name: "Anthropic Production" },
    model: "claude-3-7-sonnet",
    endpoint: "https://api.anthropic.com/v1",
    credential: { id: 601, name: "Anthropic production credential" },
    verificationStatus: "verified",
    isOrganizationDefault: true,
    lastVerified: "2026-08-31T07:45:00Z",
  },
  {
    id: "2",
    name: "GPT-4o",
    description: "Approved general model for code transformation tasks.",
    provider: { id: "2", name: "Azure OpenAI Corp" },
    model: "gpt-4o",
    endpoint: "https://corp-openai.azure.com/v1",
    credential: { id: 602, name: "Azure OpenAI production credential" },
    verificationStatus: "verified",
    isOrganizationDefault: false,
    lastVerified: "2026-08-31T07:42:00Z",
  },
  {
    id: "3",
    name: "Granite Code 20B",
    description: "Internal code model pending connectivity verification.",
    provider: { id: "3", name: "IBM watsonx" },
    model: "granite-code-20b",
    endpoint: "https://bam.res.ibm.com/v1",
    credential: { id: 603, name: "IBM model credential" },
    verificationStatus: "unreachable",
    isOrganizationDefault: false,
    lastVerified: "2026-08-30T16:15:00Z",
    statusReason: "The configured endpoint did not respond within 30 seconds.",
  },
  {
    id: "4",
    name: "Llama 3.3 70B",
    description: "Self-hosted model for lower-risk migration automation.",
    provider: { id: "4", name: "Internal Ollama" },
    model: "llama3.3:70b",
    endpoint: "https://models.apps.example.com/v1",
    credential: { id: 604, name: "Internal model credential" },
    verificationStatus: "verified",
    isOrganizationDefault: false,
    lastVerified: "2026-09-01T09:20:00Z",
  },
  {
    id: "5",
    name: "Gemini 2.5 Pro",
    description: "Evaluation model awaiting credential verification.",
    provider: { id: "5", name: "Google Vertex AI" },
    model: "gemini-2.5-pro",
    endpoint: "https://us-central1-aiplatform.googleapis.com/v1",
    credential: { id: 605, name: "Vertex AI evaluation credential" },
    verificationStatus: "pending",
    isOrganizationDefault: false,
    statusReason: "Verification has not been run for this Model.",
  },
];

export const mockSkills: Skill[] = [
  {
    id: "1",
    name: "Spring Boot to Quarkus migration",
    description:
      "Comprehensive guidance for migrating Spring Boot applications to Quarkus, covering dependency replacement, configuration changes, and runtime adaptation.",
    sourceType: "inline",
    associations: [
      {
        scope: "archetype",
        resource: { id: 2, name: "Spring Boot Application" },
      },
      {
        scope: "targetProfile",
        resource: { id: 21, name: "Quarkus 3.x" },
      },
      { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
    ],
    content: [
      "# Spring Boot to Quarkus Migration",
      "",
      "## Dependency Replacement",
      "- Replace `spring-boot-starter-web` with `quarkus-rest`",
      "- Replace `spring-boot-starter-data-jpa` with `quarkus-hibernate-orm-panache`",
      "- Replace `spring-boot-starter-security` with `quarkus-oidc`",
      "- Replace `spring-boot-starter-actuator` with `quarkus-smallrye-health` and `quarkus-micrometer`",
      "",
      "## Configuration",
      "- Move `application.properties` / `application.yml` entries to `application.properties` using Quarkus config keys",
      "- Replace `@Value` annotations with `@ConfigProperty`",
      "- Replace Spring profiles with Quarkus profiles (`%dev.`, `%prod.`)",
      "",
      "## Annotation Changes",
      "- `@RestController` + `@RequestMapping` become `@Path` + `@GET`/`@POST`/etc.",
      "- `@Autowired` becomes `@Inject`",
      "- `@Component` / `@Service` become `@ApplicationScoped`",
      "- `@SpringBootApplication` is removed; Quarkus uses classpath scanning automatically",
      "",
      "## Testing",
      "- Replace `@SpringBootTest` with `@QuarkusTest`",
      "- Replace `MockMvc` with RestAssured (included via `quarkus-rest-assured`)",
    ].join("\n"),
    createTime: "2026-07-15T10:00:00Z",
    updateTime: "2026-08-10T14:30:00Z",
  },
  {
    id: "2",
    name: "EJB to CDI conversion patterns",
    description:
      "Patterns for converting Enterprise JavaBeans to CDI managed beans, covering stateless, stateful, and singleton bean patterns.",
    sourceType: "inline",
    associations: [
      {
        scope: "archetype",
        resource: { id: 1, name: "Java EE Application" },
      },
      { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
      {
        scope: "application",
        resource: applicationRef(3),
      },
    ],
    content: [
      "# EJB to CDI Conversion Patterns",
      "",
      "## Stateless Session Beans",
      "- Replace `@Stateless` with `@ApplicationScoped`",
      "- Remove `@EJB` injection; use `@Inject` instead",
      "- Remove any JNDI lookup code; CDI handles discovery",
      "",
      "## Stateful Session Beans",
      "- Replace `@Stateful` with `@SessionScoped` (if HTTP-bound) or `@Dependent`",
      "- Ensure `@Remove` lifecycle methods are replaced with `@PreDestroy`",
      "",
      "## Singleton Beans",
      "- Replace `@Singleton` (javax.ejb) with `@Singleton` (javax.inject) + `@ApplicationScoped`",
      "- Replace `@Lock` concurrency control with explicit synchronization if needed",
      "",
      "## Timer Service",
      "- Replace `@Schedule` (EJB) with `@Scheduled` (Quarkus scheduler extension)",
    ].join("\n"),
    createTime: "2026-07-20T08:00:00Z",
    updateTime: "2026-07-20T08:00:00Z",
  },
  {
    id: "3",
    name: "Jakarta EE namespace migration",
    description:
      "Rules and scripts for migrating javax.* imports to jakarta.* namespace as required by Jakarta EE 9+.",
    sourceType: "git",
    associations: [
      {
        scope: "archetype",
        resource: { id: 1, name: "Java EE Application" },
      },
      {
        scope: "targetProfile",
        resource: { id: 11, name: "Quarkus 3.x" },
      },
    ],
    repoUrl: "https://github.com/konveyor/rulesets",
    repoBranch: "main",
    repoPath: "default/generated/jakarta-ee",
    createTime: "2026-06-01T12:00:00Z",
    updateTime: "2026-08-01T09:00:00Z",
  },
  {
    id: "4",
    name: "Quarkus best practices",
    description:
      "Community-maintained Quarkus patterns covering native compilation, dev services, and reactive programming.",
    sourceType: "oci",
    associations: [
      {
        scope: "targetProfile",
        resource: { id: 11, name: "Quarkus 3.x" },
      },
      {
        scope: "targetProfile",
        resource: { id: 21, name: "Quarkus 3.x" },
      },
    ],
    imageRef: "quay.io/konveyor/skill-quarkus:latest",
    createTime: "2026-05-10T10:00:00Z",
    updateTime: "2026-08-20T16:00:00Z",
  },
  {
    id: "5",
    name: "Corporate coding standards",
    description:
      "Organization-specific coding standards and architectural constraints for migrated applications.",
    sourceType: "inline",
    associations: [
      {
        scope: "application",
        resource: applicationRef(1),
      },
      {
        scope: "application",
        resource: applicationRef(2),
      },
      {
        scope: "application",
        resource: applicationRef(6),
      },
    ],
    content: [
      "# Corporate Coding Standards",
      "",
      "## Package Structure",
      "- All migrated applications must follow `com.corp.{domain}.{module}` package naming",
      "- REST endpoints must be under a `resource` or `api` sub-package",
      "- Business logic must be in a `service` sub-package",
      "",
      "## Error Handling",
      "- All REST endpoints must return RFC 7807 Problem Details for errors",
      "- Use `@ServerExceptionMapper` for global exception handling in Quarkus",
      "",
      "## Observability",
      "- All services must expose `/q/health/ready` and `/q/health/live` endpoints",
      "- Distributed tracing must be enabled via OpenTelemetry",
      "- Structured JSON logging is required in production profiles",
    ].join("\n"),
    createTime: "2026-08-01T10:00:00Z",
    updateTime: "2026-08-15T11:00:00Z",
  },
  {
    id: "6",
    name: "Database migration patterns",
    description:
      "Guidance for migrating database access layers, covering JPA, Hibernate, and connection pooling changes.",
    sourceType: "inline",
    associations: [
      { scope: "agent", resource: { id: "4", name: "Test Runner" } },
    ],
    content: [
      "# Database Migration Patterns",
      "",
      "## Connection Pooling",
      "- Replace HikariCP configuration with Agroal (Quarkus default pool)",
      "- Move datasource config from `spring.datasource.*` to `quarkus.datasource.*`",
      "",
      "## JPA / Hibernate",
      "- `spring.jpa.hibernate.ddl-auto` becomes `quarkus.hibernate-orm.database.generation`",
      "- Consider adopting Panache for simplified repository/active-record patterns",
      "- Replace Spring Data JPA repositories with Panache repositories",
      "",
      "## Flyway / Liquibase",
      "- Both are supported natively in Quarkus; migration scripts require no changes",
      "- Update extension: `quarkus-flyway` or `quarkus-liquibase`",
    ].join("\n"),
    createTime: "2026-07-25T09:00:00Z",
    updateTime: "2026-08-05T10:00:00Z",
  },
  {
    id: "7",
    name: "OpenShift deployment conventions",
    description:
      "Organization conventions for routes, health checks, resource limits, and deployment configuration on OpenShift.",
    sourceType: "git",
    associations: [
      { scope: "agent", resource: { id: "6", name: "Deployment Agent" } },
      {
        scope: "targetProfile",
        resource: { id: 12, name: "OpenShift lift and shift" },
      },
      {
        scope: "targetProfile",
        resource: { id: 22, name: "Spring Boot 3 on OpenShift" },
      },
      {
        scope: "targetProfile",
        resource: { id: 31, name: "Java 17 on OpenShift" },
      },
      {
        scope: "targetProfile",
        resource: { id: 41, name: ".NET 8 on OpenShift" },
      },
      {
        scope: "targetProfile",
        resource: { id: 42, name: "OpenShift lift and shift" },
      },
      {
        scope: "targetProfile",
        resource: { id: 51, name: "Node.js 22 on OpenShift" },
      },
    ],
    repoUrl: "https://git.example.com/platform/openshift-standards",
    repoBranch: "main",
    repoPath: "skills/deployment",
    createTime: "2026-07-28T11:00:00Z",
    updateTime: "2026-08-26T13:00:00Z",
  },
  {
    id: "8",
    name: "Containerization standards",
    description:
      "Approved container base images, build strategies, and runtime hardening guidance.",
    sourceType: "oci",
    associations: [
      { scope: "agent", resource: { id: "5", name: "Containerization Agent" } },
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
      {
        scope: "targetProfile",
        resource: { id: 12, name: "OpenShift lift and shift" },
      },
      {
        scope: "targetProfile",
        resource: { id: 42, name: "OpenShift lift and shift" },
      },
    ],
    imageRef: "quay.io/konveyor/skill-containerization:1.4",
    createTime: "2026-07-18T09:30:00Z",
    updateTime: "2026-08-24T15:45:00Z",
  },
  {
    id: "9",
    name: "Java runtime modernization",
    description:
      "Patterns for upgrading legacy Java applications to Java 17 and supported libraries.",
    sourceType: "git",
    associations: [
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
      {
        scope: "targetProfile",
        resource: { id: 31, name: "Java 17 on OpenShift" },
      },
      { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
    ],
    repoUrl: "https://github.com/konveyor/rulesets",
    repoBranch: "main",
    repoPath: "default/generated/openjdk17",
    createTime: "2026-06-16T08:00:00Z",
    updateTime: "2026-08-23T10:20:00Z",
  },
  {
    id: "10",
    name: ".NET 8 migration",
    description:
      "Guidance for moving .NET Framework services to .NET 8, including package, API, and project format changes.",
    sourceType: "oci",
    associations: [
      {
        scope: "targetProfile",
        resource: { id: 41, name: ".NET 8 on OpenShift" },
      },
    ],
    imageRef: "quay.io/konveyor/skill-dotnet8:2.1",
    createTime: "2026-07-02T12:00:00Z",
    updateTime: "2026-08-29T08:45:00Z",
  },
  {
    id: "11",
    name: "Platform security baseline",
    description:
      "Security review checklist for generated container and OpenShift resources.",
    sourceType: "inline",
    associations: [
      { scope: "agent", resource: { id: "7", name: "Security Review Agent" } },
      {
        scope: "application",
        resource: applicationRef(16),
      },
      {
        scope: "application",
        resource: applicationRef(17),
      },
    ],
    content: [
      "# Platform Security Baseline",
      "",
      "- Run containers as a non-root UID",
      "- Drop all Linux capabilities unless explicitly required",
      "- Reference credentials through Secrets",
      "- Require TLS for exposed routes",
      "- Record exceptions as migration evidence",
    ].join("\n"),
    createTime: "2026-08-03T10:00:00Z",
    updateTime: "2026-08-28T16:30:00Z",
  },
  {
    id: "12",
    name: "Node.js runtime modernization",
    description:
      "Dependency and runtime guidance for upgrading Node.js services to the current LTS release.",
    sourceType: "git",
    associations: [
      {
        scope: "agent",
        resource: { id: "8", name: "Dependency Upgrade Agent" },
      },
      { scope: "archetype", resource: { id: 5, name: "Node.js Service" } },
    ],
    repoUrl: "https://git.example.com/platform/node-modernization",
    repoBranch: "main",
    repoPath: "skills/node-22",
    createTime: "2026-07-09T14:00:00Z",
    updateTime: "2026-08-21T09:15:00Z",
  },
  {
    id: "13",
    name: "API compatibility checklist",
    description:
      "Review criteria for preserving externally consumed API contracts during modernization.",
    sourceType: "inline",
    associations: [
      {
        scope: "agent",
        resource: { id: "1", name: "Migration Proposal Agent" },
      },
      { scope: "agent", resource: { id: "7", name: "Security Review Agent" } },
      {
        scope: "archetype",
        resource: { id: 2, name: "Spring Boot Application" },
      },
      {
        scope: "targetProfile",
        resource: { id: 21, name: "Quarkus 3.x" },
      },
      {
        scope: "application",
        resource: applicationRef(18),
      },
      {
        scope: "application",
        resource: applicationRef(10),
      },
    ],
    content: [
      "# API Compatibility Checklist",
      "",
      "- Compare OpenAPI contracts before and after migration",
      "- Preserve status codes and required response fields",
      "- Flag authentication or authorization changes for review",
      "- Add contract tests for every known consumer",
    ].join("\n"),
    createTime: "2026-08-08T13:00:00Z",
    updateTime: "2026-08-25T11:40:00Z",
  },
  {
    id: "14",
    name: "Incremental transformation workflow",
    description:
      "Framework-neutral guidance for applying source changes in small, reviewable, and verifiable increments.",
    sourceType: "inline",
    associations: [
      { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
      {
        scope: "archetype",
        resource: { id: 2, name: "Spring Boot Application" },
      },
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
    ],
    content: [
      "# Incremental Transformation Workflow",
      "",
      "- Apply one logical transformation at a time",
      "- Build after each dependency or API change",
      "- Record changed files and validation evidence",
      "- Stop when an application-specific decision is required",
    ].join("\n"),
    createTime: "2026-08-09T10:00:00Z",
    updateTime: "2026-08-29T10:00:00Z",
  },
  {
    id: "15",
    name: "Build validation standards",
    description:
      "Framework-neutral build validation, diagnostic, and evidence requirements.",
    sourceType: "oci",
    associations: [
      { scope: "agent", resource: { id: "3", name: "Build Validator" } },
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
      {
        scope: "application",
        resource: applicationRef(4),
      },
    ],
    imageRef: "quay.io/konveyor/skill-build-validation:1.2",
    createTime: "2026-08-10T10:00:00Z",
    updateTime: "2026-08-30T10:00:00Z",
  },
  {
    id: "16",
    name: "Spring Boot 3 upgrade",
    description:
      "Spring Boot 3, Spring Framework 6, Jakarta namespace, and Java 17 upgrade guidance.",
    sourceType: "git",
    associations: [
      {
        scope: "targetProfile",
        resource: { id: 22, name: "Spring Boot 3 on OpenShift" },
      },
    ],
    repoUrl: "https://git.example.com/platform/spring-modernization",
    repoBranch: "main",
    repoPath: "skills/spring-boot-3",
    createTime: "2026-08-11T10:00:00Z",
    updateTime: "2026-08-31T10:00:00Z",
  },
];

const agentSkills = (agentId: string) =>
  mockSkills
    .filter((skill) =>
      skill.associations?.some(
        (association) =>
          association.scope === "agent" && association.resource.id === agentId
      )
    )
    .map((skill) => ({ id: skill.id, name: skill.name }));

export const mockAgents: Agent[] = [
  {
    id: "1",
    name: "Migration Proposal Agent",
    description:
      "Analyzes source code and generates an application-specific migration proposal with prioritized tasks and risk assessment.",
    model: { id: "1", name: "Claude 3.7 Sonnet" },
    capabilities: ["Application analysis", "Migration proposal generation"],
    parameters: [
      {
        name: "instructions",
        type: "string",
        description: "Optional migration proposal instructions.",
      },
    ],
    skills: agentSkills("1"),
    skillCollections: [{ id: "1", name: "Java modernization foundation" }],
    prompt:
      "Analyze the application source code and MTA analysis results to produce a detailed, prioritized migration proposal for this application. Identify high-risk areas, estimate effort per module, and recommend the order of changes to minimize build breakage during incremental migration.",
    createTime: "2026-07-20T10:00:00Z",
    updateTime: "2026-08-10T14:00:00Z",
  },
  {
    id: "2",
    name: "Code Migrator",
    description:
      "Applies code transformations to migrate source files according to the application-specific migration proposal and associated Skills.",
    model: { id: "1", name: "Claude 3.7 Sonnet" },
    capabilities: ["Code transformation", "Incremental commits"],
    parameters: [
      {
        name: "instructions",
        type: "string",
        description: "Optional code migration instructions.",
      },
    ],
    skills: agentSkills("2"),
    skillCollections: [{ id: "1", name: "Java modernization foundation" }],
    prompt:
      "Apply the transformations described in the application-specific migration proposal and associated Skills to the source code. Work file by file, make targeted changes, verify compilation, and commit changes incrementally.",
    createTime: "2026-07-20T10:00:00Z",
    updateTime: "2026-08-10T14:00:00Z",
  },
  {
    id: "3",
    name: "Build Validator",
    description:
      "Verifies that the migrated application builds successfully and identifies any remaining compilation errors.",
    model: { id: "2", name: "GPT-4o" },
    capabilities: ["Build validation", "Compilation diagnostics"],
    parameters: [],
    skills: agentSkills("3"),
    prompt:
      "You are a build validation agent. Run the application build process and analyze any compilation errors. For each error, determine whether it is a migration-related issue or a pre-existing problem. Propose fixes for migration-related build failures and report any issues that require human review.",
    createTime: "2026-07-22T10:00:00Z",
    updateTime: "2026-08-12T14:00:00Z",
  },
  {
    id: "4",
    name: "Test Runner",
    description:
      "Executes the test suite, updates broken tests to match the migrated code, and generates new tests for migrated components.",
    model: { id: "2", name: "GPT-4o" },
    capabilities: ["Test execution", "Test migration"],
    parameters: [],
    skills: agentSkills("4"),
    prompt:
      "You are a test maintenance agent. Run the existing test suite and identify tests that fail due to migration changes. Update test imports, annotations, and assertions to align with the new framework. Replace @SpringBootTest with @QuarkusTest, MockMvc with RestAssured, and adjust any framework-specific test utilities.",
    createTime: "2026-07-25T10:00:00Z",
    updateTime: "2026-08-15T14:00:00Z",
  },
  {
    id: "5",
    name: "Containerization Agent",
    description:
      "Creates container build assets and applies approved runtime hardening conventions.",
    model: { id: "4", name: "Llama 3.3 70B" },
    capabilities: ["Containerfile generation", "Runtime hardening"],
    parameters: [],
    skills: agentSkills("5"),
    prompt:
      "Create production-ready container build assets for the application. Use approved base images, minimize image layers, run as a non-root user, and document every application-specific exception.",
    createTime: "2026-08-01T09:00:00Z",
    updateTime: "2026-08-25T12:00:00Z",
  },
  {
    id: "6",
    name: "Deployment Agent",
    description:
      "Generates OpenShift deployment configuration from the target profile and application evidence.",
    model: { id: "2", name: "GPT-4o" },
    capabilities: ["Manifest generation", "Deployment configuration"],
    parameters: [],
    skills: agentSkills("6"),
    prompt:
      "Generate OpenShift deployment resources for the migrated application. Include probes, resource requests and limits, routes when required, and references to externalized configuration.",
    createTime: "2026-08-02T09:00:00Z",
    updateTime: "2026-08-26T12:00:00Z",
  },
  {
    id: "7",
    name: "Security Review Agent",
    description:
      "Reviews generated assets and migration changes against the platform security baseline.",
    model: { id: "1", name: "Claude 3.7 Sonnet" },
    capabilities: ["Security review", "Exception reporting"],
    parameters: [],
    skills: agentSkills("7"),
    prompt:
      "Review the migration output for security and API compatibility risks. Produce evidence for passed checks and request individual review for any exception that changes runtime privileges or public contracts.",
    createTime: "2026-08-04T09:00:00Z",
    updateTime: "2026-08-27T12:00:00Z",
  },
  {
    id: "8",
    name: "Dependency Upgrade Agent",
    description:
      "Updates runtime and package dependencies while preserving application behavior.",
    model: { id: "4", name: "Llama 3.3 70B" },
    capabilities: ["Dependency upgrades", "Compatibility remediation"],
    parameters: [],
    skills: agentSkills("8"),
    prompt:
      "Upgrade the application runtime and dependencies in small groups. Run tests after each group, replace unsupported packages, and record compatibility decisions as migration evidence.",
    createTime: "2026-08-06T09:00:00Z",
    updateTime: "2026-08-27T15:00:00Z",
  },
];

export const mockMigrationPlans: MigrationPlan[] = [
  {
    id: "1",
    name: "Java EE to Quarkus",
    description:
      "End-to-end migration plan for Java EE applications targeting Quarkus 3.x. Covers planning, code transformation, and build validation.",
    migrationPath: {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfiles: [{ id: 11, name: "Quarkus 3.x" }],
      isDefault: true,
    },
    stages: [
      {
        id: "1",
        name: "Prepare proposal",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Analyze the application and produce an application-specific migration proposal. Focus on dependency mapping, API surface changes, and configuration migration. Output a prioritized task list.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "2",
        name: "Migrate",
        agent: { id: "2", name: "Code Migrator" },
        instructions:
          "Execute the migration proposal produced in the previous Stage. Apply code transformations incrementally, committing each logical change separately.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "3",
        name: "Validate",
        agent: { id: "3", name: "Build Validator" },
        instructions:
          "Run a full build of the migrated application. Report any compilation errors and attempt automated fixes for common migration-related issues.",
        requiresApproval: false,
        order: 3,
      },
    ],
    createTime: "2026-08-01T10:00:00Z",
    updateTime: "2026-08-20T14:00:00Z",
  },
  {
    id: "2",
    name: "Spring Boot to Quarkus",
    description:
      "Migration plan for Spring Boot applications targeting Quarkus 3.x, including framework conversion and validation.",
    migrationPath: {
      archetype: { id: 2, name: "Spring Boot Application" },
      targetProfiles: [{ id: 21, name: "Quarkus 3.x" }],
      isDefault: true,
    },
    stages: [
      {
        id: "4",
        name: "Analyze",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Analyze the Spring Boot application for modernization opportunities. Identify deprecated APIs, outdated dependencies, and areas that would benefit from cloud-native patterns.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "5",
        name: "Migrate",
        agent: { id: "2", name: "Code Migrator" },
        instructions:
          "Apply the modernization changes identified in the analysis stage. Prioritize dependency updates, then API migrations, then configuration changes.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "6",
        name: "Validate",
        agent: { id: "3", name: "Build Validator" },
        instructions:
          "Build the migrated service and run its test suite. Report remaining warnings and stop when validation failures require application-specific review.",
        requiresApproval: false,
        order: 3,
      },
    ],
    createTime: "2026-08-10T10:00:00Z",
    updateTime: "2026-08-22T14:00:00Z",
  },
  {
    id: "3",
    name: "Java EE lift and shift",
    description:
      "Containerizes Java EE applications with minimal code changes and deploys them to OpenShift.",
    migrationPath: {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfiles: [{ id: 12, name: "OpenShift lift and shift" }],
      isDefault: true,
    },
    stages: [
      {
        id: "7",
        name: "Assess packaging",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Identify runtime dependencies, packaging constraints, and external configuration required for containerization.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "8",
        name: "Containerize",
        agent: { id: "5", name: "Containerization Agent" },
        instructions:
          "Create hardened container build assets using the approved Java application server base image.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "9",
        name: "Configure deployment",
        agent: { id: "6", name: "Deployment Agent" },
        instructions:
          "Generate OpenShift resources, health checks, configuration references, and routes.",
        requiresApproval: false,
        order: 3,
      },
      {
        id: "10",
        name: "Review security",
        agent: { id: "7", name: "Security Review Agent" },
        instructions:
          "Review the container and deployment resources against the platform security baseline.",
        requiresApproval: true,
        order: 4,
      },
    ],
    createTime: "2026-08-12T10:00:00Z",
    updateTime: "2026-08-28T14:00:00Z",
  },
  {
    id: "4",
    name: "Spring Boot 3 modernization",
    description:
      "Upgrades Spring Boot services to Spring Boot 3 and prepares them for OpenShift deployment.",
    migrationPath: {
      archetype: { id: 2, name: "Spring Boot Application" },
      targetProfiles: [{ id: 22, name: "Spring Boot 3 on OpenShift" }],
      isDefault: true,
    },
    stages: [
      {
        id: "11",
        name: "Plan upgrade",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Identify dependency, Java runtime, configuration, and API changes required for Spring Boot 3.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "12",
        name: "Upgrade dependencies",
        agent: { id: "2", name: "Code Migrator" },
        instructions:
          "Apply the approved framework and dependency upgrades while preserving service contracts.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "13",
        name: "Deploy and validate",
        agent: { id: "6", name: "Deployment Agent" },
        instructions:
          "Generate OpenShift resources and validate deployment readiness.",
        requiresApproval: false,
        order: 3,
      },
    ],
    createTime: "2026-08-13T10:00:00Z",
    updateTime: "2026-08-29T14:00:00Z",
  },
  {
    id: "5",
    name: "Legacy Java runtime modernization",
    description:
      "Upgrades legacy Java applications to Java 17, containerizes them, and prepares OpenShift deployment resources.",
    migrationPath: {
      archetype: { id: 3, name: "Legacy Java Application" },
      targetProfiles: [{ id: 31, name: "Java 17 on OpenShift" }],
      isDefault: true,
    },
    stages: [
      {
        id: "14",
        name: "Assess runtime",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Inventory runtime, dependency, and application server constraints for a Java 17 upgrade.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "15",
        name: "Upgrade Java",
        agent: { id: "2", name: "Code Migrator" },
        instructions:
          "Upgrade source, build configuration, and dependencies to Java 17.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "16",
        name: "Containerize",
        agent: { id: "5", name: "Containerization Agent" },
        instructions:
          "Create container build assets using the approved Java 17 runtime image.",
        requiresApproval: false,
        order: 3,
      },
      {
        id: "17",
        name: "Validate",
        agent: { id: "3", name: "Build Validator" },
        instructions:
          "Build the upgraded application and validate its container artifact.",
        requiresApproval: false,
        order: 4,
      },
    ],
    createTime: "2026-08-14T10:00:00Z",
    updateTime: "2026-08-30T14:00:00Z",
  },
  {
    id: "6",
    name: ".NET Framework to .NET 8",
    description:
      "Migrates .NET Framework applications to .NET 8 and generates OpenShift deployment configuration.",
    migrationPath: {
      archetype: { id: 4, name: ".NET Framework Application" },
      targetProfiles: [{ id: 41, name: ".NET 8 on OpenShift" }],
      isDefault: true,
    },
    stages: [
      {
        id: "18",
        name: "Assess compatibility",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Identify unsupported APIs, packages, Windows dependencies, and project format changes.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "19",
        name: "Migrate to .NET 8",
        agent: { id: "2", name: "Code Migrator" },
        instructions:
          "Convert projects and apply the approved .NET 8 compatibility changes.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "20",
        name: "Configure deployment",
        agent: { id: "6", name: "Deployment Agent" },
        instructions:
          "Generate OpenShift deployment resources for the migrated service.",
        requiresApproval: false,
        order: 3,
      },
      {
        id: "21",
        name: "Validate",
        agent: { id: "3", name: "Build Validator" },
        instructions:
          "Build, test, and validate the .NET 8 container artifact.",
        requiresApproval: false,
        order: 4,
      },
    ],
    createTime: "2026-08-15T10:00:00Z",
    updateTime: "2026-08-30T15:00:00Z",
  },
  {
    id: "7",
    name: ".NET lift and shift",
    description:
      "Containerizes compatible .NET Framework workloads with minimal application changes.",
    migrationPath: {
      archetype: { id: 4, name: ".NET Framework Application" },
      targetProfiles: [{ id: 42, name: "OpenShift lift and shift" }],
      isDefault: true,
    },
    stages: [
      {
        id: "22",
        name: "Assess platform constraints",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Confirm that runtime and infrastructure dependencies are compatible with the selected OpenShift target.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "23",
        name: "Containerize",
        agent: { id: "5", name: "Containerization Agent" },
        instructions:
          "Create container build assets with documented Windows runtime constraints.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "24",
        name: "Configure deployment",
        agent: { id: "6", name: "Deployment Agent" },
        instructions:
          "Generate deployment configuration for the selected OpenShift environment.",
        requiresApproval: false,
        order: 3,
      },
      {
        id: "25",
        name: "Review security",
        agent: { id: "7", name: "Security Review Agent" },
        instructions:
          "Review runtime privileges, Secrets, and route configuration.",
        requiresApproval: true,
        order: 4,
      },
    ],
    createTime: "2026-08-16T10:00:00Z",
    updateTime: "2026-08-31T12:00:00Z",
  },
  {
    id: "8",
    name: "Node.js runtime modernization",
    description:
      "Upgrades Node.js services to Node.js 22 and prepares secure OpenShift deployment resources.",
    migrationPath: {
      archetype: { id: 5, name: "Node.js Service" },
      targetProfiles: [{ id: 51, name: "Node.js 22 on OpenShift" }],
      isDefault: true,
    },
    stages: [
      {
        id: "26",
        name: "Assess dependencies",
        agent: { id: "1", name: "Migration Proposal Agent" },
        instructions:
          "Identify runtime, package, native module, and public API compatibility risks.",
        requiresApproval: true,
        order: 1,
      },
      {
        id: "27",
        name: "Upgrade runtime",
        agent: { id: "8", name: "Dependency Upgrade Agent" },
        instructions:
          "Upgrade Node.js and application dependencies in validated groups.",
        requiresApproval: false,
        order: 2,
      },
      {
        id: "28",
        name: "Configure deployment",
        agent: { id: "6", name: "Deployment Agent" },
        instructions:
          "Generate OpenShift resources, probes, resource limits, and route configuration.",
        requiresApproval: false,
        order: 3,
      },
      {
        id: "29",
        name: "Review and validate",
        agent: { id: "7", name: "Security Review Agent" },
        instructions:
          "Review security and API compatibility evidence before completion.",
        requiresApproval: true,
        order: 4,
      },
    ],
    createTime: "2026-08-18T10:00:00Z",
    updateTime: "2026-09-01T12:00:00Z",
  },
];

export const mockSkillCollections: SkillCollection[] = [
  {
    id: "1",
    name: "Java modernization foundation",
    description:
      "Focused Skills commonly used together for Java runtime and framework modernization.",
    skills: mockSkills
      .filter((skill) => ["1", "2", "3"].includes(skill.id))
      .map((skill) => ({ id: skill.id, name: skill.name })),
  },
  {
    id: "2",
    name: "OpenShift delivery checks",
    description:
      "Deployment and validation guidance for applications moving to OpenShift.",
    skills: mockSkills
      .filter((skill) => ["15", "6"].includes(skill.id))
      .map((skill) => ({ id: skill.id, name: skill.name })),
  },
  {
    id: "3",
    name: "Platform deployment pack",
    description:
      "Combined deployment and containerization guidance for any platform-bound migration.",
    skills: mockSkills
      .filter((skill) => ["7", "8"].includes(skill.id))
      .map((skill) => ({ id: skill.id, name: skill.name })),
  },
  {
    id: "4",
    name: "Security and compliance",
    description:
      "Security baseline and API compatibility review Skills applied to all migrations requiring compliance sign-off.",
    skills: mockSkills
      .filter((skill) => ["11", "13"].includes(skill.id))
      .map((skill) => ({ id: skill.id, name: skill.name })),
  },
];

/**
 * Plan runs of the "configured" world. `applications` is that world's
 * membership; the execution scenarios (queued, running, ...) re-seed the same
 * runs with their own membership and phases (see `execution.ts`).
 */
export const mockPlanRuns: PlanRunTemplate[] = [
  {
    id: "1",
    name: "Run #1 — Java EE to Quarkus",
    planId: "1",
    planName: "Java EE to Quarkus",
    applications: [applicationRef(3), applicationRef(8)],
    status: "Succeeded",
    targetBranch: "mta/agentic-migration",
    startedAt: "2026-09-20T08:00:00Z",
    completedAt: "2026-09-20T10:15:00Z",
    resolvedSkills: [
      {
        skill: { id: "3", name: "Jakarta EE namespace migration" },
        scope: "archetype",
        scopeName: "Java EE Application",
      },
      {
        skill: { id: "4", name: "Quarkus best practices" },
        scope: "targetProfile",
        scopeName: "Quarkus 3.x",
      },
      {
        skill: { id: "2", name: "EJB to CDI conversion patterns" },
        scope: "archetype",
        scopeName: "Java EE Application",
      },
      {
        skill: { id: "5", name: "Corporate coding standards" },
        scope: "application",
        scopeName: "Customer Management",
      },
    ],
    stageRuns: [
      {
        stageId: "1",
        status: "Succeeded",
        startedAt: "2026-09-20T08:00:00Z",
        completedAt: "2026-09-20T08:45:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Prepare proposal": analyzing application source code and MTA analysis results.',
            timestamp: "2026-09-20T08:00:30Z",
          },
          {
            role: "agent",
            content:
              "Identified 4 high-risk migration areas: EJB session beans, JMS messaging bridge, legacy JAX-WS services, and custom JNDI lookups. Estimating 14–18 hours of incremental transformation.",
            timestamp: "2026-09-20T08:18:00Z",
          },
          {
            role: "agent",
            content:
              "Migration proposal complete. Prioritized task list written to proposal file. Awaiting architect approval to proceed.",
            timestamp: "2026-09-20T08:44:00Z",
          },
        ],
        commits: [
          {
            hash: "a1b2c3d4e5f6",
            message: "Prepare proposal: apply migration changes",
            stageName: "Prepare proposal",
            url: "https://github.com/corp/customer-management/commit/a1b2c3d4e5f6",
          },
        ],
      },
      {
        stageId: "2",
        status: "Succeeded",
        startedAt: "2026-09-20T08:45:00Z",
        completedAt: "2026-09-20T09:30:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Migrate": applying transformations from the approved proposal.',
            timestamp: "2026-09-20T08:45:15Z",
          },
          {
            role: "agent",
            content:
              "Replaced 12 javax.* imports with jakarta.* equivalents across 6 files.",
            timestamp: "2026-09-20T08:52:00Z",
          },
          {
            role: "agent",
            content:
              "Converted 3 @Stateless EJBs to @ApplicationScoped CDI beans. Replaced @EJB injection with @Inject throughout.",
            timestamp: "2026-09-20T09:05:00Z",
          },
          {
            role: "agent",
            content:
              "Updated application.properties for Quarkus config keys. Replaced @Value with @ConfigProperty in 4 configuration classes.",
            timestamp: "2026-09-20T09:18:00Z",
          },
          {
            role: "agent",
            content:
              "Migration complete. 2 commits recorded. Build check passed.",
            timestamp: "2026-09-20T09:29:30Z",
          },
        ],
        commits: [
          {
            hash: "b2c3d4e5f6a1",
            message: "Migrate: apply framework and dependency changes",
            stageName: "Migrate",
            url: "https://github.com/corp/customer-management/commit/b2c3d4e5f6a1",
          },
          {
            hash: "c3d4e5f6a1b2",
            message: "Migrate: update configuration and annotations",
            stageName: "Migrate",
            url: "https://github.com/corp/customer-management/commit/c3d4e5f6a1b2",
          },
        ],
      },
      {
        stageId: "3",
        status: "Succeeded",
        startedAt: "2026-09-20T09:30:00Z",
        completedAt: "2026-09-20T10:15:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Validate": running full build of the migrated application.',
            timestamp: "2026-09-20T09:30:20Z",
          },
          {
            role: "agent",
            content:
              "Build succeeded. 0 compilation errors, 2 warnings (deprecation in test class — pre-existing). All 47 unit tests passed.",
            timestamp: "2026-09-20T10:14:00Z",
          },
        ],
        commits: [],
      },
    ],
  },
  {
    id: "2",
    name: "Run #2 — Spring Boot to Quarkus",
    planId: "2",
    planName: "Spring Boot to Quarkus",
    applications: [applicationRef(7), applicationRef(12)],
    status: "AwaitingApproval",
    targetBranch: "mta/spring-quarkus",
    startedAt: "2026-09-23T09:00:00Z",
    resolvedSkills: [
      {
        skill: { id: "1", name: "Spring Boot to Quarkus migration" },
        scope: "targetProfile",
        scopeName: "Quarkus 3.x",
      },
    ],
    stageRuns: [
      {
        stageId: "4",
        status: "AwaitingApproval",
        startedAt: "2026-09-23T09:00:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Analyze": scanning Spring Boot application for modernization opportunities.',
            timestamp: "2026-09-23T09:00:20Z",
          },
          {
            role: "agent",
            content:
              "Found 8 deprecated Spring APIs, 3 outdated dependency versions, and 2 components that would benefit from reactive patterns. Estimated migration complexity: medium.",
            timestamp: "2026-09-23T09:22:00Z",
          },
          {
            role: "agent",
            content:
              "Analysis complete. Proposal written and ready for architect review.",
            timestamp: "2026-09-23T09:38:00Z",
          },
        ],
        commits: [
          {
            hash: "c3d4e5f6a1b2",
            message: "Analyze: migration proposal ready for review",
            stageName: "Analyze",
          },
        ],
      },
      {
        stageId: "5",
        status: "Pending",
      },
      {
        stageId: "6",
        status: "Pending",
      },
    ],
  },
  {
    id: "3",
    name: "Run #3 — Java EE to Quarkus",
    planId: "1",
    planName: "Java EE to Quarkus",
    applications: [applicationRef(2)],
    status: "Failed",
    targetBranch: "mta/agentic-migration",
    startedAt: "2026-09-22T14:00:00Z",
    completedAt: "2026-09-22T14:08:00Z",
    resolvedSkills: [
      {
        skill: { id: "3", name: "Jakarta EE namespace migration" },
        scope: "archetype",
        scopeName: "Java EE Application",
      },
    ],
    stageRuns: [
      {
        stageId: "1",
        status: "Failed",
        startedAt: "2026-09-22T14:00:00Z",
        completedAt: "2026-09-22T14:08:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Prepare proposal": analyzing Settlement Desktop API source code.',
            timestamp: "2026-09-22T14:00:15Z",
          },
          {
            role: "agent",
            content:
              "Error: Unable to resolve dependency tree. 14 conflicting packages require manual resolution before migration can proceed.",
            timestamp: "2026-09-22T14:07:45Z",
          },
        ],
        output:
          "Error: Unable to resolve dependency tree. 14 conflicting packages require manual resolution before migration can proceed.",
        commits: [],
      },
      {
        stageId: "2",
        status: "Pending",
      },
      {
        stageId: "3",
        status: "Pending",
      },
    ],
  },
  {
    id: "4",
    name: "Run #4 — Java EE lift and shift",
    planId: "3",
    planName: "Java EE lift and shift",
    applications: [applicationRef(16)],
    status: "Running",
    targetBranch: "mta/lift-shift",
    startedAt: "2026-09-23T10:30:00Z",
    resolvedSkills: [
      {
        skill: { id: "8", name: "Containerization standards" },
        scope: "archetype",
        scopeName: "Java EE Application",
      },
    ],
    stageRuns: [
      {
        stageId: "7",
        status: "Running",
        startedAt: "2026-09-23T10:30:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Assess packaging": inventorying runtime dependencies and packaging constraints for Policy Engine and Claims API.',
            timestamp: "2026-09-23T10:30:20Z",
          },
          {
            role: "agent",
            content:
              "Policy Engine: detected JBoss EAP 7.4 runtime dependency, proprietary JCA connector, and datasource JNDI bindings that require externalized configuration.",
            timestamp: "2026-09-23T10:48:00Z",
          },
          {
            role: "agent",
            content:
              "Claims API: detected embedded ActiveMQ broker — must be replaced by an external broker or a sidecar container in OpenShift. Documenting as a packaging constraint.",
            timestamp: "2026-09-23T10:59:00Z",
          },
        ],
        commits: [],
      },
      { stageId: "8", status: "Pending" },
      { stageId: "9", status: "Pending" },
      { stageId: "10", status: "Pending" },
    ],
  },
  {
    id: "5",
    name: "Run #5 — Spring Boot 3 modernization",
    planId: "4",
    planName: "Spring Boot 3 modernization",
    applications: [applicationRef(12)],
    status: "Succeeded",
    targetBranch: "mta/spring-boot-3",
    startedAt: "2026-09-21T07:00:00Z",
    completedAt: "2026-09-21T09:45:00Z",
    resolvedSkills: [
      {
        skill: { id: "16", name: "Spring Boot 3 upgrade" },
        scope: "targetProfile",
        scopeName: "Spring Boot 3 on OpenShift",
      },
      {
        skill: { id: "7", name: "OpenShift deployment conventions" },
        scope: "agent",
        scopeName: "Deployment Agent",
      },
      {
        skill: { id: "14", name: "Incremental transformation workflow" },
        scope: "agent",
        scopeName: "Code Migrator",
      },
    ],
    stageRuns: [
      {
        stageId: "11",
        status: "Succeeded",
        startedAt: "2026-09-21T07:00:00Z",
        completedAt: "2026-09-21T07:50:00Z",
        commits: [
          {
            hash: "d4e5f6a1b2c3",
            message: "Plan upgrade: dependency and API change inventory",
            stageName: "Plan upgrade",
          },
        ],
      },
      {
        stageId: "12",
        status: "Succeeded",
        startedAt: "2026-09-21T07:50:00Z",
        completedAt: "2026-09-21T08:55:00Z",
        commits: [
          {
            hash: "e5f6a1b2c3d4",
            message:
              "Upgrade dependencies: Spring Boot 3 and Jakarta namespace",
            stageName: "Upgrade dependencies",
          },
          {
            hash: "f6a1b2c3d4e5",
            message: "Upgrade dependencies: Java 17 source and build config",
            stageName: "Upgrade dependencies",
          },
        ],
      },
      {
        stageId: "13",
        status: "Succeeded",
        startedAt: "2026-09-21T08:55:00Z",
        completedAt: "2026-09-21T09:45:00Z",
        commits: [
          {
            hash: "a1b2c3d4e5f7",
            message: "Deploy and validate: OpenShift resources generated",
            stageName: "Deploy and validate",
          },
        ],
      },
    ],
  },
  {
    id: "6",
    name: "Run #6 — Node.js runtime modernization",
    planId: "8",
    planName: "Node.js runtime modernization",
    applications: [applicationRef(18)],
    status: "Running",
    targetBranch: "mta/nodejs-22",
    startedAt: "2026-09-29T11:00:00Z",
    resolvedSkills: [
      {
        skill: { id: "12", name: "Node.js runtime modernization" },
        scope: "archetype",
        scopeName: "Node.js Service",
      },
      {
        skill: { id: "13", name: "API compatibility checklist" },
        scope: "agent",
        scopeName: "Migration Proposal Agent",
      },
    ],
    stageRuns: [
      {
        stageId: "26",
        status: "Succeeded",
        startedAt: "2026-09-29T11:00:00Z",
        completedAt: "2026-09-29T11:30:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Assess dependencies": scanning Partner Events API and Document Preview Service for Node.js compatibility risks.',
            timestamp: "2026-09-29T11:00:20Z",
          },
          {
            role: "agent",
            content:
              "Partner Events API: 2 packages use deprecated Node.js 14 APIs (Buffer.slice, url.parse). 1 native module requires recompilation for Node.js 22.",
            timestamp: "2026-09-29T11:12:00Z",
          },
          {
            role: "agent",
            content:
              "Document Preview Service: dependency on node-gyp-based native bindings. Compatibility assessment complete — risks documented.",
            timestamp: "2026-09-29T11:28:00Z",
          },
        ],
        commits: [
          {
            hash: "b2c3d4e5f6a2",
            message: "Assess dependencies: compatibility risks documented",
            stageName: "Assess dependencies",
          },
        ],
      },
      {
        stageId: "27",
        status: "Running",
        startedAt: "2026-09-29T11:30:00Z",
        messages: [
          {
            role: "agent",
            content:
              'Starting "Upgrade runtime": upgrading Node.js and dependencies for Partner Events API.',
            timestamp: "2026-09-29T11:30:15Z",
          },
          {
            role: "agent",
            content:
              "Upgraded core dependencies: node 22, express 4→5, winston 3.14. Running tests...",
            timestamp: "2026-09-29T11:52:00Z",
          },
        ],
        commits: [],
      },
      { stageId: "28", status: "Pending" },
      { stageId: "29", status: "Pending" },
    ],
  },
  {
    id: "7",
    name: "Run #7 — Legacy Java runtime modernization",
    planId: "5",
    planName: "Legacy Java runtime modernization",
    applications: [applicationRef(7)],
    status: "AwaitingApproval",
    targetBranch: "mta/java17",
    startedAt: "2026-09-28T14:00:00Z",
    resolvedSkills: [
      {
        skill: { id: "9", name: "Java runtime modernization" },
        scope: "archetype",
        scopeName: "Legacy Java Application",
      },
      {
        skill: { id: "8", name: "Containerization standards" },
        scope: "archetype",
        scopeName: "Legacy Java Application",
      },
      {
        skill: { id: "7", name: "OpenShift deployment conventions" },
        scope: "targetProfile",
        scopeName: "Java 17 on OpenShift",
      },
    ],
    stageRuns: [
      {
        stageId: "14",
        status: "AwaitingApproval",
        startedAt: "2026-09-28T14:00:00Z",
        commits: [
          {
            hash: "c3d4e5f6a1b3",
            message: "Assess runtime: Java 17 upgrade plan ready for review",
            stageName: "Assess runtime",
          },
        ],
      },
      { stageId: "15", status: "Pending" },
      { stageId: "16", status: "Pending" },
      { stageId: "17", status: "Pending" },
    ],
  },
];

export const mockProviders: Provider[] = [
  {
    id: "1",
    name: "Anthropic Production",
    description: "Primary Anthropic Claude endpoint for production use.",
    providerType: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    credential: { id: 601, name: "Anthropic production credential" },
    verificationStatus: "verified",
    lastVerified: "2026-09-20T08:00:00Z",
  },
  {
    id: "2",
    name: "Azure OpenAI Corp",
    description: "Corporate Azure OpenAI endpoint.",
    providerType: "azure_openai",
    endpoint: "https://corp-openai.azure.com/v1",
    credential: { id: 602, name: "Azure OpenAI production credential" },
    verificationStatus: "unreachable",
    lastVerified: "2026-09-18T07:45:00Z",
    statusReason: "The configured endpoint did not respond within 30 seconds.",
  },
  {
    id: "3",
    name: "IBM watsonx",
    description: "IBM-hosted code models.",
    providerType: "other",
    endpoint: "https://bam.res.ibm.com/v1",
    credential: { id: 603, name: "IBM model credential" },
    verificationStatus: "verified",
    lastVerified: "2026-09-12T11:00:00Z",
  },
  {
    id: "4",
    name: "Internal Ollama",
    description: "Self-hosted open models served from the internal cluster.",
    providerType: "ollama",
    endpoint: "https://models.apps.example.com/v1",
    credential: { id: 604, name: "Internal model credential" },
    verificationStatus: "verified",
    lastVerified: "2026-09-19T09:00:00Z",
  },
  {
    id: "5",
    name: "Google Vertex AI",
    description: "Vertex AI evaluation project.",
    providerType: "vertex",
    endpoint: "https://us-central1-aiplatform.googleapis.com/v1",
    credential: { id: 605, name: "Vertex AI evaluation credential" },
    verificationStatus: "pending",
    statusReason: "Credential verification is in progress.",
  },
];

export const mockAgentTestRuns: AgentTestRun[] = [
  {
    id: "9001",
    agent: { id: "1", name: "Migration Proposal Agent" },
    application: applicationRef(1),
    task: "Analyze the application and generate a migration proposal for moving from Java EE to Quarkus.",
    phase: "Succeeded",
    startedAt: "2026-09-18T14:00:00Z",
  },
  {
    id: "9002",
    agent: { id: "2", name: "Code Migrator" },
    application: applicationRef(5),
    task: "Apply the Spring Boot to Quarkus conversion patterns to the service layer.",
    phase: "Failed",
    startedAt: "2026-09-19T09:30:00Z",
  },
];

export const availableModelsByProviderType: Record<
  ProviderType,
  AvailableModel[]
> = {
  anthropic: [
    { id: "claude-opus-5-5", displayName: "Claude Opus 5.5" },
    { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5" },
  ],
  azure_openai: [
    { id: "gpt-4o", displayName: "GPT-4o" },
    { id: "gpt-4o-mini", displayName: "GPT-4o mini" },
  ],
  vertex: [
    { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
  ],
  ollama: [
    { id: "llama3.3:70b", displayName: "Llama 3.3 70B" },
    { id: "granite-code-20b", displayName: "Granite Code 20B" },
  ],
  openai: [
    { id: "gpt-4o", displayName: "GPT-4o" },
    { id: "o1", displayName: "o1" },
  ],
  other: [{ id: "granite-code-20b", displayName: "Granite Code 20B" }],
};
