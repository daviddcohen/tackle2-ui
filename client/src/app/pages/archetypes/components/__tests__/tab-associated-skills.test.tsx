import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { MemoryRouter } from "react-router-dom";

import { Skill } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { TabAssociatedSkills } from "../tab-associated-skills";

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

const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [{ id: 11, name: "Quarkus 3.x", generators: [] }],
};

const skill = (
  id: string,
  name: string,
  associations: Skill["associations"]
): Skill => ({
  id,
  name,
  description: "",
  sourceType: "inline",
  associations,
});

const serveSkills = (resolver: Parameters<typeof rest.get>[1]) =>
  server.use(rest.get(AGENTIC_ENDPOINTS.skills, resolver));

const onManageSkills = jest.fn();

const renderTab = () =>
  render(
    <MemoryRouter>
      <TabAssociatedSkills
        archetype={archetype}
        onManageSkills={onManageSkills}
      />
    </MemoryRouter>
  );

beforeEach(() => {
  mockGrantedScopes.all = true;
  onManageSkills.mockClear();
});

describe("TabAssociatedSkills", () => {
  it("lists archetype and target profile skills with one line per source", async () => {
    serveSkills((_req, res, ctx) =>
      res(
        ctx.json([
          skill("3", "Jakarta EE namespace migration", [
            {
              scope: "archetype",
              resource: { id: 1, name: "Java EE Application" },
            },
            {
              scope: "targetProfile",
              resource: { id: 11, name: "Quarkus 3.x" },
            },
          ]),
          skill("9", "Elsewhere", [
            { scope: "archetype", resource: { id: 2, name: "Other" } },
          ]),
        ])
      )
    );
    renderTab();

    const table = await screen.findByRole("grid", { name: "Skills" });
    expect(
      screen.getByText(
        "Skills associated with this archetype and its target profiles. Agents use them when they migrate its applications, unless a migration plan excludes them."
      )
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", {
        name: "Jakarta EE namespace migration",
      })
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Archetype: Java EE Application")
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Target profile: Quarkus 3.x")
    ).toBeInTheDocument();
    expect(within(table).queryByText("Elsewhere")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Manage skills" })
    ).toBeInTheDocument();
  });

  it("asks the page to open Manage skills from the header", async () => {
    serveSkills((_req, res, ctx) =>
      res(
        ctx.json([
          skill("3", "Jakarta EE namespace migration", [
            {
              scope: "archetype",
              resource: { id: 1, name: "Java EE Application" },
            },
          ]),
        ])
      )
    );
    renderTab();

    await userEvent.click(
      await screen.findByRole("button", { name: "Manage skills" })
    );
    expect(onManageSkills).toHaveBeenCalledTimes(1);
  });

  it("shows an error, not the empty state, when skills cannot be loaded", async () => {
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    renderTab();

    expect(await screen.findByText("Unable to connect")).toBeInTheDocument();
    expect(screen.queryByText("No skills yet")).toBeNull();
    // The action stays: the modal says why it cannot load.
    await userEvent.click(
      screen.getByRole("button", { name: "Manage skills" })
    );
    expect(onManageSkills).toHaveBeenCalledTimes(1);
  });

  it("keeps the same Manage skills button when the empty state turns into the table", async () => {
    const elsewhere = skill("9", "Elsewhere", [
      { scope: "archetype", resource: { id: 2, name: "Other" } },
    ]);
    let current = [elsewhere];
    serveSkills((_req, res, ctx) => res(ctx.json(current)));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TabAssociatedSkills
            archetype={archetype}
            onManageSkills={onManageSkills}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Manage skills" });
    act(() => button.focus());

    current = [
      elsewhere,
      skill("3", "Jakarta EE namespace migration", [
        {
          scope: "archetype",
          resource: { id: 1, name: "Java EE Application" },
        },
      ]),
    ];
    await act(() => queryClient.invalidateQueries());
    await waitFor(() =>
      expect(screen.getByRole("grid", { name: "Skills" })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Manage skills" })).toBe(button);
    expect(button).toHaveFocus();
  });

  it("offers Manage skills when none is associated but skills exist", async () => {
    serveSkills((_req, res, ctx) =>
      res(
        ctx.json([
          skill("9", "Elsewhere", [
            { scope: "archetype", resource: { id: 2, name: "Other" } },
          ]),
        ])
      )
    );
    renderTab();

    expect(
      await screen.findByRole("heading", { name: "No skills yet", level: 3 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills associated with this archetype or its target profiles appear here."
      )
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Manage skills" })
    );
    expect(onManageSkills).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("points to the skills page when no skill exists at all", async () => {
    serveSkills((_req, res, ctx) => res(ctx.json([])));
    renderTab();

    expect(
      await screen.findByRole("link", { name: "Go to skills" })
    ).toHaveAttribute("href", "/skills");
    expect(screen.queryByRole("button", { name: "Manage skills" })).toBeNull();
  });

  it("offers no action without the skill write scope", async () => {
    mockGrantedScopes.all = false;
    serveSkills((_req, res, ctx) =>
      res(
        ctx.json([
          skill("3", "Jakarta EE namespace migration", [
            {
              scope: "archetype",
              resource: { id: 1, name: "Java EE Application" },
            },
          ]),
        ])
      )
    );
    renderTab();

    expect(
      await screen.findByRole("grid", { name: "Skills" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage skills" })).toBeNull();
  });

  it("omits the empty state's action without the skill write scope", async () => {
    mockGrantedScopes.all = false;
    serveSkills((_req, res, ctx) => res(ctx.json([])));
    const { container } = renderTab();

    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    // No empty heading line above the empty state: the pre-feature layout.
    expect(container.querySelector(".pf-v6-l-stack")).toBeNull();
  });

  it("keeps the plain error state without the skill write scope", async () => {
    mockGrantedScopes.all = false;
    serveSkills((_req, res, ctx) => res(ctx.status(403)));
    const { container } = renderTab();

    expect(await screen.findByText("Unable to connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage skills" })).toBeNull();
    expect(container.querySelector(".pf-v6-l-stack")).toBeNull();
  });
});
