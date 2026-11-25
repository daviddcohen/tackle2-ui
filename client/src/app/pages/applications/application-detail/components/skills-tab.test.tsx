jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { Skill } from "@app/agentic";
import { Ref } from "@app/api/models";
import { render, screen, within } from "@app/test-config/test-utils";

import { SkillsTab } from "./skills-tab";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const mockState: {
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

const linkNames = (element: HTMLElement) =>
  within(element)
    .queryAllByRole("link")
    .map((link) => link.textContent);

/** Each archetype term's name and the skills listed beside it. */
const archetypeRows = () =>
  within(section(/^Archetype skills/))
    .queryAllByRole("term")
    .map((term) => [
      term.textContent,
      // The term and its value share a DescriptionListGroup.
      linkNames(term.nextElementSibling as HTMLElement),
    ]);

describe("SkillsTab", () => {
  beforeEach(() => {
    mockState.skills = skills;
    mockState.skillsLoading = undefined;
    mockState.skillsError = undefined;
    mockState.canManageSkills = false;
    onManageSkills.mockClear();
  });

  it("shows the application's own skills, then the ones its archetype adds", () => {
    renderTab();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["Application skills (1)", "Archetype skills (2)"]);
    expect(linkNames(section(/^Application skills/))).toEqual([
      "EJB to CDI conversion patterns",
    ]);
    // A skill on both the application and its archetype shows in both.
    expect(archetypeRows()).toEqual([
      [
        "Java EE Application",
        ["EJB to CDI conversion patterns", "Jakarta EE namespace migration"],
      ],
    ]);
    // Each section states its scope once.
    expect(
      within(section(/^Application skills/)).getByText(
        "Agents can use these skills in every stage when they migrate this application."
      )
    ).toBeInTheDocument();
    expect(
      within(section(/^Archetype skills/)).getByText(
        "This application inherits these skills from its archetypes, where they are edited. Agents can use them in every stage."
      )
    ).toBeInTheDocument();
    // A target profile is picked by a run: not an application's own.
    expect(screen.queryByText(/Target profile/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Quarkus 3.x" })).toBeNull();
  });

  it("links skills to their pages and each archetype where its skills are edited", () => {
    renderTab();
    expect(
      screen.getByRole("link", { name: "Java EE Application" })
    ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=1");
    expect(
      within(section(/^Application skills/)).getByRole("link", {
        name: "EJB to CDI conversion patterns",
      })
    ).toHaveAttribute("href", "/skills/8");
  });

  it("gives each of two archetypes a term, by name, and counts a skill once", () => {
    mockState.skills = [
      ...skills,
      skill("3b", "Shared standards", [
        { scope: "archetype", resource: { id: 1, name: "Java EE" } },
        { scope: "archetype", resource: { id: 3, name: "Legacy Java" } },
      ]),
    ];
    renderTab([legacyJava, javaEe]);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["Application skills (1)", "Archetype skills (4)"]);
    expect(archetypeRows()).toEqual([
      [
        "Java EE Application",
        [
          "EJB to CDI conversion patterns",
          "Jakarta EE namespace migration",
          "Shared standards",
        ],
      ],
      [
        "Legacy Java Application",
        ["Corporate coding standards (Always followed)", "Shared standards"],
      ],
    ]);
    // One sentence for all archetypes, not one per archetype.
    expect(screen.getAllByText(/inherits these skills/)).toHaveLength(1);
  });

  it("says when the application is in no archetype, with a way there", () => {
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
    expect(within(group).queryByText(/inherits these skills/)).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("says None beside an archetype without skills, and drops empty counts", () => {
    mockState.skills = [];
    renderTab();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["Application skills", "Archetype skills"]);
    expect(
      screen.getByText("No skills are attached to this application.")
    ).toBeInTheDocument();
    expect(
      within(section("Archetype skills")).getByRole("definition")
    ).toHaveTextContent("None");
  });

  it("offers Manage skills to a writer, only on the application section", async () => {
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
    expect(linkNames(section(/^Application skills/))).toEqual([
      "EJB to CDI conversion patterns",
    ]);
  });

  it("waits for the skills before it shows any section", () => {
    mockState.skillsLoading = true;
    renderTab();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows an error and no sections when the skills cannot be read", () => {
    mockState.skillsError = new Error("boom");
    renderTab();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
  });
});
