import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

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

import { ManageGeneratorsModal } from "../manage-generators-modal";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const mockScopes = { isAdmin: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockScopes.isAdmin,
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

const serveGenerators = (
  resolver: Parameters<typeof rest.get>[1] = (_req, res, ctx) =>
    res(
      ctx.json([
        { id: 1, name: "Container build assets" },
        { id: 2, name: "OpenShift manifests" },
      ])
    )
) => server.use(rest.get("/hub/generators", resolver));

/** Answers PUT /hub/archetypes/1 once `release` is called. */
const holdSaves = (status = 204) => {
  const saved = jest.fn();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  server.use(
    rest.put("/hub/archetypes/1", async (req, res, ctx) => {
      saved(await req.json());
      await gate;
      return res(ctx.status(status));
    })
  );
  return { saved, release: () => release() };
};

const renderModal = (
  current: Archetype = archetype,
  profile: TargetProfile = quarkus
) => {
  const onClose = jest.fn();
  const notifications = createMockNotifications();
  render(
    <NotificationsContext.Provider value={notifications}>
      <MemoryRouter>
        <ManageGeneratorsModal
          archetype={current}
          profile={profile}
          linkTo={(pathname) => pathname}
          onClose={onClose}
        />
      </MemoryRouter>
    </NotificationsContext.Provider>
  );
  return { onClose, notifications };
};

const chosenPane = () =>
  screen.getByText("Chosen").closest(".pf-v6-c-dual-list-selector__pane")!;

beforeEach(() => {
  mockScopes.isAdmin = true;
});

describe("ManageGeneratorsModal", () => {
  it("is named for the profile and starts from its generators", async () => {
    serveGenerators();
    renderModal();

    const dialog = screen.getByRole("dialog", {
      name: "Manage generators for Quarkus 3.x",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Applications in Java EE Application that target Quarkus 3.x get assets from these generators."
    );
    expect(dialog).toHaveClass("pf-m-md");
    // A spinner while the generators load.
    expect(within(dialog).getByRole("progressbar")).toBeInTheDocument();

    const search = await within(dialog).findByLabelText(
      "Search available options"
    );
    await waitFor(() => expect(search).toHaveFocus());
    expect(
      within(dialog).getByRole("group", { name: "Generators" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "More information about generators",
      })
    ).toBeInTheDocument();
    expect(
      within(chosenPane() as HTMLElement).getByText("OpenShift manifests")
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("enables Save only when the set changes", async () => {
    serveGenerators();
    renderModal();

    await userEvent.click(await screen.findByText("Container build assets"));
    const save = screen.getByRole("button", { name: "Save" });
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));
    expect(save).toBeEnabled();
    await userEvent.click(screen.getByText("Container build assets"));
    await userEvent.click(
      screen.getByRole("button", { name: "Remove selected" })
    );
    expect(save).toBeDisabled();
  });

  it("keeps chosen generators the list lacks unless moved out", async () => {
    serveGenerators();
    const { saved, release } = holdSaves();
    release();
    // Deleted since, or never returned by the list.
    const legacy: TargetProfile = {
      ...quarkus,
      generators: [
        { id: 2, name: "OpenShift manifests" },
        { id: 9, name: "Legacy deployment descriptors" },
      ],
    };
    const { onClose } = renderModal(
      { ...archetype, profiles: [legacy, liftAndShift] },
      legacy
    );

    const chosen = await screen.findByText("Legacy deployment descriptors");
    expect(chosenPane()).toContainElement(chosen);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByText("Container build assets"));
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));
    await userEvent.click(save);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: [
          {
            ...legacy,
            generators: [
              { id: 1, name: "Container build assets" },
              { id: 2, name: "OpenShift manifests" },
              { id: 9, name: "Legacy deployment descriptors" },
            ],
          },
          liftAndShift,
        ],
      })
    );
  });

  it("saves only the generators onto the profile as last read", async () => {
    serveGenerators();
    const { saved, release } = holdSaves();
    // Renamed elsewhere since the modal opened.
    const current: Archetype = {
      ...archetype,
      profiles: [{ ...quarkus, name: "Quarkus 3.15" }, liftAndShift],
    };
    const { onClose, notifications } = renderModal(current);

    await userEvent.click(await screen.findByText("Container build assets"));
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));
    const save = screen.getByRole("button", { name: "Save" });
    await userEvent.click(save);

    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({
          profiles: [
            {
              ...quarkus,
              name: "Quarkus 3.15",
              generators: [
                { id: 1, name: "Container build assets" },
                { id: 2, name: "OpenShift manifests" },
              ],
            },
            liftAndShift,
          ],
        })
      )
    );
    // Open and waiting while the save runs.
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Generators for Quarkus 3.x updated",
      variant: "success",
    });
  });

  it("stays open with the selection when the save fails", async () => {
    serveGenerators();
    const { release } = holdSaves(500);
    release();
    const { onClose, notifications } = renderModal();

    await userEvent.click(await screen.findByText("Container build assets"));
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "danger" })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      within(chosenPane() as HTMLElement).getByText("Container build assets")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("says generators could not be loaded and offers only Close", async () => {
    serveGenerators((_req, res, ctx) => res(ctx.status(500)));
    renderModal();

    const alert = await screen.findByText(
      "Generators could not be loaded. Try again later.",
      {},
      { timeout: 5000 }
    );
    expect(alert.closest(".pf-v6-c-alert")).toHaveClass("pf-m-danger");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Close").closest("button")).toHaveClass(
      "pf-m-secondary"
    );
  });

  it("shows generators the empty list lacks so they can be moved out", async () => {
    serveGenerators((_req, res, ctx) => res(ctx.json([])));
    const { saved, release } = holdSaves();
    release();
    const { onClose } = renderModal();

    const stale = await screen.findByText("OpenShift manifests");
    expect(chosenPane()).toContainElement(stale);
    expect(screen.queryByText("No generators yet")).toBeNull();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await userEvent.click(stale);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove selected" })
    );
    await userEvent.click(save);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: [{ ...quarkus, generators: [] }, liftAndShift],
      })
    );
  });

  it("offers the way to the Generators page when none exist", async () => {
    serveGenerators((_req, res, ctx) => res(ctx.json([])));
    renderModal(archetype, liftAndShift);

    expect(await screen.findByText("No generators yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a generator, then add it to OpenShift lift and shift."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to generators" })
    ).toHaveAttribute("href", "/asset-generators");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Close").closest("button")).toHaveClass(
      "pf-m-secondary"
    );
  });

  it("names who creates generators for users who cannot open the page", async () => {
    mockScopes.isAdmin = false;
    serveGenerators((_req, res, ctx) => res(ctx.json([])));
    renderModal(archetype, liftAndShift);

    expect(
      await screen.findByText(
        "An administrator creates generators. Once one exists, add it to OpenShift lift and shift."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to generators" })).toBeNull();
  });
});
