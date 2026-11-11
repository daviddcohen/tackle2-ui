import { MemoryRouter } from "react-router-dom";

import { EffectiveSkillAssociation, Skill } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import {
  SkillsTable,
  groupSkillSources,
  skillAssociationSources,
} from "./skills-table";

// Interpolate like i18next so the source lines read as users see them.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key === "agentic.skillsTable.source" && values
        ? `${values.scope}: ${values.name}`
        : key,
  }),
}));

const association = (
  skillId: string,
  skillName: string,
  scope: EffectiveSkillAssociation["scope"],
  scopeName: string
): EffectiveSkillAssociation => ({
  skill: { id: skillId, name: skillName },
  scope,
  scopeName,
});

describe("groupSkillSources", () => {
  it("makes one row per skill, sorted by name, with every distinct source", () => {
    const rows = groupSkillSources([
      association(
        "3",
        "Jakarta EE namespace migration",
        "archetype",
        "Java EE"
      ),
      association("2", "EJB to CDI conversion patterns", "agent", "Coder"),
      association(
        "3",
        "Jakarta EE namespace migration",
        "targetProfile",
        "Quarkus 3.x"
      ),
      association(
        "3",
        "Jakarta EE namespace migration",
        "agent",
        "Coder via Java foundation"
      ),
      // An exact repeat is the same source, not a second line.
      association("2", "EJB to CDI conversion patterns", "agent", "Coder"),
      association("2", "EJB to CDI conversion patterns", "application", "CRM"),
    ]);

    expect(rows).toEqual([
      {
        skill: { id: "2", name: "EJB to CDI conversion patterns" },
        sources: [
          { scope: "agent", name: "Coder" },
          { scope: "application", name: "CRM" },
        ],
      },
      {
        skill: { id: "3", name: "Jakarta EE namespace migration" },
        sources: [
          { scope: "agent", name: "Coder via Java foundation" },
          { scope: "archetype", name: "Java EE" },
          { scope: "targetProfile", name: "Quarkus 3.x" },
        ],
      },
    ]);
  });

  it("keeps the server order of sources within one scope", () => {
    const rows = groupSkillSources([
      association("1", "Skill", "agent", "Migrator via Foundation"),
      association("1", "Skill", "agent", "Migrator"),
      association("1", "Skill", "agent", "Builder"),
      association("1", "Skill", "agent", "Proposer via Foundation"),
    ]);

    expect(rows[0].sources.map((source) => source.name)).toEqual([
      "Migrator via Foundation",
      "Migrator",
      "Builder",
      "Proposer via Foundation",
    ]);
  });

  it("returns no rows for no associations", () => {
    expect(groupSkillSources([])).toEqual([]);
  });
});

describe("skillAssociationSources", () => {
  const skill = (id: string, associations: Skill["associations"]): Skill => ({
    id,
    name: `Skill ${id}`,
    description: "",
    sourceType: "inline",
    associations,
  });

  it("keeps the matching associations with the resource name as source", () => {
    const skills = [
      skill("1", [
        { scope: "archetype", resource: { id: 1, name: "Java EE" } },
        { scope: "archetype", resource: { id: 2, name: "Node.js" } },
        { scope: "agent", resource: { id: "4", name: "Coder" } },
      ]),
      skill("2", undefined),
      skill("3", [
        { scope: "targetProfile", resource: { id: 11, name: "Quarkus 3.x" } },
      ]),
    ];

    expect(
      skillAssociationSources(
        skills,
        (a) =>
          (a.scope === "archetype" && a.resource.id === 1) ||
          a.scope === "targetProfile"
      )
    ).toEqual([
      {
        skill: { id: "1", name: "Skill 1" },
        scope: "archetype",
        scopeName: "Java EE",
      },
      {
        skill: { id: "3", name: "Skill 3" },
        scope: "targetProfile",
        scopeName: "Quarkus 3.x",
      },
    ]);
  });
});

describe("SkillsTable", () => {
  it("renders Skill links and one plain-text line per source", () => {
    const linkTo = jest.fn((pathname: string) => `${pathname}?from=run-1`);
    render(
      <MemoryRouter>
        <SkillsTable
          linkTo={linkTo}
          rows={groupSkillSources([
            association("2", "EJB to CDI", "agent", "Code Migrator"),
            association("2", "EJB to CDI", "archetype", "Java EE Application"),
            association("4", "Quarkus best practices", "targetProfile", "Q3"),
          ])}
        />
      </MemoryRouter>
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toEqual(["agentic.entity.skill", "terms.source"]);

    const [, first, second] = screen.getAllByRole("row");
    expect(
      within(first).getByRole("link", { name: "EJB to CDI" })
    ).toHaveAttribute("href", "/skills/2?from=run-1");
    expect(
      within(first)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "agentic.skillsTable.scope.agent: Code Migrator",
      "agentic.skillsTable.scope.archetype: Java EE Application",
    ]);
    // Sources are text, never links or labels.
    expect(within(first).getAllByRole("link")).toHaveLength(1);
    expect(within(second).getByRole("listitem")).toHaveTextContent(
      "agentic.skillsTable.scope.targetProfile: Q3"
    );
    expect(linkTo).toHaveBeenCalledWith("/skills/4");
  });
});
