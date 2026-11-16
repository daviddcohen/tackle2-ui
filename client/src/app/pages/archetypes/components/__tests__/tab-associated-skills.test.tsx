import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Skill } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { TabAssociatedSkills } from "../tab-associated-skills";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

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
  associations: Skill["associations"]
): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  associations,
});

const serveSkills = (resolver: Parameters<typeof rest.get>[1]) =>
  server.use(rest.get(AGENTIC_ENDPOINTS.skills, resolver));

const renderTab = () =>
  render(
    <MemoryRouter>
      <TabAssociatedSkills archetype={archetype} />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
});

describe("TabAssociatedSkills", () => {
  it("lists archetype and target profile skills with one line per source", async () => {
    serveSkills((_req, res, ctx) =>
      res(
        ctx.json([
          skill("3", "Jakarta EE namespace migration", [
            {
              scope: "archetype",
              resource: { id: 1, name: "Java EE Application" },
            },
            {
              scope: "targetProfile",
              resource: { id: 11, name: "Quarkus 3.x" },
            },
          ]),
          skill("9", "Elsewhere", [
            { scope: "archetype", resource: { id: 2, name: "Other" } },
          ]),
        ])
      )
    );
    renderTab();

    const table = await screen.findByRole("grid", { name: "Skills" });
    expect(
      screen.getByText(
        "Skills associated with this archetype and its target profiles. Agents use them when they migrate its applications."
      )
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", {
        name: "Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Archetype: Java EE Application")
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Target profile: Quarkus 3.x")
    ).toBeInTheDocument();
    expect(within(table).queryByText("Elsewhere")).toBeNull();
  });

  it("shows an error, not the empty state, when skills cannot be loaded", async () => {
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    renderTab();

    expect(await screen.findByText("Unable to connect")).toBeInTheDocument();
    expect(screen.queryByText("No skills yet")).toBeNull();
  });

  it("says where associations are edited when there are none", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json([])));
    renderTab();

    expect(
      await screen.findByRole("heading", { name: "No skills yet", level: 3 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills associated with this archetype or its target profiles appear here. Associations are edited on each skill."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to skills" })).toHaveAttribute(
      "href",
      "/skills"
    );
  });

  it("omits the link without the skill write scope", async () => {
    mockGrantedScopes.all = false;
    serveSkills((_req, res, ctx) => res(ctx.json([])));
    renderTab();

    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
