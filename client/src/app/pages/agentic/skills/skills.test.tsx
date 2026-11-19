import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { BrowserRouter } from "react-router-dom";

import { Agent, Skill, SkillCollection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { skillCollectionsWriteScopes, skillsWriteScopes } from "@app/scopes";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import SkillsPage from "./skills";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
// setupTests stubs useLocation; the tabs and the tables keep state in the URL.
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockGrantedScopes: { all: boolean; scopes: string[] } = {
  all: true,
  scopes: [],
};
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (required: string[]) =>
    mockGrantedScopes.all ||
    required.some((scope) => mockGrantedScopes.scopes.includes(scope)),
}));

const association = (id: string) => ({
  scope: "agent" as const,
  resource: { id, name: `Agent ${id}` },
});

const skills: Skill[] = [
  {
    id: "1",
    name: "API compatibility checklist",
    description: "Review criteria for external API contracts.",
    sourceType: "inline",
    loadPolicy: "rule",
    associations: [
      ...["1", "2", "3"].map(association),
      {
        scope: "archetype" as const,
        resource: { id: 1, name: "Java EE Application" },
      },
    ],
  },
  {
    id: "2",
    name: "Jakarta EE namespace migration",
    description: "",
    sourceType: "oci",
    associations: [],
  },
  {
    id: "4",
    name: "Unused skill",
    description: "",
    sourceType: "inline",
    associations: [],
  },
  // A real adapter without associations: usage is unknown.
  { id: "3", name: "Unknown usage", description: "", sourceType: "git" },
];

const collections: SkillCollection[] = [
  {
    id: "1",
    name: "Java modernization foundation",
    description: "Focused skills for Java.",
    skills: [
      { id: "1", name: "API compatibility checklist" },
      { id: "2", name: "Jakarta EE namespace migration" },
    ],
  },
  {
    id: "2",
    name: "Single skill pack",
    description: "",
    skills: [{ id: "2", name: "Jakarta EE namespace migration" }],
  },
];

const agents = [
  { id: "1", name: "Code Migrator", skillCollections: [{ id: "1" }] },
  {
    id: "2",
    name: "Migration Proposal Agent",
    skillCollections: [{ id: "1" }],
  },
] as unknown as Agent[];

const useEndpoints = ({
  skillList = skills,
  collectionList = collections,
  collectionsResolver,
}: {
  skillList?: Skill[];
  collectionList?: SkillCollection[];
  collectionsResolver?: Parameters<typeof rest.get>[1];
} = {}) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
      res(ctx.json(skillList))
    ),
    rest.get(
      AGENTIC_ENDPOINTS.skillCollections,
      collectionsResolver ?? ((_req, res, ctx) => res(ctx.json(collectionList)))
    ),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(ctx.json(agents))
    )
  );

// The tables persist to the URL through document.location, so use the
// browser history rather than a MemoryRouter.
const renderAt = (search = "") => {
  window.history.pushState({}, "", `/skills${search}`);
  return render(
    <BrowserRouter>
      <SkillsPage />
    </BrowserRouter>
  );
};

const rowOf = async (name: string) =>
  (await screen.findByRole("link", { name })).closest("tr") as HTMLElement;

