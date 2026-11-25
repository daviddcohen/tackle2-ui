import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, MigrationPlan, MigrationPlanRequest } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { PlanWizard } from "./plan-wizard";

const agents = [
  {
    id: "1",
    name: "Migration Proposal Agent",
    model: { id: "m1", name: "Claude" },
    skills: [],
  },
  {
    id: "2",
    name: "Code Migrator",
    model: { id: "m1", name: "Claude" },
    skills: [{ id: "9", name: "Skill" }],
    skillCollections: [{ id: "1", name: "Collection" }],
  },
] as unknown as Agent[];

const plan = {
  id: "2",
  name: "Spring Boot to Quarkus",
  description: "  Moves Spring Boot services.  ",
  migrationPaths: [
    {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfile: { id: 11, name: "Quarkus 3.x" },
    },
  ],
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
} as unknown as MigrationPlan;

const otherPlan = {
  ...plan,
  id: "1",
  name: "Java EE to Quarkus",
} as MigrationPlan;

describe("PlanWizard", () => {
  let updates: MigrationPlanRequest[];
  let creates: MigrationPlanRequest[];

  beforeEach(() => {
    updates = [];
    creates = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.json(agents))
      ),
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json([otherPlan, plan]))
      ),
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(
          ctx.json([
            {
              id: "m1",
              name: "Claude",
              provider: { id: "p", name: "Anthropic" },
              verificationStatus: "pending",
            },
          ])
        )
      ),
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.json({ stages: [], everyStage: [{ skills: [] }], skills: [] }))
      ),
      rest.put(`${AGENTIC_ENDPOINTS.plans}/:id`, async (req, res, ctx) => {
        updates.push(await req.json());
        return res(ctx.status(204));
      }),
      rest.post(AGENTIC_ENDPOINTS.plans, async (req, res, ctx) => {
        creates.push(await req.json());
        return res(ctx.status(201), ctx.json({ ...plan, id: "9" }));
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
    // The Skills step never blocks Next.
    await user.click(nextButton());
    await user.click(
      await screen.findByRole("button", { name: "actions.save" })
    );

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      name: "Spring Boot to Quarkus",
      // No target profiles: they are assigned on the target profile side.
      description: "Moves Spring Boot services.",
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

  it("opens every step in edit mode, with the stages collapsed", async () => {
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await waitFor(() => expect(nameInput()).toHaveValue(plan.name));
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "agentic.plan.stages" })
    );
    expect(
      await screen.findAllByText("agentic.plan.runBy", { exact: false })
    ).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: /stageName/ })).toBeNull();
  });

  it("describes each agent option and warns about an unverified model", async () => {
    const user = userEvent.setup();
    render(<PlanWizard isOpen plan={null} onClose={jest.fn()} />);
    await user.type(nameInput(), "New plan");
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await user.click(nextButton());

    await user.click(
      screen.getByRole("button", { name: /agentic\.entity\.agent/ })
    );
    const option = await screen.findByRole("option", { name: /Code Migrator/ });
    expect(option).toHaveTextContent("agentic.plan.agentOption");
    await user.click(option);
    expect(
      screen.getByText("agentic.plan.agentModelNotVerified")
    ).toBeInTheDocument();
    // What is attached to the agent; the Skills step shows what stages get.
    expect(screen.getByText("agentic.plan.agentHasSkills")).toBeInTheDocument();
  });

  it("warns when the chosen agent's model is not among the models", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) => res(ctx.json([])))
    );
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await waitFor(() => expect(nameInput()).toHaveValue(plan.name));
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "agentic.plan.stages" })
    );
    const [firstToggle] = await screen.findAllByRole("button", {
      name: "agentic.plan.stageDetails",
      expanded: false,
    });
    await user.click(firstToggle);
    expect(
      await screen.findByText("agentic.plan.agentModelNotVerified")
    ).toBeInTheDocument();
    // Migration Proposal Agent has no skills and no collections.
    expect(
      screen.getByText("agentic.plan.agentHasNoSkills")
    ).toBeInTheDocument();
  });

  it("says the verified model and the agent's skills on one line, without the agent's name", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) =>
        res(
          ctx.json([
            {
              id: "m1",
              name: "Claude",
              provider: { id: "p", name: "Anthropic" },
              verificationStatus: "verified",
            },
          ])
        )
      )
    );
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await waitFor(() => expect(nameInput()).toHaveValue(plan.name));
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "agentic.plan.stages" })
    );
    const toggles = await screen.findAllByRole("button", {
      name: "agentic.plan.stageDetails",
      expanded: false,
    });
    // Stage 2: Code Migrator, which has a skill and a collection.
    await user.click(toggles[1]);
    expect(
      await screen.findByText("agentic.plan.agentModelAndSkills")
    ).toBeInTheDocument();
    expect(screen.queryByText("agentic.plan.agentHasSkills")).toBeNull();
    await user.click(toggles[0]);
    // Migration Proposal Agent has no skills.
    expect(
      await screen.findByText("agentic.plan.agentModelNoSkills")
    ).toBeInTheDocument();
  });

  it("keeps unsaved edits when the plan refetches while the wizard is open", async () => {
    const { rerender } = render(
      <PlanWizard isOpen plan={plan} onClose={jest.fn()} />
    );
    await waitFor(() => expect(nameInput()).toHaveValue(plan.name));
    const user = userEvent.setup();
    await user.clear(nameInput());
    await user.type(nameInput(), "Renamed plan");
    rerender(<PlanWizard isOpen plan={{ ...plan }} onClose={jest.fn()} />);
    expect(nameInput()).toHaveValue("Renamed plan");

    rerender(<PlanWizard isOpen={false} plan={plan} onClose={jest.fn()} />);
    rerender(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await waitFor(() => expect(nameInput()).toHaveValue(plan.name));
  });

  it("keeps Next and Save disabled in edit mode while agents fail to load", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    const user = userEvent.setup();
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "agentic.plan.stages" })
    );
    // Each closed card says why.
    expect(
      await screen.findAllByText("agentic.plan.agentsLoadFailed", undefined, {
        timeout: 5000,
      })
    ).toHaveLength(2);
    expect(nextButton()).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "agentic.plan.reviewStep" })
    );
    expect(screen.getByRole("button", { name: "actions.save" })).toBeDisabled();
  }, 10000);

  it("keeps Next disabled until migration plans load, to check the name", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    const user = userEvent.setup();
    render(<PlanWizard isOpen plan={null} onClose={jest.fn()} />);
    await user.type(nameInput(), "New plan");
    expect(
      await screen.findByText("agentic.plan.plansLoadFailed", undefined, {
        timeout: 5000,
      })
    ).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });

  it("has no migration path step: details, stages, skills and review", () => {
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    const nav = screen.getByRole("navigation");
    expect(
      within(nav)
        .getAllByRole("button")
        .map((step) => step.textContent)
    ).toEqual([
      "agentic.plan.detailsStep",
      "agentic.plan.stages",
      "agentic.plan.skillsStep",
      "agentic.plan.reviewStep",
    ]);
  });

  it("creates a plan without target profiles and says where to assign it", async () => {
    const user = userEvent.setup();
    const notifications = createMockNotifications();
    const onClose = jest.fn();
    render(
      <NotificationsContext.Provider value={notifications}>
        <PlanWizard isOpen plan={null} onClose={onClose} />
      </NotificationsContext.Provider>
    );
    await user.type(nameInput(), "New plan");
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await user.click(nextButton());
    await user.type(
      screen.getByRole("textbox", { name: /stageName/ }),
      "Migrate"
    );
    await user.click(
      screen.getByRole("button", { name: /agentic\.entity\.agent/ })
    );
    await user.click(
      await screen.findByRole("option", { name: /Code Migrator/ })
    );
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await user.click(nextButton());
    await user.click(nextButton());
    await user.click(
      await screen.findByRole("button", { name: "actions.create" })
    );

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]).not.toHaveProperty("migrationPath");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [{ title, message }] = (notifications.pushNotification as jest.Mock)
      .mock.calls[0];
    expect(title).toBe("agentic.plan.created");
    render(<MemoryRouter>{message}</MemoryRouter>);
    expect(
      screen.getByText("agentic.plan.createdAssignHint", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.execution.goToArchetypes" })
    ).toHaveAttribute("href", "/archetypes");
  });
});
