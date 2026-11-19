import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Skill, SkillCollection, SkillRequest } from "@app/agentic";
import { hub } from "@app/api/rest";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { agenticKeys } from "@app/queries/agentic";
import {
  act,
  createMockNotifications,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { SkillForm, SkillModal } from "./skill-form";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const mockGrantedScopes = { agents: true, collections: true };
jest.mock("@app/auth", () => {
  const scopes = jest.requireActual("@app/scopes");
  return {
    ...jest.requireActual("@app/auth"),
    useHasSomeScopes: (required: string[]) =>
      required === scopes.agentsWriteScopes
        ? mockGrantedScopes.agents
        : required === scopes.skillCollectionsWriteScopes
          ? mockGrantedScopes.collections
          : true,
  };
});

const skill: Skill = {
  id: "1",
  name: "Spring Boot to Quarkus migration",
  description: "Guidance.",
  sourceType: "inline",
  content: "# Spring Boot to Quarkus",
  associations: [
    { scope: "agent", resource: { id: "2", name: "Code Migrator" } },
    { scope: "targetProfile", resource: { id: 11, name: "Quarkus 3.x" } },
  ],
};

const collections: SkillCollection[] = [
  {
    id: "1",
    name: "Java modernization foundation",
    description: "",
    skills: [{ id: "1", name: skill.name }],
  },
];

const archetypes = [
  {
    id: 1,
    name: "Spring Boot Application",
    profiles: [{ id: 11, name: "Quarkus 3.x" }],
  },
  {
    id: 2,
    name: "Legacy Java Application",
    profiles: [{ id: 32, name: "Java 17 on RHEL" }],
  },
];

let updated: SkillRequest[];

beforeEach(() => {
  mockGrantedScopes.agents = true;
  mockGrantedScopes.collections = true;
  updated = [];
  server.use(
    rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
      res(ctx.json([skill]))
    ),
    rest.put(`${AGENTIC_ENDPOINTS.skills}/:id`, async (req, res, ctx) => {
      const body = await req.json();
      updated.push(body);
      return res(ctx.json({ ...skill, ...body }));
    }),
    rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
      res(ctx.json(collections))
    ),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(
        ctx.json([
          { id: "2", name: "Code Migrator" },
          { id: "3", name: "Test Runner" },
        ])
      )
    ),
    rest.get("/hub/archetypes", (_req, res, ctx) => res(ctx.json(archetypes))),
    rest.get(hub`/applications`, (_req, res, ctx) => res(ctx.json([])))
  );
});

