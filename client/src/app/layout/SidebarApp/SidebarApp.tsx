import { FC, ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NavLink,
  Route,
  Switch,
  useHistory,
  useRouteMatch,
} from "react-router-dom";
import {
  Nav,
  NavExpandable,
  NavItem,
  NavList,
  PageSidebar,
  PageSidebarBody,
} from "@patternfly/react-core";

import { isAgenticEnabled, isDevtoolsEnabled } from "@app/Constants";
import { AdminPaths, DevPaths, DevtoolPaths, UniversalPaths } from "@app/Paths";
import {
  administrationRoutes,
  agenticAdministrationRoutes,
  agenticRoutes,
  devtoolRoutes,
  migrationRoutes,
  toRoutePath,
  universalRoutes,
} from "@app/Routes";
import { useHasSomeScopes } from "@app/auth";
import { adminViewScopes } from "@app/auth/roles-to-scopes";
import SimpleSelect from "@app/components/FilterToolbar/components/SimpleSelect";
import { agenticConfigurationReadScopes } from "@app/scopes";

import "./SidebarApp.css";

const PersonaDefinition = {
  ADMINISTRATION: {
    label: "Administration",
    startPath: AdminPaths.general,
  },
  MIGRATION: {
    label: "Migration",
    startPath: DevPaths.applications,
  },
  DEVTOOL: {
    label: "Development Tools",
    startPath: DevtoolPaths.schemaDefined,
  },
} as const;

type PersonaType = keyof typeof PersonaDefinition;

export const SidebarApp: React.FC = () => {
  const [lastPersona, setLastPersona] = useState<PersonaType>();
  return (
    <Switch>
      {[...migrationRoutes, ...agenticRoutes].map((route, index) => (
        <Route
          path={toRoutePath(route)}
          exact={route.exact}
          key={index}
          render={() => <MigrationSidebar setLastPersona={setLastPersona} />}
        />
      ))}
      {[...administrationRoutes, ...agenticAdministrationRoutes].map(
        (route, index) => (
          <Route
            path={toRoutePath(route)}
            exact={route.exact}
            key={index}
            render={() => <AdminSidebar setLastPersona={setLastPersona} />}
          />
        )
      )}
      {devtoolRoutes.map(({ path, exact }, index) => (
        <Route
          path={path}
          exact={exact}
          key={index}
          render={() => <DevtoolSidebar setLastPersona={setLastPersona} />}
        />
      ))}
      {universalRoutes.map(({ path, exact }, index) => (
        <Route
          path={path}
          exact={exact}
          key={index}
          render={() =>
            lastPersona === "ADMINISTRATION" ? (
              <AdminSidebar setLastPersona={setLastPersona} />
            ) : (
              <MigrationSidebar setLastPersona={setLastPersona} />
            )
          }
        />
      ))}
    </Switch>
  );
};

/**
 * A sidebar link marked current (PatternFly `pf-m-current` and
 * `aria-current="page"`) while its route, or any route below it, is open.
 * PatternFly's NavItem sets `aria-current` from its own `isActive` prop and
 * overrides the one react-router's NavLink would add.
 */
const SidebarNavItem: FC<{ to: string; children: ReactNode }> = ({
  to,
  children,
}) => {
  const isActive = useRouteMatch(to) != null;
  return (
    <NavItem isActive={isActive}>
      <NavLink to={to}>{children}</NavLink>
    </NavItem>
  );
};

const PersonaSidebar: FC<{
  children: ReactNode;
  selectedPersona: PersonaType;
  setLastPersona: (persona: PersonaType) => void;
}> = ({ children, selectedPersona, setLastPersona }) => {
  const { t } = useTranslation();
  const adminAccess = useHasSomeScopes(adminViewScopes);

  useEffect(() => {
    setLastPersona(selectedPersona);
  }, [selectedPersona, setLastPersona]);

  const personaOptions = [
    "MIGRATION",
    adminAccess && "ADMINISTRATION",
    isDevtoolsEnabled && "DEVTOOL",
  ].filter<PersonaType>(Boolean);

  const history = useHistory();
  return (
    <PageSidebar>
      <div className="perspective">
        <SimpleSelect
          toggleId="persona-select"
          toggleAriaLabel={t("sidebar.selectPersona", {
            persona: PersonaDefinition[selectedPersona]?.label,
          })}
          isFullWidth
          value={selectedPersona}
          options={personaOptions.map((value) => ({
            value,
            label: PersonaDefinition[value]?.label,
          }))}
          onSelect={(value) => {
            const startPath =
              PersonaDefinition[value as PersonaType]?.startPath;
            if (value !== selectedPersona && startPath) {
              history.push(startPath);
            }
          }}
        />
      </div>
      <PageSidebarBody>
        <Nav id="nav-primary" aria-label="Nav">
          {children}
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );
};

