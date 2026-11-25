import { DiffLine, diffLineText, diffLines } from "./diff-lines";

const text = (lines: DiffLine[]) => lines.map(diffLineText);

describe("diffLines", () => {
  it("keeps up to three unchanged lines around one change", () => {
    const oldText = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
    const newText = ["a", "b", "c", "d", "E", "f", "g", "h", "i"].join("\n");
    expect(text(diffLines({ path: "x.txt", oldText, newText }))).toEqual([
      " b",
      " c",
      " d",
      "-e",
      "+E",
      " f",
      " g",
      " h",
    ]);
  });

  it("shows an edit in two places as two changes, with the lines between left out", () => {
    const oldText = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";
    const newText = "one\n2\n3\n4\n5\n6\n7\n8\n9\nten\n";
    expect(text(diffLines({ path: "f", oldText, newText }))).toEqual([
      "-1",
      "+one",
      " 2",
      " 3",
      " 4",
      "...",
      " 7",
      " 8",
      " 9",
      "-10",
      "+ten",
    ]);
  });

  it("keeps the lines an insertion moves", () => {
    expect(
      text(diffLines({ path: "f", oldText: "a\nb\nc", newText: "a\nx\nb\nc" }))
    ).toEqual([" a", "+x", " b", " c"]);
  });

  it("shows every line of a new file as added", () => {
    expect(text(diffLines({ path: "new.txt", newText: "one\ntwo\n" }))).toEqual(
      ["+one", "+two"]
    );
  });

  it("has no lines when nothing changed but the final newline", () => {
    expect(diffLines({ path: "f", oldText: "a", newText: "a\n" })).toEqual([]);
  });
});
