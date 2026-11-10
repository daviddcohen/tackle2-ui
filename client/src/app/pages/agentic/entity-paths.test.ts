import { SkillAssociation } from "@app/agentic";
import { Archetype } from "@app/api/models";

import {
  archetypePath,
  skillAssociationPath,
  targetProfilePath,
} from "./entity-paths";

const archetypes = [
  { id: 1, name: "Java EE Application", profiles: [{ id: 11, name: "Q" }] },
  { id: 2, name: "Node.js Service", profiles: [{ id: 21, name: "N" }] },
  { id: 3, name: "No profiles" },
] as Archetype[];

const association = (
  scope: SkillAssociation["scope"],
  id: number | string
): SkillAssociation =>
  ({ scope, resource: { id, name: "Resource" } }) as SkillAssociation;

describe("entity paths", () => {
  it("opens an archetype as the selected drawer item of the archetypes table", () => {
    expect(archetypePath(4)).toBe("/archetypes?ar%3AactiveItem=4");
  });

  it("anchors a target profile on its owner's target profiles page", () => {
    expect(targetProfilePath(1, 11)).toBe(
      "/archetypes/1/target-profiles#target-profile-11"
    );
  });

  it.each([
    [association("agent", "7"), "/agents/7"],
    [association("application", 5), "/applications/5"],
    [association("archetype", 2), "/archetypes?ar%3AactiveItem=2"],
    [
      association("targetProfile", 21),
      "/archetypes/2/target-profiles#target-profile-21",
    ],
  ])("links a %j association to %s", (value, expected) => {
    expect(skillAssociationPath(value, archetypes)).toBe(expected);
  });

  it("has no link for a target profile whose owning archetype is unknown", () => {
    expect(
      skillAssociationPath(association("targetProfile", 99), archetypes)
    ).toBeUndefined();
    expect(
      skillAssociationPath(association("targetProfile", 11), [])
    ).toBeUndefined();
  });
});
