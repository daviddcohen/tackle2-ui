import { renderHook } from "@testing-library/react";

import { useAgentSkillsSummary } from "./agent-skills-summary";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const refs = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${i}`, name: `n${i}` }));

describe("useAgentSkillsSummary", () => {
  const summary = (skills: number, collections?: number) =>
    renderHook(() => useAgentSkillsSummary()).result.current({
      skills: refs(skills),
      skillCollections: collections == null ? undefined : refs(collections),
    });

  it("joins only the non-zero parts", () => {
    expect(summary(4, 1)).toBe("4 skills, 1 collection");
    expect(summary(1, 2)).toBe("1 skill, 2 collections");
    expect(summary(2, 0)).toBe("2 skills");
    expect(summary(1)).toBe("1 skill");
    expect(summary(0, 1)).toBe("1 collection");
  });

  it("is undefined without skills and collections", () => {
    expect(summary(0, 0)).toBeUndefined();
    expect(summary(0)).toBeUndefined();
  });
});
