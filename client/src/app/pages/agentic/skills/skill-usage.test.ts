import { TFunction } from "i18next";

import { Agent, Skill, SkillCollection } from "@app/agentic";
import { englishT } from "@app/test-config/english-i18n";

import {
  getCollectionDeleteBlockedReason,
  getSkillDeleteBlockedReason,
} from "./skill-usage";

const t = englishT as unknown as TFunction;

const skill = (associations?: number): Skill => ({
  id: "7",
  name: "API compatibility checklist",
  description: "",
  sourceType: "inline",
  associations:
    associations == null
      ? undefined
      : Array.from({ length: associations }, (_, i) => ({
          scope: "agent" as const,
          resource: { id: String(i), name: `Agent ${i}` },
        })),
});

const collection = (id: string, skillIds: string[]): SkillCollection => ({
  id,
  name: `Collection ${id}`,
  description: "",
  skills: skillIds.map((skillId) => ({ id: skillId, name: skillId })),
});

const agent = (id: string, collectionIds: string[]) =>
  ({
    id,
    name: `Agent ${id}`,
    skillCollections: collectionIds.map((c) => ({ id: c, name: c })),
  }) as unknown as Agent;

describe("getSkillDeleteBlockedReason", () => {
  it("names both counts when the skill is associated and in collections", () => {
    expect(
      getSkillDeleteBlockedReason(t, skill(6), [collection("1", ["7"])])
    ).toBe(
      "This skill has 6 associations and is in 1 skill collection. Remove them before deleting it."
    );
  });

  it("names only the count that blocks", () => {
    expect(getSkillDeleteBlockedReason(t, skill(1), [])).toBe(
      "This skill has 1 association. Remove that association before deleting it."
    );
    expect(
      getSkillDeleteBlockedReason(t, skill(0), [
        collection("1", ["7"]),
        collection("2", ["7"]),
      ])
    ).toBe(
      "This skill is in 2 skill collections. Remove it from them before deleting it."
    );
  });

  it("allows the delete of an unused skill", () => {
    expect(
      getSkillDeleteBlockedReason(t, skill(0), [collection("1", ["8"])])
    ).toBeUndefined();
  });

  it("blocks while usage is unknown (X6, S1)", () => {
    const unchecked = "Usage could not be checked. Try again later.";
    expect(getSkillDeleteBlockedReason(t, skill(), [])).toBe(unchecked);
    expect(getSkillDeleteBlockedReason(t, skill(0), undefined)).toBe(unchecked);
  });
});

describe("getCollectionDeleteBlockedReason", () => {
  it("counts the agents that use the collection", () => {
    expect(
      getCollectionDeleteBlockedReason(t, "1", [
        agent("1", ["1"]),
        agent("2", ["1", "2"]),
        agent("3", ["2"]),
      ])
    ).toBe("Used by 2 agents. Remove it from those agents before deleting it.");
    expect(getCollectionDeleteBlockedReason(t, "3", [agent("1", ["1"])])).toBe(
      undefined
    );
  });

  it("blocks while the agents are unknown (X6)", () => {
    expect(getCollectionDeleteBlockedReason(t, "1", undefined)).toBe(
      "Usage could not be checked. Try again later."
    );
  });
});
