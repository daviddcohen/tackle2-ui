import { render as renderPlain } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Agent, Skill, SkillCollection } from "@app/agentic";
import { hub } from "@app/api/rest";
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

import { AgentTestModal, AgentTestTarget } from "./agent-test-modal";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const makeAgent = (
  id: string,
  name: string,
  extra: Partial<Agent> = {}
): Agent => ({
  id,
  name,
  description: "",
  model: { id: "1", name: "Model" },
  skills: [],
  prompt: "",
  capabilities: [],
  parameters: [],
  ...extra,
});

const makeSkill = (
  id: string,
  name: string,
  extra: Partial<Skill> = {}
): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  ...extra,
});

const skills: Skill[] = [
  makeSkill("1", "Spring Boot 3 upgrade", {
    description: "Jakarta namespace and Java 17.",
  }),
  makeSkill("2", "Corporate coding standards", { loadPolicy: "rule" }),
  makeSkill("3", "Incremental transformation workflow", {
    loadPolicy: "rule",
  }),
  makeSkill("4", "Quarkus best practices"),
];
const collections: SkillCollection[] = [
  {
    id: "10",
    name: "Java modernization foundation",
    description: "",
    skills: [{ id: "4", name: "Quarkus best practices" }],
  },
];
// Has skill 3 directly and skill 4 through its collection.
const codeMigrator = makeAgent("2", "Code Migrator", {
  skills: [{ id: "3", name: "Incremental transformation workflow" }],
  skillCollections: [{ id: "10", name: "Java modernization foundation" }],
});
const testRunner = makeAgent("4", "Test Runner");
const springBoot = skills[0];

type Resolver = Parameters<typeof rest.get>[1];
const json =
  (body: object): Resolver =>
  (_req, res, ctx) =>
    res(ctx.json(body));
const failing: Resolver = (_req, res, ctx) => res(ctx.status(403));
const pending: Resolver = (_req, res, ctx) =>
  res(ctx.delay(2000), ctx.json([]));

const serve = ({
  skillsResolver = json(skills),
  collectionsResolver = json(collections),
  agentsResolver = json([codeMigrator, testRunner]),
}: {
  skillsResolver?: Resolver;
  collectionsResolver?: Resolver;
  agentsResolver?: Resolver;
} = {}) => {
  const requests: unknown[] = [];
  server.use(
    rest.get(
      hub`/applications`,
      json([{ id: 1, name: "Customer Management" }])
    ),
    rest.get(AGENTIC_ENDPOINTS.skills, skillsResolver),
    rest.get(AGENTIC_ENDPOINTS.skillCollections, collectionsResolver),
    rest.get(AGENTIC_ENDPOINTS.agents, agentsResolver),
    rest.post(AGENTIC_ENDPOINTS.agentRuns, async (req, res, ctx) => {
      const body = await req.json();
      requests.push(body);
      // The created run, as the API answers it.
      return res(
        ctx.status(201),
        ctx.json({
          id: "9004",
          name: "Test run #4",
          agent: { id: body.agentId, name: "" },
          application: { id: body.applicationId, name: "" },
          task: body.task,
          phase: "Running",
          startedAt: "2026-11-24T10:00:00Z",
        })
      );
    })
  );
  return requests;
};

const renderModal = (target: AgentTestTarget | null) => {
  const notifications = createMockNotifications();
  const onClose = jest.fn();
  const view = render(
    <NotificationsContext.Provider value={notifications}>
      <AgentTestModal target={target} onClose={onClose} />
    </NotificationsContext.Provider>
  );
  return { ...view, notifications, onClose };
};

const taskField = () => screen.getByRole("textbox", { name: /Task/ });
const startButton = () =>
  screen.getByRole("button", { name: "Start test run" });
const addedSkillsInput = () =>
  screen.getByRole("combobox", { name: "Added skills" });
const optionNamed = (name: string) =>
  within(screen.getByRole("listbox")).getByText(name, { exact: true });

/** Waits until the skills (and collections) are in the picker. */
const waitForSkills = () =>
  waitFor(() => expect(addedSkillsInput()).toBeEnabled());

