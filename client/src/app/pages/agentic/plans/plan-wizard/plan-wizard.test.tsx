import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Agent, MigrationPlan, MigrationPlanRequest } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { PlanWizard } from "./plan-wizard";

const agents = [
  { id: "1", name: "Migration Proposal Agent", skills: [] },
  { id: "2", name: "Code Migrator", skills: [] },
] as unknown as Agent[];

const archetypes = [
  {
    id: 1,
    name: "Java EE Application",
    profiles: [{ id: 11, name: "Quarkus 3.x" }],
  },
];

const plan = {
  id: "2",
  name: "Spring Boot to Quarkus",
  description: "  Moves Spring Boot services.  ",
  migrationPath: {
    archetype: { id: 1, name: "Java EE Application" },
    targetProfiles: [{ id: 11, name: "Quarkus 3.x" }],
    isDefault: true,
  },
  stages: [
    {
      id: "4",
      name: "Analyze",
      agent: { id: "1", name: "Migration Proposal Agent" },
      instructions: "Analyze it",
      requiresApproval: true,
      order: 1,
    },
    {
      id: "5",
      name: "Migrate",
      agent: { id: "2", name: "Code Migrator" },
      instructions: "",
      requiresApproval: false,
      order: 2,
    },
  ],
  effectiveSkills: [{ skill: { id: "3", name: "Skill" } }],
} as unknown as MigrationPlan;

const otherPlan = {
  ...plan,
  id: "1",
  name: "Java EE to Quarkus",
} as MigrationPlan;

describe("PlanWizard", () => {
  let updates: MigrationPlanRequest[];

  beforeEach(() => {
    updates = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.json(agents))
      ),
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json([otherPlan, plan]))
      ),
      rest.get("/hub/archetypes", (_req, res, ctx) =>
        res(ctx.json(archetypes))
      ),
      rest.put(`${AGENTIC_ENDPOINTS.plans}/:id`, async (req, res, ctx) => {
        updates.push(await req.json());
        return res(ctx.status(204));
      })
    );
  });

  const nameInput = () => screen.getByRole("textbox", { name: /terms\.name/ });
  const nextButton = () => screen.getByRole("button", { name: "Next" });

  it("rejects a name that matches another Plan, ignoring case and spaces", async () => {
    const user = userEvent.setup();
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await waitFor(() => expect(nameInput()).toHaveValue(plan.name));
    await waitFor(() => expect(nextButton()).toBeEnabled());

    await user.clear(nameInput());
    await user.type(nameInput(), "  java ee TO quarkus ");
    expect(
      await screen.findByText("agentic.plan.validation.nameDuplicate")
    ).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    // Its own name is not a duplicate.
    await user.clear(nameInput());
    await user.type(nameInput(), "Spring Boot to Quarkus");
    await waitFor(() => expect(nextButton()).toBeEnabled());

    await user.clear(nameInput());
    expect(nextButton()).toBeDisabled();
  });

  it("saves an edit with id-only references and keeps existing stage ids", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<PlanWizard isOpen plan={plan} onClose={onClose} />);
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await user.click(nextButton());
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await user.click(nextButton());
    await user.click(
      await screen.findByRole("button", { name: "agentic.plan.saveChanges" })
    );

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      name: "Spring Boot to Quarkus",
      description: "Moves Spring Boot services.",
      migrationPath: {
        archetype: { id: 1 },
        targetProfiles: [{ id: 11 }],
        isDefault: true,
      },
      stages: [
        {
          id: "4",
          name: "Analyze",
          agent: { id: "1" },
          instructions: "Analyze it",
          requiresApproval: true,
        },
        {
          id: "5",
          name: "Migrate",
          agent: { id: "2" },
          instructions: "",
          requiresApproval: false,
        },
      ],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
