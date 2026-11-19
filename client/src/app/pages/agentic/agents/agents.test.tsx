import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, MigrationPlan, ModelProjection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { AgentsPage } from "./agents";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
// setupTests stubs useLocation; the list's URL state needs the real one.
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockGrantedScopes: { all: boolean; scopes: string[] } = {
  all: true,
  scopes: [],
};
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (required: string[]) =>
    mockGrantedScopes.all ||
    required.some((scope) => mockGrantedScopes.scopes.includes(scope)),
}));

const makeAgent = (id: string, name: string, extra: Partial<Agent> = {}) =>
  ({
    id,
    name,
    description: `${name} description.`,
    model: { id: "1", name: "Claude 3.7 Sonnet" },
    skills: [],
    prompt: "",
    capabilities: [],
    parameters: [],
    ...extra,
  }) as Agent;

const agents = [
  makeAgent("1", "Code Migrator", {
    skills: [
      { id: "1", name: "First skill" },
      { id: "2", name: "Second skill" },
    ],
    skillCollections: [{ id: "1", name: "Java foundation" }],
  }),
  makeAgent("2", "Test Runner", {
    skills: [{ id: "6", name: "Database migration patterns" }],
  }),
];

const models = [
  {
    id: "1",
    name: "Claude 3.7 Sonnet",
    provider: { id: "1", name: "Anthropic Production" },
    model: "claude",
    verificationStatus: "unreachable",
    statusReason: "The endpoint did not respond.",
    isOrganizationDefault: true,
  },
] as ModelProjection[];

const plan = (id: string, name: string, agentId: string) =>
  ({
    id,
    name,
    description: "",
    stages: [
      { id: `${id}-1`, name: "Migrate", order: 1, agent: { id: agentId } },
    ],
  }) as unknown as MigrationPlan;

const useEndpoints = ({
  list = agents,
  plans,
}: {
  list?: Agent[];
  plans: Parameters<typeof rest.get>[1];
}) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) => res(ctx.json(list))),
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      res(ctx.json(models))
    ),
    rest.get(AGENTIC_ENDPOINTS.plans, plans)
  );

const plansOk =
  (plans: MigrationPlan[]): Parameters<typeof rest.get>[1] =>
  (_req, res, ctx) =>
    res(ctx.json(plans));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/agents"]}>
      <AgentsPage />
    </MemoryRouter>
  );

const row = (name: string) =>
  screen.getByRole("link", { name }).closest("tr") as HTMLElement;

