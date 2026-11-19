jest.unmock("react-router-dom");

import { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { rest } from "msw";
import { Router } from "react-router-dom";

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
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { MigrationPreflightModal } from "./migration-preflight-modal";

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
        linkTo={(pathname) => pathname}
        onClose={jest.fn()}
        onStartReady={onStartReady}
        {...props}
      />
    </Router>
  );
  return { onStartReady };
};

const skillsToggle = () =>
  screen.getByRole("button", { name: "Skills by stage" });

const openPreview = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(skillsToggle()).toBeInTheDocument());
  await user.click(skillsToggle());
};

const ATTRIBUTION =
  "An application's archetype, target profile and own skills go to that application only.";

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

  it("previews one application on its own plan from its view, groups collapsed, names as text", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() });
    await openPreview(user);
    expect(
      screen.getByText(
        "The skills each stage's agent gets when Legacy Java to RHEL runs on Branch Operations."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(ATTRIBUTION)).toBeNull();
    const table = screen.getByRole("grid", { name: "Skills by stage" });
    // Collapsed: the title rows carry the counts.
    expect(within(table).getByText("Stage 1: Migrate")).toBeInTheDocument();
    expect(within(table).getAllByText("1 skill")).toHaveLength(2);
    expect(within(table).getByText("Quarkus patterns")).not.toBeVisible();
    // One run: the group titles are h2 under the dialog's h1.
    expect(
      within(table).getByRole("heading", { level: 2, name: "Stage 1: Migrate" })
    ).toBeInTheDocument();
    // A link would close the dialog and lose its choices.
    expect(within(table).queryByRole("link")).toBeNull();
    // Its view already says what each stage gets.
    expect(resolveRequests).toHaveLength(0);
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

  it("previews one run of several applications, with the attribution once", async () => {
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
    expect(screen.getAllByText(ATTRIBUTION)).toHaveLength(1);
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
    expect(screen.getAllByText(ATTRIBUTION)).toHaveLength(1);
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
  });

  it("says a rerun resolves the skills again", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() }, { rerunPlanId: "5" });
    await openPreview(user);
    expect(
      screen.getByText(
        "The new run uses the migration plan as it is now, so a stage can get different skills than in the failed run."
      )
    ).toBeInTheDocument();
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

  it("shows no preview when no application is ready", async () => {
    renderModal({
      13: view({ preflight: "blocked", preflightReason: "No credentials." }),
    });
    await act(async () => {});
    expect(
      screen.queryByRole("button", { name: "Skills by stage" })
    ).toBeNull();
  });
});
