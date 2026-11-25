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

import { AssignAnalysisProfileModal } from "../assign-analysis-profile-modal";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const quarkus: TargetProfile = {
  id: 11,
  name: "Quarkus 3.x",
  generators: [{ id: 2, name: "OpenShift manifests" }],
  analysisProfile: { id: 3, name: "Java EE to Quarkus" },
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

const serveAnalysisProfiles = (
  resolver: Parameters<typeof rest.get>[1] = (_req, res, ctx) =>
    res(
      ctx.json([
        { id: 3, name: "Java EE to Quarkus" },
        { id: 4, name: "Java EE lift and shift" },
      ])
    )
) => server.use(rest.get("/hub/analysis/profiles", resolver));

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
  profile: TargetProfile = quarkus,
  current: Archetype = archetype
) => {
  const onClose = jest.fn();
  const notifications = createMockNotifications();
  render(
    <NotificationsContext.Provider value={notifications}>
      <MemoryRouter>
        <AssignAnalysisProfileModal
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

const pick = async (name: string) => {
  await userEvent.click(
    screen.getByRole("combobox", { name: "Analysis profile" })
  );
  await userEvent.click(await screen.findByRole("option", { name }));
};

describe("AssignAnalysisProfileModal", () => {
  it("is titled like the menu item and names archetype and profile", async () => {
    serveAnalysisProfiles();
    renderModal(liftAndShift);

    const dialog = screen.getByRole("dialog", {
      name: "Assign analysis profile",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Applications in Java EE Application that target OpenShift lift and shift are analyzed with this analysis profile."
    );
    expect(dialog).toHaveClass("pf-m-sm");
    const input = await within(dialog).findByRole("combobox", {
      name: "Analysis profile",
    });
    await waitFor(() => expect(input).toHaveFocus());
    expect(
      within(dialog).getByRole("button", {
        name: "More information about analysis profile",
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("is titled Change analysis profile when one is set", async () => {
    serveAnalysisProfiles();
    renderModal();

    expect(
      screen.getByRole("dialog", { name: "Change analysis profile" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("combobox", { name: "Analysis profile" })
    ).toHaveValue("Java EE to Quarkus");
  });

  it("keeps a current analysis profile the list lacks until it is changed", async () => {
    serveAnalysisProfiles();
    const { saved, release } = holdSaves();
    release();
    // Deleted since, or never returned by the list.
    const legacy: TargetProfile = {
      ...quarkus,
      analysisProfile: { id: 9, name: "Legacy runtime" },
    };
    const { onClose } = renderModal(legacy, {
      ...archetype,
      profiles: [legacy, liftAndShift],
    });

    expect(
      await screen.findByRole("combobox", { name: "Analysis profile" })
    ).toHaveValue("Legacy runtime");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await pick("Java EE lift and shift");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.clear(
      screen.getByRole("combobox", { name: "Analysis profile" })
    );
    await pick("Legacy runtime");
    await waitFor(() => expect(save).toBeDisabled());

    await pick("Java EE to Quarkus");
    await userEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: [
          {
            ...legacy,
            analysisProfile: { id: 3, name: "Java EE to Quarkus" },
          },
          liftAndShift,
        ],
      })
    );
  });

  it("saves only the analysis profile onto the profile as last read", async () => {
    serveAnalysisProfiles();
    const { saved, release } = holdSaves();
    // Renamed elsewhere since the modal opened.
    const current: Archetype = {
      ...archetype,
      profiles: [{ ...quarkus, name: "Quarkus 3.15" }, liftAndShift],
    };
    const { onClose, notifications } = renderModal(quarkus, current);

    await screen.findByRole("combobox", { name: "Analysis profile" });
    await pick("Java EE lift and shift");
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
              analysisProfile: { id: 4, name: "Java EE lift and shift" },
            },
            liftAndShift,
          ],
        })
      )
    );
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Analysis profile assigned",
      variant: "success",
    });
  });

  it("clears the analysis profile", async () => {
    serveAnalysisProfiles();
    const { saved, release } = holdSaves();
    release();
    const { onClose, notifications } = renderModal();

    await screen.findByRole("combobox", { name: "Analysis profile" });
    await userEvent.click(
      screen.getByRole("button", { name: "Clear input value" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { analysisProfile: _cleared, ...kept } = quarkus;
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ profiles: [kept, liftAndShift] })
    );
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Analysis profile removed",
      variant: "success",
    });
  });

  it("stays open with the selection when the save fails", async () => {
    serveAnalysisProfiles();
    const { release } = holdSaves(500);
    release();
    const { onClose, notifications } = renderModal();

    await screen.findByRole("combobox", { name: "Analysis profile" });
    await pick("Java EE lift and shift");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "danger" })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("combobox", { name: "Analysis profile" })
    ).toHaveValue("Java EE lift and shift");
  });

  it("says analysis profiles could not be loaded and offers only Close", async () => {
    serveAnalysisProfiles((_req, res, ctx) => res(ctx.status(500)));
    renderModal();

    const alert = await screen.findByText(
      "Analysis profiles could not be loaded. Try again later.",
      {},
      { timeout: 5000 }
    );
    expect(alert.closest(".pf-v6-c-alert")).toHaveClass("pf-m-danger");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Close").closest("button")).toHaveClass(
      "pf-m-secondary"
    );
  });

  it("shows a current analysis profile the empty list lacks so it can be removed", async () => {
    serveAnalysisProfiles((_req, res, ctx) => res(ctx.json([])));
    const { saved, release } = holdSaves();
    release();
    const { onClose } = renderModal();

    expect(
      await screen.findByRole("combobox", { name: "Analysis profile" })
    ).toHaveValue("Java EE to Quarkus");
    expect(screen.queryByText("No analysis profiles yet")).toBeNull();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Clear input value" })
    );
    await userEvent.click(save);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { analysisProfile: _cleared, ...kept } = quarkus;
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ profiles: [kept, liftAndShift] })
    );
  });

  it("offers the way to the Analysis profiles page when none exist", async () => {
    serveAnalysisProfiles((_req, res, ctx) => res(ctx.json([])));
    renderModal(liftAndShift);

    expect(
      await screen.findByText("No analysis profiles yet")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create an analysis profile, then assign it to OpenShift lift and shift."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to analysis profiles" })
    ).toHaveAttribute("href", "/analysis-profiles");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
