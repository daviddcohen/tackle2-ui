jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView } from "@app/agentic";
import { Application } from "@app/api/models";
import { agenticWorkflowRunsWriteScopes, skillsWriteScopes } from "@app/scopes";
import { render, screen, within } from "@app/test-config/test-utils";

import { DecoratedApplication } from "../useDecoratedApplications";

import { ApplicationsTable } from "./applications-table";

/*
 * The inventory's agentic actions only. The Hub reads are stubbed so the
 * table renders one application; scope gates are the subject.
 */

const mockState: {
  canRun: boolean;
  canManageSkills: boolean;
  migration: ApplicationMigrationView;
} = {
  canRun: true,
  canManageSkills: true,
  migration: {
    configured: true,
    intervention: "none",
    stages: [],
    preflight: "ready",
    plan: { id: "1", name: "Java EE to Quarkus" },
  },
};

// The overflow menu imports PF's ESM context directly; use the CommonJS build
// the rest of PF resolves to in Jest, so both share one context.
jest.mock(
  "@patternfly/react-core/dist/esm/components/OverflowMenu/OverflowMenuContext",
  () =>
    jest.requireActual(
      "@patternfly/react-core/dist/js/components/OverflowMenu/OverflowMenuContext"
    )
);

jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (scopes: string[]) =>
    scopes === skillsWriteScopes
      ? mockState.canManageSkills
      : scopes.some((scope) => agenticWorkflowRunsWriteScopes.includes(scope))
        ? mockState.canRun
        : true,
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

jest.mock("@app/queries/applications", () => ({
  ...jest.requireActual("@app/queries/applications"),
  useFetchApplications: () => ({
    data: [mockApplication],
    isFetching: false,
    error: null,
  }),
}));

jest.mock("@app/queries/tags", () => ({
  ...jest.requireActual("@app/queries/tags"),
  useFetchTagsWithTagItems: () => ({ tagItems: [] }),
}));

jest.mock("@app/queries/tasks", () => ({
  ...jest.requireActual("@app/queries/tasks"),
  useFetchTaskDashboard: () => ({ tasks: [] }),
}));

jest.mock("../useDecoratedApplications", () => ({
  ...jest.requireActual("../useDecoratedApplications"),
  useDecoratedApplications: () => ({
    applications: [mockApplication],
    applicationNames: [mockApplication.name],
    referencedArchetypeRefs: [],
    referencedBusinessServiceRefs: [],
    referencedPlatformRefs: [],
  }),
}));

jest.mock("@app/queries/agentic", () => ({
  ...jest.requireActual("@app/queries/agentic"),
  useFetchApplicationMigrations: () => ({
    migrations: { 1: mockState.migration },
    isLoading: false,
    fetchError: null,
  }),
}));

// The launcher gives no `open` without the run write scope, like the real one.
jest.mock("@app/pages/agentic/components/run-migration-plan-launcher", () => ({
  useRunMigrationPlanLauncher: () => ({
    open: mockState.canRun ? jest.fn() : undefined,
    modal: null,
  }),
}));

const renderTable = () =>
  render(
    <Router history={createMemoryHistory()}>
      <ApplicationsTable />
    </Router>
  );

const runItem = () =>
  screen.queryByRole("menuitem", { name: "agentic.execution.startMigration" });

const openToolbarKebab = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Application actions" }));

const openRowActions = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    within(screen.getByRole("row", { name: /Customer Management/ })).getByRole(
      "button",
      { name: "actions.rowActions" }
    )
  );

describe("ApplicationsTable agentic actions", () => {
  beforeEach(() => {
    mockState.canRun = true;
    mockState.canManageSkills = true;
    mockState.migration = {
      ...mockState.migration,
      preflight: "ready",
      preflightReason: undefined,
    };
  });

  it("offers Run migration plan in the toolbar kebab and the row actions", async () => {
    const user = userEvent.setup();
    renderTable();
    await openToolbarKebab(user);
    expect(runItem()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await openRowActions(user);
    expect(runItem()).toBeInTheDocument();
    expect(runItem()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("offers Run migration plan nowhere without the run write scope", async () => {
    mockState.canRun = false;
    const user = userEvent.setup();
    renderTable();
    await openToolbarKebab(user);
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(runItem()).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await openRowActions(user);
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(runItem()).not.toBeInTheDocument();
  });

  it("disables the row action of an application that cannot start", async () => {
    mockState.migration = {
      ...mockState.migration,
      preflight: "blocked",
      preflightReason: "A source control credential reference is missing.",
    };
    const user = userEvent.setup();
    renderTable();
    await openRowActions(user);
    expect(runItem()).toHaveAttribute("aria-disabled", "true");
    await user.hover(runItem() as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "A source control credential reference is missing."
    );
  });

  it("says only ready applications start when the server gives no reason", async () => {
    mockState.migration = {
      ...mockState.migration,
      preflight: "blocked",
      preflightReason: undefined,
    };
    const user = userEvent.setup();
    renderTable();
    await openRowActions(user);
    expect(runItem()).toHaveAttribute("aria-disabled", "true");
    await user.hover(runItem() as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "agentic.execution.readyOnly"
    );
  });

  it("offers Manage skills after Manage credentials and opens it for the application", async () => {
    const user = userEvent.setup();
    renderTable();
    await openRowActions(user);
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items.indexOf("agentic.skill.manageSkills.title")).toBe(
      items.indexOf("actions.manageCredentials") + 1
    );
    await user.click(
      screen.getByRole("menuitem", { name: "agentic.skill.manageSkills.title" })
    );
    expect(
      await screen.findByRole("dialog", {
        name: "agentic.skill.manageSkills.titleFor",
      })
    ).toBeInTheDocument();
  });

  it("offers no Manage skills without the skill write scope", async () => {
    mockState.canManageSkills = false;
    const user = userEvent.setup();
    renderTable();
    await openRowActions(user);
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("menuitem", {
        name: "agentic.skill.manageSkills.title",
      })
    ).not.toBeInTheDocument();
  });
});
