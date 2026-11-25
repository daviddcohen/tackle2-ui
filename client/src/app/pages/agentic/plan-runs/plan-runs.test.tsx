import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { BrowserRouter, MemoryRouter } from "react-router-dom";

import { PlanRun } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { ARCHETYPES_QUERY_KEY } from "@app/queries/archetypes";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import PlanRunsPage from "./plan-runs";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
// setupTests stubs useLocation; the list's URL state needs the real one.
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockGrantedScopes = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const run = (
  id: string,
  planId: string,
  planName: string,
  applications: PlanRun["applications"] = [
    { id: 1, name: "Customer Management" },
  ]
): PlanRun => ({
  id,
  name: `Run #${id}: ${planName}`,
  planId,
  planName,
  applications,
  status: "Running",
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns: [],
});

const useRuns = (runs: PlanRun[]) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) =>
      res(ctx.json(runs))
    )
  );

// Hub computes membership; Document Preview Service is in no archetype.
const archetypes: Partial<Archetype>[] = [
  {
    id: 2,
    name: "Spring Boot Application",
    applications: [{ id: 4, name: "Order Service" }],
  },
  {
    id: 1,
    name: "Java EE Application",
    applications: [
      { id: 1, name: "Customer Management" },
      { id: 7, name: "Partner Portal" },
    ],
  },
  { id: 5, name: "Node.js Service", applications: [] },
];

const useArchetypes = (response = archetypes) =>
  server.use(
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json(response)))
  );

/**
 * The list opened at its URL state: it merges through document.location, so
 * a browser router keeps the two the same. With `queryClient`, that client
 * (retries, cached data) instead of the test default.
 */
const renderList = (
  filters: Record<string, string[]>,
  queryClient?: QueryClient
) => {
  window.history.replaceState(
    {},
    "",
    `/plan-runs?planRuns:filters=${encodeURIComponent(JSON.stringify(filters))}`
  );
  const page = (
    <BrowserRouter>
      <PlanRunsPage />
    </BrowserRouter>
  );
  return render(
    queryClient ? (
      <QueryClientProvider client={queryClient}>{page}</QueryClientProvider>
    ) : (
      page
    )
  );
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/plan-runs"]}>
      <PlanRunsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
  useArchetypes();
});

afterEach(() => window.history.replaceState({}, "", "/"));

