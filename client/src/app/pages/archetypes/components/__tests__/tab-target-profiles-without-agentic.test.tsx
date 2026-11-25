import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

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
  isAgenticEnabled: false,
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
  ],
};

describe("TabTargetProfiles without the agentic API", () => {
  it("keeps the upstream columns and asks for no plans", () => {
    const plansRequested = jest.fn();
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) => {
        plansRequested();
        return res(ctx.json([]));
      })
    );
    render(
      <MemoryRouter>
        <TabTargetProfiles archetype={archetype} />
      </MemoryRouter>
    );

    const table = screen.getByRole("grid", { name: "Target profiles" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["Name", "Generators", "Analysis profile"]);
    expect(within(table).getByText("Java EE to Quarkus")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Each target profile is a migration path for applications in this archetype. A migration plan run picks the target profile, and by default uses the plan assigned to it."
      )
    ).toBeNull();
    expect(plansRequested).not.toHaveBeenCalled();
  });
});
