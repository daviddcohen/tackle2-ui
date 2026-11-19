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

const group = (name: string | RegExp) => screen.getByRole("region", { name });

beforeEach(() => {
  mockGrantedScopes.all = true;
  onManageSkills.mockClear();
});

describe("TabSkills", () => {
  it("shows the archetype group, then the target profile group, each with its own skills", async () => {
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

    const profile = group("Target profile skills: Quarkus 3.x (2)");
    expect(
      within(profile).getByRole("link", { name: "Quarkus 3.x" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
    expect(
      within(profile).getByText(
        "Agents use these skills in every stage when they migrate applications in Java EE Application that target this profile, unless a migration plan excludes them."
      )
    ).toBeInTheDocument();
    expect(
      within(profile).getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", "/skills/7");
    expect(screen.queryByText("Elsewhere")).toBeNull();
  });

  it("gives each group its own Manage skills, named after its owner", async () => {
    serveSkillList([
      skill("3", "Jakarta EE namespace migration", [onArchetype]),
    ]);
    renderTab();

    const own = await screen.findByRole("button", {
      name: "Manage skills for Java EE Application",
    });
    expect(own).toHaveAttribute("id", "manage-skills-archetype-1");
    const profile = screen.getByRole("button", {
      name: "Manage skills for Quarkus 3.x",
    });
    expect(profile).toHaveAttribute("id", "manage-skills-targetProfile-11");

    await userEvent.click(own);
    expect(onManageSkills).toHaveBeenLastCalledWith({
      scope: "archetype",
      id: 1,
      name: "Java EE Application",
    });
    await userEvent.click(profile);
    expect(onManageSkills).toHaveBeenLastCalledWith({
      scope: "targetProfile",
      id: 11,
      name: "Quarkus 3.x",
      archetype: { id: 1, name: "Java EE Application" },
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
    expect(
      within(group("Target profile skills: Quarkus 3.x")).getByText(
        "No skills are attached to this target profile."
      )
    ).toBeInTheDocument();
  });

  it("says a second target profile's skills do not reach the agents", async () => {
    serveSkillList([]);
    renderTab({
      ...archetype,
      profiles: [
        { id: 11, name: "Quarkus 3.x", generators: [] },
        { id: 12, name: "Quarkus 2.x", generators: [] },
      ],
    });

    const second = await screen.findByRole("region", {
      name: "Target profile skills: Quarkus 2.x",
    });
    expect(
      within(second).getByText(
        "Applications in Java EE Application use Quarkus 3.x, so agents do not get these skills."
      )
    ).toBeInTheDocument();
    // Kept so the legacy data can be cleaned up.
    expect(
      within(second).getByRole("button", {
        name: "Manage skills for Quarkus 2.x",
      })
    ).toBeInTheDocument();
  });

  it("points to the target profiles page when the archetype has none", async () => {
    serveSkillList([]);
    renderTab({ ...archetype, profiles: [] });

    const none = await screen.findByRole("region", {
      name: "Target profile skills",
    });
    expect(
      within(none).getByText("This archetype has no target profile yet.")
    ).toBeInTheDocument();
    expect(
      within(none).getByRole("link", { name: "Manage target profiles" })
    ).toHaveAttribute("href", "/archetypes/1/target-profiles");
    expect(within(none).queryByRole("button")).toBeNull();
  });

  it("shows an error, not empty groups, when skills cannot be loaded", async () => {
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    renderTab();

    expect(await screen.findByText("Unable to connect")).toBeInTheDocument();
    expect(
      screen.queryByText("No skills are attached to this archetype.")
    ).toBeNull();
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
    expect(
      screen.queryByRole("link", { name: "Manage target profiles" })
    ).toBeNull();
  });
});
