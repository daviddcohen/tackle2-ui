import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { MigrationPlan, Skill } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { ARCHETYPE_QUERY_KEY } from "@app/queries/archetypes";
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import TargetProfilesPage from "../target-profiles-page";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

const mockGrantedScopes = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [
    {
      id: 11,
      name: "Quarkus 3.x",
      generators: [{ id: 2, name: "OpenShift manifests" }],
      analysisProfile: { id: 1, name: "Java EE to Quarkus" },
    },
    { id: 12, name: "OpenShift lift and shift", generators: [] },
  ],
};

const plans: MigrationPlan[] = [
  {
    id: "1",
    name: "Java EE to Quarkus",
    description: "",
    stages: [],
    migrationPath: {
      archetype: { id: 1, name: "Java EE Application" },
      targetProfiles: [{ id: 11, name: "Quarkus 3.x" }],
      isDefault: true,
    },
  },
];

const skill = (id: string, name: string, profileId: number): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  associations: [
    { scope: "targetProfile", resource: { id: profileId, name: "" } },
  ],
});
const skills = [
  skill("3", "Jakarta EE namespace migration", 11),
  skill("4", "Quarkus best practices", 11),
  skill("5", "Containerization standards", 12),
];

type Resolver = Parameters<typeof rest.get>[1];
const serve = ({
  archetypeResolver = (_req, res, ctx) => res(ctx.json(archetype)),
  plansResolver = (_req, res, ctx) => res(ctx.json(plans)),
  skillsResolver = (_req, res, ctx) => res(ctx.json(skills)),
}: {
  archetypeResolver?: Resolver;
  plansResolver?: Resolver;
  skillsResolver?: Resolver;
} = {}) =>
  server.use(
    rest.get("/hub/archetypes/:id", archetypeResolver),
    rest.get(AGENTIC_ENDPOINTS.plans, plansResolver),
    rest.get(AGENTIC_ENDPOINTS.skills, skillsResolver)
  );

const renderPage = (path = "/archetypes/1/target-profiles") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Route path={DevPaths.archetypeTargetProfiles}>
        <TargetProfilesPage />
      </Route>
    </MemoryRouter>
  );

const row = async (name: string) =>
  (await screen.findByRole("cell", { name })).closest("tr") as HTMLElement;

beforeEach(() => {
  mockGrantedScopes.all = true;
});

describe("TargetProfilesPage", () => {
  it("names the page by its leaf and explains what a profile is", async () => {
    serve();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Target profiles", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A target profile is where applications in this archetype are going. Assign a migration plan to each profile."
      )
    ).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      await within(crumbs).findByRole("link", { name: "Java EE Application" })
    ).toBeInTheDocument();
  });

  it("shows the assigned plan and the profile's skills", async () => {
    serve();
    renderPage();

    const quarkus = await row("Quarkus 3.x");
    expect(
      within(quarkus).getByRole("link", { name: "Java EE to Quarkus" })
    ).toHaveAttribute("href", "/migration-plans/1");
    await userEvent.click(
      within(quarkus).getByRole("button", { name: "2 skills" })
    );
    expect(
      await screen.findByRole("dialog", { name: "Skills for Quarkus 3.x" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", "/skills/4");

    const liftAndShift = await row("OpenShift lift and shift");
    expect(within(liftAndShift).getByText("Not assigned")).toBeInTheDocument();
    // One skill is its name, not "1 skill".
    expect(
      within(liftAndShift).getByRole("link", {
        name: "Containerization standards",
      })
    ).toBeInTheDocument();
  });

  it("keeps the Hub columns and says Unavailable when plans and skills fail", async () => {
    serve({
      plansResolver: (_req, res, ctx) => res(ctx.status(403)),
      skillsResolver: (_req, res, ctx) => res(ctx.status(403)),
    });
    renderPage();

    expect(
      await screen.findByText("Migration plans and skills could not be loaded")
    ).toBeInTheDocument();
    const quarkus = await row("Quarkus 3.x");
    expect(within(quarkus).getAllByText("Unavailable")).toHaveLength(2);
    expect(within(quarkus).getByText("Java EE to Quarkus")).toBeInTheDocument();
    expect(screen.queryByText("Not assigned")).toBeNull();
  });

  it("keeps the rows when a background poll fails (AR8)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    serve();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/archetypes/1/target-profiles"]}>
          <Route path={DevPaths.archetypeTargetProfiles}>
            <TargetProfilesPage />
          </Route>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await row("Quarkus 3.x");

    serve({ archetypeResolver: (_req, res, ctx) => res(ctx.status(500)) });
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: [ARCHETYPE_QUERY_KEY, "1"],
      });
      // Let react-query notify the page before asserting.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(queryClient.getQueryState([ARCHETYPE_QUERY_KEY, "1"])?.status).toBe(
      "error"
    );
    expect(
      screen.getByRole("cell", { name: "Quarkus 3.x" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "OpenShift lift and shift" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/There was an error retrieving data/)).toBeNull();
  });

  it("has no toolbar and no row actions for read-only users (X9)", async () => {
    mockGrantedScopes.all = false;
    serve();
    renderPage();

    await row("Quarkus 3.x");
    expect(
      screen.queryByRole("button", { name: "Create target profile" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Kebab toggle" })).toBeNull();
  });

  it("offers Create target profile in the empty state for writers", async () => {
    serve({
      archetypeResolver: (_req, res, ctx) =>
        res(ctx.json({ ...archetype, profiles: [] })),
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "No target profiles yet" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Create target profile" })
    ).toHaveLength(2);
  });

  it("says profiles appear once created, with no action, for read-only users (X9)", async () => {
    mockGrantedScopes.all = false;
    serve({
      archetypeResolver: (_req, res, ctx) =>
        res(ctx.json({ ...archetype, profiles: [] })),
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "No target profiles yet" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Target profiles appear here once they are created.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Create a target profile/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create target profile" })
    ).toBeNull();
  });

  it("replaces another archetype's drawer at the end of the trail", async () => {
    serve();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/archetypes/1/target-profiles",
            state: {
              breadcrumbs: [
                { title: "Archetypes", path: "/archetypes" },
                {
                  title: ".NET Framework Application",
                  path: "/archetypes?ar:activeItem=2",
                },
              ],
            },
          },
        ]}
      >
        <Route path={DevPaths.archetypeTargetProfiles}>
          <TargetProfilesPage />
        </Route>
      </MemoryRouter>
    );

    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      await within(crumbs).findByRole("link", { name: "Java EE Application" })
    ).toBeInTheDocument();
    expect(
      within(crumbs)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Archetypes", "Java EE Application", "Target profiles"]);
  });

  it("reads 'Archetype not found' for a missing archetype", async () => {
    serve({
      archetypeResolver: (_req, res, ctx) => res(ctx.status(404)),
    });
    renderPage("/archetypes/99/target-profiles");

    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: "Archetype not found" })
        ).toBeInTheDocument(),
      { timeout: 15000 }
    );
    expect(
      screen.getByRole("button", { name: "Back to archetypes" })
    ).toBeInTheDocument();
  }, 20000);
});
