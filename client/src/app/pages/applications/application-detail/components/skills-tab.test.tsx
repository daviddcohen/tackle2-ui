jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView, Skill } from "@app/agentic";
import { Ref } from "@app/api/models";
import { render, screen, within } from "@app/test-config/test-utils";

import { SkillsTab } from "./skills-tab";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const mockState: {
  migration?: ApplicationMigrationView;
  migrationsLoading?: boolean;
  migrationsError?: unknown;
  skills: Skill[];
  skillsLoading?: boolean;
  skillsError?: unknown;
  canManageSkills: boolean;
} = { skills: [], canManageSkills: false };

jest.mock("@app/pages/agentic/components/manage-skills-modal", () => ({
  ...jest.requireActual("@app/pages/agentic/components/manage-skills-modal"),
  useCanManageSkills: () => mockState.canManageSkills,
}));

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: mockState.migration ? { 3: mockState.migration } : {},
    isLoading: mockState.migrationsLoading ?? false,
    fetchError: mockState.migrationsError ?? null,
  }),
  useFetchSkills: () => ({
    skills: mockState.skills,
    isLoading: mockState.skillsLoading ?? false,
    fetchError: mockState.skillsError ?? null,
  }),
}));

const javaEe: Ref = { id: 1, name: "Java EE Application" };
const legacyJava: Ref = { id: 3, name: "Legacy Java Application" };

const skill = (
  id: string,
  name: string,
  associations: Skill["associations"],
  loadPolicy: Skill["loadPolicy"] = "skill"
): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  associations,
  loadPolicy,
});

const skills: Skill[] = [
  skill("8", "EJB to CDI conversion patterns", [
    { scope: "application", resource: { id: 3, name: "Claims Processing" } },
    { scope: "archetype", resource: { id: 1, name: "Java EE Application" } },
  ]),
  skill("3", "Jakarta EE namespace migration", [
    { scope: "archetype", resource: { id: 1, name: "Java EE Application" } },
    { scope: "targetProfile", resource: { id: 11, name: "Quarkus 3.x" } },
  ]),
  skill(
    "5",
    "Corporate coding standards",
    [
      {
        scope: "archetype",
        resource: { id: 3, name: "Legacy Java Application" },
      },
    ],
    "rule"
  ),
  // Another application's skill: never listed here.
  skill("9", "Spring Boot 3 upgrade", [
    { scope: "application", resource: { id: 4, name: "Other" } },
  ]),
];

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  archetype: { id: 1, name: "Java EE Application" },
  targetProfile: { id: 11, name: "Quarkus 3.x" },
  plan: { id: "1", name: "Java EE to Quarkus" },
  ...overrides,
});

const runRef = { id: "1", name: "Run #1: Java EE to Quarkus" };

const intro =
  "When a migration plan runs, each stage also gets its agent's skills and the skills of the target profile the run uses.";

const onManageSkills = jest.fn();

const renderTab = (archetypes: Ref[] = [javaEe]) => {
  const history = createMemoryHistory({
    initialEntries: ["/applications/3?tab=skills"],
  });
  render(
    <Router history={history}>
      <SkillsTab
        applicationId={3}
        applicationName="Claims Processing"
        linkCrumbs={[]}
        archetypes={archetypes}
        onManageSkills={onManageSkills}
      />
    </Router>
  );
  return history;
};

const section = (name: string | RegExp) => screen.getByRole("region", { name });

const listedSkills = (name: string | RegExp) =>
  within(section(name))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);

