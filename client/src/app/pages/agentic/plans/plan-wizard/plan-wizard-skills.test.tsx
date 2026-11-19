import { focusManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import {
  Agent,
  MigrationPlan,
  MigrationPlanRequest,
  PlanSkill,
  ResolvePlanSkillsRequest,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { PlanWizard } from "./plan-wizard";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const agents = [
  {
    id: "1",
    name: "Migration Proposal Agent",
    model: { id: "m1", name: "Claude" },
    skills: [{ id: "13", name: "API compatibility checklist" }],
  },
  {
    id: "2",
    name: "Code Migrator",
    model: { id: "m1", name: "Claude" },
    skills: [{ id: "9", name: "EJB to CDI conversion patterns" }],
    skillCollections: [{ id: "1", name: "Java modernization foundation" }],
  },
] as unknown as Agent[];

const archetypes = [
  {
    id: 1,
    name: "Java EE Application",
    profiles: [{ id: 11, name: "Quarkus 3.x" }],
  },
];

/** The mock resolution: what each agent, the archetype and the profile give. */
const resolve = ({
  stages,
  migrationPath,
}: ResolvePlanSkillsRequest): PlanSkill[] => {
  const agentIds = stages.map((stage) => stage.agent.id);
  const skills: PlanSkill[] = [];
  if (agentIds.includes("1")) {
    skills.push({
      skill: { id: "13", name: "API compatibility checklist" },
      sources: [
        {
          scope: "agent",
          scopeName: "Migration Proposal Agent",
          resource: { id: "1", name: "Migration Proposal Agent" },
        },
      ],
      excluded: false,
    });
  }
  if (agentIds.includes("2")) {
    skills.push(
      {
        skill: { id: "9", name: "EJB to CDI conversion patterns" },
        sources: [
          {
            scope: "agent",
            scopeName: "Code Migrator",
            resource: { id: "2", name: "Code Migrator" },
          },
          ...(migrationPath != null
            ? [
                {
                  scope: "archetype" as const,
                  scopeName: "Java EE Application",
                  resource: { id: 1, name: "Java EE Application" },
                },
              ]
            : []),
        ],
        excluded: false,
      },
      {
        skill: { id: "1", name: "Jakarta EE namespace migration" },
        sources: [
          {
            scope: "agent",
            scopeName: "Code Migrator via Java modernization foundation",
            resource: { id: "2", name: "Code Migrator" },
            collection: { id: "1", name: "Java modernization foundation" },
          },
        ],
        excluded: false,
      }
    );
  }
  if (migrationPath?.targetProfiles.some((profile) => profile.id === 11)) {
    skills.push({
      skill: { id: "3", name: "Quarkus best practices" },
      sources: [
        {
          scope: "targetProfile",
          scopeName: "Quarkus 3.x",
          resource: { id: 11, name: "Quarkus 3.x" },
        },
      ],
      excluded: false,
    });
  }
  return skills;
};

const plan = {
  id: "2",
  name: "Spring Boot to Quarkus",
  description: "",
  migrationPath: {
    archetype: { id: 1, name: "Java EE Application" },
    targetProfiles: [{ id: 11, name: "Quarkus 3.x" }],
    isDefault: true,
  },
  stages: [
    {
      id: "5",
      name: "Migrate",
      agent: { id: "2", name: "Code Migrator" },
      instructions: "",
      requiresApproval: false,
      order: 1,
    },
  ],
} as unknown as MigrationPlan;

const withExclusions = (
  excludedSkills: { id: string; name: string }[]
): MigrationPlan => ({ ...plan, excludedSkills });

// Walking the create flow through four steps with userEvent is slow on a busy
// machine.
jest.setTimeout(20000);

// A failure that is final (4xx, not retried) but not a missing endpoint
// (404 or 501), so each retry is one request.
const FAILED = 400;

// Responses a test holds open are released after it, so no pending handler
// keeps the process alive once the suite ends.
const heldResponses: (() => void)[] = [];
const holdResponse = () =>
  new Promise<void>((resolve) => heldResponses.push(resolve));
afterEach(() => heldResponses.splice(0).forEach((release) => release()));

describe("PlanWizard Skills step", () => {
  let creates: MigrationPlanRequest[];
  let updates: MigrationPlanRequest[];
  let resolveRequests: ResolvePlanSkillsRequest[];

  beforeEach(() => {
    creates = [];
    updates = [];
    resolveRequests = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.json(agents))
      ),
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json([plan]))
      ),
      rest.get("/hub/archetypes", (_req, res, ctx) =>
        res(ctx.json(archetypes))
      ),
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) => res(ctx.json([]))),
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body: ResolvePlanSkillsRequest = await req.json();
        resolveRequests.push(body);
        return res(ctx.json({ skills: resolve(body) }));
      }),
      rest.post(AGENTIC_ENDPOINTS.plans, async (req, res, ctx) => {
        creates.push(await req.json());
        return res(ctx.status(201), ctx.json({ ...plan, id: "9" }));
      }),
      rest.put(`${AGENTIC_ENDPOINTS.plans}/:id`, async (req, res, ctx) => {
        updates.push(await req.json());
        return res(ctx.status(204));
      })
    );
  });

  const intro =
    "Clear a skill to exclude it from every stage of this plan. Application skills are added when the plan runs; a skill you clear here is not added from an application either.";
  const user = () => userEvent.setup();
  const nextButton = () => screen.getByRole("button", { name: "Next" });
  const stepButton = (name: string) => screen.getByRole("button", { name });
  const useCheckbox = (skill: string) =>
    screen.getByRole("checkbox", { name: `Use ${skill}` });
  const skillsTable = () => screen.getByRole("grid", { name: "Skills" });
  const reviewFact = () =>
    screen.getByText("Skills", {
      selector: ".pf-v6-c-description-list__text",
    }).parentElement?.nextElementSibling as HTMLElement;

  /** Create mode up to the Skills step, with one stage run by `agent`. */
  const createToSkills = async (
    actor: ReturnType<typeof userEvent.setup>,
    agent = "Code Migrator"
  ) => {
    render(<PlanWizard isOpen plan={null} onClose={jest.fn()} />);
    await actor.type(screen.getByRole("textbox", { name: /^Name/ }), "New");
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await actor.click(nextButton());
    await actor.click(screen.getByRole("button", { name: /^Archetype/ }));
    await actor.click(
      await screen.findByRole("option", { name: "Java EE Application" })
    );
    await actor.click(screen.getByRole("combobox"));
    await actor.click(await screen.findByText("Quarkus 3.x"));
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await actor.click(nextButton());
    await actor.type(
      screen.getByRole("textbox", { name: "Stage name" }),
      "Migrate"
    );
    await actor.click(screen.getByRole("button", { name: /^Agent/ }));
    await actor.click(
      await screen.findByRole("option", { name: new RegExp(agent) })
    );
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await actor.click(nextButton());
  };

  it("lists the draft's skills with their sources and counts what will be used", async () => {
    const actor = user();
    await createToSkills(actor);

    expect(
      await screen.findByText("3 of 3 skills will be used")
    ).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(intro)).toBeInTheDocument();
    const ejb = within(skillsTable()).getByRole("row", {
      name: /EJB to CDI conversion patterns/,
    });
    expect(ejb).toHaveTextContent("Agent: Code Migrator");
    expect(ejb).toHaveTextContent("Archetype: Java EE Application");
    expect(
      within(skillsTable()).getByRole("row", {
        name: /Jakarta EE namespace migration/,
      })
    ).toHaveTextContent(
      "Agent: Code Migrator via Java modernization foundation"
    );
    expect(
      within(skillsTable()).getByRole("row", { name: /Quarkus best practices/ })
    ).toHaveTextContent("Target profile: Quarkus 3.x");
    // Plain names in the wizard: a link would leave the draft. No marker.
    expect(within(skillsTable()).queryByRole("link")).toBeNull();
    expect(within(skillsTable()).queryByText("Excluded")).toBeNull();
    // The request holds what decides the skills, not the exclusions.
    expect(resolveRequests.at(-1)).toEqual({
      stages: [{ agent: { id: "2" } }],
      migrationPath: { archetype: { id: 1 }, targetProfiles: [{ id: 11 }] },
    });
    const requestsBefore = resolveRequests.length;

    expect(useCheckbox("EJB to CDI conversion patterns")).toBeChecked();
    await actor.click(useCheckbox("EJB to CDI conversion patterns"));
    expect(useCheckbox("EJB to CDI conversion patterns")).not.toBeChecked();
    expect(screen.getByText("2 of 3 skills will be used")).toBeInTheDocument();
    await actor.click(useCheckbox("Quarkus best practices"));
    expect(screen.getByText("1 of 3 skills will be used")).toBeInTheDocument();
    await actor.click(useCheckbox("Quarkus best practices"));
    expect(screen.getByText("2 of 3 skills will be used")).toBeInTheDocument();
    // Clearing a checkbox refetches nothing.
    expect(resolveRequests).toHaveLength(requestsBefore);
  });

  it("reads correctly with one skill, used or excluded", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(
          ctx.json({
            skills: resolve({ stages: [{ agent: { id: "1" } }] }),
          })
        )
      )
    );
    const actor = user();
    await createToSkills(actor, "Migration Proposal Agent");
    expect(
      await screen.findByText("1 of 1 skill will be used")
    ).toBeInTheDocument();
    await actor.click(useCheckbox("API compatibility checklist"));
    expect(screen.getByText("0 of 1 skill will be used")).toBeInTheDocument();

    await actor.click(nextButton());
    expect(within(reviewFact()).getByText("0 of 1 used")).toBeInTheDocument();
    expect(
      within(reviewFact()).getByText("Excluded: API compatibility checklist")
    ).toHaveClass("pf-v6-u-text-color-subtle");
  });

  it("creates the plan with the excluded skills, and says so on Review", async () => {
    const actor = user();
    await createToSkills(actor);
    await screen.findByText("3 of 3 skills will be used");
    await actor.click(nextButton());
    expect(within(reviewFact()).getByText("3 skills")).toBeInTheDocument();
    expect(within(reviewFact()).queryByText(/Excluded/)).toBeNull();

    await actor.click(stepButton("Skills"));
    await actor.click(useCheckbox("Quarkus best practices"));
    await actor.click(useCheckbox("EJB to CDI conversion patterns"));
    await actor.click(nextButton());
    expect(within(reviewFact()).getByText("1 of 3 used")).toBeInTheDocument();
    expect(
      within(reviewFact()).getByText(
        "Excluded: EJB to CDI conversion patterns, Quarkus best practices"
      )
    ).toBeInTheDocument();

    await actor.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0].excludedSkills).toEqual([{ id: "3" }, { id: "9" }]);
  });

  it("creates the plan without an exclusion list when nothing is excluded", async () => {
    const actor = user();
    await createToSkills(actor);
    await screen.findByText("3 of 3 skills will be used");
    await actor.click(nextButton());
    await actor.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]).not.toHaveProperty("excludedSkills");
  });

  it("seeds the exclusions from the plan, and sends an empty list once they are cleared", async () => {
    const actor = user();
    render(
      <PlanWizard
        isOpen
        plan={withExclusions([
          { id: "9", name: "EJB to CDI conversion patterns" },
        ])}
        onClose={jest.fn()}
      />
    );
    await actor.click(stepButton("Skills"));
    expect(
      await screen.findByText("2 of 3 skills will be used")
    ).toBeInTheDocument();
    expect(useCheckbox("EJB to CDI conversion patterns")).not.toBeChecked();

    await actor.click(stepButton("Review"));
    expect(within(reviewFact()).getByText("2 of 3 used")).toBeInTheDocument();
    expect(
      within(reviewFact()).getByText(
        "Still excluded: EJB to CDI conversion patterns"
      )
    ).toBeInTheDocument();

    await actor.click(stepButton("Skills"));
    await actor.click(useCheckbox("EJB to CDI conversion patterns"));
    await actor.click(stepButton("Review"));
    expect(within(reviewFact()).getByText("3 skills")).toBeInTheDocument();
    expect(
      within(reviewFact()).getByText(
        "No longer excluded: EJB to CDI conversion patterns"
      )
    ).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].excludedSkills).toEqual([]);
  });

  it("groups the edit's changes on Review and drops exclusions that no longer resolve", async () => {
    const actor = user();
    render(
      <PlanWizard
        isOpen
        plan={withExclusions([
          { id: "9", name: "EJB to CDI conversion patterns" },
          { id: "3", name: "Quarkus best practices" },
          { id: "77", name: "Retired skill" },
        ])}
        onClose={jest.fn()}
      />
    );
    await actor.click(stepButton("Skills"));
    await screen.findByText("1 of 3 skills will be used");
    await actor.click(useCheckbox("Quarkus best practices"));
    await actor.click(useCheckbox("Jakarta EE namespace migration"));

    await actor.click(stepButton("Review"));
    const fact = reviewFact();
    expect(within(fact).getByText("1 of 3 used")).toBeInTheDocument();
    const lines = within(fact)
      .getAllByText(/excluded:/i)
      .map((line) => line.textContent);
    expect(lines).toEqual([
      "Newly excluded: Jakarta EE namespace migration",
      "No longer excluded: Quarkus best practices, Retired skill",
      "Still excluded: EJB to CDI conversion patterns",
    ]);

    await actor.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].excludedSkills).toEqual([{ id: "9" }, { id: "1" }]);
  });

  it("keeps the exclusions when a stage changes, and shows no stale rows while it resolves", async () => {
    const actor = user();
    render(
      <PlanWizard
        isOpen
        plan={withExclusions([
          { id: "9", name: "EJB to CDI conversion patterns" },
        ])}
        onClose={jest.fn()}
      />
    );
    await actor.click(stepButton("Skills"));
    await screen.findByText("2 of 3 skills will be used");

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolveHeld) => (release = resolveHeld));
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body: ResolvePlanSkillsRequest = await req.json();
        await held;
        return res(ctx.json({ skills: resolve(body) }));
      })
    );
    await actor.click(stepButton("Stages"));
    await actor.click(screen.getByRole("button", { name: "Add stage" }));
    const names = screen.getAllByRole("textbox", { name: "Stage name" });
    await actor.type(names[names.length - 1], "Propose");
    const agentToggles = screen.getAllByRole("button", { name: /^Agent/ });
    await actor.click(agentToggles[agentToggles.length - 1]);
    await actor.click(
      await screen.findByRole("option", { name: /Migration Proposal Agent/ })
    );
    await actor.click(stepButton("Skills"));
    expect(
      screen.getByText("Loading skills. You can continue without waiting.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: "Skills" })).toBeNull();

    release();
    expect(
      await screen.findByText("3 of 4 skills will be used")
    ).toBeInTheDocument();
    expect(useCheckbox("EJB to CDI conversion patterns")).not.toBeChecked();
    expect(useCheckbox("API compatibility checklist")).toBeChecked();
  });

  it("lets the user continue and save while the skills load", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (_req, res, ctx) => {
        await holdResponse();
        return res(ctx.json({ skills: [] }));
      })
    );
    const actor = user();
    render(
      <PlanWizard
        isOpen
        plan={withExclusions([{ id: "77", name: "Retired skill" }])}
        onClose={jest.fn()}
      />
    );
    await actor.click(stepButton("Skills"));
    expect(
      screen.getByText("Loading skills. You can continue without waiting.")
    ).toBeInTheDocument();
    // The intro sets up the rows that are coming.
    expect(screen.getByText(intro)).toBeInTheDocument();
    await waitFor(() => expect(nextButton()).toBeEnabled());
    await actor.click(nextButton());
    expect(
      within(reviewFact()).getByText("Loading skills")
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await actor.click(save);
    await waitFor(() => expect(updates).toHaveLength(1));
    // Nothing is known about what resolves: the stored exclusions stay.
    expect(updates[0].excludedSkills).toEqual([{ id: "77" }]);
  });

  it("says when the skills could not be loaded, keeps Save working and retries", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.status(FAILED))
      )
    );
    const actor = user();
    render(
      <PlanWizard
        isOpen
        plan={withExclusions([{ id: "77", name: "Retired skill" }])}
        onClose={jest.fn()}
      />
    );
    await actor.click(stepButton("Skills"));
    expect(
      await screen.findByText("Skills could not be loaded.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can still save the plan. Its excluded skills stay as they are."
      )
    ).toBeInTheDocument();
    expect(nextButton()).toBeEnabled();
    // The intro points at rows that are not there.
    expect(screen.queryByText(intro)).toBeNull();

    await actor.click(nextButton());
    expect(within(reviewFact()).getByText("Unavailable")).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].excludedSkills).toEqual([{ id: "77" }]);
  });

  it("retries a failed resolution and keeps keyboard focus in the step", async () => {
    let isFailing = true;
    let release: () => void = () => undefined;
    let held = Promise.resolve();
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        await held;
        return isFailing
          ? res(ctx.status(FAILED))
          : res(ctx.json({ skills: resolve(await req.json()) }));
      })
    );
    const actor = user();
    await createToSkills(actor);
    expect(
      await screen.findByText(
        "You can still create the plan and exclude skills later by editing it."
      )
    ).toBeInTheDocument();

    // While the retry runs the alert stays, and so does focus on "Try again".
    held = new Promise<void>((resolveHeld) => (release = resolveHeld));
    const retry = screen.getByRole("button", { name: "Try again" });
    // PF Alert tracks whether it holds focus in state, so focus it in act.
    act(() => retry.focus());
    await actor.keyboard("{Enter}");
    await waitFor(() => expect(retry).toHaveAttribute("aria-disabled", "true"));
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveFocus();
    expect(screen.queryByText(/Loading skills/)).toBeNull();

    // A retry that fails again leaves focus there.
    release();
    await waitFor(() => expect(retry).not.toHaveAttribute("aria-disabled"));
    expect(screen.getByRole("button", { name: "Try again" })).toBe(retry);
    expect(retry).toHaveFocus();

    // A retry that succeeds moves focus to the count that replaces the alert.
    isFailing = false;
    await actor.keyboard("{Enter}");
    const count = await screen.findByText("3 of 3 skills will be used");
    await waitFor(() => expect(count.parentElement).toHaveFocus());
  });

  it("says once that a server without the resolve endpoint cannot preview the skills, with no retry", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.status(404))
      )
    );
    const actor = user();
    await createToSkills(actor);
    expect(
      await screen.findByText(
        "This server cannot preview the skills of a migration plan."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can still create the plan.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Skills could not be loaded.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText(intro)).toBeNull();
    expect(nextButton()).toBeEnabled();
    await actor.click(nextButton());
    expect(within(reviewFact()).getByText("Unavailable")).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0].excludedSkills).toBeUndefined();
  });

  it("keeps the stored exclusions in edit mode when the server has no resolve endpoint", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.status(501))
      )
    );
    const actor = user();
    render(
      <PlanWizard
        isOpen
        plan={withExclusions([{ id: "77", name: "Retired skill" }])}
        onClose={jest.fn()}
      />
    );
    await actor.click(stepButton("Skills"));
    expect(
      await screen.findByText(
        "This server cannot preview the skills of a migration plan."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can still save the plan.")
    ).toBeInTheDocument();
    // A server without the endpoint has no exclusions to promise.
    expect(screen.queryByText(/excluded skills/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await actor.click(stepButton("Review"));
    await actor.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].excludedSkills).toEqual([{ id: "77" }]);
  });

  it("shows a fast failing retry's progress for at least 500 ms, then says it failed again", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.status(FAILED))
      )
    );
    const actor = user();
    await createToSkills(actor);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const alert = retry.closest(".pf-v6-c-alert") as HTMLElement;
    // The alert is a live region, so the changed body is announced.
    expect(alert).toHaveAttribute("aria-live", "polite");

    const clickedAt = Date.now();
    await actor.click(retry);
    expect(retry).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => expect(retry).not.toHaveAttribute("aria-disabled"));
    expect(Date.now() - clickedAt).toBeGreaterThanOrEqual(490);
    // The title says it failed again; the body drops its "still".
    expect(
      screen.getByText("Skills still could not be loaded.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Skills could not be loaded.")).toBeNull();
    expect(
      screen.getByText(
        "You can create the plan now and exclude skills later by editing it."
      )
    ).toBeInTheDocument();
  });

  it("says a failed retry failed again in edit mode", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.status(FAILED))
      )
    );
    const actor = user();
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await actor.click(stepButton("Skills"));
    await actor.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Skills still could not be loaded.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can save the plan now. Its excluded skills stay as they are."
      )
    ).toBeInTheDocument();
  });

  it("clears the retry's progress timer when the wizard closes", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.status(FAILED))
      )
    );
    const actor = user();
    const view = render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await actor.click(stepButton("Skills"));
    const retry = await screen.findByRole("button", { name: "Try again" });
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    try {
      await actor.click(retry);
      const call = setTimeoutSpy.mock.calls.findIndex(
        ([, delay]) => delay === 500
      );
      expect(call).toBeGreaterThanOrEqual(0);
      const timer = setTimeoutSpy.mock.results[call].value;
      view.unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  it("moves focus to the empty state when a retry resolves no skills", async () => {
    let isFailing = true;
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        isFailing ? res(ctx.status(FAILED)) : res(ctx.json({ skills: [] }))
      )
    );
    const actor = user();
    await createToSkills(actor);
    const retry = await screen.findByRole("button", { name: "Try again" });

    isFailing = false;
    act(() => retry.focus());
    await actor.keyboard("{Enter}");
    const empty = await screen.findByText(
      "No skills are associated with these agents, the archetype or the target profiles, and the agents' skill collections are empty."
    );
    await waitFor(() => expect(empty.closest("[tabindex='-1']")).toHaveFocus());
  });

  it("does not move focus on a background refetch after a failed retry", async () => {
    let isFailing = true;
    let calls = 0;
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        calls += 1;
        return isFailing
          ? res(ctx.status(FAILED))
          : res(ctx.json({ skills: resolve(await req.json()) }));
      })
    );
    const actor = user();
    await createToSkills(actor);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const callsBeforeRetry = calls;
    act(() => retry.focus());
    await actor.keyboard("{Enter}");
    await waitFor(() => expect(calls).toBe(callsBeforeRetry + 1));
    await waitFor(() => expect(retry).not.toHaveAttribute("aria-disabled"));
    expect(retry).toHaveFocus();

    // The window regains focus and the query refetches on its own.
    isFailing = false;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    try {
      const count = await screen.findByText("3 of 3 skills will be used");
      expect(count.parentElement).not.toHaveFocus();
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it("says when no skills are associated with the draft", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.json({ skills: [] }))
      )
    );
    const actor = user();
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await actor.click(stepButton("Skills"));
    expect(
      await screen.findByText(
        "No skills are associated with these agents, the archetype or the target profiles, and the agents' skill collections are empty."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // Nothing to clear: no intro.
    expect(screen.queryByText(intro)).toBeNull();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    await actor.click(stepButton("Review"));
    expect(within(reviewFact()).getByText("None")).toBeInTheDocument();
  });
});
