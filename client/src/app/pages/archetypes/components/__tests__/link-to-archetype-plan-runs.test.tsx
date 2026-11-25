import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { PlanRun } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { TabDetailsContent } from "../tab-details-content";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockAgentic = { enabled: true };
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  get isAgenticEnabled() {
    return mockAgentic.enabled;
  },
}));

const javaEe: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  applications: [
    { id: 1, name: "Customer Management" },
    { id: 7, name: "Partner Portal" },
  ],
};

const run = (id: string, applications: PlanRun["applications"]): PlanRun => ({
  id,
  name: `Run #${id}`,
  planId: "1",
  planName: "Java EE to Quarkus",
  applications,
  status: "Running",
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns: [],
});

const useRuns = (runs: PlanRun[]) => {
  const requested = jest.fn();
  server.use(
    rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) => {
      requested();
      return res(ctx.json(runs));
    })
  );
  return requested;
};

const renderDetails = (archetype = javaEe) =>
  render(
    <MemoryRouter initialEntries={["/archetypes?ar:activeItem=1"]}>
      <TabDetailsContent archetype={archetype} />
    </MemoryRouter>
  );

beforeEach(() => {
  mockAgentic.enabled = true;
  // The Applications link names the selected archetype in its trail.
  server.use(
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json([javaEe])))
  );
});

describe("Archetype details: Plan runs", () => {
  it("counts the runs with an application of the archetype and links to them", async () => {
    useRuns([
      run("1", [{ id: 1, name: "Customer Management" }]),
      run("2", [{ id: 4, name: "Order Service" }]),
      run("3", [
        { id: 4, name: "Order Service" },
        { id: 7, name: "Partner Portal" },
      ]),
    ]);
    renderDetails();

    const link = await screen.findByRole("link", { name: "2 plan runs" });
    const href = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect(href.pathname).toBe("/plan-runs");
    expect(JSON.parse(href.searchParams.get("planRuns:filters") ?? "")).toEqual(
      { archetype: ["1"] }
    );
  });

  it("reads None when no run includes its applications", async () => {
    useRuns([run("2", [{ id: 4, name: "Order Service" }])]);
    renderDetails();
    const group = screen.getByText("Plan runs").closest("div");
    expect(group).not.toBeNull();
    await waitFor(() => expect(group).toHaveTextContent("Plan runsNone"));
    expect(screen.queryByRole("link", { name: /plan run/ })).toBeNull();
  });

  it("says Unavailable when the runs cannot be read", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.planRuns, (_req, res, ctx) =>
        res(ctx.status(403))
      )
    );
    renderDetails();
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  });

  it("is left out, and asks for no runs, without the agentic API", () => {
    const requested = useRuns([]);
    mockAgentic.enabled = false;
    renderDetails();
    expect(screen.queryByText("Plan runs")).toBeNull();
    expect(requested).not.toHaveBeenCalled();
  });
});
