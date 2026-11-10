import { type ComponentType, Suspense, lazy } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Redirect, Switch, useLocation } from "react-router-dom";

import {
  AdminPathValues,
  DevPathValues,
  DevtoolPathValues,
  DevtoolPaths,
  Paths,
  UniversalPathValues,
} from "@app/Paths";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ErrorFallback } from "@app/components/ErrorFallback";

import { isAgenticEnabled, isDevtoolsEnabled } from "./Constants";
import { adminViewScopes, migrationViewScopes } from "./auth/roles-to-scopes";
import { RouteWrapper } from "./components/RouteWrapper";
import { RepositoriesGit } from "./pages/repositories/Git";
import { RepositoriesMvn } from "./pages/repositories/Mvn";
import { RepositoriesSvn } from "./pages/repositories/Svn";
import { RolesPage } from "./pages/user-management/roles/roles";
import { ScopesPage } from "./pages/user-management/scopes/scopes";
import { TokensPage } from "./pages/user-management/tokens/tokens";
import { UsersPage } from "./pages/user-management/users/users";

const Review = lazy(() => import("./pages/review/review-page"));
const AssessmentSettings = lazy(
  () =>
    import(
      "./pages/assessment-management/assessment-settings/assessment-settings-page"
    )
);
const Applications = lazy(() => import("./pages/applications"));
const ManageImports = lazy(() => import("./pages/applications/manage-imports"));
const ImportDetails = lazy(
  () => import("./pages/applications/manage-imports-details")
);
const AnalysisDetails = lazy(
  () => import("./pages/applications/analysis-details")
);
const Reports = lazy(() => import("./pages/reports"));
const Controls = lazy(() => import("./pages/controls"));
const Identities = lazy(() => import("./pages/identities"));
const Proxies = lazy(() => import("./pages/proxies"));
const MigrationTargets = lazy(() => import("./pages/migration-targets"));
const General = lazy(() => import("./pages/general"));
const MigrationWaves = lazy(() => import("./pages/migration-waves"));
const Jira = lazy(() => import("./pages/external/jira"));
const Issues = lazy(() => import("./pages/issues/issues-page"));
const IssuesAffectedApplications = lazy(
  () => import("./pages/issues/affected-applications-page")
);
const Insights = lazy(() => import("./pages/insights/insights-page"));
const InsightsAffectedApplications = lazy(
  () => import("./pages/insights/affected-applications-page")
);
const Dependencies = lazy(() => import("./pages/dependencies"));

const Questionnaire = lazy(
  () => import("./pages/assessment-management/questionnaire/questionnaire-page")
);

const ViewArchetypes = lazy(
  () =>
    import("./pages/assessment/components/view-archetypes/view-archetypes-page")
);
const AssessmentActions = lazy(
  () =>
    import(
      "./pages/assessment/components/assessment-actions/assessment-actions-page"
    )
);
const Archetypes = lazy(() => import("./pages/archetypes/archetypes-page"));
const TargetProfilesPage = lazy(
  () => import("./pages/archetypes/target-profiles-page")
);

const AssessmentSummary = lazy(
  () =>
    import(
      "./pages/assessment/components/assessment-summary/assessment-summary-page"
    )
);

const TaskManager = lazy(() => import("./pages/tasks/tasks-page"));
const TaskDetails = lazy(() => import("./pages/tasks/TaskDetails"));
const AnalysisProfiles = lazy(() => import("./pages/analysis-profiles"));
const SourcePlatforms = lazy(
  () => import("./pages/source-platforms/source-platforms")
);

const AssetGenerators = lazy(
  () => import("./pages/asset-generators/asset-generators")
);

// Agentic migration pages
const MigrationPlans = lazy(() => import("./pages/agentic/plans/plans"));
const MigrationPlanDetails = lazy(
  () => import("./pages/agentic/plans/plan-details/plan-details")
);
const PlanRunsPage = lazy(() => import("./pages/agentic/plan-runs/plan-runs"));
const PlanRunDetail = lazy(
  () => import("./pages/agentic/plan-runs/plan-run-detail/plan-run-detail")
);
const StageRunDetail = lazy(
  () => import("./pages/agentic/plan-runs/stage-run-detail/stage-run-detail")
);
const AgentsPage = lazy(() => import("./pages/agentic/agents/agents"));
const AgentDetail = lazy(
  () => import("./pages/agentic/agents/agent-detail/agent-detail")
);
const SkillsPage = lazy(() => import("./pages/agentic/skills/skills"));
const SkillDetail = lazy(
  () => import("./pages/agentic/skills/skill-detail/skill-detail")
);
const SkillCollectionDetail = lazy(
  () =>
    import(
      "./pages/agentic/skills/skill-collection-detail/skill-collection-detail"
    )
);
const ApplicationDetail = lazy(
  () => import("./pages/applications/application-detail/application-detail")
);
const ModelsPage = lazy(() => import("./pages/agentic/models/models"));
const ProvidersPage = lazy(
  () => import("./pages/administration/providers/providers")
);

