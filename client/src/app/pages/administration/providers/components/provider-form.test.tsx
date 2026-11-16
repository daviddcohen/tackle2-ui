import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { ModelProjection, Provider, ProviderRequest } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { ProviderForm } from "./provider-form";

const existing: Provider = {
  id: "1",
  name: "Anthropic Production",
  providerType: "anthropic",
  endpoint: "https://api.anthropic.com/v1",
  verificationStatus: "verified",
};

const nameInput = () => screen.getByRole("textbox", { name: /terms.name/ });
const endpointInput = () =>
  screen.getByRole("textbox", { name: /agentic.provider.endpoint/ });
const submit = () => screen.getByRole("button", { name: "actions.create" });

const modelUsing = (id: string, providerId: string) =>
  ({ id, name: id, provider: { id: providerId, name: "" } }) as ModelProjection;

describe("ProviderForm", () => {
  let created: ProviderRequest[];
  let rejected: number;
  let createStatus: number;
  let models: ModelProjection[];

  beforeEach(() => {
    created = [];
    rejected = 0;
    createStatus = 201;
    models = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(ctx.json(models))
      ),
      rest.get(AGENTIC_ENDPOINTS.providers, (_req, res, ctx) =>
        res(ctx.json([existing]))
      ),
      rest.post(AGENTIC_ENDPOINTS.providers, async (req, res, ctx) => {
        const body = await req.json();
        if (createStatus !== 201) {
          rejected += 1;
          return res(
            ctx.status(createStatus),
            ctx.json({ message: "Provider name already exists." })
          );
        }
        created.push(body);
        return res(
          ctx.status(201),
          ctx.json({ ...body, id: "9", verificationStatus: "pending" })
        );
      })
    );
  });

  it("opens without fields in an error state", async () => {
    render(<ProviderForm provider={null} onClose={jest.fn()} />);
    expect(nameInput()).toHaveAttribute("aria-invalid", "false");
    expect(endpointInput()).toHaveAttribute("aria-invalid", "false");
    expect(submit()).toBeDisabled();
  });

  it("rejects a duplicate name and an endpoint that is not a URL", async () => {
    const user = userEvent.setup();
    render(<ProviderForm provider={null} onClose={jest.fn()} />);
    await user.click(nameInput());
    await user.paste("Anthropic Production");
    await user.click(endpointInput());
    await user.paste("not a url");
    await user.tab();

    expect(
      await screen.findByText("agentic.provider.validation.nameDuplicate")
    ).toBeInTheDocument();
    expect(
      screen.getByText("agentic.provider.validation.endpointUrl")
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  // The footer button submits through form="provider-form"; jsdom has no
  // implicit (Enter) submission for it, which e2e providers.spec.ts covers.
  it("submits from the footer and closes once the server accepted it", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ProviderForm provider={null} onClose={onClose} />);

    await user.click(nameInput());
    await user.paste("  QA Provider ");
    await user.click(endpointInput());
    await user.paste("https://qa.example.com/v1");
    await waitFor(() => expect(submit()).toBeEnabled());
    fireEvent.click(submit());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(created).toEqual([
      {
        name: "QA Provider",
        description: "",
        providerType: "anthropic",
        endpoint: "https://qa.example.com/v1",
      },
    ]);
  });

  it("stays open with the input when the server rejects the save", async () => {
    createStatus = 409;
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ProviderForm provider={null} onClose={onClose} />);

    await user.click(nameInput());
    await user.paste("QA Provider");
    await user.click(endpointInput());
    await user.paste("https://qa.example.com/v1");
    await waitFor(() => expect(submit()).toBeEnabled());
    fireEvent.click(submit());

    await waitFor(() => expect(rejected).toBe(1));
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue("QA Provider");
  });

  it("puts the example endpoint in the helper text, not the placeholder", () => {
    render(<ProviderForm provider={null} onClose={jest.fn()} />);
    expect(endpointInput()).not.toHaveAttribute("placeholder");
    expect(
      screen.getByText("agentic.provider.endpointHelp")
    ).toBeInTheDocument();
  });

  it("warns that changes apply to the models of a verified provider in use", async () => {
    models = [modelUsing("m1", "1")];
    render(<ProviderForm provider={existing} onClose={jest.fn()} />);
    expect(
      await screen.findByText("agentic.provider.inUse")
    ).toBeInTheDocument();
    expect(screen.queryByText("agentic.provider.unreachableTitle")).toBeNull();
    // no alert says it, so the description does
    expect(
      screen.getByText("agentic.provider.editVerifiedDescription")
    ).toBeInTheDocument();
  });

  it("never looks unused while the models load or after they fail (X6)", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    render(<ProviderForm provider={existing} onClose={jest.fn()} />);
    expect(await screen.findByText("terms.loading")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "agentic.provider.editUsageUnchecked",
        undefined,
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("terms.loading")).toBeNull();
  });

  it("shows an unreachable provider's status, last verification and usage in one alert", async () => {
    models = [modelUsing("m1", "1")];
    render(
      <ProviderForm
        provider={{
          ...existing,
          verificationStatus: "unreachable",
          statusReason: "No response.",
          lastVerified: "2026-09-18T07:45:00Z",
        }}
        onClose={jest.fn()}
      />
    );
    expect(
      screen.getByText("agentic.provider.unreachableTitle")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No response. agentic.provider.statusAlertAction")
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "agentic.provider.lastVerified agentic.provider.inUse"
      )
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".pf-v6-c-alert")).toHaveLength(1);
    // the alert already says to save to verify it again
    expect(
      screen.getByText("agentic.provider.editDescription")
    ).toBeInTheDocument();
  });

  it("omits the last verification when a pending provider has none", async () => {
    render(
      <ProviderForm
        provider={{
          ...existing,
          verificationStatus: "pending",
          statusReason: "In progress.",
        }}
        onClose={jest.fn()}
      />
    );
    expect(
      screen.getByText("agentic.provider.pendingTitle")
    ).toBeInTheDocument();
    expect(screen.queryByText(/agentic.provider.lastVerified/)).toBeNull();
  });
});
