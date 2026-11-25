import * as React from "react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Skill, SkillCollection, SkillPlan } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import SkillDetail from "./skill-detail";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
// react-markdown is ESM only; the page passes it the skill content verbatim.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

/** Every scope, or only the listed ones. */
const mockGrantedScopes: { all: boolean; only: string[] } = {
  all: true,
  only: [],
};
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (scopes: string[]) =>
    mockGrantedScopes.all ||
    scopes.some((scope) => mockGrantedScopes.only.includes(scope)),
}));

const inlineSkill: Skill = {
  id: "1",
  name: "Spring Boot to Quarkus migration",
  description: "Guidance for Quarkus.",
  sourceType: "inline",
  content: "# Spring Boot to Quarkus\nReplace starters.",
  createTime: "2026-07-15T10:00:00Z",
  updateTime: "2026-08-10T14:30:00Z",
  associations: [
    {
      scope: "targetProfile",
      resource: { id: 11, name: "Quarkus 3.x" },
    },
    { scope: "application", resource: { id: 3, name: "Billing" } },
    {
      scope: "archetype",
      resource: { id: 1, name: "Spring Boot Application" },
    },
    { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
  ],
};

const archetypes = [
  {
    id: 1,
    name: "Spring Boot Application",
    profiles: [{ id: 11, name: "Quarkus 3.x" }],
  },
];

const collections: SkillCollection[] = [
  {
    id: "1",
    name: "Java modernization foundation",
    description: "",
    skills: [
      { id: "1", name: inlineSkill.name },
      { id: "5", name: "EJB to CDI" },
    ],
  },
  {
    id: "2",
    name: "Unrelated collection",
    description: "",
    skills: [{ id: "5", name: "EJB to CDI" }],
  },
];

/** GET /skills/1/plans: the server's plan skill resolution, in plan name order. */
const skillPlans: SkillPlan[] = [
  {
    plan: { id: "1", name: ".NET Framework to .NET 8" },
    placements: [
      {
        stage: { order: 2, name: "Migrate" },
        from: [{ kind: "agent", agent: { id: "2", name: "Code Migrator" } }],
        excluded: false,
      },
    ],
  },
  {
    plan: { id: "2", name: "Spring Boot to Quarkus" },
    placements: [
      {
        stage: { order: 2, name: "Migrate" },
        from: [{ kind: "agent", agent: { id: "2", name: "Code Migrator" } }],
        excluded: false,
      },
      {
        from: [
          {
            kind: "targetProfile",
            targetProfile: { id: 11, name: "Quarkus 3.x" },
            archetype: { id: 1, name: "Java EE Application" },
          },
        ],
        excluded: false,
      },
    ],
  },
];

/** Collection 1 is used by two agents, collection 2 by none. */
const agents = [
  {
    id: "2",
    name: "Code Migrator",
    skillCollections: [{ id: "1", name: "Java modernization foundation" }],
  },
  {
    id: "7",
    name: "Java Code Migrator",
    skillCollections: [{ id: "1", name: "Java modernization foundation" }],
  },
];

const skillPlansUrl = `${AGENTIC_ENDPOINTS.skills}/:id/plans`;

type Resolver = Parameters<typeof rest.get>[1];
type MemoryRouterEntry = NonNullable<
  React.ComponentProps<typeof MemoryRouter>["initialEntries"]
>[number];

const useEndpoints = (
  overrides: {
    skill?: Skill;
    plans?: Resolver;
    collections?: Resolver;
    agents?: Resolver;
  } = {}
) =>
  server.use(
    rest.get(
      AGENTIC_ENDPOINTS.agents,
      overrides.agents ?? ((_req, res, ctx) => res(ctx.json(agents)))
    ),
    rest.get(`${AGENTIC_ENDPOINTS.skills}/:id`, (_req, res, ctx) =>
      res(ctx.json(overrides.skill ?? inlineSkill))
    ),
    rest.get(
      AGENTIC_ENDPOINTS.skillCollections,
      overrides.collections ?? ((_req, res, ctx) => res(ctx.json(collections)))
    ),
    rest.get(
      skillPlansUrl,
      overrides.plans ??
        ((_req, res, ctx) => res(ctx.json({ plans: skillPlans })))
    ),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json(archetypes)))
  );

