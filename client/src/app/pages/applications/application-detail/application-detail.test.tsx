jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Route, Router } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Application } from "@app/api/models";
import { skillsWriteScopes } from "@app/scopes";
import { render, screen } from "@app/test-config/test-utils";

import { DecoratedApplication } from "../useDecoratedApplications";

import ApplicationDetail from "./application-detail";

/*
 * Manage skills on the application page only: the Actions menu item and the
 * Skills tab button open one modal. Hub and agentic reads are stubbed; the
 * skill write scope is the subject.
 */

const mockState = { canManageSkills: true };

jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (scopes: string[]) =>
    scopes === skillsWriteScopes ? mockState.canManageSkills : true,
}));

const mockApplicationBase: Application = {
  id: 1,
  name: "Customer Management",
  migrationWave: null,
  tags: [],
  archetypes: [],
  assessments: [],
};

const mockApplication: DecoratedApplication = {
  ...mockApplicationBase,
  _: mockApplicationBase,
  tasks: {
    exist: false,
    latestHasCanceled: false,
    latestHasFailed: false,
    latestHasQueued: false,
    latestHasRunning: false,
    latestHasSuccess: false,
    latestHasSuccessWithErrors: false,
    currentAnalyzer: undefined,
  },
  tasksByKind: {},
  tasksStatus: "None",
  assessmentStatus: {
    isDirectlyAssessed: false,
    directStatus: "none",
    inheritedStatus: "none",
  },
  isReadyForRetrieveConfigurations: false,
  isReadyForGenerateAssets: false,
  direct: {},
};

// The upstream tabs are not the subject and pull in ESM-only modules.
jest.mock("../application-detail-drawer/tab-details-content", () => ({
  TabDetailsContent: () => null,
}));

jest.mock("@app/queries/applications", () => ({
  ...jest.requireActual("@app/queries/applications"),
  useFetchApplicationById: () => ({
    application: mockApplicationBase,
    isFetching: false,
    fetchError: null,
  }),
}));

jest.mock("@app/queries/tasks", () => ({
  ...jest.requireActual("@app/queries/tasks"),
  useFetchTaskDashboard: () => ({ tasks: [] }),
}));

jest.mock("../useDecoratedApplications", () => ({
  ...jest.requireActual("../useDecoratedApplications"),
  useDecoratedApplications: () => ({ applications: [mockApplication] }),
}));

jest.mock("@app/queries/agentic", () => ({
  ...jest.requireActual("@app/queries/agentic"),
  useFetchApplicationMigrations: () => ({
    migrations: {
      1: {
        configured: true,
        intervention: "none",
        stages: [],
        plan: { id: "1", name: "Java EE to Quarkus" },
        effectiveSkills: [],
      },
    },
    isLoading: false,
    fetchError: null,
  }),
  useFetchSkills: () => ({
    skills: [
      {
        id: "3",
        name: "Jakarta EE namespace migration",
        description: "",
        sourceType: "inline",
        associations: [],
      },
    ],
    isLoading: false,
    isSuccess: true,
    fetchError: null,
  }),
}));

const MANAGE = "agentic.skill.manageSkills.title";
const MANAGE_TITLE = "agentic.skill.manageSkills.titleFor";

const renderPage = () =>
  render(
    <Router
      history={createMemoryHistory({
        initialEntries: ["/applications/1?tab=skills"],
      })}
    >
      <Route path={DevPaths.applicationDetails}>
        <ApplicationDetail />
      </Route>
    </Router>
  );

const openActions = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    screen.getByRole("button", { name: "agentic.applicationDetail.actions" })
  );

describe("ApplicationDetail Manage skills", () => {
  beforeEach(() => {
    mockState.canManageSkills = true;
  });

  it("offers Manage skills after Manage credentials in the Actions menu", async () => {
    const user = userEvent.setup();
    renderPage();
    await openActions(user);
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items.indexOf(MANAGE)).toBe(
      items.indexOf("actions.manageCredentials") + 1
    );
    await user.click(screen.getByRole("menuitem", { name: MANAGE }));
    expect(
      await screen.findByRole("dialog", { name: MANAGE_TITLE })
    ).toBeInTheDocument();
  });

  it("opens the same modal from the Skills tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: MANAGE }));
    expect(screen.getAllByRole("dialog", { name: MANAGE_TITLE })).toHaveLength(
      1
    );
  });

  it("offers Manage skills nowhere without the skill write scope", async () => {
    mockState.canManageSkills = false;
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByRole("link", {
        name: "agentic.applicationDetail.goToSkills",
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MANAGE })).toBeNull();
    await openActions(user);
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(screen.queryByRole("menuitem", { name: MANAGE })).toBeNull();
  });
});
