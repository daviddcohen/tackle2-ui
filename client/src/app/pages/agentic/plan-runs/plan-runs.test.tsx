import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { PlanRun } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
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

const run = (id: string, planId: string, planName: string): PlanRun => ({
  id,
  name: `Run #${id}: ${planName}`,
  planId,
  planName,
  applications: [{ id: 1, name: "Customer Management" }],
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

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/plan-runs"]}>
      <PlanRunsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
});

describe("PlanRunsPage", () => {
  it("has the list header and its own name filter placeholder", async () => {
    useRuns([run("1", "1", "Java EE to Quarkus")]);
    renderPage();
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