const renderPage = (path: MemoryRouterEntry = "/skills/1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Route path={DevPaths.skillDetails}>
        <SkillDetail />
      </Route>
    </MemoryRouter>
  );

const findTitle = () =>
  screen.findByRole("heading", { level: 1, name: inlineSkill.name });

describe("SkillDetail, Details tab", () => {
  afterEach(() => {
    mockGrantedScopes.all = true;
    mockGrantedScopes.only = [];
  });

  it("shows the description in the header, the facts and the content", async () => {
    useEndpoints();
    renderPage();

    await findTitle();
    // The tab set has an accessible name, on the tablist itself.
    expect(
      screen.getByRole("tablist", { name: "Skill details" })
    ).toBeInTheDocument();
    expect(screen.getByText("Guidance for Quarkus.")).toBeInTheDocument();
    expect(screen.getByText("Inline")).toBeInTheDocument();
    // Absent load policy is the CRD default.
    expect(screen.getByText("How agents use it")).toBeInTheDocument();
    expect(screen.getByText("Available when needed")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", {
        name: "1 agent, 1 collection, 1 archetype, 1 target profile, 1 application",
      })
    ).toHaveAttribute("href", "/skills/1?tab=usage");
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Content" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent(
      "Replace starters."
    );
  });

  it("shows a rule as Always followed", async () => {
    useEndpoints({ skill: { ...inlineSkill, loadPolicy: "rule" } });
    renderPage();

    await findTitle();
    expect(screen.getByText("Always followed")).toBeInTheDocument();
  });

  it("keeps the origin and the breadcrumb trail on the Usage fact link", async () => {
    useEndpoints();
    renderPage({
      pathname: "/skills/1",
      search: "?from=collection-1",
      state: {
        breadcrumbs: [
          { title: "Skills", path: "/skills?tab=collections" },
          {
            title: "Java modernization foundation",
            path: "/skills/collections/1",
          },
        ],
      },
    });

    await findTitle();
    const link = await screen.findByRole("link", { name: /^1 agent, / });
    expect(link).toHaveAttribute(
      "href",
      "/skills/1?from=collection-1&tab=usage"
    );
    await userEvent.click(link);

    expect(
      await screen.findByRole("tab", { name: "Usage", selected: true })
    ).toBeInTheDocument();
    const crumbs = within(
      screen.getByRole("navigation", { name: "Breadcrumb" })
    );
    expect(
      crumbs.getByRole("link", { name: "Java modernization foundation" })
    ).toHaveAttribute("href", "/skills/collections/1");
    expect(crumbs.getByRole("link", { name: "Skills" })).toHaveAttribute(
      "href",
      "/skills?tab=collections"
    );
  });

  it("links a web repository and shows any other one as copyable text", async () => {
    useEndpoints({
      skill: {
        ...inlineSkill,
        sourceType: "git",
        content: undefined,
        repoUrl: "git@github.com:konveyor/rulesets.git",
        repoBranch: "main",
        repoPath: "default/jakarta-ee",
      },
    });
    renderPage();

    await findTitle();
    expect(screen.getByText("Git")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /git@github.com/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("git@github.com:konveyor/rulesets.git")
    ).toBeInTheDocument();
    expect(screen.getByText("default/jakarta-ee")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Content" })
    ).not.toBeInTheDocument();
  });

  it("says None without usage and Unavailable when the server leaves it out", async () => {
    useEndpoints({
      skill: { ...inlineSkill, associations: [] },
      collections: (_req, res, ctx) => res(ctx.json([])),
    });
    const { unmount } = renderPage();
    await findTitle();
    expect(await screen.findByText("None")).toBeInTheDocument();
    unmount();

    useEndpoints({ skill: { ...inlineSkill, associations: undefined } });
    renderPage();
    await findTitle();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("does not say None for usage while the collections load or fail", async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    useEndpoints({
      skill: { ...inlineSkill, associations: [] },
      collections: async (_req, res, ctx) => {
        await pending;
        return res(ctx.json([]));
      },
    });
    const { unmount } = renderPage();
    await findTitle();
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("None")).toBeNull();
    release();
    expect(await screen.findByText("None")).toBeInTheDocument();
    unmount();

    useEndpoints({
      skill: { ...inlineSkill, associations: [] },
      collections: (_req, res, ctx) => res(ctx.status(403)),
    });
    renderPage();
    await findTitle();
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("None")).toBeNull();
  });

  it("disables Delete with the reason while the skill is in use", async () => {
    useEndpoints();
    renderPage("/skills/1?tab=usage");
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "In skill collections (1)" });
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    await user.hover(remove);
    expect(
      await screen.findByText(
        "This skill is attached to 1 agent, 1 archetype, 1 target profile, and 1 application, and is in 1 skill collection. Remove it from them before deleting it."
      )
    ).toBeInTheDocument();
  });

  it("disables Edit and Delete for an operator-managed skill", async () => {
    useEndpoints({
      skill: { ...inlineSkill, associations: [], operatorManaged: true },
    });
    renderPage();
    const user = userEvent.setup();

    await findTitle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("leaves for the list before the deleted skill could be read again", async () => {
    // A skill that can be deleted: no associations, no collection, no plan.
    const deletable = { ...inlineSkill, associations: [] };
    let isDeleted = false;
    let readsAfterDelete = 0;
    server.use(
      rest.get(`${AGENTIC_ENDPOINTS.skills}/:id`, (_req, res, ctx) => {
        if (!isDeleted) return res(ctx.json(deletable));
        readsAfterDelete++;
        return res(ctx.status(404));
      }),
      rest.delete(`${AGENTIC_ENDPOINTS.skills}/:id`, (_req, res, ctx) => {
        isDeleted = true;
        return res(ctx.status(204));
      }),
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.json([]))
      ),
      rest.get(skillPlansUrl, (_req, res, ctx) => res(ctx.json({ plans: [] }))),
      rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([])))
    );
    render(
      <MemoryRouter initialEntries={["/skills/1"]}>
        <Route path={DevPaths.skillDetails}>
          <SkillDetail />
        </Route>
        <Route exact path={DevPaths.skills}>
          <p>Skills list</p>
        </Route>
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await findTitle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })
    );

    expect(await screen.findByText("Skills list")).toBeInTheDocument();
    // The page is gone before the invalidated queries re-render it, so the
    // detail query never asks for the deleted skill (a 404 in the console).
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(readsAfterDelete).toBe(0);
  });

  it("lists Edit, Test with an agent, then Delete", async () => {
    useEndpoints();
    renderPage();
    const user = userEvent.setup();

    await findTitle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Edit", "Test with an agent", "Delete"]);
  });

  it("opens the test modal with the skill preselected", async () => {
    useEndpoints();
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
        res(ctx.json([inlineSkill]))
      ),
      rest.get("/hub/applications", (_req, res, ctx) => res(ctx.json([]))),
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.json(agents.map((agent) => ({ ...agent, skills: [] }))))
      )
    );
    renderPage();
    const user = userEvent.setup();

    await findTitle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Test with an agent" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Test agent" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Agent" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "Remove Spring Boot to Quarkus migration",
      })
    ).toBeInTheDocument();
  });

  it("offers only Test with an agent with the run scope alone", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.only = ["agentic.agentruns:post"];
    useEndpoints();
    renderPage();
    const user = userEvent.setup();

    await findTitle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Test with an agent"]);
  });

  it("offers Edit and Delete only with the skill write scope alone", async () => {
    mockGrantedScopes.all = false;
    mockGrantedScopes.only = ["agentic.skills:put"];
    useEndpoints();
    renderPage();
    const user = userEvent.setup();

    await findTitle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Edit", "Delete"]);
  });

  it("has no Actions menu without the write scope", async () => {
    mockGrantedScopes.all = false;
    useEndpoints();
    renderPage();

    await findTitle();
    expect(
      screen.queryByRole("button", { name: "Actions" })
    ).not.toBeInTheDocument();
  });
});

