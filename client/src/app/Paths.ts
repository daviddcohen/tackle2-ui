export const DevPaths = {
  // Developer perspective
  analysisProfiles: "/analysis-profiles",
  applications: "/applications",
  applicationsAnalysisDetails:
    "/applications/:applicationId/analysis-details/:taskId",
  applicationsTaskDetails: "/applications/:applicationId/tasks/:taskId",
  applicationsAnalysisDetailsAttachment:
    "/applications/:applicationId/analysis-details/:taskId/attachments/:attachmentId",
  applicationsAnalysisTab: "/applications/analysis-tab",
  applicationsAssessmentTab: "/applications/assessment-tab",
  applicationsImports: "/applications/application-imports",
  applicationsImportsDetails: "/applications/application-imports/:importId",
  archetypesAssessment: "/archetypes/assessment/:assessmentId",
  applicationsAssessment: "/applications/assessment/:assessmentId",
  applicationAssessmentActions:
    "/applications/assessment-actions/:applicationId",
  viewArchetypes:
    "/applications/view-archetypes/:applicationId/archetypes/:archetypeId",
  archetypeAssessmentActions: "/archetypes/assessment-actions/:archetypeId",
  applicationAssessmentSummary:
    "/applications/assessment-summary/:assessmentId",
  archetypeAssessmentSummary: "/archetypes/assessment-summary/:assessmentId",
  applicationsReview: "/applications/:applicationId/review",
  archetypeReview: "/archetypes/:archetypeId/review",
  applicationsAnalysis: "/applications/analysis",
  archetypes: "/archetypes",
  archetypeTargetProfiles: "/archetypes/:archetypeId/target-profiles",
  controls: "/controls",
  controlsBusinessServices: "/controls/business-services",
  controlsStakeholders: "/controls/stakeholders",
  controlsStakeholderGroups: "/controls/stakeholder-groups",
  controlsJobFunctions: "/controls/job-functions",
  controlsTags: "/controls/tags",
  reports: "/reports",
  migrationWaves: "/migration-waves",
  waves: "/waves",

  issues: "/issues",
  issuesAllTab: "/issues/all",
  issuesAllAffectedApplications:
    "/issues/all/:ruleset/:rule/affected-applications",
  issuesSingleAppTab: "/issues/single-app",
  issuesSingleAppSelected: "/issues/single-app/:applicationId",

  insights: "/insights",
  insightsAllTab: "/insights/all",
  insightsAllAffectedApplications:
    "/insights/all/:ruleset/:rule/affected-applications",
  insightsSingleAppTab: "/insights/single-app",
  insightsSingleAppSelected: "/insights/single-app/:applicationId",

  dependencies: "/dependencies",
  migrationTargets: "/migration-targets",

  // Agentic migration
  migrationPlans: "/migration-plans",
  migrationPlanDetails: "/migration-plans/:planId",
  planRuns: "/plan-runs",
  planRunDetails: "/plan-runs/:runId",
  stageRunDetails: "/plan-runs/:runId/stages/:stageId",
  agents: "/agents",
  agentDetails: "/agents/:agentId",
  applicationDetails: "/applications/:applicationId",
  skills: "/skills",
  skillDetails: "/skills/:skillId",
  skillCollections: "/skills/collections",
  skillCollectionDetails: "/skills/collections/:collectionId",
} as const;

export type DevPathValues = (typeof DevPaths)[keyof typeof DevPaths];

export const UniversalPaths = {
  tasks: "/tasks",
  taskDetails: "/tasks/:taskId",
  taskDetailsAttachment: "/tasks/:taskId/attachments/:attachmentId",
  tokens: "/tokens",
} as const;

export type UniversalPathValues =
  (typeof UniversalPaths)[keyof typeof UniversalPaths];

export const AdminPaths = {
  // Administrator perspective
  general: "/general",
  providers: "/providers",
  models: "/models",
  identities: "/identities",
  repositories: "/repositories",
  repositoriesGit: "/repositories/git",
  repositoriesSvn: "/repositories/svn",
  repositoriesMvn: "/repositories/maven",
  proxies: "/proxies",
  assessment: "/assessment",
  questionnaire: "/questionnaire/:questionnaireId",
  jira: "/jira",
  sourcePlatforms: "/source-platforms",
  assetGenerators: "/asset-generators",
  users: "/users",
  roles: "/roles",
  scopes: "/scopes",
} as const;

export type AdminPathValues = (typeof AdminPaths)[keyof typeof AdminPaths];

const GeneralPaths = {
  base: "/",
  notFound: "/not-found",
} as const;

export const DevtoolPaths = {
  schemaDefined: "/devtools/schema-defined",
} as const;

export type DevtoolPathValues =
  (typeof DevtoolPaths)[keyof typeof DevtoolPaths];

export const Paths = {
  ...GeneralPaths,
  ...AdminPaths,
  ...DevPaths,
  ...UniversalPaths,
} as const;

export interface AssessmentActionsRoute {
  applicationId?: string;
  archetypeId?: string;
}

export interface ViewArchetypesRoute {
  applicationId?: string;
  archetypeId?: string;
}

export interface ReviewRoute {
  applicationId?: string;
  archetypeId?: string;
}

export interface ImportSummaryRoute {
  importId: string;
}

export interface AnalysisDetailsAttachmentRoute {
  applicationId: string;
  taskId: string;
  attachmentId: string;
}

export interface TaskDetailsAttachmentRoute {
  taskId: string;
  attachmentId: string;
  applicationId: string;
}

export interface ArchetypeTargetProfilesRoute {
  archetypeId: string;
}

export interface PlanRunDetailsRoute {
  runId: string;
}

export interface StageRunDetailsRoute {
  runId: string;
  stageId: string;
}

export interface AgentDetailsRoute {
  agentId: string;
}

export interface SkillDetailsRoute {
  skillId: string;
}

export interface SkillCollectionDetailsRoute {
  collectionId: string;
}

export interface ApplicationDetailsRoute {
  applicationId: string;
}
