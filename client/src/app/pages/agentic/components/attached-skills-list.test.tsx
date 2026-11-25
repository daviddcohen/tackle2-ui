import { Skill } from "@app/agentic";

import { attachedSkillsFor } from "./attached-skills-list";

describe("attachedSkillsFor", () => {
  it("keeps the skills attached directly to the owner", () => {
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
      { skill: { id: "2", name: "Default" }, loadPolicy: undefined },
    ]);
    expect(attachedSkillsFor(skills, "application", 3)).toEqual([
      { skill: { id: "2", name: "Default" }, loadPolicy: undefined },
    ]);
    expect(attachedSkillsFor(skills, "targetProfile", 1)).toEqual([]);
  });
});
