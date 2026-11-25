jest.unmock("react-router-dom");

import { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { rest } from "msw";
import { Router } from "react-router-dom";
import a11yStyles from "@patternfly/react-styles/css/utilities/Accessibility/accessibility";

import {
  ApplicationMigrationMap,
  ApplicationMigrationView,
  MigrationPlan,
  ResolvePlanSkillsRequest,
  SkillsByStage,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { MigrationPreflightModal } from "./migration-preflight-modal";
import { RunSkillsPreview } from "./run-skills-preview";

// The Skills by stage preview of the Run migration plan dialog, in English
// (migration-preflight-modal.test.tsx covers the rest of the dialog).
jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const agent = { id: "a1", name: "Code Migrator" };
const plan5: MigrationPlan = {
  id: "5",
  name: "Legacy Java to RHEL",
  description: "",
  stages: [
    {
      id: "s1",
      name: "Migrate",
      agent,
      instructions: "",
      requiresApproval: false,
      order: 1,
    },
  ],
  excludedSkills: [{ id: "8", name: "Containerization standards" }],
};
const plan6: MigrationPlan = {
  ...plan5,
  id: "6",
  name: ".NET Framework to .NET 8",
  excludedSkills: undefined,
};

/** What the server answers: one stage, one Every stage group per application. */
const resolved = (applications: { id: number; name: string }[]) =>
  ({
    stages: [
      {
        order: 1,
        name: "Migrate",
        agent,
        skills: [
          {
            skill: { id: "1", name: "Quarkus patterns" },
            loadPolicy: "skill",
            from: [{ kind: "agent", agent }],
            excluded: false,
          },
        ],
      },
    ],
    everyStage: applications.map((application) => ({
      application,
      skills: [
        {
          skill: { id: "5", name: "Corporate coding standards" },
          loadPolicy: "rule",
          from: [{ kind: "application", application }],
          excluded: false,
        },
      ],
    })),
  }) satisfies SkillsByStage;

const branch = { id: 13, name: "Branch Operations" };
const claims = { id: 14, name: "Claims Processing" };
const orders = { id: 15, name: "Order Service" };

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  preflight: "ready",
  plan: { id: "5", name: "Legacy Java to RHEL" },
  skills: resolved([branch]),
  ...overrides,
});

const resolveRequests: ResolvePlanSkillsRequest[] = [];
let resolveStatus = 200;

const renderModal = (
  migrations: ApplicationMigrationMap,
  props: Partial<ComponentProps<typeof MigrationPreflightModal>> = {}
) => {
  const onStartReady = jest.fn();
  render(
    <Router history={createMemoryHistory()}>
      <MigrationPreflightModal
        applications={[branch]}
        migrations={migrations}
        onClose={jest.fn()}
        onStartReady={onStartReady}
        {...props}
      />
    </Router>
  );
  return { onStartReady };
};

const skillsToggle = () =>
  screen.getByRole("button", { name: "Review skills by stage" });

const openPreview = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(skillsToggle()).toBeInTheDocument());
  await user.click(skillsToggle());
};

const INTRO =
  "Clear a skill to leave it out of every stage and every application in the plan run.";
const ATTRIBUTION =
  "An application's archetype, target profile and own skills go to that application only.";
const RERUN =
  "The new run uses the migration plan as it is now, so its skills can differ from the failed run's.";
const RERUN_EXCLUDED = "Skills the failed run excluded are excluded again.";

/** Whether a table group's toggle is open, by the group's title. */
const expanded = (table: HTMLElement, title: string) =>
  within(table)
    .getByRole("button", { name: `${title} Details` })
    .getAttribute("aria-expanded");

