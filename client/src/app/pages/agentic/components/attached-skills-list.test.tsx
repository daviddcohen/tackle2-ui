import * as React from "react";
import userEvent from "@testing-library/user-event";
import { Trans } from "react-i18next";
import { Link, MemoryRouter } from "react-router-dom";

import { Skill } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import {
  AttachedSkillsGroup,
  AttachedSkillsList,
  attachedSkillsFor,
} from "./attached-skills-list";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const linkTo = (pathname: string) => `${pathname}?from=app-3`;

const applicationGroup = (
  overrides: Partial<AttachedSkillsGroup> = {}
): AttachedSkillsGroup => ({
  key: "application-3",
  heading: "Application skills",
  headingText: "Application skills",
  description:
    "Agents also use these skills in every stage when they migrate this application.",
  skills: [
    {
      skill: { id: "8", name: "EJB to CDI conversion patterns" },
      loadPolicy: "skill",
    },
  ],
  emptyText: "No skills are attached to this application.",
  ...overrides,
});

const archetypeGroup = (
  overrides: Partial<AttachedSkillsGroup> = {}
): AttachedSkillsGroup => ({
  key: "archetype-1",
  heading: (
    <Trans
      i18nKey="agentic.attachedSkills.archetype"
      values={{ name: "Java EE Application" }}
      components={{ nameLink: <Link to="/archetypes?ar%3AactiveItem=1" /> }}
    />
  ),
  headingText: "Archetype skills: Java EE Application",
  skills: [
    {
      skill: { id: "3", name: "Jakarta EE namespace migration" },
      loadPolicy: "skill",
    },
    {
      skill: { id: "5", name: "Corporate coding standards" },
      loadPolicy: "rule",
    },
  ],
  emptyText: "No skills are attached to this archetype.",
  ...overrides,
});

const renderList = (
  groups: AttachedSkillsGroup[],
  props: { headingLevel?: "h2" | "h3"; intro?: React.ReactNode } = {}
) =>
  render(
    <MemoryRouter>
      <AttachedSkillsList groups={groups} linkTo={linkTo} {...props} />
    </MemoryRouter>
  );

describe("AttachedSkillsList", () => {
  it("renders one named section per owner, in the order given", () => {
    renderList([applicationGroup(), archetypeGroup()], {
      intro: "Each stage also gets the skills of its own agent.",
    });

    expect(
      screen.getByText("Each stage also gets the skills of its own agent.")
    ).toBeVisible();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual([
      "Application skills (1)",
      "Archetype skills: Java EE Application (2)",
    ]);
    const archetypeSection = screen.getByRole("region", {
      name: "Archetype skills: Java EE Application (2)",
    });
    // The owner name in the heading links to where its skills are edited.
    expect(
      within(archetypeSection).getByRole("link", {
        name: "Java EE Application",
      })
    ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=1");
    expect(
      screen.getByText(
        "Agents also use these skills in every stage when they migrate this application."
      )
    ).toBeVisible();
  });

  it("lists skill links by name, with the Always followed marker after rules", () => {
    renderList([archetypeGroup()]);

    const list = screen.getByRole("list", {
      name: "Archetype skills: Java EE Application (2)",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Corporate coding standardsAlways followed",
      "Jakarta EE namespace migration",
    ]);
    expect(
      within(items[0]).getByRole("link", {
        name: "Corporate coding standards",
      })
    ).toHaveAttribute("href", "/skills/5?from=app-3");
    expect(within(items[1]).queryByText("Always followed")).toBeNull();
  });

  it("gives each group heading an id the list and section are named by", () => {
    renderList([applicationGroup(), archetypeGroup()]);

    const heading = screen.getByRole("heading", {
      name: "Application skills (1)",
    });
    expect(heading).toHaveAttribute(
      "id",
      "attached-skills-application-3-heading"
    );
    expect(
      screen.getByRole("list", { name: "Application skills (1)" })
    ).toHaveAttribute(
      "aria-labelledby",
      "attached-skills-application-3-heading"
    );
    expect(
      document.getElementById("attached-skills-archetype-1-heading")
    ).not.toBeNull();
  });

  it("keeps an empty group with its heading, no count and one sentence", () => {
    renderList([
      archetypeGroup({
        skills: [],
        emptyText: "No skills are attached to this archetype.",
        emptyAction: { label: "Go to archetypes", to: "/archetypes" },
      }),
    ]);

    expect(
      screen.getByRole("heading", {
        name: "Archetype skills: Java EE Application",
      })
    ).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.getByText("No skills are attached to this archetype.")
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Go to archetypes" })
    ).toHaveAttribute("href", "/archetypes");
  });

  it("puts Manage skills only on the groups it edits, with its id and name", async () => {
    const onClick = jest.fn();
    renderList([
      applicationGroup({
        manage: {
          onClick,
          buttonId: "manage-skills-application-3",
          ariaLabel: "Manage skills for Claims Processing",
        },
      }),
      archetypeGroup(),
    ]);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    const manage = screen.getByRole("button", {
      name: "Manage skills for Claims Processing",
    });
    expect(manage).toHaveAttribute("id", "manage-skills-application-3");
    expect(manage).toHaveTextContent("Manage skills");
    expect(
      within(
        screen.getByRole("region", { name: "Application skills (1)" })
      ).getByRole("button")
    ).toBe(manage);
    await userEvent.click(manage);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is read-only without manage", () => {
    renderList([applicationGroup(), archetypeGroup()]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders headings at h3 under a drawer heading", () => {
    renderList([archetypeGroup()], { headingLevel: "h3" });
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Archetype skills: Java EE Application (2)",
      })
    ).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("says Unavailable for a group it could not read, and shows a skeleton while loading", () => {
    renderList([
      applicationGroup({ isUnavailable: true }),
      archetypeGroup({ key: "archetype-2", isLoading: true }),
    ]);

    // No count and no false "none" for either.
    expect(
      screen.getByRole("heading", { name: "Application skills" })
    ).toBeVisible();
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(
      screen.queryByText("No skills are attached to this application.")
    ).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Archetype skills: Java EE Application",
      })
    ).toBeVisible();
    expect(screen.getByText("Loading skills")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("attachedSkillsFor", () => {
  it("keeps the skills attached directly to the owner, rule or skill", () => {
    const skills = [
      {
        id: "1",
        name: "Rule",
        loadPolicy: "rule",
        associations: [
          { scope: "archetype", resource: { id: 1, name: "Java EE" } },
        ],
      },
      {
        id: "2",
        name: "Default",
        associations: [
          { scope: "archetype", resource: { id: 1, name: "Java EE" } },
          { scope: "application", resource: { id: 3, name: "CRM" } },
        ],
      },
      {
        id: "3",
        name: "Other archetype",
        associations: [
          { scope: "archetype", resource: { id: 2, name: "Node" } },
        ],
      },
      { id: "4", name: "Unknown", associations: undefined },
    ] as unknown as Skill[];

    expect(attachedSkillsFor(skills, "archetype", 1)).toEqual([
      { skill: { id: "1", name: "Rule" }, loadPolicy: "rule" },
      { skill: { id: "2", name: "Default" }, loadPolicy: "skill" },
    ]);
    expect(attachedSkillsFor(skills, "application", 3)).toEqual([
      { skill: { id: "2", name: "Default" }, loadPolicy: "skill" },
    ]);
    expect(attachedSkillsFor(skills, "targetProfile", 1)).toEqual([]);
  });
});
