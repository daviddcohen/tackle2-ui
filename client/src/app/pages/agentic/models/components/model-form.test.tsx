import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { ModelProjection, ModelRequest, Provider } from "@app/agentic";
import { Identity } from "@app/api/models";
import { hub } from "@app/api/rest";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { ModelForm } from "./model-form";

const providers: Provider[] = [
  {
    id: "p1",
    name: "Anthropic Production",
    providerType: "anthropic",
    endpoint: "https://api.anthropic.com",
    verificationStatus: "verified",
  },
  {
    id: "p2",
    name: "Azure OpenAI Corp",
    providerType: "azure_openai",
    endpoint: "https://azure.example.com",
    verificationStatus: "verified",
  },
];

const model: ModelProjection = {
  id: "m1",
  name: "Claude 3.7 Sonnet",
  description: "Reasoning model.",
  provider: { id: "p1", name: "Anthropic Production" },
  model: "claude-3-7-sonnet",
  credential: { id: 4, name: "Anthropic key" },
  verificationStatus: "verified",
  isOrganizationDefault: true,
};

const availableModels: Record<string, { id: string; displayName: string }[]> = {
  p1: [{ id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" }],
  p2: [{ id: "gpt-4o", displayName: "GPT-4o" }],
};

const identities: Identity[] = [
  { id: 4, kind: "bearer", name: "Anthropic key" },
  { id: 5, kind: "bearer", name: "Azure key" },
  { id: 6, kind: "source", name: "Git credential" },
];

describe("ModelForm", () => {
  let updates: ModelRequest[];
  let creates: ModelRequest[];
  let existingModels: ModelProjection[];

  beforeEach(() => {
    updates = [];
    creates = [];
    existingModels = [model];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(ctx.json(existingModels))
      ),
      rest.get(hub`/identities`, (_req, res, ctx) => res(ctx.json(identities))),
      rest.post(AGENTIC_ENDPOINTS.models, async (req, res, ctx) => {
        creates.push(await req.json());
        return res(ctx.status(201), ctx.json({}));
      }),
      rest.get(AGENTIC_ENDPOINTS.providers, (_req, res, ctx) =>
        res(ctx.delay(50), ctx.json(providers))
      ),
      rest.get(
        `${AGENTIC_ENDPOINTS.providers}/:id/available-models`,
        (req, res, ctx) =>
          res(ctx.json(availableModels[req.params.id as string] ?? []))
      ),
      rest.put(`${AGENTIC_ENDPOINTS.models}/:id`, async (req, res, ctx) => {
        updates.push(await req.json());
        return res(ctx.status(204));
      })
    );
  });

  const providerInput = () =>
    document.querySelector<HTMLInputElement>("#model-provider-select-input");
  const modelIdInput = () =>
    document.querySelector<HTMLInputElement>("#model-id-select-input");

  it("edits without wiping the Model ID; the provider is pre-selected once providers load", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ModelForm model={model} onClose={onClose} />);

    // (i18n keys are rendered as-is in tests)
    await waitFor(() =>
      expect(providerInput()).toHaveValue("agentic.model.providerOption")
    );
    // the saved Model ID stays selected even though the provider no longer lists it
    await waitFor(() =>
      expect(modelIdInput()).toHaveValue("claude-3-7-sonnet")
    );

    const name = screen.getByRole("textbox", { name: /terms.name/ });
    await user.clear(name);
    await user.type(name, "Claude renamed");
    const save = screen.getByRole("button", { name: "actions.save" });
    await waitFor(() => expect(save).toBeEnabled());
    // a pointer click blurs the field first, and the blur validation briefly disables Save
    fireEvent.click(save);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updates).toEqual([
      {
        name: "Claude renamed",
        description: "Reasoning model.",
        provider: { id: "p1" },
        model: "claude-3-7-sonnet",
        endpoint: "https://api.anthropic.com",
        credential: { id: 4 },
      },
    ]);
  });

  it("clears the Model ID only when the user picks a different provider", async () => {
    const user = userEvent.setup();
    render(<ModelForm model={model} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(modelIdInput()).toHaveValue("claude-3-7-sonnet")
    );

    // re-picking the same provider keeps the Model ID
    await user.click(providerInput()!);
    await user.click((await screen.findAllByRole("option"))[0]);
    expect(modelIdInput()).toHaveValue("claude-3-7-sonnet");

    // another provider clears it
    await user.click(providerInput()!);
    await user.click((await screen.findAllByRole("option"))[1]);
    await waitFor(() => expect(modelIdInput()).toHaveValue(""));
    expect(
      await screen.findByText("agentic.model.validation.modelRequired")
    ).toBeInTheDocument();
  });

  it("creates the first Model with a credential from the Hub identities", async () => {
    existingModels = [];
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ModelForm model={null} onClose={onClose} />);

    await user.type(
      screen.getByRole("textbox", { name: /terms.name/ }),
      "First model"
    );
    await waitFor(() => expect(providerInput()).toBeInTheDocument());
    await user.click(providerInput()!);
    await user.click((await screen.findAllByRole("option"))[0]);
    await user.click(modelIdInput()!);
    await user.click(
      await screen.findByRole("option", { name: "Claude Sonnet 4.6" })
    );

    const credentialInput = document.querySelector<HTMLInputElement>(
      "#model-credential-select-input"
    );
    await user.click(credentialInput!);
    // only API-key identities are offered
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Anthropic key",
      "Azure key",
    ]);
    await user.click(options[1]);

    const create = screen.getByRole("button", { name: "actions.create" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(creates).toEqual([
      {
        name: "First model",
        description: "",
        provider: { id: "p1" },
        model: "claude-sonnet-4-6",
        endpoint: "https://api.anthropic.com",
        credential: { id: 5 },
      },
    ]);
  });
});
