jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { DecoratedApplication } from "../../useDecoratedApplications";

import { MigrationTab } from "./migration-tab";

const mockQueries: {
  migration?: ApplicationMigrationView;
} = {};

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: mockQueries.migration ? { 1: mockQueries.migration } : {},
    isLoading: false,
    fetchError: null,
  }),
  useFetchPlanRun: () => ({
    planRun: undefined,
    isLoading: false,
    fetchError: null,
  }),
  useResolveApplicationMigrationRequestMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@app/pages/agentic/components/run-migration-plan-launcher", () => ({
  useRunMigrationPlanLauncher: () => ({ open: jest.fn(), modal: null }),
}));

const application = (archetypes: DecoratedApplication["archetypes"]) =>
  ({
    id: 1,
    name: "Customer Management",
    archetypes,
  }) as DecoratedApplication;

const renderTab = (app: DecoratedApplication) =>
  render(
    <Router history={createMemoryHistory()}>
      <MigrationTab application={app} applicationId={1} linkCrumbs={[]} />
    </Router>
  );

describe("MigrationTab", () => {
  beforeEach(() => {
    mockQueries.migration = undefined;
  });

  describe("no migration path", () => {
    it("links to the target profiles of the application's archetype", () => {
      renderTab(application([{ id: 3, name: "Java EE Application" }]));
      expect(
        screen.getByRole("heading", {
          name: "agentic.execution.noMigrationPathTitle",
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText("agentic.execution.noMigrationPathBody")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "agentic.execution.viewTargetProfiles",
        })
      ).toHaveAttribute("href", "/archetypes/3/target-profiles");
    });

    it("sends an application without an archetype to the archetypes", () => {
      renderTab(application([]));
      expect(
        screen.getByText("agentic.execution.noArchetypeBody")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "agentic.execution.goToArchetypes" })
      ).toHaveAttribute("href", "/archetypes");
    });
  });
});