describe("SkillsPage", () => {
  afterEach(() => {
    mockGrantedScopes.all = true;
    mockGrantedScopes.scopes = [];
  });

  it("describes the page in attach words", async () => {
    useEndpoints();
    renderAt();

    expect(
      await screen.findByText(
        "Skills give agents migration knowledge. Attach a skill to an agent, archetype, target profile or application, or add it to a skill collection, so agents use it."
      )
    ).toBeInTheDocument();
  });

  it("lists skills with their source, a rule marker and their usage", async () => {
    useEndpoints();
    renderAt();

    expect(
      await screen.findByRole("columnheader", { name: "Usage" })
    ).not.toHaveAttribute("aria-sort");
    const checklist = await rowOf("API compatibility checklist");
    // The tab set has an accessible name, on the tablist itself.
    expect(
      screen.getByRole("tablist", { name: "Skills and skill collections" })
    ).toBeInTheDocument();
    expect(within(checklist).getByText("Inline")).toBeInTheDocument();
    expect(within(checklist).getByText("Always followed")).toBeInTheDocument();
    // Collections come after agents (origin order).
    expect(
      await within(checklist).findByRole("link", {
        name: "3 agents, 1 collection, 1 archetype",
      })
    ).toHaveAttribute("href", "/skills/1?tab=usage");

    const jakarta = await rowOf("Jakarta EE namespace migration");
    expect(within(jakarta).getByText("OCI image")).toBeInTheDocument();
    expect(within(jakarta).queryByText("Always followed")).toBeNull();
    // In collections only: still in use, so not "None".
    expect(
      await within(jakarta).findByRole("link", { name: "2 collections" })
    ).toBeInTheDocument();

    const unknown = await rowOf("Unknown usage");
    expect(within(unknown).getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Java modernization foundation" })
    ).not.toBeInTheDocument();
  });

  it("says None only for a skill with no usage once the collections are known", async () => {
    useEndpoints();
    renderAt();

    const unused = await rowOf("Unused skill");
    expect(await within(unused).findByText("None")).toBeInTheDocument();
  });

  it("shows a skeleton, not None, while the collections load", async () => {
    useEndpoints({ collectionsResolver: () => new Promise(() => {}) });
    renderAt();

    const unused = await rowOf("Unused skill");
    expect(within(unused).getByText("Loading")).toBeInTheDocument();
    expect(within(unused).queryByText("None")).toBeNull();
  });

  it("says Unavailable, not None, when the collections fail", async () => {
    useEndpoints({
      collectionsResolver: (_req, res, ctx) => res(ctx.status(403)),
    });
    renderAt();

    const unused = await rowOf("Unused skill");
    expect(await within(unused).findByText("Unavailable")).toBeInTheDocument();
    expect(within(unused).queryByText("None")).toBeNull();
  });

  it("disables Delete with the reason while the skill is in use", async () => {
    useEndpoints();
    renderAt();
    const user = userEvent.setup();

    const checklist = await rowOf("API compatibility checklist");
    await user.click(
      within(checklist).getByRole("button", { name: "Kebab toggle" })
    );
    const remove = await screen.findByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    // The reason is the item's description and its tooltip on hover.
    expect(remove).toHaveAccessibleDescription(
      "This skill is attached to 3 agents and 1 archetype, and is in 1 skill collection. Remove it from them before deleting it."
    );
    await user.hover(remove);
    expect(
      await screen.findByText(
        "This skill is attached to 3 agents and 1 archetype, and is in 1 skill collection. Remove it from them before deleting it.",
        { selector: '[role="tooltip"] *' }
      )
    ).toBeInTheDocument();
  });

  it("lists skill collections on their tab", async () => {
    useEndpoints();
    renderAt("?tab=collections");

    const foundation = await rowOf("Java modernization foundation");
    expect(
      within(foundation).getByRole("link", { name: "2 skills" })
    ).toHaveAttribute("href", "/skills/collections/1");
    expect(
      await within(foundation).findByRole("link", { name: "2 agents" })
    ).toHaveAttribute("href", "/skills/collections/1#used-by-agents");

    // One object in a cell is its name.
    const single = await rowOf("Single skill pack");
    expect(
      within(single).getByRole("link", {
        name: "Jakarta EE namespace migration",
      })
    ).toHaveAttribute("href", "/skills/2");
    expect(await within(single).findByText("None")).toBeInTheDocument();
  });

  it("shows a skeleton in the Agents cell while agents load", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    useEndpoints();
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, async (_req, res, ctx) => {
        await gate;
        return res(ctx.json(agents));
      })
    );
    renderAt("?tab=collections");

    const single = await rowOf("Single skill pack");
    expect(within(single).getByText("Loading")).toBeInTheDocument();
    expect(within(single).queryByText("None")).not.toBeInTheDocument();
    release();
    expect(await within(single).findByText("None")).toBeInTheDocument();
  });

  it("says Unavailable and blocks Delete when agents fail to load", async () => {
    useEndpoints();
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    renderAt("?tab=collections");
    const user = userEvent.setup();

    const single = await rowOf("Single skill pack");
    // agenticRetry retries a 5xx once after react-query's 1 s back-off.
    expect(
      await within(single).findByText("Unavailable", {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(within(single).queryByText("None")).not.toBeInTheDocument();
    const foundation = await rowOf("Java modernization foundation");
    expect(within(foundation).getByText("Unavailable")).toBeInTheDocument();

    await user.click(
      within(single).getByRole("button", { name: "Kebab toggle" })
    );
    const remove = await screen.findByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    // The reason is the item's description and its tooltip on hover.
    expect(remove).toHaveAccessibleDescription(
      "Usage could not be checked. Try again later."
    );
    await user.hover(remove);
    expect(
      await screen.findByText("Usage could not be checked. Try again later.", {
        selector: '[role="tooltip"] *',
      })
    ).toBeInTheDocument();
  });

  it("shows the create actions in the empty states", async () => {
    useEndpoints({ skillList: [], collectionList: [] });
    renderAt();

    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create a skill, or import one from a Markdown file.")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Create skill" })
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Import skill file" })
    ).toBeInTheDocument();

    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "Skill collections" }));
    expect(
      await screen.findByText("No skill collections yet")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Create skill collection" })
    ).toHaveLength(2);
  });

  describe("without write scopes", () => {
    beforeEach(() => {
      mockGrantedScopes.all = false;
    });

    it("hides create, import and row actions", async () => {
      useEndpoints();
      renderAt();

      await rowOf("API compatibility checklist");
      expect(
        screen.queryByRole("button", { name: "Create skill" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Skill actions" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Kebab toggle" })
      ).not.toBeInTheDocument();
    });

    it("says where skills come from in the empty states", async () => {
      useEndpoints({ skillList: [], collectionList: [] });
      renderAt();

      expect(
        await screen.findByText("Skills appear here once they are created.")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create skill" })
      ).not.toBeInTheDocument();

      await userEvent
        .setup()
        .click(screen.getByRole("tab", { name: "Skill collections" }));
      expect(
        await screen.findByText(
          "Skill collections appear here once they are created."
        )
      ).toBeInTheDocument();
    });

    it("gates each tab on its own scope", async () => {
      mockGrantedScopes.scopes = [...skillCollectionsWriteScopes];
      useEndpoints();
      renderAt();

      await rowOf("API compatibility checklist");
      expect(
        screen.queryByRole("button", { name: "Create skill" })
      ).not.toBeInTheDocument();

      await userEvent
        .setup()
        .click(screen.getByRole("tab", { name: "Skill collections" }));
      expect(
        await screen.findByRole("button", { name: "Create skill collection" })
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: "Kebab toggle" })
        ).toHaveLength(2)
      );
      expect(skillsWriteScopes).not.toEqual(skillCollectionsWriteScopes);
    });
  });
});