/** The section a heading names: Flex > FlexItem > Title (detail-section.tsx). */
const sectionOf = (heading: HTMLElement) =>
  heading.parentElement?.parentElement as HTMLElement;

describe("SkillDetail, Usage tab", () => {
  it("lists what the skill is attached to as facts, one row per type", async () => {
    useEndpoints();
    renderPage("/skills/1?tab=usage");

    await findTitle();
    const section = within(
      screen.getByRole("region", { name: "Attached to (4)" })
    );
    expect(
      section.getByText(
        "An agent can use this skill in every stage it runs. An archetype, target profile or application adds it to every stage when a matching application is migrated. A migration plan can exclude it, except where it is attached to the application itself."
      )
    ).toBeInTheDocument();
    expect(
      section.getByRole("link", { name: "Code Migrator" })
    ).toHaveAttribute("href", "/agents/2");
    // Every archetype link from a skills surface opens its Skills tab.
    expect(
      section.getByRole("link", { name: "Spring Boot Application" })
    ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=1");
    expect(
      await section.findByRole("link", {
        name: "Quarkus 3.x (Spring Boot Application)",
      })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
    expect(section.getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      "/applications/3?tab=skills"
    );
    expect(section.queryByRole("grid")).toBeNull();
  });

  it("keeps all four facts, None where nothing is attached", async () => {
    useEndpoints({
      skill: {
        ...inlineSkill,
        associations: [
          { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
        ],
      },
    });
    renderPage("/skills/1?tab=usage");

    await findTitle();
    const section = within(
      sectionOf(screen.getByRole("heading", { name: "Attached to (1)" }))
    );
    for (const term of [
      "Agents",
      "Archetypes",
      "Target profiles",
      "Applications",
    ]) {
      expect(section.getByText(term)).toBeInTheDocument();
    }
    expect(section.getAllByText("None")).toHaveLength(3);
  });

  it("opens the Usage tab from an old Associations link and rewrites it", async () => {
    useEndpoints();
    render(
      <MemoryRouter initialEntries={["/skills/1?tab=associations&from=x"]}>
        <Route path={DevPaths.skillDetails}>
          <SkillDetail />
        </Route>
        <Route
          path="*"
          render={({ location }) => (
            <p data-testid="search">{location.search}</p>
          )}
        />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("tab", { name: "Usage", selected: true })
    ).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?tab=usage&from=x");
  });

  it("lists the skill collections with the agents that use each", async () => {
    useEndpoints({
      collections: (_req, res, ctx) =>
        res(
          ctx.json([
            ...collections,
            {
              id: "3",
              name: "Single agent collection",
              description: "",
              skills: [{ id: "1", name: inlineSkill.name }],
            },
            {
              id: "4",
              name: "Unused collection",
              description: "",
              skills: [{ id: "1", name: inlineSkill.name }],
            },
          ])
        ),
      agents: (_req, res, ctx) =>
        res(
          ctx.json([
            ...agents,
            {
              id: "9",
              name: "Deployment Agent",
              skillCollections: [{ id: "3", name: "Single agent collection" }],
            },
          ])
        ),
    });
    renderPage("/skills/1?tab=usage");

    const heading = await screen.findByRole("heading", {
      name: "In skill collections (3)",
    });
    expect(
      within(sectionOf(heading)).getByText(
        "Agents that use these skill collections also use this skill in every stage they run, unless a migration plan excludes it."
      )
    ).toBeInTheDocument();
    const grid = within(
      screen.getByRole("grid", { name: "In skill collections" })
    );
    expect(grid.getByRole("columnheader", { name: "Agents" })).toBeVisible();
    expect(grid.getByRole("link", { name: "2 agents" })).toHaveAttribute(
      "href",
      "/skills/collections/1?from=skill-1#used-by-agents"
    );
    expect(
      grid.getByRole("link", { name: "Deployment Agent" })
    ).toHaveAttribute("href", "/agents/9?from=skill-1");
    expect(grid.getByText("None")).toBeInTheDocument();
    expect(grid.queryByText("Unrelated collection")).toBeNull();
  });

  it("says Unavailable for the agents of a collection when agents cannot be read", async () => {
    useEndpoints({ agents: (_req, res, ctx) => res(ctx.status(403)) });
    renderPage("/skills/1?tab=usage");

    const grid = await screen.findByRole("grid", {
      name: "In skill collections",
    });
    expect(await within(grid).findByText("Unavailable")).toBeInTheDocument();
  });

  it("lists each plan's stages that get the skill, then Every stage, with From", async () => {
    useEndpoints();
    renderPage("/skills/1?tab=usage");

    const heading = await screen.findByRole("heading", {
      name: "Used in migration plans (2)",
    });
    expect(
      within(sectionOf(heading)).getByText(
        "The stages of each migration plan that get this skill, and where it comes from. Application skills are added when a plan runs. For a plan that no target profile uses, archetype skills are added the same way, for each application, and no target profile skills."
      )
    ).toBeInTheDocument();
    const grid = screen.getByRole("grid", { name: "Used in migration plans" });
    const rows = within(grid).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Migration planStageFrom",
      ".NET Framework to .NET 8Stage 2: MigrateRun by Code MigratorAgent: Code Migrator",
      "Spring Boot to QuarkusStage 2: MigrateRun by Code MigratorAgent: Code Migrator",
      // The plan cell spans its rows: Every stage is one of its plan's rows,
      // not a row without a plan.
      "Every stageTarget profile: Quarkus 3.x (Java EE Application)",
    ]);
    const planCell = within(rows[2])
      .getByRole("link", { name: "Spring Boot to Quarkus" })
      .closest("td");
    expect(planCell).toHaveAttribute("rowspan", "2");
    expect(
      within(rows[1])
        .getByRole("link", { name: ".NET Framework to .NET 8" })
        .closest("td")
    ).toHaveAttribute("rowspan", "1");
    // "Run by" names this skill as the origin, like the page's other
    // entity links; the From value is the shared formatter's link.
    expect(
      within(rows[2])
        .getAllByRole("link", { name: "Code Migrator" })
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/agents/2?from=skill-1", "/agents/2"]);
    expect(
      within(rows[3]).getByRole("link", { name: "Quarkus 3.x" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
  });

  it("orders stages, puts Every stage last and marks an excluded stage", async () => {
    const plan: SkillPlan = {
      plan: { id: "5", name: "Java EE to Quarkus" },
      placements: [
        {
          from: [
            {
              kind: "archetype",
              archetype: { id: 1, name: "Java EE Application" },
            },
          ],
          excluded: false,
        },
        {
          stage: { order: 3, name: "Validate" },
          from: [
            { kind: "agent", agent: { id: "4", name: "Build Validator" } },
          ],
          excluded: false,
        },
        {
          stage: { order: 2, name: "Migrate" },
          from: [
            {
              kind: "collection",
              agent: { id: "7", name: "Java Code Migrator" },
              collection: { id: "1", name: "Java modernization foundation" },
            },
          ],
          excluded: true,
        },
      ],
    };
    useEndpoints({
      plans: (_req, res, ctx) => res(ctx.json({ plans: [plan] })),
    });
    renderPage("/skills/1?tab=usage");

    await screen.findByRole("heading", { name: "Used in migration plans (1)" });
    const rows = within(
      screen.getByRole("grid", { name: "Used in migration plans" })
    ).getAllByRole("row");
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      "Java EE to QuarkusStage 2: MigrateExcludedRun by Java Code MigratorCollection: Java modernization foundation",
      "Stage 3: ValidateRun by Build ValidatorAgent: Build Validator",
      "Every stageArchetype: Java EE Application",
    ]);
    expect(within(rows[1]).getByText("Excluded")).toBeInTheDocument();
    expect(within(rows[2]).queryByText("Excluded")).toBeNull();
  });

  it("names a stage without a name by its number", async () => {
    const plan: SkillPlan = {
      plan: { id: "6", name: "Unnamed stages" },
      placements: [
        {
          stage: { order: 1, name: "" },
          from: [{ kind: "agent", agent: { id: "2", name: "Code Migrator" } }],
          excluded: false,
        },
      ],
    };
    useEndpoints({
      plans: (_req, res, ctx) => res(ctx.json({ plans: [plan] })),
    });
    renderPage("/skills/1?tab=usage");

    const grid = await screen.findByRole("grid", {
      name: "Used in migration plans",
    });
    expect(within(grid).getByText("Stage 1")).toBeInTheDocument();
  });

  it("keeps the server's order of the plans", async () => {
    const reversed = [...skillPlans].reverse();
    useEndpoints({
      plans: (_req, res, ctx) => res(ctx.json({ plans: reversed })),
    });
    renderPage("/skills/1?tab=usage");

    await screen.findByRole("heading", {
      name: "Used in migration plans (2)",
    });
    const planLinks = within(
      screen.getByRole("grid", { name: "Used in migration plans" })
    )
      .getAllByRole("link")
      .filter((link) =>
        link.getAttribute("href")?.startsWith("/migration-plans")
      );
    expect(planLinks.map((link) => link.textContent)).toEqual([
      "Spring Boot to Quarkus",
      ".NET Framework to .NET 8",
    ]);
  });

  it("shows a skeleton while the plans load", async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    useEndpoints({
      plans: async (_req, res, ctx) => {
        await pending;
        return res(ctx.json({ plans: [] }));
      },
    });
    renderPage("/skills/1?tab=usage");

    await findTitle();
    expect(
      await screen.findByText("Loading migration plans")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("grid", { name: "Used in migration plans" })
    ).not.toBeInTheDocument();
    release();
    expect(
      await screen.findByText(
        "No migration plan gets this skill from an agent, a collection, an archetype or a target profile. The applications it is attached to add it to every stage when they run."
      )
    ).toBeInTheDocument();
  });

  it("shows the empty sections without a count", async () => {
    useEndpoints({
      skill: { ...inlineSkill, associations: [] },
      plans: (_req, res, ctx) => res(ctx.json({ plans: [] })),
      collections: (_req, res, ctx) => res(ctx.json([])),
    });
    renderPage("/skills/1?tab=usage");

    await findTitle();
    // Left-aligned sentences, not centered empty states.
    const noPlans = await screen.findByText(
      "No migration plan gets this skill."
    );
    expect(noPlans.tagName).toBe("P");
    expect(noPlans.closest(".pf-v6-c-empty-state")).toBeNull();
    const noCollections = await screen.findByText(
      "This skill is not in any skill collection."
    );
    expect(noCollections.tagName).toBe("P");
    expect(noCollections.closest(".pf-v6-c-empty-state")).toBeNull();
    expect(
      screen.getByText(
        "This skill is not attached to an agent, archetype, target profile or application."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Attached to" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Used in migration plans" })
    ).toBeInTheDocument();
    // The section sentence stays above the empty sentence.
    expect(
      screen.getByText(/^The stages of each migration plan/)
    ).toBeInTheDocument();
  });

  it("says applications add the skill when no plan gets it otherwise", async () => {
    useEndpoints({
      skill: {
        ...inlineSkill,
        associations: [
          { scope: "application", resource: { id: 3, name: "Billing" } },
          { scope: "application", resource: { id: 4, name: "Claims" } },
        ],
      },
      plans: (_req, res, ctx) => res(ctx.json({ plans: [] })),
    });
    renderPage("/skills/1?tab=usage");

    await findTitle();
    const section = sectionOf(
      screen.getByRole("heading", { name: "Used in migration plans" })
    );
    const empty = await within(section).findByText(
      "No migration plan gets this skill from an agent, a collection, an archetype or a target profile. The applications it is attached to add it to every stage when they run."
    );
    expect(empty.tagName).toBe("P");
    expect(empty.closest(".pf-v6-c-empty-state")).toBeNull();
    // The section sentence says when application skills are added.
    expect(
      within(section).getByText(
        "The stages of each migration plan that get this skill, and where it comes from. Application skills are added when a plan runs. For a plan that no target profile uses, archetype skills are added the same way, for each application, and no target profile skills."
      )
    ).toBeInTheDocument();
    expect(within(section).queryByText(/uses this skill/)).toBeNull();
  });

  it("says the plans are not available when the server has no endpoint for them", async () => {
    // A backend without the endpoint answers 404 (hand-off doc, step 8).
    useEndpoints({ plans: (_req, res, ctx) => res(ctx.status(404)) });
    renderPage("/skills/1?tab=usage");

    await findTitle();
    const section = sectionOf(
      await screen.findByRole("heading", { name: "Used in migration plans" })
    );
    expect(
      await within(section).findByText(
        "This server cannot list the migration plans that get this skill."
      )
    ).toBeInTheDocument();
    expect(within(section).queryByText("Unavailable")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(
      within(section).queryByText(/The stages of each migration plan/)
    ).toBeNull();
  });

  it("says Unavailable, not unused, when the plans fail to load", async () => {
    useEndpoints({ plans: (_req, res, ctx) => res(ctx.status(500)) });
    renderPage("/skills/1?tab=usage");

    await findTitle();
    expect(
      await screen.findByRole("heading", { name: "In skill collections (1)" })
    ).toBeInTheDocument();
    const section = sectionOf(
      screen.getByRole("heading", { name: "Used in migration plans" })
    );
    expect(await within(section).findByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText(/^No migration plan gets/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("grid", { name: "Used in migration plans" })
    ).not.toBeInTheDocument();
  });
});
