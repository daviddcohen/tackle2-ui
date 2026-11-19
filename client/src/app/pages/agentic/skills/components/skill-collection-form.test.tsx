import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Skill, SkillCollection } from "@app/agentic";
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
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  SkillCollectionForm,
  SkillCollectionModal,
} from "./skill-collection-form";

const mockGrantedScopes = { agents: true };
jest.mock("@app/auth", () => {
  const scopes = jest.requireActual("@app/scopes");
  return {
    ...jest.requireActual("@app/auth"),
    useHasSomeScopes: (required: string[]) =>
      required === scopes.agentsWriteScopes ? mockGrantedScopes.agents : true,
  };
});

const skills: Skill[] = [
  {
    id: "1",
    name: "Corporate coding standards",
    description: "",
    sourceType: "inline",
    content: "# Corporate coding standards",
  },
  { id: "2", name: "Quarkus", description: "", sourceType: "inline" },
];

const collection: SkillCollection = {
  id: "1",
  name: "Security and compliance",
  description: "Security skills.",
  skills: [{ id: "1", name: "Corporate coding standards" }],
};

describe("SkillCollectionForm", () => {
  beforeEach(() => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
        res(ctx.json(skills))
      ),
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.json([collection]))
      ),
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(
          ctx.json([
            { id: "1", name: "Code Migrator", skillCollections: [{ id: "1" }] },
          ])
        )
      )
    );
  });

  const nameInput = () => screen.getByRole("textbox", { name: /terms.name/ });
  const descriptionInput = () =>
    screen.getByRole("textbox", { name: /terms.description/ });

  it("rejects a duplicate name and an over-long name", async () => {
    const user = userEvent.setup();
    render(<SkillCollectionForm collection={null} onClose={jest.fn()} />);
    // A valid skill selection, so only the name keeps Create disabled.
    await user.click(
      document.querySelector<HTMLInputElement>(
        "#skill-collection-skills-select-input"
      )!
    );
    await user.click(await screen.findByText("Quarkus"));
    await user.keyboard("{Escape}");
    await user.type(nameInput(), "security AND compliance");
    await user.type(descriptionInput(), "dup");
    // duplicateNameCheck is case-sensitive (upstream behaviour): exact match only
    await user.clear(nameInput());
    await user.type(nameInput(), "Security and compliance");
    expect(
      await screen.findByText(
        "agentic.skillCollection.validation.nameDuplicate"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "actions.create" })
    ).toBeDisabled();

    await user.clear(nameInput());
    await user.type(nameInput(), "x".repeat(121));
    expect(
      await screen.findByText("agentic.skillCollection.validation.nameMaximum")
    ).toBeInTheDocument();
  });

  it("warns on edit how many agents use the collection", async () => {
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    expect(
      await screen.findByText("agentic.skillCollection.editWarning")
    ).toBeInTheDocument();
  });

  it("never looks unused while the agents load or after they fail", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.status(500))
      )
    );
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    expect(await screen.findByText("terms.loading")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "agentic.skillCollection.editUsageUnchecked",
        undefined,
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("terms.loading")).toBeNull();
    expect(
      screen.queryByText("agentic.skillCollection.editWarning")
    ).not.toBeInTheDocument();
  });

  it("has no warning when creating", async () => {
    render(<SkillCollectionForm collection={null} onClose={jest.fn()} />);
    await screen.findByRole("button", { name: "actions.create" });
    await waitFor(() =>
      expect(
        screen.queryByText("agentic.skillCollection.editWarning")
      ).not.toBeInTheDocument()
    );
  });

  it("keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    const save = screen.getByRole("button", { name: "actions.save" });
    // valid but untouched
    await waitFor(() => expect(save).toBeDisabled());
    await user.type(descriptionInput(), " More.");
    await waitFor(() => expect(save).toBeEnabled());
  });
});