export interface IRoute<T> {
  path: T;
  comp: ComponentType;
  exact?: boolean;
  /**
   * Only match when every `:somethingId` param is numeric, so a sibling word
   * path (e.g. `/applications/analysis-tab`) is not captured as an id.
   */
  numericIds?: boolean;
}

const ID_PARAM = /:(\w+Id)(?=\/|$)/g;

/** The react-router path pattern to register for a route. */
export const toRoutePath = ({ path, numericIds }: IRoute<string>): string =>
  numericIds ? path.replace(ID_PARAM, ":$1(\\d+)") : path;

/**
 * Skill collections are listed on the Skills page (type filter
 * "collection"), so the declared collections path opens that view.
 */
const SkillCollectionsRedirect = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("skills:filters", JSON.stringify({ type: ["collection"] }));
  return (
    <Redirect to={{ pathname: Paths.skills, search: params.toString() }} />
  );
};

export const migrationRoutes: IRoute<DevPathValues>[] = [
  {
    path: Paths.applicationsImportsDetails,
    comp: ImportDetails,
    exact: false,
  },
  {
    path: Paths.applicationsAnalysisDetails,
    comp: AnalysisDetails,
    exact: true,
  },
  {
    path: Paths.applicationsTaskDetails,
    comp: TaskDetails,
    exact: true,
  },
  {
    path: Paths.applicationsAnalysisDetailsAttachment,
    comp: AnalysisDetails,
    exact: false,
  },
  {
    path: Paths.applicationsImports,
    comp: ManageImports,
    exact: false,
  },
  {
    path: Paths.archetypeReview,
    comp: Review,
    exact: false,
  },
  {
    path: Paths.applicationsReview,
    comp: Review,
    exact: false,
  },
  {
    path: Paths.applicationAssessmentActions,
    comp: AssessmentActions,
    exact: false,
  },
  {
    path: Paths.archetypeAssessmentActions,
    comp: AssessmentActions,
    exact: false,
  },
  {
    path: Paths.viewArchetypes,
    comp: ViewArchetypes,
    exact: false,
  },
  {
    path: Paths.applicationAssessmentSummary,
    comp: AssessmentSummary,
    exact: false,
  },
  {
    path: Paths.archetypeAssessmentSummary,
    comp: AssessmentSummary,
    exact: false,
  },
  // applicationDetails must come before applications (exact: false) to avoid being shadowed
  {
    path: Paths.applicationDetails,
    comp: ApplicationDetail,
    exact: true,
    numericIds: true,
  },
  {
    path: Paths.applications,
    comp: Applications,
    exact: false,
  },
  {
    path: Paths.controls,
    comp: Controls,
    exact: false,
  },
  {
    path: Paths.reports,
    comp: Reports,
    exact: false,
  },
  {
    path: Paths.migrationWaves,
    comp: MigrationWaves,
    exact: false,
  },
  {
    path: Paths.issuesAllAffectedApplications,
    comp: IssuesAffectedApplications,
    exact: false,
  },
  {
    path: Paths.issuesAllTab,
    comp: Issues,
    exact: false,
  },
  {
    path: Paths.issuesSingleAppTab,
    comp: Issues,
    exact: false,
  },
  {
    path: Paths.issuesSingleAppSelected,
    comp: Issues,
    exact: false,
  },
  {
    path: Paths.issues,
    comp: Issues,
    exact: false,
  },
  {
    path: Paths.insightsAllAffectedApplications,
    comp: InsightsAffectedApplications,
    exact: false,
  },
  {
    path: Paths.insightsAllTab,
    comp: Insights,
    exact: false,
  },
  {
    path: Paths.insightsSingleAppTab,
    comp: Insights,
    exact: false,
  },
  {
    path: Paths.insightsSingleAppSelected,
    comp: Insights,
    exact: false,
  },
  {
    path: Paths.insights,
    comp: Insights,
    exact: false,
  },
  {
    path: Paths.dependencies,
    comp: Dependencies,
    exact: false,
  },
  // Target profiles route must come before archetypes route due to route matching order
  {
    path: Paths.archetypeTargetProfiles,
    comp: TargetProfilesPage,
    exact: false,
  },
  {
    path: Paths.archetypes,
    comp: Archetypes,
    exact: false,
  },
  {
    path: Paths.migrationTargets,
    comp: MigrationTargets,
    exact: false,
  },
  {
    path: Paths.analysisProfiles,
    comp: AnalysisProfiles,
    exact: false,
  },
];

/**
 * The agentic migration UI. Registered only when AGENTIC_ENABLED opts the
 * deployment in (it defaults on when MOCK stubs the agentic endpoints): its
 * pages need the hub's agentic endpoints, so a deployment without that
 * backend gets no routes at all rather than routes that error. More specific
 * paths must come before less specific ones.
 *
 * Detail ids are deliberately not constrained to digits: the prototype mocks
 * numeric ids, but the agentic controller keys its resources by name, so the
 * pages (not the router) own invalid-id handling.
 */
