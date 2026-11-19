import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Skill } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { agenticKeys } from "@app/queries/agentic";
import {
  createMockNotifications,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  MANAGE_SKILLS_BUTTON_ID,
  ManageSkillsModal,
  ManageSkillsTarget,
  useCanManageSkills,
} from "./manage-skills-modal";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));
jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

const mockGrantedScopes = { all: true };
jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: () => mockGrantedScopes.all,
}));

const skill = (
  id: string,
  name: string,
  associations: Skill["associations"] = [],
  description = ""
): Skill => ({ id, name, description, sourceType: "inline", associations });

// Archetype 1 and target profile 1 share an id: only the scope tells them apart.
const skills = [
  skill(
    "3",
    "Jakarta EE namespace migration",
    [{ scope: "archetype", resource: { id: 1, name: "Java EE Application" } }],
    "Rename javax packages to jakarta."
  ),
  skill("4", "Quarkus best practices", [
    { scope: "targetProfile", resource: { id: 1, name: "Quarkus 3.x" } },
  ]),
  skill("5", "Corporate coding standards", [
    { scope: "application", resource: { id: 1, name: "Customer Management" } },
  ]),
];

const archetype: ManageSkillsTarget = {
  scope: "archetype",
  id: 1,
  name: "Java EE Application",
};
const targetProfile: ManageSkillsTarget = {
  scope: "targetProfile",
  id: 1,
  name: "Quarkus 3.x",
  archetype: { id: 7, name: "Java EE Application" },
};
const application: ManageSkillsTarget = {
  scope: "application",
  id: 1,
  name: "Customer Management",
};

type Resolver = Parameters<typeof rest.get>[1];
const serveSkills = (resolver: Resolver) =>
  server.use(rest.get(AGENTIC_ENDPOINTS.skills, resolver));

/** Records every PUT body and answers with `status`. */
const servePut = (path: string, status = 204, body?: object) => {
  const requests: unknown[] = [];
  server.use(
    rest.put(path, async (req, res, ctx) => {
      requests.push(await req.json());
      return body
        ? res(ctx.status(status), ctx.json(body))
        : res(ctx.status(status));
    })
  );
  return requests;
};

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 1000 } },
  });

const renderModal = (
  target: ManageSkillsTarget | null,
  queryClient = newQueryClient()
) => {
  const notifications = createMockNotifications();
  const onClose = jest.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationsContext.Provider value={notifications}>
        <MemoryRouter>
          <ManageSkillsModal target={target} onClose={onClose} />
        </MemoryRouter>
      </NotificationsContext.Provider>
    </QueryClientProvider>
  );
  return { notifications, onClose, queryClient };
};

const saveButton = () => screen.getByRole("button", { name: "Save" });

const openPicker = async () =>
  userEvent.click(await screen.findByRole("combobox", { name: "Skills" }));

// Click the option's text, as a user does (the checkbox is inside it).
const toggleOption = async (name: string) =>
  userEvent.click(
    within(await screen.findByRole("listbox")).getByText(name, { exact: true })
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
});

