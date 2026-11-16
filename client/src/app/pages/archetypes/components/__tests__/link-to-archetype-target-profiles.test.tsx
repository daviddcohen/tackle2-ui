import { MemoryRouter } from "react-router-dom";

import { Archetype, TargetProfile } from "@app/api/models";
import { render, screen } from "@app/test-config/test-utils";

import LinkToArchetypeTargetProfiles from "../link-to-archetype-target-profiles";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const profile = (id: number, name: string): TargetProfile => ({
  id,
  name,
  generators: [],
});

const nodeService: Archetype = {
  id: 5,
  name: "Node.js Service",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
};

const renderCell = (profiles: TargetProfile[]) =>
  render(
    <MemoryRouter>
      <LinkToArchetypeTargetProfiles
        archetype={{ ...nodeService, profiles }}
        linkTo={(pathname) => pathname}
      />
    </MemoryRouter>
  );

describe("LinkToArchetypeTargetProfiles", () => {
  it("links several profiles as a count to the target profiles page", () => {
    renderCell([profile(51, "A"), profile(52, "B")]);
    expect(
      screen.getByRole("link", { name: "2 target profiles" })
    ).toHaveAttribute("href", "/archetypes/5/target-profiles");
  });

  it("links one profile by its name to its row", () => {
    renderCell([profile(51, "Node.js 22 on OpenShift")]);
    expect(
      screen.getByRole("link", { name: "Node.js 22 on OpenShift" })
    ).toHaveAttribute(
      "href",
      "/archetypes/5/target-profiles#target-profile-51"
    );
  });

  it("reads None without profiles", () => {
    renderCell([]);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