const pickApplication = async () => {
  await userEvent.type(
    screen.getByRole("combobox", { name: "Application" }),
    "Customer"
  );
  await userEvent.click(
    await screen.findByRole("option", { name: "Customer Management" })
  );
};

const fillRequired = async () => {
  await pickApplication();
  await userEvent.type(taskField(), "Run the unit tests");
};

describe("AgentTestModal", () => {
  it("does not carry the previous Agent's input over", async () => {
    serve();
    const { rerender } = renderModal({ agent: makeAgent("1", "Build") });
    await userEvent.type(taskField(), "Task for build validator");
    expect(taskField()).toHaveValue("Task for build validator");

    // switching Agents while open
    rerender(
      <AgentTestModal target={{ agent: testRunner }} onClose={jest.fn()} />
    );
    expect(taskField()).toHaveValue("");

    // closing and re-opening for the same Agent
    await userEvent.type(taskField(), "Another task");
    rerender(<AgentTestModal target={null} onClose={jest.fn()} />);
    rerender(
      <AgentTestModal target={{ agent: testRunner }} onClose={jest.fn()} />
    );
    expect(taskField()).toHaveValue("");
    expect(startButton()).toBeDisabled();
  });

  it("names each typeahead input after its field, not the default Type to filter", async () => {
    serve();
    renderModal({ skill: springBoot });
    for (const name of ["Agent", "Application"]) {
      const input = screen.getByRole("combobox", { name });
      // The field label points at the input, so clicking it focuses it.
      expect(
        document.querySelector(`label[for="${input.id}"]`)
      ).toHaveTextContent(name);
    }
    expect(
      screen.queryByRole("combobox", { name: "Type to filter" })
    ).toBeNull();
  });

  it("names the agent in the description and links the toast to the new run", async () => {
    const requests = serve();
    const { notifications } = renderModal({ agent: codeMigrator });
    expect(
      screen.getByRole("heading", { name: "Test agent" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Runs Code Migrator once on one application. Results are for review only; the repository is not changed."
      )
    ).toBeVisible();

    await fillRequired();
    await userEvent.click(startButton());
    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalled()
    );
    // No added skills: the field is left out of the request.
    expect(requests).toEqual([
      { agentId: "2", applicationId: 1, task: "Run the unit tests" },
    ]);
    const { title, message, variant } =
      notifications.pushNotification.mock.calls[0][0];
    expect(title).toBe("Test run #4 queued");
    expect(variant).toBe("success");
    renderPlain(<MemoryRouter>{message}</MemoryRouter>);
    expect(screen.getByRole("link", { name: "View test run" })).toHaveAttribute(
      "href",
      "/agents/2/test-runs/9004"
    );
  });

  it("links the toast to the agent's runs when the run comes back without a name", async () => {
    serve();
    server.use(
      rest.post(AGENTIC_ENDPOINTS.agentRuns, (_req, res, ctx) =>
        res(ctx.status(201), ctx.json({ id: "1" }))
      )
    );
    const { notifications } = renderModal({ agent: codeMigrator });
    await fillRequired();
    await userEvent.click(startButton());
    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalled()
    );
    const { title, message } = notifications.pushNotification.mock.calls[0][0];
    expect(title).toBe("Test run for Code Migrator queued");
    renderPlain(<MemoryRouter>{message}</MemoryRouter>);
    expect(screen.getByRole("link", { name: "View runs" })).toHaveAttribute(
      "href",
      "/agents/2?tab=runs"
    );
  });

  it("offers added skills after Task, with how agents use each one", async () => {
    serve();
    renderModal({ agent: testRunner });
    await waitForSkills();

    const labels = Array.from(
      document.querySelectorAll("#agent-test-form .pf-v6-c-form__label-text")
    ).map((label) => label.textContent);
    expect(labels).toEqual(["Application", "Task", "Added skills"]);
    expect(addedSkillsInput()).toHaveAccessibleDescription(
      "Added to the agent's own skills for this test run only. The agent is not changed."
    );

    await userEvent.click(addedSkillsInput());
    const options = within(screen.getByRole("listbox")).getAllByRole(
      "menuitem"
    );
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Corporate coding standardsAlways followed",
      "Incremental transformation workflowAlways followed",
      "Quarkus best practicesAvailable when needed",
      "Spring Boot 3 upgradeAvailable when needed · Jakarta namespace and Java 17.",
    ]);
  });

  it("shows the agent's own skills as already included, never selectable", async () => {
    const requests = serve();
    renderModal({ agent: codeMigrator });
    await waitForSkills();
    await userEvent.click(addedSkillsInput());

    const direct = optionNamed("Incremental transformation workflow").closest(
      "li"
    ) as HTMLElement;
    expect(direct).toHaveTextContent(
      "Already included: the agent has this skill"
    );
    expect(within(direct).getByRole("checkbox")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    // The menuitem itself, not only its checkbox, is announced as disabled.
    expect(direct).toHaveAttribute("role", "menuitem");
    expect(direct).toHaveAttribute("aria-disabled", "true");
    const viaCollection = optionNamed("Quarkus best practices").closest(
      "li"
    ) as HTMLElement;
    expect(viaCollection).toHaveTextContent(
      "Already included: in skill collection Java modernization foundation"
    );

    await userEvent.click(optionNamed("Incremental transformation workflow"));
    await userEvent.click(optionNamed("Spring Boot 3 upgrade"));
    await userEvent.click(optionNamed("Corporate coding standards"));
    expect(
      screen.queryByRole("button", {
        name: "Remove Incremental transformation workflow",
      })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove Spring Boot 3 upgrade" })
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await fillRequired();
    await userEvent.click(startButton());
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      agentId: "2",
      applicationId: 1,
      task: "Run the unit tests",
      addedSkills: [{ id: "1" }, { id: "2" }],
    });
  });

  it("falls back to the agent's own skills when collections fail to load", async () => {
    serve({ collectionsResolver: failing });
    renderModal({ agent: codeMigrator });
    await waitForSkills();
    expect(
      screen.getByText(
        "Skill collections could not be loaded, so skills the agent gets from them are not marked as included."
      )
    ).toBeInTheDocument();
    await userEvent.click(addedSkillsInput());
    expect(
      optionNamed("Incremental transformation workflow").closest("li")
    ).toHaveTextContent("Already included: the agent has this skill");
    expect(
      optionNamed("Quarkus best practices").closest("li")
    ).not.toHaveTextContent("Already included");
  });

  it("disables the picker while the skills load", async () => {
    serve({ skillsResolver: pending });
    renderModal({ agent: testRunner });
    expect(addedSkillsInput()).toBeDisabled();
    expect(screen.getByText("Loading skills.")).toBeInTheDocument();
  });

  it("still starts the test without added skills when skills fail to load", async () => {
    const requests = serve({ skillsResolver: failing });
    renderModal({ agent: testRunner });
    expect(
      await screen.findByText(
        "Skills could not be loaded. You can still start the test without added skills."
      )
    ).toBeInTheDocument();
    expect(addedSkillsInput()).toBeDisabled();

    await fillRequired();
    await userEvent.click(startButton());
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).not.toHaveProperty("addedSkills");
  });

  it("says so when no skills exist", async () => {
    serve({ skillsResolver: json([]) });
    renderModal({ agent: testRunner });
    expect(
      await screen.findByText(
        "No skills exist yet. The test runs with the agent's own skills."
      )
    ).toBeInTheDocument();
    expect(addedSkillsInput()).toBeDisabled();
  });

  describe("from a skill", () => {
    it("asks for the agent first and preselects the skill", async () => {
      const requests = serve();
      const { notifications } = renderModal({ skill: springBoot });
      expect(
        screen.getByText(
          "Runs an agent once on one application with Spring Boot 3 upgrade added to its skills. Results are for review only; the repository is not changed."
        )
      ).toBeVisible();
      const labels = Array.from(
        document.querySelectorAll("#agent-test-form .pf-v6-c-form__label-text")
      ).map((label) => label.textContent);
      expect(labels).toEqual(["Agent", "Application", "Task", "Added skills"]);
      expect(
        screen.getByRole("button", { name: "Remove Spring Boot 3 upgrade" })
      ).toBeInTheDocument();

      await fillRequired();
      // Agent is required.
      expect(startButton()).toBeDisabled();
      const agentInput = screen.getByRole("combobox", { name: "Agent" });
      await waitFor(() => expect(agentInput).toBeEnabled());
      await userEvent.click(agentInput);
      await userEvent.click(
        await screen.findByRole("option", { name: "Test Runner" })
      );
      await userEvent.click(startButton());

      await waitFor(() =>
        expect(notifications.pushNotification).toHaveBeenCalled()
      );
      expect(requests).toEqual([
        {
          agentId: "4",
          applicationId: 1,
          task: "Run the unit tests",
          addedSkills: [{ id: "1" }],
        },
      ]);
      const { title, message } =
        notifications.pushNotification.mock.calls[0][0];
      expect(title).toBe("Test run #4 queued");
      renderPlain(<MemoryRouter>{message}</MemoryRouter>);
      expect(
        screen.getByRole("link", { name: "View test run" })
      ).toHaveAttribute("href", "/agents/4/test-runs/9004");
    });

    it("hides the skill while the chosen agent has it, and keeps it for another agent", async () => {
      const requests = serve();
      renderModal({ skill: skills[3] });
      const chip = () =>
        screen.queryByRole("button", { name: "Remove Quarkus best practices" });
      expect(chip()).toBeInTheDocument();

      const agentInput = screen.getByRole("combobox", { name: "Agent" });
      await waitFor(() => expect(agentInput).toBeEnabled());
      await waitForSkills();
      await userEvent.click(agentInput);
      expect(
        await screen.findByRole("option", { name: /Code Migrator/ })
      ).toHaveTextContent("Already includes Quarkus best practices");
      expect(
        screen.getByRole("option", { name: /Test Runner/ })
      ).not.toHaveTextContent("Already includes");
      await userEvent.click(
        screen.getByRole("option", { name: /Code Migrator/ })
      );

      await waitFor(() => expect(chip()).toBeNull());
      expect(
        screen.getByText(
          "Code Migrator already includes Quarkus best practices, so it is not added to this test run."
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Runs Code Migrator once on one application. Results are for review only; the repository is not changed."
        )
      ).toBeInTheDocument();
      await userEvent.click(addedSkillsInput());
      expect(
        optionNamed("Quarkus best practices").closest("li")
      ).toHaveTextContent(
        "Already included: in skill collection Java modernization foundation"
      );
      await userEvent.keyboard("{Escape}");

      // Another agent that lacks it: the skill is back and is sent.
      await userEvent.clear(agentInput);
      await userEvent.click(agentInput);
      await userEvent.click(
        await screen.findByRole("option", { name: /Test Runner/ })
      );
      expect(chip()).toBeInTheDocument();
      await fillRequired();
      await userEvent.click(startButton());
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]).toMatchObject({
        agentId: "4",
        addedSkills: [{ id: "4" }],
      });
    });

    it("keeps the skill and sends it when the other skills fail to load", async () => {
      const requests = serve({ skillsResolver: failing });
      renderModal({ skill: springBoot });
      expect(
        await screen.findByText(
          "Other skills could not be loaded. The test runs with Spring Boot 3 upgrade added."
        )
      ).toBeInTheDocument();
      expect(addedSkillsInput()).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Remove Spring Boot 3 upgrade" })
      ).toBeInTheDocument();

      const agentInput = screen.getByRole("combobox", { name: "Agent" });
      await waitFor(() => expect(agentInput).toBeEnabled());
      await userEvent.click(agentInput);
      await userEvent.click(
        await screen.findByRole("option", { name: /Test Runner/ })
      );
      await fillRequired();
      await userEvent.click(startButton());
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]).toMatchObject({
        agentId: "4",
        addedSkills: [{ id: "1" }],
      });
    });

    it("cannot start when the agents fail to load", async () => {
      serve({ agentsResolver: failing });
      renderModal({ skill: springBoot });
      expect(
        await screen.findByText("Agents could not be loaded. Try again later.")
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Agent" })).toBeDisabled();
      await fillRequired();
      expect(startButton()).toBeDisabled();
    });
  });
});