export const agenticRoutes: IRoute<DevPathValues>[] = isAgenticEnabled
  ? [
      {
        path: Paths.stageRunDetails,
        comp: StageRunDetail,
        exact: true,
      },
      {
        path: Paths.planRunDetails,
        comp: PlanRunDetail,
        exact: true,
      },
      {
        path: Paths.planRuns,
        comp: PlanRunsPage,
        exact: true,
      },
      {
        path: Paths.migrationPlanDetails,
        comp: MigrationPlanDetails,
        exact: true,
      },
      {
        path: Paths.migrationPlans,
        comp: MigrationPlans,
        exact: true,
      },
      {
        path: Paths.agentDetails,
        comp: AgentDetail,
        exact: true,
      },
      {
        path: Paths.agents,
        comp: AgentsPage,
        exact: true,
      },
      // Skill collection paths must come before skills to avoid /skills matching first
      {
        path: Paths.skillCollections,
        comp: SkillCollectionsRedirect,
        exact: true,
      },
      {
        path: Paths.skillCollectionDetails,
        comp: SkillCollectionDetail,
        exact: true,
      },
      {
        path: Paths.skillDetails,
        comp: SkillDetail,
        exact: true,
      },
      {
        path: Paths.skills,
        comp: SkillsPage,
        exact: true,
      },
    ]
  : [];

export const universalRoutes: IRoute<UniversalPathValues>[] = [
  {
    path: Paths.tasks,
    comp: TaskManager,
    exact: true,
  },
  {
    path: Paths.taskDetails,
    comp: TaskDetails,
    exact: true,
  },
  {
    path: Paths.taskDetailsAttachment,
    comp: TaskDetails,
    exact: false,
  },
  {
    comp: TokensPage,
    path: Paths.tokens,
    exact: false,
  },
];

export const administrationRoutes: IRoute<AdminPathValues>[] = [
  {
    comp: General,
    path: Paths.general,
    exact: false,
  },
  {
    comp: Identities,
    path: Paths.identities,
    exact: false,
  },
  {
    comp: RepositoriesGit,
    path: Paths.repositoriesGit,
    exact: false,
  },
  {
    comp: RepositoriesSvn,
    path: Paths.repositoriesSvn,
    exact: false,
  },
  {
    comp: RepositoriesMvn,
    path: Paths.repositoriesMvn,
    exact: false,
  },
  {
    path: Paths.assessment,
    comp: AssessmentSettings,
    exact: false,
  },
  {
    path: Paths.questionnaire,
    comp: Questionnaire,
    exact: false,
  },
  { comp: Proxies, path: Paths.proxies, exact: false },
  {
    comp: Jira,
    path: Paths.jira,
    exact: false,
  },
  {
    comp: SourcePlatforms,
    path: Paths.sourcePlatforms,
    exact: false,
  },
  {
    comp: AssetGenerators,
    path: Paths.assetGenerators,
    exact: false,
  },
  {
    comp: UsersPage,
    path: Paths.users,
    exact: false,
  },
  {
    comp: RolesPage,
    path: Paths.roles,
    exact: false,
  },
  {
    comp: ScopesPage,
    path: Paths.scopes,
    exact: false,
  },
];

/** Agentic administration (Models, Providers); see `agenticRoutes`. */
export const agenticAdministrationRoutes: IRoute<AdminPathValues>[] =
  isAgenticEnabled
    ? [
        {
          comp: ProvidersPage,
          path: Paths.providers,
          exact: false,
        },
        {
          comp: ModelsPage,
          path: Paths.models,
          exact: false,
        },
      ]
    : [];

export const devtoolRoutes: IRoute<DevtoolPathValues>[] = isDevtoolsEnabled
  ? [
      {
        comp: lazy(
          () => import("./devtools/schema-defined/schema-defined-page")
        ),
        path: DevtoolPaths.schemaDefined,
        exact: false,
      },
    ]
  : [];

export const AppRoutes = () => {
  const location = useLocation();

  return (
    <Suspense fallback={<AppPlaceholder />}>
      <ErrorBoundary FallbackComponent={ErrorFallback} key={location.pathname}>
        <Switch>
          {[...migrationRoutes, ...agenticRoutes, ...universalRoutes].map(
            (route, index) => (
              <RouteWrapper
                comp={route.comp}
                key={index}
                requiredScopes={migrationViewScopes}
                path={toRoutePath(route)}
                exact={route.exact}
              />
            )
          )}
          {[...administrationRoutes, ...agenticAdministrationRoutes].map(
            (route, index) => (
              <RouteWrapper
                comp={route.comp}
                key={index}
                requiredScopes={adminViewScopes}
                path={toRoutePath(route)}
                exact={route.exact}
              />
            )
          )}
          {devtoolRoutes.map(({ comp, path, exact }, index) => (
            <RouteWrapper
              comp={comp}
              key={index}
              requiredScopes={migrationViewScopes}
              path={path}
              exact={exact}
            />
          ))}
          <Redirect
            from="*"
            to={{ pathname: "/applications", search: location.search }}
          />
        </Switch>
      </ErrorBoundary>
    </Suspense>
  );
};
