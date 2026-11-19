jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { rest } from "msw";
import { Router } from "react-router-dom";

import {
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
  groupReadyApplicationsByPlan,
  startApplicationIds,
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
          linkTo={(pathname) => pathname}
          onClose={jest.fn()}
          onStartReady={onStartReady}
        />
      </Router>
    );
    await user.click(
      await screen.findByRole("button", { name: "Skills by stage" })
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
          linkTo={(pathname) => pathname}
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
      await screen.findByRole("button", { name: "Skills by stage" })
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
          linkTo={(pathname) => pathname}
          onClose={jest.fn()}
          onStartReady={jest.fn()}
        />
      </Router>
    );
    expect(
      await screen.findByRole("button", { name: "Skills by stage" })
    ).toBeInTheDocument();
    for (const name of ["Customer Management", "Policy Administration"]) {
      const row = screen
        .getByRole("rowheader", { name })
        .closest("tr") as HTMLElement;
      await user.click(within(row).getByRole("checkbox"));
    }
    expect(
      screen.queryByRole("button", { name: "Skills by stage" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run on 0 applications" })
    ).toBeDisabled();
  });

  it("with the plan fixed, names the plan in the preview while the plans load", async () => {
    const user = userEvent.setup();
    // The plans list answers late: meanwhile the preview names the fixed plan.
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
          linkTo={(pathname) => pathname}
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
      await screen.findByRole("button", { name: "Skills by stage" })
    );
    expect(
      await screen.findByText(
        "The skills each stage's agent gets when Java EE to Quarkus runs on Customer Management."
      )
    ).toBeInTheDocument();
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
          linkTo={(pathname) => pathname}
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
