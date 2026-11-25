import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter, Route } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { render, screen, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import TargetProfilesPage from "../target-profiles-page";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: false,
}));
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => true,
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
    },
  ],
};

describe("TargetProfilesPage without the agentic API", () => {
  it("keeps the generators and analysis profile actions", async () => {
    server.use(
      rest.get("/hub/archetypes/:id", (_req, res, ctx) =>
        res(ctx.json(archetype))
      ),
      rest.get("/hub/generators", (_req, res, ctx) =>
        res(ctx.json([{ id: 2, name: "OpenShift manifests" }]))
      )
    );
    render(
      <MemoryRouter initialEntries={["/archetypes/1/target-profiles"]}>
        <Route path={DevPaths.archetypeTargetProfiles}>
          <TargetProfilesPage />
        </Route>
      </MemoryRouter>
    );

    const row = (await screen.findByRole("cell", { name: "Quarkus 3.x" }))
      .parentElement as HTMLElement;
    await userEvent.click(
      within(row).getByRole("button", { name: "Kebab toggle" })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Manage generators",
      "Assign analysis profile",
      "Delete",
    ]);

    await userEvent.click(items[1]);
    expect(
      await screen.findByRole("dialog", {
        name: "Manage generators for Quarkus 3.x",
      })
    ).toBeInTheDocument();
  });
});
