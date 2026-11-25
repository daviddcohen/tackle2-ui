import { focusManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import {
  Agent,
  MigrationPlan,
  MigrationPlanRequest,
  ResolvePlanSkillsRequest,
  SkillsByStage,
  StageSkill,
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

const proposer = { id: "1", name: "Migration Proposal Agent" };
const coder = { id: "2", name: "Code Migrator" };
const javaEE = { id: 1, name: "Java EE Application" };

const entry = (
  id: string,
  name: string,
  from: StageSkill["from"]
): StageSkill => ({
  skill: { id, name },
  loadPolicy: "skill",
  from,
  excluded: false,
});

/**
 * The mock resolution by stage: each stage gets its agent's skills (Code
 * Migrator also its collection's); with target profile 11 (Quarkus 3.x, of
 * Java EE Application), every stage gets the archetype's EJB skill and the
 * profile's Quarkus skill. EJB also sits on Code Migrator, so it shows in
 * both groups. Without target profiles every stage gets nothing.
 */
const resolve = ({
  stages,
  targetProfiles = [],
}: ResolvePlanSkillsRequest): SkillsByStage => ({
  stages: stages.map((stage, index) => ({
    order: index + 1,
    name: stage.name ?? "",
    agent: stage.agent.id === "1" ? proposer : coder,
    skills:
      stage.agent.id === "1"
        ? [
            entry("13", "API compatibility checklist", [
              { kind: "agent", agent: proposer },
            ]),
          ]
        : [
            entry("9", "EJB to CDI conversion patterns", [
              { kind: "agent", agent: coder },
            ]),
            entry("1", "Jakarta EE namespace migration", [
              {
                kind: "collection",
                agent: coder,
                collection: { id: "1", name: "Java modernization foundation" },
              },
            ]),
          ],
  })),
  everyStage: [
    {
      skills: targetProfiles.some(({ id }) => id === 11)
        ? [
            entry("9", "EJB to CDI conversion patterns", [
              { kind: "archetype", archetype: javaEE },
            ]),
            entry("3", "Quarkus best practices", [
              {
                kind: "targetProfile",
                targetProfile: { id: 11, name: "Quarkus 3.x" },
                archetype: javaEE,
              },
            ]),
          ]
        : [],
    },
  ],
});

/** The response body: the groups. */
const reply = (request: ResolvePlanSkillsRequest) => resolve(request);

/** A draft whose groups have no skills. */
const emptyReply = { stages: [], everyStage: [{ skills: [] }] };

const plan = {
  id: "2",
  name: "Spring Boot to Quarkus",
  description: "",
  migrationPaths: [
    {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfile: { id: 11, name: "Quarkus 3.x" },
    },
  ],
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

// Walking the create flow through three steps with userEvent is slow on a
// busy machine.
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
      rest.get(AGENTIC_ENDPOINTS.models, (_req, res, ctx) => res(ctx.json([]))),
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body: ResolvePlanSkillsRequest = await req.json();
        resolveRequests.push(body);
        return res(ctx.json(reply(body)));
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

  // The plan page's Every stage note sits in the intro, after its first
  // sentence: for a plan target profiles use, and for one none uses yet.
  const intro = (everyStage: string) =>
    `Each stage gets its agent's skills and the skills in Every stage. ${everyStage} Clear a skill to exclude it from this plan; it is then left out of every stage. Skills attached to an application stay included: a plan cannot exclude them, only a run can.`;
  const usedNote =
    "Every stage holds the skills of the target profiles that use this plan, and of their archetypes. When it runs, each application gets only its archetypes' skills, the skills of the target profile it runs on, and its own skills.";
  const unusedNote =
    "No target profile uses this plan yet, so Every stage holds no archetype or target profile skills. Once a target profile uses it, Every stage holds that profile's skills and its archetype's. Until then, a run gives each application its archetypes' skills and its own skills, and no target profile skills.";
  const user = () => userEvent.setup();
  const nextButton = () => screen.getByRole("button", { name: "Next" });
  const stepButton = (name: string) => screen.getByRole("button", { name });
  /** Every Include checkbox of a skill: one per group that has it. */
  const includeBoxes = (skill: string) =>
    screen.getAllByRole("checkbox", {
      name: new RegExp(`^Include ${skill} in (stage \\d+|every stage)$`),
    });
  const skillsTable = () =>
    screen.getByRole("grid", { name: "Skills by stage" });
  const reviewFact = () =>
    screen.getByText("Excluded skills", {
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

  /** Edit mode at the Skills step: `plan` is used by Quarkus 3.x. */
  const editToSkills = async (
    actor: ReturnType<typeof userEvent.setup>,
    edited: MigrationPlan = plan
  ) => {
    render(<PlanWizard isOpen plan={edited} onClose={jest.fn()} />);
    await actor.click(stepButton("Skills"));
  };

  it("previews a new plan without archetype or target profile skills", async () => {
    const actor = user();
    await createToSkills(actor);

    expect(await screen.findByText("No skills excluded.")).toHaveAttribute(
      "aria-live",
      "polite"
    );
    // No target profile uses a new plan yet: the note says where those
    // skills come from.
    expect(screen.getByText(intro(unusedNote))).toBeInTheDocument();
    const table = skillsTable();
    // Group titles at h2 under the wizard's h1, named after the form.
    expect(
      within(table)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(["Stage 1: Migrate", "Every stage"]);
    expect(
      within(table).getByRole("row", { name: /Jakarta EE namespace migration/ })
    ).toHaveTextContent("Collection: Java modernization foundation");
    expect(within(table).getAllByText("No skills")).toHaveLength(1);
    expect(within(table).queryByText(/Quarkus best practices/)).toBeNull();
    // Plain names in the wizard: a link would leave the draft. No marker.
    expect(within(table).queryByRole("link")).toBeNull();
    expect(within(table).queryByText("Excluded")).toBeNull();
    // Its toggles are named apart from the plan page's and Review's tables.
    expect(
      within(table).getByRole("heading", { name: "Stage 1: Migrate" })
    ).toHaveAttribute("id", "simple-node300");
    // The request holds what decides the skills, not the names or
    // exclusions; a new plan has no target profiles.
    expect(resolveRequests.at(-1)).toEqual({
      stages: [{ agent: { id: "2" } }],
      targetProfiles: [],
    });
  });

  it("previews an edit with the target profiles that use the plan", async () => {
    const actor = user();
    await editToSkills(actor);
    await screen.findByText("No skills excluded.");

    expect(screen.getByText(intro(usedNote))).toBeInTheDocument();
    const table = skillsTable();
    // The table's Every stage title has only the plan's subtitle (a plan
    // holds no application skills); the note on them is in the intro above.
    expect(
      within(table).getByText("Archetype and target profile skills")
    ).toBeVisible();
    const rows = within(table).getAllByRole("row", {
      name: /EJB to CDI conversion patterns/,
    });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Agent: Code Migrator"),
      expect.stringContaining("Archetype: Java EE Application"),
    ]);
    // The plan's target profiles can belong to several archetypes: each
    // names its archetype.
    expect(
      within(table).getByRole("row", { name: /Quarkus best practices/ })
    ).toHaveTextContent("Target profile: Quarkus 3.x (Java EE Application)");
    expect(resolveRequests.at(-1)).toEqual({
      stages: [{ agent: { id: "2" } }],
      targetProfiles: [{ id: 11 }],
    });
  });

  it("excludes a skill from every stage that has it, and names them in the live line", async () => {
    const actor = user();
    await editToSkills(actor);
    await screen.findByText("No skills excluded.");
    const requestsBefore = resolveRequests.length;

    const ejb = includeBoxes("EJB to CDI conversion patterns");
    expect(ejb.map((box) => box.getAttribute("aria-label"))).toEqual([
      "Include EJB to CDI conversion patterns in stage 1",
      "Include EJB to CDI conversion patterns in every stage",
    ]);
    await actor.click(ejb[0]);
    // One exclusion per plan: both rows clear and read Excluded.
    for (const box of includeBoxes("EJB to CDI conversion patterns")) {
      expect(box).not.toBeChecked();
    }
    expect(within(skillsTable()).getAllByText("Excluded")).toHaveLength(2);
    expect(ejb[0]).toHaveFocus();
    expect(
      screen.getByText(
        "EJB to CDI conversion patterns excluded from every stage. 1 skill excluded from this plan."
      )
    ).toBeInTheDocument();

    await actor.click(includeBoxes("Jakarta EE namespace migration")[0]);
    expect(
      screen.getByText(
        "Jakarta EE namespace migration excluded from stage 1. 2 skills excluded from this plan."
      )
    ).toBeInTheDocument();
    await actor.click(includeBoxes("Jakarta EE namespace migration")[0]);
    expect(
      screen.getByText(
        "Jakarta EE namespace migration included again in stage 1. 1 skill excluded from this plan."
      )
    ).toBeInTheDocument();
    // Clearing a checkbox refetches nothing.
    expect(resolveRequests).toHaveLength(requestsBefore);
  });

  it("names the stages of a skill several stages get", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(
          ctx.json(
            reply({
              stages: [
                { agent: { id: "1" } },
                { agent: { id: "2" } },
                { agent: { id: "1" } },
              ],
            })
          )
        )
      )
    );
    const actor = user();
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await actor.click(stepButton("Skills"));
    await screen.findByText("No skills excluded.");
    await actor.click(includeBoxes("API compatibility checklist")[0]);
    expect(
      screen.getByText(
        "API compatibility checklist excluded from stages 1 and 3. 1 skill excluded from this plan."
      )
    ).toBeInTheDocument();
    await actor.click(stepButton("Review"));
    // Alone, the names need no "Newly excluded:" under "Excluded skills".
    expect(
      within(reviewFact()).getByText(
        "API compatibility checklist (stages 1 and 3)"
      )
    ).toBeInTheDocument();
    expect(within(reviewFact()).queryByText(/excluded:/i)).toBeNull();
  });

  it("creates the plan with the excluded skills, and names them on Review", async () => {
    const actor = user();
    await createToSkills(actor);
    await screen.findByText("No skills excluded.");
    await actor.click(nextButton());
    // No pooled count of skills.
    expect(within(reviewFact()).getByText("None")).toBeInTheDocument();
    expect(within(reviewFact()).queryByText(/\d+ skills?/)).toBeNull();

    await actor.click(stepButton("Skills"));
    await actor.click(includeBoxes("Jakarta EE namespace migration")[0]);
    await actor.click(includeBoxes("EJB to CDI conversion patterns")[0]);
    await actor.click(nextButton());
    expect(
      within(reviewFact())
        .getAllByText(/\(/)
        .map((line) => line.textContent)
    ).toEqual([
      "EJB to CDI conversion patterns (stage 1)",
      "Jakarta EE namespace migration (stage 1)",
    ]);

    await actor.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0].excludedSkills).toEqual([{ id: "1" }, { id: "9" }]);
  });

  it("creates the plan without an exclusion list when nothing is excluded", async () => {
    const actor = user();
    await createToSkills(actor);
    await screen.findByText("No skills excluded.");
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
      await screen.findByText("1 skill excluded from this plan.")
    ).toBeInTheDocument();
    for (const box of includeBoxes("EJB to CDI conversion patterns")) {
      expect(box).not.toBeChecked();
    }

    await actor.click(stepButton("Review"));
    // Nothing changed: the names alone, no "Still excluded:".
    expect(
      within(reviewFact()).getByText(
        "EJB to CDI conversion patterns (every stage)"
      )
    ).toBeInTheDocument();
    expect(within(reviewFact()).queryByText(/excluded:/i)).toBeNull();

    await actor.click(stepButton("Skills"));
    await actor.click(includeBoxes("EJB to CDI conversion patterns")[1]);
    expect(
      screen.getByText(
        "EJB to CDI conversion patterns included again in every stage. No skills excluded."
      )
    ).toBeInTheDocument();
    await actor.click(stepButton("Review"));
    expect(
      within(reviewFact()).getByText(
        "No longer excluded: EJB to CDI conversion patterns (every stage)"
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
    await screen.findByText("2 skills excluded from this plan.");
    await actor.click(includeBoxes("Quarkus best practices")[0]);
    await actor.click(includeBoxes("Jakarta EE namespace migration")[0]);

    await actor.click(stepButton("Review"));
    const lines = within(reviewFact())
      .getAllByText(/excluded:/i)
      .map((line) => line.textContent);
    expect(lines).toEqual([
      "Newly excluded: Jakarta EE namespace migration (stage 1)",
      "No longer excluded: Quarkus best practices (every stage), Retired skill",
      "Still excluded: EJB to CDI conversion patterns (every stage)",
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
    await screen.findByText("1 skill excluded from this plan.");

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolveHeld) => (release = resolveHeld));
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body: ResolvePlanSkillsRequest = await req.json();
        await held;
        return res(ctx.json(reply(body)));
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
    expect(screen.queryByRole("grid", { name: "Skills by stage" })).toBeNull();

    release();
    expect(
      await screen.findByText("1 skill excluded from this plan.")
    ).toBeInTheDocument();
    expect(
      within(skillsTable())
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(["Stage 1: Migrate", "Stage 2: Propose", "Every stage"]);
    for (const box of includeBoxes("EJB to CDI conversion patterns")) {
      expect(box).not.toBeChecked();
    }
    expect(includeBoxes("API compatibility checklist")[0]).toBeChecked();
  });

  it("lets the user continue and save while the skills load", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (_req, res, ctx) => {
        await holdResponse();
        return res(ctx.json(emptyReply));
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
    expect(screen.getByText(intro(usedNote))).toBeInTheDocument();
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
    expect(screen.queryByText(intro(usedNote))).toBeNull();

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
          : res(ctx.json(reply(await req.json())));
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

    // A retry that succeeds moves focus to the line that replaces the alert.
    isFailing = false;
    await actor.keyboard("{Enter}");
    const count = await screen.findByText("No skills excluded.");
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
    expect(screen.queryByText(intro(unusedNote))).toBeNull();
    expect(nextButton()).toBeEnabled();
    await actor.click(nextButton());
    expect(within(reviewFact()).getByText("Unavailable")).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0].excludedSkills).toBeUndefined();
  });

  it("reads a server that answers without the per-stage groups as one without the preview", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(ctx.json({}))
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
    expect(screen.queryByRole("grid")).toBeNull();
    await actor.click(stepButton("Review"));
    expect(within(reviewFact()).getByText("Unavailable")).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    // Nothing is known about what resolves: the stored exclusions stay.
    expect(updates[0].excludedSkills).toEqual([{ id: "77" }]);
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

  it("moves focus to the draft's empty state when a retry resolves no stages", async () => {
    let isFailing = true;
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        isFailing ? res(ctx.status(FAILED)) : res(ctx.json(emptyReply))
      )
    );
    const actor = user();
    await createToSkills(actor);
    const retry = await screen.findByRole("button", { name: "Try again" });

    isFailing = false;
    act(() => retry.focus());
    await actor.keyboard("{Enter}");
    const empty = await screen.findByText("Add a stage to see what it gets.");
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
          : res(ctx.json(reply(await req.json())));
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
      const count = await screen.findByText("No skills excluded.");
      expect(count.parentElement).not.toHaveFocus();
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it("says what every stage gets for an edit of a plan no target profile uses", async () => {
    const actor = user();
    await editToSkills(actor, { ...plan, migrationPaths: [] });
    await screen.findByRole("grid", { name: "Skills by stage" });
    expect(screen.getByText(intro(unusedNote))).toBeVisible();
    expect(resolveRequests.at(-1)?.targetProfiles).toEqual([]);
  });

  it("says No skills in each group when the draft gets none", async () => {
    server.use(
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, (_req, res, ctx) =>
        res(
          ctx.json({
            stages: [{ order: 1, name: "", agent: coder, skills: [] }],
            everyStage: [{ skills: [] }],
            skills: [],
          })
        )
      )
    );
    const actor = user();
    render(<PlanWizard isOpen plan={plan} onClose={jest.fn()} />);
    await actor.click(stepButton("Skills"));
    const table = await screen.findByRole("grid", { name: "Skills by stage" });
    // The groups themselves say what each stage would get.
    expect(within(table).getAllByText("No skills")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).toBeNull();
    await actor.click(stepButton("Review"));
    expect(within(reviewFact()).getByText("None")).toBeInTheDocument();
  });
});
