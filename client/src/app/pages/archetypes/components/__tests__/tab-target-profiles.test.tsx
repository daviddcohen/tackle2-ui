import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { MigrationPlan } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { TabTargetProfiles } from "../tab-target-profiles";

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
    { id: 11, name: "Quarkus 3.x", generators: [] },
    { id: 12, name: "OpenShift lift and shift", generators: [] },
  ],
};

const plan = (
  id: string,
  name: string,
  paths: { archetypeId: number; profileId: number }[]
): MigrationPlan => ({
  id,
  name,
  description: "",
  stages: [],
  migrationPaths: paths.map(({ archetypeId, profileId }) => ({
    archetype: { id: archetypeId, name: String(archetypeId) },
    targetProfile: { id: profileId, name: String(profileId) },
  })),
});

const servePlans = (resolver: Parameters<typeof rest.get>[1]) =>
  server.use(rest.get(AGENTIC_ENDPOINTS.plans, resolver));

const renderTab = (value: Archetype = archetype) =>
  render(
    <MemoryRouter>
      <TabTargetProfiles archetype={value} />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
  mockAgentic.enabled = true;
});

describe("TabTargetProfiles", () => {
  it("lists each profile with the plan it uses", async () => {
    servePlans((_req, res, ctx) =>
      res(
        ctx.json([
          plan("1", "Java EE to Quarkus", [{ archetypeId: 1, profileId: 11 }]),
          // Another archetype's profile uses it, not this archetype's.
          plan("2", "Java lift and shift", [{ archetypeId: 3, profileId: 32 }]),
        ])
      )
    );
    renderTab();

    expect(
      screen.getByText(
        "Each target profile is a migration path for applications in this archetype. A migration plan run picks the target profile, and by default uses the plan assigned to it."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage target profiles" })
    ).toHaveAttribute("href", "/archetypes/1/target-profiles");
    const table = screen.getByRole("grid", { name: "Target profiles" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["Target profile", "Migration plan"]);

    expect(
      await within(table).findByRole("link", { name: "Java EE to Quarkus" })
    ).toHaveAttribute("href", "/migration-plans/1");
    expect(
      within(table).getByRole("link", { name: "Quarkus 3.x" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
    expect(within(table).getByText("Not assigned")).toBeInTheDocument();
    expect(within(table).queryByText("Java lift and shift")).toBeNull();
  });

  it("names a plan shared with another archetype's profile", async () => {
    servePlans((_req, res, ctx) =>
      res(
        ctx.json([
          plan("3", "Java lift and shift", [
            { archetypeId: 1, profileId: 12 },
            { archetypeId: 3, profileId: 32 },
          ]),
        ])
      )
    );
    renderTab();

    const table = screen.getByRole("grid", { name: "Target profiles" });
    expect(
      await within(table).findByRole("link", { name: "Java lift and shift" })
    ).toHaveAttribute("href", "/migration-plans/3");
    expect(
      within(table).getByRole("row", { name: /OpenShift lift and shift/ })
    ).toHaveTextContent("Java lift and shift");
  });

  it("never reads a failed plans query as not assigned", async () => {
    servePlans((_req, res, ctx) => res(ctx.status(403)));
    renderTab();

    expect(await screen.findAllByText("Unavailable")).toHaveLength(2);
    expect(screen.queryByText("Not assigned")).toBeNull();
  });

  it("shows a skeleton, not 'Not assigned', while plans load", () => {
    servePlans((_req, res, ctx) => res(ctx.delay(2000), ctx.json([])));
    renderTab();

    expect(screen.getAllByText("Loading")).toHaveLength(2);
    expect(screen.queryByText("Not assigned")).toBeNull();
  });

  it("has no manage link without the archetype write scope", async () => {
    mockGrantedScopes.all = false;
    servePlans((_req, res, ctx) => res(ctx.json([])));
    renderTab();

    expect(await screen.findAllByText("Not assigned")).toHaveLength(2);
    expect(
      screen.queryByRole("link", { name: "Manage target profiles" })
    ).toBeNull();
  });

  it("explains where profiles come from when there are none", () => {
    servePlans((_req, res, ctx) => res(ctx.json([])));
    renderTab({ ...archetype, profiles: [] });

    expect(
      screen.getByRole("heading", { name: "No target profiles yet", level: 3 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a target profile for where applications in this archetype are going, then assign a migration plan to it."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage target profiles" })
    ).toBeInTheDocument();
  });

  it("says profiles appear once created, with no link, for read-only users", () => {
    mockGrantedScopes.all = false;
    renderTab({ ...archetype, profiles: [] });

    expect(
      screen.getByRole("heading", { name: "No target profiles yet" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Target profiles appear here once they are created.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Create a target profile/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says Not assigned for an analysis profile it lacks, without the agentic API", () => {
    mockAgentic.enabled = false;
    renderTab({
      ...archetype,
      profiles: [
        {
          id: 11,
          name: "Quarkus 3.x",
          generators: [],
          analysisProfile: { id: 1, name: "Java EE to Quarkus" },
        },
        { id: 12, name: "OpenShift lift and shift", generators: [] },
      ],
    });

    const table = screen.getByRole("grid", { name: "Target profiles" });
    expect(
      within(table).getByRole("row", { name: /Quarkus 3.x/ })
    ).toHaveTextContent("Java EE to Quarkus");
    expect(
      within(table).getByRole("row", { name: /OpenShift lift and shift/ })
    ).toHaveTextContent("Not assigned");
  });
});
