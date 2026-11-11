import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, ModelProjection, Skill, SkillCollection } from "@app/agentic";
import { hub } from "@app/api/rest";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  AgentForm,
  findDuplicateParameterIndex,
  isValidParameterDefault,
} from "./agent-form";

const agent: Agent = {
  id: "1",
  name: "Migration Agent",
  description: "Migrates applications.",
  model: { id: "1", name: "Approved Model" },
  skills: [{ id: "1", name: "First Skill" }],
  prompt: "Migrate the application.",
  capabilities: [],
  parameters: [],
};

const models: ModelProjection[] = [
  {
    id: "1",
    name: "Approved Model",
    provider: { id: "1", name: "Provider" },
    model: "model-id",
    verificationStatus: "verified",
    isOrganizationDefault: true,
  },
];

const skills: Skill[] = [
  {
    id: "1",
    name: "First Skill",
    description: "First Skill description.",
    sourceType: "inline",
  },
  {
    id: "2",
    name: "Second Skill",
    description: "Second Skill description.",
    sourceType: "git",
  },
];

const skillCollections: SkillCollection[] = [
  {
    id: "1",
    name: "Java foundation",
    description: "Common Java Skills.",
    skills: [{ id: "1", name: "First Skill" }],
  },
];

describe("AgentForm", () => {
  beforeEach(() => {
    server.use(
      rest.get(hub`/prototype/agentic/agents`, (_req, res, ctx) =>
        res(ctx.json([agent]))
      ),
      rest.get(hub`/prototype/agentic/models`, (_req, res, ctx) =>
        res(ctx.json(models))
      ),
      rest.get(hub`/prototype/agentic/skills`, (_req, res, ctx) =>
        res(ctx.json(skills))
      ),

      rest.get(hub`/prototype/agentic/skill-collections`, (_req, res, ctx) =>
        res(ctx.json(skillCollections))
      )
    );
  });

  it("keeps selected Skills inside one searchable multi-select", async () => {
    const user = userEvent.setup();
    render(<AgentForm agent={agent} onClose={jest.fn()} />);

    await screen.findByLabelText("agentic.agent.skillsSelect");
    const combobox = screen.getByPlaceholderText("agentic.agent.selectSkills");
    const control = combobox.closest<HTMLElement>(".pf-v6-c-menu-toggle");
    expect(control).not.toBeNull();

    await waitFor(() =>
      expect(within(control!).getByLabelText("First Skill")).toBeVisible()
    );
    expect(
      within(control!).getByLabelText("composed.selectedCount")
    ).toHaveTextContent("1");

    await user.click(combobox);
    await user.click(await screen.findByText("Second Skill"));

    expect(within(control!).getByLabelText("Second Skill")).toBeVisible();
    expect(
      within(control!).getByLabelText("composed.selectedCount")
    ).toHaveTextContent("2");

    await user.click(
      within(control!).getAllByLabelText("terms.removeSelection")[0]
    );
    expect(
      within(control!).queryByLabelText("First Skill")
    ).not.toBeInTheDocument();

    await user.click(
      within(control!).getByLabelText("actions.clearInputValue")
    );
    expect(
      within(control!).queryByLabelText("Second Skill")
    ).not.toBeInTheDocument();

    await user.type(combobox, "Second{ArrowDown}{Enter}");
    expect(within(control!).getByLabelText("Second Skill")).toBeVisible();
  });

  it("opens the parameters group when the agent has parameters or one is added (A10)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AgentForm
        agent={{
          ...agent,
          parameters: [
            { name: "instructions", type: "string", description: "" },
          ],
        }}
        onClose={jest.fn()}
      />
    );
    await screen.findByLabelText("agentic.agent.skillsSelect");
    expect(
      screen.getByRole("button", { name: /agentic\.agent\.parameters/ })
    ).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector("#agent-parameter-0-name")).toHaveValue(
      "instructions"
    );
    unmount();

    render(<AgentForm agent={agent} onClose={jest.fn()} />);
    await screen.findByLabelText("agentic.agent.skillsSelect");
    const toggle = screen.getByRole("button", {
      name: /agentic\.agent\.parameters/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(
      screen.getByRole("button", { name: "agentic.agent.addParameter" })
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector("#agent-parameter-0-name")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "agentic.agent.removeParameter" })
    );
    expect(document.querySelector("#agent-parameter-0-name")).toBeNull();
  });

  it("rejects duplicate parameter names and defaults that do not match the type", async () => {
    const user = userEvent.setup();
    render(<AgentForm agent={agent} onClose={jest.fn()} />);
    await screen.findByLabelText("agentic.agent.skillsSelect");

    const addParameter = screen.getByRole("button", {
      name: "agentic.agent.addParameter",
    });
    await user.click(addParameter);
    await user.type(document.querySelector("#agent-parameter-0-name")!, "p1");
    await user.click(addParameter);
    await user.type(document.querySelector("#agent-parameter-1-name")!, "P1");

    expect(
      await screen.findByText("agentic.agent.validation.parameterNameDuplicate")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.save" })).toBeDisabled();

    await user.clear(document.querySelector("#agent-parameter-1-name")!);
    await user.type(document.querySelector("#agent-parameter-1-name")!, "p2");
    await user.selectOptions(
      document.querySelector("#agent-parameter-1-type")!,
      "number"
    );
    await user.type(
      document.querySelector("#agent-parameter-1-default")!,
      "not-a-number"
    );
    await waitFor(() =>
      expect(
        screen.queryByText("agentic.agent.validation.parameterNameDuplicate")
      ).toBeNull()
    );
    expect(
      await screen.findByText("agentic.agent.validation.parameterDefaultType")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.save" })).toBeDisabled();

    await user.clear(document.querySelector("#agent-parameter-1-default")!);
    await user.type(
      document.querySelector("#agent-parameter-1-default")!,
      "42"
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "actions.save" })).toBeEnabled()
    );
  });
});

