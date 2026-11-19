import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Agent, Gateway, Skill, SkillCollection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import SkillCollectionDetail from "./skill-collection-detail";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockGrantedScopes: { all: boolean } = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const collection: SkillCollection = {
  id: "1",
  name: "Java modernization foundation",
  description: "Focused skills for Java.",
  skills: [
    { id: "2", name: "Spring Boot to Quarkus migration" },
    { id: "1", name: "EJB to CDI conversion patterns" },
  ],
};

const skills: Skill[] = [
  {
    id: "1",
    name: "EJB to CDI conversion patterns",
    description: "Patterns for EJB.",
    sourceType: "inline",
  },
  {
    id: "2",
    name: "Spring Boot to Quarkus migration",
    description: "Guidance for Quarkus.",
    sourceType: "git",
  },
];

const agents = [
  {
    id: "1",
    name: "Code Migrator",
    model: { id: "9", name: "Claude 3.7 Sonnet" },
    skillCollections: [{ id: "1", name: collection.name }],
  },
  {
    id: "2",
    name: "Unrelated Agent",
    model: { id: "9", name: "Claude 3.7 Sonnet" },
    skillCollections: [],
  },
] as unknown as Agent[];

const gateways = [
  {
    id: "9",
    name: "Claude 3.7 Sonnet",
    provider: { id: "1", name: "Anthropic Production" },
  },
] as unknown as Gateway[];

const useEndpoints = (
  overrides: { agents?: Parameters<typeof rest.get>[1] } = {}
) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.skillCollections}/:id`, (_req, res, ctx) =>
      res(ctx.json(collection))
    ),
    rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
      res(ctx.json(skills))
    ),
    rest.get(
      AGENTIC_ENDPOINTS.agents,
      overrides.agents ?? ((_req, res, ctx) => res(ctx.json(agents)))
    ),
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      res(ctx.json(gateways))
    )
  );

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/skills/collections/1"]}>
      <Route path={DevPaths.skillCollectionDetails}>
        <SkillCollectionDetail />
      </Route>
    </MemoryRouter>
  );

describe("SkillCollectionDetail", () => {
  afterEach(() => {
    mockGrantedScopes.all = true;
  });

  it("shows the description in the header and the two sections", async () => {
    useEndpoints();
    renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Java modernization foundation",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Focused skills for Java.")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Skills (2)" })
    ).toBeInTheDocument();
    const skillRows = within(
      screen.getByRole("grid", { name: "Skills" })
    ).getAllByRole("row");
    // Header, then the skills by name with their description and source.
    expect(skillRows[1]).toHaveTextContent("EJB to CDI conversion patterns");
    expect(
      await within(skillRows[2]).findByText("Guidance for Quarkus.")
    ).toBeInTheDocument();
    expect(within(skillRows[2]).getByText("Git")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Used by agents (1)" })
    ).toBeInTheDocument();
    const agentsGrid = screen.getByRole("grid", { name: "Used by agents" });
    expect(
      within(agentsGrid).getByRole("link", { name: "Code Migrator" })
    ).toBeInTheDocument();
    expect(
      await within(agentsGrid).findByText("Anthropic Production")
    ).toBeInTheDocument();
    expect(
      within(agentsGrid).queryByText("Unrelated Agent")
    ).not.toBeInTheDocument();
  });

  it("disables Delete while agents use the collection", async () => {
    useEndpoints();
    renderPage();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Used by agents (1)" });
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    await user.hover(remove);
    expect(
      await screen.findByText(
        "Used by 1 agent. Remove it from that agent before deleting it."
      )
    ).toBeInTheDocument();
  });

  it("does not claim the collection is unused when the agents fail to load", async () => {
    useEndpoints({
      agents: (_req, res, ctx) => res(ctx.status(500)),
    });
    renderPage();
    const user = userEvent.setup();

    await screen.findByRole("heading", {
      level: 1,
      name: "Java modernization foundation",
    });
    expect(
      await screen.findByRole("heading", { name: "Used by agents" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No agent uses this skill collection.")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.hover(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      await screen.findByText("Usage could not be checked. Try again later.")
    ).toBeInTheDocument();
  });

  it("leaves for the list before the deleted collection could be read again", async () => {
    let isDeleted = false;
    let readsAfterDelete = 0;
    useEndpoints({
      // No agent uses the collection, so Delete is enabled.
      agents: (_req, res, ctx) => res(ctx.json([])),
    });
    server.use(
      rest.get(
        `${AGENTIC_ENDPOINTS.skillCollections}/:id`,
        (_req, res, ctx) => {
          if (!isDeleted) return res(ctx.json(collection));
          readsAfterDelete++;
          return res(ctx.status(404));
        }
      ),
      rest.delete(
        `${AGENTIC_ENDPOINTS.skillCollections}/:id`,
        (_req, res, ctx) => {
          isDeleted = true;
          return res(ctx.status(204));
        }
      )
    );
    render(
      <MemoryRouter initialEntries={["/skills/collections/1"]}>
        <Route path={DevPaths.skillCollectionDetails}>
          <SkillCollectionDetail />
        </Route>
        <Route exact path={DevPaths.skills}>
          <p>Skills list</p>
        </Route>
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 1, name: collection.name });
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })
    );

    expect(await screen.findByText("Skills list")).toBeInTheDocument();
    // The page is gone before the invalidated queries re-render it, so the
    // detail query never asks for the deleted collection (a 404).
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(readsAfterDelete).toBe(0);
  });

  it("has no Actions menu without the write scope", async () => {
    mockGrantedScopes.all = false;
    useEndpoints();
    renderPage();

    await screen.findByRole("heading", {
      level: 1,
      name: "Java modernization foundation",
    });
    expect(
      screen.queryByRole("button", { name: "Actions" })
    ).not.toBeInTheDocument();
  });
});
