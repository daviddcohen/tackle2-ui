import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, ModelProjection, Provider } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import ModelsPage from "./models";

const mockGrantedScopes = { canWrite: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.canWrite,
}));

const provider: Provider = {
  id: "p1",
  name: "Anthropic Production",
  providerType: "anthropic",
  endpoint: "https://api.anthropic.com/v1",
  verificationStatus: "verified",
};

const unusedModel: ModelProjection = {
  id: "m2",
  name: "Granite Code 20B",
  provider: { id: "p1", name: "Anthropic Production" },
  model: "granite-code-20b",
  verificationStatus: "verified",
  isOrganizationDefault: false,
};

/** Answers a held ("loading") request; afterEach calls it so no request outlives its test. */
let releaseRequest = () => {};

const useEndpoints = ({
  models = [] as ModelProjection[],
  providers = [provider] as Provider[] | "loading",
  agents = [] as Agent[] | "error" | "loading",
}) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      res(ctx.json(models))
    ),
    rest.get(AGENTIC_ENDPOINTS.providers, (_req, res, ctx) =>
      providers === "loading"
        ? new Promise((resolve) => {
            releaseRequest = () => resolve(res(ctx.json([])));
          })
        : res(ctx.json(providers))
    ),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      agents === "error"
        ? res(ctx.status(404))
        : agents === "loading"
          ? new Promise((resolve) => {
              releaseRequest = () => resolve(res(ctx.json([])));
            })
          : res(ctx.json(agents))
    )
  );

const renderPage = () =>
  render(
    <MemoryRouter>
      <ModelsPage />
    </MemoryRouter>
  );

describe("ModelsPage", () => {
  beforeEach(() => {
    mockGrantedScopes.canWrite = true;
  });

  afterEach(() => {
    releaseRequest();
    releaseRequest = () => {};
  });

  it("offers Create model in the empty state once a model provider exists", async () => {
    useEndpoints({});
    renderPage();
    expect(
      await screen.findByText("agentic.model.emptyDescription")
    ).toBeInTheDocument();
    const createButtons = screen.getAllByRole("button", {
      name: "agentic.model.create",
    });
    // the toolbar button and the empty state's next step, both enabled
    expect(createButtons).toHaveLength(2);
    createButtons.forEach((button) =>
      expect(button).not.toHaveAttribute("aria-disabled", "true")
    );
  });

  it("sends the user to model providers when there are none", async () => {
    useEndpoints({ providers: [] });
    renderPage();
    expect(
      await screen.findByText("agentic.model.emptyNoProviders")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.model.goToProviders" })
    ).toHaveAttribute("href", "/providers");
    expect(
      screen.getByRole("button", { name: "agentic.model.create" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("waits for the model providers before it offers a next step", async () => {
    useEndpoints({ providers: "loading" });
    renderPage();
    // Without the wait, the empty model list would offer "Create model" here.
    await expect(
      screen.findByText("agentic.model.emptyDescription", undefined, {
        timeout: 300,
      })
    ).rejects.toThrow();
    expect(screen.queryByText("agentic.model.emptyNoProviders")).toBeNull();

    releaseRequest(); // no model providers
    expect(
      await screen.findByText("agentic.model.emptyNoProviders")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "agentic.model.create" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("is read-only without the models write scope", async () => {
    mockGrantedScopes.canWrite = false;
    useEndpoints({ providers: [] });
    renderPage();
    expect(
      await screen.findByText("agentic.model.emptyReadOnly")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "agentic.model.create" })
    ).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hides row actions without the models write scope", async () => {
    mockGrantedScopes.canWrite = false;
    useEndpoints({ models: [unusedModel] });
    renderPage();
    const row = (await screen.findByText("Granite Code 20B")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
    // no empty actions column either (guide 4.1)
    expect(
      screen.queryByRole("columnheader", { name: "actions.rowActions" })
    ).toBeNull();
    expect(within(row).getAllByRole("cell")).toHaveLength(5);
  });

  it("never reads Not used, or enables Delete, when the agents could not be loaded", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: [unusedModel], agents: "error" });
    renderPage();
    const row = (await screen.findByText("Granite Code 20B")).closest("tr")!;
    await waitFor(() =>
      expect(
        within(row).getByText("agentic.common.unavailable")
      ).toBeInTheDocument()
    );
    expect(within(row).queryByText("agentic.model.notUsed")).toBeNull();

    await user.click(within(row).getByRole("button", { name: "Kebab toggle" }));
    expect(
      screen.getByRole("menuitem", { name: "actions.delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a skeleton, and keeps Delete disabled, while the agents load", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: [unusedModel], agents: "loading" });
    renderPage();
    const row = (await screen.findByText("Granite Code 20B")).closest("tr")!;
    expect(within(row).getByText("terms.loading")).toBeInTheDocument();
    expect(within(row).queryByText("agentic.model.notUsed")).toBeNull();

    await user.click(within(row).getByRole("button", { name: "Kebab toggle" }));
    const deleteItem = screen.getByRole("menuitem", { name: "actions.delete" });
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    await user.hover(deleteItem);
    expect(
      await screen.findByText("agentic.common.usageUnchecked")
    ).toBeInTheDocument();
  });

  it("enables Delete for an unused model once the agents are known", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: [unusedModel] });
    renderPage();
    const row = (await screen.findByText("Granite Code 20B")).closest("tr")!;
    await waitFor(() =>
      expect(within(row).getByText("agentic.model.notUsed")).toBeInTheDocument()
    );
    await user.click(within(row).getByRole("button", { name: "Kebab toggle" }));
    expect(
      screen.getByRole("menuitem", { name: "actions.delete" })
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});