describe("ManageSkillsModal", () => {
  it("renders nothing while closed", () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    renderModal(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the archetype and preselects only its direct skills", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    renderModal(archetype);

    const dialog = await screen.findByRole("dialog", {
      name: "Manage skills for Java EE Application",
    });
    expect(
      within(dialog).getByText(
        "Agents use these skills when they migrate applications in this archetype, unless a migration plan excludes them."
      )
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("button", {
        name: "Remove Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    // Same id, other scope: not this archetype's.
    expect(
      within(dialog).queryByRole("button", {
        name: "Remove Quarkus best practices",
      })
    ).toBeNull();
    expect(
      within(dialog).getByText(
        "Select the skills to associate directly with this archetype. Skills for its target profiles are managed on the target profiles page."
      )
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("announces the description and links the helper to the picker", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    renderModal(archetype);

    const dialog = await screen.findByRole("dialog", {
      name: "Manage skills for Java EE Application",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Agents use these skills when they migrate applications in this archetype, unless a migration plan excludes them."
    );
    expect(
      await screen.findByRole("combobox", { name: "Skills" })
    ).toHaveAccessibleDescription(
      "Select the skills to associate directly with this archetype. Skills for its target profiles are managed on the target profiles page."
    );
  });

  it("refuses to edit when a skill's associations are unknown", async () => {
    serveSkills((_req, res, ctx) =>
      res(
        ctx.json([
          ...skills,
          { ...skill("9", "Unknown usage"), associations: undefined },
        ])
      )
    );
    renderModal(archetype);

    expect(
      await screen.findByText(
        "Skill associations are not available. Try again later."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("lists every skill by name with its description", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    renderModal(archetype);
    await openPicker();

    const options = await screen.findAllByRole("menuitem");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Corporate coding standards",
      "Jakarta EE namespace migrationRename javax packages to jakarta.",
      "Quarkus best practices",
    ]);
  });

  it("enables Save only while the selection differs from the saved set", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    renderModal(archetype);
    await openPicker();

    await toggleOption("Quarkus best practices");
    expect(saveButton()).toBeEnabled();
    await toggleOption("Quarkus best practices");
    expect(saveButton()).toBeDisabled();
  });

  it("sends the whole selected set for an archetype and confirms with a toast", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    const requests = servePut(`${AGENTIC_ENDPOINTS.archetypes}/1/skills`);
    const { notifications, onClose } = renderModal(archetype);
    await openPicker();
    await toggleOption("Corporate coding standards");
    await userEvent.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([{ skills: [{ id: "3" }, { id: "5" }] }]);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Skills for Java EE Application updated",
      variant: "success",
    });
  });

  it("writes a target profile under its archetype and names both", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    const requests = servePut(
      `${AGENTIC_ENDPOINTS.archetypes}/7/target-profiles/1/skills`
    );
    const { notifications } = renderModal(targetProfile);

    expect(
      await screen.findByRole("dialog", {
        name: "Manage skills for Quarkus 3.x (Java EE Application)",
      })
    ).toHaveAccessibleDescription(
      "Agents use these skills when they migrate applications in this archetype that use this target profile, unless a migration plan excludes them."
    );
    expect(
      await screen.findByRole("combobox", { name: "Skills" })
    ).toHaveAccessibleDescription(
      "Select the skills to associate directly with this target profile. Skills for Java EE Application itself are managed on the archetypes page."
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove Quarkus best practices",
      })
    );
    await userEvent.click(saveButton());

    await waitFor(() => expect(requests).toEqual([{ skills: [] }]));
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Skills for Quarkus 3.x (Java EE Application) updated",
      variant: "success",
    });
  });

  it("keeps the dialog and the selection when an application save fails", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    servePut(`${AGENTIC_ENDPOINTS.applications}/1/skills`, 400, {
      message: "Unknown skill id 9.",
    });
    const { notifications, onClose } = renderModal(application);

    expect(
      await screen.findByRole("dialog", {
        name: "Manage skills for Customer Management",
      })
    ).toHaveAccessibleDescription(
      "Agents use these skills when they migrate this application, unless its migration plan excludes them."
    );
    expect(
      await screen.findByRole("combobox", { name: "Skills" })
    ).toHaveAccessibleDescription(
      "Select the skills to associate directly with this application. The Skills tab shows every skill for this application, where it comes from and whether its migration plan excludes it."
    );
    await openPicker();
    await toggleOption("Quarkus best practices");
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith({
        title: "Skills for Customer Management could not be saved",
        message: "Unknown skill id 9.",
        variant: "danger",
      })
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Remove Quarkus best practices" })
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("moves focus back to Save when a save fails", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.archetypes}/1/skills`,
        async (_req, res, ctx) => {
          await answered;
          return res(ctx.status(500), ctx.json({ message: "Failed." }));
        }
      )
    );
    const { notifications } = renderModal(archetype);
    await openPicker();
    await toggleOption("Corporate coding standards");
    await userEvent.click(saveButton());
    // Closing the menu puts focus back in the picker, which the save
    // disables (a browser then drops focus to the page body).
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Skills" })).toBeDisabled()
    );
    expect(screen.getByRole("button", { name: /Save/ })).not.toHaveFocus();

    answer();
    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "danger" })
      )
    );
    await waitFor(() => expect(saveButton()).toHaveFocus());
  });

  it("keeps the form and the selection when a background refetch fails", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    const { queryClient } = renderModal(archetype);
    await openPicker();
    await toggleOption("Quarkus best practices");
    expect(saveButton()).toBeEnabled();

    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    await queryClient.refetchQueries({ queryKey: agenticKeys.list("skills") });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(agenticKeys.list("skills"))?.status
      ).toBe("error")
    );

    expect(
      screen.queryByText("Skills could not be loaded. Try again later.")
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove Quarkus best practices" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("starts from a fresh read, not from cached skills", async () => {
    const queryClient = newQueryClient();
    // The cache says the archetype has no skill; the server says it has one.
    queryClient.setQueryData(
      agenticKeys.list("skills"),
      skills.map((item) => ({ ...item, associations: [] }))
    );
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    serveSkills(async (_req, res, ctx) => {
      await answered;
      return res(ctx.json(skills));
    });
    renderModal(archetype, queryClient);

    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    answer();
    expect(
      await screen.findByRole("button", {
        name: "Remove Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
  });

  it("ignores Escape while a save is running", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.archetypes}/1/skills`,
        async (_req, res, ctx) => {
          await answered;
          return res(ctx.status(204));
        }
      )
    );
    const { onClose } = renderModal(archetype);
    await openPicker();
    await toggleOption("Corporate coding standards");
    await userEvent.click(saveButton());

    // The loading spinner joins the Save button's name. Save is only
    // aria-disabled, so it can still take focus.
    const savingButton = screen.getByRole("button", { name: /Save/ });
    await waitFor(() =>
      expect(savingButton).toHaveAttribute("aria-disabled", "true")
    );
    expect(savingButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    answer();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows a spinner and a disabled Save while skills load", async () => {
    // Held, not delayed forever: an endless MSW delay keeps Jest from exiting.
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    serveSkills(async (_req, res, ctx) => {
      await answered;
      return res(ctx.json(skills));
    });
    renderModal(archetype);

    expect(await screen.findByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Loading"
    );
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    answer();
    expect(
      await screen.findByRole("combobox", { name: "Skills" })
    ).toBeInTheDocument();
  });

  it("says skills could not be loaded and offers only Close", async () => {
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    const { onClose } = renderModal(archetype);

    expect(
      await screen.findByText("Skills could not be loaded. Try again later.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await userEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "Close",
      })[1]
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("points to the skills page when no skill exists", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json([])));
    const { onClose } = renderModal(application);

    expect(
      await screen.findByText(
        "No skills exist yet. Create a skill first, then associate it here."
      )
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Go to skills" });
    expect(link).toHaveAttribute("href", "/skills");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await userEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ManageSkillsModal focus", () => {
  /** A trigger that disappears after a save, as an empty state does. */
  const Placement: React.FC = () => {
    const [target, setTarget] = React.useState<ManageSkillsTarget | null>(null);
    const [isSaved, setIsSaved] = React.useState(false);
    return (
      <QueryClientProvider client={newQueryClient()}>
        <MemoryRouter>
          {isSaved ? (
            <button id={MANAGE_SKILLS_BUTTON_ID}>Manage skills</button>
          ) : (
            <button onClick={() => setTarget(archetype)}>Add skills</button>
          )}
          <ManageSkillsModal
            target={target}
            onClose={() => {
              setIsSaved(true);
              setTarget(null);
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("moves focus to the Manage skills button when the trigger is gone", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json(skills)));
    servePut(`${AGENTIC_ENDPOINTS.archetypes}/1/skills`);
    render(<Placement />);
    await userEvent.click(screen.getByRole("button", { name: "Add skills" }));
    await openPicker();
    await toggleOption("Corporate coding standards");
    await userEvent.click(saveButton());

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Manage skills" })
      ).toHaveFocus()
    );
  });
});

describe("useCanManageSkills", () => {
  it("needs the skill write scope", () => {
    expect(renderHook(() => useCanManageSkills()).result.current).toBe(true);
    mockGrantedScopes.all = false;
    expect(renderHook(() => useCanManageSkills()).result.current).toBe(false);
  });
});
