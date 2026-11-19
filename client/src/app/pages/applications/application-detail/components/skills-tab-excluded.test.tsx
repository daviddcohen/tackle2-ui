jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import {
  ApplicationMigrationView,
  EffectiveSkillAssociation,
} from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { SkillsTab } from "./skills-tab";

// The copy and counts of excluded skills, in English (skills-tab.test.tsx
// covers the states with keys).
jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const mockState: { migration?: ApplicationMigrationView } = {};

jest.mock("@app/pages/agentic/components/manage-skills-modal", () => ({
  ...jest.requireActual("@app/pages/agentic/components/manage-skills-modal"),
  useCanManageSkills: () => false,
}));

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: mockState.migration ? { 1: mockState.migration } : {},
    isLoading: false,
    fetchError: null,
  }),
  useFetchSkills: () => ({ skills: [], isLoading: false, fetchError: null }),
}));

const skill = (
  id: string,
  name: string,
  scope: EffectiveSkillAssociation["scope"] = "agent",
  scopeName = "Code Migrator"
): EffectiveSkillAssociation => ({ skill: { id, name }, scope, scopeName });

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  plan: { id: "5", name: "Legacy Java to RHEL" },
  effectiveSkills: [
    skill("1", "Quarkus patterns"),
    skill("2", "Java EE migration"),
  ],
  ...overrides,
});

const renderTab = () =>
  render(
    <Router history={createMemoryHistory()}>
      <SkillsTab
        applicationId={1}
        linkCrumbs={[]}
        archetypes={[]}
        onManageSkills={jest.fn()}
      />
    </Router>
  );

const STANDARD =
  "Skills the agents use when migrating this application, and where each one comes from.";
const WITH_EXCLUDED =
  "Skills for migrating this application and where each one comes from. Its migration plan excludes the skills marked Excluded, so they are not given to the agents.";

describe("SkillsTab, skills its migration plan excludes", () => {
  beforeEach(() => {
    mockState.migration = undefined;
  });

  it("counts the skills and adds no sentence when nothing is excluded", () => {
    mockState.migration = view();
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Skills (2)" })
    ).toBeInTheDocument();
    expect(screen.getByText(STANDARD)).toBeInTheDocument();
    expect(screen.queryByText("Excluded")).not.toBeInTheDocument();
  });

  it("keeps one excluded skill in name order, marked, and counts what is used", () => {
    mockState.migration = view({
      excludedSkills: [
        skill("8", "Containerization standards", "archetype", "Java EE"),
      ],
    });
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Skills (2 of 3 used)" })
    ).toBeInTheDocument();
    expect(screen.getByText(WITH_EXCLUDED)).toBeInTheDocument();
    const rows = within(screen.getByRole("grid", { name: "Skills" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Containerization standardsExcludedArchetype: Java EE",
      "Java EE migrationAgent: Code Migrator",
      "Quarkus patternsAgent: Code Migrator",
    ]);
    expect(
      within(rows[0]).getByRole("link", { name: "Containerization standards" })
    ).toHaveAttribute("href", "/skills/8");
  });

  it("counts several excluded skills, down to none used", () => {
    mockState.migration = view({
      effectiveSkills: [],
      excludedSkills: [
        skill("1", "Quarkus patterns"),
        skill("2", "Java EE migration"),
      ],
    });
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Skills (0 of 2 used)" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Excluded")).toHaveLength(2);
    // Excluded rows are not "no skills": the empty state does not show.
    expect(
      screen.queryByRole("link", { name: "Go to skills" })
    ).not.toBeInTheDocument();
  });

  it("stays Unavailable when the server gives no used skills, even with exclusions", () => {
    mockState.migration = view({
      effectiveSkills: undefined,
      excludedSkills: [skill("8", "Containerization standards")],
    });
    renderTab();
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("Containerization standards")
    ).not.toBeInTheDocument();
  });
});
