import { TFunction } from "i18next";

import { Agent, Skill, SkillCollection } from "@app/agentic";
import { englishT } from "@app/test-config/english-i18n";

import {
  getCollectionDeleteBlockedReason,
  getSkillAttachmentParts,
  getSkillDeleteBlockedReason,
  getSkillUsageParts,
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

const archetype = {
  scope: "archetype" as const,
  resource: { id: 1, name: "Java EE Application" },
};
const application = {
  scope: "application" as const,
  resource: { id: 3, name: "Customer Management" },
};

describe("getSkillUsageParts", () => {
  it("counts each type in origin order, collections after agents", () => {
    expect(
      getSkillUsageParts(
        t,
        {
          associations: [
            application,
            ...skill(2).associations!,
            archetype,
            { ...application, resource: { id: 4, name: "Billing" } },
          ],
        },
        1
      )
    ).toEqual(["2 agents", "1 collection", "1 archetype", "2 applications"]);
  });

  it("leaves out zero types, and collections that are not loaded", () => {
    expect(getSkillUsageParts(t, skill(0), 0)).toEqual([]);
    expect(
      getSkillUsageParts(t, { associations: [archetype] }, undefined)
    ).toEqual(["1 archetype"]);
  });

  it("is unknown when the attachments are unknown", () => {
    expect(getSkillUsageParts(t, skill(), 2)).toBeUndefined();
  });

  it("names attachments without collections", () => {
    expect(
      getSkillAttachmentParts(t, [archetype, ...skill(1).associations!])
    ).toEqual(["1 agent", "1 archetype"]);
  });
});

describe("getSkillDeleteBlockedReason", () => {
  it("names what it is attached to and its collections", () => {
    expect(
      getSkillDeleteBlockedReason(t, skill(6), [collection("1", ["7"])])
    ).toBe(
      "This skill is attached to 6 agents, and is in 1 skill collection. Remove it from them before deleting it."
    );
    expect(
      getSkillDeleteBlockedReason(
        t,
        { ...skill(1), associations: [...skill(1).associations!, archetype] },
        []
      )
    ).toBe(
      "This skill is attached to 1 agent and 1 archetype. Remove it from them before deleting it."
    );
  });

  it("names only the count that blocks", () => {
    expect(getSkillDeleteBlockedReason(t, skill(1), [])).toBe(
      "This skill is attached to 1 agent. Remove it from that agent before deleting it."
    );
    expect(
      getSkillDeleteBlockedReason(
        t,
        { ...skill(0), associations: [application] },
        []
      )
    ).toBe(
      "This skill is attached to 1 application. Remove it from that application before deleting it."
    );
    // Counts things, not types: two agents are "them".
    expect(getSkillDeleteBlockedReason(t, skill(2), [])).toBe(
      "This skill is attached to 2 agents. Remove it from them before deleting it."
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

  it("blocks while usage is unknown", () => {
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

  it("blocks while the agents are unknown", () => {
    expect(getCollectionDeleteBlockedReason(t, "1", undefined)).toBe(
      "Usage could not be checked. Try again later."
    );
  });
});
