import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, MigrationPlan } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { AgentFormModal } from "./agent-form-modal";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const agent: Agent = {
  id: "7",
  name: "Code Migrator",
  description: "",
  model: { id: "1", name: "Model" },
  skills: [],
  prompt: "",
  capabilities: [],
  parameters: [],
};

const plan = (id: string, agentId: string) =>
  ({
    id,
    name: `Plan ${id}`,
    stages: [{ id: `${id}-1`, name: "Migrate", agent: { id: agentId } }],
  }) as unknown as MigrationPlan;

describe("AgentFormModal", () => {
  beforeEach(() =>
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json([plan("1", "7"), plan("2", "7"), plan("3", "8")]))
      ),
      ...[
        AGENTIC_ENDPOINTS.agents,
        AGENTIC_ENDPOINTS.models,
        AGENTIC_ENDPOINTS.skills,
        AGENTIC_ENDPOINTS.skillCollections,
      ].map((endpoint) =>
        rest.get(endpoint, (_req, res, ctx) => res(ctx.json([])))
      )
    )
  );

  it("creates with a description, no warning and the actions in the footer", async () => {
    render(
      <MemoryRouter>
        <AgentFormModal agent={null} isOpen formKey={1} onClose={jest.fn()} />
      </MemoryRouter>
    );
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByRole("heading", { name: "Create agent" })
    ).toBeInTheDocument();
    expect(modal).toHaveTextContent(
      "An agent runs migration plan stages using one model and its skills."
    );
    const footer = modal.querySelector(".pf-v6-c-modal-box__footer")!;
    expect(
      within(footer as HTMLElement).getByRole("button", { name: "Create" })
    ).toBeDisabled();
    expect(
      within(footer as HTMLElement).getByRole("button", { name: "Cancel" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Used by/)).toBeNull();
  });

  it("warns that an edit applies to the plans using the agent", async () => {
    render(
      <MemoryRouter>
        <AgentFormModal agent={agent} isOpen formKey={1} onClose={jest.fn()} />
      </MemoryRouter>
    );
    expect(
      await screen.findByText(
        "Used by 2 migration plans. Changes apply to their stages."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Edit agent" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("never looks unused while the plans load or after they fail (X6)", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    render(
      <MemoryRouter>
        <AgentFormModal agent={agent} isOpen formKey={1} onClose={jest.fn()} />
      </MemoryRouter>
    );
    expect(await screen.findByText("Loading")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Usage could not be checked. Changes apply to every migration plan stage that uses this agent.",
        undefined,
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading")).toBeNull();
  });
});
