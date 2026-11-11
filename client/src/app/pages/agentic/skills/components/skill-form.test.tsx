import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Skill, SkillCollection, SkillRequest } from "@app/agentic";
import { hub } from "@app/api/rest";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { SkillForm } from "./skill-form";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const mockGrantedScopes: { agents: boolean } = { agents: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.agents,
}));

const skill: Skill = {
  id: "1",
  name: "Spring Boot to Quarkus migration",
  description: "Guidance.",
  sourceType: "inline",
  content: "# Spring Boot to Quarkus",
  associations: [
    { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
    { scope: "targetProfile", resource: { id: 11, name: "Quarkus 3.x" } },
  ],
};

const collections: SkillCollection[] = [
  {
    id: "1",
    name: "Java modernization foundation",
    description: "",
    skills: [{ id: "1", name: skill.name }],
  },
];

const archetypes = [
  {
    id: 1,
    name: "Spring Boot Application",
    profiles: [{ id: 11, name: "Quarkus 3.x" }],
  },
  {
    id: 2,
    name: "Legacy Java Application",
    profiles: [{ id: 32, name: "Java 17 on RHEL" }],
  },
];

let updated: SkillRequest[];

beforeEach(() => {
  mockGrantedScopes.agents = true;
  updated = [];
  server.use(
    rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
      res(ctx.json([skill]))
    ),
    rest.put(`${AGENTIC_ENDPOINTS.skills}/:id`, async (req, res, ctx) => {
      const body = await req.json();
      updated.push(body);
      return res(ctx.json({ ...skill, ...body }));
    }),
    rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
      res(ctx.json(collections))
    ),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(
        ctx.json([
          { id: "2", name: "Code Migrator" },
          { id: "3", name: "Test Runner" },
        ])
      )
    ),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json(archetypes))),
    rest.get(hub`/applications`, (_req, res, ctx) => res(ctx.json([])))
  );
});

describe("SkillForm", () => {
  it("creates with a description and the association fields visible", async () => {
    render(<SkillForm skill={null} onClose={jest.fn()} />);

    expect(screen.getByText("Create skill")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A skill gives agents migration knowledge from inline Markdown, a Git repository or an OCI image."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Associations")).toBeInTheDocument();
    for (const id of [
      "skill-agents",
      "skill-archetypes",
      "skill-target-profiles",
      "skill-applications",
    ]) {
      expect(document.querySelector(`#${id}-input`)).toBeVisible();
    }
    expect(
      screen.queryByText(/Changes apply wherever it is used/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("warns on edit and shows the associations with one chip per value", async () => {
    render(<SkillForm skill={skill} onClose={jest.fn()} />);

    expect(
      await screen.findByText(
        "This skill has 2 associations and is in 1 skill collection. Changes apply wherever it is used."
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Quarkus 3.x (Spring Boot Application)")
    ).toBeInTheDocument();
    expect(screen.getByText("Code Migrator")).toBeInTheDocument();
  });

  it("offers every target profile of every archetype (S5)", async () => {
    const user = userEvent.setup();
    render(<SkillForm skill={skill} onClose={jest.fn()} />);

    await screen.findByText("Quarkus 3.x (Spring Boot Application)");
    await user.click(
      document.querySelector<HTMLInputElement>("#skill-target-profiles-input")!
    );
    expect(
      await screen.findByText("Java 17 on RHEL (Legacy Java Application)")
    ).toBeInTheDocument();
  });

  it("keeps the agents and sends them back without agent write access (S6)", async () => {
    mockGrantedScopes.agents = false;
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<SkillForm skill={skill} onClose={onClose} />);

    expect(
      screen.getByText(
        "You need permission to edit agents to change this field."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Code Migrator")).toBeInTheDocument();
    // PF marks the disabled typeahead toggle; its chips stay visible.
    expect(
      document
        .querySelector("#skill-agents-input")
        ?.closest(".pf-v6-c-menu-toggle")
    ).toHaveClass("pf-m-disabled");

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    // Blur first: validation on blur briefly disables Save.
    await user.tab();
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    // jsdom does not submit through the footer button's `form` attribute.
    expect(save).toHaveAttribute("form", "skill-form");
    fireEvent.submit(document.getElementById("skill-form")!);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updated[0].associations).toEqual([
      { scope: "agent", resource: { id: "2" } },
      { scope: "targetProfile", resource: { id: 11 } },
    ]);
  });
});
