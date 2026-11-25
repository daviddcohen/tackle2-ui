import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Skill } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { TabSkills } from "../tab-skills";

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

const renderTab = (value: Archetype = archetype) =>
  render(
    <MemoryRouter>
      <TabSkills archetype={value} onManageSkills={onManageSkills} />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
  onManageSkills.mockClear();
});

const pointer =
  "Each target profile of this archetype has its own skills, which agents get only when a migration plan runs on that target profile.";

describe("TabSkills", () => {
  it("shows only the archetype's own skills, then where the target profile skills are", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype, onProfile]),
      skill("5", "Build validation standards", [onArchetype], "rule"),
      skill("7", "Quarkus best practices", [onProfile]),
      skill("9", "Elsewhere", [
        { scope: "archetype", resource: { id: 2, name: "Other" } },
      ]),
    ]);
    renderTab();

    const own = await screen.findByRole("region", {
      name: "Archetype skills (2)",
    });
    expect(
      within(own).getByRole("heading", { level: 3, name: /Archetype skills/ })
    ).toBeInTheDocument();
    expect(
      within(own).getByText(
        "Agents use these skills in every stage when they migrate applications in this archetype, unless a migration plan excludes them."
      )
    ).toBeInTheDocument();
    const ownList = within(own).getByRole("list", {
      name: "Archetype skills (2)",
    });
    expect(
      within(ownList)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["Build validation standards", "Jakarta EE namespace migration"]);
    // Only the rule carries the marker.
    expect(within(ownList).getAllByText("Always followed")).toHaveLength(1);

    // A target profile's skills are not the archetype's: no group, no skill.
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.queryByText(/Target profile skills/)).toBeNull();
    expect(screen.queryByText("Quarkus best practices")).toBeNull();
    expect(screen.queryByText("Elsewhere")).toBeNull();
    expect(screen.getByText(new RegExp(pointer))).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View target profiles" })
    ).toHaveAttribute("href", "/archetypes/1/target-profiles");
  });

  it("lists no target profile group for an archetype with several", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
      skill("7", "Quarkus best practices", [onProfile]),
      skill("8", "OpenShift deployment conventions", [
        { scope: "targetProfile", resource: { id: 12, name: "OpenJDK 21" } },
      ]),
    ]);
    renderTab({
      ...archetype,
      profiles: [
        { id: 11, name: "Quarkus 3.x", generators: [] },
        { id: 12, name: "OpenJDK 21", generators: [] },
      ],
    });

    expect(
      await screen.findByRole("region", { name: "Archetype skills (1)" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.queryByText("Quarkus best practices")).toBeNull();
    expect(screen.queryByText("OpenShift deployment conventions")).toBeNull();
    expect(screen.queryByText(/Quarkus 3\.x|OpenJDK 21/)).toBeNull();
    expect(screen.getByText(new RegExp(pointer))).toBeInTheDocument();
  });

  it("gives the archetype group its Manage skills, and only that one", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
    ]);
    renderTab();

    const own = await screen.findByRole("button", {
      name: "Manage skills for Java EE Application",
    });
    expect(own).toHaveAttribute("id", "manage-skills-archetype-1");
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await userEvent.click(own);
    expect(onManageSkills).toHaveBeenLastCalledWith({
      scope: "archetype",
      id: 1,
      name: "Java EE Application",
    });
  });

  it("keeps an empty group's heading, sentence and Manage skills", async () => {
    serveSkillList([]);
    renderTab();

    const own = await screen.findByRole("region", { name: "Archetype skills" });
    expect(
      within(own).getByText("No skills are attached to this archetype.")
    ).toBeInTheDocument();
    expect(
      within(own).getByRole("button", {
        name: "Manage skills for Java EE Application",
      })
    ).toBeInTheDocument();
  });

  it("says when the archetype has no target profile, with the way there", async () => {
    serveSkillList([]);
    renderTab({ ...archetype, profiles: [] });

    expect(
      await screen.findByText(
        /This archetype has no target profile yet. A target profile's skills reach agents only when a migration plan runs on it./
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View target profiles" })
    ).toHaveAttribute("href", "/archetypes/1/target-profiles");
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("shows an error, not empty groups, when skills cannot be loaded", async () => {
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    renderTab();

    expect(await screen.findByText("Unable to connect")).toBeInTheDocument();
    expect(
      screen.queryByText("No skills are attached to this archetype.")
    ).toBeNull();
    expect(screen.queryByText(new RegExp(pointer))).toBeNull();
  });

  it("offers no action without write scopes, and keeps the links", async () => {
    mockGrantedScopes.all = false;
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
    ]);
    renderTab({ ...archetype, profiles: [] });

    expect(
      await screen.findByRole("link", {
        name: "Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    // Anyone who can read the archetype can read its target profiles.
    expect(
      screen.getByRole("link", { name: "View target profiles" })
    ).toBeInTheDocument();
  });
});
