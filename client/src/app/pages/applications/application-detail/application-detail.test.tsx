jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { createMemoryHistory } from "history";
import { Route, Router } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Application } from "@app/api/models";
import { skillsWriteScopes } from "@app/scopes";
import { render, screen } from "@app/test-config/test-utils";

import { DecoratedApplication } from "../useDecoratedApplications";

import ApplicationDetail from "./application-detail";

/*
 * Manage skills on the application page (the Actions menu item and the
 * Skills tab button open one modal), and how the page loads, fails and
 * says an application is missing. Hub and agentic reads are stubbed.
 */

const mockState: {
  canManageSkills: boolean;
  requestedIds: (number | undefined)[];
  fetch: {
    application?: Application;
    isFetching: boolean;
    fetchError: unknown;
  };
} = {
  canManageSkills: true,
  requestedIds: [],
  fetch: { isFetching: false, fetchError: null },
};

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
  useFetchApplicationById: (id?: number) => {
    mockState.requestedIds.push(id);
    return mockState.fetch;
  },
}));

jest.mock("@app/queries/tasks", () => ({
  ...jest.requireActual("@app/queries/tasks"),
  useFetchTaskDashboard: () => ({ tasks: [] }),
}));

jest.mock("../useDecoratedApplications", () => ({
  ...jest.requireActual("../useDecoratedApplications"),
  useDecoratedApplications: (applications: Application[]) => ({
    applications: applications.length > 0 ? [mockApplication] : [],
  }),
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

const renderPage = (entry = "/applications/1?tab=skills") => {
  const history = createMemoryHistory({ initialEntries: [entry] });
  render(
    <Router history={history}>
      <Route path={DevPaths.applicationDetails}>
        <ApplicationDetail />
      </Route>
    </Router>
  );
  return history;
};

const openActions = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    screen.getByRole("button", { name: "agentic.applicationDetail.actions" })
  );

beforeEach(() => {
  mockState.canManageSkills = true;
  mockState.requestedIds = [];
  mockState.fetch = {
    application: mockApplicationBase,
    isFetching: false,
    fetchError: null,
  };
});

const axiosError = (status: number) =>
  new AxiosError("Request failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message: `Status ${status}` },
  });

describe("ApplicationDetail Manage skills", () => {
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

describe("ApplicationDetail states", () => {
  it("shows the shared loading page until the application is there", () => {
    mockState.fetch = { isFetching: true, fetchError: null };
    renderPage();
    expect(screen.getByText("terms.loading")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    // The trail keeps its place, with the noun as its leaf.
    expect(screen.getByText("sidebar.applicationInventory")).toBeVisible();
  });

  it("says a missing application is not found, with a way back", async () => {
    const user = userEvent.setup();
    mockState.fetch = { isFetching: false, fetchError: axiosError(404) };
    const history = renderPage();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "agentic.applicationDetail.notFound",
      })
    ).toBeVisible();
    expect(
      screen.getByText("agentic.applicationDetail.notFoundBody")
    ).toBeVisible();
    expect(screen.queryByRole("tablist")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "agentic.applicationDetail.backToApplications",
      })
    );
    expect(history.location.pathname).toBe(DevPaths.applications);
  });

  it("says an id that can never exist is not found, without asking for it", () => {
    mockState.fetch = { isFetching: false, fetchError: null };
    renderPage("/applications/99999999999999999999");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "agentic.applicationDetail.notFound",
      })
    ).toBeVisible();
    expect(mockState.requestedIds.every((id) => id === undefined)).toBe(true);
  });

  it("shows the shared error when the application cannot be read", () => {
    mockState.fetch = { isFetching: false, fetchError: axiosError(500) };
    renderPage();
    expect(
      screen.getByRole("heading", { name: "message.unableToConnect" })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "agentic.applicationDetail.notFound",
      })
    ).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("sidebar.applicationInventory")).toBeVisible();
  });

  it("says a failed refresh first in the open tab, not above the header", () => {
    mockState.fetch = {
      application: mockApplicationBase,
      isFetching: false,
      fetchError: axiosError(500),
    };
    renderPage("/applications/1?tab=migration");
    const title = screen.getByRole("heading", {
      level: 1,
      name: "Customer Management",
    });
    const alertTitle = screen.getByText("agentic.applicationDetail.loadError");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toContainElement(alertTitle);
    // Its own section, first in the panel.
    const section = alertTitle.closest(".pf-v6-c-page__main-section");
    expect(section).toBe(panel.firstElementChild);
    expect(
      title.compareDocumentPosition(alertTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("pairs every tab with a panel it names and controls", () => {
    renderPage("/applications/1?tab=plan-runs");
    for (const tab of screen.getAllByRole("tab")) {
      const panel = document.getElementById(
        tab.getAttribute("aria-controls") ?? ""
      );
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    }
    expect(
      screen.getByRole("tabpanel", {
        name: "agentic.applicationDetail.tabPlanRuns",
      })
    ).toBeVisible();
  });
});
