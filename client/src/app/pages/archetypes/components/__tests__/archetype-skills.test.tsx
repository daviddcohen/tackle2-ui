import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Skill } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { ArchetypeSkills, ArchetypeSkillsHelp } from "../archetype-skills";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

const mockGrantedScopes = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [{ id: 11, name: "Quarkus 3.x", generators: [] }],
};

const skill = (
  id: string,
  name: string,
  associations: Skill["associations"],
  loadPolicy?: Skill["loadPolicy"]
): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  loadPolicy,
  associations,
});

const onArchetype = {
  scope: "archetype" as const,
  resource: { id: 1, name: "Java EE Application" },
};
const onProfile = {
  scope: "targetProfile" as const,
  resource: { id: 11, name: "Quarkus 3.x" },
};

const serveSkills = (resolver: Parameters<typeof rest.get>[1]) =>
  server.use(rest.get(AGENTIC_ENDPOINTS.skills, resolver));
const serveSkillList = (skills: Skill[]) =>
  serveSkills((_req, res, ctx) => res(ctx.json(skills)));

const onManageSkills = jest.fn();

const renderFact = (value: Archetype = archetype) =>
  render(
    <MemoryRouter>
      <ArchetypeSkillsHelp archetype={value} />
      <ArchetypeSkills archetype={value} onManageSkills={onManageSkills} />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
  onManageSkills.mockClear();
});

describe("ArchetypeSkills", () => {
  it("shows only the archetype's own skills, as links by name", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype, onProfile]),
      skill("5", "Build validation standards", [onArchetype], "rule"),
      skill("7", "Quarkus best practices", [onProfile]),
      skill("9", "Elsewhere", [
        { scope: "archetype", resource: { id: 2, name: "Other" } },
      ]),
    ]);
    renderFact();

    // A rule's label says so in its name; a skill agents open when needed does not.
    const first = await screen.findByRole("link", {
      name: "Build validation standards (Always followed)",
    });
    expect(first).toHaveAttribute("href", "/skills/5");
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      [
        "Build validation standards (Always followed)",
        "Jakarta EE namespace migration",
      ]
    );
    // A target profile's skills are not the archetype's.
    expect(screen.queryByText("Quarkus best practices")).toBeNull();
    expect(screen.queryByText("Elsewhere")).toBeNull();
  });

  it("lists no target profile skills for an archetype with several", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
      skill("7", "Quarkus best practices", [onProfile]),
      skill("8", "OpenShift deployment conventions", [
        { scope: "targetProfile", resource: { id: 12, name: "OpenJDK 21" } },
      ]),
    ]);
    renderFact({
      ...archetype,
      profiles: [
        { id: 11, name: "Quarkus 3.x", generators: [] },
        { id: 12, name: "OpenJDK 21", generators: [] },
      ],
    });

    expect(
      await screen.findByRole("link", {
        name: "Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Quarkus best practices")).toBeNull();
    expect(screen.queryByText("OpenShift deployment conventions")).toBeNull();
  });

  it("opens Manage skills for the archetype", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
    ]);
    renderFact();

    const manage = await screen.findByRole("button", {
      name: "Manage skills for Java EE Application",
    });
    expect(manage).toHaveAttribute("id", "manage-skills-archetype-1");
    expect(manage).toHaveTextContent("Manage skills");

    await userEvent.click(manage);
    expect(onManageSkills).toHaveBeenLastCalledWith({
      scope: "archetype",
      id: 1,
      name: "Java EE Application",
    });
  });

  it("says None with no skills, and keeps Manage skills", async () => {
    serveSkillList([]);
    renderFact();

    expect(await screen.findByText("None")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Manage skills for Java EE Application",
      })
    ).toBeInTheDocument();
  });

  it("says Unavailable, not None, when skills cannot be loaded", async () => {
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    renderFact();

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("None")).toBeNull();
  });

  it("offers no Manage skills without write scopes, and keeps the links", async () => {
    mockGrantedScopes.all = false;
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
    ]);
    renderFact();

    expect(
      await screen.findByRole("link", {
        name: "Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Manage skills for Java EE Application",
      })
    ).toBeNull();
  });
});

describe("ArchetypeSkillsHelp", () => {
  it("says archetype skills reach every target profile, and links to the profiles", async () => {
    serveSkillList([]);
    renderFact();

    await userEvent.click(
      screen.getByRole("button", { name: "More about archetype skills" })
    );
    expect(
      await screen.findByText(
        /whichever target profile the run uses\. Each target profile adds its own skills when a run uses it/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View target profiles" })
    ).toHaveAttribute("href", "/archetypes/1/target-profiles");
  });
});