describe("AgentsPage", () => {
  afterEach(() => {
    mockGrantedScopes.all = true;
    mockGrantedScopes.scopes = [];
  });

  it("renders the header, the model with its provider and the plans count", async () => {
    useEndpoints({
      plans: plansOk([
        plan("1", "Plan A", "1"),
        plan("2", "Plan B", "1"),
        plan("3", "Plan C", "2"),
      ]),
    });
    renderPage();
    expect(
      screen.getByText(
        "Agents run the stages of a migration plan. Each agent uses one model and a set of skills."
      )
    ).toBeInTheDocument();
    await screen.findByRole("link", { name: "Code Migrator" });

    const codeMigrator = row("Code Migrator");
    expect(
      await within(codeMigrator).findByText("Anthropic Production")
    ).toBeInTheDocument();
    expect(
      within(codeMigrator).getByLabelText("Model not verified")
    ).toBeInTheDocument();
    expect(
      within(codeMigrator).getByRole("link", { name: "2 skills, 1 collection" })
    ).toBeInTheDocument();
    expect(
      await within(codeMigrator).findByRole("link", {
        name: "2 migration plans",
      })
    ).toHaveAttribute("href", "/agents/1");

    const testRunner = row("Test Runner");
    expect(
      within(testRunner).getByRole("link", {
        name: "Database migration patterns",
      })
    ).toHaveAttribute("href", "/skills/6");
    expect(
      within(testRunner).getByRole("link", { name: "Plan C" })
    ).toHaveAttribute("href", "/migration-plans/3");
  });

  it("says None only once the plans are known", async () => {
    useEndpoints({ plans: plansOk([]) });
    renderPage();
    await screen.findByRole("link", { name: "Code Migrator" });
    expect(
      await within(row("Code Migrator")).findByText("None")
    ).toBeInTheDocument();
  });

  it("says None for an empty description and no skills", async () => {
    useEndpoints({
      list: [makeAgent("3", "Bare agent", { description: "" })],
      plans: plansOk([plan("1", "Plan A", "3")]),
    });
    renderPage();
    await screen.findByRole("link", { name: "Bare agent" });
    const bare = row("Bare agent");
    expect(
      await within(bare).findByRole("link", { name: "Plan A" })
    ).toBeInTheDocument();
    // Description and Skills.
    expect(within(bare).getAllByText("None")).toHaveLength(2);
  });

  it("shows Unavailable, not None, when the plans fail to load", async () => {
    useEndpoints({
      plans: (_req, res, ctx) => res(ctx.status(500)),
    });
    renderPage();
    await screen.findByRole("link", { name: "Code Migrator" });
    expect(
      await within(row("Code Migrator")).findByText("Unavailable", undefined, {
        timeout: 5000,
      })
    ).toBeInTheDocument();
    expect(within(row("Code Migrator")).queryByText("None")).toBeNull();
  });

  it("does not look verified when the models fail to load", async () => {
    useEndpoints({ plans: plansOk([]) });
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    renderPage();
    await screen.findByRole("link", { name: "Code Migrator" });
    expect(
      await within(row("Code Migrator")).findByText(
        "Provider and status unavailable",
        undefined,
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
  });

  it("holds the provider's place while the models load", async () => {
    useEndpoints({ plans: plansOk([]) });
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(ctx.delay("infinite"))
      )
    );
    renderPage();
    await screen.findByRole("link", { name: "Code Migrator" });
    const codeMigrator = row("Code Migrator");
    await within(codeMigrator).findAllByText("None");
    expect(within(codeMigrator).getByText("Claude 3.7 Sonnet")).toBeVisible();
    expect(within(codeMigrator).getByText("Loading")).toBeInTheDocument();
    expect(within(codeMigrator).queryByText("Anthropic Production")).toBeNull();
    expect(
      within(codeMigrator).queryByText("Provider and status unavailable")
    ).toBeNull();
  });

  it("offers Create agent in the empty state", async () => {
    useEndpoints({ list: [], plans: plansOk([]) });
    renderPage();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create an agent to run migration plan stages.")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Create agent" })
    ).toHaveLength(2);
  });

  it("is read-only without the agent write scopes", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.agents:get"];
    useEndpoints({ list: [], plans: plansOk([]) });
    renderPage();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    expect(
      screen.getByText("Agents appear here once they are created.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create agent" })).toBeNull();
  });

  describe("row menu", () => {
    const openMenu = async (name: string) => {
      const user = userEvent.setup();
      await screen.findByRole("link", { name });
      await user.click(
        within(row(name)).getByRole("button", { name: "Kebab toggle" })
      );
      return user;
    };
    const menuItems = () =>
      screen.getAllByRole("menuitem").map((item) => item.textContent);

    it("lists Edit, Test agent, then Delete, blocked while a plan uses the agent", async () => {
      useEndpoints({ plans: plansOk([plan("1", "Plan A", "1")]) });
      renderPage();
      await screen.findByRole("link", { name: "Plan A" });
      const user = await openMenu("Code Migrator");
      expect(menuItems()).toEqual(["Edit", "Test agent", "Delete"]);
      const del = screen.getByRole("menuitem", { name: "Delete" });
      expect(del).toHaveAttribute("aria-disabled", "true");
      expect(del).not.toHaveClass("pf-m-danger");
      await user.hover(del);
      expect(
        await screen.findByText(
          "Used by 1 migration plan. Remove it from its stages before deleting it."
        )
      ).toBeInTheDocument();
    });

    it("enables Delete only once the plans show the agent is unused", async () => {
      useEndpoints({ plans: plansOk([]) });
      renderPage();
      await within(await waitFor(() => row("Test Runner"))).findByText("None");
      await openMenu("Test Runner");
      expect(
        screen.getByRole("menuitem", { name: "Delete" })
      ).not.toHaveAttribute("aria-disabled", "true");
    });

    it("confirms a delete by naming the agent and the consequence", async () => {
      useEndpoints({ plans: plansOk([]) });
      renderPage();
      await within(await waitFor(() => row("Test Runner"))).findByText("None");
      const user = await openMenu("Test Runner");
      await user.click(screen.getByRole("menuitem", { name: "Delete" }));
      const confirm = await screen.findByRole("dialog");
      expect(
        within(confirm).getByRole("heading", { name: "Delete agent?" })
      ).toBeInTheDocument();
      expect(confirm).toHaveTextContent(
        "Test Runner will be deleted. It can no longer be assigned to migration plan stages. This action cannot be undone."
      );
    });

    it("blocks Delete when usage could not be checked", async () => {
      useEndpoints({ plans: (_req, res, ctx) => res(ctx.status(500)) });
      renderPage();
      await within(await waitFor(() => row("Test Runner"))).findByText(
        "Unavailable",
        undefined,
        { timeout: 5000 }
      );
      const user = await openMenu("Test Runner");
      const del = screen.getByRole("menuitem", { name: "Delete" });
      expect(del).toHaveAttribute("aria-disabled", "true");
      await user.hover(del);
      expect(
        await screen.findByText("Usage could not be checked. Try again later.")
      ).toBeInTheDocument();
    });

    it("disables Edit and Delete of an operator-managed agent", async () => {
      useEndpoints({
        list: [makeAgent("9", "Built-in Agent", { operatorManaged: true })],
        plans: plansOk([]),
      });
      renderPage();
      await openMenu("Built-in Agent");
      expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
      expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
      expect(
        screen.getByRole("menuitem", { name: "Test agent" })
      ).not.toHaveAttribute("aria-disabled", "true");
    });

    it("offers only Test agent with the agent run scope alone", async () => {
      mockGrantedScopes.all = false;
      mockGrantedScopes.scopes = ["agentic.agentruns:post"];
      useEndpoints({ plans: plansOk([]) });
      renderPage();
      await openMenu("Code Migrator");
      expect(menuItems()).toEqual(["Test agent"]);
    });

    it("has no actions column without any write scope", async () => {
      mockGrantedScopes.all = false;
      mockGrantedScopes.scopes = ["agentic.agents:get"];
      useEndpoints({ plans: plansOk([]) });
      renderPage();
      await screen.findByRole("link", { name: "Code Migrator" });
      expect(screen.queryByRole("button", { name: "Kebab toggle" })).toBeNull();
    });
  });
});