describe("PlanRunsPage", () => {
  it("has the list header and its own name filter placeholder", async () => {
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    renderPage();
    // Opened from the sidebar: no trail.
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Plan runs" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Each plan run applies a migration plan to one or more applications."
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText("Filter by run name")
    ).toBeInTheDocument();
  });

  it("filters by migration plan, with one option per plan", async () => {
    useRuns([
      run("1", "1", "Java EE to Quarkus"),
      run("2", "2", "Spring Boot to Quarkus"),
      run("3", "1", "Java EE to Quarkus"),
    ]);
    renderPage();
    await screen.findByRole("link", {
      name: "Run #2: Spring Boot to Quarkus",
    });

    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Migration plan" })
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: "Type to filter" })
    );
    const options = screen.getAllByRole("menuitem");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Java EE to Quarkus",
      "Spring Boot to Quarkus",
    ]);
    await userEvent.click(within(options[1]).getByRole("checkbox"));

    const table = screen.getByRole("grid", { name: "Plan runs" });
    await waitFor(() =>
      expect(
        within(table).getAllByRole("link", { name: /^Run #/ })
      ).toHaveLength(1)
    );
    expect(
      within(table).getByRole("link", {
        name: "Run #2: Spring Boot to Quarkus",
      })
    ).toBeInTheDocument();
  });

  it("filters by archetype: runs with any application in it", async () => {
    useRuns([
      run("1", "1", "Java EE to Quarkus"),
      run("2", "2", "Spring Boot to Quarkus", [
        { id: 4, name: "Order Service" },
      ]),
      // One plan for applications of two archetypes: it counts for both.
      run("3", "3", "Java EE lift and shift", [
        { id: 7, name: "Partner Portal" },
        { id: 4, name: "Order Service" },
      ]),
      run("4", "4", "Node.js runtime", [
        { id: 19, name: "Document Preview Service" },
      ]),
    ]);
    renderPage();
    const table = await screen.findByRole("grid", { name: "Plan runs" });
    await within(table).findByRole("link", { name: /^Run #4/ });

    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archetype" }));
    await userEvent.click(
      screen.getByRole("combobox", { name: "Type to filter" })
    );
    // Only archetypes that some run touches, by name.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("menuitem")
          .map((option) => option.textContent?.trim())
      ).toEqual(["Java EE Application", "Spring Boot Application"])
    );
    await userEvent.click(
      within(screen.getAllByRole("menuitem")[0]).getByRole("checkbox")
    );

    await waitFor(() =>
      expect(
        within(table)
          .getAllByRole("link", { name: /^Run #/ })
          .map((link) => link.textContent)
      ).toEqual([
        "Run #1: Java EE to Quarkus",
        "Run #3: Java EE lift and shift",
      ])
    );
  });

  it("opens filtered by the archetype in the URL", async () => {
    useRuns([
      run("1", "1", "Java EE to Quarkus"),
      run("2", "2", "Spring Boot to Quarkus", [
        { id: 4, name: "Order Service" },
      ]),
    ]);
    renderList({ archetype: ["2"] });
    const table = await screen.findByRole("grid", { name: "Plan runs" });
    await waitFor(() =>
      expect(
        within(table)
          .getAllByRole("link", { name: /^Run #/ })
          .map((link) => link.textContent)
      ).toEqual(["Run #2: Spring Boot to Quarkus"])
    );
  });

  it("shows the inventory's trail when opened from its View plan runs toast", async () => {
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/plan-runs",
            state: {
              breadcrumbs: [
                { title: "Application inventory", path: "/applications" },
              ],
            },
          },
        ]}
      >
        <PlanRunsPage />
      </MemoryRouter>
    );
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(trail).getByRole("link", { name: "Application inventory" })
    ).toHaveAttribute("href", "/applications");
    expect(within(trail).getByText("Plan runs")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Run #1: Java EE to Quarkus" })
    ).toBeInTheDocument();
  });

  describe("a selected archetype the runs do not offer", () => {
    // Run 1 is on Customer Management (Java EE); Node.js has no runs.
    const runs = [run("1", "1", "Java EE to Quarkus")];
    const runLinks = () =>
      within(screen.getByRole("grid", { name: "Plan runs" })).queryAllByRole(
        "link",
        { name: /^Run #/ }
      );

    it.each([
      ["an archetype without runs, by its Hub name", "5", "Node.js Service"],
      ["an archetype the Hub does not know, by id", "99", "#99"],
    ])("keeps a chip for %s, and clears it", async (_case, id, chip) => {
      useRuns(runs);
      renderList({ archetype: [id] });
      expect(await screen.findByText("No results found")).toBeInTheDocument();
      expect(screen.getByText(chip)).toBeInTheDocument();
      expect(runLinks()).toHaveLength(0);

      await userEvent.click(
        screen.getAllByRole("button", { name: "Clear all filters" })[0]
      );
      await waitFor(() => expect(runLinks()).toHaveLength(1));
      expect(screen.queryByText(chip)).not.toBeInTheDocument();
    });
  });

  it("keeps the archetypes it has when a refresh fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData([ARCHETYPES_QUERY_KEY], archetypes);
    const refreshed = jest.fn();
    server.use(
      rest.get("/hub/archetypes", (_req, res, ctx) => {
        refreshed();
        return res(ctx.status(500));
      })
    );
    useRuns([
      run("1", "1", "Java EE to Quarkus"),
      run("2", "2", "Spring Boot to Quarkus", [
        { id: 4, name: "Order Service" },
      ]),
    ]);
    renderList({ archetype: ["1"] }, queryClient);
    await waitFor(() => expect(refreshed).toHaveBeenCalled());
    await waitFor(() =>
      expect(queryClient.getQueryState([ARCHETYPES_QUERY_KEY])?.status).toBe(
        "error"
      )
    );
    const table = screen.getByRole("grid", { name: "Plan runs" });
    expect(
      within(table)
        .getAllByRole("link", { name: /^Run #/ })
        .map((link) => link.textContent)
    ).toEqual(["Run #1: Java EE to Quarkus"]);
    queryClient.clear();
  });

  describe("while the archetypes load", () => {
    let release: () => void = () => undefined;
    beforeEach(() => {
      const answered = new Promise<void>((resolve) => (release = resolve));
      server.use(
        rest.get("/hub/archetypes", async (_req, res, ctx) => {
          await answered;
          return res(ctx.json(archetypes));
        })
      );
      useRuns([run("1", "1", "Java EE to Quarkus")]);
    });
    afterEach(() => release());

    it("lists the runs without waiting for them", async () => {
      renderList({});
      expect(
        await screen.findByRole("link", { name: "Run #1: Java EE to Quarkus" })
      ).toBeInTheDocument();
    });

    it("filtered by archetype, waits for them instead of listing every run", async () => {
      renderList({ archetype: ["1"] });
      const table = screen.getByRole("grid", { name: "Plan runs" });
      // The runs have arrived; the filter cannot be applied yet.
      await waitFor(() =>
        expect(within(table).getByRole("progressbar")).toBeInTheDocument()
      );
      expect(
        within(table).queryByRole("link", { name: /^Run #/ })
      ).not.toBeInTheDocument();
      release();
      expect(
        await within(table).findByRole("link", {
          name: "Run #1: Java EE to Quarkus",
        })
      ).toBeInTheDocument();
    });
  });

  it("filtered by archetype, stops waiting after the first failed attempt, not its retries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 3, retryDelay: 60_000 } },
    });
    server.use(
      rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.status(500)))
    );
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    renderList({ archetype: ["1"] }, queryClient);
    // Retrying (the next attempt is a minute away): the chip says why the
    // list is empty, with the id the Hub has not named yet.
    expect(await screen.findByText("No results found")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    queryClient.clear();
  });

  it("still lists the runs when the archetypes cannot be read", async () => {
    server.use(
      rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.status(500)))
    );
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    renderPage();
    const row = await screen.findByRole("row", { name: /Run #1/ });
    expect(row).toHaveTextContent("Customer Management");
  });

  it("orders the status options with the runs that need a person first", async () => {
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    renderPage();
    await screen.findByRole("link", { name: "Run #1: Java EE to Quarkus" });

    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Status" }));
    await userEvent.click(
      screen.getByRole("combobox", { name: "Type to filter" })
    );
    expect(
      screen
        .getAllByRole("menuitem")
        .map((option) => option.textContent?.trim())
    ).toEqual(["Action required", "Failed", "Running", "Pending", "Succeeded"]);
  });

  it("keeps the toolbar and table while the list loads", async () => {
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    renderPage();
    // Before the response: the toolbar and a spinner row, not a page spinner.
    expect(
      screen.getByPlaceholderText("Filter by run name")
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("grid")).getByRole("progressbar")
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Run #1: Java EE to Quarkus" })
    ).toBeInTheDocument();
  });

  it("points an empty list to the application inventory", async () => {
    useRuns([]);
    renderPage();
    expect(await screen.findByText("No plan runs yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Plan runs appear here when you run a migration plan on applications."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to application inventory" })
    ).toHaveAttribute("href", "/applications");
  });

  it("says only where runs come from without the scope to run a plan", async () => {
    mockGrantedScopes.all = false;
    useRuns([]);
    renderPage();
    expect(await screen.findByText("No plan runs yet")).toBeInTheDocument();
    expect(
      screen.getByText("Plan runs appear here once they are created.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Go to application inventory" })
    ).not.toBeInTheDocument();
  });
});
