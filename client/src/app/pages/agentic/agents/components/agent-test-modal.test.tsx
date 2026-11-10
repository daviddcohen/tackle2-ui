import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Agent } from "@app/agentic";
import { hub } from "@app/api/rest";
import { render, screen } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { AgentTestModal } from "./agent-test-modal";

const makeAgent = (id: string, name: string): Agent => ({
  id,
  name,
  description: "",
  model: { id: "1", name: "Model" },
  skills: [],
  prompt: "",
  capabilities: [],
  parameters: [],
});

describe("AgentTestModal", () => {
  beforeEach(() => {
    server.use(
      rest.get(hub`/applications`, (_req, res, ctx) =>
        res(ctx.json([{ id: 1, name: "Customer Management" }]))
      )
    );
  });

  it("does not carry the previous Agent's input over", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentTestModal
        agent={makeAgent("1", "Build Validator")}
        onClose={jest.fn()}
      />
    );
    const task = () =>
      screen.getByRole("textbox", { name: /agentic.agent.testTask/ });
    await user.type(task(), "Task for build validator");
    expect(task()).toHaveValue("Task for build validator");

    // switching Agents while open
    rerender(
      <AgentTestModal
        agent={makeAgent("2", "Test Runner")}
        onClose={jest.fn()}
      />
    );
    expect(task()).toHaveValue("");

    // closing and re-opening for the same Agent
    await user.type(task(), "Another task");
    rerender(<AgentTestModal agent={null} onClose={jest.fn()} />);
    rerender(
      <AgentTestModal
        agent={makeAgent("2", "Test Runner")}
        onClose={jest.fn()}
      />
    );
    expect(task()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "agentic.agent.startTest" })
    ).toBeDisabled();
  });
});
