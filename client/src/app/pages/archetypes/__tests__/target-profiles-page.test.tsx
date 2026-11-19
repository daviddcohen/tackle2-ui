import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { MigrationPlan, Skill } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { ARCHETYPE_QUERY_KEY } from "@app/queries/archetypes";
import {
  archetypesWriteScopes,
  plansWriteScopes,
  skillsWriteScopes,
} from "@app/scopes";
import {
  act,
  createMockNotifications,
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

// `denied` withholds single scope groups, such as plansWriteScopes.
const mockGrantedScopes: { all: boolean; denied: readonly string[][] } = {
  all: true,
  denied: [],
};
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (scopes: string[]) =>
    mockGrantedScopes.all && !mockGrantedScopes.denied.includes(scopes),
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

const skill = (
  id: string,
  name: string,
  profileId: number,
  loadPolicy?: Skill["loadPolicy"]
): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  loadPolicy,
  associations: [
    { scope: "targetProfile", resource: { id: profileId, name: "" } },
  ],
});
const skills = [
  skill("3", "Jakarta EE namespace migration", 11),
  skill("4", "Quarkus best practices", 11, "rule"),
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

const renderPage = (
  path = "/archetypes/1/target-profiles",
  notifications = createMockNotifications()
) =>
  render(
    <NotificationsContext.Provider value={notifications}>
      <MemoryRouter initialEntries={[path]}>
        <Route path={DevPaths.archetypeTargetProfiles}>
          <TargetProfilesPage />
        </Route>
      </MemoryRouter>
    </NotificationsContext.Provider>
  );

const openRowAction = async (profile: string, action: string) => {
  await userEvent.click(
    within(await row(profile)).getByRole("button", { name: "Kebab toggle" })
  );
  await userEvent.click(await screen.findByRole("menuitem", { name: action }));
  return screen.findByRole("dialog");
};

const row = async (name: string) =>
  (await screen.findByRole("cell", { name })).closest("tr") as HTMLElement;

beforeEach(() => {
  mockGrantedScopes.all = true;
  mockGrantedScopes.denied = [];
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
    const button = within(quarkus).getByRole("button", {
      name: "2 skills for Quarkus 3.x",
    });
    expect(button).toHaveTextContent("2 skills");
    await userEvent.click(button);
    const popover = await screen.findByRole("dialog", {
      name: "Target profile skills: Quarkus 3.x",
    });
    expect(
      within(popover).getByRole("link", { name: "Quarkus best practices" })
    ).toHaveAttribute("href", "/skills/4");
    // Only the rule carries the marker.
    expect(within(popover).getAllByText("Always followed")).toHaveLength(1);
    // The sentence first, then the list.
    const sentence = within(popover).getByText(
      "Agents use these skills in every stage when they migrate applications in Java EE Application that target this profile, unless a migration plan excludes them."
    );
    expect(
      sentence.compareDocumentPosition(within(popover).getByRole("list")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const liftAndShift = await row("OpenShift lift and shift");
    expect(within(liftAndShift).getByText("Not assigned")).toBeInTheDocument();
    // One skill is its name, not "1 skill".
    expect(
      within(liftAndShift).getByRole("link", {
        name: "Containerization standards",
      })
    ).toBeInTheDocument();
  });

  it("says a later profile's skills reach no agent in its popover", async () => {
    serve({
      skillsResolver: (_req, res, ctx) =>
        res(
          ctx.json([...skills, skill("6", "Database migration patterns", 12)])
        ),
    });
    renderPage();

    const liftAndShift = await row("OpenShift lift and shift");
    await userEvent.click(
      within(liftAndShift).getByRole("button", {
        name: "2 skills for OpenShift lift and shift",
      })
    );
    const popover = await screen.findByRole("dialog", {
      name: "Target profile skills: OpenShift lift and shift",
    });
    expect(
      within(popover).getByText(
        "Applications in Java EE Application use Quarkus 3.x, so agents do not get these skills."
      )
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

  it("keeps the rows when a background poll fails", async () => {
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

  it("orders the row actions and blocks Delete while a plan is assigned", async () => {
    serve();
    renderPage();

    await userEvent.click(
      within(await row("Quarkus 3.x")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Change migration plan",
      "Manage skills",
      "Delete",
    ]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(items[3]).toHaveAttribute("aria-disabled", "true");
  });

  it("opens Manage skills for the profile, named with its archetype", async () => {
    serve();
    renderPage();

    const dialog = await openRowAction("Quarkus 3.x", "Manage skills");
    expect(dialog).toHaveAccessibleName(
      "Manage skills for Quarkus 3.x (Java EE Application)"
    );
    expect(
      await within(dialog).findByRole("button", {
        name: "Remove Quarkus best practices",
      })
    ).toBeInTheDocument();
  });

  it("keeps Manage skills enabled when skills cannot be loaded: the modal says why", async () => {
    serve({ skillsResolver: (_req, res, ctx) => res(ctx.status(403)) });
    renderPage();

    const dialog = await openRowAction("Quarkus 3.x", "Manage skills");
    expect(
      await within(dialog).findByText(
        "Skills could not be loaded. Try again later."
      )
    ).toBeInTheDocument();
  });

  it("keeps the row actions for a user who can only manage skills", async () => {
    mockGrantedScopes.denied = [archetypesWriteScopes, plansWriteScopes];
    serve();
    renderPage();

    await userEvent.click(
      within(await row("Quarkus 3.x")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Manage skills"]);
  });

  it("offers no Manage skills without the skill write scope", async () => {
    mockGrantedScopes.denied = [skillsWriteScopes];
    serve();
    renderPage();

    await userEvent.click(
      within(await row("Quarkus 3.x")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Change migration plan",
      "Delete",
    ]);
  });

  it("offers Assign migration plan and Delete for a profile without a plan", async () => {
    serve();
    renderPage();

    await userEvent.click(
      within(await row("OpenShift lift and shift")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Assign migration plan" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" })
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("disables the plan action and Delete when plans fail", async () => {
    serve({ plansResolver: (_req, res, ctx) => res(ctx.status(403)) });
    renderPage();

    await userEvent.click(
      within(await row("OpenShift lift and shift")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    const assign = await screen.findByRole("menuitem", {
      name: "Assign migration plan",
    });
    expect(assign).toHaveAttribute("aria-disabled", "true");
    // The reason is the item's description and its tooltip on hover.
    expect(assign).toHaveAccessibleDescription(
      "Migration plans are not loaded yet."
    );
    await userEvent.hover(assign);
    expect(
      await screen.findByText("Migration plans are not loaded yet.", {
        selector: '[role="tooltip"] *',
      })
    ).toBeInTheDocument();

    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    // The reason is the item's description and its tooltip on hover.
    expect(remove).toHaveAccessibleDescription(
      "Usage could not be checked. Try again later."
    );
    await userEvent.hover(remove);
    expect(
      await screen.findByText("Usage could not be checked. Try again later.", {
        selector: '[role="tooltip"] *',
      })
    ).toBeInTheDocument();
  });

  it("disables Delete when skills fail, even without a plan", async () => {
    serve({ skillsResolver: (_req, res, ctx) => res(ctx.status(403)) });
    renderPage();

    await userEvent.click(
      within(await row("OpenShift lift and shift")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Assign migration plan" })
    ).not.toHaveAttribute("aria-disabled", "true");
    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    // The reason is the item's description and its tooltip on hover.
    expect(remove).toHaveAccessibleDescription(
      "Usage could not be checked. Try again later."
    );
    await userEvent.hover(remove);
    expect(
      await screen.findByText("Usage could not be checked. Try again later.", {
        selector: '[role="tooltip"] *',
      })
    ).toBeInTheDocument();
  });

  it("offers no plan action without the plans write scope", async () => {
    mockGrantedScopes.denied = [plansWriteScopes];
    serve();
    renderPage();

    await userEvent.click(
      within(await row("Quarkus 3.x")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Manage skills",
      "Delete",
    ]);
    expect(
      screen.getByRole("button", { name: "Create target profile" })
    ).toBeInTheDocument();
  });

  it("offers only the plan action without the archetype write scope", async () => {
    mockGrantedScopes.denied = [archetypesWriteScopes];
    serve();
    renderPage();

    await userEvent.click(
      within(await row("Quarkus 3.x")).getByRole("button", {
        name: "Kebab toggle",
      })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Change migration plan",
      "Manage skills",
    ]);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create target profile" })
    ).toBeNull();
  });

  it("has no toolbar and no row actions for read-only users", async () => {
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

  it("says profiles appear once created, with no action, for read-only users", async () => {
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

  describe("assign migration plan", () => {
    const otherPlan: MigrationPlan = {
      ...plans[0],
      id: "3",
      name: "Java EE lift and shift",
      migrationPath: { ...plans[0].migrationPath!, isDefault: false },
    };

    it("changes the plan with Save, and says so", async () => {
      const notifications = createMockNotifications();
      const saved = jest.fn();
      serve({
        plansResolver: (_req, res, ctx) => res(ctx.json([...plans, otherPlan])),
      });
      server.use(
        rest.put(
          `${AGENTIC_ENDPOINTS.archetypes}/1/target-profiles/11/plan`,
          async (req, res, ctx) => {
            saved(await req.json());
            return res(ctx.status(204));
          }
        )
      );
      renderPage(undefined, notifications);

      const dialog = await openRowAction(
        "Quarkus 3.x",
        "Change migration plan"
      );
      expect(
        within(dialog).getByRole("heading", { name: "Change migration plan" })
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "Applications in Java EE Application that target Quarkus 3.x are migrated with this plan."
        )
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "Only plans for Java EE Application are listed."
        )
      ).toBeInTheDocument();
      const save = within(dialog).getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();

      await userEvent.selectOptions(
        within(dialog).getByRole("combobox", { name: "Migration plan" }),
        "3"
      );
      await userEvent.click(save);

      await waitFor(() => expect(saved).toHaveBeenCalledWith({ planId: "3" }));
      await waitFor(() =>
        expect(notifications.pushNotification).toHaveBeenCalledWith({
          title: "Migration plan assigned",
          variant: "success",
        })
      );
    });

    it("offers the way to plans and only Close when none exist", async () => {
      serve({ plansResolver: (_req, res, ctx) => res(ctx.json([])) });
      renderPage();

      const dialog = await openRowAction(
        "Quarkus 3.x",
        "Assign migration plan"
      );
      expect(
        within(dialog).getByText("No migration plans for Java EE Application")
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("link", { name: "Go to migration plans" })
      ).toHaveAttribute("href", "/migration-plans");
      expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
      // The footer holds one secondary Close.
      expect(within(dialog).getByText("Close").closest("button")).toHaveClass(
        "pf-m-secondary"
      );
    });
  });

  describe("delete target profile", () => {
    it("names the profile and its skills consequence, then confirms with a toast", async () => {
      const notifications = createMockNotifications();
      const updated = jest.fn();
      serve();
      server.use(
        rest.put("/hub/archetypes/1", async (req, res, ctx) => {
          updated(await req.json());
          return res(ctx.status(204));
        })
      );
      renderPage(undefined, notifications);

      const dialog = await openRowAction("OpenShift lift and shift", "Delete");
      expect(
        within(dialog).getByRole("heading", { name: "Delete target profile?" })
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "OpenShift lift and shift will be deleted. The skill attached to it is not deleted, but agents no longer get it from this target profile. This action cannot be undone."
        )
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete" })
      );
      await waitFor(() =>
        expect(updated).toHaveBeenCalledWith(
          expect.objectContaining({ profiles: [archetype.profiles![0]] })
        )
      );
      await waitFor(() =>
        expect(notifications.pushNotification).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Target profile deleted" })
        )
      );
    });

    it("omits the skills sentence when the profile has no skills", async () => {
      serve({ skillsResolver: (_req, res, ctx) => res(ctx.json([])) });
      renderPage();

      const dialog = await openRowAction("OpenShift lift and shift", "Delete");
      expect(
        within(dialog).getByText(
          "OpenShift lift and shift will be deleted. This action cannot be undone."
        )
      ).toBeInTheDocument();
    });
  });
});