const MigrationSidebar = ({
  setLastPersona,
}: {
  setLastPersona: (persona: PersonaType) => void;
}) => {
  const { t } = useTranslation();
  const canViewMigrationAutomation =
    useHasSomeScopes(agenticConfigurationReadScopes) && isAgenticEnabled;

  return (
    <PersonaSidebar selectedPersona="MIGRATION" setLastPersona={setLastPersona}>
      <NavList title="Global">
        <NavExpandable
          title={t("sidebar.group.applications")}
          srText={t("sidebar.group.applications")}
          groupId="migration-applications"
          isExpanded
        >
          <SidebarNavItem to={DevPaths.applications}>
            {t("sidebar.applicationInventory")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.archetypes}>
            {t("sidebar.archetypes")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.migrationWaves}>
            {t("sidebar.migrationWaves")}
          </SidebarNavItem>
        </NavExpandable>
        <NavExpandable
          title={t("sidebar.group.analysisResults")}
          srText={t("sidebar.group.analysisResults")}
          groupId="migration-analysis-results"
          isExpanded
        >
          <SidebarNavItem to={DevPaths.reports}>
            {t("sidebar.reports")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.issuesAllTab}>
            {t("sidebar.issues")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.insightsAllTab}>
            {t("sidebar.insights")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.dependencies}>
            {t("sidebar.dependencies")}
          </SidebarNavItem>
        </NavExpandable>
        <NavExpandable
          title={t("sidebar.group.configuration")}
          srText={t("sidebar.group.configuration")}
          groupId="migration-configuration"
          isExpanded
        >
          <SidebarNavItem to={DevPaths.analysisProfiles}>
            {t("sidebar.analysisProfiles")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.controls}>
            {t("sidebar.controls")}
          </SidebarNavItem>
          <SidebarNavItem to={DevPaths.migrationTargets}>
            {t("sidebar.customMigrationTargets")}
          </SidebarNavItem>
          <SidebarNavItem to={UniversalPaths.tasks}>
            {t("sidebar.tasks")}
          </SidebarNavItem>
        </NavExpandable>
        {canViewMigrationAutomation && (
          <NavExpandable
            title={t("sidebar.group.agenticConfiguration")}
            srText={t("sidebar.group.agenticConfiguration")}
            groupId="migration-agentic"
            isExpanded
          >
            <SidebarNavItem to={DevPaths.agents}>
              {t("sidebar.agents")}
            </SidebarNavItem>
            <SidebarNavItem to={DevPaths.skills}>
              {t("sidebar.skills")}
            </SidebarNavItem>
          </NavExpandable>
        )}
      </NavList>
    </PersonaSidebar>
  );
};

const AdminSidebar = ({
  setLastPersona,
}: {
  setLastPersona: (persona: PersonaType) => void;
}) => {
  const { t } = useTranslation();
  return (
    <PersonaSidebar
      selectedPersona="ADMINISTRATION"
      setLastPersona={setLastPersona}
    >
      <NavList title="Admin">
        <SidebarNavItem to={AdminPaths.general}>
          {t("terms.general")}
        </SidebarNavItem>
        <SidebarNavItem to={AdminPaths.identities}>
          {t("terms.credentials")}
        </SidebarNavItem>
        {isAgenticEnabled && (
          <>
            <SidebarNavItem to={AdminPaths.providers}>
              {t("sidebar.providers")}
            </SidebarNavItem>
            <SidebarNavItem to={AdminPaths.models}>
              {t("sidebar.models")}
            </SidebarNavItem>
          </>
        )}
        <NavExpandable
          title="Repositories"
          srText="SR Link"
          groupId="admin-repos"
          isExpanded
        >
          <SidebarNavItem to={AdminPaths.repositoriesGit}>Git</SidebarNavItem>
          <SidebarNavItem to={AdminPaths.repositoriesSvn}>
            Subversion
          </SidebarNavItem>
          <SidebarNavItem to={AdminPaths.repositoriesMvn}>Maven</SidebarNavItem>
        </NavExpandable>
        <SidebarNavItem to={AdminPaths.proxies}>Proxy</SidebarNavItem>
        <NavExpandable
          title="Issue management"
          srText="SR Link"
          groupId="admin-issue-management"
          isExpanded
        >
          <SidebarNavItem to={AdminPaths.jira}>Jira</SidebarNavItem>
        </NavExpandable>
        <SidebarNavItem to={AdminPaths.assessment}>
          {t("terms.assessmentQuestionnaires")}
        </SidebarNavItem>
        <SidebarNavItem to={AdminPaths.sourcePlatforms}>
          {t("terms.sourcePlatforms")}
        </SidebarNavItem>
        <SidebarNavItem to={AdminPaths.assetGenerators}>
          {t("terms.generators")}
        </SidebarNavItem>
        <SidebarNavItem to={UniversalPaths.tasks}>
          {t("sidebar.tasks")}
        </SidebarNavItem>
        <NavExpandable
          title={t("sidebar.group.userManagement")}
          srText={t("sidebar.group.userManagement")}
          groupId="admin-user-management"
          isExpanded
        >
          <SidebarNavItem to={AdminPaths.users}>
            {t("sidebar.users")}
          </SidebarNavItem>
          <SidebarNavItem to={UniversalPaths.tokens}>
            {t("sidebar.tokens")}
          </SidebarNavItem>
          <SidebarNavItem to={AdminPaths.roles}>
            {t("sidebar.roles")}
          </SidebarNavItem>
          <SidebarNavItem to={AdminPaths.scopes}>
            {t("sidebar.scopes")}
          </SidebarNavItem>
        </NavExpandable>
      </NavList>
    </PersonaSidebar>
  );
};

const DevtoolSidebar = !isDevtoolsEnabled
  ? () => null
  : ({
      setLastPersona,
    }: {
      setLastPersona: (persona: PersonaType) => void;
    }) => (
      <PersonaSidebar selectedPersona="DEVTOOL" setLastPersona={setLastPersona}>
        <NavList title="Devtool">
          <SidebarNavItem to={DevtoolPaths.schemaDefined}>
            SDF Playground
          </SidebarNavItem>
        </NavList>
      </PersonaSidebar>
    );
