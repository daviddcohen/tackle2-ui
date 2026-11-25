import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Archetype, TargetProfile } from "@app/api/models";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  createMockNotifications,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  CreateTargetProfileModal,
  EditTargetProfileModal,
} from "../target-profile-form";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

const quarkus: TargetProfile = {
  id: 11,
  name: "Quarkus 3.x",
  generators: [{ id: 2, name: "OpenShift manifests" }],
  analysisProfile: { id: 3, name: "Java EE lift and shift" },
};
const liftAndShift: TargetProfile = {
  id: 12,
  name: "OpenShift lift and shift",
  generators: [],
};
const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [quarkus, liftAndShift],
};

/** Answers PUT /hub/archetypes/1 once `release` is called. */
const holdSaves = (status = 204) => {
  const saved = jest.fn();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  server.use(
    rest.put("/hub/archetypes/1", async (req, res, ctx) => {
      saved(await req.json());
      await gate;
      return res(
        ctx.status(status),
        ...(status >= 400 ? [ctx.json({ error: "Conflict on save" })] : [])
      );
    })
  );
  return { saved, release: () => release() };
};

beforeEach(() => {
  server.use(
    rest.get("/hub/generators", (_req, res, ctx) =>
      res(
        ctx.json([
          { id: 1, name: "Container build assets" },
          { id: 2, name: "OpenShift manifests" },
        ])
      )
    ),
    rest.get("/hub/analysis/profiles", (_req, res, ctx) =>
      res(ctx.json([{ id: 3, name: "Java EE lift and shift" }]))
    )
  );
});

const renderWithNotifications = (ui: React.ReactElement) => {
  const notifications = createMockNotifications();
  render(
    <NotificationsContext.Provider value={notifications}>
      {ui}
    </NotificationsContext.Provider>
  );
  return notifications;
};

describe("CreateTargetProfileModal", () => {
  const renderCreate = (onClose = jest.fn()) => ({
    onClose,
    notifications: renderWithNotifications(
      <CreateTargetProfileModal archetype={archetype} onClose={onClose} />
    ),
  });

  it("collects name, generators and analysis profile, and names the next step", async () => {
    renderCreate();

    const dialog = screen.getByRole("dialog", {
      name: "Create target profile",
    });
    expect(dialog).toHaveAccessibleDescription(
      "A target profile is where applications in this archetype are going. After you create it, assign a migration plan to it."
    );
    // A spinner until generators and analysis profiles load.
    const name = await within(dialog).findByRole("textbox", { name: /Name/ });
    await waitFor(() => expect(name).toHaveFocus());
    expect(
      within(dialog).getByRole("group", { name: "Generators" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "More information about generators",
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "More information about analysis profile",
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByPlaceholderText("Select an analysis profile")
    ).toBeInTheDocument();

    const create = within(dialog).getByRole("button", { name: "Create" });
    expect(create).toHaveAttribute("form", "target-profile-form");
    expect(create).toBeDisabled();
  });

  it("validates the name like Rename: unique within the archetype", async () => {
    renderCreate();

    const name = await screen.findByRole("textbox", { name: /Name/ });
    await userEvent.type(name, "Quarkus 3.x");
    expect(
      await screen.findByText("A target profile with this name already exists.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("stays open while it saves, then says so and closes", async () => {
    const { saved, release } = holdSaves();
    const { onClose, notifications } = renderCreate();

    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "JBoss EAP 8 on OpenShift"
    );
    await userEvent.click(screen.getByText("Container build assets"));
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));
    const create = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(create).toBeEnabled());
    await userEvent.click(create);

    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({
          profiles: [
            quarkus,
            liftAndShift,
            {
              id: 0,
              name: "JBoss EAP 8 on OpenShift",
              generators: [{ id: 1, name: "Container build assets" }],
            },
          ],
        })
      )
    );
    expect(create).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Target profile JBoss EAP 8 on OpenShift created",
      variant: "success",
    });
  });

  it("stays open with the input when the save fails", async () => {
    const { release } = holdSaves(409);
    release();
    const { onClose, notifications } = renderCreate();

    const name = await screen.findByRole("textbox", { name: /Name/ });
    await userEvent.type(name, "JBoss EAP 8 on OpenShift");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "danger" })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(name).toHaveValue("JBoss EAP 8 on OpenShift");
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("says when generators cannot be loaded and still creates", async () => {
    server.use(
      rest.get("/hub/generators", (_req, res, ctx) => res(ctx.status(500)))
    );
    renderCreate();

    expect(
      await screen.findByText(
        "Generators could not be loaded. Try again later.",
        {},
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Generators" })).toBeNull();
    await userEvent.type(
      screen.getByRole("textbox", { name: /Name/ }),
      "JBoss EAP 8 on OpenShift"
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create" })).toBeEnabled()
    );
  });
});

describe("EditTargetProfileModal", () => {
  const renderEdit = (current: Archetype = archetype, onClose = jest.fn()) => ({
    onClose,
    notifications: renderWithNotifications(
      <EditTargetProfileModal
        archetype={current}
        profile={quarkus}
        onClose={onClose}
      />
    ),
  });

  it("edits only the name", () => {
    renderEdit();

    const dialog = screen.getByRole("dialog", {
      name: "Rename target profile",
    });
    expect(dialog).toHaveAccessibleDescription(
      "A target profile is where applications in this archetype are going."
    );
    expect(dialog).not.toHaveClass("pf-m-md");
    const name = within(dialog).getByRole("textbox", { name: /Name/ });
    expect(name).toHaveValue("Quarkus 3.x");
    expect(within(dialog).queryByText("Generators")).toBeNull();
    expect(within(dialog).queryByText("Analysis profile")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("validates the name like Create", async () => {
    renderEdit();

    const name = screen.getByRole("textbox", { name: /Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "OpenShift lift and shift");
    expect(
      await screen.findByText("A target profile with this name already exists.")
    ).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, "Qu");
    expect(
      await screen.findByText("This field must contain at least 3 characters.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the name onto the profile as last read, keeping its other fields", async () => {
    const { saved, release } = holdSaves();
    // Generators changed elsewhere since the modal opened.
    const current: Archetype = {
      ...archetype,
      profiles: [
        { ...quarkus, generators: [{ id: 1, name: "Container build assets" }] },
        liftAndShift,
      ],
    };
    const { onClose, notifications } = renderEdit(current);

    const name = screen.getByRole("textbox", { name: /Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Quarkus 3.15");
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({
          profiles: [
            {
              ...quarkus,
              name: "Quarkus 3.15",
              generators: [{ id: 1, name: "Container build assets" }],
            },
            liftAndShift,
          ],
        })
      )
    );
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(onClose).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Target profile renamed to Quarkus 3.15",
      variant: "success",
    });
  });

  it("stays open with the new name when the save fails", async () => {
    const { release } = holdSaves(409);
    release();
    const { onClose, notifications } = renderEdit();

    const name = screen.getByRole("textbox", { name: /Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Quarkus 3.15");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "danger" })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(name).toHaveValue("Quarkus 3.15");
  });
});
