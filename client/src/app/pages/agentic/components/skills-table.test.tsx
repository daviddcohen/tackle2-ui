import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { EffectiveSkillAssociation, PlanSkill, Skill } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import {
  SkillSources,
  SkillsTable,
  groupSkillSources,
  planSkillRows,
  skillAssociationSources,
  skillRowCounts,
} from "./skills-table";

const KNOWN_SCOPES = ["agent", "application", "archetype", "targetProfile"];

// Interpolate like i18next so the source lines read as users see them; a
// scope key this client does not define falls back to its defaultValue.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === "agentic.skillsTable.source" && values) {
        return `${values.scope}: ${values.name}`;
      }
      if (key === "agentic.skillsTable.useSkill" && values) {
        return `Use ${values.name}`;
      }
      const scope = key.match(/^agentic\.skillsTable\.scope\.(.+)$/)?.[1];
      if (scope != null && !KNOWN_SCOPES.includes(scope)) {
        return values?.defaultValue ?? key;
      }
      return key;
    },
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

  it("keeps excluded skills as rows, marked, in name order", () => {
    const rows = groupSkillSources(
      [association("2", "Build checks", "agent", "Builder")],
      [
        association("1", "API checklist", "agent", "Proposer"),
        association("1", "API checklist", "archetype", "Java EE"),
      ]
    );

    expect(rows).toEqual([
      {
        skill: { id: "1", name: "API checklist" },
        sources: [
          { scope: "agent", name: "Proposer" },
          { scope: "archetype", name: "Java EE" },
        ],
        excluded: true,
      },
      {
        skill: { id: "2", name: "Build checks" },
        sources: [{ scope: "agent", name: "Builder" }],
      },
    ]);
  });

  it("treats a skill the server reports as both used and excluded as used", () => {
    const rows = groupSkillSources(
      [association("1", "Skill", "agent", "Builder")],
      [association("1", "Skill", "archetype", "Java EE")]
    );
    expect(rows[0].excluded).toBeUndefined();
  });
});

describe("planSkillRows", () => {
  const planSkill = (
    id: string,
    name: string,
    excluded: boolean,
    sources: PlanSkill["sources"]
  ): PlanSkill => ({ skill: { id, name }, sources, excluded });

  it("makes one row per plan skill with the server's sources and flag", () => {
    const rows = planSkillRows([
      planSkill("9", "Runtime upgrade", false, [
        {
          scope: "targetProfile",
          scopeName: "Java 17",
          resource: { id: 31, name: "Java 17" },
        },
        {
          scope: "agent",
          scopeName: "Coder",
          resource: { id: "2", name: "Coder" },
        },
      ]),
      planSkill("1", "API checklist", true, [
        {
          scope: "agent",
          scopeName: "Coder via Foundation",
          resource: { id: "2", name: "Coder" },
          collection: { id: "1", name: "Foundation" },
        },
      ]),
    ]);

    expect(rows).toEqual([
      {
        skill: { id: "1", name: "API checklist" },
        sources: [{ scope: "agent", name: "Coder via Foundation" }],
        excluded: true,
      },
      {
        skill: { id: "9", name: "Runtime upgrade" },
        sources: [
          { scope: "agent", name: "Coder" },
          { scope: "targetProfile", name: "Java 17" },
        ],
      },
    ]);
  });
});

describe("skillRowCounts", () => {
  it("counts every row and the ones the plan does not exclude", () => {
    const row = (id: string, excluded?: boolean) => ({
      skill: { id, name: id },
      sources: [],
      ...(excluded != null ? { excluded } : {}),
    });
    expect(skillRowCounts([row("1"), row("2", true), row("3", false)])).toEqual(
      { used: 2, total: 3 }
    );
    expect(skillRowCounts(undefined)).toEqual({ used: 0, total: 0 });
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

describe("SkillsTable exclusions", () => {
  const rows = groupSkillSources(
    [association("2", "Build checks", "agent", "Builder")],
    [association("1", "API checklist", "agent", "Proposer")]
  );

  it("marks excluded rows when read-only", () => {
    render(
      <MemoryRouter>
        <SkillsTable rows={rows} linkTo={(pathname) => pathname} />
      </MemoryRouter>
    );
    const [, excluded, used] = screen.getAllByRole("row");
    expect(excluded).toHaveTextContent("agentic.skillsTable.excluded");
    expect(used).not.toHaveTextContent("agentic.skillsTable.excluded");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("adds a named checkbox per row in exclusion mode, without links or markers", async () => {
    const user = userEvent.setup();
    const onUsedChange = jest.fn();
    render(<SkillsTable rows={rows} onUsedChange={onUsedChange} />);

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toEqual([
      "agentic.skillsTable.used",
      "agentic.entity.skill",
      "terms.source",
    ]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByText("agentic.skillsTable.excluded")
    ).not.toBeInTheDocument();

    const excluded = screen.getByRole("checkbox", {
      name: "Use API checklist",
    });
    const used = screen.getByRole("checkbox", { name: "Use Build checks" });
    expect(excluded).not.toBeChecked();
    expect(used).toBeChecked();

    await user.click(excluded);
    expect(onUsedChange).toHaveBeenCalledWith(
      { id: "1", name: "API checklist" },
      true
    );
    await user.click(used);
    expect(onUsedChange).toHaveBeenCalledWith(
      { id: "2", name: "Build checks" },
      false
    );
  });
});

describe("SkillSources", () => {
  it("renders the Source cell's lines on its own, for other tables", () => {
    render(
      <SkillSources
        sources={[
          { scope: "archetype", name: "Java EE Application" },
          { scope: "application", name: "Customer Management" },
        ]}
      />
    );
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual([
      "agentic.skillsTable.scope.archetype: Java EE Application",
      "agentic.skillsTable.scope.application: Customer Management",
    ]);
    expect(screen.getByRole("list")).toHaveClass("pf-m-plain");
  });

  it("reads a scope this client does not know as the server sent it", () => {
    render(
      <SkillSources
        sources={[
          {
            scope: "migrationWave" as EffectiveSkillAssociation["scope"],
            name: "Wave 1",
          },
        ]}
      />
    );
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "migrationWave: Wave 1"
    );
  });
});
