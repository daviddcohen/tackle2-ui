import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Provider, ProviderRequest } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
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
const submit = () =>
  screen.getByRole("button", { name: "agentic.provider.create" });

describe("ProviderForm", () => {
  let created: ProviderRequest[];
  let createStatus: number;

  beforeEach(() => {
    created = [];
    createStatus = 201;
    server.use(
      rest.get(AGENTIC_ENDPOINTS.providers, (_req, res, ctx) =>
        res(ctx.json([existing]))
      ),
      rest.post(AGENTIC_ENDPOINTS.providers, async (req, res, ctx) => {
        const body = await req.json();
        if (createStatus !== 201) {
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

  it("submits on Enter and closes once the server accepted it", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<ProviderForm provider={null} onClose={onClose} />);

    await user.click(nameInput());
    await user.paste("  QA Provider ");
    await user.click(endpointInput());
    await user.paste("https://qa.example.com/v1");
    await user.keyboard("{Enter}");

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
    await user.keyboard("{Enter}");

    await waitFor(() => expect(submit()).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue("QA Provider");
  });
});