describe("SkillsTab", () => {
  beforeEach(() => {
    mockState.migration = view();
    mockState.migrationsLoading = undefined;
    mockState.migrationsError = undefined;
    mockState.skills = skills;
    mockState.skillsLoading = undefined;
    mockState.skillsError = undefined;
    mockState.canManageSkills = false;
    onManageSkills.mockClear();
  });

  it("groups the inherited skills by owner: application, then archetype", () => {
    renderTab();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual([
      "Application skills (1)",
      "Archetype skills: Java EE Application (2)",
    ]);
    expect(listedSkills(/^Application skills/)).toEqual([
      "EJB to CDI conversion patterns",
    ]);
    expect(listedSkills(/^Archetype skills/)).toEqual([
      "EJB to CDI conversion patterns",
      "Jakarta EE namespace migration",
    ]);
    // Each group says how far its skills reach.
    expect(
      within(section(/^Application skills/)).getByText(
        "Agents also use these skills in every stage when they migrate this application."
      )
    ).toBeInTheDocument();
    // A target profile is picked by a run: not an application's own.
    expect(screen.queryByText(/Target profile skills/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Quarkus 3.x" })).toBeNull();
  });

  it("links each archetype where its skills are attached", () => {
    renderTab();
    expect(
      screen.getByRole("link", { name: "Java EE Application" })
    ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=1&ar%3Atab=2");
  });

  it("gives an application in two archetypes one group per archetype, by name", () => {
    renderTab([legacyJava, javaEe]);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Application skills (1)",
      "Archetype skills: Java EE Application (2)",
      "Archetype skills: Legacy Java Application (1)",
    ]);
    // A rule carries the "Always followed" marker after its name.
    expect(listedSkills(/Legacy Java Application/)).toEqual([
      "Corporate coding standardsAlways followed",
    ]);
  });

  it("says what a run adds and links to the latest run's skills", async () => {
    mockState.migration = view({ planRun: runRef });
    const history = renderTab();
    expect(screen.getByText(new RegExp(intro))).toBeInTheDocument();
    expect(screen.queryByText(/lists them before the run starts/)).toBeNull();
    await userEvent.click(
      screen.getByRole("link", {
        name: "See what each stage got in the latest run",
      })
    );
    expect(history.location.search).toBe("?tab=migration");
    expect(history.location.hash).toBe("#skills-by-stage");
  });

  it("before any run, says Run migration plan lists them, with no link", () => {
    renderTab();
    expect(
      screen.getByText(
        `${intro} Run migration plan lists them before the run starts.`
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /latest run/ })).toBeNull();
  });

  it("says the same for an application without a plan or a run", () => {
    mockState.migration = view({ plan: undefined, configured: false });
    renderTab();
    expect(
      screen.getByText(/Run migration plan lists them before the run starts./)
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /latest run/ })).toBeNull();
  });

  it("says when the application is in no archetype, with a way there", () => {
    mockState.migration = view({
      archetype: undefined,
      targetProfile: undefined,
      plan: undefined,
      configured: false,
    });
    renderTab([]);
    const group = section("Archetype skills");
    expect(
      within(group).getByText(
        /This application is not in any archetype, so it inherits no archetype skills./
      )
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("link", { name: "Go to archetypes" })
    ).toHaveAttribute("href", "/archetypes");
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("keeps an empty group with one sentence and no count", () => {
    mockState.skills = [];
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Application skills" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("No skills are attached to this application.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No skills are attached to this archetype.")
    ).toBeInTheDocument();
  });

  it("offers Manage skills to a writer, only on the application group", async () => {
    mockState.canManageSkills = true;
    renderTab();
    const buttons = screen.getAllByRole("button", { name: /Manage skills/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(
      "Manage skills for Claims Processing"
    );
    expect(buttons[0]).toHaveAttribute("id", "manage-skills-application-3");
    expect(within(section(/^Application skills/)).getByRole("button")).toBe(
      buttons[0]
    );
    await userEvent.click(buttons[0]);
    expect(onManageSkills).toHaveBeenCalled();
  });

  it("shows no Manage skills to a reader (read-only persona)", () => {
    renderTab();
    expect(screen.queryByRole("button", { name: /Manage skills/ })).toBeNull();
    expect(listedSkills(/^Application skills/)).toEqual([
      "EJB to CDI conversion patterns",
    ]);
  });

  it("waits for the skills before it shows any group", () => {
    mockState.skillsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows an error and no groups when the skills cannot be read", () => {
    mockState.skillsError = new Error("boom");
    renderTab();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("keeps the groups and says only what a run adds while the migration view loads", () => {
    mockState.migrationsLoading = true;
    mockState.migration = undefined;
    renderTab();
    expect(listedSkills(/^Application skills/)).toEqual([
      "EJB to CDI conversion patterns",
    ]);
    expect(screen.getByText(intro)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /latest run/ })).toBeNull();
  });

  it("keeps the groups and says only what a run adds when the migration view fails", () => {
    mockState.migrationsError = new Error("boom");
    mockState.migration = undefined;
    renderTab();
    expect(listedSkills(/^Archetype skills/)).toHaveLength(2);
    expect(screen.getByText(intro)).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });
});