describe("SkillForm", () => {
  it("creates with a description and the association fields visible", async () => {
    render(<SkillForm skill={null} onClose={jest.fn()} />);

    expect(screen.getByText("Create skill")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A skill gives agents migration knowledge from inline Markdown, a Git repository or an OCI image."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Associations")).toBeInTheDocument();
    for (const id of [
      "skill-agents",
      "skill-archetypes",
      "skill-target-profiles",
      "skill-applications",
    ]) {
      expect(document.querySelector(`#${id}-input`)).toBeVisible();
    }
    expect(
      screen.queryByText(/Changes apply wherever it is used/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("warns on edit and shows the associations with one chip per value", async () => {
    render(<SkillForm skill={skill} onClose={jest.fn()} />);

    expect(
      await screen.findByText(
        "This skill has 2 associations and is in 1 skill collection. Changes apply wherever it is used."
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Quarkus 3.x (Spring Boot Application)")
    ).toBeInTheDocument();
    expect(screen.getByText("Code Migrator")).toBeInTheDocument();
  });

  it("offers every target profile of every archetype", async () => {
    const user = userEvent.setup();
    render(<SkillForm skill={skill} onClose={jest.fn()} />);

    await screen.findByText("Quarkus 3.x (Spring Boot Application)");
    await user.click(
      document.querySelector<HTMLInputElement>("#skill-target-profiles-input")!
    );
    expect(
      await screen.findByText("Java 17 on RHEL (Legacy Java Application)")
    ).toBeInTheDocument();
  });

  it("keeps the agents and sends them back without agent write access", async () => {
    mockGrantedScopes.agents = false;
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<SkillForm skill={skill} onClose={onClose} />);

    expect(
      screen.getByText(
        "You need permission to edit agents to change this field."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Code Migrator")).toBeInTheDocument();
    // PF marks the disabled typeahead toggle; its chips stay visible.
    expect(
      document
        .querySelector("#skill-agents-input")
        ?.closest(".pf-v6-c-menu-toggle")
    ).toHaveClass("pf-m-disabled");

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    // Blur first: validation on blur briefly disables Save.
    await user.tab();
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    // jsdom does not submit through the footer button's `form` attribute.
    expect(save).toHaveAttribute("form", "skill-form");
    fireEvent.submit(document.getElementById("skill-form")!);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updated[0].associations).toEqual([
      { scope: "agent", resource: { id: "2" } },
      { scope: "targetProfile", resource: { id: 11 } },
    ]);
  });
});

describe("SkillForm skill collections", () => {
  // Skill 1 is the only member of collection 1 (locked), one of two members
  // of collection 2, not in 3; collection 4 is operator-managed.
  const memberships: SkillCollection[] = [
    {
      id: "1",
      name: "Java modernization foundation",
      description: "",
      skills: [{ id: "1", name: skill.name }],
    },
    {
      id: "2",
      name: "OpenShift delivery checks",
      description: "",
      skills: [
        { id: "1", name: skill.name },
        { id: "5", name: "OpenShift deployment" },
      ],
    },
    {
      id: "3",
      name: "Platform deployment pack",
      description: "",
      skills: [{ id: "7", name: "Containerization" }],
    },
    {
      id: "4",
      name: "Managed pack",
      description: "",
      skills: [{ id: "9", name: "Operator skill" }],
      operatorManaged: true,
    },
  ];
  let membershipPuts: { skillId: string; body: unknown }[];

  beforeEach(() => {
    membershipPuts = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.json(memberships))
      ),
      rest.post(AGENTIC_ENDPOINTS.skills, async (req, res, ctx) =>
        res(
          ctx.status(201),
          ctx.json({ ...(await req.json<SkillRequest>()), id: "99" })
        )
      ),
      rest.put(
        `${AGENTIC_ENDPOINTS.skills}/:id/collections`,
        async (req, res, ctx) => {
          membershipPuts.push({
            skillId: req.params.id as string,
            body: await req.json(),
          });
          return res(ctx.status(204));
        }
      )
    );
  });

  const collectionsInput = () =>
    document.querySelector<HTMLInputElement>("#skill-skill-collections-input")!;
  const collectionChips = () =>
    document.querySelector<HTMLElement>(
      '[data-ouia-component-id="skill-skill-collections-chip-group"]'
    );

  const renderForm = (
    current: Skill | null,
    notifications = createMockNotifications(),
    onClose = jest.fn()
  ) => {
    render(
      <NotificationsContext.Provider value={notifications}>
        <SkillForm skill={current} onClose={onClose} />
      </NotificationsContext.Provider>
    );
    return { notifications, onClose };
  };

  const submit = async (user: ReturnType<typeof userEvent.setup>) => {
    // Blur first: validation on blur briefly disables Save.
    await user.tab();
    const button = screen.getByRole("button", { name: /^(Save|Create)$/ });
    await waitFor(() => expect(button).toBeEnabled());
    // jsdom does not submit through the footer button's `form` attribute.
    fireEvent.submit(document.getElementById("skill-form")!);
  };

  it("starts from the collections that contain the skill, last in Associations", async () => {
    renderForm(skill);

    await waitFor(() => expect(collectionsInput()).toBeEnabled());
    expect(collectionChips()).toHaveTextContent(
      "Java modernization foundation"
    );
    expect(collectionChips()).toHaveTextContent("OpenShift delivery checks");
    expect(collectionChips()).not.toHaveTextContent("Platform deployment pack");
    // Named by its label (not "Type to filter") and described by its helper.
    expect(
      screen.getByRole("combobox", { name: "Skill collections" })
    ).toHaveAccessibleDescription(
      "Agents that use these skill collections also use this skill. This also updates each skill collection's skills. Java modernization foundation keeps this skill: a skill collection needs at least one skill."
    );
    const pickers = [
      ...document.querySelectorAll<HTMLInputElement>(
        "#skill-form .pf-v6-c-menu-toggle input"
      ),
    ].map((input) => input.id);
    expect(pickers[pickers.length - 1]).toBe("skill-skill-collections-input");
  });

  it("locks the collection the skill is the only member of, and managed ones", async () => {
    const user = userEvent.setup();
    renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    // The locked chip is named with its reason without opening the menu;
    // the managed collection the skill is not in is not mentioned.
    expect(
      screen.getByText(
        "Java modernization foundation keeps this skill: a skill collection needs at least one skill."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/cannot be removed here/)).toBeNull();
    // One remove button: OpenShift delivery checks. The only-member chip has none.
    const chips = within(collectionChips()!);
    expect(
      chips.queryByRole("button", {
        name: "Remove Java modernization foundation",
      })
    ).not.toBeInTheDocument();
    expect(
      chips.getByRole("button", { name: "Remove OpenShift delivery checks" })
    ).toBeInTheDocument();

    await user.click(collectionsInput());
    expect(
      await screen.findByText(
        "This skill is the only one in this skill collection. A skill collection needs at least one skill."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Managed by Konveyor. Changes are reverted automatically."
      )
    ).toBeInTheDocument();
    const managed = screen.getByRole("menuitem", { name: /Managed pack/ });
    expect(within(managed).getByRole("checkbox")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await user.click(within(managed).getByText("Managed pack"));
    expect(collectionChips()).not.toHaveTextContent("Managed pack");
  });

  it("names the locked collections once per reason", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(
          ctx.json([
            ...memberships.slice(0, 3),
            {
              ...memberships[3],
              skills: [...memberships[3].skills, { id: "1", name: skill.name }],
            },
            {
              id: "5",
              name: "Quarkus essentials",
              description: "",
              skills: [{ id: "1", name: skill.name }],
            },
          ])
        )
      )
    );
    renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    expect(
      screen.getByText(
        "Java modernization foundation and Quarkus essentials keep this skill: a skill collection needs at least one skill."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Managed pack is managed by Konveyor and cannot be removed here."
      )
    ).toBeInTheDocument();
  });

  it("sends nothing to the collections when they did not change", async () => {
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updated).toHaveLength(1);
    expect(membershipPuts).toEqual([]);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Skill updated",
      variant: "success",
    });
  });

  it("keeps Save off when the collections are back to their starting set", async () => {
    // Skill 1 in two collections that can both lose it.
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(
          ctx.json([
            memberships[1],
            {
              ...memberships[2],
              skills: [...memberships[2].skills, { id: "1", name: skill.name }],
            },
          ])
        )
      )
    );
    const user = userEvent.setup();
    renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.click(
      within(collectionChips()!).getByRole("button", {
        name: "Remove OpenShift delivery checks",
      })
    );
    await waitFor(() => expect(save).toBeEnabled());
    // Added back, now last: the same set in another order.
    await user.click(collectionsInput());
    await user.click(await screen.findByText("OpenShift delivery checks"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(save).toBeDisabled());
  });

  it("sends the whole selected set after the skill when it changed", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.click(
      within(collectionChips()!).getByRole("button", {
        name: "Remove OpenShift delivery checks",
      })
    );
    await user.keyboard("{Escape}");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updated).toHaveLength(1);
    expect(membershipPuts).toEqual([
      { skillId: "1", body: { collections: [{ id: "1" }, { id: "3" }] } },
    ]);
  });

  it("does not rewrite the skill when only its collections changed", async () => {
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.keyboard("{Escape}");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updated).toEqual([]);
    expect(membershipPuts).toEqual([
      {
        skillId: "1",
        body: { collections: [{ id: "1" }, { id: "2" }, { id: "3" }] },
      },
    ]);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Skill updated",
      variant: "success",
    });
  });

  it("keeps locked collections when the selection is cleared", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    const clear = collectionsInput()
      .closest(".pf-v6-c-menu-toggle")!
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Clear input value"]'
      );
    await user.click(clear!);
    expect(collectionChips()).toHaveTextContent(
      "Java modernization foundation"
    );
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(membershipPuts).toEqual([
      { skillId: "1", body: { collections: [{ id: "1" }] } },
    ]);
  });

  it("adds a new skill to the selected collections with the created id", async () => {
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(null);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.type(
      screen.getByRole("textbox", { name: /^Name/ }),
      "New migration skill"
    );
    await user.type(screen.getByRole("textbox", { name: /^Content/ }), "# Do");
    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.keyboard("{Escape}");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(membershipPuts).toEqual([
      { skillId: "99", body: { collections: [{ id: "3" }] } },
    ]);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Skill created",
      variant: "success",
    });
  });

  it("keeps the chips and sends nothing without collection write access", async () => {
    mockGrantedScopes.collections = false;
    const user = userEvent.setup();
    const { onClose } = renderForm(skill);

    expect(
      await screen.findByText(
        "You need permission to edit skill collections to change this field."
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(collectionChips()).toHaveTextContent("OpenShift delivery checks")
    );
    expect(collectionsInput().closest(".pf-v6-c-menu-toggle")).toHaveClass(
      "pf-m-disabled"
    );

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(membershipPuts).toEqual([]);
  });

  it("is disabled while the collections load and says so when they fail", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.status(403))
      )
    );
    renderForm(skill);

    // While loading the field never reads as "in no collection".
    expect(collectionsInput()).toBeDisabled();
    expect(screen.getByText("Loading skill collections.")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Skill collections could not be loaded. Saving leaves them unchanged."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading skill collections.")).toBeNull();
    expect(collectionsInput()).toBeDisabled();
  });

  /** A response that waits until the test releases it. */
  const held = () => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    return { released, release };
  };

  it("starts from a fresh read of the collections, not from the cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The cache says the skill is in no collection; the server says two.
    queryClient.setQueryData(
      agenticKeys.list("skillCollections"),
      memberships.map((collection) => ({ ...collection, skills: [] }))
    );
    const answer = held();
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skillCollections, async (_req, res, ctx) => {
        await answer.released;
        return res(ctx.json(memberships));
      })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <SkillForm skill={skill} onClose={jest.fn()} />
      </QueryClientProvider>
    );

    expect(collectionsInput()).toBeDisabled();
    expect(screen.getByText("Loading skill collections.")).toBeInTheDocument();
    answer.release();
    await waitFor(() => expect(collectionsInput()).toBeEnabled());
    expect(collectionChips()).toHaveTextContent(
      "Java modernization foundation"
    );
    expect(collectionChips()).toHaveTextContent("OpenShift delivery checks");
  });

  it("keeps the field and sends the memberships when a later refetch fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <SkillForm skill={skill} onClose={onClose} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    server.use(
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.status(503))
      )
    );
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: agenticKeys.list("skillCollections"),
      })
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryState(agenticKeys.list("skillCollections"))?.status
      ).toBe("error")
    );
    expect(screen.queryByText(/Saving leaves them unchanged/)).toBeNull();
    expect(
      screen.getByText(
        "Agents that use these skill collections also use this skill. This also updates each skill collection's skills."
      )
    ).toBeInTheDocument();

    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.keyboard("{Escape}");
    await submit(user);
    await waitFor(() =>
      expect(membershipPuts).toEqual([
        {
          skillId: "1",
          body: { collections: [{ id: "1" }, { id: "2" }, { id: "3" }] },
        },
      ])
    );
  });

  it("stays open on Escape while the two writes run", async () => {
    const answer = held();
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.skills}/:id/collections`,
        async (_req, res, ctx) => {
          await answer.released;
          return res(ctx.status(204));
        }
      )
    );
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<SkillModal isOpen skill={skill} onClose={onClose} />);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.keyboard("{Escape}");
    await submit(user);

    await waitFor(() => expect(updated).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    answer.release();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes with a warning naming what was saved when the collections fail", async () => {
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.skills}/:id/collections`,
        (_req, res, ctx) =>
          res(
            ctx.status(409),
            ctx.json({
              message:
                "Managed pack is managed by Konveyor and cannot be changed here.",
            })
          )
      )
    );
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.keyboard("{Escape}");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updated).toHaveLength(1);
    expect(notifications.pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Some skill collection changes could not be saved",
        message:
          "The skill was saved. Managed pack is managed by Konveyor and cannot be changed here.",
        variant: "warning",
      })
    );
    expect(notifications.pushNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" })
    );
  });

  it("stays open and sends nothing else when the skill itself fails", async () => {
    server.use(
      rest.put(`${AGENTIC_ENDPOINTS.skills}/:id`, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(skill);
    await waitFor(() => expect(collectionsInput()).toBeEnabled());

    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " More."
    );
    await user.click(collectionsInput());
    await user.click(await screen.findByText("Platform deployment pack"));
    await user.keyboard("{Escape}");
    await submit(user);

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Skill could not be updated",
          variant: "danger",
        })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(membershipPuts).toEqual([]);
    // Focus stays in the dialog, on the button that retries.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toHaveFocus()
    );
  });
});
