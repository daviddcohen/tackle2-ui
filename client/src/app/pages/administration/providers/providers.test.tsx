import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { ModelProjection, Provider } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import ProvidersPage from "./providers";

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

const modelOf = (id: string, name: string): ModelProjection => ({
  id,
  name,
  provider: { id: "p1", name: "Anthropic Production" },
  model: id,
  verificationStatus: "verified",
  isOrganizationDefault: false,
});

/** Answers a held ("loading") request; afterEach calls it so no request outlives its test. */
let releaseRequest = () => {};

const useEndpoints = ({
  providers = [provider],
  models = [] as ModelProjection[] | "error" | "loading",
}) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.providers, (_req, res, ctx) =>
      res(ctx.json(providers))
    ),
    rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
      models === "error"
        ? res(ctx.status(404))
        : models === "loading"
          ? new Promise((resolve) => {
              releaseRequest = () => resolve(res(ctx.json([])));
            })
          : res(ctx.json(models))
    )
  );

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProvidersPage />
    </MemoryRouter>
  );

const providerRow = async () =>
  (await screen.findByText("Anthropic Production")).closest("tr")!;

describe("ProvidersPage", () => {
  beforeEach(() => {
    mockGrantedScopes.canWrite = true;
  });

  afterEach(() => {
    releaseRequest();
    releaseRequest = () => {};
  });

  it("offers Create model provider in the empty state", async () => {
    useEndpoints({ providers: [] });
    renderPage();
    expect(
      await screen.findByText("agentic.provider.emptyDescription")
    ).toBeInTheDocument();
    const createButtons = screen.getAllByRole("button", {
      name: "agentic.provider.create",
    });
    expect(createButtons).toHaveLength(2);
    // only the toolbar button carries the id: element ids stay unique
    expect(
      createButtons.filter((button) => button.id === "create-provider")
    ).toHaveLength(1);
  });

  it("is read-only without the write scope", async () => {
    mockGrantedScopes.canWrite = false;
    useEndpoints({ providers: [] });
    renderPage();
    expect(
      await screen.findByText("agentic.provider.emptyReadOnly")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "agentic.provider.create" })
    ).toBeNull();
  });

  it("hides row actions without the write scope", async () => {
    mockGrantedScopes.canWrite = false;
    useEndpoints({});
    renderPage();
    const row = await providerRow();
    expect(within(row).queryByRole("button")).toBeNull();
    // no empty actions column either
    expect(
      screen.queryByRole("columnheader", { name: "actions.rowActions" })
    ).toBeNull();
    expect(within(row).getAllByRole("cell")).toHaveLength(5);
  });

  it("lists several models in a popover", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: [modelOf("m2", "Zeta"), modelOf("m1", "Alpha")] });
    renderPage();
    const row = await providerRow();
    await user.click(
      await within(row).findByRole("button", {
        name: "agentic.provider.usedByModels",
      })
    );
    const popover = await screen.findByRole("dialog");
    expect(
      within(popover)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Alpha", "Zeta"]);
  });

  it("shows a skeleton, and keeps Delete disabled, while the models load", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: "loading" });
    renderPage();
    const row = await providerRow();
    expect(within(row).getByText("terms.loading")).toBeInTheDocument();
    expect(within(row).queryByText("agentic.provider.notUsed")).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Kebab toggle" }));
    const deleteItem = screen.getByRole("menuitem", { name: "actions.delete" });
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    // The reason is the item's description and its tooltip on hover.
    expect(deleteItem).toHaveAccessibleDescription(
      "agentic.common.usageUnchecked"
    );
    await user.hover(deleteItem);
    expect(
      await screen.findByText("agentic.common.usageUnchecked", {
        selector: '[role="tooltip"] *',
      })
    ).toBeInTheDocument();
  });

  it("never reads Not used, or enables Delete, when the models could not be loaded", async () => {
    const user = userEvent.setup();
    useEndpoints({ models: "error" });
    renderPage();
    const row = await providerRow();
    await waitFor(() =>
      expect(
        within(row).getByText("agentic.common.unavailable")
      ).toBeInTheDocument()
    );
    expect(within(row).queryByText("agentic.provider.notUsed")).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Kebab toggle" }));
    expect(
      screen.getByRole("menuitem", { name: "actions.delete" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});
