import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { MigrationPlan } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

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

const plan = (id: string, name: string): MigrationPlan => ({
  id,
  name,
  description: "",
  stages: [],
  migrationPaths: [],
});

describe("AssignMigrationPlanModal", () => {
  it("names archetype and profile, focuses the plan and waits while it saves", async () => {
    const saved = jest.fn();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.archetypes}/1/target-profiles/11/plan`,
        async (req, res, ctx) => {
          saved(await req.json());
          await gate;
          return res(ctx.status(204));
        }
      )
    );
    const onClose = jest.fn();
    const notifications = createMockNotifications();
    render(
      <NotificationsContext.Provider value={notifications}>
        <MemoryRouter>
          <AssignMigrationPlanModal
            archetype={archetype}
            profile={profile}
            assignedPlan={undefined}
            plans={[plan("1", "Java EE to Quarkus")]}
            isPlansError={false}
            linkTo={(pathname) => pathname}
            onClose={onClose}
          />
        </MemoryRouter>
      </NotificationsContext.Provider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(
      "Applications in Java EE Application that target Quarkus 3.x are migrated with this plan."
    );
    const select = within(dialog).getByRole("combobox", {
      name: "Migration plan",
    });
    await waitFor(() => expect(select).toHaveFocus());

    await userEvent.selectOptions(select, "1");
    const save = within(dialog).getByRole("button", { name: "Save" });
    await userEvent.click(save);
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ planId: "1" }));

    // Save stays focusable, Cancel and Escape wait for the result.
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).toHaveFocus();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" })
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Migration plan for Quarkus 3.x updated",
      variant: "success",
    });
  });

  it("says plans could not be loaded and offers only Close", () => {
    render(
      <MemoryRouter>
        <AssignMigrationPlanModal
          archetype={archetype}
          profile={profile}
          assignedPlan={undefined}
          plans={[]}
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
