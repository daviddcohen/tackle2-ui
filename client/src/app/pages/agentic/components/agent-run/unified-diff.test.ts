import { unifiedDiff } from "./unified-diff";

describe("unifiedDiff", () => {
  it("keeps up to three context lines around one change", () => {
    const oldText = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
    const newText = ["a", "b", "c", "d", "E", "f", "g", "h", "i"].join("\n");
    expect(unifiedDiff({ path: "x.txt", oldText, newText })).toBe(
      [
        "--- a/x.txt",
        "+++ b/x.txt",
        "@@ -2,7 +2,7 @@",
        " b",
        " c",
        " d",
        "-e",
        "+E",
        " f",
        " g",
        " h",
      ].join("\n")
    );
  });

  it("shows a new file against /dev/null", () => {
    expect(unifiedDiff({ path: "new.txt", newText: "one\ntwo\n" })).toBe(
      [
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1,2 @@",
        "+one",
        "+two",
      ].join("\n")
    );
  });

  it("handles a pure insertion", () => {
    expect(
      unifiedDiff({ path: "f", oldText: "a\nc", newText: "a\nb\nc" })
    ).toBe(
      [
        "--- a/f",
        "+++ b/f",
        "@@ -1,2 +1,3 @@",
        " a",
        "+b",
        " c",
        "\\ No newline at end of file",
      ].join("\n")
    );
  });

  it("returns only the header when nothing changed", () => {
    expect(unifiedDiff({ path: "f", oldText: "a\n", newText: "a\n" })).toBe(
      "--- a/f\n+++ b/f"
    );
  });

  it("shows a change of the final newline alone", () => {
    expect(unifiedDiff({ path: "f", oldText: "a", newText: "a\n" })).toBe(
      [
        "--- a/f",
        "+++ b/f",
        "@@ -1,1 +1,1 @@",
        "-a",
        "\\ No newline at end of file",
        "+a",
      ].join("\n")
    );
  });
});
