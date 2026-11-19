jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView, Skill } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { SkillsTab } from "./skills-tab";

const mockState: {
  migration?: ApplicationMigrationView;
  migrationsLoading?: boolean;
  migrationsError?: unknown;
  skills: Skill[];
  skillsLoading?: boolean;
  skillsError?: unknown;
  skillsSuccess?: boolean;
  canManageSkills: boolean;
} = { skills: [], canManageSkills: false };

jest.mock("@app/pages/agentic/components/manage-skills-modal", () => ({
  ...jest.requireActual("@app/pages/agentic/components/manage-skills-modal"),
  useCanManageSkills: () => mockState.canManageSkills,
}));

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: mockState.migration ? { 1: mockState.migration } : {},
    isLoading: mockState.migrationsLoading ?? false,
    fetchError: mockState.migrationsError ?? null,
  }),
  useFetchSkills: () => ({
    skills: mockState.skills,
    isLoading: mockState.skillsLoading ?? false,
    isSuccess: mockState.skillsSuccess ?? false,
    fetchError: mockState.skillsError ?? null,
  }),
}));

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  plan: { id: "1", name: "Java EE to Quarkus" },
  ...overrides,
});

const onManageSkills = jest.fn();

const renderTab = () =>
  render(
    <Router history={createMemoryHistory()}>
      <SkillsTab
        applicationId={1}
        linkCrumbs={[]}
        archetypes={[]}
        onManageSkills={onManageSkills}
      />
    </Router>
  );

const manageButtons = () =>
  screen.queryAllByRole("button", {
    name: "agentic.skill.manageSkills.title",
  });

