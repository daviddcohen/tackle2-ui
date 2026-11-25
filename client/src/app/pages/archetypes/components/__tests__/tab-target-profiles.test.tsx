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
    { id: 11, name: "Quarkus 3.x", generators: [] },
    { id: 12, name: "OpenShift lift and shift", generators: [] },
  ],
};

const plan = (
  id: string,
  name: string,
  profileIds: number[],
  isDefault = true
): MigrationPlan => ({
  id,
  name,
  description: "",
  stages: [],
  migrationPath: {
    archetype: { id: 1, name: "Java EE Application" },
    targetProfiles: profileIds.map((profileId) => ({
      id: profileId,
      name: String(profileId),
    })),
    isDefault,
  },
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
});

describe("TabTargetProfiles", () => {
  it("lists each profile with only its assigned (default) plan", async () => {
    servePlans((_req, res, ctx) =>
      res(
        ctx.json([
          plan("1", "Java EE to Quarkus", [11]),
          plan("2", "Not the default", [12], false),
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
    expect(within(table).queryByText("Not the default")).toBeNull();
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
});