describe("AgentForm model", () => {
  const model = (
    id: string,
    verificationStatus: ModelProjection["verificationStatus"],
    isOrganizationDefault = false
  ): ModelProjection => ({
    id,
    name: `Model ${id}`,
    provider: { id: "1", name: "Provider" },
    model: `model-${id}`,
    verificationStatus,
    isOrganizationDefault,
  });
  const useModels = (list: ModelProjection[]) =>
    server.use(
      rest.get(hub`/prototype/agentic/agents`, (_req, res, ctx) =>
        res(ctx.json([agent]))
      ),
      rest.get(hub`/prototype/agentic/models`, (_req, res, ctx) =>
        res(ctx.json(list))
      ),
      rest.get(hub`/prototype/agentic/skills`, (_req, res, ctx) =>
        res(ctx.json([]))
      ),
      rest.get(hub`/prototype/agentic/skill-collections`, (_req, res, ctx) =>
        res(ctx.json([]))
      )
    );
  const renderInRouter = (ui: React.ReactElement) =>
    render(<MemoryRouter>{ui}</MemoryRouter>);
  const modelInput = () =>
    document.querySelector<HTMLInputElement>("#gateway-select-toggle-input")!;

  it("preselects the verified organization default and marks it Default (A5, A7)", async () => {
    const user = userEvent.setup();
    useModels([model("1", "verified"), model("2", "verified", true)]);
    renderInRouter(<AgentForm agent={null} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(modelInput()).toHaveValue("agentic.agent.modelOption")
    );
    expect(screen.getByText("agentic.agent.modelHelp")).toBeInTheDocument();
    await user.click(modelInput());
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[1]).toHaveTextContent("agentic.agent.modelDefault");
    expect(options[0]).not.toHaveTextContent("agentic.agent.modelDefault");
  });

  it("does not preselect a default that is not verified", async () => {
    useModels([model("1", "verified"), model("2", "pending", true)]);
    renderInRouter(<AgentForm agent={null} onClose={jest.fn()} />);
    await screen.findByText("agentic.agent.modelHelp");
    await waitFor(() => expect(modelInput()).toBeEnabled());
    expect(modelInput()).toHaveValue("");
  });

  it("disables the field and says why when no model is verified (A5)", async () => {
    useModels([model("1", "pending", true), model("2", "unreachable")]);
    renderInRouter(<AgentForm agent={null} onClose={jest.fn()} />);
    expect(
      await screen.findByText("agentic.agent.noVerifiedModels")
    ).toBeInTheDocument();
    expect(modelInput()).toBeDisabled();
    expect(screen.queryByText("agentic.agent.modelHelp")).toBeNull();
  });

  it("says the models could not be loaded instead of none verified (X6)", async () => {
    useModels([]);
    server.use(
      rest.get(hub`/prototype/agentic/models`, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    renderInRouter(<AgentForm agent={null} onClose={jest.fn()} />);
    expect(
      await screen.findByText("agentic.agent.modelsUnavailable", undefined, {
        timeout: 5000,
      })
    ).toBeInTheDocument();
    expect(modelInput()).toBeDisabled();
    expect(screen.queryByText("agentic.agent.noVerifiedModels")).toBeNull();
    expect(screen.queryByText("agentic.agent.modelHelp")).toBeNull();
  });

  it("warns when the agent's current model is not verified (A6)", async () => {
    useModels([model("1", "unreachable"), model("2", "verified", true)]);
    renderInRouter(<AgentForm agent={agent} onClose={jest.fn()} />);
    expect(
      await screen.findByText("agentic.agent.modelNotVerifiedHelp")
    ).toBeInTheDocument();
    expect(modelInput()).toHaveValue("agentic.agent.modelOption");
    expect(screen.queryByText("agentic.agent.modelHelp")).toBeNull();
  });
});

describe("agent parameter rules", () => {
  it("validates typed defaults", () => {
    expect(isValidParameterDefault("number", "")).toBe(true);
    expect(isValidParameterDefault("number", " 3.5 ")).toBe(true);
    expect(isValidParameterDefault("number", "abc")).toBe(false);
    expect(isValidParameterDefault("boolean", "true")).toBe(true);
    expect(isValidParameterDefault("boolean", "yes")).toBe(false);
    expect(isValidParameterDefault("string", "anything")).toBe(true);
  });

  it("finds the first repeated parameter name, ignoring case and blanks", () => {
    expect(findDuplicateParameterIndex([{ name: "a" }, { name: "b" }])).toBe(
      -1
    );
    expect(findDuplicateParameterIndex([{ name: "" }, { name: " " }])).toBe(-1);
    expect(
      findDuplicateParameterIndex([
        { name: "a" },
        { name: "b" },
        { name: " A" },
      ])
    ).toBe(2);
  });
});
