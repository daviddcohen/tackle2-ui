import { render as renderPlain } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent } from "@app/agentic";
import { hub } from "@app/api/rest";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
} from "@app/test-config/test-utils";
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

  it("names the agent in the description and links the toast to its runs", async () => {
    const user = userEvent.setup();
    server.use(
      rest.post(AGENTIC_ENDPOINTS.agentRuns, (_req, res, ctx) =>
        res(ctx.status(201), ctx.json({ id: "1" }))
      )
    );
    const notifications = createMockNotifications();
    render(
      <NotificationsContext.Provider value={notifications}>
        <AgentTestModal
          agent={makeAgent("2", "Code Migrator")}
          onClose={jest.fn()}
        />
      </NotificationsContext.Provider>
    );
    expect(
      screen.getByRole("heading", { name: "agentic.agent.test" })
    ).toBeInTheDocument();
    expect(screen.getByText("agentic.agent.testDescription")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();

    await user.type(screen.getByRole("combobox"), "Customer");
    await user.click(
      await screen.findByRole("option", { name: "Customer Management" })
    );
    await user.type(
      screen.getByRole("textbox", { name: /agentic.agent.testTask/ }),
      "Run the unit tests"
    );
    await user.click(
      screen.getByRole("button", { name: "agentic.agent.startTest" })
    );
    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalled()
    );
    const { message, variant } =
      notifications.pushNotification.mock.calls[0][0];
    expect(variant).toBe("success");
    renderPlain(<MemoryRouter>{message}</MemoryRouter>);
    expect(
      screen.getByRole("link", { name: "agentic.agent.viewRuns" })
    ).toHaveAttribute("href", "/agents/2?tab=runs");
  });
});
