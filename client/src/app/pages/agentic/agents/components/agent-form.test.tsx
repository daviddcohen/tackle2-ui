import userEvent from "@testing-library/user-event";
import { rest } from "msw";

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
    const combobox = screen.getByPlaceholderText("agentic.agent.addSkill");
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