describe("SkillsTab", () => {
  beforeEach(() => {
    mockState.migration = undefined;
    mockState.migrationsLoading = undefined;
    mockState.migrationsError = undefined;
    mockState.skills = [];
    mockState.skillsLoading = undefined;
    mockState.skillsError = undefined;
    mockState.canManageSkills = false;
    mockState.skillsSuccess = undefined;
    onManageSkills.mockClear();
  });

  it("lists the effective skills, one row per skill, under a counted heading", () => {
    mockState.migration = view({
      effectiveSkills: [
        {
          skill: { id: "2", name: "EJB to CDI conversion patterns" },
          scope: "agent",
          scopeName: "Code Migrator",
        },
        {
          skill: { id: "2", name: "EJB to CDI conversion patterns" },
          scope: "archetype",
          scopeName: "Java EE Application",
        },
      ] as ApplicationMigrationView["effectiveSkills"],
    });
    renderTab();
    expect(
      screen.getByRole("heading", {
        name: "agentic.applicationDetail.skillsTitle",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("agentic.applicationDetail.skillsDescription")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "EJB to CDI conversion patterns" })
    ).toHaveLength(1);
  });

  it("says where to add skills when none apply", () => {
    mockState.migration = view({ effectiveSkills: [] });
    renderTab();
    expect(
      screen.getByRole("heading", {
        name: "agentic.applicationDetail.tabSkills",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("agentic.applicationDetail.skillsEmpty")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.applicationDetail.goToSkills" })
    ).toHaveAttribute("href", "/skills");
  });

  it("says Unavailable, not empty, when the server gives no skills", () => {
    mockState.migration = view({ effectiveSkills: undefined });
    renderTab();
    expect(screen.getByText("agentic.common.unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.applicationDetail.skillsEmpty")
    ).not.toBeInTheDocument();
  });

  it("shows the app placeholder while the migration loads", () => {
    mockState.migrationsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.applicationDetail.skillsEmpty")
    ).not.toBeInTheDocument();
  });

  it("without a plan, waits for the skills before listing them", () => {
    mockState.migration = view({ plan: undefined });
    mockState.skillsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("with a plan, does not wait for the skills list", () => {
    mockState.migration = view({ effectiveSkills: [] });
    mockState.skillsLoading = true;
    mockState.skillsError = new Error("503");
    renderTab();
    expect(
      screen.getByText("agentic.applicationDetail.skillsEmpty")
    ).toBeInTheDocument();
  });

  it("shows the error state when the migration cannot be read", () => {
    mockState.migrationsError = new Error("503");
    renderTab();
    expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
    // Without Manage skills there is no section heading over the error.
    expect(
      screen.queryByText("agentic.applicationDetail.tabSkills")
    ).toBeNull();
  });

  it("without a plan, shows the error state when the skills cannot be read", () => {
    mockState.migration = view({ plan: undefined });
    mockState.skillsError = new Error("503");
    renderTab();
    expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
  });

  it("without a plan, shows the skills associated with the application", () => {
    mockState.migration = view({ plan: undefined });
    renderTab();
    expect(
      screen.getByText("agentic.applicationDetail.skillsEmpty")
    ).toBeInTheDocument();
  });

  describe("Manage skills", () => {
    const effectiveSkills = [
      {
        skill: { id: "2", name: "EJB to CDI conversion patterns" },
        scope: "application",
        scopeName: "Customer Management",
      },
    ] as ApplicationMigrationView["effectiveSkills"];

    beforeEach(() => {
      mockState.canManageSkills = true;
    });

    it("sits on the heading's line next to the skills", async () => {
      mockState.migration = view({ effectiveSkills });
      renderTab();
      expect(manageButtons()).toHaveLength(1);
      await userEvent.click(manageButtons()[0]);
      expect(onManageSkills).toHaveBeenCalledTimes(1);
    });

    it("is offered when the server gives no skills (Unavailable)", () => {
      mockState.migration = view({ effectiveSkills: undefined });
      renderTab();
      expect(manageButtons()).toHaveLength(1);
    });

    it("replaces Go to skills in the empty state", async () => {
      mockState.migration = view({ effectiveSkills: [] });
      renderTab();
      expect(manageButtons()).toHaveLength(1);
      expect(
        screen.queryByRole("link", {
          name: "agentic.applicationDetail.goToSkills",
        })
      ).toBeNull();
      await userEvent.click(manageButtons()[0]);
      expect(onManageSkills).toHaveBeenCalledTimes(1);
    });

    it("gives way to Go to skills when no skill exists at all", () => {
      mockState.migration = view({ effectiveSkills: [] });
      mockState.skillsSuccess = true;
      mockState.skills = [];
      renderTab();
      expect(manageButtons()).toHaveLength(0);
      expect(
        screen.getByRole("link", {
          name: "agentic.applicationDetail.goToSkills",
        })
      ).toHaveAttribute("href", "/skills");
    });

    it("is not offered while loading", () => {
      mockState.migrationsLoading = true;
      renderTab();
      expect(manageButtons()).toHaveLength(0);
    });

    it("stays offered next to the error state: the modal says why", () => {
      mockState.migration = view({ plan: undefined });
      mockState.skillsError = new Error("503");
      renderTab();
      expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
      expect(manageButtons()).toHaveLength(1);
      expect(
        screen.getByText("agentic.applicationDetail.tabSkills")
      ).toBeInTheDocument();
    });

    it("keeps the same button when the empty state turns into the table", () => {
      mockState.migration = view({ effectiveSkills: [] });
      const { rerender } = renderTab();
      const [button] = manageButtons();
      button.focus();

      mockState.migration = view({ effectiveSkills });
      rerender(
        <Router history={createMemoryHistory()}>
          <SkillsTab
            applicationId={1}
            linkCrumbs={[]}
            archetypes={[]}
            onManageSkills={onManageSkills}
          />
        </Router>
      );
      expect(
        screen.getByText("EJB to CDI conversion patterns")
      ).toBeInTheDocument();
      expect(manageButtons()).toEqual([button]);
      expect(button).toHaveFocus();
    });

    it("is not offered without the skill write scope", () => {
      mockState.canManageSkills = false;
      mockState.migration = view({ effectiveSkills });
      renderTab();
      expect(manageButtons()).toHaveLength(0);
    });
  });
});
