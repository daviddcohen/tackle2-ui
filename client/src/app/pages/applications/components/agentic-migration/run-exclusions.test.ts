import { SkillsByStage, StageSkill } from "@app/agentic";

import {
  isPlanExcludedRow,
  planExcludedSkillIds,
  runExclusionsToSend,
  withRunExclusions,
} from "./run-exclusions";

const agent = { id: "a1", name: "Code Migrator" };
const application = { id: 13, name: "Branch Operations" };
const entry = (
  id: string,
  from: StageSkill["from"],
  excluded = false
): StageSkill => ({
  skill: { id, name: `Skill ${id}` },
  loadPolicy: "skill",
  from,
  excluded,
});

/** Skill 2 is the plan's exclusion; it also reaches the application itself. */
const skills: SkillsByStage = {
  stages: [
    {
      order: 1,
      name: "Migrate",
      agent,
      skills: [
        entry("1", [{ kind: "agent", agent }]),
        entry("2", [{ kind: "agent", agent }], true),
        entry("3", [{ kind: "agent", agent }], true),
      ],
    },
  ],
  everyStage: [
    {
      application,
      skills: [
        entry("2", [{ kind: "application", application }]),
        entry("4", [{ kind: "application", application }]),
      ],
    },
  ],
};

describe("run exclusions", () => {
  it("reads the plan's exclusions, and locks their rows except the application's own", () => {
    const planExcluded = planExcludedSkillIds(skills);
    expect(planExcluded).toEqual(new Set(["2", "3"]));
    const isLocked = isPlanExcludedRow(planExcluded);
    expect(isLocked(skills.stages[0].skills[1])).toBe(true);
    expect(isLocked(skills.everyStage[0].skills[0])).toBe(false);
    expect(isLocked(skills.stages[0].skills[0])).toBe(false);
  });

  it("marks every row of an excluded skill, in every group, keeping the plan's", () => {
    const marked = withRunExclusions(skills, ["2", "4"]);
    const excluded = [
      ...marked.stages[0].skills,
      ...marked.everyStage[0].skills,
    ].map(({ skill, excluded }) => [skill.id, excluded]);
    expect(excluded).toEqual([
      ["1", false],
      ["2", true],
      ["3", true],
      ["2", true],
      ["4", true],
    ]);
    // The resolution itself is left as it was.
    expect(skills.everyStage[0].skills[0].excluded).toBe(false);
  });

  it("sends only the exclusions a changeable row still has", () => {
    // 3 is the plan's everywhere, "gone" no longer resolves.
    expect(runExclusionsToSend(skills, ["4", "3", "gone", "2", "1"])).toEqual([
      "4",
      "2",
      "1",
    ]);
    // Without a resolution, as kept: the server ignores what it does not list.
    expect(runExclusionsToSend(undefined, ["gone"])).toEqual(["gone"]);
  });
});
