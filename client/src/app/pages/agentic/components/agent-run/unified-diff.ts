import { TranscriptDiff } from "@app/agentic";

/** Context lines kept around a change, as `diff -u` does. */
const CONTEXT_LINES = 3;

/** What `diff -u` prints after a last line that has no newline. */
const NO_NEWLINE = "\\ No newline at end of file";

/** A line, and whether it is a last line without a newline. */
interface Line {
  text: string;
  noNewline: boolean;
}

const splitLines = (text: string | undefined): Line[] => {
  if (text == null || text === "") return [];
  const lines = text.split("\n");
  // A trailing newline ends the last line; it does not start a new one.
  const endsWithNewline = lines[lines.length - 1] === "";
  if (endsWithNewline) lines.pop();
  return lines.map((line, index) => ({
    text: line,
    noNewline: !endsWithNewline && index === lines.length - 1,
  }));
};

const same = (a: Line, b: Line) =>
  a.text === b.text && a.noNewline === b.noNewline;

/**
 * A file change as unified diff text (`--- a/path`, `+++ b/path`, one hunk),
 * the form developers read in Git. Lines the old and new text share at the
 * start and the end are context; everything between them is one change. No
 * `oldText` means a new file (`--- /dev/null`). A last line without a
 * newline is followed by "\ No newline at end of file", so a change of the
 * final newline alone shows too.
 */
export const unifiedDiff = ({ path, oldText, newText }: TranscriptDiff) => {
  const before = splitLines(oldText);
  const after = splitLines(newText);
  const header = [
    oldText == null ? "--- /dev/null" : `--- a/${path}`,
    `+++ b/${path}`,
  ];

  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    same(before[prefix], after[prefix])
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    same(before[before.length - 1 - suffix], after[after.length - 1 - suffix])
  ) {
    suffix++;
  }
  const removedEnd = before.length - suffix;
  const addedEnd = after.length - suffix;
  if (prefix === removedEnd && prefix === addedEnd) return header.join("\n");

  const start = Math.max(0, prefix - CONTEXT_LINES);
  const trailing = Math.min(suffix, CONTEXT_LINES);
  const oldCount = removedEnd - start + trailing;
  const newCount = addedEnd - start + trailing;
  // A side with no lines names the line before the hunk (`-0,0`).
  const range = (count: number) =>
    `${count === 0 ? start : start + 1},${count}`;
  const print = (mark: string) => (line: Line) =>
    line.noNewline
      ? [`${mark}${line.text}`, NO_NEWLINE]
      : [`${mark}${line.text}`];
  return [
    ...header,
    `@@ -${range(oldCount)} +${range(newCount)} @@`,
    ...before.slice(start, prefix).flatMap(print(" ")),
    ...before.slice(prefix, removedEnd).flatMap(print("-")),
    ...after.slice(prefix, addedEnd).flatMap(print("+")),
    ...before.slice(removedEnd, removedEnd + trailing).flatMap(print(" ")),
  ].join("\n");
};
