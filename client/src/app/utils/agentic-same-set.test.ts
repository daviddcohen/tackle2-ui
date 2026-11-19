import { isSameSet } from "./agentic";

describe("isSameSet", () => {
  it("ignores order", () => {
    expect(isSameSet(["1", "2"], ["2", "1"])).toBe(true);
    expect(isSameSet([], [])).toBe(true);
  });

  it("tells sets with other or extra ids apart", () => {
    expect(isSameSet(["1", "2"], ["1", "3"])).toBe(false);
    expect(isSameSet(["1"], ["1", "2"])).toBe(false);
  });

  it("compares the ids, not the list lengths, when ids repeat", () => {
    expect(isSameSet(["1", "1"], ["1", "2"])).toBe(false);
    expect(isSameSet(["1", "2"], ["1", "1"])).toBe(false);
    expect(isSameSet(["1", "1", "2"], ["2", "1"])).toBe(true);
  });
});
