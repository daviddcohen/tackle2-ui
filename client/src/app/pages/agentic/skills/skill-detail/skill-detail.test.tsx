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

const mockGrantedScopes: { all: boolean } = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
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
    sources: [
      {
        scope: "agent",
        scopeName: "Code Migrator",
        resource: { id: "2", name: "Code Migrator" },
      },
    ],
    excluded: false,
  },
  {
    plan: { id: "2", name: "Spring Boot to Quarkus" },
    sources: [
      {
        scope: "agent",
        scopeName: "Code Migrator",
        resource: { id: "2", name: "Code Migrator" },
      },
      {
        scope: "targetProfile",
        scopeName: "Quarkus 3.x",
        resource: { id: 11, name: "Quarkus 3.x" },
      },
    ],
    excluded: false,
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
  } = {}
) =>
  server.use(
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
    expect(
      screen.getByRole("link", { name: "4 associations" })
    ).toHaveAttribute("href", "/skills/1?tab=associations");
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Content" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent(
      "Replace starters."
    );
  });

  it("keeps the origin and the breadcrumb trail on the Associations fact link", async () => {
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
    const link = screen.getByRole("link", { name: "4 associations" });
    expect(link).toHaveAttribute(
      "href",
      "/skills/1?from=collection-1&tab=associations"
    );
    await userEvent.click(link);

    expect(
      await screen.findByRole("tab", { name: "Associations", selected: true })
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

  it("says None without associations and Unavailable when the server leaves them out", async () => {
    useEndpoints({ skill: { ...inlineSkill, associations: [] } });
    const { unmount } = renderPage();
    await findTitle();
    expect(screen.getByText("None")).toBeInTheDocument();
    unmount();

    useEndpoints({ skill: { ...inlineSkill, associations: undefined } });
    renderPage();
    await findTitle();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("disables Delete with the reason while the skill is in use", async () => {
    useEndpoints();
    renderPage("/skills/1?tab=associations");
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "In skill collections (1)" });
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    await user.hover(remove);
    expect(
      await screen.findByText(
        "This skill has 4 associations and is in 1 skill collection. Remove them before deleting it."
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

describe("SkillDetail, Associations tab", () => {
  it("lists associations by type, the server's plans and the collections", async () => {
    useEndpoints();
    renderPage("/skills/1?tab=associations");

    await findTitle();
    expect(
      screen.getByRole("heading", { name: "Associated with (4)" })
    ).toBeInTheDocument();
    const associationRows = within(
      screen.getByRole("grid", { name: "Associated with" })
    ).getAllByRole("row");
    expect(associationRows.slice(1).map((row) => row.textContent)).toEqual([
      "AgentCode Migrator",
      "ArchetypeSpring Boot Application",
      "Target profileQuarkus 3.x (Spring Boot Application)",
      "ApplicationBilling",
    ]);

    expect(
      await screen.findByRole("heading", {
        name: "Used in migration plans (2)",
      })
    ).toBeInTheDocument();
    const planRows = within(
      screen.getByRole("grid", { name: "Used in migration plans" })
    ).getAllByRole("row");
    expect(planRows[1]).toHaveTextContent(".NET Framework to .NET 8");
    // Sources in resolution order, one plain line each.
    expect(planRows[2]).toHaveTextContent(
      "Spring Boot to QuarkusAgent: Code MigratorTarget profile: Quarkus 3.x"
    );

    const collectionsGrid = screen.getByRole("grid", {
      name: "In skill collections",
    });
    expect(
      within(collectionsGrid).getByRole("link", {
        name: "Java modernization foundation",
      })
    ).toBeInTheDocument();
    expect(within(collectionsGrid).getByText("2 skills")).toBeInTheDocument();
  });

  it("keeps the server's order of the plans", async () => {
    const reversed = [...skillPlans].reverse();
    useEndpoints({
      plans: (_req, res, ctx) => res(ctx.json({ plans: reversed })),
    });
    renderPage("/skills/1?tab=associations");

    await screen.findByRole("heading", {
      name: "Used in migration plans (2)",
    });
    const planRows = within(
      screen.getByRole("grid", { name: "Used in migration plans" })
    ).getAllByRole("row");
    expect(planRows).toHaveLength(3);
    expect(planRows[1]).toHaveTextContent("Spring Boot to Quarkus");
    expect(planRows[2]).toHaveTextContent(".NET Framework to .NET 8");
  });

  it("lists a plan that gets the skill only through a skill collection, marked Excluded", async () => {
    const collectionPlan: SkillPlan = {
      plan: { id: "5", name: "Java EE to Quarkus" },
      sources: [
        {
          scope: "agent",
          scopeName: "Code Migrator via Java modernization foundation",
          resource: { id: "2", name: "Code Migrator" },
          collection: { id: "1", name: "Java modernization foundation" },
        },
      ],
      excluded: true,
    };
    useEndpoints({
      plans: (_req, res, ctx) =>
        res(ctx.json({ plans: [...skillPlans, collectionPlan] })),
    });
    renderPage("/skills/1?tab=associations");

    // The excluding plan is listed but does not use the skill.
    await screen.findByRole("heading", {
      name: "Used in migration plans (2 of 3)",
    });
    const planRows = within(
      screen.getByRole("grid", { name: "Used in migration plans" })
    ).getAllByRole("row");
    expect(within(planRows[1]).queryByText("Excluded")).not.toBeInTheDocument();
    expect(planRows[3]).toHaveTextContent(
      "Java EE to QuarkusExcludedAgent: Code Migrator via Java modernization foundation"
    );
    expect(within(planRows[3]).getByText("Excluded")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Migration plans that get this skill from an agent, its skill collections, the archetype or the target profiles. Application skills are added when a plan runs. A plan marked Excluded does not give this skill to its agents."
      )
    ).toBeInTheDocument();
  });

  it("explains the sources without the Excluded sentence when no plan excludes the skill", async () => {
    useEndpoints();
    renderPage("/skills/1?tab=associations");

    expect(
      await screen.findByText(
        "Migration plans that get this skill from an agent, its skill collections, the archetype or the target profiles. Application skills are added when a plan runs."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/A plan marked Excluded/)
    ).not.toBeInTheDocument();
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
    renderPage("/skills/1?tab=associations");

    await findTitle();
    expect(
      await screen.findByText("Loading migration plans")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("grid", { name: "Used in migration plans" })
    ).not.toBeInTheDocument();
    release();
    expect(
      await screen.findByText("No migration plan uses this skill.")
    ).toBeInTheDocument();
  });

  it("shows the empty sections without a count", async () => {
    useEndpoints({
      skill: { ...inlineSkill, associations: [] },
      plans: (_req, res, ctx) => res(ctx.json({ plans: [] })),
      collections: (_req, res, ctx) => res(ctx.json([])),
    });
    renderPage("/skills/1?tab=associations");

    await findTitle();
    expect(
      await screen.findByText("No migration plan uses this skill.")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("This skill is not in any skill collection.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This skill is not associated with an agent, archetype, target profile or application."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Used in migration plans" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Migration plans that get/)).toBeNull();
  });

  it("counts none used when the only plan excludes the skill", async () => {
    useEndpoints({
      plans: (_req, res, ctx) =>
        res(ctx.json({ plans: [{ ...skillPlans[0], excluded: true }] })),
    });
    renderPage("/skills/1?tab=associations");

    expect(
      await screen.findByRole("heading", {
        name: "Used in migration plans (0 of 1)",
      })
    ).toBeInTheDocument();
  });

  it("says the plans are not available when the server has no endpoint for them", async () => {
    // A backend without the endpoint answers 404 (hand-off doc, step 8).
    useEndpoints({ plans: (_req, res, ctx) => res(ctx.status(404)) });
    renderPage("/skills/1?tab=associations");

    await findTitle();
    const section = (
      await screen.findByRole("heading", { name: "Used in migration plans" })
    ).parentElement?.parentElement as HTMLElement;
    expect(
      await within(section).findByText(
        "This server cannot list the migration plans that use this skill."
      )
    ).toBeInTheDocument();
    expect(within(section).queryByText("Unavailable")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
    // No rows, so no description of them (as on plan Details).
    expect(within(section).queryByText(/Migration plans that get/)).toBeNull();
  });

  it("says Unavailable, not unused, when the plans fail to load", async () => {
    useEndpoints({ plans: (_req, res, ctx) => res(ctx.status(500)) });
    renderPage("/skills/1?tab=associations");

    await findTitle();
    expect(
      await screen.findByRole("heading", { name: "In skill collections (1)" })
    ).toBeInTheDocument();
    // The heading's section: Flex > FlexItem > Title (section.tsx).
    const section = screen.getByRole("heading", {
      name: "Used in migration plans",
    }).parentElement?.parentElement as HTMLElement;
    expect(await within(section).findByText("Unavailable")).toBeInTheDocument();
    expect(within(section).queryByText(/Migration plans that get/)).toBeNull();
    expect(
      screen.queryByText("No migration plan uses this skill.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("grid", { name: "Used in migration plans" })
    ).not.toBeInTheDocument();
  });
});
