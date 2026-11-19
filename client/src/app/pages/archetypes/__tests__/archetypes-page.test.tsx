jest.unmock("react-router-dom");

import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { Archetype } from "@app/api/models";
import { ManageSkillsModal } from "@app/pages/agentic/components/manage-skills-modal";
import { skillsWriteScopes } from "@app/scopes";
import { render, screen, within } from "@app/test-config/test-utils";

import Archetypes from "../archetypes-page";

/*
 * The row actions' Manage skills only. The archetypes read is stubbed so the
 * table renders one archetype; the skill write scope is the subject.
 */

const mockState = { canManageSkills: true };

// The overflow menu imports PF's ESM context directly; use the CommonJS build
// the rest of PF resolves to in Jest, so both share one context.
jest.mock(
  "@patternfly/react-core/dist/esm/components/OverflowMenu/OverflowMenuContext",
  () =>
    jest.requireActual(
      "@patternfly/react-core/dist/js/components/OverflowMenu/OverflowMenuContext"
    )
);

jest.mock("@app/Constants", () => ({
  ...jest.requireActual("@app/Constants"),
  isAgenticEnabled: true,
}));

// Spied on to see whether the page mounts it (it listens to page focus).
jest.mock("@app/pages/agentic/components/manage-skills-modal", () => {
  const actual = jest.requireActual(
    "@app/pages/agentic/components/manage-skills-modal"
  );
  return { ...actual, ManageSkillsModal: jest.fn(actual.ManageSkillsModal) };
});

jest.mock("@app/auth", () => ({
  ...jest.requireActual("@app/auth"),
  useHasSomeScopes: (scopes: string[]) =>
    scopes === skillsWriteScopes ? mockState.canManageSkills : true,
}));

const mockArchetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [],
};

jest.mock("@app/queries/archetypes", () => ({
  ...jest.requireActual("@app/queries/archetypes"),
  useFetchArchetypes: () => ({
    archetypes: [mockArchetype],
    isFetching: false,
    error: null,
  }),
}));

const renderPage = () =>
  render(
    <Router history={createMemoryHistory()}>
      <Archetypes />
    </Router>
  );

const openRowActions = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    within(screen.getByRole("row", { name: /Java EE Application/ })).getByRole(
      "button",
      { name: "actions.rowActions" }
    )
  );

describe("Archetypes row actions", () => {
  beforeEach(() => {
    mockState.canManageSkills = true;
    jest.mocked(ManageSkillsModal).mockClear();
  });

  it("offers Manage skills after Manage target profiles and opens it", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(ManageSkillsModal).toHaveBeenCalled();
    await openRowActions(user);
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items.indexOf("agentic.skill.manageSkills.title")).toBe(
      items.indexOf("actions.manageTargetProfiles") + 1
    );
    await user.click(
      screen.getByRole("menuitem", { name: "agentic.skill.manageSkills.title" })
    );
    expect(
      await screen.findByRole("dialog", {
        name: "agentic.skill.manageSkills.titleFor",
      })
    ).toBeInTheDocument();
  });

  it("offers no Manage skills without the skill write scope", async () => {
    mockState.canManageSkills = false;
    const user = userEvent.setup();
    renderPage();
    await openRowActions(user);
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("menuitem", {
        name: "agentic.skill.manageSkills.title",
      })
    ).not.toBeInTheDocument();
    // Nor the modal, which would listen to focus on the page for nothing.
    expect(ManageSkillsModal).not.toHaveBeenCalled();
  });
});