describe("MigrationPreflightModal, skills by stage", () => {
  beforeEach(() => {
    resolveRequests.length = 0;
    resolveStatus = 200;
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json([plan5, plan6]))
      ),
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body = (await req.json()) as ResolvePlanSkillsRequest;
        resolveRequests.push(body);
        if (resolveStatus !== 200) {
          return res(ctx.status(resolveStatus), ctx.json({}));
        }
        const names = new Map(
          [branch, claims, orders].map((app) => [app.id, app.name])
        );
        return res(
          ctx.json(
            resolved(
              (body.applications ?? []).map(({ id }) => ({
                id,
                name: names.get(id) ?? String(id),
              }))
            )
          )
        );
      })
    );
  });

  it("says what it runs in the header, and no readiness caption for one ready application", async () => {
    renderModal({ 13: view() });
    expect(
      await screen.findByText("Runs a migration plan on Branch Operations.")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled()
    );
    // The row says it is ready.
    expect(screen.queryByText(/application is ready/)).toBeNull();
  });

  it("starts collapsed, after the plan choice, and asks for nothing until opened", async () => {
    renderModal({ 13: view() });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled()
    );
    expect(skillsToggle()).toHaveAttribute("aria-expanded", "false");
    const lastRadio = screen.getByRole("radio", {
      name: /^Use one migration plan for all applications/,
    });
    expect(
      lastRadio.compareDocumentPosition(skillsToggle()) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByRole("grid", { name: "Skills by stage" })).toBeNull();
    expect(resolveRequests).toHaveLength(0);
  });

  it("previews one application on its own plan from its view, groups open, names as text", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() });
    await openPreview(user);
    // One intro sentence.
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.queryByText(ATTRIBUTION, { exact: false })).toBeNull();
    const table = screen.getByRole("grid", { name: "Skills by stage" });
    // Open, as on the plan run page: the review is already the "show me".
    expect(within(table).getByText("Stage 1: Migrate")).toBeInTheDocument();
    expect(within(table).getByText("Quarkus patterns")).toBeVisible();
    expect(
      within(table).queryAllByRole("button", { expanded: false })
    ).toHaveLength(0);
    // One run: the group titles are h2 under the dialog's h1.
    expect(
      within(table).getByRole("heading", { level: 2, name: "Stage 1: Migrate" })
    ).toBeInTheDocument();
    // A link would close the dialog and lose its choices.
    expect(within(table).queryByRole("link")).toBeNull();
    // Its view already says what each stage gets.
    expect(resolveRequests).toHaveLength(0);
  });

  describe("scroll on open", () => {
    const scrollIntoView = jest.fn();
    const { matchMedia } = window;
    const { scrollIntoView: original } = Element.prototype;
    beforeEach(() => {
      scrollIntoView.mockClear();
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      window.matchMedia = matchMedia;
      Element.prototype.scrollIntoView = original;
    });

    it("brings the section to the top when the user opens it, focus on the toggle", async () => {
      const user = userEvent.setup();
      renderModal({ 13: view() });
      await waitFor(() => expect(skillsToggle()).toBeInTheDocument());
      expect(scrollIntoView).not.toHaveBeenCalled();
      await user.click(skillsToggle());
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "start",
          behavior: "smooth",
        })
      );
      // The section, toggle first, not the toggle alone.
      const section = scrollIntoView.mock.contexts[0] as HTMLElement;
      expect(section).toContainElement(skillsToggle());
      expect(section).toContainElement(screen.getByText(INTRO));
      expect(skillsToggle()).toHaveFocus();
      // Closing does not scroll.
      scrollIntoView.mockClear();
      await user.click(skillsToggle());
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("scrolls again once a table it waited for has loaded", async () => {
      const user = userEvent.setup();
      renderModal(
        { 13: view(), 14: view() },
        {
          applications: [branch, claims],
          initialValues: { planSelection: "single", planId: "6" },
        }
      );
      await openPreview(user);
      await screen.findByRole("heading", {
        name: "Every stage: Branch Operations",
      });
      // At once, as far as the loading table lets it, then once loaded.
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      // Not on later renders.
      await user.click(
        screen.getByRole("button", {
          name: "Every stage: Branch Operations Details",
        })
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    });

    it("does not scroll again once the user has moved on", async () => {
      renderModal(
        { 13: view(), 14: view() },
        {
          applications: [branch, claims],
          initialValues: { planSelection: "single", planId: "6" },
        }
      );
      await waitFor(() => expect(skillsToggle()).toBeInTheDocument());
      // Synchronous: the table has not answered yet.
      fireEvent.click(skillsToggle());
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // Scrolls back up to the run options while the table loads.
      fireEvent.wheel(document.body);
      await screen.findByRole("heading", {
        name: "Every stage: Branch Operations",
      });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("jumps without the animation when motion is reduced", async () => {
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }));
      const user = userEvent.setup();
      renderModal({ 13: view() });
      await openPreview(user);
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "start",
          behavior: "auto",
        })
      );
    });

    it("does not scroll when it is open from the start", () => {
      render(
        <RunSkillsPreview
          groups={[]}
          skills={[]}
          excludedSkills={{}}
          excludedCount={0}
          onIncludeChange={jest.fn()}
          isPlanMissing
          isTargetProfileMissing={false}
          isRerun={false}
          hasRerunExclusions={false}
          isExpanded
          onExpandedChange={jest.fn()}
        />
      );
      expect(
        screen.getByText("Select a migration plan to see skills by stage.")
      ).toBeInTheDocument();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("names the toggles of each table from its own row range", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() });
    await openPreview(user);
    expect(
      screen.getByRole("heading", { name: "Stage 1: Migrate" })
    ).toHaveAttribute("id", "simple-node400");
  });

  it("asks for a plan before it previews one plan for all", async () => {
    const user = userEvent.setup();
    renderModal(
      { 13: view(), 14: view({ plan: { id: "6", name: plan6.name } }) },
      { applications: [branch, claims] }
    );
    await user.click(
      screen.getByRole("radio", {
        name: /^Use one migration plan for all applications/,
      })
    );
    await openPreview(user);
    expect(
      screen.getByText("Select a migration plan to see skills by stage.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: /^Skills by stage/ })).toBeNull();
    expect(resolveRequests).toHaveLength(0);
  });

  it("previews one run of several applications, each application's Every stage collapsed", async () => {
    const user = userEvent.setup();
    renderModal(
      { 13: view(), 14: view() },
      {
        applications: [branch, claims],
        initialValues: { planSelection: "single", planId: "6" },
      }
    );
    await openPreview(user);
    const table = await screen.findByRole("grid", { name: "Skills by stage" });
    // The "Every stage: {application}" titles say it: no attribution line.
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.queryByText(ATTRIBUTION, { exact: false })).toBeNull();
    expect(
      await within(table).findByRole("heading", {
        name: "Every stage: Branch Operations",
      })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("heading", {
        name: "Every stage: Claims Processing",
      })
    ).toBeInTheDocument();
    // The stage groups are open; each application's Every stage group
    // starts collapsed, with its count.
    expect(expanded(table, "Stage 1: Migrate")).toBe("true");
    expect(expanded(table, "Every stage: Branch Operations")).toBe("false");
    expect(expanded(table, "Every stage: Claims Processing")).toBe("false");
    expect(within(table).getAllByText("1 skill")).toHaveLength(2);
    expect(resolveRequests).toEqual([
      {
        stages: [{ agent: { id: "a1" }, name: "Migrate" }],
        excludedSkills: [],
        applications: [{ id: 13 }, { id: 14 }],
      },
    ]);
  });

  it("previews one table per plan run, ready applications only", async () => {
    const user = userEvent.setup();
    renderModal(
      {
        13: view(),
        14: view({ preflight: "blocked", preflightReason: "No credentials." }),
        15: view({
          plan: { id: "6", name: plan6.name },
          skills: resolved([orders]),
        }),
      },
      { applications: [branch, claims, orders] }
    );
    await openPreview(user);
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.queryByText(ATTRIBUTION, { exact: false })).toBeNull();
    // Runs by plan name, each with its own heading and table.
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual([
      ".NET Framework to .NET 8: 1 application",
      "Legacy Java to RHEL: 1 application",
    ]);
    const dotnet = screen.getByRole("grid", {
      name: "Skills by stage with .NET Framework to .NET 8",
    });
    expect(
      await within(dotnet).findByRole("heading", {
        level: 3,
        name: "Every stage: Order Service",
      })
    ).toBeInTheDocument();
    expect(
      within(dotnet).getByRole("heading", { name: "Stage 1: Migrate" })
    ).toHaveAttribute("id", "simple-node400");
    const legacy = screen.getByRole("grid", {
      name: "Skills by stage with Legacy Java to RHEL",
    });
    expect(
      within(legacy).getByRole("heading", { name: "Stage 1: Migrate" })
    ).toHaveAttribute("id", "simple-node500");
    // The blocked application is in no table.
    expect(screen.queryByText("Every stage: Claims Processing")).toBeNull();
    // One application in a plan run: its Every stage group is open.
    expect(expanded(dotnet, "Every stage: Order Service")).toBe("true");
    // No visible "No skills excluded", but each plan run has its live line,
    // empty until a change.
    expect(screen.queryByText("No skills excluded for this run.")).toBeNull();
    const lines = document.querySelectorAll('[aria-live="polite"]');
    expect(lines).toHaveLength(2);
    lines.forEach((line) => expect(line).toHaveTextContent(/^$/));
  });

  it("says a rerun resolves the skills again", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() }, { rerunPlanId: "5" });
    await openPreview(user);
    expect(screen.getByText(`${INTRO} ${RERUN}`)).toBeInTheDocument();
  });

  it("says Unavailable when the view does not report skills and the server has no resolver", async () => {
    resolveStatus = 404;
    const user = userEvent.setup();
    renderModal({ 13: view({ skills: undefined }) });
    await openPreview(user);
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This server does not report skills by stage before a run yet. You can still run the migration plan."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled();
  });

  it("shows a load error that never blocks Run, with Try again", async () => {
    resolveStatus = 500;
    const user = userEvent.setup();
    renderModal({ 13: view({ skills: undefined }) });
    await openPreview(user);
    expect(
      await screen.findByText("Skills could not be loaded.", undefined, {
        timeout: 5000,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can still run the migration plan.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled();
  });

  it("says a plan missing from the loaded plans list could not be loaded", async () => {
    const user = userEvent.setup();
    renderModal({
      13: view({ plan: { id: "9", name: "Deleted plan" }, skills: undefined }),
    });
    await openPreview(user);
    expect(
      await screen.findByText("Skills could not be loaded.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can still run the migration plan.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).toBeNull();
    expect(resolveRequests).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled();
  });

  it("offers a retry of the plans list when it failed to load", async () => {
    const user = userEvent.setup();
    let plansStatus = 400;
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        plansStatus === 200
          ? res(ctx.json([plan5, plan6]))
          : res(ctx.status(plansStatus), ctx.json({}))
      )
    );
    renderModal({ 13: view({ skills: undefined }) });
    await openPreview(user);
    expect(
      await screen.findByText("Skills could not be loaded.")
    ).toBeInTheDocument();
    expect(resolveRequests).toHaveLength(0);
    plansStatus = 200;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(resolveRequests).toHaveLength(1));
    expect(screen.queryByText("Skills could not be loaded.")).toBeNull();
  });

  it("shows no preview when no application is ready", async () => {
    renderModal({
      13: view({ preflight: "blocked", preflightReason: "No credentials." }),
    });
    await act(async () => {});
    expect(
      screen.queryByRole("button", { name: "Review skills by stage" })
    ).toBeNull();
  });
});

