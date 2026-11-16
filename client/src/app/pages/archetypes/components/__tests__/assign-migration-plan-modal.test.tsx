import { MemoryRouter } from "react-router-dom";

import { Archetype } from "@app/api/models";
import { render, screen, within } from "@app/test-config/test-utils";

import { AssignMigrationPlanModal } from "../assign-migration-plan-modal";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const profile = { id: 11, name: "Quarkus 3.x", generators: [] };
const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [profile],
};

describe("AssignMigrationPlanModal", () => {
  it("says plans could not be loaded and offers only Close", () => {
    render(
      <MemoryRouter>
        <AssignMigrationPlanModal
          archetype={archetype}
          profile={profile}
          assignedPlan={undefined}
          eligiblePlans={[]}
          isPlansError
          linkTo={(pathname) => pathname}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog)
        .getByText("Migration plans could not be loaded")
        .closest(".pf-v6-c-alert")
    ).toHaveClass("pf-m-danger");
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(
      within(dialog).queryByRole("link", { name: "Go to migration plans" })
    ).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(dialog).getByText("Close").closest("button")).toHaveClass(
      "pf-m-secondary"
    );
  });
});
