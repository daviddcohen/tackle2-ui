import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, MigrationPlan, ModelProjection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
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

  it("is read-only without the agent write scopes (X9)", async () => {
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
});
