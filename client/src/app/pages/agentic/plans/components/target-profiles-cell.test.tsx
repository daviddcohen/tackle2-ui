import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { PlanTargetProfile } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { TargetProfilesCell } from "./target-profiles-cell";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const javaEe = { id: 1, name: "Java EE Application" };
const springBoot = { id: 2, name: "Spring Boot Application" };

const quarkus: PlanTargetProfile = {
  archetype: javaEe,
  targetProfile: { id: 11, name: "Quarkus 3.x" },
};
const openLiberty: PlanTargetProfile = {
  archetype: javaEe,
  targetProfile: { id: 12, name: "Open Liberty" },
};
const springBoot3: PlanTargetProfile = {
  archetype: springBoot,
  targetProfile: { id: 21, name: "Spring Boot 3" },
};

const renderCell = (targetProfiles: PlanTargetProfile[]) =>
  render(
    <MemoryRouter>
      <TargetProfilesCell
        planName="Java to Quarkus"
        targetProfiles={targetProfiles}
        linkTo={(pathname) => pathname}
      />
    </MemoryRouter>
  );

describe("TargetProfilesCell", () => {
  it("says Not assigned without target profiles", () => {
    renderCell([]);
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows one target profile with its archetype, linking only the profile", () => {
    const { container } = renderCell([quarkus]);
    expect(container).toHaveTextContent("Quarkus 3.x (Java EE Application)");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Quarkus 3.x" })).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
  });

  it("counts target profiles of several archetypes and lists them in a popover", async () => {
    const user = userEvent.setup();
    renderCell([openLiberty, quarkus, springBoot3]);
    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "3 target profiles" }));
    const popover = await screen.findByRole("dialog", {
      name: "Target profiles using Java to Quarkus",
    });
    // In the order given, each written like the single case.
    expect(
      within(popover)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Open Liberty (Java EE Application)",
      "Quarkus 3.x (Java EE Application)",
      "Spring Boot 3 (Spring Boot Application)",
    ]);
    expect(
      within(popover).getByRole("link", { name: "Spring Boot 3" })
    ).toHaveAttribute(
      "href",
      "/archetypes/2/target-profiles#target-profile-21"
    );
    expect(
      within(popover).getByRole("button", { name: "Close" })
    ).toBeInTheDocument();
  });
});
