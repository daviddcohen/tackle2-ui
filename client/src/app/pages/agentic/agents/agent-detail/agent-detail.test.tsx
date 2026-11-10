import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Agent, MigrationPlan } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import AgentDetail from "./agent-detail";

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

const agent: Agent = {
  id: "7",
  name: "Code Migrator",
  description: "Migrates code.",
  model: { id: "1", name: "Approved Model" },
  skills: [],
  prompt: "Migrate.",
  capabilities: [],
  parameters: [
    { name: "p", type: "string", description: "" },
    { name: "p", type: "number", description: "" },
  ],
};

const planUsingAgent = {
  id: "1",
  name: "Plan A",
  description: "",
  stages: [
    {
      id: "s1",
      name: "Stage 1",
      order: 1,
      agent: { id: "7", name: "Code Migrator" },
    },
  ],
} as unknown as MigrationPlan;

const useEndpoints = ({
  detail,
  plans = [],
}: {
  detail: Parameters<typeof rest.get>[1];
  plans?: MigrationPlan[];
}) =>
  server.use(
    rest.get(`${AGENTIC_ENDPOINTS.agents}/:id`, detail),
    rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) => res(ctx.json(plans))),
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) => res(ctx.json([]))),
    rest.get(AGENTIC_ENDPOINTS.agentRuns, (_req, res, ctx) => res(ctx.json([])))
  );

const renderAt = (id: string, notifications = createMockNotifications()) => {
  render(
    <NotificationsContext.Provider value={notifications}>
      <MemoryRouter initialEntries={[`/agents/${id}`]}>
        <Route path={DevPaths.agentDetails}>
          <AgentDetail />
        </Route>
      </MemoryRouter>
    </NotificationsContext.Provider>
  );
  return notifications;
};

describe("AgentDetail", () => {
  afterEach(() => {
    mockGrantedScopes.all = true;
    mockGrantedScopes.scopes = [];
  });

  it("shows a not-found page (not the list empty state) for a 404", async () => {
    useEndpoints({
      detail: (_req, res, ctx) =>
        res(ctx.status(404), ctx.json({ message: "Agent not found" })),
    });
    renderAt("99999");
    expect(
      await screen.findByText("agentic.agent.notFoundTitle")
    ).toBeInTheDocument();
    expect(screen.queryByText("agentic.agent.emptyTitle")).toBeNull();
    expect(screen.queryByText("message.unableToConnect")).toBeNull();
  });

  it("shows the API error state (not not-found) for a 503", async () => {
    useEndpoints({
      detail: (_req, res, ctx) => res(ctx.status(503)),
    });
    renderAt("7");
    expect(
      await screen.findByText("message.unableToConnect", undefined, {
        timeout: 5000,
      })
    ).toBeInTheDocument();
    expect(screen.queryByText("agentic.agent.notFoundTitle")).toBeNull();
  });

  it("disables Delete while a Plan uses the Agent", async () => {
    const user = userEvent.setup();
    useEndpoints({
      detail: (_req, res, ctx) => res(ctx.json(agent)),
      plans: [planUsingAgent],
    });
    renderAt("7");
    await screen.findByRole("heading", { name: "Code Migrator" });
    await user.click(
      screen.getByRole("button", { name: "agentic.applicationDetail.actions" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "actions.delete" })
      ).toHaveAttribute("aria-disabled", "true")
    );
  });

  it("surfaces the server's 409 message when a delete is rejected", async () => {
    const user = userEvent.setup();
    useEndpoints({ detail: (_req, res, ctx) => res(ctx.json(agent)) });
    server.use(
      rest.delete(`${AGENTIC_ENDPOINTS.agents}/:id`, (_req, res, ctx) =>
        res(
          ctx.status(409),
          ctx.json({ message: 'Agent "Code Migrator" is used by 1 Plan(s).' })
        )
      )
    );
    const notifications = renderAt("7");
    await screen.findByRole("heading", { name: "Code Migrator" });
    await user.click(
      screen.getByRole("button", { name: "agentic.applicationDetail.actions" })
    );
    await user.click(screen.getByRole("menuitem", { name: "actions.delete" }));
    await user.click(screen.getByRole("button", { name: "actions.delete" }));
    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith({
        title: 'Agent "Code Migrator" is used by 1 Plan(s).',
        variant: "danger",
      })
    );
  });

  it("offers no Edit/Delete without the Agent write scopes", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.scopes = ["agentic.agents:get"];
    useEndpoints({ detail: (_req, res, ctx) => res(ctx.json(agent)) });
    renderAt("7");
    await screen.findByRole("heading", { name: "Code Migrator" });
    expect(
      screen.queryByRole("button", {
        name: "agentic.applicationDetail.actions",
      })
    ).toBeNull();
  });
});