describe("MigrationPreflightModal, run exclusions and target profiles", () => {
  const containerization = { id: "8", name: "Containerization standards" };
  const quarkusPatterns = { id: "1", name: "Quarkus patterns" };
  const coding = { id: "5", name: "Corporate coding standards" };
  const archetype = { id: 3, name: "Legacy Java Application" };
  /**
   * Plan 5 on Branch Operations: the plan excludes Containerization
   * standards, which also reaches every stage through the application
   * itself (so it is not excluded there).
   */
  const withPlanExclusion: SkillsByStage = {
    stages: [
      {
        order: 1,
        name: "Migrate",
        agent,
        skills: [
          {
            skill: quarkusPatterns,
            loadPolicy: "skill",
            from: [{ kind: "agent", agent }],
            excluded: false,
          },
          {
            skill: containerization,
            loadPolicy: "rule",
            from: [{ kind: "agent", agent }],
            excluded: true,
          },
        ],
      },
    ],
    everyStage: [
      {
        application: branch,
        skills: [
          {
            skill: coding,
            loadPolicy: "rule",
            from: [{ kind: "application", application: branch }],
            excluded: false,
          },
          {
            skill: containerization,
            loadPolicy: "rule",
            from: [
              { kind: "archetype", archetype },
              { kind: "application", application: branch },
            ],
            excluded: false,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    resolveRequests.length = 0;
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json([plan5, plan6]))
      ),
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body = (await req.json()) as ResolvePlanSkillsRequest;
        resolveRequests.push(body);
        return res(ctx.json(resolved([branch])));
      })
    );
  });

  const runButton = () => screen.getByRole("button", { name: /^Run on / });
  /** A skill's Include checkbox in one group ("Stage 1", "Every stage"). */
  const include = (skill: string, group: RegExp) =>
    within(
      screen
        .getByRole("heading", { name: group })
        .closest("tbody") as HTMLElement
    ).getByRole("checkbox", { name: `Include ${skill} in this plan run` });
  const expandGroups = async (user: ReturnType<typeof userEvent.setup>) => {
    const table = screen.getByRole("grid", { name: "Skills by stage" });
    // Groups a few applications' run starts with are open already.
    for (const toggle of within(table).queryAllByRole("button", {
      expanded: false,
    })) {
      await user.click(toggle);
    }
  };
  const submitted = async (
    user: ReturnType<typeof userEvent.setup>,
    onStartReady: jest.Mock
  ) => {
    await waitFor(() => expect(runButton()).toBeEnabled());
    await user.click(runButton());
    await waitFor(() => expect(onStartReady).toHaveBeenCalled());
    return onStartReady.mock.calls[0][0];
  };

  it("excludes a skill from every stage and application of its run, and Run sends it", async () => {
    const user = userEvent.setup();
    const { onStartReady } = renderModal({
      13: view({ skills: withPlanExclusion }),
    });
    await openPreview(user);
    await expandGroups(user);
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    // For screen readers only, and empty until a change.
    expect(screen.queryByText("No skills excluded for this run.")).toBeNull();
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveClass(a11yStyles.screenReader);
    expect(live).toBeEmptyDOMElement();

    await user.click(include("Quarkus patterns", /^Stage 1/));
    expect(include("Quarkus patterns", /^Stage 1/)).not.toBeChecked();
    // Told apart from the rows the plan excludes.
    expect(
      within(
        screen
          .getByRole("heading", { name: /^Stage 1/ })
          .closest("tbody") as HTMLElement
      ).getByText("Excluded for this run")
    ).toBeInTheDocument();
    expect(live).toHaveTextContent(
      "Quarkus patterns excluded from stage 1. 1 skill excluded for this run."
    );
    expect(
      screen.getByRole("button", {
        name: "Review skills by stage (1 skill excluded)",
      })
    ).toBeInTheDocument();

    // An application's own skill can be excluded at run time.
    const own = include("Corporate coding standards", /^Every stage/);
    expect(own).toBeEnabled();
    await user.click(own);
    expect(live).toHaveTextContent(
      "Corporate coding standards excluded from every stage. 2 skills excluded for this run."
    );

    const request = await submitted(user, onStartReady);
    expect(request.excludedSkills).toEqual([
      { plan: { id: "5" }, skills: [{ id: "1" }, { id: "5" }] },
    ]);
  });

  it("keeps the plan's exclusions locked and says why", async () => {
    const user = userEvent.setup();
    // The label, then its tooltip: why, and what to do.
    const LOCKED_DESCRIPTION =
      "Excluded by plan The migration plan excludes this skill. To include it, edit the migration plan.";
    const { onStartReady } = renderModal({
      13: view({ skills: withPlanExclusion }),
    });
    await openPreview(user);
    await expandGroups(user);
    const locked = include("Containerization standards", /^Stage 1/);
    expect(locked).toBeDisabled();
    expect(locked).not.toBeChecked();
    expect(locked).toHaveAccessibleDescription(LOCKED_DESCRIPTION);

    // Its application row is not the plan's to exclude: the run can, and
    // that marks every row of the skill.
    const own = include("Containerization standards", /^Every stage/);
    expect(own).toBeChecked();
    await user.click(own);
    expect(own).not.toBeChecked();
    expect(locked).toHaveAccessibleDescription(LOCKED_DESCRIPTION);
    await user.click(own);
    expect(own).toBeChecked();
    expect(
      screen.getByText(/No skills excluded for this run\.$/)
    ).toHaveTextContent(
      "Containerization standards included again in every stage. No skills excluded for this run."
    );

    // Nothing of its own excluded: Run sends no exclusions.
    const request = await submitted(user, onStartReady);
    expect(request).not.toHaveProperty("excludedSkills");
  });

  it("starts a rerun with its exclusions, and sends only those that still resolve", async () => {
    const user = userEvent.setup();
    const { onStartReady } = renderModal(
      { 13: view({ skills: withPlanExclusion }) },
      {
        rerunPlanId: "5",
        initialExcludedSkills: { "5": ["1", "gone"] },
      }
    );
    // Counted before the preview opens.
    expect(
      await screen.findByRole("button", {
        name: "Review skills by stage (1 skill excluded)",
      })
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(
      screen.getByRole("button", { name: /^Review skills by stage/ })
    );
    expect(
      screen.getByText(`${INTRO} ${RERUN} ${RERUN_EXCLUDED}`)
    ).toBeInTheDocument();
    const request = await submitted(user, onStartReady);
    expect(request.excludedSkills).toEqual([
      { plan: { id: "5" }, skills: [{ id: "1" }] },
    ]);
  });

  it("says nothing of the failed run's exclusions when none still applies", async () => {
    const user = userEvent.setup();
    const { onStartReady } = renderModal(
      { 13: view({ skills: withPlanExclusion }) },
      { rerunPlanId: "5", initialExcludedSkills: { "5": ["gone"] } }
    );
    const toggle = await screen.findByRole("button", {
      name: "Review skills by stage",
    });
    await user.click(toggle);
    expect(screen.getByText(`${INTRO} ${RERUN}`)).toBeInTheDocument();
    expect(screen.queryByText(RERUN_EXCLUDED, { exact: false })).toBeNull();
    const request = await submitted(user, onStartReady);
    expect(request).not.toHaveProperty("excludedSkills");
  });

  describe("several target profiles", () => {
    const javaEE = { id: 1, name: "Java EE Application" };
    const quarkus = { id: 11, name: "Quarkus 3.x" };
    const openJdk = { id: 19, name: "OpenJDK 21 on OpenShift" };
    const migrationPaths = [
      {
        archetype: javaEE,
        targetProfile: quarkus,
        plan: { id: "5", name: plan5.name },
      },
      {
        archetype: javaEE,
        targetProfile: openJdk,
        plan: { id: "6", name: plan6.name },
      },
    ];
    const profileSelect = () =>
      screen.getByRole("button", {
        name: /^Target profile for Branch Operations/,
      });
    /** Two target profiles with a plan: no default path, no default plan. */
    const noDefault = (overrides: Partial<ApplicationMigrationView> = {}) =>
      view({ plan: undefined, migrationPaths, ...overrides });

    it("uses the only target profile with a plan, with no choice, and sends it", async () => {
      const user = userEvent.setup();
      const { onStartReady } = renderModal({
        13: view({
          archetype: javaEE,
          targetProfile: quarkus,
          migrationPaths: [
            migrationPaths[0],
            // A profile without a plan cannot run: it is not offered.
            { archetype: javaEE, targetProfile: openJdk },
          ],
        }),
      });
      const row = (await screen.findByText("Branch Operations")).closest(
        "tr"
      ) as HTMLElement;
      expect(row).toHaveTextContent("Quarkus 3.x");
      expect(
        screen.queryByRole("button", {
          name: /^Target profile for Branch Operations/,
        })
      ).toBeNull();
      const request = await submitted(user, onStartReady);
      expect(request).toMatchObject({
        applicationIds: [13],
        planSelection: "recommended",
        targetProfiles: [
          { application: { id: 13 }, targetProfile: { id: 11 } },
        ],
      });
    });

    it("reads Not selected for a row that cannot start and has several runnable target profiles", async () => {
      renderModal({
        13: noDefault({
          preflight: "blocked",
          preflightReason: "Run #7 is in progress.",
        }),
      });
      const row = (await screen.findByText("Branch Operations")).closest(
        "tr"
      ) as HTMLElement;
      // Target profile and Migration plan.
      expect(within(row).getAllByText("Not selected")).toHaveLength(2);
      expect(row).not.toHaveTextContent("Not assigned");
      expect(row).not.toHaveTextContent("None");
      expect(
        screen.queryByRole("button", {
          name: /^Target profile for Branch Operations/,
        })
      ).toBeNull();
    });

    it("requires a pick without a default, then runs that profile's plan", async () => {
      const user = userEvent.setup();
      const { onStartReady } = renderModal({ 13: noDefault() });
      expect(profileSelect()).toHaveAccessibleName(
        "Target profile for Branch Operations Select a target profile"
      );
      expect(profileSelect()).toHaveAccessibleDescription(
        "Select a target profile to run this application."
      );
      // Said once, in the caption, not under each row.
      expect(
        screen.getByText(/1 needs a target profile before it can run\./)
      ).toBeVisible();
      expect(runButton()).toBeDisabled();
      expect(runButton()).toHaveTextContent("Run on 1 application");
      await openPreview(user);
      expect(
        screen.getByText(
          "Select a target profile for each application to see skills by stage."
        )
      ).toBeInTheDocument();

      await user.click(profileSelect());
      const option = screen.getByRole("option", {
        name: /OpenJDK 21 on OpenShift/,
      });
      expect(option).toHaveTextContent(`Runs ${plan6.name}`);
      await user.click(option);
      // The row now runs the profile's plan, and the preview resolves it.
      const row = profileSelect().closest("tr") as HTMLElement;
      expect(within(row).getByText(plan6.name)).toBeVisible();
      await waitFor(() =>
        expect(resolveRequests).toContainEqual(
          expect.objectContaining({
            applications: [{ id: 13, targetProfile: { id: 19 } }],
          })
        )
      );
      const request = await submitted(user, onStartReady);
      expect(request.targetProfiles).toEqual([
        { application: { id: 13 }, targetProfile: { id: 19 } },
      ]);
    });

    it("names each option's archetype and plan when the profiles span archetypes", async () => {
      const user = userEvent.setup();
      const legacy = { id: 3, name: "Legacy Java Application" };
      const java17 = { id: 31, name: "Java 17 on OpenShift" };
      renderModal({
        13: noDefault({
          migrationPaths: [
            migrationPaths[0],
            {
              archetype: legacy,
              targetProfile: java17,
              plan: { id: "6", name: plan6.name },
            },
          ],
        }),
      });
      await user.click(profileSelect());
      expect(
        screen.getByRole("option", { name: /Java 17 on OpenShift/ })
      ).toHaveTextContent(
        `Archetype: Legacy Java Application · Runs ${plan6.name}`
      );
    });

    it("sets every row of an archetype from one select, and each row can still change", async () => {
      const user = userEvent.setup();
      const { onStartReady } = renderModal(
        { 13: noDefault(), 14: noDefault() },
        { applications: [branch, claims] }
      );
      const archetypeSelect = () =>
        screen.getByRole("button", {
          name: /^Target profile for all applications of Java EE Application/,
        });
      await user.click(await screen.findByLabelText(/^Target profile for all/));
      await user.click(screen.getByRole("option", { name: /Quarkus 3\.x/ }));
      expect(archetypeSelect()).toHaveTextContent("Quarkus 3.x");
      expect(profileSelect()).toHaveTextContent("Quarkus 3.x");
      expect(
        screen.getByRole("button", {
          name: /^Target profile for Claims Processing/,
        })
      ).toHaveTextContent("Quarkus 3.x");
      expect(runButton()).toBeEnabled();
      // One row on another profile: the archetype select no longer names one.
      await user.click(profileSelect());
      await user.click(screen.getByRole("option", { name: /OpenJDK 21/ }));
      expect(archetypeSelect()).toHaveTextContent("Select a target profile");
      const request = await submitted(user, onStartReady);
      expect(request.targetProfiles).toEqual(
        expect.arrayContaining([
          { application: { id: 13 }, targetProfile: { id: 19 } },
          { application: { id: 14 }, targetProfile: { id: 11 } },
        ])
      );
    });

    it("offers no archetype select for one application", async () => {
      renderModal({ 13: noDefault() });
      await screen.findByRole("button", {
        name: /^Target profile for Branch Operations/,
      });
      expect(screen.queryByText(/^Target profile for all/)).toBeNull();
    });

    it("from a plan, offers the choice only on the rows that start", async () => {
      const user = userEvent.setup();
      // Both target profiles use plan 5: each application needs a pick.
      const bothOnPlan5 = noDefault({
        migrationPaths: migrationPaths.map((path) => ({
          ...path,
          plan: { id: "5", name: plan5.name },
        })),
      });
      const { onStartReady } = renderModal(
        { 13: bothOnPlan5, 14: bothOnPlan5 },
        {
          applications: [branch, claims],
          plan: { id: "5", name: plan5.name },
        }
      );
      const claimsSelect = await screen.findByRole("button", {
        name: /^Target profile for Claims Processing/,
      });
      expect(claimsSelect).toBeInTheDocument();
      // Unselected: no select and no required helper; Run does not wait for it.
      const claimsRow = screen
        .getByRole("rowheader", { name: "Claims Processing" })
        .closest("tr") as HTMLElement;
      await user.click(within(claimsRow).getByRole("checkbox"));
      expect(
        screen.queryByRole("button", {
          name: /^Target profile for Claims Processing/,
        })
      ).toBeNull();
      expect(runButton()).toBeDisabled();
      await user.click(profileSelect());
      await user.click(screen.getByRole("option", { name: /OpenJDK 21/ }));
      const request = await submitted(user, onStartReady);
      expect(request).toMatchObject({
        applicationIds: [13],
        targetProfiles: [
          { application: { id: 13 }, targetProfile: { id: 19 } },
        ],
      });
    });

    it("picks none with one plan for all when none of the application's profiles uses it", async () => {
      const user = userEvent.setup();
      const { onStartReady } = renderModal(
        {
          13: view({
            archetype: javaEE,
            targetProfile: quarkus,
            migrationPaths: [migrationPaths[0]],
          }),
        },
        { initialValues: { planSelection: "single", planId: "6" } }
      );
      expect(
        await screen.findByText(
          "None of this application's target profiles uses this migration plan, so the run gets no target profile skills."
        )
      ).toBeInTheDocument();
      const request = await submitted(user, onStartReady);
      expect(request.targetProfiles).toEqual([
        { application: { id: 13 }, targetProfile: null },
      ]);
    });

    it("picks the one profile that uses the plan with one plan for all, without waiting for the plans list", async () => {
      const user = userEvent.setup();
      // The plans list answers late: candidates come from the view.
      server.use(
        rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
          res(ctx.delay(5000), ctx.json([]))
        )
      );
      const { onStartReady } = renderModal(
        { 13: noDefault() },
        { initialValues: { planSelection: "single", planId: "6" } }
      );
      const row = (await screen.findByText("Branch Operations")).closest(
        "tr"
      ) as HTMLElement;
      expect(row).toHaveTextContent("OpenJDK 21 on OpenShift");
      expect(
        screen.queryByRole("button", {
          name: /^Target profile for Branch Operations/,
        })
      ).toBeNull();
      await waitFor(() => expect(runButton()).toBeEnabled());
      await user.click(runButton());
      await waitFor(() => expect(onStartReady).toHaveBeenCalled());
      expect(onStartReady.mock.calls[0][0].targetProfiles).toEqual([
        { application: { id: 13 }, targetProfile: { id: 19 } },
      ]);
    });
  });
});