describe("SkillCollectionForm agents", () => {
  // Code Migrator uses the collection; Test Runner does not; Platform agent
  // is operator-managed and uses it (locked); Operator agent is managed and
  // does not use it (cannot be added).
  const agents = [
    { id: "1", name: "Code Migrator", skillCollections: [{ id: "1" }] },
    { id: "2", name: "Test Runner", skillCollections: [] },
    {
      id: "3",
      name: "Platform agent",
      skillCollections: [{ id: "1" }],
      operatorManaged: true,
    },
    {
      id: "4",
      name: "Operator agent",
      skillCollections: [],
      operatorManaged: true,
    },
  ];
  let agentPuts: { collectionId: string; body: unknown }[];

  beforeEach(() => {
    mockGrantedScopes.agents = true;
    agentPuts = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
        res(ctx.json(skills))
      ),
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.json([collection]))
      ),
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.json(agents))
      ),
      rest.post(AGENTIC_ENDPOINTS.skillCollections, async (req, res, ctx) =>
        res(
          ctx.status(201),
          ctx.json({ ...(await req.json<SkillCollection>()), id: "77" })
        )
      ),
      rest.put(`${AGENTIC_ENDPOINTS.skillCollections}/:id`, (_req, res, ctx) =>
        res(ctx.status(204))
      ),
      rest.put(
        `${AGENTIC_ENDPOINTS.skillCollections}/:id/agents`,
        async (req, res, ctx) => {
          agentPuts.push({
            collectionId: req.params.id as string,
            body: await req.json(),
          });
          return res(ctx.status(204));
        }
      )
    );
  });

  const nameInput = () => screen.getByRole("textbox", { name: /terms.name/ });
  const descriptionInput = () =>
    screen.getByRole("textbox", { name: /terms.description/ });
  const agentsInput = () =>
    document.querySelector<HTMLInputElement>("#skill-collection-agents-input")!;
  const agentChips = () =>
    document.querySelector<HTMLElement>(
      '[data-ouia-component-id="skill-collection-agents-chip-group"]'
    );
  const chipRemoveButton = (name: string) =>
    agentChips()
      ?.querySelector(`span[aria-label="${name}"]`)
      ?.closest(".pf-v6-c-label")
      ?.querySelector("button");

  const renderForm = (
    current: SkillCollection | null,
    notifications = createMockNotifications(),
    onClose = jest.fn()
  ) => {
    render(
      <NotificationsContext.Provider value={notifications}>
        <SkillCollectionForm collection={current} onClose={onClose} />
      </NotificationsContext.Provider>
    );
    return { notifications, onClose };
  };

  const submit = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.tab();
    const button = screen.getByRole("button", {
      name: /^actions\.(save|create)$/,
    });
    await waitFor(() => expect(button).toBeEnabled());
    // jsdom does not submit through the footer button's `form` attribute.
    fireEvent.submit(document.getElementById("skill-collection-form")!);
  };

  const pickAgent = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string
  ) => {
    await user.click(agentsInput());
    await user.click(await screen.findByText(name));
    await user.keyboard("{Escape}");
  };

  it("has one Agents field, no sections, and starts from the agents that use it", async () => {
    renderForm(collection);

    // Four fields: no FormSection groups.
    expect(screen.queryByText("terms.general")).not.toBeInTheDocument();
    expect(screen.queryByText("agentic.skill.usage")).not.toBeInTheDocument();
    await waitFor(() => expect(agentsInput()).toBeEnabled());
    expect(
      screen.getByRole("combobox", {
        name: "agentic.skillCollection.agents",
      })
    ).toHaveAccessibleDescription(
      "agentic.skillCollection.agentsHelper agentic.skillCollection.agentsLocked"
    );
    expect(agentChips()).toHaveTextContent("Code Migrator");
    expect(agentChips()).toHaveTextContent("Platform agent");
    expect(agentChips()).not.toHaveTextContent("Test Runner");
    expect(
      screen.getByText("agentic.skillCollection.agentsHelper")
    ).toBeInTheDocument();
    // The edit warning still counts the saved agents.
    expect(
      screen.getByText("agentic.skillCollection.editWarning")
    ).toBeInTheDocument();
  });

  it("locks managed agents that use it and cannot add other managed agents", async () => {
    const user = userEvent.setup();
    renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    expect(
      screen.getByText("agentic.skillCollection.agentsLocked")
    ).toBeInTheDocument();
    expect(chipRemoveButton("Platform agent")).toBeNull();
    expect(chipRemoveButton("Code Migrator")).not.toBeNull();

    await user.click(agentsInput());
    const managed = await screen.findByRole("menuitem", {
      name: /Operator agent/,
    });
    expect(managed).toHaveClass("pf-m-aria-disabled");
    expect(managed).toHaveTextContent("agentic.common.managedByKonveyor");
    await user.click(screen.getByText("Operator agent"));
    expect(agentChips()).not.toHaveTextContent("Operator agent");
  });

  it("sends nothing to the agents when they did not change", async () => {
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await user.type(descriptionInput(), " More.");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(agentPuts).toEqual([]);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "agentic.skillCollection.updated",
      variant: "success",
    });
  });

  it("keeps Save off when the agents are back to their starting set", async () => {
    const user = userEvent.setup();
    renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());
    const save = screen.getByRole("button", { name: "actions.save" });
    expect(save).toBeDisabled();

    await user.click(chipRemoveButton("Code Migrator")!);
    await waitFor(() => expect(save).toBeEnabled());
    // Added back, now last: the same set in another order.
    await pickAgent(user, "Code Migrator");
    await waitFor(() => expect(save).toBeDisabled());
  });

  it("sends the whole selected set after the collection when it changed", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await pickAgent(user, "Test Runner");
    await user.click(chipRemoveButton("Code Migrator")!);
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(agentPuts).toEqual([
      { collectionId: "1", body: { agents: [{ id: "3" }, { id: "2" }] } },
    ]);
  });

  it("does not rewrite the collection when only its agents changed", async () => {
    const collectionPuts: unknown[] = [];
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.skillCollections}/:id`,
        async (req, res, ctx) => {
          collectionPuts.push(await req.json());
          return res(ctx.status(204));
        }
      )
    );
    const user = userEvent.setup();
    const { onClose } = renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await pickAgent(user, "Test Runner");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(collectionPuts).toEqual([]);
    expect(agentPuts).toHaveLength(1);
  });

  it("adds a new collection to the selected agents with the created id", async () => {
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(null);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await user.type(nameInput(), "New collection");
    await user.click(
      document.querySelector<HTMLInputElement>(
        "#skill-collection-skills-select-input"
      )!
    );
    await user.click(await screen.findByText("Quarkus"));
    await user.keyboard("{Escape}");
    await pickAgent(user, "Test Runner");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(agentPuts).toEqual([
      { collectionId: "77", body: { agents: [{ id: "2" }] } },
    ]);
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "agentic.skillCollection.created",
      variant: "success",
    });
  });

  it("keeps the chips and sends nothing without agent write access", async () => {
    mockGrantedScopes.agents = false;
    const user = userEvent.setup();
    const { onClose } = renderForm(collection);

    expect(
      await screen.findByText("agentic.skill.agentsReadOnly")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(agentChips()).toHaveTextContent("Code Migrator")
    );
    expect(agentsInput().closest(".pf-v6-c-menu-toggle")).toHaveClass(
      "pf-m-disabled"
    );

    await user.type(descriptionInput(), " More.");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(agentPuts).toEqual([]);
  });

  it("is disabled while the agents load and says so when they fail", async () => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.status(403))
      )
    );
    renderForm(collection);

    // While loading the field never reads as "used by no agent".
    expect(agentsInput()).toBeDisabled();
    expect(
      screen.getByText("agentic.skillCollection.agentsLoading")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("agentic.skillCollection.agentsUnavailable")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("agentic.skillCollection.agentsLoading")
    ).toBeNull();
    expect(agentsInput()).toBeDisabled();
  });

  /** A response that waits until the test releases it. */
  const held = () => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    return { released, release };
  };

  it("starts from a fresh read of the agents, not from the cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The cache says no agent uses the collection; the server says two do.
    queryClient.setQueryData(
      agenticKeys.list("agents"),
      agents.map((agent) => ({ ...agent, skillCollections: [] }))
    );
    const answer = held();
    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, async (_req, res, ctx) => {
        await answer.released;
        return res(ctx.json(agents));
      })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <SkillCollectionForm collection={collection} onClose={jest.fn()} />
      </QueryClientProvider>
    );

    expect(agentsInput()).toBeDisabled();
    expect(
      screen.getByText("agentic.skillCollection.agentsLoading")
    ).toBeInTheDocument();
    answer.release();
    await waitFor(() => expect(agentsInput()).toBeEnabled());
    expect(agentChips()).toHaveTextContent("Code Migrator");
    expect(agentChips()).toHaveTextContent("Platform agent");
  });

  it("keeps the field and sends the agents when a later refetch fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <SkillCollectionForm collection={collection} onClose={onClose} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    server.use(
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(ctx.status(503))
      )
    );
    await act(() =>
      queryClient.invalidateQueries({ queryKey: agenticKeys.list("agents") })
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryState(agenticKeys.list("agents"))?.status
      ).toBe("error")
    );
    expect(
      screen.queryByText("agentic.skillCollection.agentsUnavailable")
    ).toBeNull();
    expect(
      screen.getByText("agentic.skillCollection.agentsHelper")
    ).toBeInTheDocument();

    await pickAgent(user, "Test Runner");
    await submit(user);
    await waitFor(() =>
      expect(agentPuts).toEqual([
        {
          collectionId: "1",
          body: { agents: [{ id: "1" }, { id: "3" }, { id: "2" }] },
        },
      ])
    );
  });

  it("stays open on Escape while the two writes run", async () => {
    const answer = held();
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.skillCollections}/:id/agents`,
        async (_req, res, ctx) => {
          await answer.released;
          return res(ctx.status(204));
        }
      )
    );
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(
      <SkillCollectionModal isOpen collection={collection} onClose={onClose} />
    );
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await pickAgent(user, "Test Runner");
    await submit(user);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "actions.cancel" })
      ).toBeDisabled()
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    answer.release();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes with a warning naming what was saved when the agents fail", async () => {
    server.use(
      rest.put(
        `${AGENTIC_ENDPOINTS.skillCollections}/:id/agents`,
        (_req, res, ctx) =>
          res(
            ctx.status(409),
            ctx.json({
              message:
                "Test Runner is managed by Konveyor and cannot be changed here.",
            })
          )
      )
    );
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await pickAgent(user, "Test Runner");
    await submit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifications.pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "agentic.skillCollection.agentsSaveFailed",
        message: "agentic.skillCollection.agentsSaveFailedUpdated",
        variant: "warning",
      })
    );
    expect(notifications.pushNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" })
    );
  });

  it("stays open with focus on Save when the collection itself fails", async () => {
    server.use(
      rest.put(`${AGENTIC_ENDPOINTS.skillCollections}/:id`, (_req, res, ctx) =>
        res(ctx.status(500), ctx.json({ message: "Failed." }))
      )
    );
    const user = userEvent.setup();
    const { onClose, notifications } = renderForm(collection);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    await user.type(descriptionInput(), " More.");
    await pickAgent(user, "Test Runner");
    await submit(user);

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed.", variant: "danger" })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(agentPuts).toEqual([]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "actions.save" })).toHaveFocus()
    );
  });
});
