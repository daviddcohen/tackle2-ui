import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Archetype, TargetProfile } from "@app/api/models";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import TargetProfileForm from "../target-profile-form";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [{ id: 11, name: "Quarkus 3.x", generators: [] }],
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

const renderForm = (
  props: Partial<React.ComponentProps<typeof TargetProfileForm>> = {}
) => {
  const onSave = jest.fn();
  render(
    <TargetProfileForm
      isOpen
      archetype={archetype}
      onCancel={jest.fn()}
      onSave={onSave}
      {...props}
    />
  );
  return { onSave };
};

describe("TargetProfileForm", () => {
  it("renders nothing while closed (AR2)", () => {
    renderForm({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the next step and keeps the buttons in the footer", async () => {
    const { onSave } = renderForm();

    // The modal shows a spinner until generators and analysis profiles load.
    await screen.findByRole("button", {
      name: "More information about generators",
    });
    const dialog = screen.getByRole("dialog", {
      name: "Create target profile",
    });
    expect(
      within(dialog).getByText(
        "A target profile is where applications in this archetype are going. After you create it, assign a migration plan to it."
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "More information about analysis profile",
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Available")).toBeInTheDocument();
    expect(within(dialog).getByText("Chosen")).toBeInTheDocument();
    expect(
      within(dialog).getByPlaceholderText("Select an analysis profile")
    ).toBeInTheDocument();
    expect(
      dialog.querySelector("[aria-label='Analysis profile']")
    ).toBeInTheDocument();

    const create = within(dialog).getByRole("button", { name: "Create" });
    expect(create).toHaveAttribute("form", "target-profile-form");
    expect(create).toBeDisabled();

    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "JBoss EAP 8 on OpenShift"
    );
    await waitFor(() => expect(create).toBeEnabled());
    await userEvent.click(create);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: "JBoss EAP 8 on OpenShift" })
      )
    );
  });

  it("is titled Edit target profile and saves with Save", async () => {
    renderForm({
      profile: archetype.profiles![0] as TargetProfile,
    });
    await screen.findByRole("button", { name: "Save" });
    const dialog = screen.getByRole("dialog", {
      name: "Edit target profile",
    });
    expect(
      within(dialog).getByText(
        "A target profile is where applications in this archetype are going."
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
