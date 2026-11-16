jest.unmock("react-router-dom");

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
} = { skills: [] };

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: mockState.migration ? { 1: mockState.migration } : {},
    isLoading: mockState.migrationsLoading ?? false,
    fetchError: mockState.migrationsError ?? null,
  }),
  useFetchSkills: () => ({
    skills: mockState.skills,
    isLoading: mockState.skillsLoading ?? false,
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

const renderTab = () =>
  render(
    <Router history={createMemoryHistory()}>
      <SkillsTab applicationId={1} linkCrumbs={[]} archetypes={[]} />
    </Router>
  );

describe("SkillsTab", () => {
  beforeEach(() => {
    mockState.migration = undefined;
    mockState.migrationsLoading = undefined;
    mockState.migrationsError = undefined;
    mockState.skills = [];
    mockState.skillsLoading = undefined;
    mockState.skillsError = undefined;
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

  it("says where to add skills when none apply (AP6)", () => {
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

  it("says Unavailable, not empty, when the server gives no skills (X6)", () => {
    mockState.migration = view({ effectiveSkills: undefined });
    renderTab();
    expect(screen.getByText("agentic.common.unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.applicationDetail.skillsEmpty")
    ).not.toBeInTheDocument();
  });

  it("shows the app placeholder while the migration loads (AP9)", () => {
    mockState.migrationsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.applicationDetail.skillsEmpty")
    ).not.toBeInTheDocument();
  });

  it("without a plan, waits for the skills before listing them (AP9)", () => {
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

  it("shows the error state when the migration cannot be read (AP9)", () => {
    mockState.migrationsError = new Error("503");
    renderTab();
    expect(screen.getByText("message.unableToConnect")).toBeInTheDocument();
  });

  it("without a plan, shows the error state when the skills cannot be read (AP9)", () => {
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
});
