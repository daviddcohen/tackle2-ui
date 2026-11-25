jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { rest } from "msw";
import { Router } from "react-router-dom";

import {
  ApplicationMigrationPath,
  ApplicationMigrationView,
  MigrationPlan,
  StartApplicationMigrationsRequest,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { MigrationPreflightModal } from "./migration-preflight-modal";
import {
  PreflightRow,
  archetypeTargetProfiles,
  groupReadyApplicationsByPlan,
  pickForArchetype,
  sharedTargetProfilePick,
  startApplicationIds,
  startTargetProfiles,
  targetProfileChoice,
} from "./start-groups";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const plan = (id: string, name: string): MigrationPlan => ({
  id,
  name,
  description: "",
  // A plan without stages has nothing to preview (the table asks for one).
  stages: [
    {
      id: `${id}-1`,
      name: "Migrate",
      agent: { id: "a1", name: "Code Migrator" },
      instructions: "",
      requiresApproval: false,
      order: 1,
    },
  ],
});
const plans = [
  plan("1", "Java EE to Quarkus"),
  plan("6", ".NET Framework to .NET 8"),
  plan("7", ".NET lift and shift"),
];

const view = (
  planId: string | undefined,
  preflight: ApplicationMigrationView["preflight"] = "ready"
): ApplicationMigrationView => ({
  configured: planId != null,
  intervention: "none",
  stages: [],
  preflight,
  ...(planId != null
    ? {
        plan: {
          id: planId,
          name: plans.find((candidate) => candidate.id === planId)?.name ?? "",
        },
      }
    : {}),
});

// Four selected: two on Java EE to Quarkus, one on .NET, one blocked.
const rows: PreflightRow[] = [
  {
    application: { id: 15, name: "Advisor Workbench API" },
    migration: view("6"),
  },
  {
    application: { id: 3, name: "Claims Processing" },
    migration: view("1", "blocked"),
  },
  { application: { id: 1, name: "Customer Management" }, migration: view("1") },
  {
    application: { id: 2, name: "Policy Administration" },
    migration: view("1"),
  },
];

describe("groupReadyApplicationsByPlan", () => {
  it("groups the ready applications by their own plan, by plan name", () => {
    const groups = groupReadyApplicationsByPlan(
      rows,
      { planSelection: "recommended", planId: "" },
      plans
    );
    expect(
      groups.map((group) => [
        group.plan.name,
        group.applications.map((application) => application.name),
      ])
    ).toEqual([
      [".NET Framework to .NET 8", ["Advisor Workbench API"]],
      ["Java EE to Quarkus", ["Customer Management", "Policy Administration"]],
    ]);
    expect(groups[0].migrationPlan).toBe(plans[1]);
    expect(startApplicationIds(groups)).toEqual([15, 1, 2]);
  });

  it("makes one group with the picked plan, none before one is picked", () => {
    expect(
      groupReadyApplicationsByPlan(
        rows,
        { planSelection: "single", planId: "" },
        plans
      )
    ).toEqual([]);
    const [group, ...rest] = groupReadyApplicationsByPlan(
      rows,
      { planSelection: "single", planId: "7" },
      plans
    );
    expect(rest).toEqual([]);
    expect(group.plan).toEqual({ id: "7", name: ".NET lift and shift" });
    expect(group.applications.map((application) => application.id)).toEqual([
      15, 1, 2,
    ]);
  });

  it("starts nothing for a ready application without a plan", () => {
    expect(
      groupReadyApplicationsByPlan(
        [{ application: { id: 9, name: "Odd" }, migration: view(undefined) }],
        { planSelection: "recommended", planId: "" },
        plans
      )
    ).toEqual([]);
  });
});

describe("target profile picks", () => {
  const javaEE = { id: 1, name: "Java EE Application" };
  const legacy = { id: 3, name: "Legacy Java Application" };
  const quarkus = { id: 11, name: "Quarkus 3.x" };
  const openJdk = { id: 19, name: "OpenJDK 21 on OpenShift" };
  const unassigned = { id: 18, name: "Payara 6" };
  const java8 = { id: 32, name: "Java 8 on OpenShift" };
  const openJdkPlan = plan("8", "Java EE to OpenJDK 21");
  const sharedPlan = plan("9", "Java lift and shift");
  const allPlans: MigrationPlan[] = [...plans, openJdkPlan, sharedPlan];
  const paths: ApplicationMigrationPath[] = [
    { archetype: javaEE, targetProfile: quarkus, plan: plans[0] },
    { archetype: javaEE, targetProfile: openJdk, plan: openJdkPlan },
    { archetype: javaEE, targetProfile: unassigned },
  ];
  /** Two target profiles with a plan, one without: no default path. */
  const several = (overrides: Partial<ApplicationMigrationView> = {}) => ({
    ...view(undefined),
    configured: true,
    migrationPaths: paths,
    ...overrides,
  });
  /** Only Quarkus 3.x has a plan: the default path. */
  const oneRunnable = () => ({
    ...view("1"),
    archetype: javaEE,
    targetProfile: quarkus,
    migrationPaths: [paths[0], paths[2]],
  });
  /** Two target profiles, of two archetypes, use the shared plan. */
  const sharing = () =>
    several({
      migrationPaths: [
        paths[0],
        { archetype: javaEE, targetProfile: openJdk, plan: sharedPlan },
        { archetype: legacy, targetProfile: java8, plan: sharedPlan },
      ],
    });
  const recommended = { planSelection: "recommended", planId: "" } as const;
  const single = (planId: string) =>
    ({ planSelection: "single", planId }) as const;

  it("reads the server's default as text when the paths are not reported", () => {
    expect(
      targetProfileChoice(
        { ...view("1"), archetype: javaEE, targetProfile: quarkus },
        recommended,
        19
      )
    ).toEqual({
      kind: "server",
      path: {
        archetype: javaEE,
        targetProfile: quarkus,
        plan: { id: "1", name: "Java EE to Quarkus" },
      },
    });
  });

  it("offers each application's profiles with a plan, and requires a pick among several", () => {
    const runnable = paths.slice(0, 2);
    // No default: no silent choice.
    expect(targetProfileChoice(several(), recommended, undefined)).toEqual({
      kind: "required",
      candidates: runnable,
    });
    expect(targetProfileChoice(several(), recommended, 19)).toEqual({
      kind: "picked",
      path: paths[1],
      candidates: runnable,
    });
    // A profile without a plan cannot run: picking it picks nothing.
    expect(targetProfileChoice(several(), recommended, 18)).toEqual({
      kind: "required",
      candidates: runnable,
    });
    // One profile with a plan: it is used, the others are not offered.
    expect(targetProfileChoice(oneRunnable(), recommended, undefined)).toEqual({
      kind: "picked",
      path: paths[0],
      candidates: [paths[0]],
    });
  });

  it("offers the profiles that use the plan with one plan for all", () => {
    // One profile uses it: used.
    expect(targetProfileChoice(several(), single("8"), undefined)).toEqual({
      kind: "picked",
      path: paths[1],
      candidates: [paths[1]],
    });
    // None uses it: no target profile.
    expect(targetProfileChoice(several(), single("7"), 19)).toEqual({
      kind: "picked",
      path: null,
      candidates: [],
    });
    // Several use it (here across two archetypes): a pick is required.
    const shared = sharing().migrationPaths.slice(1);
    expect(targetProfileChoice(sharing(), single("9"), undefined)).toEqual({
      kind: "required",
      candidates: shared,
    });
    expect(targetProfileChoice(sharing(), single("9"), 32)).toEqual({
      kind: "picked",
      path: shared[1],
      candidates: shared,
    });
  });

  it("regroups the applications by the plan of the profile they pick", () => {
    const pickRows: PreflightRow[] = [
      {
        application: { id: 1, name: "Customer Management" },
        migration: several(),
      },
      {
        application: { id: 2, name: "Policy Administration" },
        migration: several(),
      },
    ];
    // Without picks neither starts.
    expect(
      groupReadyApplicationsByPlan(pickRows, recommended, allPlans)
    ).toEqual([]);

    const picked = groupReadyApplicationsByPlan(
      pickRows,
      recommended,
      allPlans,
      { 1: 11, 2: 19 }
    );
    expect(
      picked.map((group) => [
        group.plan.name,
        group.applications.map(({ id }) => id),
      ])
    ).toEqual([
      ["Java EE to OpenJDK 21", [2]],
      ["Java EE to Quarkus", [1]],
    ]);
    expect(picked[0].migrationPlan).toBe(openJdkPlan);
    expect(startTargetProfiles(picked)).toEqual([
      { application: { id: 2 }, targetProfile: { id: 19 } },
      { application: { id: 1 }, targetProfile: { id: 11 } },
    ]);
  });

  it("sends the only profile, flags a plan run waiting for a pick, and sends none for a plan no profile uses", () => {
    const [own] = groupReadyApplicationsByPlan(
      [
        {
          application: { id: 1, name: "Customer Management" },
          migration: oneRunnable(),
        },
      ],
      recommended,
      allPlans
    );
    expect(startTargetProfiles([own])).toEqual([
      { application: { id: 1 }, targetProfile: { id: 11 } },
    ]);

    const waiting: PreflightRow = {
      application: { id: 1, name: "Customer Management" },
      migration: sharing(),
    };
    const [group] = groupReadyApplicationsByPlan(
      [waiting],
      single("9"),
      allPlans
    );
    expect(group.isTargetProfileMissing).toBe(true);
    expect(startTargetProfiles([group])).toBeUndefined();
    // A plan no profile of the application uses sends an explicit none.
    const [none] = groupReadyApplicationsByPlan(
      [waiting],
      single("7"),
      allPlans
    );
    expect(none.isTargetProfileMissing).toBe(false);
    expect(startTargetProfiles([none])).toEqual([
      { application: { id: 1 }, targetProfile: null },
    ]);
  });
});

describe("archetypeTargetProfiles", () => {
  const javaEE = { id: 1, name: "Java EE Application" };
  const legacy = { id: 3, name: "Legacy Java Application" };
  const quarkus: ApplicationMigrationPath = {
    archetype: javaEE,
    targetProfile: { id: 11, name: "Quarkus 3.x" },
  };
  const openJdk: ApplicationMigrationPath = {
    archetype: javaEE,
    targetProfile: { id: 19, name: "OpenJDK 21 on OpenShift" },
  };
  const java8: ApplicationMigrationPath = {
    archetype: legacy,
    targetProfile: { id: 32, name: "Java 8 on OpenShift" },
  };
  const java17: ApplicationMigrationPath = {
    archetype: legacy,
    targetProfile: { id: 31, name: "Java 17 on OpenShift" },
  };

  it("groups the choices per archetype, and only when two or more applications share one", () => {
    const groups = archetypeTargetProfiles([
      { applicationId: 1, candidates: [quarkus, openJdk] },
      { applicationId: 2, candidates: [openJdk, quarkus] },
      { applicationId: 7, candidates: [java8, java17] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].archetype).toEqual(javaEE);
    expect(
      groups[0].profiles.map(({ targetProfile }) => targetProfile.id)
    ).toEqual([11, 19]);
    expect(groups[0].applications.map(({ id }) => id)).toEqual([1, 2]);
  });

  it("offers no select for an archetype with one profile among the choices", () => {
    // Two applications in both archetypes, one runnable profile in each.
    expect(
      archetypeTargetProfiles([
        { applicationId: 1, candidates: [quarkus, java8] },
        { applicationId: 2, candidates: [quarkus, java8] },
      ])
    ).toEqual([]);
  });

  it("sets every application that can run on the picked profile, and reads a shared pick", () => {
    const [group] = archetypeTargetProfiles([
      { applicationId: 1, candidates: [quarkus, openJdk] },
      // On a plan for all that only OpenJDK 21 and Java 8 use.
      { applicationId: 2, candidates: [openJdk, java8] },
    ]);
    expect(pickForArchetype(group, 11, { 9: 31 })).toEqual({ 9: 31, 1: 11 });
    const picks = pickForArchetype(group, 19, {});
    expect(picks).toEqual({ 1: 19, 2: 19 });
    expect(sharedTargetProfilePick(group, picks)).toBe(19);
    expect(sharedTargetProfilePick(group, { ...picks, 2: 32 })).toBeUndefined();
    expect(sharedTargetProfilePick(group, { 1: 19 })).toBeUndefined();
  });
});

describe("Run migration plan: the preview covers exactly what Run sends", () => {
  beforeEach(() => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json(plans))
      ),
      rest.post(AGENTIC_ENDPOINTS.planSkillsResolve, async (req, res, ctx) => {
        const body = await req.json();
        return res(
          ctx.json({
            stages: [
              {
                order: 1,
                name: "Migrate",
                agent: { id: "a1", name: "Code Migrator" },
                skills: [],
              },
            ],
            everyStage: (body.applications ?? []).map(
              ({ id }: { id: number }) => ({
                application: {
                  id,
                  name: rows.find((row) => row.application.id === id)
                    ?.application.name,
                },
                skills: [],
              })
            ),
          })
        );
      })
    );
  });

  const run = async (
    initialValues?: Partial<{ planSelection: "single"; planId: string }>
  ) => {
    const user = userEvent.setup();
    const onStartReady = jest.fn<void, [StartApplicationMigrationsRequest]>();
    render(
      <Router history={createMemoryHistory()}>
        <MigrationPreflightModal
          applications={rows.map((row) => row.application)}
          migrations={Object.fromEntries(
            rows.map((row) => [row.application.id, row.migration])
          )}
          initialValues={initialValues}
          onClose={jest.fn()}
          onStartReady={onStartReady}
        />
      </Router>
    );
    await user.click(
      await screen.findByRole("button", { name: "Review skills by stage" })
    );
    // Every application a table names in an "Every stage: {application}" title.
    await waitFor(() =>
      expect(
        screen.queryAllByRole("heading", { name: /^Every stage: / })
      ).toHaveLength(3)
    );
    const previewed = screen
      .getAllByRole("heading", { name: /^Every stage: / })
      .map((heading) => heading.textContent?.replace("Every stage: ", ""))
      .sort();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: /^Run on / }));
    await waitFor(() => expect(onStartReady).toHaveBeenCalled());
    const sent = onStartReady.mock.calls[0][0].applicationIds
      .map(
        (id) => rows.find((row) => row.application.id === id)?.application.name
      )
      .sort();
    return { previewed, sent };
  };

  it("with each application's own plan", async () => {
    const { previewed, sent } = await run();
    expect(previewed).toEqual(sent);
    expect(sent).toEqual([
      "Advisor Workbench API",
      "Customer Management",
      "Policy Administration",
    ]);
  });

  it("with one plan for all applications", async () => {
    const { previewed, sent } = await run({
      planSelection: "single",
      planId: "7",
    });
    expect(previewed).toEqual(sent);
    expect(sent).not.toContain("Claims Processing");
  });

  it("with the plan fixed, the selected ready applications only", async () => {
    const user = userEvent.setup();
    const onStartReady = jest.fn<void, [StartApplicationMigrationsRequest]>();
    // The plan's applications: three ready, one blocked (the resolver
    // mock names applications from rows).
    const planRows = [
      { application: rows[0].application, migration: view("1") },
      ...rows.slice(1),
    ];
    render(
      <Router history={createMemoryHistory()}>
        <MigrationPreflightModal
          applications={planRows.map((row) => row.application)}
          migrations={Object.fromEntries(
            planRows.map((row) => [row.application.id, row.migration])
          )}
          plan={{ id: "1", name: "Java EE to Quarkus" }}
          onClose={jest.fn()}
          onStartReady={onStartReady}
        />
      </Router>
    );
    const policyRow = screen
      .getByRole("rowheader", { name: "Policy Administration" })
      .closest("tr") as HTMLElement;
    await user.click(within(policyRow).getByRole("checkbox"));
    await user.click(
      await screen.findByRole("button", { name: "Review skills by stage" })
    );
    await waitFor(() =>
      expect(
        screen.queryAllByRole("heading", { name: /^Every stage: / })
      ).toHaveLength(2)
    );
    const previewed = screen
      .getAllByRole("heading", { name: /^Every stage: / })
      .map((heading) => heading.textContent?.replace("Every stage: ", ""))
      .sort();
    expect(previewed).toEqual(["Advisor Workbench API", "Customer Management"]);
    // One plan run: one table, without a per-plan title.
    expect(
      screen.queryByRole("heading", { name: /^Java EE to Quarkus: / })
    ).not.toBeInTheDocument();

    // Run counts the selection, and sends exactly the previewed applications.
    const runButton = screen.getByRole("button", {
      name: "Run on 2 applications",
    });
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);
    await waitFor(() => expect(onStartReady).toHaveBeenCalled());
    const request = onStartReady.mock.calls[0][0];
    expect(request).toEqual(
      expect.objectContaining({ planSelection: "single", planId: "1" })
    );
    expect(
      request.applicationIds
        .map(
          (id) =>
            planRows.find((row) => row.application.id === id)?.application.name
        )
        .sort()
    ).toEqual(previewed);
  });

  it("with the plan fixed and nothing selected, no preview and no Run", async () => {
    const user = userEvent.setup();
    render(
      <Router history={createMemoryHistory()}>
        <MigrationPreflightModal
          applications={rows.slice(2).map((row) => row.application)}
          migrations={Object.fromEntries(
            rows.slice(2).map((row) => [row.application.id, row.migration])
          )}
          plan={{ id: "1", name: "Java EE to Quarkus" }}
          onClose={jest.fn()}
          onStartReady={jest.fn()}
        />
      </Router>
    );
    expect(
      await screen.findByRole("button", { name: "Review skills by stage" })
    ).toBeInTheDocument();
    for (const name of ["Customer Management", "Policy Administration"]) {
      const row = screen
        .getByRole("rowheader", { name })
        .closest("tr") as HTMLElement;
      await user.click(within(row).getByRole("checkbox"));
    }
    expect(
      screen.queryByRole("button", { name: "Review skills by stage" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run on 0 applications" })
    ).toBeDisabled();
  });

  it("with the plan fixed, waits for the plans list instead of saying the plan is gone", async () => {
    const user = userEvent.setup();
    // The plans list answers late: meanwhile the preview loads the fixed
    // plan's skills for the selected application.
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.delay(5000), ctx.json([]))
      )
    );
    render(
      <Router history={createMemoryHistory()}>
        <MigrationPreflightModal
          applications={rows.slice(2).map((row) => row.application)}
          migrations={Object.fromEntries(
            rows.slice(2).map((row) => [row.application.id, row.migration])
          )}
          plan={{ id: "1", name: "Java EE to Quarkus" }}
          onClose={jest.fn()}
          onStartReady={jest.fn()}
        />
      </Router>
    );
    const policy = screen
      .getByRole("rowheader", { name: "Policy Administration" })
      .closest("tr") as HTMLElement;
    await user.click(within(policy).getByRole("checkbox"));
    await user.click(
      await screen.findByRole("button", { name: "Review skills by stage" })
    );
    expect(await screen.findByText("Loading skills")).toBeInTheDocument();
    expect(screen.queryByText("Skills could not be loaded.")).toBeNull();
  });

  it("counts in the Run button what Run sends", async () => {
    const user = userEvent.setup();
    const onStartReady = jest.fn<void, [StartApplicationMigrationsRequest]>();
    // Ready but without a plan: it starts nothing, so Run does not count it.
    const odd = { id: 9, name: "Odd" };
    render(
      <Router history={createMemoryHistory()}>
        <MigrationPreflightModal
          applications={[rows[0].application, odd]}
          migrations={{ 15: rows[0].migration, 9: view(undefined) }}
          onClose={jest.fn()}
          onStartReady={onStartReady}
        />
      </Router>
    );
    const runButton = await screen.findByRole("button", {
      name: "Run on 1 application",
    });
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);
    await waitFor(() => expect(onStartReady).toHaveBeenCalled());
    expect(onStartReady.mock.calls[0][0].applicationIds).toEqual([15]);
  });
});
